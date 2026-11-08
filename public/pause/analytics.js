/**
 * SIP Pause & Resume Manager — analytics event catalogue + demo metrics.
 * All numbers are computed from this demo session's own event log and
 * simulated-provider outcomes, never from a real user base — every metric
 * returned by computeMetrics() carries demo: true and must be labelled as
 * SIMULATED wherever it is rendered. Kept separate from Feature 2's
 * scheduling analytics (own event namespace, own storage key).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  else if (typeof window !== 'undefined') window.PauseAnalytics = factory(window.PauseData, window.SchedulingDateUtils);
})(this, function (Data, DateUtils) {
  'use strict';

  var Events = {
    ELIGIBILITY_CHECKED: 'sip_pause_eligibility_checked',
    FLOW_STARTED: 'sip_pause_flow_started',
    DURATION_SELECTED: 'sip_pause_duration_selected',
    REQUEST_SUBMITTED: 'sip_pause_request_submitted',
    REQUEST_APPROVED: 'sip_pause_request_approved',
    REQUEST_REJECTED: 'sip_pause_request_rejected',
    PAUSE_EFFECTIVE: 'sip_pause_effective',
    RESUME_REMINDER_VIEWED: 'sip_resume_reminder_viewed',
    EARLY_RESUME_REQUESTED: 'sip_early_resume_requested',
    RESUME_APPROVED: 'sip_resume_approved',
    RESUME_EFFECTIVE: 'sip_resume_effective',
    POST_RESUME_PAYMENT_SUCCEEDED: 'sip_post_resume_payment_succeeded',
    POST_RESUME_PAYMENT_FAILED: 'sip_post_resume_payment_failed'
  };

  function track(store, name, props) { store.emit(name, props || {}); }

  function distinctProp(events, name, key) {
    var seen = {};
    events.forEach(function (e) { if (e.name === name && e.props && e.props[key] !== undefined) seen[e.props[key]] = true; });
    return Object.keys(seen);
  }
  function pct(numerator, denominator) {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }
  function median(nums) {
    if (!nums.length) return null;
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }

  /**
   * Computes the Screen "Product Analytics Dashboard" summary. `store` is a
   * loaded PauseStore; `recoveryStore` is the shared Feature 1 RecoveryStore.
   */
  function computeMetrics(store, recoveryStore) {
    var state = store.ensureLoaded();
    var events = state.analyticsEvents;
    var today = store.getDemoToday();

    var allSips = recoveryStore.getAllSips();
    var eligibleSips = allSips.filter(function (s) { var c = store.getCapability(s.id); return c && c.pauseSupported; });

    var flowStartedSips = distinctProp(events, Events.FLOW_STARTED, 'sipId');
    var adoptionRate = pct(flowStartedSips.length, eligibleSips.length);

    var submittedCount = state.pauseRequests.length;
    var completionRate = pct(submittedCount, Math.max(flowStartedSips.length, submittedCount) || 0);

    var decided = state.pauseRequests.filter(function (r) { return r.status === 'approved' || r.status === 'rejected' || r.status === 'effective'; });
    var approvedOrEffective = decided.filter(function (r) { return r.status === 'approved' || r.status === 'effective'; });
    var approvalRate = pct(approvedOrEffective.length, decided.length);

    var medianDuration = median(approvedOrEffective.map(function (r) { return r.requestedCycles; }));

    var effectivePauses = state.pauseRequests.filter(function (r) { return r.status === 'effective'; });
    var sipsWithResumeRequest = {};
    state.resumeRequests.forEach(function (r) { sipsWithResumeRequest[r.sipId] = true; });
    var effectivePauseSips = {};
    effectivePauses.forEach(function (r) { effectivePauseSips[r.sipId] = true; });
    var resumeRequestRate = pct(Object.keys(sipsWithResumeRequest).length, Object.keys(effectivePauseSips).length);

    var resumedEffectiveSips = {};
    state.resumeRequests.filter(function (r) { return r.status === 'effective'; }).forEach(function (r) { resumedEffectiveSips[r.sipId] = true; });
    var effectiveResumptionRate = pct(Object.keys(resumedEffectiveSips).length, Object.keys(effectivePauseSips).length);

    var permanentDiscontinuation = pct(
      Object.keys(effectivePauseSips).length - Object.keys(resumedEffectiveSips).length,
      Object.keys(effectivePauseSips).length
    );

    // Post-resume first-instalment success, only counting sips whose 30-day observation window is complete.
    var completeWindowSips = [];
    var incompleteWindowCount = 0;
    Object.keys(state.firstPostResumeInstalment).forEach(function (sipId) {
      var resumeReq = state.resumeRequests.filter(function (r) { return r.sipId === sipId && r.status === 'effective'; }).pop();
      if (!resumeReq || !resumeReq.effectiveDate) return;
      var windowEnd = DateUtils.addDays(resumeReq.effectiveDate, 30);
      if (DateUtils.compareKeys(today, windowEnd) >= 0) completeWindowSips.push(sipId);
      else incompleteWindowCount++;
    });
    var firstSuccessCount = 0;
    completeWindowSips.forEach(function (sipId) {
      var status = store.getFirstPostResumeStatus(sipId);
      if (status && (status.status === 'success' || status.status === 'recovered')) firstSuccessCount++;
    });
    var postResumeSuccessRate = pct(firstSuccessCount, completeWindowSips.length);

    // Demo month-12 active-SIP classification: a successful instalment within the last 30 days of "today".
    var activeCount = 0;
    allSips.forEach(function (sip) {
      var hasRecentSuccess = recoveryStore.getInstalmentsForSip(sip.id).some(function (inst) {
        if (inst.status !== 'success' && inst.status !== 'recovered') return false;
        var instDate = new Date(inst.scheduledDate).toISOString().slice(0, 10);
        return DateUtils.diffDays(instDate, today) <= 30 && DateUtils.diffDays(instDate, today) >= 0;
      });
      if (hasRecentSuccess) activeCount++;
    });
    var month12ActiveRate = pct(activeCount, allSips.length);

    return {
      demo: true,
      asOf: today,
      leadingMetrics: [
        { key: 'eligible_sips', label: 'Eligible SIPs', value: eligibleSips.length, unit: '', demo: true },
        { key: 'pause_adoption_rate', label: 'Pause feature adoption', value: adoptionRate, unit: '%', demo: true },
        { key: 'pause_completion_rate', label: 'Pause request completion rate', value: completionRate, unit: '%', demo: true },
        { key: 'pause_approval_rate', label: 'Pause approval rate', value: approvalRate, unit: '%', demo: true },
        { key: 'median_pause_duration', label: 'Median pause duration', value: medianDuration, unit: 'cycles', demo: true },
        { key: 'resume_request_rate', label: 'Resume request rate', value: resumeRequestRate, unit: '%', demo: true },
        { key: 'effective_resumption_rate', label: 'Effective resumption rate', value: effectiveResumptionRate, unit: '%', demo: true },
        { key: 'post_resume_success_rate', label: 'First successful instalment after resumption', value: postResumeSuccessRate, unit: '%', demo: true, incompleteWindows: incompleteWindowCount },
        { key: 'permanent_discontinuation', label: 'Permanent discontinuation after pausing', value: permanentDiscontinuation, unit: '%', demo: true }
      ],
      outcomeMetric: { key: 'month12_active_rate', label: 'Month-12 Active SIP Rate (demo classification)', value: month12ActiveRate, unit: '%', demo: true },
      note: 'SIMULATED — all figures are demo analytics computed from this prototype session only. They do not represent real user outcomes, and no causal retention improvement should be inferred from them. Leading indicators (adoption, approval, resumption) are shown separately from the long-term Month-12 Active SIP outcome metric, which they do not prove.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
