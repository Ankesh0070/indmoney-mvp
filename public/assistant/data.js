(function (root, factory) {
  var out = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
  else root.AssistantData = out;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var Intent = {
    PAYMENT_FAILURE: 'PAYMENT_FAILURE', SCHEDULE_MISMATCH: 'SCHEDULE_MISMATCH',
    PAUSE_REQUEST: 'PAUSE_REQUEST', MANDATE_PROBLEM: 'MANDATE_PROBLEM',
    CASHFLOW_VISIBILITY: 'CASHFLOW_VISIBILITY', INVESTMENT_EDUCATION: 'INVESTMENT_EDUCATION',
    DISCONTINUATION_INTENT: 'DISCONTINUATION_INTENT', APP_JOURNEY: 'APP_JOURNEY', GENERAL_SIP_SUPPORT: 'GENERAL_SIP_SUPPORT',
    UNKNOWN_INTENT: 'UNKNOWN_INTENT'
  };
  var ResolutionStatus = {
    OPEN: 'Open', GUIDANCE_PROVIDED: 'Guidance Provided', ACTION_STARTED: 'Action Started',
    PENDING_VERIFICATION: 'Pending Verification', RESOLVED: 'Resolved', UNRESOLVED: 'Unresolved',
    ESCALATED: 'Escalated', CLOSED_WITHOUT_RESOLUTION: 'Closed Without Resolution'
  };
  var ROUTES = {};
  ROUTES[Intent.PAYMENT_FAILURE] = { toolId: 'recovery', title: 'Review SIP Recovery', button: 'Open SIP Recovery' };
  ROUTES[Intent.SCHEDULE_MISMATCH] = { toolId: 'scheduling', title: 'Review SIP Schedule', button: 'Review SIP Schedule' };
  ROUTES[Intent.PAUSE_REQUEST] = { toolId: 'pause', title: 'Manage Pause & Resume', button: 'Manage Pause & Resume' };
  ROUTES[Intent.MANDATE_PROBLEM] = { toolId: 'mandate', title: 'Check AutoPay Health', button: 'Check AutoPay Health' };
  ROUTES[Intent.CASHFLOW_VISIBILITY] = { toolId: 'cashflow', title: 'Review SIP Commitments', button: 'Open Cash-Flow Planner' };
  ROUTES[Intent.INVESTMENT_EDUCATION] = { toolId: 'education', title: 'Understand SIP Value Changes', button: 'Understand My SIP Journey' };
  ROUTES[Intent.DISCONTINUATION_INTENT] = { toolId: 'discontinuation', title: 'Manage or Cancel SIP', button: 'Manage or Cancel SIP' };
  ROUTES[Intent.APP_JOURNEY] = { toolId: 'sips', title: 'Explore SIP Tools', button: 'Open My SIPs' };
  ROUTES[Intent.GENERAL_SIP_SUPPORT] = { toolId: 'support', title: 'Get SIP Support', button: 'Contact Support' };

  var SCENARIOS = [
    ['A','My ₹2,000 SIP failed.'], ['B','My salary comes on the 7th but SIP is on the 5th.'],
    ['C',"I cannot afford this month's SIP."], ['D','My AutoPay expired.'],
    ['E','How much SIP amount is due next week?'], ['F','Why is my portfolio showing a loss?'],
    ['G','I want to permanently cancel my SIP.'], ['H','SIP fail ho gaya.'],
    ['I','Salary late aati hai.'], ['J','SIP band karna hai.'],
    ['K','I need help with one of my SIPs.'], ['L','My payment failed but I do not know why.'],
    ['M','My mandate was repaired but payment is still failed.'], ['N','My paused SIP payment did not succeed.'],
    ['O','The provider is unavailable.'], ['P','Which mutual fund should I buy?'],
    ['Q','My SIP failed and my salary comes late.'], ['R','I opened recovery but did not finish.'],
    ['S','My recovered payment is now successful.'], ['T','Clear assistant history only.']
  ].map(function (x, i) { return { id: 'assistant-' + x[0].toLowerCase(), letter: x[0], prompt: x[1], sipId: i === 10 ? null : 'sip-demo-1' }; });
  return { Intent: Intent, ResolutionStatus: ResolutionStatus, ROUTES: ROUTES, SCENARIOS: SCENARIOS };
}));
