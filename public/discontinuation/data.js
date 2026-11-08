/**
 * SIP Continuity Insights (Feature 7 — SIP Discontinuation Reason Discovery)
 * — entity definitions, enums and demo seed data. Dual-exported: usable as a
 * browser global (window.DiscontinuationData) and via require() from the
 * Node test suite.
 */
(function (root) {
  'use strict';

  var ReasonCategory = {
    FINANCIAL_PRESSURE: 'financial_pressure',
    INCOME_IRREGULAR: 'income_irregular',
    DATE_MISMATCH: 'date_mismatch',
    PAYMENT_FAILED: 'payment_failed',
    AUTOPAY_ISSUE: 'autopay_issue',
    PERFORMANCE_CONCERN: 'performance_concern',
    CONFUSION: 'confusion',
    APP_DISSATISFACTION: 'app_dissatisfaction',
    INTENTIONAL_STOP: 'intentional_stop',
    OTHER: 'other',
    PREFER_NOT_TO_SAY: 'prefer_not_to_say'
  };

  var JourneyStatus = {
    STARTED: 'started',
    FEEDBACK_SHOWN: 'feedback_shown',
    REASON_SELECTED: 'reason_selected',
    FEEDBACK_SUBMITTED: 'feedback_submitted',
    FEEDBACK_SKIPPED: 'feedback_skipped',
    HELP_SHOWN: 'help_shown',
    HELP_OPENED: 'help_opened',
    CANCELLATION_CONTINUED: 'cancellation_continued',
    CANCELLATION_REQUESTED: 'cancellation_requested',
    USER_RETAINED: 'user_retained',
    ABANDONED: 'abandoned'
  };

  var CancellationStatus = {
    REQUESTED: 'requested',
    PENDING_PROVIDER_APPROVAL: 'pending_provider_approval',
    EFFECTIVE: 'effective',
    REJECTED: 'rejected',
    NOT_AVAILABLE: 'not_available',
    UNKNOWN: 'unknown'
  };

  var HelpToolId = {
    PAUSE: 'pause', CASHFLOW: 'cashflow', SCHEDULING: 'scheduling',
    RECOVERY: 'recovery', MANDATE: 'mandate', EDUCATION: 'education',
    SUPPORT: 'support', NONE: 'none'
  };

  var ResearchTheme = {
    CASH_FLOW: 'Cash Flow',
    PAYMENT_RELIABILITY: 'Payment Reliability',
    SCHEDULING: 'Scheduling',
    MANDATE_ISSUES: 'Mandate Issues',
    PERFORMANCE_UNDERSTANDING: 'Performance Understanding',
    UX_SUPPORT: 'UX/Support',
    INTENTIONAL_CANCELLATION: 'Intentional Cancellation',
    OTHER: 'Other'
  };
  var THEMES = [
    ResearchTheme.CASH_FLOW, ResearchTheme.PAYMENT_RELIABILITY, ResearchTheme.SCHEDULING,
    ResearchTheme.MANDATE_ISSUES, ResearchTheme.PERFORMANCE_UNDERSTANDING, ResearchTheme.UX_SUPPORT,
    ResearchTheme.INTENTIONAL_CANCELLATION, ResearchTheme.OTHER
  ];

  // Exact wording and order from the product spec (Screen 2).
  var REASON_OPTIONS = [
    { id: 'reason-1', category: ReasonCategory.FINANCIAL_PRESSURE, label: 'I need money for other expenses.' },
    { id: 'reason-2', category: ReasonCategory.INCOME_IRREGULAR, label: 'My income is irregular or uncertain.' },
    { id: 'reason-3', category: ReasonCategory.DATE_MISMATCH, label: 'The SIP payment date does not work for me.' },
    { id: 'reason-4', category: ReasonCategory.PAYMENT_FAILED, label: 'My SIP payment failed.' },
    { id: 'reason-5', category: ReasonCategory.AUTOPAY_ISSUE, label: 'I am facing an AutoPay or bank authorization problem.' },
    { id: 'reason-6', category: ReasonCategory.PERFORMANCE_CONCERN, label: 'I am concerned about investment performance.' },
    { id: 'reason-7', category: ReasonCategory.CONFUSION, label: 'I do not fully understand how SIPs work.' },
    { id: 'reason-8', category: ReasonCategory.APP_DISSATISFACTION, label: 'I am unhappy with the app or service.' },
    { id: 'reason-9', category: ReasonCategory.INTENTIONAL_STOP, label: 'I no longer want to continue this SIP.' },
    { id: 'reason-10', category: ReasonCategory.OTHER, label: 'Something else.' },
    { id: 'reason-11', category: ReasonCategory.PREFER_NOT_TO_SAY, label: 'Prefer not to say.' }
  ];

  // Screen 3 — optional contextual follow-up per category. Categories not
  // listed here (date mismatch, AutoPay, confusion, intentional stop, other)
  // go straight to the optional free-text field with no preset question.
  var FOLLOWUP_CONFIG = {};
  FOLLOWUP_CONFIG[ReasonCategory.FINANCIAL_PRESSURE] = {
    question: 'Is this a temporary situation, or do you expect it to continue?',
    options: ['Temporary', 'Ongoing', 'Not sure']
  };
  FOLLOWUP_CONFIG[ReasonCategory.INCOME_IRREGULAR] = {
    question: 'Does your income usually arrive on different dates each month?',
    options: ['Yes', 'No', 'Not sure']
  };
  FOLLOWUP_CONFIG[ReasonCategory.PAYMENT_FAILED] = {
    question: 'Were you able to understand why the payment failed?',
    options: ['Yes', 'No', 'Not sure']
  };
  FOLLOWUP_CONFIG[ReasonCategory.PERFORMANCE_CONCERN] = {
    question: 'What would you like to understand better?',
    options: ['Portfolio value', 'Market fluctuations', 'Returns shown', 'Nothing right now']
  };
  FOLLOWUP_CONFIG[ReasonCategory.APP_DISSATISFACTION] = {
    question: 'Which part of the experience could be improved?',
    options: ['Navigation', 'Support', 'Payment process', 'Information clarity', 'Other']
  };

  // Screen 4 — contextual help mapping. null toolId = no personalized
  // intervention is shown by default (uncertain / undisclosed / intentional).
  var HELP_MAPPING = {};
  HELP_MAPPING[ReasonCategory.FINANCIAL_PRESSURE] = {
    toolId: HelpToolId.PAUSE, title: 'SIP Pause & Resume Manager',
    description: 'Temporarily pause this SIP instead of stopping it altogether — you can resume whenever you are ready, with no new commitment required.'
  };
  HELP_MAPPING[ReasonCategory.INCOME_IRREGULAR] = {
    toolId: HelpToolId.CASHFLOW, title: 'SIP Commitment & Cash-Flow Visibility',
    description: 'See how this SIP lines up against your other commitments and upcoming cash flow, so irregular income is easier to plan around.'
  };
  HELP_MAPPING[ReasonCategory.DATE_MISMATCH] = {
    toolId: HelpToolId.SCHEDULING, title: 'Salary-Aligned SIP Scheduling',
    description: 'Move this SIP’s debit date to one that better matches when funds are usually available in your account.'
  };
  HELP_MAPPING[ReasonCategory.PAYMENT_FAILED] = {
    toolId: HelpToolId.RECOVERY, title: 'Failed SIP Recovery System',
    description: 'Review exactly why a recent instalment failed and the options available to resolve it, including retrying the payment.'
  };
  HELP_MAPPING[ReasonCategory.AUTOPAY_ISSUE] = {
    toolId: HelpToolId.MANDATE, title: 'AutoPay & Mandate Repair Assistant',
    description: 'Check the health of this SIP’s AutoPay authorization and repair or renew it if it has expired.'
  };
  HELP_MAPPING[ReasonCategory.PERFORMANCE_CONCERN] = {
    toolId: HelpToolId.EDUCATION, title: 'My First-Year SIP Journey',
    description: 'A neutral explainer on how SIP investing behaves in the short term, including why short-term dips are normal and do not guarantee a loss.'
  };
  HELP_MAPPING[ReasonCategory.CONFUSION] = {
    toolId: HelpToolId.EDUCATION, title: 'My First-Year SIP Journey',
    description: 'A plain-English walkthrough of how SIP contributions, NAV and units work, with a worked example.'
  };
  HELP_MAPPING[ReasonCategory.APP_DISSATISFACTION] = {
    toolId: HelpToolId.SUPPORT, title: 'Support & Feedback',
    description: 'Tell our support team what could be better — a specialist will follow up on the issue you describe.'
  };
  // INTENTIONAL_STOP, OTHER, PREFER_NOT_TO_SAY and "skipped" intentionally
  // have no entry: no personalized intervention is offered by default.

  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10); }
  function inr(n) { return '₹' + Math.round(n || 0).toLocaleString('en-IN'); }

  /**
   * Sixteen demo scenarios (A–P). A–O each seed one fully-played-out
   * discontinuation journey anchored on a real Feature-1 demo SIP; P is a
   * pure "view the aggregated dashboard" shortcut, not a new journey — it
   * demonstrates "multiple cancellation journeys aggregated into a research
   * dashboard" using the other fifteen.
   */
  function buildScenarios() {
    return [
      { id: 'disc-a', letter: 'A', shortLabel: 'Financial difficulty → Pause', sipId: 'sip-demo-1', reasonId: 'reason-1', followUp: 'Temporary', freeText: 'Things are tight this month, hoping to restart soon.', helpOpened: true, outcome: 'pending' },
      { id: 'disc-b', letter: 'B', shortLabel: 'Income instability → Cash-Flow', sipId: 'sip-demo-2', reasonId: 'reason-2', followUp: 'Yes', freeText: 'My salary date keeps shifting.', helpOpened: true, outcome: 'pending' },
      { id: 'disc-c', letter: 'C', shortLabel: 'Debit date mismatch → Scheduling', sipId: 'sip-demo-3', reasonId: 'reason-3', followUp: null, freeText: '', helpOpened: true, outcome: 'effective' },
      { id: 'disc-d', letter: 'D', shortLabel: 'Payment failed → Recovery', sipId: 'sip-demo-4', reasonId: 'reason-4', followUp: 'No', freeText: 'Not sure why it failed.', helpOpened: true, outcome: 'effective' },
      { id: 'disc-e', letter: 'E', shortLabel: 'AutoPay issue → Mandate', sipId: 'sip-demo-5', reasonId: 'reason-5', followUp: null, freeText: '', helpOpened: true, outcome: 'pending' },
      { id: 'disc-f', letter: 'F', shortLabel: 'Returns disappointment → Education', sipId: 'sip-demo-6', reasonId: 'reason-6', followUp: 'Returns shown', freeText: 'It looks like I am losing money.', helpOpened: true, outcome: 'pending' },
      { id: 'disc-g', letter: 'G', shortLabel: 'App dissatisfaction → Support', sipId: 'sip-demo-7', reasonId: 'reason-8', followUp: 'Navigation', freeText: 'The app is confusing to navigate.', helpOpened: true, outcome: 'pending' },
      { id: 'disc-h', letter: 'H', shortLabel: 'Intentional stop, no offer', sipId: 'sip-demo-1', reasonId: 'reason-9', followUp: null, freeText: '', helpOpened: false, outcome: 'pending' },
      { id: 'disc-i', letter: 'I', shortLabel: 'Skips every question', sipId: 'sip-demo-2', reasonId: null, skippedFeedback: true, followUp: null, freeText: '', helpOpened: false, outcome: 'pending' },
      { id: 'disc-j', letter: 'J', shortLabel: 'Prefer not to say', sipId: 'sip-demo-3', reasonId: 'reason-11', followUp: null, freeText: '', helpOpened: false, outcome: 'pending' },
      { id: 'disc-k', letter: 'K', shortLabel: 'Views help, still cancels', sipId: 'sip-demo-4', reasonId: 'reason-5', followUp: null, freeText: '', helpOpened: true, outcome: 'pending' },
      { id: 'disc-l', letter: 'L', shortLabel: 'Reviews help, keeps SIP', sipId: 'sip-demo-5', reasonId: 'reason-1', followUp: 'Temporary', freeText: 'Actually pausing works better for me.', helpOpened: true, outcome: 'retained' },
      { id: 'disc-m', letter: 'M', shortLabel: 'Pending provider approval', sipId: 'sip-demo-6', reasonId: 'reason-10', followUp: null, freeText: '', helpOpened: false, outcome: 'pending' },
      { id: 'disc-n', letter: 'N', shortLabel: 'Rejected by provider', sipId: 'sip-demo-7', reasonId: 'reason-8', followUp: 'Support', freeText: 'Hoping to close this one out.', helpOpened: false, outcome: 'rejected' },
      { id: 'disc-o', letter: 'O', shortLabel: 'Feedback deleted after the fact', sipId: 'sip-demo-3', reasonId: 'reason-1', followUp: 'Ongoing', freeText: 'This note was later deleted by the user.', helpOpened: true, outcome: 'effective', deleteFeedbackAfter: true },
      { id: 'disc-p', letter: 'P', shortLabel: 'View aggregated research dashboard', isAggregateView: true }
    ];
  }

  var api = {
    ReasonCategory: ReasonCategory, JourneyStatus: JourneyStatus, CancellationStatus: CancellationStatus,
    HelpToolId: HelpToolId, ResearchTheme: ResearchTheme, THEMES: THEMES,
    REASON_OPTIONS: REASON_OPTIONS, FOLLOWUP_CONFIG: FOLLOWUP_CONFIG, HELP_MAPPING: HELP_MAPPING,
    buildScenarios: buildScenarios, uid: uid, inr: inr
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DiscontinuationData = api;
})(this);
