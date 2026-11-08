/**
 * SIP Continuity Insights — analytics event names and demo metrics
 * dashboard. Every number here is computed from this prototype session's
 * own simulated demo state; nothing here is presented as proof of real
 * retention impact, and real month-12 SIP activity is kept as a separate,
 * un-conflated outcome from "voluntary continuation" (never label someone
 * retained solely because they abandoned the flow or left the app).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.DiscontinuationAnalytics = factory();
})(this, function () {
  'use strict';

  var Events = {
    STARTED: 'sip_discontinuation_started',
    FEEDBACK_SHOWN: 'discontinuation_feedback_shown',
    REASON_SELECTED: 'discontinuation_reason_selected',
    FEEDBACK_SUBMITTED: 'discontinuation_feedback_submitted',
    FEEDBACK_SKIPPED: 'discontinuation_feedback_skipped',
    HELP_SHOWN: 'contextual_help_shown',
    HELP_OPENED: 'contextual_help_opened',
    HELP_DISMISSED: 'contextual_help_dismissed',
    CANCELLATION_CONTINUED: 'cancellation_continued',
    CANCELLATION_REQUESTED: 'cancellation_requested',
    CANCELLATION_EFFECTIVE: 'cancellation_effective',
    CANCELLATION_REJECTED: 'cancellation_rejected',
    USER_RETAINED: 'user_explicitly_chose_to_continue_sip',
    FEEDBACK_DELETED: 'feedback_deleted'
  };

  function track(store, name, props) { store.emit(name, props || {}); }

  function pct(num, den) { return den > 0 ? Math.round((num / den) * 1000) / 10 : 0; }

  function computeMetrics(store, recoveryStore) {
    var summary = store.getAnalyticsSummary();
    var failureRate = 0, month12ActivityPct = 0;
    if (recoveryStore) {
      var all = recoveryStore.getAllInstalmentsWithSip ? recoveryStore.getAllInstalmentsWithSip() : [];
      var failed = all.filter(function (r) { return r.instalment && r.instalment.status === 'failed'; });
      failureRate = pct(failed.length, all.length);

      var sips = recoveryStore.getAllSips();
      var today = new Date();
      var activeSips = sips.filter(function (sip) {
        var insts = recoveryStore.getInstalmentsForSip(sip.id);
        return insts.some(function (i) {
          if (i.status !== 'success' && i.status !== 'recovered') return false;
          var at = i.recoveredAt || i.scheduledDate;
          if (!at) return false;
          var days = (today - new Date(at)) / 86400000;
          return days >= 0 && days <= 30;
        });
      });
      month12ActivityPct = pct(activeSips.length, sips.length);
    }

    return {
      demo: true, asOf: new Date().toISOString(),
      totalStarted: summary.totalStarted,
      feedbackResponseRatePct: summary.rates.feedbackResponseRate != null ? Math.round(summary.rates.feedbackResponseRate * 1000) / 10 : null,
      helpEngagementRatePct: summary.rates.helpEngagementRate != null ? Math.round(summary.rates.helpEngagementRate * 1000) / 10 : null,
      voluntaryContinuationRatePct: summary.rates.voluntaryContinuationRate != null ? Math.round(summary.rates.voluntaryContinuationRate * 1000) / 10 : null,
      reasonsSelected: summary.reasonsSelected,
      helpShown: summary.helpShown, helpOpened: summary.helpOpened,
      cancellationRequestsSubmitted: summary.cancellationRequestsSubmitted,
      cancellationsEffective: summary.cancellationsEffective,
      retainedVoluntarily: summary.retainedVoluntarily,
      skippedFeedback: summary.skippedFeedback,
      paymentFailureRatePct: failureRate,
      month12SipActivityPct: month12ActivityPct,
      note: 'DEMO DATA — all figures are computed from this prototype session only. They do not measure or prove real-world retention impact, and correlations shown here are not causal claims.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
