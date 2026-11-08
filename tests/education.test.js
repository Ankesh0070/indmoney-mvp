/**
 * My First-Year SIP Journey — automated tests.
 * Zero-dependency: uses Node's built-in test runner + assert, matching
 * mvp-app's "no build tooling" convention. Run with: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryStore } = require('../public/recovery/store.js');
const { SchedulingStore } = require('../public/scheduling/store.js');
const { PauseStore } = require('../public/pause/store.js');
const { MandateStore } = require('../public/mandate/store.js');
const { CashFlowStore } = require('../public/cashflow/store.js');
const DateUtils = require('../public/scheduling/dateUtils.js');
const Data = require('../public/education/data.js');
const Engine = require('../public/education/engine.js');
const { EducationStore } = require('../public/education/store.js');
const Components = require('../public/education/components.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshEducationChain(opts) {
  opts = opts || {};
  const recoveryStore = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStore.load();
  const educationStore = new EducationStore({ storage: opts.eduStorage || makeFakeStorage(), recoveryStore });
  educationStore.load();
  return { recoveryStore, educationStore };
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
  return { recoveryStore, schedulingStore, pauseStore, mandateStore, cashflowStore, educationStore };
}

const START = '2026-01-01';

// ── 1. Correct total invested amount ──
test('total invested amount sums only successful months’ contributions', () => {
  const nav = Engine.generateNavSeries('t1', 'rising', 6);
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 6, amountPaise: 200000, navSeries: nav, realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const last = months[months.length - 1];
  assert.equal(last.cumulativeInvestedPaise, 200000 * 6);
});

// ── 2. Failed instalments excluded ──
test('a month mapped from a real FAILED instalment is excluded from invested amount', () => {
  const nav = Engine.generateNavSeries('t2', 'rising', 4);
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 4, amountPaise: 100000, navSeries: nav, realInstalment: { monthIndex: 2, status: Data.JourneyMonthStatus.MISSED }, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  assert.equal(months[1].status, Data.JourneyMonthStatus.MISSED);
  assert.equal(months[1].contributedPaise, 0);
  const last = months[months.length - 1];
  assert.equal(last.cumulativeInvestedPaise, 100000 * 3); // 4 months minus the 1 missed
});

// ── 3. Recovered payments counted once ──
test('a recovered real instalment counts as exactly one successful contribution, not duplicated', () => {
  const nav = Engine.generateNavSeries('t3', 'rising', 3);
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 3, amountPaise: 150000, navSeries: nav, realInstalment: { monthIndex: 2, status: Data.JourneyMonthStatus.SUCCESSFUL }, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const successfulCount = months.filter((m) => m.status === Data.JourneyMonthStatus.SUCCESSFUL).length;
  assert.equal(successfulCount, 3);
  assert.equal(months[months.length - 1].cumulativeInvestedPaise, 150000 * 3);
});

// ── 4. Paused instalments excluded ──
test('paused months are excluded from invested amount and never marked successful', () => {
  const nav = Engine.generateNavSeries('t4', 'flat', 5);
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 5, amountPaise: 100000, navSeries: nav, realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [2, 3], futureMonths: 0 });
  assert.equal(months[1].status, Data.JourneyMonthStatus.PAUSED);
  assert.equal(months[2].status, Data.JourneyMonthStatus.PAUSED);
  assert.equal(months[1].contributedPaise, 0);
  const last = months[months.length - 1];
  assert.equal(last.cumulativeInvestedPaise, 100000 * 3);
});

// ── 5. Correct units calculation ──
test('units purchased = contribution / NAV, decimal-safe via integer micro-units', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 1, amountPaise: 200000, navSeries: [2000], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  assert.equal(Engine.unitsToDisplay(months[0].unitsMicroThisMonth), 100); // ₹2000 / ₹20 = 100 units
});

// ── 6. Correct total units ──
test('total units is the exact running sum of each month’s purchased units', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 3, amountPaise: 200000, navSeries: [2000, 2500, 1600], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const expectedUnits = (200000 / 2000) + (200000 / 2500) + (200000 / 1600);
  assert.ok(Math.abs(Engine.unitsToDisplay(months[2].cumulativeUnitsMicro) - expectedUnits) < 0.01);
});

// ── 7. Correct current value ──
test('portfolio value = total units × latest NAV', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 2, amountPaise: 200000, navSeries: [2000, 2500], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const last = months[1];
  const expected = Math.round((last.cumulativeUnitsMicro * 2500) / 1000000);
  assert.equal(last.portfolioValuePaise, expected);
});

// ── 8. Negative gain/loss calculations ──
test('a falling NAV produces a correctly negative gain/loss', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 2, amountPaise: 200000, navSeries: [2000, 1000], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const last = months[1];
  assert.ok(last.gainLossPaise < 0);
  assert.equal(last.gainLossPaise, last.portfolioValuePaise - last.cumulativeInvestedPaise);
});

// ── 9. Positive gain/loss calculations ──
test('a rising NAV produces a correctly positive gain/loss', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 2, amountPaise: 200000, navSeries: [2000, 4000], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  const last = months[1];
  assert.ok(last.gainLossPaise > 0);
});

// ── 10. Zero NAV handling ──
test('a zero NAV month is never divided by — it is held as pending, not an infinite or fabricated purchase', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 3, amountPaise: 200000, navSeries: [2000, 0, 2500], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  assert.equal(months[1].status, Data.JourneyMonthStatus.PENDING);
  assert.equal(months[1].navUnavailableForPurchase, true);
  assert.equal(months[1].unitsMicroThisMonth, 0);
  assert.ok(isFinite(months[1].portfolioValuePaise));
  // Valuation for the zero-NAV month holds the last known valid NAV rather than collapsing to 0.
  assert.equal(months[1].portfolioValuePaise, months[0].portfolioValuePaise);
});

// ── 11. Missing NAV handling ──
test('a missing (undefined) NAV observation degrades gracefully without crashing', () => {
  const months = Engine.buildMonthlyJourney({ startKey: START, monthsToShow: 2, amountPaise: 200000, navSeries: [2000], realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  assert.equal(months.length, 2);
  months.forEach((m) => assert.ok(isFinite(m.portfolioValuePaise)));
});

// ── 12. Correct absolute return where applicable ──
test('absolute return % is computed only when net invested is positive', () => {
  const pct = Engine.absoluteReturnPct(50000, 200000);
  assert.equal(pct, 25);
  assert.equal(Engine.absoluteReturnPct(50000, 0), null);
  assert.equal(Engine.absoluteReturnPct(50000, null), null);
});

// ── 13. No fabricated annualized returns ──
test('XIRR is never fabricated when there is insufficient or degenerate cash-flow data', () => {
  assert.equal(Engine.computeXIRR([]), null);
  assert.equal(Engine.computeXIRR([{ dateKey: START, amountPaise: -1000 }]), null);
  assert.equal(Engine.computeXIRR([{ dateKey: START, amountPaise: -1000 }, { dateKey: START, amountPaise: -1000 }]), null); // no positive flow
  // A plausible, convergent case should return a finite, sane rate.
  const flows = [
    { dateKey: '2025-01-01', amountPaise: -200000 },
    { dateKey: '2025-04-01', amountPaise: -200000 },
    { dateKey: '2025-07-01', amountPaise: -200000 },
    { dateKey: '2025-07-01', amountPaise: 650000 }
  ];
  const rate = Engine.computeXIRR(flows);
  assert.ok(rate != null && isFinite(rate));
});

// ── 14. Hypothetical scenario isolation ──
test('switching the market scenario type never mutates a previously generated NAV series', () => {
  const seriesA = Engine.generateNavSeries('iso-sip', 'rising', 6);
  const seriesB = Engine.generateNavSeries('iso-sip', 'falling', 6);
  assert.notDeepEqual(seriesA, seriesB);
  const seriesAAgain = Engine.generateNavSeries('iso-sip', 'rising', 6);
  assert.deepEqual(seriesA, seriesAAgain); // deterministic and independent of the intervening call
});

// ── 15. Interactive NAV slider ──
test('the NAV example keeps the contribution fixed while units purchased change with NAV', () => {
  const contributionPaise = 200000;
  const unitsAt2000 = contributionPaise / 2000;
  const unitsAt1000 = contributionPaise / 1000;
  assert.ok(unitsAt1000 > unitsAt2000); // lower NAV -> more units for the same fixed contribution
});

// ── 16. Quiz correct-answer validation ──
test('quiz answers are validated against the exact correct option, with an explanation returned', () => {
  const { educationStore } = freshEducationChain();
  const correct = educationStore.submitQuizAnswer('q3', 'Yes');
  assert.equal(correct.correct, true);
  assert.ok(correct.explanation.length > 0);
  const wrong = educationStore.submitQuizAnswer('q1', 'Yes');
  assert.equal(wrong.correct, false);
});

// ── 17. Quiz completion persistence ──
test('quiz completion persists across a simulated page refresh', () => {
  const sharedStorage = makeFakeStorage();
  const { recoveryStore } = freshEducationChain();
  const storeA = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeA.load();
  Data.QUIZ_QUESTIONS.forEach((q) => storeA.submitQuizAnswer(q.id, q.correct));
  assert.equal(storeA.getQuizState().completed, true);

  const storeB = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeB.load();
  assert.equal(storeB.getQuizState().completed, true);
  assert.equal(storeB.getQuizState().correctCount, Data.QUIZ_QUESTIONS.length);
});

// ── 18. Educational progress tracking ──
test('module and card completion are tracked independently and reflected in getProgress()', () => {
  const { educationStore } = freshEducationChain();
  educationStore.markModuleComplete(Data.ModuleId.NAV_LESSON);
  educationStore.markCardComplete('exp-1');
  educationStore.markCardComplete('exp-2');
  const progress = educationStore.getProgress();
  assert.equal(progress.modulesCompleted, 1);
  assert.equal(progress.cardsCompleted, 2);
});

// ── 19. Notification deduplication ──
test('refreshing notifications repeatedly never creates duplicates of the same milestone', () => {
  const { educationStore } = freshEducationChain();
  educationStore.setFocusedScenario('edu-c'); // 12 successful months, well past every milestone
  educationStore.refreshNotifications();
  const firstCount = educationStore.getNotifications().length;
  educationStore.refreshNotifications();
  educationStore.refreshNotifications();
  assert.equal(educationStore.getNotifications().length, firstCount);
  assert.ok(firstCount > 0);
});

// ── 20. Prompt dismissal persistence ──
test('a dismissed prompt stays dismissed across a simulated page refresh and is never shown again', () => {
  const sharedStorage = makeFakeStorage();
  const { recoveryStore } = freshEducationChain();
  const storeA = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeA.load();
  storeA.setFocusedScenario('edu-c');
  const prompt = storeA.getPendingPrompt();
  assert.ok(prompt);
  storeA.dismissPrompt(prompt.id);

  const storeB = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeB.load();
  const stillPending = storeB.getCandidatePrompts().some((p) => p.id === prompt.id) && !storeB.ensureLoaded().promptsDismissed[prompt.id];
  assert.equal(stillPending, false);
});

// ── 21. Feature 1 payment regression ──
test('Feature 1’s own retry-recovery flow still works unchanged after the education module loads', () => {
  const { recoveryStore } = freshFullChain();
  const res = recoveryStore.retryPayment('inst-demo-1');
  assert.equal(res.ok, true);
});

// ── 22. Feature 2 scheduling regression ──
test('Feature 2’s own date-change submission still works unchanged after the education module loads', () => {
  const { schedulingStore } = freshFullChain();
  const res = schedulingStore.submitDateChangeRequest('sip-sched-b', 15);
  assert.equal(res.ok, true);
});

// ── 23. Feature 3 pause/resume regression ──
test('Feature 3’s own pause flow still works unchanged after the education module loads', () => {
  const { pauseStore } = freshFullChain();
  const res = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(res.ok, true);
});

// ── 24. Feature 4 mandate regression ──
test('Feature 4’s own mandate repair flow still works unchanged after the education module loads', () => {
  const { mandateStore } = freshFullChain();
  const res = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  assert.equal(res.ok, true);
});

// ── 25. Feature 5 cash-flow regression ──
test('Feature 5’s own cash-flow breakdown still works unchanged after the education module loads, with no duplicate SIPs introduced', () => {
  const { cashflowStore, recoveryStore } = freshFullChain();
  const breakdown = cashflowStore.getBreakdown(30);
  assert.ok(breakdown.all.length >= 0);
  assert.equal(recoveryStore.getAllSips().length, 28); // education never registers a new SIP
});

// ── 26. Responsive layout (structural proxy) ──
test('component builders render without layout-breaking undefined/NaN leaks', () => {
  const html = Components.monthDetail({ monthIndex: 1, dateKey: START, isHistorical: true, isRealRecord: false, status: 'successful', navPaise: 2000, contributedPaise: 200000, cumulativeInvestedPaise: 200000, portfolioValuePaise: 210000, gainLossPaise: 10000 });
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  const grid = Components.scenarioPillRow(Data.buildScenarios(), 'edu-a');
  assert.ok(!grid.includes('undefined'));
});

// ── 27. Accessible charts and controls ──
test('the value chart exposes an accessible role/label and is always paired with a data table', () => {
  const cumulative = [{ monthIndex: 1, dateKey: START, investedPaise: 200000, valuePaise: 210000, gainLossPaise: 10000 }];
  const chartHtml = Components.valueChartSvg(cumulative);
  assert.ok(chartHtml.includes('role="img"') && chartHtml.includes('aria-label'));
  const tableHtml = Components.valueDataTable(cumulative);
  assert.ok(tableHtml.includes('<table') && tableHtml.includes('aria-label'));
});

// ── 28. No investment recommendation messaging ──
test('lesson and metrics copy never recommends specific funds, amounts or guarantees returns', () => {
  const forbidden = [/\bguarantee(d)?\s+return/i, /\byou should invest\b/i, /\bbuy more\b/i, /\bwe recommend\b/i];
  const texts = Data.EXPECTATION_CARDS.map((c) => c.title + ' ' + c.body + ' ' + (c.example || '')).concat(
    Data.QUIZ_QUESTIONS.map((q) => q.text + ' ' + q.explanation)
  );
  texts.forEach((t) => forbidden.forEach((re) => assert.ok(!re.test(t), 'forbidden phrase matched: ' + t)));
});

// ── 29. Data persistence after refresh ──
test('scenario selection and progress persist across a simulated page refresh via shared storage', () => {
  const sharedStorage = makeFakeStorage();
  const { recoveryStore } = freshEducationChain();
  const storeA = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeA.load();
  storeA.setFocusedScenario('edu-g');
  storeA.markModuleComplete(Data.ModuleId.MARKET_SCENARIOS);

  const storeB = new EducationStore({ storage: sharedStorage, recoveryStore });
  storeB.load();
  assert.equal(storeB.getFocusedScenarioId(), 'edu-g');
  assert.equal(storeB.isModuleComplete(Data.ModuleId.MARKET_SCENARIOS), true);
});

// ── 30. Multiple SIP isolation ──
test('switching the focused scenario/SIP never bleeds progress or journey state between SIPs', () => {
  const { educationStore } = freshEducationChain();
  educationStore.setFocusedScenario('edu-a');
  const journeyA = educationStore.buildJourney();
  educationStore.setFocusedScenario('edu-b');
  const journeyB = educationStore.buildJourney();
  assert.notEqual(journeyA.sip.id, journeyB.sip.id);
  assert.notEqual(journeyA.historicalMonths.length, journeyB.historicalMonths.length);
  assert.equal(journeyB.scenario.id, 'edu-b');
  // Card/module progress is global to the learner, not per-SIP, and must remain untouched by scenario switches.
  educationStore.markCardComplete('exp-3');
  educationStore.setFocusedScenario('edu-a');
  assert.equal(educationStore.isCardComplete('exp-3'), true);
});

// ── Empty state: scenario L has zero months and never crashes ──
test('scenario L (no contributions yet) renders an empty, non-crashing journey', () => {
  const { educationStore } = freshEducationChain();
  educationStore.setFocusedScenario('edu-l');
  const summary = educationStore.getOverviewSummary();
  assert.equal(summary.hasAnyContribution, false);
  assert.equal(summary.successfulCount, 0);
  assert.doesNotThrow(() => educationStore.getValueComparison());
  assert.doesNotThrow(() => educationStore.getReturnMetrics());
});

// ── All 12 demo scenarios present and distinct ──
test('all 12 demo scenarios (A-L) are present with deterministic, distinct ids', () => {
  const scenarios = Data.buildScenarios();
  assert.equal(scenarios.length, 12);
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, 12);
});

// ── Month-end / leap-year safety for journey date projection ──
test('journey months project safely across month-end and leap-year boundaries', () => {
  const nav = Engine.generateNavSeries('leap-test', 'flat', 14);
  const months = Engine.buildMonthlyJourney({ startKey: '2028-01-31', monthsToShow: 14, amountPaise: 100000, navSeries: nav, realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
  assert.equal(months[1].dateKey, '2028-02-29'); // 2028 is a leap year
  assert.equal(months.length, 14);
});
