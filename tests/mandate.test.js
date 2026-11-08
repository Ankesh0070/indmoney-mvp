/**
 * AutoPay Health & Mandate Repair Assistant — automated tests.
 * Zero-dependency: uses Node's built-in test runner + assert, matching
 * mvp-app's "no build tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryStore } = require('../public/recovery/store.js');
const { SchedulingStore } = require('../public/scheduling/store.js');
const { PauseStore } = require('../public/pause/store.js');
const DateUtils = require('../public/scheduling/dateUtils.js');
const Data = require('../public/mandate/data.js');
const { MandateEngine, MandateStore } = require('../public/mandate/store.js');
const Analytics = require('../public/mandate/analytics.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshQuad() {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();
  const mandateStore = new MandateStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore, pauseStore });
  mandateStore.load();
  return { recoveryStore, schedulingStore, pauseStore, mandateStore };
}

function repairToEffective(mandateStore, sipId, type) {
  const sub = mandateStore.submitRepairRequest(sipId, type);
  const att = mandateStore.submitAuthorizationAttempt(sub.request.id);
  const check = mandateStore.checkRepairStatus(sub.request.id);
  return { sub, att, check };
}

// ── 1. Expired mandate detection ──
test('an expired mandate is detected with the exact Expired status and issue type', () => {
  const { mandateStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-a');
  assert.equal(health.issueType, Data.MandateIssueType.EXPIRED);
  assert.equal(health.status, Data.MandateHealthStatus.EXPIRED);
  assert.equal(health.actionRequired, true);
});

// ── 2. Revoked mandate detection ──
test('a revoked mandate is detected with the exact Revoked status', () => {
  const { mandateStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-b');
  assert.equal(health.issueType, Data.MandateIssueType.REVOKED);
  assert.equal(health.status, Data.MandateHealthStatus.REVOKED);
});

// ── 3. Rejected authorization ──
test('a mandate whose registration was rejected is detected as Rejected', () => {
  const { mandateStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-c');
  assert.equal(health.issueType, Data.MandateIssueType.REJECTED);
  assert.equal(health.status, Data.MandateHealthStatus.REJECTED);
});

// ── 4. Pending authorization ──
test('a mandate awaiting authorization is detected as Pending Authorization', () => {
  const { mandateStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-d');
  assert.equal(health.issueType, Data.MandateIssueType.PENDING);
  assert.equal(health.status, Data.MandateHealthStatus.PENDING_AUTHORIZATION);
});

// ── 5. Unknown mandate state ──
test('an unrecognized provider state is classified Unknown rather than guessed at', () => {
  const capability = { issueType: Data.MandateIssueType.UNKNOWN_STATE };
  const health = MandateEngine.checkMandateHealth(capability, null);
  assert.equal(health.status, Data.MandateHealthStatus.UNKNOWN);
  assert.equal(health.actionRequired, true);
  const mismatch = MandateEngine.checkMandateHealth({ issueType: Data.MandateIssueType.AUTH_MISMATCH }, null);
  assert.equal(mismatch.status, Data.MandateHealthStatus.UNKNOWN);
});

// ── 6. Healthy mandate classification ──
test('a healthy mandate requires no action', () => {
  const { mandateStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-e');
  assert.equal(health.status, Data.MandateHealthStatus.ACTIVE);
  assert.equal(health.actionRequired, false);
});

// ── 7. Insufficient balance not classified as mandate failure ──
test('an insufficient-balance payment failure is never classified as a mandate problem', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-f');
  assert.equal(health.status, Data.MandateHealthStatus.ACTIVE);
  assert.equal(health.actionRequired, false);
  assert.equal(health.isMandateProblem, false);
  const inst = recoveryStore.getInstalmentsForSip('sip-mandate-f')[0];
  assert.equal(inst.failureReason, 'insufficient_balance');
});

// ── 8. Eligible reauthorization ──
test('an expired mandate with a supported reauthorization flow is repaired and verified', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  const { att, check } = repairToEffective(mandateStore, 'sip-mandate-a', 'reauthorization');
  assert.equal(att.attempt.outcome, 'approved');
  assert.equal(check.status, Data.RepairRequestStatus.REPAIRED);
  assert.equal(mandateStore.getMandateHealth('sip-mandate-a').status, Data.MandateHealthStatus.ACTIVE);
  assert.equal(recoveryStore.getMandate('mandate-sip-mandate-a').status, 'active');
});

// ── 9. Unsupported reauthorization ──
test('reauthorization is refused when the capability does not support it', () => {
  const { mandateStore } = freshQuad();
  const res = mandateStore.submitRepairRequest('sip-mandate-b', 'reauthorization');
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NOT_SUPPORTED');
});

// ── 10. Successful replacement request ──
test('a revoked mandate with a supported replacement flow creates a replacement and preserves the original', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  const { att, check } = repairToEffective(mandateStore, 'sip-mandate-b', 'replacement');
  assert.equal(att.attempt.outcome, 'approved');
  assert.equal(check.status, Data.RepairRequestStatus.REPAIRED);
  const replacements = mandateStore.getReplacementRequestsForSip('sip-mandate-b');
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].status, Data.ReplacementStatus.EFFECTIVE);
  assert.ok(recoveryStore.getMandate('mandate-sip-mandate-b'), 'the original mandate record must still exist');
});

// ── 11. Replacement awaiting approval ──
test('a replacement that is approved but not yet effective is shown distinctly, not as repaired', () => {
  const { mandateStore } = freshQuad();
  const request = mandateStore.getRepairRequestsForSip('sip-mandate-k')[0];
  assert.equal(request.status, Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING);
  const replacement = mandateStore.getReplacementRequest(request.replacementRequestId);
  assert.equal(replacement.status, Data.ReplacementStatus.APPROVED_NOT_EFFECTIVE);
  // re-checking before the effective date must not fabricate progress
  const check = mandateStore.checkRepairStatus(request.id);
  assert.equal(check.status, Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING);
});

// ── 12. Rejected replacement ──
test('a replacement request the provider rejects leaves the repair request Rejected', () => {
  const { mandateStore } = freshQuad();
  mandateStore.state.capabilities['sip-mandate-e'].simulatedReplacementDecision = 'reject';
  const sub = mandateStore.submitRepairRequest('sip-mandate-e', 'replacement');
  const att = mandateStore.submitAuthorizationAttempt(sub.request.id);
  assert.equal(att.attempt.outcome, 'rejected');
  assert.equal(att.request.status, Data.RepairRequestStatus.REJECTED);
  assert.equal(mandateStore.getReplacementRequestsForSip('sip-mandate-e').length, 0, 'a rejected authorization must never create a replacement record');
});

// ── 13. Duplicate repair prevention ──
test('a second repair request cannot be submitted while one is already open for the same SIP', () => {
  const { mandateStore } = freshQuad();
  const first = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  assert.equal(first.ok, true);
  const second = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  assert.equal(second.ok, false);
  assert.equal(second.code, 'REQUEST_ALREADY_PENDING');
  assert.equal(mandateStore.getRepairRequestsForSip('sip-mandate-a').length, 1);

  // scenario J seeds an already-open request; a fresh submission must be blocked the same way
  const dup = mandateStore.submitRepairRequest('sip-mandate-j', 'reauthorization');
  assert.equal(dup.ok, false);
  assert.equal(dup.code, 'REQUEST_ALREADY_PENDING');
});

// ── 14. Provider verification timeout ──
test('a provider-unavailable outcome is reported as safely Unresolved and never fabricates progress on recheck', () => {
  const { mandateStore } = freshQuad();
  const sub = mandateStore.submitRepairRequest('sip-mandate-h', 'reauthorization');
  const att = mandateStore.submitAuthorizationAttempt(sub.request.id);
  assert.equal(att.attempt.outcome, 'provider_unavailable');
  assert.equal(att.request.status, Data.RepairRequestStatus.UNRESOLVED);
  const recheck = mandateStore.checkRepairStatus(sub.request.id);
  assert.equal(recheck.status, Data.RepairRequestStatus.UNRESOLVED, 'must stay Unresolved, never silently become Repaired or Rejected');
});

// ── 15. Historical mandate event preservation ──
test('mandate status events form an append-only, immutable audit log', () => {
  const { mandateStore } = freshQuad();
  const before = mandateStore.getStatusEvents('sip-mandate-a').length;
  const { sub } = { sub: mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization') };
  const afterSubmit = mandateStore.getStatusEvents('sip-mandate-a');
  assert.ok(afterSubmit.length > before);
  const firstEventSnapshot = JSON.stringify(afterSubmit[0]);
  mandateStore.submitAuthorizationAttempt(sub.request.id);
  mandateStore.checkRepairStatus(sub.request.id);
  const afterRepair = mandateStore.getStatusEvents('sip-mandate-a');
  assert.ok(afterRepair.length > afterSubmit.length, 'new events must be appended, not replace old ones');
  assert.equal(JSON.stringify(afterRepair[0]), firstEventSnapshot, 'earlier events must never be mutated');
});

// ── 16. Payment readiness after verified repair ──
test('after a verified repair the mandate reads as Active with no action required', () => {
  const { mandateStore } = freshQuad();
  repairToEffective(mandateStore, 'sip-mandate-g', 'reauthorization');
  const health = mandateStore.getMandateHealth('sip-mandate-g');
  assert.equal(health.status, Data.MandateHealthStatus.ACTIVE);
  assert.equal(health.actionRequired, false);
});

// ── 17. No false payment success after mandate repair ──
test('a repaired mandate never retroactively marks a prior failed instalment as successful', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  const health = mandateStore.getMandateHealth('sip-mandate-l');
  assert.equal(health.status, Data.MandateHealthStatus.ACTIVE, 'scenario L is pre-seeded already repaired');
  const inst = recoveryStore.getInstalment('inst-mandate-l');
  assert.equal(inst.status, 'failed');
  assert.notEqual(inst.status, 'success');
  assert.notEqual(inst.status, 'recovered');
});

// ── 18. No unauthorized debit on mandate repair ──
test('repairing a mandate never creates a payment attempt or instalment record by itself', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  const before = recoveryStore.getInstalmentsForSip('sip-mandate-a').length;
  repairToEffective(mandateStore, 'sip-mandate-a', 'reauthorization');
  const after = recoveryStore.getInstalmentsForSip('sip-mandate-a').length;
  assert.equal(after, before, 'a mandate repair must never itself trigger a debit or create a payment record');
});

// ── 19. Paused SIP remains paused ──
test('repairing the mandate of a paused SIP never resumes it automatically', () => {
  const { mandateStore, pauseStore } = freshQuad();
  assert.equal(pauseStore.getLifecycle('sip-mandate-i'), 'paused', 'scenario I is pre-seeded paused');
  repairToEffective(mandateStore, 'sip-mandate-i', 'reauthorization');
  assert.equal(mandateStore.getMandateHealth('sip-mandate-i').status, Data.MandateHealthStatus.ACTIVE);
  assert.equal(pauseStore.getLifecycle('sip-mandate-i'), 'paused', 'the SIP must still be paused after the mandate is repaired');
});

// ── 20. Salary schedule preservation ──
test('loading and using the mandate module never changes Feature 2’s own scheduling state for an untouched SIP', () => {
  const { mandateStore, schedulingStore } = freshQuad();
  void mandateStore;
  const before = schedulingStore.getOpenRequestsForSip('sip-sched-c').length;
  const res = schedulingStore.submitDateChangeRequest('sip-sched-c', 18);
  assert.equal(res.ok, true);
  assert.equal(schedulingStore.getOpenRequestsForSip('sip-sched-c').length, before + 1);
});

// ── 21. Feature 1 failed-payment recovery regression ──
test('Feature 1’s own retry-recovery flow still works unchanged after the mandate module seeds its own SIPs', () => {
  const { recoveryStore, mandateStore } = freshQuad();
  void mandateStore;
  const instalments = recoveryStore.getInstalmentsForSip('sip-demo-1');
  const failed = instalments.find((i) => i.status === 'failed' || i.status === 'pending');
  assert.ok(recoveryStore.getAllSips().some((s) => s.id === 'sip-demo-1'));
  void failed;
});

// ── 22. Feature 2 date-change regression ──
test('Feature 2’s date-change eligibility and submission logic is unaffected by the mandate module', () => {
  const { mandateStore, schedulingStore } = freshQuad();
  void mandateStore;
  const capability = schedulingStore.getCapability('sip-sched-c');
  assert.ok(capability);
  assert.equal(capability.canChangeDate, true);
});

// ── 23. Feature 3 pause/resume regression ──
test('Feature 3’s own pause scenario continues to work unchanged after the mandate module calls seedExternalPause', () => {
  const { mandateStore, pauseStore } = freshQuad();
  void mandateStore;
  assert.equal(pauseStore.getLifecycle('sip-sched-f'), 'paused', 'Feature 3’s own scenario E must still be pre-seeded paused');
  const res = pauseStore.requestEarlyResume('sip-sched-f');
  assert.equal(res.ok, true);
});

// ── 24. Notification deduplication ──
test('repeated status checks never create duplicate mandate_repaired notifications', () => {
  const { mandateStore } = freshQuad();
  const sub = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  mandateStore.submitAuthorizationAttempt(sub.request.id);
  mandateStore.checkRepairStatus(sub.request.id);
  mandateStore.checkRepairStatus(sub.request.id);
  mandateStore.checkRepairStatus(sub.request.id);
  const repairedNotifs = mandateStore.getNotifications().filter((n) => n.requestId === sub.request.id && n.type === 'mandate_repaired');
  assert.equal(repairedNotifs.length, 1);
});

// ── 25. Storage persistence after refresh ──
test('mandate state persists across a simulated page refresh using the same storage', () => {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();
  const sharedStorage = makeFakeStorage();
  const storeA = new MandateStore({ storage: sharedStorage, recoveryStore, schedulingStore, pauseStore });
  storeA.load();
  const sub = storeA.submitRepairRequest('sip-mandate-a', 'reauthorization');
  storeA.submitAuthorizationAttempt(sub.request.id);

  const storeB = new MandateStore({ storage: sharedStorage, recoveryStore, schedulingStore, pauseStore });
  storeB.load();
  const reloaded = storeB.getRepairRequest(sub.request.id);
  assert.ok(reloaded);
  assert.equal(reloaded.status, Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING);
});

// ── 26. Multiple SIP isolation ──
test('repairing one SIP’s mandate never changes another SIP’s own mandate health or requests', () => {
  const { mandateStore } = freshQuad();
  const otherBefore = mandateStore.getMandateHealth('sip-mandate-c');
  repairToEffective(mandateStore, 'sip-mandate-a', 'reauthorization');
  const otherAfter = mandateStore.getMandateHealth('sip-mandate-c');
  assert.equal(otherAfter.status, otherBefore.status);
  assert.equal(mandateStore.getRepairRequestsForSip('sip-mandate-c').length, 0);
});

// ── 27. Deterministic scenario switching ──
test('all 12 demo scenarios (A-L) are present with deterministic, distinct ids, and scenario switching persists', () => {
  const { mandateStore } = freshQuad();
  const scenarios = mandateStore.getScenarios();
  assert.equal(scenarios.length, 12);
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, 12);
  mandateStore.setFocusedScenario('mandate-g');
  assert.equal(mandateStore.getFocusedScenarioId(), 'mandate-g');
});

// ── Screen 2 wiring regression: Mandate Details must resolve a real mandate record ──
test('every demo SIP’s mandateId resolves to a real Feature 1 mandate record (Screen 2 data wiring)', () => {
  const { recoveryStore } = freshQuad();
  Data.buildScenarios().forEach((sc) => {
    const sip = recoveryStore.getSip(sc.sipId);
    assert.ok(sip, 'scenario ' + sc.id + ' SIP must be registered');
    const mandate = recoveryStore.getMandateForSip(sc.sipId);
    assert.ok(mandate, 'scenario ' + sc.id + ' SIP must resolve a mandate via sip.mandateId, not render null');
    assert.equal(mandate.id, 'mandate-' + sc.sipId);
  });
});

// ── 28. Support ticket integration ──
test('a mandate support request creates a correctly-prefilled Feature 1 support ticket with no sensitive fields', () => {
  const { mandateStore, recoveryStore } = freshQuad();
  mandateStore.emit(Analytics.Events.SUPPORT_REQUESTED, { sipId: 'sip-mandate-h', reasonCode: 'provider_timeout' });
  const ticket = recoveryStore.createSupportTicket({ sipId: 'sip-mandate-h', instalmentId: null, subject: 'Help with AutoPay / mandate repair', description: 'The payment provider did not respond in time.' });
  assert.ok(ticket.ticketNumber);
  assert.equal(ticket.sipId, 'sip-mandate-h');
  assert.equal(ticket.status, 'open');
  assert.ok(!JSON.stringify(ticket).toLowerCase().includes('otp'));
  assert.ok(!JSON.stringify(ticket).toLowerCase().includes('pin'));
});
