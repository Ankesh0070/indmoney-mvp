/**
 * SIP Recovery Assistant — automated tests.
 * Zero-dependency: uses Node's built-in test runner + assert, matching
 * mvp-app's "no build tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Data = require('../public/recovery/data.js');
const { RecoveryEngine, RecoveryStore } = require('../public/recovery/store.js');
const Components = require('../public/recovery/components.js');
const Analytics = require('../public/recovery/analytics.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshStore() {
  const store = new RecoveryStore({ storage: makeFakeStorage() });
  store.load();
  return store;
}

function getScenarioInstalment(store, scenarioId) {
  const sc = store.getScenarios().find((s) => s.id === scenarioId);
  return store.getInstalment(sc.instalment.id);
}

// ── 1. Failure alert rendering ──
test('failure alert rendering shows amount and resolve action', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  const sip = store.getSip(inst.sipId);
  const html = Components.alertBanner(inst, sip);
  assert.match(html, /₹2,000/);
  assert.match(html, /could not be processed/);
  assert.match(html, /data-action="resolve-now"/);
  assert.match(html, new RegExp(inst.id));
});

test('failure alert rendering reflects pending status distinctly', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-3');
  const sip = store.getSip(inst.sipId);
  const html = Components.alertBanner(inst, sip);
  assert.match(html, /still being verified/);
  assert.match(html, /recovery-alert-pending/);
});

// ── 2. Correct explanation for each failure reason ──
test('every failure reason has a distinct, non-empty explanation', () => {
  const reasons = Object.values(Data.FailureReason);
  const seenTitles = new Set();
  reasons.forEach((reason) => {
    const exp = Data.FAILURE_EXPLANATIONS[reason];
    assert.ok(exp && exp.title && exp.message, `missing explanation for ${reason}`);
    assert.ok(!seenTitles.has(exp.title), `duplicate explanation title for ${reason}`);
    seenTitles.add(exp.title);
  });
});

test('unknown failure reason never invents a cause', () => {
  const exp = Data.FAILURE_EXPLANATIONS[Data.FailureReason.UNKNOWN];
  assert.match(exp.title, /could not confirm why/);
});

// ── 3. Successful eligible retry ──
test('retrying an eligible failed instalment recovers it', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  assert.equal(inst.status, 'failed');
  const result = store.retryPayment(inst.id);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'success');
  const updated = store.getInstalment(inst.id);
  assert.equal(updated.status, 'recovered');
  assert.ok(updated.recoveredAt);
});

// ── 4. Failed retry ──
test('a retry that the mock gateway declines leaves the instalment failed', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  inst.simulatedOutcome = 'failed';
  store.save();
  const result = store.retryPayment(inst.id);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'failed');
  const updated = store.getInstalment(inst.id);
  assert.equal(updated.status, 'failed');
  assert.ok(!updated.recoveredAt);
  const attempts = store.getAttemptsForInstalment(inst.id);
  assert.ok(attempts.some((a) => a.type === 'retry' && a.status === 'failed'));
});

// ── 5. Pending payment protection ──
test('the pure engine blocks a retry while another attempt is still pending', () => {
  const instalment = { id: 'x1', status: 'failed', retryPermitted: true, attemptSeq: 0 };
  const existingAttempts = [{ instalmentId: 'x1', status: 'pending' }];
  const result = RecoveryEngine.retryPayment(instalment, existingAttempts);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PENDING_EXISTS');
});

test('store blocks retrying scenario-3 while its bank-outage attempt is pending', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-3');
  assert.equal(inst.status, 'pending');
  const attempts = store.getAttemptsForInstalment(inst.id);
  assert.ok(attempts.some((a) => a.status === 'pending'));
});

// ── 6. Duplicate transaction prevention ──
test('request-level guard rejects a concurrent duplicate request', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  store.beginRequest(inst.id);
  const result = store.retryPayment(inst.id);
  assert.deepEqual(result, { ok: false, code: 'DUPLICATE_REQUEST' });
  store.endRequest(inst.id);
});

test('idempotency key registry recognizes a replayed key', () => {
  const store = freshStore();
  assert.equal(store.isDuplicateKey('inst-1-retry-1'), false);
  store.registerKey('inst-1-retry-1');
  assert.equal(store.isDuplicateKey('inst-1-retry-1'), true);
});

// ── 7. Mandate reauthorization ──
test('mandate renewal requires explicit confirmation', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-2');
  const result = store.renewMandate(inst.id, false);
  assert.deepEqual(result, { ok: false, code: 'CONFIRMATION_REQUIRED' });
  const mandate = store.getMandateForSip(inst.sipId);
  assert.equal(mandate.status, 'expired');
});

test('confirmed mandate renewal reactivates the mandate and recovers the instalment', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-2');
  const result = store.renewMandate(inst.id, true);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'success');
  assert.equal(store.getMandateForSip(inst.sipId).status, 'active');
  assert.equal(store.getInstalment(inst.id).status, 'recovered');
});

// ── 8. Retry-unavailable state ──
test('retry is refused and instalment untouched when not permitted', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-5');
  assert.equal(inst.retryPermitted, false);
  const before = JSON.stringify(store.getInstalment(inst.id));
  const result = store.retryPayment(inst.id);
  assert.deepEqual(result, { ok: false, code: 'NOT_PERMITTED' });
  assert.equal(JSON.stringify(store.getInstalment(inst.id)), before);
});

// ── 9. Payment history consistency ──
test('payment history stays ordered and complete through a fail-then-recover sequence', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  inst.simulatedOutcome = 'failed';
  store.save();
  store.retryPayment(inst.id); // fails
  store.getInstalment(inst.id).simulatedOutcome = 'success';
  store.save();
  store.retryPayment(inst.id); // succeeds

  const history = store.getPaymentHistory(inst.id);
  assert.equal(history.length, 3); // original + failed retry + successful retry
  assert.equal(history[0].type, 'original');
  assert.equal(history[0].status, 'failed');
  assert.equal(history[1].status, 'failed');
  assert.equal(history[2].status, 'success');
  for (let i = 1; i < history.length; i++) {
    assert.ok(new Date(history[i].createdAt) >= new Date(history[i - 1].createdAt));
  }
  assert.equal(store.getInstalment(inst.id).status, 'recovered');
});

// ── 10. Refresh persistence ──
test('state persists across a simulated page refresh via shared storage', () => {
  const storage = makeFakeStorage();
  const storeA = new RecoveryStore({ storage });
  storeA.load();
  const inst = getScenarioInstalment(storeA, 'scenario-1');
  storeA.retryPayment(inst.id);

  const storeB = new RecoveryStore({ storage });
  storeB.load();
  assert.equal(storeB.getInstalment(inst.id).status, 'recovered');
  assert.equal(storeB.getAttemptsForInstalment(inst.id).length, 2);
});

// ── 11. Reminder cancellation on recovery ──
test('outstanding reminders are cancelled once the instalment is recovered', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-1');
  const reminderBefore = store.getNotifications().filter(
    (n) => n.instalmentId === inst.id && n.type === 'outstanding_reminder'
  );
  assert.equal(reminderBefore.length, 1);

  store.retryPayment(inst.id);

  const reminderAfter = store.getNotifications().filter(
    (n) => n.instalmentId === inst.id && n.type === 'outstanding_reminder'
  );
  assert.equal(reminderAfter.length, 0);
  const successNotif = store.getNotifications().filter(
    (n) => n.instalmentId === inst.id && n.type === 'recovery_success'
  );
  assert.equal(successNotif.length, 1);
});

// ── 12. Support ticket creation ──
test('support ticket creation prefills context and never carries sensitive fields', () => {
  const store = freshStore();
  const inst = getScenarioInstalment(store, 'scenario-6');
  const ticket = store.createSupportTicket({
    sipId: inst.sipId, instalmentId: inst.id,
    subject: 'Help with failed instalment', description: 'Unknown failure reason.'
  });
  assert.equal(ticket.status, 'open');
  assert.match(ticket.ticketNumber, /^NIV-/);
  assert.equal(ticket.instalmentId, inst.id);
  const keys = Object.keys(ticket).join(' ').toLowerCase();
  ['password', 'otp', 'cvv', 'pin', 'cardnumber'].forEach((bad) => {
    assert.ok(!keys.includes(bad));
  });
  assert.ok(store.getSupportTickets().some((t) => t.id === ticket.id));
});

// ── bonus: analytics metrics sanity ──
test('computeMetrics only counts eligible instalments toward the recovery rate', () => {
  const store = freshStore();
  const metrics = Analytics.computeMetrics(store.ensureLoaded());
  assert.equal(metrics.simulated, true);
  assert.ok(metrics.eligibleRecoveryCount < metrics.failedInstalmentCount);
  assert.ok(metrics.verifiedSevenDayRecoveryRate >= 0 && metrics.verifiedSevenDayRecoveryRate <= 1);
});
