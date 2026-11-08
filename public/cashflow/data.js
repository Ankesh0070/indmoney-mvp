/**
 * SIP Cash-Flow Planner — entity definitions, enums and the 12 deterministic
 * demo scenarios (A-L). Dual-exported like Features 1-4's own data.js.
 *
 * Unlike Features 1-4, this feature deliberately seeds almost no new demo
 * SIPs of its own — it is a *visibility* layer over the ~28 SIPs the other
 * four features already registered into the shared RecoveryStore, so every
 * number it shows is "derived from actual project data" by construction.
 * The one piece of state it does own is the user's self-reported
 * CashFlowProfile (income amount, opening cash, expenses) — all monetary
 * fields are stored as integer paise, never floating-point rupees.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.CashFlowData = factory();
})(this, function () {
  'use strict';

  var ExpenseCategory = {
    RENT: 'rent', EMI: 'emi', UTILITIES: 'utilities', GROCERIES: 'groceries', OTHER: 'other'
  };
  var EXPENSE_CATEGORY_LABELS = {
    rent: 'Rent / Housing', emi: 'Loan / EMI', utilities: 'Utilities & Bills',
    groceries: 'Groceries & Essentials', other: 'Other monthly expense'
  };

  var GapStatus = {
    NO_GAP: 'no_gap', ESTIMATED_GAP: 'estimated_gap',
    SAME_DAY_UNCERTAIN: 'same_day_uncertain', INSUFFICIENT_DATA: 'insufficient_data'
  };

  var EventKind = { OPENING: 'opening', INCOME: 'income', EXPENSE: 'expense', SIP: 'sip' };

  var ReminderType = {
    SIP_DUE_SOON: 'sip_due_soon',
    MULTIPLE_SIPS_DUE: 'multiple_sips_due',
    CASH_FLOW_GAP: 'cash_flow_gap',
    MISSING_INFO: 'missing_info',
    SCHEDULE_CHANGE: 'schedule_change'
  };

  var ActionType = {
    REVIEW_PAYMENT: 'review_payment', REVIEW_DATE: 'review_date',
    REVIEW_PAUSE: 'review_pause', CHECK_AUTOPAY: 'check_autopay', UPDATE_PROFILE: 'update_profile'
  };

  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10); }
  function toPaise(rupees) { return Math.round(rupees * 100); }

  /**
   * Each scenario sets a self-reported CashFlowProfile (opening cash,
   * income amount + optional reuse of Feature 2's income pattern/date,
   * recurring/one-time expenses) and may point at one existing SIP
   * (`focusSipId`, from Features 1-4's own shared demo pool) whose
   * behaviour the scenario is specifically meant to illustrate.
   * `income` here, when present, is applied through Feature 2's own
   * `schedulingStore.setIncome()` — there is only one income-date field
   * in the whole app; this feature never creates a second one.
   */
  function buildScenarios() {
    return [
      {
        id: 'cf-a', label: 'A · Salary after SIP debit (estimated pressure)', shortLabel: 'A: Timing pressure',
        focusSipId: 'sip-demo-1', // Axis Bluechip, ₹2,000 on the 5th
        profile: {
          openingCashPaise: toPaise(1000),
          incomeAmountPaise: toPaise(30000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 7 },
        note: 'Salary is expected on the 7th, but this SIP debits on the 5th — the estimated cash available before the debit may be lower than the instalment.'
      },
      {
        id: 'cf-b', label: 'B · Salary well before SIP (no estimated gap)', shortLabel: 'B: No gap',
        focusSipId: 'sip-sched-b', // Nippon India Large Cap, ₹3,000 on the 10th
        profile: {
          openingCashPaise: toPaise(5000),
          incomeAmountPaise: toPaise(40000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'Salary lands on the 1st, well before the 10th debit — no estimated shortfall with the data provided.'
      },
      {
        id: 'cf-c', label: 'C · Multiple SIPs within one week', shortLabel: 'C: Multiple in a week',
        focusSipId: 'sip-demo-1',
        profile: {
          openingCashPaise: toPaise(10000),
          incomeAmountPaise: toPaise(35000), incomeAmountRangePaise: null,
          recurringExpenses: [{ id: 'exp-c-rent', category: 'rent', label: 'Rent', amountPaise: toPaise(5000), dayOfMonth: 2 }],
          oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'Axis Bluechip (₹2,000, 5th), DSP Flexi Cap (₹2,500, 5th) and SBI Small Cap (₹3,000, 7th) all fall within the same week.'
      },
      {
        id: 'cf-d', label: 'D · Irregular income, incomplete information', shortLabel: 'D: Incomplete info',
        focusSipId: 'sip-sched-c',
        profile: {
          openingCashPaise: null,
          incomeAmountPaise: null, incomeAmountRangePaise: null,
          recurringExpenses: [{ id: 'exp-d-groc', category: 'groceries', label: 'Groceries', amountPaise: toPaise(3000), dayOfMonth: 3 }],
          oneTimeExpenses: []
        },
        income: { pattern: 'irregular' },
        note: 'Income is irregular and no opening cash estimate has been entered — commitments are still shown, but no gap is fabricated.'
      },
      {
        id: 'cf-e', label: 'E · Unexpected one-time expense', shortLabel: 'E: One-time expense',
        focusSipId: 'sip-demo-4',
        profile: {
          openingCashPaise: toPaise(12000),
          incomeAmountPaise: toPaise(30000), incomeAmountRangePaise: null,
          recurringExpenses: [],
          oneTimeExpenses: [{ id: 'exp-e-medical', label: 'Unexpected medical expense', amountPaise: toPaise(10000), dayOffsetFromToday: 4 }]
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'A ₹10,000 unplanned expense a few days out visibly dents the projected cash position.'
      },
      {
        id: 'cf-f', label: 'F · Two SIPs on the same calendar date', shortLabel: 'F: Same-date SIPs',
        focusSipId: 'sip-demo-2',
        companionSipId: 'sip-sched-b', // both debit on the 10th
        profile: {
          openingCashPaise: toPaise(20000),
          incomeAmountPaise: toPaise(50000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'Mirae Asset Large Cap (₹5,000) and Nippon India Large Cap (₹3,000) both debit on the 10th — shown as one grouped day total, never double-counted.'
      },
      {
        id: 'cf-g', label: 'G · One SIP effectively paused', shortLabel: 'G: Paused excluded',
        focusSipId: 'sip-sched-d', // Quant Active Fund — already paused via Feature 3's own demo seed
        profile: {
          openingCashPaise: toPaise(8000),
          incomeAmountPaise: toPaise(25000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'This SIP is effectively paused in Feature 3 — its skipped cycles are excluded from upcoming commitments until the resumption date.'
      },
      {
        id: 'cf-h', label: 'H · Pending Feature 2 date-change request', shortLabel: 'H: Pending date change',
        focusSipId: 'sip-sched-g', // Canara Robeco Bluechip — requiresReauth capability
        seedPendingDateChange: { sipId: 'sip-sched-g', requestedDay: 12 },
        profile: {
          openingCashPaise: toPaise(9000),
          incomeAmountPaise: toPaise(26000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'A debit-date change is pending in Feature 2 but not yet approved and effective — the currently effective date keeps being used here.'
      },
      {
        id: 'cf-i', label: 'I · Mandate invalid, cash estimate sufficient', shortLabel: 'I: Mandate issue',
        focusSipId: 'sip-mandate-b', // HDFC Top 100 — revoked mandate in Feature 4
        profile: {
          // Deliberately generous: this scenario demonstrates that a mandate problem is flagged
          // separately from cash-flow gaps, so the opening cash here must comfortably clear every
          // other real SIP in the shared pool that lands before this fund's own debit date too —
          // not just this one fund's amount.
          openingCashPaise: toPaise(150000),
          incomeAmountPaise: toPaise(40000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'Projected cash is comfortably sufficient, but this SIP’s AutoPay mandate is revoked — flagged as a separate authorization issue, not a cash-flow gap.'
      },
      {
        id: 'cf-j', label: 'J · Missing opening cash estimate', shortLabel: 'J: No opening cash',
        focusSipId: 'sip-sched-c',
        profile: {
          openingCashPaise: null,
          incomeAmountPaise: toPaise(20000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'No opening cash estimate is on record — known commitments are shown without a fabricated projected balance.'
      },
      {
        id: 'cf-k', label: 'K · Variable salary date overlapping a SIP', shortLabel: 'K: Variable overlap',
        focusSipId: 'sip-demo-5', // HDFC Mid Cap, 15th
        profile: {
          openingCashPaise: toPaise(6000),
          incomeAmountPaise: toPaise(28000), incomeAmountRangePaise: [toPaise(26000), toPaise(30000)],
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'variable', variableStart: 10, variableEnd: 15 },
        note: 'Income is expected anywhere from the 10th to the 15th, overlapping this SIP’s own 15th debit date — shown as uncertain, never a guaranteed match.'
      },
      {
        id: 'cf-l', label: 'L · Try the what-if simulator (no actual change)', shortLabel: 'L: What-if only',
        focusSipId: 'sip-sched-c',
        profile: {
          openingCashPaise: toPaise(7000),
          incomeAmountPaise: toPaise(32000), incomeAmountRangePaise: null,
          recurringExpenses: [], oneTimeExpenses: []
        },
        income: { pattern: 'fixed', fixedDay: 1 },
        note: 'Use the What-If Simulator from here to preview a different income date or amount — your actual SIP schedule is never touched.'
      }
    ];
  }

  return {
    ExpenseCategory: ExpenseCategory, EXPENSE_CATEGORY_LABELS: EXPENSE_CATEGORY_LABELS,
    GapStatus: GapStatus, EventKind: EventKind, ReminderType: ReminderType, ActionType: ActionType,
    buildScenarios: buildScenarios, uid: uid, toPaise: toPaise
  };
});
