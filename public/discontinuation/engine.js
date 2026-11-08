/**
 * SIP Continuity Insights — pure calculation/classification helpers. No
 * store access, so these are trivially unit-testable in isolation.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else if (typeof window !== 'undefined') {
    window.DiscontinuationEngine = factory(window.DiscontinuationData);
  }
})(this, function (Data) {
  'use strict';

  var Cat = Data.ReasonCategory;
  var Theme = Data.ResearchTheme;
  var Engine = {};

  var MAX_FREE_TEXT = 500;

  /**
   * Strips control characters, enforces a length cap, and masks runs of 8+
   * digits (optionally space/dash separated) that resemble account, card or
   * mobile numbers — never persisted verbatim, per the "never collect
   * account numbers or credentials" requirement.
   */
  Engine.sanitizeFreeText = function (raw) {
    if (raw == null) return '';
    var s = String(raw).slice(0, MAX_FREE_TEXT * 2); // cap input length before processing
    s = s.replace(/[\u0000-\u001F\u007F]/g, '');
    s = s.replace(/\b(?:\d[ -]?){8,}\b/g, '[redacted number]');
    s = s.trim();
    if (s.length > MAX_FREE_TEXT) s = s.slice(0, MAX_FREE_TEXT);
    return s;
  };

  /** Rule-based, explainable theme classification — no opaque ML/AI. */
  Engine.classifyTheme = function (reasonCategory) {
    switch (reasonCategory) {
      case Cat.FINANCIAL_PRESSURE:
      case Cat.INCOME_IRREGULAR:
        return Theme.CASH_FLOW;
      case Cat.PAYMENT_FAILED:
        return Theme.PAYMENT_RELIABILITY;
      case Cat.DATE_MISMATCH:
        return Theme.SCHEDULING;
      case Cat.AUTOPAY_ISSUE:
        return Theme.MANDATE_ISSUES;
      case Cat.PERFORMANCE_CONCERN:
      case Cat.CONFUSION:
        return Theme.PERFORMANCE_UNDERSTANDING;
      case Cat.APP_DISSATISFACTION:
        return Theme.UX_SUPPORT;
      case Cat.INTENTIONAL_STOP:
        return Theme.INTENTIONAL_CANCELLATION;
      default:
        return Theme.OTHER;
    }
  };

  /** Journeys where the optional feedback prompt was actually shown. */
  function eligibleJourneys(journeys) {
    return journeys.filter(function (j) { return !!j.feedbackShownAt; });
  }

  /** A journey that reached a real conclusion — not one simply abandoned mid-flow. */
  function isTerminal(j) {
    return j.status === Data.JourneyStatus.USER_RETAINED || !!j.cancellationRequestId;
  }

  Engine.computeRates = function (journeys) {
    var eligible = eligibleJourneys(journeys);
    var voluntaryReasons = eligible.filter(function (j) {
      return !j.skippedFeedback && j.reasonCategory && j.reasonCategory !== Cat.PREFER_NOT_TO_SAY;
    });
    var feedbackResponseRate = eligible.length ? voluntaryReasons.length / eligible.length : null;

    var helpShown = journeys.filter(function (j) { return !!j.helpShownAt; });
    var helpOpened = helpShown.filter(function (j) { return !!j.helpOpenedAt; });
    var helpEngagementRate = helpShown.length ? helpOpened.length / helpShown.length : null;

    var completed = journeys.filter(isTerminal);
    var retained = completed.filter(function (j) { return j.status === Data.JourneyStatus.USER_RETAINED; });
    var voluntaryContinuationRate = completed.length ? retained.length / completed.length : null;

    return {
      feedbackResponseRate: feedbackResponseRate, feedbackResponseNum: voluntaryReasons.length, feedbackResponseDen: eligible.length,
      helpEngagementRate: helpEngagementRate, helpEngagementNum: helpOpened.length, helpEngagementDen: helpShown.length,
      voluntaryContinuationRate: voluntaryContinuationRate, voluntaryContinuationNum: retained.length, voluntaryContinuationDen: completed.length
    };
  };

  Engine.buildReasonDistribution = function (journeys) {
    var counts = {};
    var noReason = 0;
    journeys.forEach(function (j) {
      if (j.reasonCategory && j.reasonCategory !== Cat.PREFER_NOT_TO_SAY) {
        counts[j.reasonCategory] = (counts[j.reasonCategory] || 0) + 1;
      } else {
        noReason++;
      }
    });
    var rows = Object.keys(counts).map(function (cat) { return { category: cat, count: counts[cat] }; });
    rows.sort(function (a, b) { return b.count - a.count; });
    return { rows: rows, noReasonGiven: noReason, total: journeys.length };
  };

  Engine.buildFunnel = function (journeys) {
    var stages = [
      { key: 'started', label: 'Journey started', count: journeys.length },
      { key: 'feedbackShown', label: 'Feedback prompt shown', count: journeys.filter(function (j) { return !!j.feedbackShownAt; }).length },
      { key: 'reasonOrSkip', label: 'Responded (reason or skip)', count: journeys.filter(function (j) { return !!j.reasonRespondedAt; }).length },
      { key: 'helpShown', label: 'Contextual help shown', count: journeys.filter(function (j) { return !!j.helpShownAt; }).length },
      { key: 'helpOpened', label: 'Contextual help opened', count: journeys.filter(function (j) { return !!j.helpOpenedAt; }).length },
      { key: 'continued', label: 'Continued to cancellation', count: journeys.filter(function (j) { return !!j.cancellationContinuedAt; }).length },
      { key: 'requested', label: 'Cancellation requested', count: journeys.filter(function (j) { return !!j.cancellationRequestId; }).length }
    ];
    return stages;
  };

  return Engine;
});
