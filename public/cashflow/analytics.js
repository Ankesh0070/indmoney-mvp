/**
 * SIP Cash-Flow Planner — analytics event names and demo metrics dashboard.
 * Every number here is computed from this single prototype session's own
 * demo state; nothing here is presented as proof of real retention impact.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.CashFlowAnalytics = factory();
})(this, function () {
  'use strict';

  var Events = {
    PLANNER_OPENED: 'cashflow_planner_opened',
    SETUP_STARTED: 'cashflow_setup_started',
    SETUP_COMPLETED: 'cashflow_setup_completed',
    UPCOMING_COMMITMENTS_VIEWED: 'upcoming_commitments_viewed',
    CALENDAR_VIEWED: 'cashflow_calendar_viewed',
    GAP_IDENTIFIED: 'cashflow_gap_identified',
    WHATIF_STARTED: 'whatif_simulation_started',
    WHATIF_COMPLETED: 'whatif_simulation_completed',
    ACTION_SELECTED: 'cashflow_action_selected',
    REMINDER_ENABLED: 'commitment_reminder_enabled'
  };

  function track(store, name, props) { store.emit(name, props || {}); }

  function countEvents(store, name) {
    return store.ensureLoaded().analyticsEvents.filter(function (e) { return e.name === name; }).length;
  }

  function pct(num, den) { return den > 0 ? Math.round((num / den) * 1000) / 10 : 0; }

  function computeMetrics(store, recoveryStore) {
    var opened = countEvents(store, Events.PLANNER_OPENED);
    var setupStarted = countEvents(store, Events.SETUP_STARTED);
    var setupCompleted = countEvents(store, Events.SETUP_COMPLETED);
    var commitmentsViewed = countEvents(store, Events.UPCOMING_COMMITMENTS_VIEWED);
    var calendarViewed = countEvents(store, Events.CALENDAR_VIEWED);
    var whatifStarted = countEvents(store, Events.WHATIF_STARTED);
    var whatifCompleted = countEvents(store, Events.WHATIF_COMPLETED);
    var actionSelected = countEvents(store, Events.ACTION_SELECTED);
    var reminderEnabled = countEvents(store, Events.REMINDER_ENABLED);

    var projection = store.getCurrentProjection(30);
    var withData = projection.gapAnalysis.filter(function (g) { return g.status !== 'insufficient_data'; });
    var gapDays = withData.filter(function (g) { return g.status === 'estimated_gap'; });
    var gapIncidence = pct(gapDays.length, withData.length);

    var failureRate = 0, activeShare = 0;
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
      activeShare = pct(activeSips.length, sips.length);
    }

    return {
      demo: true,
      asOf: new Date().toISOString(),
      adoption: { plannerOpened: opened },
      setupCompletionRate: pct(setupCompleted, setupStarted),
      calendarEngagement: calendarViewed,
      shareReviewingCommitments: pct(commitmentsViewed, opened),
      gapIncidencePct: gapIncidence,
      whatifUsage: { started: whatifStarted, completed: whatifCompleted },
      actionCenterClickThroughPct: pct(actionSelected, opened),
      reminderOptIns: reminderEnabled,
      paymentFailureRatePct: failureRate,
      month12SipActivityPct: activeShare,
      note: 'DEMO DATA — all figures are computed from this prototype session only. They do not measure or prove real-world retention impact.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
