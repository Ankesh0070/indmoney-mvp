/**
 * My First-Year SIP Journey — entity definitions, enums and demo seed data.
 * Dual-exported: usable as a browser global (window.EducationData) and via
 * require() from the Node test suite.
 *
 * This feature never owns a second copy of any SIP. Every journey is built
 * from a real, existing SIP record (fund name, amount, start date, and its
 * one real Feature 1 instalment record when present) reused from the shared
 * RecoveryStore. On top of that real anchor, this module adds its own new,
 * clearly-labeled simulated layer — a HypotheticalNAVSeries and the derived
 * InvestmentJourneySnapshot months — since no feature in this app maintains
 * a full real monthly payment ledger for any SIP. Nothing here is ever
 * presented as a verified transaction history or as real market data.
 */
(function (root) {
  'use strict';

  var JourneyMonthStatus = {
    SUCCESSFUL: 'successful',
    MISSED: 'missed',
    PAUSED: 'paused',
    PENDING: 'pending'
  };

  var MarketScenarioType = {
    RISING: 'rising',
    FALLING: 'falling',
    FLAT: 'flat',
    VOLATILE: 'volatile',
    DECLINE_NO_RECOVERY: 'decline_no_recovery'
  };

  var ModuleId = {
    NAV_LESSON: 'nav_lesson',
    MARKET_SCENARIOS: 'market_scenarios',
    RETURN_METRICS: 'return_metrics',
    QUIZ: 'quiz'
  };

  var PromptType = {
    FIRST_INSTALMENT: 'first_instalment',
    NEGATIVE_PERFORMANCE: 'negative_performance',
    VALUE_DETAILS_OPENED: 'value_details_opened',
    THREE_INSTALMENTS: 'three_instalments',
    SIX_MONTHS: 'six_months'
  };

  var NotificationType = {
    NEW_MODULE: 'new_module',
    FIRST_MONTH_EXPLAINER: 'first_month_explainer',
    THREE_MONTH_MILESTONE: 'three_month_milestone',
    SIX_MONTH_MILESTONE: 'six_month_milestone',
    QUIZ_REMINDER: 'quiz_reminder'
  };

  var uidCounter = 0;
  function uid(prefix) { uidCounter += 1; return (prefix || 'edu') + '-' + Date.now().toString(36) + '-' + uidCounter; }

  function toPaise(rupees) { return Math.round(rupees * 100); }

  // ───────────────────────── expectation lesson cards (Screen 6) ─────────────────────────

  var EXPECTATION_CARDS = [
    {
      id: 'exp-1', title: 'Why my portfolio can be negative after several months',
      body: 'A SIP buys mutual fund units at whatever price (NAV) the market offers that month. If the market value of those units falls below what you paid, your portfolio shows an unrealized loss — this is a normal, expected part of investing, not a sign the SIP has "failed".',
      example: 'If you invested ₹10,000 in total and the units you hold are now worth ₹9,200, your unrealized loss is ₹800. That can change again next month.'
    },
    {
      id: 'exp-2', title: 'Difference between invested amount and current market value',
      body: 'Invested amount is simply the sum of every successful instalment you have paid. Current value is what those accumulated units are worth today, based on the fund’s latest NAV. These two numbers are rarely exactly equal.',
      example: null
    },
    {
      id: 'exp-3', title: 'What happens when NAV increases',
      body: 'When NAV rises, each unit you already own is worth more, so your current value tends to rise. The same monthly contribution also buys fewer new units than it would have at a lower NAV.',
      example: null
    },
    {
      id: 'exp-4', title: 'What happens when NAV decreases',
      body: 'When NAV falls, your existing units are worth less today, so your current value tends to fall. The same monthly contribution buys more new units than it would have at a higher NAV.',
      example: null
    },
    {
      id: 'exp-5', title: 'Why SIP returns are not fixed',
      body: 'A SIP is a way of investing regularly — it does not fix, guarantee, or promise any rate of return. The underlying mutual fund’s performance depends on markets, which move up and down for reasons outside any single investor’s control.',
      example: null
    },
    {
      id: 'exp-6', title: 'Why a short observation period can be misleading',
      body: 'A few months of data can show a SIP sharply up or down purely due to short-term market noise. Longer observation periods usually smooth out some of this noise, though they still cannot predict the future.',
      example: null
    },
    {
      id: 'exp-7', title: 'What successful instalments actually mean',
      body: 'A "successful" instalment means the payment was collected and units were purchased on your behalf. It says nothing about whether that month’s investment is currently showing a gain or a loss.',
      example: null
    },
    {
      id: 'exp-8', title: 'What missed instalments mean for contribution history',
      body: 'A missed or failed instalment means no units were purchased that month — it is excluded from your total invested amount. It does not retroactively change any instalment that did succeed.',
      example: null
    },
    {
      id: 'exp-9', title: 'Why market risk cannot be eliminated through SIPs',
      body: 'A SIP spreads your purchases across many dates and prices, which can reduce the impact of investing a lump sum at a single bad moment. It does not remove market risk altogether — your investment can still lose value.',
      example: null
    },
    {
      id: 'exp-10', title: 'Difference between investment education and personalized advice',
      body: 'Everything in this module is general education using simulated numbers. It is not personalized financial advice, and it does not consider your personal goals, risk tolerance, or finances. For that, consider speaking with a qualified financial advisor.',
      example: null
    }
  ];

  // ───────────────────────── quiz (Screen 8) ─────────────────────────

  var QUIZ_QUESTIONS = [
    { id: 'q1', text: 'Does starting a SIP guarantee positive returns?', options: ['Yes', 'No'], correct: 'No', explanation: 'A SIP is a disciplined way to invest regularly — it does not guarantee any particular return. Returns depend on market performance.' },
    { id: 'q2', text: 'If NAV falls, does it always mean the SIP has failed?', options: ['Yes', 'No'], correct: 'No', explanation: 'A falling NAV reflects market movement, not a failed SIP. Your instalment can still succeed (units are purchased) even while NAV is falling.' },
    { id: 'q3', text: 'Can a SIP investment lose value?', options: ['Yes', 'No'], correct: 'Yes', explanation: 'Yes — since a SIP invests in market-linked mutual funds, its current value can fall below the amount invested at any point in time.' },
    { id: 'q4', text: 'Does a successful SIP instalment mean the investment generated profit?', options: ['Yes', 'No'], correct: 'No', explanation: '"Successful" only means the payment was collected and units were bought. Whether that investment is in profit depends on the fund’s current value, which is separate.' },
    { id: 'q5', text: 'Can future returns be predicted with certainty using previous performance?', options: ['Yes', 'No'], correct: 'No', explanation: 'Past performance and hypothetical scenarios do not predict future returns. No one can forecast market movements with certainty.' }
  ];

  // ───────────────────────── 12 demo scenarios (A-L) ─────────────────────────
  // Every scenario reuses a real, existing Feature 1 demo SIP (fundName, amount,
  // startDate, color, and its one real instalment record) as its anchor.
  // `monthsToShow` controls how many months of this feature's own simulated
  // journey are illustrated for that scenario's narrative — independent of
  // however long the underlying real SIP has actually existed.

  function buildScenarios() {
    return [
      {
        id: 'edu-a', label: 'A · Negative after 3 months', shortLabel: 'A: Early dip',
        focusSipId: 'sip-demo-1', monthsToShow: 3, market: MarketScenarioType.FALLING,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'Three simulated monthly contributions of ₹2,000, with a simulated portfolio value that has decreased — a common, expected early-SIP experience.'
      },
      {
        id: 'edu-b', label: 'B · Rising over 6 months', shortLabel: 'B: Rising value',
        focusSipId: 'sip-demo-4', monthsToShow: 6, market: MarketScenarioType.RISING,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'Six simulated monthly contributions of ₹3,000, with a simulated portfolio value that has increased.'
      },
      {
        id: 'edu-c', label: 'C · Twelve successful months', shortLabel: 'C: Full year',
        focusSipId: 'sip-demo-2', monthsToShow: 12, market: MarketScenarioType.RISING,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'Twelve simulated successful monthly instalments — a complete illustrated first year.'
      },
      {
        id: 'edu-d', label: 'D · Two missed payments', shortLabel: 'D: Missed months',
        focusSipId: 'sip-demo-5', monthsToShow: 12, market: MarketScenarioType.RISING,
        injectedMissedMonths: [4, 8], injectedPausedMonths: [],
        note: 'This SIP’s real Feature 1 instalment record is reflected at its real calendar position; two further months are illustrated as missed to show how missed instalments affect total invested amount.'
      },
      {
        id: 'edu-e', label: 'E · Paused then resumed', shortLabel: 'E: Paused SIP',
        focusSipId: 'sip-demo-6', monthsToShow: 7, market: MarketScenarioType.FLAT,
        injectedMissedMonths: [], injectedPausedMonths: [3, 4],
        note: 'Two simulated paused months, distinct from missed instalments, followed by a resume — paused cycles are never counted as successful.'
      },
      {
        id: 'edu-f', label: 'F · Nearly flat value', shortLabel: 'F: Flat value',
        focusSipId: 'sip-demo-3', monthsToShow: 9, market: MarketScenarioType.FLAT,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'A simulated portfolio value that stays close to the total amount invested.'
      },
      {
        id: 'edu-g', label: 'G · Significant volatility', shortLabel: 'G: Volatile',
        focusSipId: 'sip-demo-7', monthsToShow: 5, market: MarketScenarioType.VOLATILE,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'A simulated NAV series with large month-to-month swings, to illustrate volatility.'
      },
      {
        id: 'edu-h', label: 'H · Only one instalment', shortLabel: 'H: Just started',
        focusSipId: 'sip-demo-7', monthsToShow: 1, market: MarketScenarioType.FALLING,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'Only one simulated completed instalment so far — too little data for any annualized return figure.'
      },
      {
        id: 'edu-i', label: 'I · Invested vs current value', shortLabel: 'I: Compare value',
        focusSipId: 'sip-demo-2', monthsToShow: 8, market: MarketScenarioType.RISING,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'A clear, explorable gap between cumulative amount invested and simulated current value.'
      },
      {
        id: 'edu-j', label: 'J · All modules complete', shortLabel: 'J: Completionist',
        focusSipId: 'sip-demo-4', monthsToShow: 12, market: MarketScenarioType.RISING,
        injectedMissedMonths: [], injectedPausedMonths: [], autoCompleteAll: true,
        note: 'Demonstrates the Learning Progress dashboard once every module and the quiz are complete.'
      },
      {
        id: 'edu-k', label: 'K · Dismissible prompt', shortLabel: 'K: Prompt demo',
        focusSipId: 'sip-demo-5', monthsToShow: 6, market: MarketScenarioType.FLAT,
        injectedMissedMonths: [], injectedPausedMonths: [], ensurePromptPending: true,
        note: 'Demonstrates a contextual educational prompt that can be dismissed.'
      },
      {
        id: 'edu-l', label: 'L · No contributions yet', shortLabel: 'L: Empty state',
        focusSipId: 'sip-demo-3', monthsToShow: 0, market: MarketScenarioType.FLAT,
        injectedMissedMonths: [], injectedPausedMonths: [],
        note: 'No successful contributions yet — shows the empty state.'
      }
    ];
  }

  var EducationData = {
    JourneyMonthStatus: JourneyMonthStatus,
    MarketScenarioType: MarketScenarioType,
    ModuleId: ModuleId,
    PromptType: PromptType,
    NotificationType: NotificationType,
    EXPECTATION_CARDS: EXPECTATION_CARDS,
    QUIZ_QUESTIONS: QUIZ_QUESTIONS,
    uid: uid,
    toPaise: toPaise,
    buildScenarios: buildScenarios
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = EducationData;
  else if (typeof window !== 'undefined') window.EducationData = EducationData;
})(this);
