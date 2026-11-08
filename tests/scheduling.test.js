/**
 * Salary-Aligned SIP Scheduler — automated tests.
 * Zero-dependency: uses Node's built-in test runner + assert, matching
 * mvp-app's "no build tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryStore } = require('../public/recovery/store.js');
const Data = require('../public/scheduling/data.js');
const DateUtils = require('../public/scheduling/dateUtils.js');
const { SchedulingEngine, SchedulingStore } = require('../public/scheduling/store.js');
const Analytics = require('../public/scheduling/analytics.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshPair() {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedStore.load();
  return { recoveryStore, schedStore };
}

// ── 1. Expected income-date setup ──
test('expected income-date setup saves fixed, variable and irregular patterns, and supports skip', () => {
  const { schedStore } = freshPair();
  assert.equal(schedStore.getIncome(), null);

  schedStore.setIncome({ pattern: Data.IncomePattern.FIXED, fixedDay: 7 });
  assert.equal(schedStore.getIncome().pattern, 'fixed');
  assert.equal(schedStore.getIncome().fixedDay, 7);

  schedStore.setIncome({ pattern: Data.IncomePattern.VARIABLE, variableStart: 5, variableEnd: 10 });
  assert.equal(schedStore.getIncome().pattern, 'variable');

  schedStore.setIncome({ pattern: Data.IncomePattern.IRREGULAR });
  assert.equal(schedStore.getIncome().pattern, 'irregular');

  schedStore.skipIncomeSetup();
  assert.equal(schedStore.getIncome().skipped, true);
});

// ── 2. Fixed-date mismatch detection ──
test('fixed income pattern flags a SIP debited before the expected income day as a mismatch', () => {
  const income = { pattern: Data.IncomePattern.FIXED, fixedDay: 7, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 5, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.MISMATCH);
  assert.equal(result.projectedIncomeDay, 7);
});

test('fixed income pattern marks a SIP debited after the expected income day as aligned', () => {
  const income = { pattern: Data.IncomePattern.FIXED, fixedDay: 1, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 10, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.ALIGNED);
});

test('fixed income pattern on the same day as the SIP debit is flagged same_day, not a hard mismatch', () => {
  const income = { pattern: Data.IncomePattern.FIXED, fixedDay: 7, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 7, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.SAME_DAY);
});

// ── 3. Variable-date uncertainty ──
test('variable income pattern flags a SIP debited inside the estimated window as uncertain, not a hard mismatch', () => {
  const income = { pattern: Data.IncomePattern.VARIABLE, variableStart: 5, variableEnd: 10, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 7, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.UNCERTAIN);
});

test('variable income pattern marks a SIP debited after the estimated window as aligned', () => {
  const income = { pattern: Data.IncomePattern.VARIABLE, variableStart: 5, variableEnd: 10, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 15, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.ALIGNED);
});

// ── 4. Irregular-income behavior ──
test('irregular income pattern never produces an automated mismatch judgment', () => {
  const income = { pattern: Data.IncomePattern.IRREGULAR, skipped: false };
  const result = SchedulingEngine.detectMismatch(income, 5, 2026, 10);
  assert.equal(result.status, Data.MismatchStatus.UNKNOWN);
});

test('no income set (or skipped) produces an unknown mismatch status, never a false positive', () => {
  assert.equal(SchedulingEngine.detectMismatch(null, 5, 2026, 10).status, Data.MismatchStatus.UNKNOWN);
  assert.equal(SchedulingEngine.detectMismatch({ skipped: true }, 5, 2026, 10).status, Data.MismatchStatus.UNKNOWN);
});

// ── 5. Short-month and leap-year handling ──
test('day 31 income date projects to the last calendar day of a 30-day month, without altering the stored day', () => {
  const income = { pattern: Data.IncomePattern.FIXED, fixedDay: 31, skipped: false };
  // April 2026 (month0=3) has 30 days.
  const result = SchedulingEngine.detectMismatch(income, 28, 2026, 3);
  assert.equal(result.projectedIncomeDay, 30);
  assert.equal(income.fixedDay, 31, 'the self-reported day itself must never be mutated');
});

test('day 29 income date projects to the 28th in a non-leap February and the 29th in a leap February', () => {
  assert.equal(DateUtils.isLeapYear(2026), false);
  assert.equal(DateUtils.isLeapYear(2028), true);
  assert.equal(DateUtils.clampDay(29, 2026, 1), 28);
  assert.equal(DateUtils.clampDay(29, 2028, 1), 29);
});

test('calendar date keys never shift across a UTC/local day boundary', () => {
  const key = DateUtils.makeKey(2026, 10, 15);
  assert.equal(key, '2026-11-15');
  assert.equal(DateUtils.addDays(key, 1), '2026-11-16');
  assert.equal(DateUtils.addMonths(key, 1), '2026-12-15');
});

// ── 6. Provider-supported date changes ──
test('a provider-supported date-change request moves from pending approval to approved to effective', () => {
  const { schedStore } = freshPair();
  const sub = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  assert.equal(sub.ok, true);
  assert.equal(sub.request.status, Data.RequestStatus.PENDING_PROVIDER_APPROVAL);

  const checked = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checked.status, Data.RequestStatus.APPROVED);
  assert.ok(checked.request.effectiveDate);

  // Current schedule must stay unchanged until the effective date is actually reached.
  assert.equal(schedStore.getCurrentDebitDay('sip-demo-1'), 5);

  const ff = schedStore.simulateReachEffectiveDate(sub.request.id);
  assert.equal(ff.status, Data.RequestStatus.EFFECTIVE);
  assert.equal(schedStore.getCurrentDebitDay('sip-demo-1'), 10);
});

// ── 7. Unsupported change requests ──
test('a request against a SIP whose provider disallows date changes is refused without creating a request', () => {
  const { schedStore } = freshPair();
  const before = schedStore.getRequestsForSip('sip-sched-e').length;
  const res = schedStore.submitDateChangeRequest('sip-sched-e', 20);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NOT_SUPPORTED');
  assert.equal(schedStore.getRequestsForSip('sip-sched-e').length, before);
});

test('a date outside the provider-offered list is refused', () => {
  const { schedStore } = freshPair();
  const res = schedStore.submitDateChangeRequest('sip-demo-1', 99);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'DATE_NOT_ALLOWED');
});

// ── 8. Minimum notice periods ──
test('the computed effective date always respects the provider minimum notice period', () => {
  const capability = { minNoticeDays: 10, canChangeDate: true };
  const today = '2026-11-20';
  const effective = SchedulingEngine.computeEffectiveDate(capability, 25, today);
  const noticeFloor = DateUtils.addDays(today, 10);
  assert.ok(DateUtils.compareKeys(effective, noticeFloor) >= 0);
});

// ── 9. Reauthorization-required changes ──
test('a reauthorization-required SIP stays pending until reauthorization is explicitly completed', () => {
  const { schedStore } = freshPair();
  const sub = schedStore.submitDateChangeRequest('sip-sched-g', 12);
  assert.equal(sub.request.status, Data.RequestStatus.REQUIRES_REAUTHORIZATION);

  // Checking status before reauthorization must not silently approve it.
  const checkedEarly = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checkedEarly.status, Data.RequestStatus.REQUIRES_REAUTHORIZATION);

  const reauth = schedStore.completeReauthorization(sub.request.id);
  assert.equal(reauth.ok, true);
  assert.equal(reauth.request.status, Data.RequestStatus.PENDING_PROVIDER_APPROVAL);

  const checked = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checked.status, Data.RequestStatus.APPROVED);
});

// ── 10. Provider rejection ──
test('a provider rejection leaves the original debit date unchanged and records a reason', () => {
  const { schedStore } = freshPair();
  const originalDay = schedStore.getCurrentDebitDay('sip-sched-f');
  const sub = schedStore.submitDateChangeRequest('sip-sched-f', 9);
  const checked = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checked.status, Data.RequestStatus.REJECTED);
  assert.ok(checked.request.rejectionReason);
  assert.equal(schedStore.getCurrentDebitDay('sip-sched-f'), originalDay);
});

// ── 11. Duplicate request prevention ──
test('a second date-change request cannot be submitted while one is already open for the same SIP', () => {
  const { schedStore } = freshPair();
  const first = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  assert.equal(first.ok, true);
  const second = schedStore.submitDateChangeRequest('sip-demo-1', 12);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'REQUEST_ALREADY_PENDING');
  assert.equal(schedStore.getRequestsForSip('sip-demo-1').length, 1);
});

test('the in-flight guard rejects a concurrent duplicate submission for the same SIP', () => {
  const { schedStore } = freshPair();
  schedStore.beginRequest('sip-demo-1');
  const res = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'DUPLICATE_REQUEST');
  schedStore.endRequest('sip-demo-1');
});

// ── 12. Schedule persistence after refresh ──
test('income date, requests and effective overrides persist across a simulated page refresh via shared storage', () => {
  const sharedStorage = makeFakeStorage();
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();

  const storeA = new SchedulingStore({ storage: sharedStorage, recoveryStore });
  storeA.load();
  storeA.setIncome({ pattern: Data.IncomePattern.FIXED, fixedDay: 7 });
  const sub = storeA.submitDateChangeRequest('sip-demo-1', 10);
  storeA.checkRequestStatus(sub.request.id);
  storeA.simulateReachEffectiveDate(sub.request.id);

  const storeB = new SchedulingStore({ storage: sharedStorage, recoveryStore });
  storeB.load();
  assert.equal(storeB.getIncome().fixedDay, 7);
  assert.equal(storeB.getRequest(sub.request.id).status, Data.RequestStatus.EFFECTIVE);
  assert.equal(storeB.getCurrentDebitDay('sip-demo-1'), 10);
});

// ── 13. Multiple SIP isolation ──
test('changing one SIP’s date never affects another SIP’s own schedule', () => {
  const { schedStore } = freshPair();
  const otherOriginal = schedStore.getCurrentDebitDay('sip-demo-6');
  const sub = schedStore.submitDateChangeRequest('sip-demo-2', 15);
  schedStore.checkRequestStatus(sub.request.id);
  schedStore.simulateReachEffectiveDate(sub.request.id);

  assert.equal(schedStore.getCurrentDebitDay('sip-demo-2'), 15);
  assert.equal(schedStore.getCurrentDebitDay('sip-demo-6'), otherOriginal);
  assert.equal(schedStore.getOpenRequestsForSip('sip-demo-6').length, 0);
});

// ── 14. Pending payment / request protection ──
test('an open scheduling request blocks a new one for the same SIP until it is resolved or cancelled', () => {
  const { schedStore } = freshPair();
  const sub = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  assert.equal(schedStore.submitDateChangeRequest('sip-demo-1', 12).ok, false);

  const cancel = schedStore.cancelRequest(sub.request.id);
  assert.equal(cancel.ok, true);
  assert.equal(cancel.request.status, Data.RequestStatus.CANCELLED);

  const retry = schedStore.submitDateChangeRequest('sip-demo-1', 12);
  assert.equal(retry.ok, true);
});

// ── 15. Preservation of past payment history ──
test('registering scheduling demo SIPs never alters or duplicates Feature 1’s existing instalment or attempt records', () => {
  const { recoveryStore, schedStore } = freshPair();
  const before = recoveryStore.getInstalmentsForSip('sip-demo-1').map((i) => ({ ...i }));
  const beforeAttempts = recoveryStore.getAttemptsForInstalment(before[0].id).length;

  // Re-run seeding (as every store.load() does) and perform unrelated scheduling actions.
  schedStore.ensureSeeded();
  schedStore.setIncome({ pattern: Data.IncomePattern.FIXED, fixedDay: 7 });

  const after = recoveryStore.getInstalmentsForSip('sip-demo-1');
  assert.deepEqual(after, before);
  assert.equal(recoveryStore.getAttemptsForInstalment(before[0].id).length, beforeAttempts);
});

// ── 16. Feature 1 recovery regression ──
test('Feature 1’s retry recovery flow still works unchanged after Feature 2 seeds and registers its own SIPs', () => {
  const { recoveryStore, schedStore } = freshPair();
  schedStore.ensureSeeded();

  const sc = recoveryStore.getScenarios().find((s) => s.id === 'scenario-1');
  const result = recoveryStore.retryPayment(sc.instalment.id);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'success');
  const updated = recoveryStore.getInstalment(sc.instalment.id);
  assert.equal(updated.status, 'recovered');
});

test('Feature 2 registration leaves Feature 1’s own SIP count and ids untouched, only additive', () => {
  const recoveryStoreAlone = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStoreAlone.load();
  const originalIds = recoveryStoreAlone.getAllSips().map((s) => s.id).sort();

  const { recoveryStore } = freshPair();
  const afterIds = recoveryStore.getAllSips().map((s) => s.id).sort();
  originalIds.forEach((id) => assert.ok(afterIds.includes(id), `${id} should still be present`));
  assert.ok(afterIds.length > originalIds.length, 'scheduling-only demo SIPs should be additive, not replacing');
});

// ── 17. Correct date-change effective timing ──
test('an approved request does not become effective until its effective date is actually reached', () => {
  const { schedStore } = freshPair();
  const sub = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  const checked = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checked.status, Data.RequestStatus.APPROVED);

  // Checking again before the effective date must not flip it to effective.
  const checkedAgain = schedStore.checkRequestStatus(sub.request.id);
  assert.equal(checkedAgain.status, Data.RequestStatus.APPROVED);
  assert.equal(schedStore.getCurrentDebitDay('sip-demo-1'), 5);
});

// ── 18. Notification deduplication ──
test('repeated notifications for the same request/type are deduplicated, and stale notices are cleared on effective change', () => {
  const { schedStore } = freshPair();
  const sub = schedStore.submitDateChangeRequest('sip-demo-1', 10);
  schedStore.addNotification('change_pending', 'sip-demo-1', sub.request, 'duplicate attempt');
  const pendingNotifs = schedStore.getNotifications().filter((n) => n.requestId === sub.request.id && n.type === 'change_pending');
  assert.equal(pendingNotifs.length, 1);

  schedStore.checkRequestStatus(sub.request.id); // -> approved, clears change_pending, adds change_approved
  schedStore.simulateReachEffectiveDate(sub.request.id); // -> effective, clears change_approved, adds change_effective

  const final = schedStore.getNotifications();
  assert.equal(final.filter((n) => n.requestId === sub.request.id && n.type === 'change_pending').length, 0);
  assert.equal(final.filter((n) => n.requestId === sub.request.id && n.type === 'change_approved').length, 0);
  assert.equal(final.filter((n) => n.requestId === sub.request.id && n.type === 'change_effective').length, 1);
});

// ── Bonus: analytics sanity ──
test('computeMetrics only produces demo-labelled percentages and never throws on an empty session', () => {
  const { recoveryStore, schedStore } = freshPair();
  const summary = Analytics.computeMetrics(schedStore, recoveryStore);
  assert.equal(summary.demo, true);
  assert.ok(Array.isArray(summary.metrics));
  summary.metrics.forEach((m) => assert.equal(m.demo, true));
});

// ── Bonus: scenario catalogue integrity ──
test('all 8 demo scenarios (A-H) are present with deterministic, distinct ids', () => {
  const scenarios = Data.buildScenarios();
  assert.equal(scenarios.length, 8);
  const ids = scenarios.map((s) => s.id);
  assert.deepEqual(ids, ['sched-a', 'sched-b', 'sched-c', 'sched-d', 'sched-e', 'sched-f', 'sched-g', 'sched-h']);
});
