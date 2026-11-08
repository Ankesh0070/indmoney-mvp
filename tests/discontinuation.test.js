/**
 * SIP Continuity Insights (Feature 7) — automated tests. Zero-dependency:
 * uses Node's built-in test runner + assert, matching mvp-app's "no build
 * tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryStore } = require('../public/recovery/store.js');
const { SchedulingStore } = require('../public/scheduling/store.js');
const { PauseStore } = require('../public/pause/store.js');
const { MandateStore } = require('../public/mandate/store.js');
const { CashFlowStore } = require('../public/cashflow/store.js');
const { EducationStore } = require('../public/education/store.js');
const Data = require('../public/discontinuation/data.js');
const Engine = require('../public/discontinuation/engine.js');
const { DiscontinuationStore } = require('../public/discontinuation/store.js');
const Components = require('../public/discontinuation/components.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshFullChain() {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();
  const mandateStore = new MandateStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore, pauseStore });
  mandateStore.load();
  const cashflowStore = new CashFlowStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore, pauseStore, mandateStore });
  cashflowStore.load();
  const educationStore = new EducationStore({ storage: makeFakeStorage(), recoveryStore });
  educationStore.load();
  const discontinuationStore = new DiscontinuationStore({
    storage: makeFakeStorage(), recoveryStore, pauseStore, mandateStore, schedulingStore, cashFlowStore: cashflowStore, educationStore
  });
  discontinuationStore.load();
  return { recoveryStore, schedulingStore, pauseStore, mandateStore, cashflowStore, educationStore, discontinuationStore };
}

function freshDiscontinuationChain() {
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const discontinuationStore = new DiscontinuationStore({ storage: makeFakeStorage(), recoveryStore });
  discontinuationStore.load();
  return { recoveryStore, discontinuationStore };
}

// ── 1. Reason selection ──
test('selecting a reason sets the correct category and persists it on the journey', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  const res = store.selectReason(journey.id, 'reason-4');
  assert.equal(res.ok, true);
  assert.equal(res.journey.reasonCategory, Data.ReasonCategory.PAYMENT_FAILED);
  assert.equal(res.journey.reasonId, 'reason-4');
});

// ── 2. Optional feedback submission ──
test('submitting free-text feedback creates a sanitized feedback record linked to the journey', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-2');
  store.selectReason(journey.id, 'reason-1');
  store.submitFeedback(journey.id, { freeText: 'I need the money for an emergency.' });
  const records = store.getFeedbackRecords({}).filter((r) => r.journeyId === journey.id);
  assert.equal(records.length, 1);
  assert.equal(records[0].freeTextSanitized, 'I need the money for an emergency.');
  assert.equal(records[0].journeyId, journey.id);
});

// ── 3. Skip feedback ──
test('skipping feedback marks the journey skipped with no reason recorded, and still allows cancellation', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  store.skipFeedback(journey.id);
  assert.equal(journey.skippedFeedback, true);
  assert.equal(journey.reasonCategory, null);
  const res = store.submitCancellationRequest(journey.id);
  assert.equal(res.ok, true);
});

// ── 4. Prefer not to say ──
test('"Prefer not to say" does not persist a specific reason category', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-2');
  const res = store.selectReason(journey.id, 'reason-11');
  assert.equal(res.ok, true);
  assert.equal(res.journey.reasonCategory, null);
  assert.equal(res.journey.preferNotToSay, true);
});

// ── 5. Temporary financial difficulty mapping ──
test('financial pressure maps to the Pause & Resume Manager', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-5');
  store.selectReason(journey.id, 'reason-1');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.PAUSE);
});

// ── 6. Income instability mapping ──
test('income instability maps to Cash-Flow Visibility', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-6');
  store.selectReason(journey.id, 'reason-2');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.CASHFLOW);
});

// ── 7. Scheduling problem mapping ──
test('debit date mismatch maps to Salary-Aligned Scheduling', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-7');
  store.selectReason(journey.id, 'reason-3');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.SCHEDULING);
});

// ── 8. Payment failure mapping ──
test('a failed payment maps to the Failed SIP Recovery System', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  store.selectReason(journey.id, 'reason-4');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.RECOVERY);
});

// ── 9. Mandate problem mapping ──
test('an AutoPay/authorization problem maps to the Mandate Repair Assistant', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-2');
  store.selectReason(journey.id, 'reason-5');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.MANDATE);
});

// ── 10. Performance education mapping ──
test('a performance concern maps to the First-Year SIP Journey explainer', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-6');
  store.selectReason(journey.id, 'reason-6');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.EDUCATION);
});

// ── 11. Support issue mapping ──
test('app dissatisfaction maps to Support', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-7');
  store.selectReason(journey.id, 'reason-8');
  assert.equal(store.getHelpOffer(journey.id).toolId, Data.HelpToolId.SUPPORT);
});

// ── 12. Intentional cancellation without offer ──
test('intentional discontinuation offers no contextual tool and no retention pressure', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-5');
  store.selectReason(journey.id, 'reason-9');
  assert.equal(store.getHelpOffer(journey.id), null);
  const res = store.submitCancellationRequest(journey.id);
  assert.equal(res.ok, true);
});

// ── 13. Cancellation action always accessible ──
test('a cancellation request can be submitted immediately after starting a journey, with no reason or feedback required', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-6');
  const res = store.submitCancellationRequest(journey.id);
  assert.equal(res.ok, true);
  assert.equal(res.request.status, Data.CancellationStatus.REQUESTED);
});

// ── 14. No required feedback ──
test('no store method ever forces a reason or free text before a cancellation request can be submitted', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-7');
  assert.equal(journey.reasonCategory, null);
  assert.equal(journey.feedbackSubmittedAt, null);
  const res = store.submitCancellationRequest(journey.id);
  assert.equal(res.ok, true);
});

// ── 15. Free-text validation (length cap) ──
test('free text is capped at 500 characters after sanitization', () => {
  const longText = 'a'.repeat(2000);
  const sanitized = Engine.sanitizeFreeText(longText);
  assert.equal(sanitized.length, 500);
});

// ── 16. Sensitive data masking ──
test('long digit runs resembling account/card numbers are masked out of free text', () => {
  const sanitized = Engine.sanitizeFreeText('My account number is 123456789012 please help');
  assert.ok(!sanitized.includes('123456789012'));
  assert.ok(sanitized.includes('[redacted number]'));
});

// ── 17. Contextual help navigation ──
test('opening help logs a help-engagement event and returns the correct tool id', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  store.selectReason(journey.id, 'reason-5');
  const res = store.openHelp(journey.id);
  assert.equal(res.ok, true);
  assert.equal(res.toolId, Data.HelpToolId.MANDATE);
  assert.ok(journey.helpOpenedAt);
});

// ── 18. Return from help ──
test('returning from help preserves the journey and still allows continuing to cancellation', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-2');
  store.selectReason(journey.id, 'reason-1');
  store.openHelp(journey.id);
  const res = store.continueToCancellation(journey.id);
  assert.equal(res.ok, true);
  assert.equal(res.journey.status, Data.JourneyStatus.CANCELLATION_CONTINUED);
});

// ── 19. Cancellation provider approval ──
test('checking status enough times resolves a request to effective', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  const sub = store.submitCancellationRequest(journey.id);
  store.checkCancellationStatus(sub.request.id);
  const res = store.checkCancellationStatus(sub.request.id);
  assert.equal(res.request.status, Data.CancellationStatus.EFFECTIVE);
});

// ── 20. Pending cancellation ──
test('a cancellation request stays pending (not immediately effective) before enough checks have occurred', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-2');
  const sub = store.submitCancellationRequest(journey.id);
  assert.equal(sub.request.status, Data.CancellationStatus.REQUESTED);
  const res = store.checkCancellationStatus(sub.request.id);
  assert.equal(res.request.status, Data.CancellationStatus.PENDING_PROVIDER_APPROVAL);
});

// ── 21. Cancellation rejection ──
test('a seeded rejected-outcome scenario resolves to a rejected cancellation status', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const journey = store.getAllJourneys().find((j) => j.demoScenarioId === 'disc-n');
  const request = store.getCancellationRequest(journey.cancellationRequestId);
  assert.equal(request.status, Data.CancellationStatus.REJECTED);
});

// ── 22. Duplicate cancellation prevention ──
test('submitting a cancellation request twice for the same journey returns the same request, not a duplicate', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-5');
  const first = store.submitCancellationRequest(journey.id);
  const second = store.submitCancellationRequest(journey.id);
  assert.equal(second.request.id, first.request.id);
  assert.equal(second.duplicate, true);
});

// ── 23. Explicit voluntary continuation classification ──
test('choosing to retain a SIP is classified distinctly from a cancellation request', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-6');
  store.selectReason(journey.id, 'reason-1');
  const res = store.chooseToRetain(journey.id);
  assert.equal(res.ok, true);
  assert.equal(res.journey.status, Data.JourneyStatus.USER_RETAINED);
  assert.equal(res.journey.cancellationRequestId, null);
});

// ── 24. Abandoned flow not counted as retained ──
test('a journey that is simply left in progress is never classified as voluntarily retained', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-7');
  store.selectReason(journey.id, 'reason-1');
  // no further action — simulate the user abandoning the flow here
  assert.notEqual(journey.status, Data.JourneyStatus.USER_RETAINED);
  const rates = Engine.computeRates(store.getAllJourneys());
  const retainedCount = store.getAllJourneys().filter((j) => j.status === Data.JourneyStatus.USER_RETAINED).length;
  assert.equal(retainedCount, rates.voluntaryContinuationNum);
});

// ── 25. Feedback deletion ──
test('deleting feedback clears the text but leaves the journey and cancellation record untouched', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-1');
  store.selectReason(journey.id, 'reason-1');
  store.submitFeedback(journey.id, { freeText: 'Some note.' });
  store.submitCancellationRequest(journey.id);
  const recordId = journey.feedbackRecordId;
  store.deleteFeedback(recordId);
  const rec = store.getFeedbackRecords({}).find((r) => r.id === recordId);
  assert.equal(rec.freeTextSanitized, null);
  assert.ok(rec.deletedAt);
  assert.equal(journey.cancellationRequestId != null, true);
  assert.equal(journey.reasonCategory, Data.ReasonCategory.FINANCIAL_PRESSURE);
});

// ── 26. Payment history preservation ──
test('starting and cancelling a discontinuation journey never touches Feature 1 instalment records', () => {
  const { recoveryStore, discontinuationStore: store } = freshDiscontinuationChain();
  const before = JSON.stringify(recoveryStore.getInstalmentsForSip('sip-demo-1'));
  const { journey } = store.startJourney('sip-demo-1');
  store.selectReason(journey.id, 'reason-4');
  store.submitCancellationRequest(journey.id);
  const after = JSON.stringify(recoveryStore.getInstalmentsForSip('sip-demo-1'));
  assert.equal(before, after);
});

// ── 27. SIP lifecycle preservation ──
test('submitting a cancellation request never mutates the underlying SIP record itself', () => {
  const { recoveryStore, discontinuationStore: store } = freshDiscontinuationChain();
  const before = JSON.stringify(recoveryStore.getSip('sip-demo-2'));
  const { journey } = store.startJourney('sip-demo-2');
  store.submitCancellationRequest(journey.id);
  const after = JSON.stringify(recoveryStore.getSip('sip-demo-2'));
  assert.equal(before, after);
});

// ── 28. Research analytics accuracy ──
test('seeded demo journeys produce the expected analytics summary totals', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const summary = store.getAnalyticsSummary();
  assert.equal(summary.totalStarted, 15);
  assert.equal(summary.helpShown, 11);
  assert.equal(summary.helpOpened, 10);
  assert.equal(summary.cancellationRequestsSubmitted, 14);
  assert.equal(summary.cancellationsEffective, 3);
  assert.equal(summary.retainedVoluntarily, 1);
  assert.equal(summary.skippedFeedback, 1);
});

// ── 29. Multiple SIP isolation ──
test('journeys for different SIPs never interfere with one another', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const j1 = store.startJourney('sip-demo-1').journey;
  const j2 = store.startJourney('sip-demo-2').journey;
  store.selectReason(j1.id, 'reason-1');
  store.selectReason(j2.id, 'reason-4');
  assert.equal(j1.reasonCategory, Data.ReasonCategory.FINANCIAL_PRESSURE);
  assert.equal(j2.reasonCategory, Data.ReasonCategory.PAYMENT_FAILED);
  assert.notEqual(j1.id, j2.id);
});

// ── 30. Browser refresh persistence ──
test('a journey started before a simulated refresh is resumed, not duplicated, after reload', () => {
  const storage = makeFakeStorage();
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const store1 = new DiscontinuationStore({ storage, recoveryStore });
  store1.load();
  const { journey } = store1.startJourney('sip-demo-5');
  store1.selectReason(journey.id, 'reason-2');

  const store2 = new DiscontinuationStore({ storage, recoveryStore });
  store2.load();
  const resumed = store2.startJourney('sip-demo-5');
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.journey.id, journey.id);
  assert.equal(resumed.journey.reasonCategory, Data.ReasonCategory.INCOME_IRREGULAR);
});

// ── 31. Feature 1 regression ──
test('Feature 1’s own retry-recovery flow still works unchanged after the discontinuation module loads', () => {
  const { recoveryStore } = freshFullChain();
  const res = recoveryStore.retryPayment('inst-demo-1');
  assert.equal(res.ok, true);
});

// ── 32. Feature 2 regression ──
test('Feature 2’s own date-change submission still works unchanged after the discontinuation module loads', () => {
  const { schedulingStore } = freshFullChain();
  const res = schedulingStore.submitDateChangeRequest('sip-sched-b', 15);
  assert.equal(res.ok, true);
});

// ── 33. Feature 3 regression ──
test('Feature 3’s own pause flow still works unchanged after the discontinuation module loads', () => {
  const { pauseStore } = freshFullChain();
  const res = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(res.ok, true);
});

// ── 34. Feature 4 regression ──
test('Feature 4’s own mandate repair flow still works unchanged after the discontinuation module loads', () => {
  const { mandateStore } = freshFullChain();
  const res = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  assert.equal(res.ok, true);
});

// ── 35. Feature 5 regression ──
test('Feature 5’s own cash-flow breakdown still works unchanged, with no duplicate SIPs introduced', () => {
  const { cashflowStore, recoveryStore } = freshFullChain();
  const breakdown = cashflowStore.getBreakdown(30);
  assert.ok(breakdown.all.length >= 0);
  assert.equal(recoveryStore.getAllSips().length, 28);
});

// ── 36. Feature 6 regression ──
test('Feature 6’s own journey builder still works unchanged after the discontinuation module loads', () => {
  const { educationStore } = freshFullChain();
  const journey = educationStore.buildJourney();
  assert.ok(journey);
});

// ── 37. Accessible controls and keyboard support (structural proxy) ──
test('reason, follow-up and help controls render as native focusable <button> elements, not non-semantic click targets', () => {
  const reasonHtml = Components.reasonOptionButton(Data.REASON_OPTIONS[0], false);
  const followUpHtml = Components.followUpOptionButton('Temporary', false);
  const helpTileHtml = Components.helpOfferTile(Data.HELP_MAPPING[Data.ReasonCategory.FINANCIAL_PRESSURE]);
  assert.ok(reasonHtml.startsWith('<button'));
  assert.ok(followUpHtml.startsWith('<button'));
  assert.ok(helpTileHtml.startsWith('<button'));
});

// ── 38. No dark-pattern cancellation obstruction ──
test('the cancellation path never requires feedback, a reason, or viewing help before it can be submitted', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const { journey } = store.startJourney('sip-demo-6');
  // Immediately submit — no reason selected, no feedback given, no help viewed.
  const res = store.submitCancellationRequest(journey.id);
  assert.equal(res.ok, true);
  assert.equal(res.request.status, Data.CancellationStatus.REQUESTED);
});

// ── Bonus: edge case — SIP already cancelled ──
test('starting a new journey for an already-effectively-cancelled SIP is blocked with a clear code', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const journey = store.getAllJourneys().find((j) => j.demoScenarioId === 'disc-c');
  assert.equal(store.getCancellationRequest(journey.cancellationRequestId).status, Data.CancellationStatus.EFFECTIVE);
  const res = store.startJourney(journey.sipId);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'ALREADY_CANCELLED');
});

// ── Bonus: edge case — component builders never leak undefined/NaN ──
test('component builders render without undefined/NaN leaks', () => {
  const html = Components.cancellationRequestCard({ status: 'effective', providerNote: 'Done.', createdAt: new Date().toISOString(), checksDone: 2, requiredChecks: 2 });
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  const dist = Components.distributionList({ rows: [{ category: 'financial_pressure', count: 2 }], noReasonGiven: 1, total: 3 });
  assert.ok(!dist.includes('undefined'));
});

// ── Bonus: all sixteen demo scenarios present ──
test('exactly sixteen demo scenarios (A-P) are defined', () => {
  const scenarios = Data.buildScenarios();
  assert.equal(scenarios.length, 16);
  assert.equal(scenarios.filter((s) => s.isAggregateView).length, 1);
});

// ── Bonus: sanitization never throws on empty/null input ──
test('sanitizeFreeText handles empty and null input safely', () => {
  assert.equal(Engine.sanitizeFreeText(''), '');
  assert.equal(Engine.sanitizeFreeText(null), '');
  assert.equal(Engine.sanitizeFreeText(undefined), '');
});

// ── Bonus: insights explorer filtering ──
test('the research insights explorer filters journeys by reason category', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const result = store.getInsightsExplorer({ reasonCategory: Data.ReasonCategory.FINANCIAL_PRESSURE });
  assert.ok(result.totalMatched > 0);
  result.rows.forEach((r) => assert.equal(r.journey.reasonCategory, Data.ReasonCategory.FINANCIAL_PRESSURE));
});

// ── Bonus: CSV export never includes deleted feedback text ──
test('exported CSV marks deleted feedback instead of leaking deleted text', () => {
  const { discontinuationStore: store } = freshDiscontinuationChain();
  const journey = store.getAllJourneys().find((j) => j.demoScenarioId === 'disc-o');
  const csv = store.exportFeedbackCSV({});
  assert.ok(csv.includes('[deleted by user]'));
  assert.ok(!csv.includes('This note was later deleted by the user'));
  void journey;
});
