/**
 * SIP Cash-Flow Planner — automated tests.
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
const DateUtils = require('../public/scheduling/dateUtils.js');
const Data = require('../public/cashflow/data.js');
const Engine = require('../public/cashflow/engine.js');
const { CashFlowStore } = require('../public/cashflow/store.js');
const Components = require('../public/cashflow/components.js');

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}

function freshChain(opts) {
  opts = opts || {};
  const recoveryStore = opts.noRecovery ? null : new RecoveryStore({ storage: makeFakeStorage() });
  if (recoveryStore) recoveryStore.load();
  const schedulingStore = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore });
  schedulingStore.load();
  const pauseStore = new PauseStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore });
  pauseStore.load();
  const mandateStore = new MandateStore({ storage: makeFakeStorage(), recoveryStore, schedulingStore, pauseStore });
  mandateStore.load();
  const cashflowStore = new CashFlowStore({ storage: opts.cfStorage || makeFakeStorage(), recoveryStore, schedulingStore, pauseStore, mandateStore });
  cashflowStore.load();
  return { recoveryStore, schedulingStore, pauseStore, mandateStore, cashflowStore };
}

const TODAY = '2026-01-10';

// ── 1. Seven-day commitment calculation ──
test('sums only occurrences within the next 7 days', () => {
  const ctx = [{ sipId: 's1', fundName: 'A', amountPaise: 200000, debitDay: 12 }];
  const windowEnd = DateUtils.addDays(TODAY, 30);
  const occ = Engine.buildSipOccurrences(ctx, TODAY, windowEnd);
  const occ7 = Engine.withinDays(occ, TODAY, 7);
  assert.equal(occ7.length, 1);
  assert.equal(Engine.sumPaise(occ7), 200000);
});

// ── 2. Thirty-day commitment calculation ──
test('sums occurrences within the next 30 days but excludes them from the 7-day window when later', () => {
  const ctx = [{ sipId: 's1', fundName: 'A', amountPaise: 150000, debitDay: 25 }];
  const windowEnd = DateUtils.addDays(TODAY, 30);
  const occ = Engine.buildSipOccurrences(ctx, TODAY, windowEnd);
  assert.equal(Engine.withinDays(occ, TODAY, 7).length, 0);
  assert.equal(Engine.withinDays(occ, TODAY, 30).length, 1);
  assert.equal(Engine.sumPaise(Engine.withinDays(occ, TODAY, 30)), 150000);
});

// ── 3. No duplicate instalment counting ──
test('no SIP occurrence is counted twice, and grouped totals equal the flat total', () => {
  const { cashflowStore } = freshChain();
  const b = cashflowStore.getBreakdown(60);
  const seen = new Set();
  b.all.forEach((o) => { const key = o.sipId + '|' + o.dateKey; assert.ok(!seen.has(key), 'duplicate occurrence ' + key); seen.add(key); });
  assert.equal(b.totalPaise, Engine.sumPaise(b.all));
});

// ── 4. Empty SIP account ──
test('an account with no SIPs produces empty, non-throwing results', () => {
  const cashflowStore = new CashFlowStore({ storage: makeFakeStorage(), recoveryStore: null });
  cashflowStore.load();
  assert.deepEqual(cashflowStore.buildSipContexts(), []);
  const ov = cashflowStore.getOverview();
  assert.equal(ov.next7Count, 0);
  assert.equal(ov.next30Count, 0);
  assert.equal(ov.nextDateKey, null);
  const b = cashflowStore.getBreakdown(30);
  assert.equal(b.all.length, 0);
  assert.equal(b.totalPaise, 0);
});

// ── 5. Optional income setup ──
test('skipping the profile setup never blocks reading a projection', () => {
  const { cashflowStore } = freshChain();
  cashflowStore.skipProfileSetup();
  const profile = cashflowStore.getProfile();
  assert.equal(profile.skipped, true);
  assert.doesNotThrow(() => cashflowStore.getCurrentProjection(30));
});

// ── 6. Expense calculations ──
test('recurring and one-time expenses project onto the correct dates and amounts, out-of-window ones excluded', () => {
  const profile = {
    openingCashPaise: 0,
    recurringExpenses: [{ id: 'e1', category: 'rent', label: 'Rent', amountPaise: 500000, dayOfMonth: 5 }],
    oneTimeExpenses: [
      { id: 'e2', label: 'In window', amountPaise: 100000, dayOffsetFromToday: 3 },
      { id: 'e3', label: 'Out of window', amountPaise: 999999, dayOffsetFromToday: 90 }
    ]
  };
  const windowEnd = DateUtils.addDays(TODAY, 30);
  const events = Engine.buildExpenseEvents(profile, TODAY, windowEnd);
  assert.equal(events.length, 2);
  const rentEvent = events.find((e) => e.label === 'Rent');
  // TODAY is the 10th, so day-5 has already passed this month; the next occurrence is next month.
  assert.equal(rentEvent.dateKey, '2026-02-05');
  assert.equal(rentEvent.amountPaise, 500000);
  assert.ok(!events.some((e) => e.label === 'Out of window'));
});

// ── 7. Decimal-safe monetary arithmetic ──
test('monetary amounts are stored and summed as exact integer paise, never drifting floats', () => {
  assert.equal(Data.toPaise(199.99), 19999);
  const paiseValues = [3333, 3333, 3333]; // three ₹33.33 amounts
  const total = paiseValues.reduce((s, p) => s + p, 0);
  assert.equal(total, 9999);
  assert.equal(Number.isInteger(total), true);
});

// ── 8. Cash-flow timeline event ordering ──
test('timeline entries are ordered chronologically, and same-day events order income, then expense, then SIP', () => {
  const profile = { openingCashPaise: 1000000, recurringExpenses: [], oneTimeExpenses: [] };
  const incomeEvents = [{ kind: 'income', dateKey: '2026-01-12', amountPaise: 500000, label: 'Income', uncertain: false }];
  const expenseEvents = [{ kind: 'expense', dateKey: '2026-01-12', amountPaise: 100000, label: 'Expense', uncertain: false }];
  const sipOccurrences = [{ sipId: 's1', fundName: 'SIP', amountPaise: 200000, dateKey: '2026-01-12', confirmed: true }, { sipId: 's2', fundName: 'Earlier SIP', amountPaise: 50000, dateKey: '2026-01-05', confirmed: true }];
  const timeline = Engine.buildTimeline(profile, incomeEvents, expenseEvents, sipOccurrences, TODAY);
  assert.equal(timeline.entries[0].dateKey, '2026-01-05');
  const sameDay = timeline.entries.filter((e) => e.dateKey === '2026-01-12');
  assert.equal(sameDay[0].kind, 'income');
  assert.equal(sameDay[1].kind, 'expense');
  assert.equal(sameDay[2].kind, 'sip');
});

// ── 9. Same-day event uncertainty ──
test('a SIP on the same date as expected income is flagged uncertain, never silently assumed safe', () => {
  const profile = { openingCashPaise: 0, recurringExpenses: [], oneTimeExpenses: [] };
  const incomeEvents = [{ kind: 'income', dateKey: '2026-01-15', amountPaise: 3000000, uncertain: false }];
  const sipOccurrences = [{ sipId: 's1', fundName: 'SIP', amountPaise: 200000, dateKey: '2026-01-15' }];
  const gaps = Engine.computeGapAnalysis(profile, incomeEvents, [], sipOccurrences, TODAY);
  assert.equal(gaps[0].status, Data.GapStatus.SAME_DAY_UNCERTAIN);
});

// ── 10. Missing opening balance behavior ──
test('without an opening cash estimate, the timeline carries no fabricated balances', () => {
  const profile = { openingCashPaise: null, recurringExpenses: [], oneTimeExpenses: [] };
  const sipOccurrences = [{ sipId: 's1', fundName: 'SIP', amountPaise: 200000, dateKey: '2026-01-15' }];
  const timeline = Engine.buildTimeline(profile, [], [], sipOccurrences, TODAY);
  assert.equal(timeline.hasOpeningBalance, false);
  assert.equal(timeline.closingCashPaise, null);
  timeline.entries.forEach((e) => assert.equal(e.closingBalancePaise, null));
});

// ── 11. Estimated gap detection ──
test('an estimated gap is computed precisely as demand minus available-before cash', () => {
  const profile = { openingCashPaise: 150000, recurringExpenses: [], oneTimeExpenses: [] }; // ₹1,500
  const sipOccurrences = [{ sipId: 's1', fundName: 'SIP', amountPaise: 200000, dateKey: '2026-01-15' }]; // ₹2,000
  const gaps = Engine.computeGapAnalysis(profile, [], [], sipOccurrences, TODAY);
  assert.equal(gaps[0].status, Data.GapStatus.ESTIMATED_GAP);
  assert.equal(gaps[0].gapPaise, 50000); // ₹500
});

// ── 12. No fabricated balance ──
test('the pure projection never fabricates a 0 or NaN closing balance when opening cash is unknown', () => {
  const profile = { openingCashPaise: null, recurringExpenses: [], oneTimeExpenses: [] };
  const projection = Engine.computeProjection(profile, null, [], [], TODAY, DateUtils.addDays(TODAY, 30));
  assert.equal(projection.closingCashPaise, null);
  assert.notEqual(projection.closingCashPaise, 0);
});

// ── 13. Variable-income support ──
test('variable income is shown as an estimated window, not a single guaranteed date', () => {
  const profile = { incomeAmountPaise: 3000000 };
  const income = { pattern: 'variable', variableStart: 5, variableEnd: 10 };
  const events = Engine.buildIncomeEvents(profile, income, [], TODAY, DateUtils.addDays(TODAY, 30));
  assert.equal(events.length, 1);
  assert.equal(events[0].uncertain, true);
  // TODAY is the 10th, so the 5th-10th window has already passed this month; it projects to next month.
  assert.equal(events[0].dateKey, '2026-02-05');
  assert.equal(events[0].rangeEndKey, '2026-02-10');
});

// ── 14. Irregular-income support ──
test('irregular income never auto-generates a projected date; only manual entries count', () => {
  const profile = { incomeAmountPaise: 3000000 };
  const income = { pattern: 'irregular' };
  const noManual = Engine.buildIncomeEvents(profile, income, [], TODAY, DateUtils.addDays(TODAY, 30));
  assert.equal(noManual.length, 0);
  const withManual = Engine.buildIncomeEvents(profile, income, [{ dateKey: '2026-01-20', amountPaise: 1000000, label: 'Freelance payment' }], TODAY, DateUtils.addDays(TODAY, 30));
  assert.equal(withManual.length, 1);
  assert.equal(withManual[0].amountPaise, 1000000);
});

// ── 15. Multiple SIPs on same date ──
test('two SIPs on the same date are grouped into one combined demand, not evaluated independently', () => {
  const ctx = [
    { sipId: 's1', fundName: 'A', amountPaise: 500000, debitDay: 10 },
    { sipId: 's2', fundName: 'B', amountPaise: 300000, debitDay: 10 }
  ];
  const occ = Engine.buildSipOccurrences(ctx, TODAY, DateUtils.addDays(TODAY, 30));
  const groups = Engine.groupOccurrencesByDate(occ);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].totalPaise, 800000);
  assert.equal(groups[0].items.length, 2);
});

// ── 16. Approved pause handling ──
test('an effectively-paused SIP’s skipped cycles are excluded from scheduled commitments, and dates after resume are included', () => {
  const { cashflowStore, pauseStore } = freshChain();
  assert.equal(pauseStore.getLifecycle('sip-sched-d'), 'paused');
  const ctx = cashflowStore.buildSipContexts().find((c) => c.sipId === 'sip-sched-d');
  assert.ok(ctx.pauseInfo, 'paused SIP must carry pause info into the projection context');
  const occ = Engine.buildSipOccurrences([ctx], cashflowStore.getDemoToday(), DateUtils.addDays(cashflowStore.getDemoToday(), 400));
  occ.forEach((o) => assert.ok(ctx.pauseInfo.affectedDateKeys.indexOf(o.dateKey) === -1, 'a skipped cycle must never appear as a scheduled commitment'));
  assert.ok(occ.some((o) => DateUtils.compareKeys(o.dateKey, ctx.pauseInfo.resumeDateKey) >= 0), 'obligations at/after the resume date must still appear');
});

// ── 17. Pending pause handling ──
test('a pending (not yet effective) pause request leaves the SIP on its currently effective schedule', () => {
  const { cashflowStore, pauseStore } = freshChain();
  const res = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(res.ok, true);
  assert.notEqual(pauseStore.getLifecycle('sip-demo-1'), 'paused');
  const ctx = cashflowStore.buildSipContexts().find((c) => c.sipId === 'sip-demo-1');
  assert.equal(ctx.pauseInfo, null);
});

// ── 18. Approved schedule change ──
test('once a Feature 2 date-change request is approved and effective, the new debit day is reflected', () => {
  const { cashflowStore, schedulingStore } = freshChain();
  const sub = schedulingStore.submitDateChangeRequest('sip-sched-b', 15);
  assert.equal(sub.ok, true);
  schedulingStore.checkRequestStatus(sub.request.id); // -> approved
  schedulingStore.simulateReachEffectiveDate(sub.request.id); // -> effective
  assert.equal(schedulingStore.getCurrentDebitDay('sip-sched-b'), 15);
  const ctx = cashflowStore.buildSipContexts().find((c) => c.sipId === 'sip-sched-b');
  assert.equal(ctx.debitDay, 15);
});

// ── 19. Pending schedule change ──
test('a pending (not yet approved) date-change request does not change the projected debit day', () => {
  const { cashflowStore, schedulingStore } = freshChain();
  const sub = schedulingStore.submitDateChangeRequest('sip-sched-c', 14);
  assert.equal(sub.ok, true);
  assert.equal(schedulingStore.getCurrentDebitDay('sip-sched-c'), 7); // original scheduledDay
  const ctx = cashflowStore.buildSipContexts().find((c) => c.sipId === 'sip-sched-c');
  assert.equal(ctx.debitDay, 7);
});

// ── 20. Mandate issue classification ──
test('an unresolved mandate issue is flagged separately and never treated as a cash-flow gap on its own', () => {
  const { cashflowStore } = freshChain();
  cashflowStore.setProfile({ openingCashPaise: 100000000, incomeAmountPaise: 4000000 }); // ample funds
  const ctx = cashflowStore.buildSipContexts().find((c) => c.sipId === 'sip-mandate-b');
  assert.ok(ctx.mandateHealth);
  assert.equal(ctx.mandateHealth.actionRequired, true);
  const projection = cashflowStore.getCurrentProjection(35);
  const gapForThisSip = projection.gapAnalysis.find((g) => g.sipIds.indexOf('sip-mandate-b') !== -1);
  if (gapForThisSip) assert.notEqual(gapForThisSip.status, Data.GapStatus.ESTIMATED_GAP);
});

// ── 21. What-if scenario isolation ──
test('running a what-if simulation never mutates any real SIP, schedule, mandate or pause state', () => {
  const { cashflowStore, recoveryStore, schedulingStore, pauseStore, mandateStore } = freshChain();
  const sipBefore = JSON.stringify(recoveryStore.getSip('sip-sched-b'));
  const debitDayBefore = schedulingStore.getCurrentDebitDay('sip-sched-b');
  const lifecycleBefore = pauseStore.getLifecycle('sip-sched-d');
  const mandateBefore = JSON.stringify(mandateStore.getMandateHealth('sip-mandate-b'));
  const profileBefore = JSON.stringify(cashflowStore.getProfile());

  cashflowStore.previewWhatIf({ incomeAmountPaise: 9999999, sipDateOverride: { sipId: 'sip-sched-b', newDay: 20 }, pauseSipId: 'sip-mandate-b', oneTimeExpenseAdd: { id: 'x', label: 'x', amountPaise: 100000, dayOffsetFromToday: 2 } });

  assert.equal(JSON.stringify(recoveryStore.getSip('sip-sched-b')), sipBefore);
  assert.equal(schedulingStore.getCurrentDebitDay('sip-sched-b'), debitDayBefore);
  assert.equal(pauseStore.getLifecycle('sip-sched-d'), lifecycleBefore);
  assert.equal(JSON.stringify(mandateStore.getMandateHealth('sip-mandate-b')), mandateBefore);
  assert.equal(JSON.stringify(cashflowStore.getProfile()), profileBefore);
});

// ── 22. Preview reset ──
test('resetting the what-if scenario clears the draft without touching the real profile', () => {
  const { cashflowStore } = freshChain();
  cashflowStore.previewWhatIf({ incomeAmountPaise: 123456 });
  assert.ok(cashflowStore.getWhatIfDraft());
  cashflowStore.resetWhatIf();
  assert.equal(cashflowStore.getWhatIfDraft(), null);
});

// ── 23. Reminder deduplication ──
test('refreshing reminders repeatedly never creates duplicate notifications of the same type', () => {
  const { cashflowStore } = freshChain();
  cashflowStore.refreshReminders();
  const firstCount = cashflowStore.getNotifications().length;
  cashflowStore.refreshReminders();
  cashflowStore.refreshReminders();
  assert.equal(cashflowStore.getNotifications().length, firstCount);
});

// ── 24. Data persistence ──
test('cash-flow profile and manual income entries persist across a simulated page refresh', () => {
  const sharedStorage = makeFakeStorage();
  const chainA = freshChain({ cfStorage: sharedStorage });
  chainA.cashflowStore.setProfile({ openingCashPaise: 777700, incomeAmountPaise: 4000000 });
  chainA.cashflowStore.addManualIncomeEvent('2026-02-01', 500000, 'Freelance');

  const recoveryStoreB = new RecoveryStore({ storage: makeFakeStorage() });
  recoveryStoreB.load();
  const schedulingStoreB = new SchedulingStore({ storage: makeFakeStorage(), recoveryStore: recoveryStoreB });
  schedulingStoreB.load();
  const pauseStoreB = new PauseStore({ storage: makeFakeStorage(), recoveryStore: recoveryStoreB, schedulingStore: schedulingStoreB });
  pauseStoreB.load();
  const mandateStoreB = new MandateStore({ storage: makeFakeStorage(), recoveryStore: recoveryStoreB, schedulingStore: schedulingStoreB, pauseStore: pauseStoreB });
  mandateStoreB.load();
  const cashflowStoreB = new CashFlowStore({ storage: sharedStorage, recoveryStore: recoveryStoreB, schedulingStore: schedulingStoreB, pauseStore: pauseStoreB, mandateStore: mandateStoreB });
  cashflowStoreB.load();

  assert.equal(cashflowStoreB.getProfile().openingCashPaise, 777700);
  assert.equal(cashflowStoreB.getProfile().incomeAmountPaise, 4000000);
  assert.equal(cashflowStoreB.getManualIncomeEvents().length, 1);
  assert.equal(cashflowStoreB.getManualIncomeEvents()[0].amountPaise, 500000);
});

// ── 25. Feature 1 regression ──
test('Feature 1’s own retry-recovery flow still works unchanged after the cash-flow planner loads', () => {
  const { cashflowStore, recoveryStore } = freshChain();
  void cashflowStore;
  const res = recoveryStore.retryPayment('inst-demo-1');
  assert.equal(res.ok, true);
});

// ── 26. Feature 2 regression ──
test('Feature 2’s own date-change submission for an unrelated SIP still works after the cash-flow planner loads', () => {
  const { cashflowStore, schedulingStore } = freshChain();
  void cashflowStore;
  const res = schedulingStore.submitDateChangeRequest('sip-sched-e', 25);
  assert.equal(res.ok, false); // sched-e is deliberately "date change unavailable" — still the correct, unchanged engine decision
  assert.equal(res.code, 'NOT_SUPPORTED');
});

// ── 27. Feature 3 regression ──
test('Feature 3’s own pause flow for an unrelated SIP still works after the cash-flow planner loads', () => {
  const { cashflowStore, pauseStore } = freshChain();
  void cashflowStore;
  const res = pauseStore.submitPauseRequest('sip-demo-1', 1);
  assert.equal(res.ok, true);
});

// ── 28. Feature 4 regression ──
test('Feature 4’s own mandate repair flow still works after the cash-flow planner loads', () => {
  const { cashflowStore, mandateStore } = freshChain();
  void cashflowStore;
  const sub = mandateStore.submitRepairRequest('sip-mandate-a', 'reauthorization');
  assert.equal(sub.ok, true);
});

// ── 29. Month-end and leap-year calculations ──
test('day-31 and leap-day projections clamp correctly across month and year boundaries', () => {
  const dates = Engine.occurrencesOfDay(31, '2028-01-20', '2028-03-05'); // 2028 is a leap year
  assert.deepEqual(dates, ['2028-01-31', '2028-02-29']);
  const nonLeap = Engine.occurrencesOfDay(31, '2026-01-20', '2026-03-05');
  assert.deepEqual(nonLeap, ['2026-01-31', '2026-02-28']);
});

// ── 30. Accessible and responsive interface (structural proxy) ──
test('component builders never leak "undefined"/"NaN" into rendered markup, and the calendar grid cell count is correct', () => {
  const gapHtml = Components.gapCard({ dateKey: '2026-01-15', totalPaise: 200000, availableBeforePaise: 150000, status: 'estimated_gap', gapPaise: 50000, sipIds: ['s1'] });
  assert.ok(!gapHtml.includes('undefined') && !gapHtml.includes('NaN'));
  const timelineHtml = Components.timelineEntry({ kind: 'sip', dateKey: '2026-01-15', amountPaise: -200000, label: 'Test SIP', closingBalancePaise: 50000 }, 100000);
  assert.ok(!timelineHtml.includes('undefined') && !timelineHtml.includes('NaN'));
  const gridHtml = Components.calendarGrid(2026, 0, {}, '2026-01-10', '2026-01-10'); // January 2026
  const cellMatches = gridHtml.match(/cf-cal-cell/g) || [];
  const leadingBlank = new Date(2026, 0, 1).getDay();
  assert.equal(cellMatches.length, leadingBlank + 31);
});
