/**
 * SIP Pause & Resume Manager — automated tests.
 * Zero-dependency: uses Node's built-in test runner + assert, matching
 * mvp-app's "no build tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryStore } = require('../public/recovery/store.js');
const { SchedulingStore } = require('../public/scheduling/store.js');
const DateUtils = require('../public/scheduling/dateUtils.js');
const Data = require('../public/pause/data.js');
const { PauseEngine, PauseStore } = require('../public/pause/store.js');
const Analytics = require('../public/pause/analytics.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshTriple() {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();
  return { recoveryStore, schedulingStore, pauseStore };
}

// ── 1. Eligible pause ──
test('a SIP whose provider supports pausing can be checked eligible and have a schedule previewed', () => {
  const { pauseStore } = freshTriple();
  const capability = pauseStore.getCapability('sip-demo-1');
  assert.equal(capability.pauseSupported, true);
  assert.equal(PauseEngine.checkPauseEligibility(capability).ok, true);
  const schedule = pauseStore.previewPauseSchedule('sip-demo-1', 2);
  assert.equal(schedule.affectedDateKeys.length, 2);
});

// ── 2. Ineligible pause ──
test('a SIP whose provider does not support pausing is rejected at submission and shows the exact unsupported notice', () => {
  const { pauseStore } = freshTriple();
  const capability = pauseStore.getCapability('sip-sched-b');
  assert.equal(capability.pauseSupported, false);
  assert.equal(PauseEngine.checkPauseEligibility(capability).ok, false);
  const res = pauseStore.submitPauseRequest('sip-sched-b', 1);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NOT_SUPPORTED');
});

// ── 3. Duration restrictions ──
test('a pause duration outside the provider-allowed range is rejected', () => {
  const { pauseStore } = freshTriple();
  const tooMany = pauseStore.submitPauseRequest('sip-demo-1', 10);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.code, 'CYCLES_OUT_OF_RANGE');
  const tooFew = pauseStore.submitPauseRequest('sip-demo-1', 0);
  assert.equal(tooFew.ok, false);
  assert.equal(tooFew.code, 'CYCLES_OUT_OF_RANGE');
});

// ── 4. Provider rejection ──
test('a pause request the simulated provider rejects returns the SIP to active with a rejection reason', () => {
  const { pauseStore } = freshTriple();
  const sub = pauseStore.submitPauseRequest('sip-sched-c', 1);
  assert.equal(sub.ok, true);
  const checked = pauseStore.checkPauseStatus(sub.request.id);
  assert.equal(checked.status, Data.PauseRequestStatus.REJECTED);
  assert.ok(checked.request.rejectionReason);
  assert.equal(pauseStore.getLifecycle('sip-sched-c'), Data.SipLifecycleStatus.ACTIVE);
});

// ── 5. Pending provider approval ──
test('a slow-deciding provider leaves the request in pending_provider_approval across repeated checks', () => {
  const { pauseStore } = freshTriple();
  const sub = pauseStore.submitPauseRequest('sip-sched-e', 1);
  assert.equal(sub.ok, true);
  pauseStore.checkPauseStatus(sub.request.id);
  const second = pauseStore.checkPauseStatus(sub.request.id);
  assert.equal(second.status, Data.PauseRequestStatus.PENDING_PROVIDER_APPROVAL);
});

// ── 6. Request cancellation ──
test('a pending pause request can be cancelled, returning the SIP to active; an effective pause cannot', () => {
  const { pauseStore } = freshTriple();
  const sub = pauseStore.submitPauseRequest('sip-demo-1', 1);
  const cancelled = pauseStore.cancelPauseRequest(sub.request.id);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.request.status, Data.PauseRequestStatus.CANCELLED);
  assert.equal(pauseStore.getLifecycle('sip-demo-1'), Data.SipLifecycleStatus.ACTIVE);

  const activePause = pauseStore.getActivePauseRequestForSip('sip-sched-f');
  assert.ok(activePause, 'scenario E should be pre-seeded as an effective pause');
  const notCancellable = pauseStore.cancelPauseRequest(activePause.id);
  assert.equal(notCancellable.ok, false);
  assert.equal(notCancellable.code, 'NOT_CANCELLABLE');
});

// ── 7. Duplicate request prevention ──
test('submitting a second pause request while one is already open is rejected, not duplicated', () => {
  const { pauseStore } = freshTriple();
  const first = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(first.ok, true);
  const second = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'REQUEST_ALREADY_PENDING');
  assert.equal(pauseStore.getPauseRequestsForSip('sip-demo-1').length, 1);
});

// ── 8. Pause effective-date calculation ──
test('computePauseSchedule honors the notice period and spaces skipped cycles one month apart', () => {
  const capability = { noticeDays: 5, pauseSupported: true, minCycles: 1, maxCycles: 3 };
  // today is the 10th; scheduled day is the 12th, which is only 2 days of notice — not enough, so
  // the first skipped instalment must roll to next month's 12th.
  const schedule = PauseEngine.computePauseSchedule(capability, 2, '2026-03-10', 12, null);
  assert.equal(schedule.affectedDateKeys[0], '2026-04-12');
  assert.equal(schedule.affectedDateKeys[1], '2026-05-12');
  assert.equal(schedule.resumeDateKey, '2026-06-12');
});

// ── 9. Month-end and leap-year handling ──
test('a 31st-of-the-month schedule clamps safely onto shorter months, including February in leap and non-leap years', () => {
  const capability = { noticeDays: 0, pauseSupported: true, minCycles: 1, maxCycles: 1 };
  const nonLeap = PauseEngine.computePauseSchedule(capability, 1, '2027-01-31', 31, null);
  assert.equal(nonLeap.affectedDateKeys[0], '2027-01-31');
  assert.equal(nonLeap.resumeDateKey, '2027-02-28'); // 2027 is not a leap year
  const leap = PauseEngine.computePauseSchedule(capability, 1, '2028-01-31', 31, null);
  assert.equal(leap.resumeDateKey, '2028-02-29'); // 2028 is a leap year
});

// ── 10. Payment already processing ──
test('an instalment already processing this month is protected and excluded from the skip list', () => {
  const { pauseStore } = freshTriple();
  const info = pauseStore.getNextRealInstalmentInfo('sip-pause-h');
  assert.equal(info.isProcessing, true, 'scenario H seeds a real pending instalment for this cycle');
  const schedule = pauseStore.previewPauseSchedule('sip-pause-h', 1);
  assert.equal(schedule.protectedDateKey, info.dateKey);
  assert.equal(schedule.affectedDateKeys.indexOf(info.dateKey), -1, 'the processing date must never appear in the skip list');
});

// ── 11. Historical instalment preservation ──
test('pausing and resuming a SIP never deletes or mutates its pre-existing Feature 1 instalment history', () => {
  const { recoveryStore, pauseStore } = freshTriple();
  const before = recoveryStore.getInstalment('inst-demo-1');
  const beforeCount = recoveryStore.getInstalmentsForSip('sip-demo-1').length;
  assert.ok(before);

  const sub = pauseStore.submitPauseRequest('sip-demo-1', 1);
  pauseStore.checkPauseStatus(sub.request.id);

  const after = recoveryStore.getInstalment('inst-demo-1');
  assert.deepEqual(after, before, 'the original instalment record must be untouched');
  assert.equal(recoveryStore.getInstalmentsForSip('sip-demo-1').length, beforeCount, 'pausing must not fabricate instalment records');
});

// ── 12. Pending scheduling conflict ──
test('a SIP with an open Feature 2 date-change request blocks a new pause request instead of overwriting it', () => {
  const { schedulingStore, pauseStore } = freshTriple();
  const openSchedulingRequests = schedulingStore.getOpenRequestsForSip('sip-sched-g');
  assert.ok(openSchedulingRequests.length > 0, 'scenario G seeds an open date-change request');
  const res = pauseStore.submitPauseRequest('sip-sched-g', 1);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'SCHEDULING_CONFLICT');
  // the conflicting request itself must still be intact, not silently resolved or overwritten
  assert.equal(schedulingStore.getOpenRequestsForSip('sip-sched-g').length, openSchedulingRequests.length);
});

// ── 13. Early resume ──
test('a paused SIP whose provider allows early resume without reauthorization can resume ahead of schedule', () => {
  const { recoveryStore, pauseStore } = freshTriple();
  assert.equal(pauseStore.getLifecycle('sip-sched-f'), Data.SipLifecycleStatus.PAUSED, 'scenario E is pre-seeded mid-pause');
  const res = pauseStore.requestEarlyResume('sip-sched-f');
  assert.equal(res.ok, true);
  assert.equal(res.request.status, Data.ResumeRequestStatus.PENDING_PROVIDER_APPROVAL);

  const approved = pauseStore.checkResumeStatus(res.request.id);
  assert.equal(approved.status, Data.ResumeRequestStatus.APPROVED);

  pauseStore.advanceDemoClock(1);
  const effective = pauseStore.checkResumeStatus(res.request.id);
  assert.equal(effective.status, Data.ResumeRequestStatus.EFFECTIVE);
  assert.equal(pauseStore.getLifecycle('sip-sched-f'), Data.SipLifecycleStatus.ACTIVE);

  const firstPostResume = pauseStore.getFirstPostResumeStatus('sip-sched-f');
  assert.ok(firstPostResume);
  assert.equal(firstPostResume.status, 'pending', 'a resumed SIP must never be marked successful before a real payment event');
  // Feature 1's own instalment ledger owns this record, reached through its additive API.
  assert.ok(recoveryStore.getInstalment(firstPostResume.instalmentId));
});

// ── 14. Resume requires reauthorization ──
test('early resume on a mandate that needs reauthorization is parked until reauthorization completes', () => {
  const { pauseStore } = freshTriple();
  assert.equal(pauseStore.getLifecycle('sip-sched-d'), Data.SipLifecycleStatus.PAUSED, 'scenario F is pre-seeded mid-pause');
  const res = pauseStore.requestEarlyResume('sip-sched-d');
  assert.equal(res.ok, true);
  assert.equal(res.request.status, Data.ResumeRequestStatus.REQUIRES_REAUTHORIZATION);
  assert.equal(pauseStore.getLifecycle('sip-sched-d'), Data.SipLifecycleStatus.PROVIDER_ACTION_REQUIRED);

  const reauthed = pauseStore.completeResumeReauthorization(res.request.id);
  assert.equal(reauthed.request.status, Data.ResumeRequestStatus.PENDING_PROVIDER_APPROVAL);
  assert.equal(pauseStore.getLifecycle('sip-sched-d'), Data.SipLifecycleStatus.RESUME_REQUESTED);

  pauseStore.checkResumeStatus(res.request.id);
  pauseStore.advanceDemoClock(1);
  const effective = pauseStore.checkResumeStatus(res.request.id);
  assert.equal(effective.status, Data.ResumeRequestStatus.EFFECTIVE);
});

// ── 15. Scheduled resume via DemoClock ──
test('advancing the demo clock past the resume date automatically resumes a paused SIP with no reauthorization needed', () => {
  const { pauseStore } = freshTriple();
  assert.equal(pauseStore.getLifecycle('sip-pause-i'), Data.SipLifecycleStatus.PAUSED, 'scenario I is pre-seeded mid-pause');
  const pauseRequest = pauseStore.getActivePauseRequestForSip('sip-pause-i');
  assert.ok(pauseRequest);

  pauseStore.advanceDemoClock(90);

  assert.equal(pauseStore.getLifecycle('sip-pause-i'), Data.SipLifecycleStatus.ACTIVE);
  const resumeRequests = pauseStore.getResumeRequestsForSip('sip-pause-i');
  assert.equal(resumeRequests.length, 1);
  assert.equal(resumeRequests[0].type, 'scheduled');
  assert.equal(resumeRequests[0].status, Data.ResumeRequestStatus.EFFECTIVE);
});

// ── 16. No false payment-success event after resumption ──
test('a SIP shown as resumed with its first instalment still pending is never reported as having a successful payment', () => {
  const { recoveryStore, pauseStore } = freshTriple();
  assert.equal(pauseStore.getLifecycle('sip-pause-j'), Data.SipLifecycleStatus.ACTIVE, 'scenario J is pre-seeded already resumed');
  const status = pauseStore.getFirstPostResumeStatus('sip-pause-j');
  assert.ok(status);
  assert.equal(status.status, 'pending');
  assert.notEqual(status.status, 'success');
  const inst = recoveryStore.getInstalment(status.instalmentId);
  assert.equal(inst.status, 'pending');
});

// ── 17. Notification deduplication ──
test('repeated status checks on the same request never create duplicate notifications', () => {
  const { pauseStore } = freshTriple();
  const sub = pauseStore.submitPauseRequest('sip-demo-1', 1);
  pauseStore.checkPauseStatus(sub.request.id);
  pauseStore.checkPauseStatus(sub.request.id);
  pauseStore.checkPauseStatus(sub.request.id);
  const approvedNotifs = pauseStore.getNotifications().filter((n) => n.requestId === sub.request.id && n.type === 'pause_approved');
  assert.equal(approvedNotifs.length, 1);
});

// ── 18. Persistence across a simulated browser refresh ──
test('pause state persists across a simulated page refresh using the same storage', () => {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const sharedPauseStorage = makeFakeStorage();
  const storeA = new PauseStore({ storage: sharedPauseStorage, recoveryStore, schedulingStore });
  storeA.load();
  const sub = storeA.submitPauseRequest('sip-demo-1', 1);
  storeA.checkPauseStatus(sub.request.id);

  const storeB = new PauseStore({ storage: sharedPauseStorage, recoveryStore, schedulingStore });
  storeB.load();
  const reloaded = storeB.getPauseRequest(sub.request.id);
  assert.ok(reloaded);
  assert.equal(reloaded.status, Data.PauseRequestStatus.APPROVED);
  assert.equal(storeB.getLifecycle('sip-demo-1'), storeA.getLifecycle('sip-demo-1'));
});

// ── 19. Multiple SIP isolation ──
test('pausing one SIP never changes the lifecycle, capability or requests of another SIP', () => {
  const { pauseStore } = freshTriple();
  const otherLifecycleBefore = pauseStore.getLifecycle('sip-sched-c');
  const otherCapabilityBefore = pauseStore.getCapability('sip-sched-c');

  const sub = pauseStore.submitPauseRequest('sip-demo-1', 1);
  pauseStore.checkPauseStatus(sub.request.id);

  assert.equal(pauseStore.getLifecycle('sip-sched-c'), otherLifecycleBefore);
  assert.deepEqual(pauseStore.getCapability('sip-sched-c'), otherCapabilityBefore);
  assert.equal(pauseStore.getPauseRequestsForSip('sip-sched-c').length, 0);
});

// ── 20. Feature 1 recovery regression ──
test('loading the pause store does not disturb Feature 1’s own SIP list, mandates or instalment records', () => {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const sipsBefore = recoveryStore.getAllSips().map((s) => s.id).sort();
  const instalmentBefore = recoveryStore.getInstalment('inst-demo-2');

  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();

  const sipsAfter = recoveryStore.getAllSips().map((s) => s.id).sort();
  sipsBefore.forEach((id) => assert.ok(sipsAfter.indexOf(id) !== -1, id + ' must still exist'));
  assert.deepEqual(recoveryStore.getInstalment('inst-demo-2'), instalmentBefore);
});

// ── 21. Feature 2 date-change regression ──
test('Feature 2’s own date-change flow keeps working unchanged after the pause module is loaded alongside it', () => {
  const { schedulingStore, pauseStore } = freshTriple();
  void pauseStore; // pause module is loaded into the same page/session, but never invoked here
  const before = schedulingStore.getOpenRequestsForSip('sip-sched-c').length;
  const res = schedulingStore.submitDateChangeRequest('sip-sched-c', 18);
  assert.equal(res.ok, true);
  assert.equal(schedulingStore.getOpenRequestsForSip('sip-sched-c').length, before + 1);
});

// ── 22. Month-12 active-SIP classification ──
test('the analytics outcome metric only counts a SIP as active when it has a successful instalment within the last 30 days', () => {
  const { recoveryStore, pauseStore } = freshTriple();
  recoveryStore.registerSip({ id: 'sip-pause-metrictest', fundName: 'Test Fund', category: 'Equity', color: '#000', amount: 1000, scheduledDay: 5, startDate: null, lastSuccessfulDate: null, status: 'active' });
  const today = pauseStore.getDemoToday();
  recoveryStore.registerInstalment({
    id: 'inst-pause-metrictest-recent', sipId: 'sip-pause-metrictest', amount: 1000, status: 'success', failureReason: null,
    scheduledDate: DateUtils.addDays(today, -5) + 'T12:00:00.000Z', retryPermitted: false, recoveryAvailable: false,
    attemptSeq: 1, statusCheckCount: 0, everFailed: false, failedAt: null, recoveredAt: null
  });
  const summary = Analytics.computeMetrics(pauseStore, recoveryStore);
  assert.equal(summary.outcomeMetric.key, 'month12_active_rate');
  assert.ok(summary.outcomeMetric.value > 0, 'a SIP with a success in the last 30 days must count toward the active rate');
  assert.equal(summary.demo, true);
});
