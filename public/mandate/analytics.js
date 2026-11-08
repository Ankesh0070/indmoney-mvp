/**
 * AutoPay Health & Mandate Repair Assistant — analytics event catalogue +
 * demo metrics. All numbers are computed from this demo session's own
 * event log and simulated-provider outcomes, never from a real user base
 * — every metric returned by computeMetrics() carries demo: true and is
 * labelled SIMULATED wherever it is rendered. Kept separate from Features
 * 1-3's own analytics (own event namespace, own storage key).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  else if (typeof window !== 'undefined') window.MandateAnalytics = factory(window.MandateData, window.SchedulingDateUtils);
})(this, function (Data, DateUtils) {
  'use strict';

  var Events = {
    HEALTH_VIEWED: 'mandate_health_viewed',
    ISSUE_DETECTED: 'mandate_issue_detected',
    ISSUE_DETAILS_VIEWED: 'mandate_issue_details_viewed',
    REPAIR_STARTED: 'mandate_repair_started',
    REAUTH_REQUESTED: 'mandate_reauthorization_requested',
    REAUTH_APPROVED: 'mandate_reauthorization_approved',
    REAUTH_REJECTED: 'mandate_reauthorization_rejected',
    REPLACEMENT_REQUESTED: 'mandate_replacement_requested',
    REPAIR_VERIFIED: 'mandate_repair_verified',
    REPAIR_FAILED: 'mandate_repair_failed',
    STATUS_CHECKED: 'mandate_status_checked',
    SUPPORT_REQUESTED: 'mandate_support_requested'
  };

  function track(store, name, props) { store.emit(name, props || {}); }
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
  function hoursBetween(aIso, bIso) { return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 3600000; }

  /**
   * Computes Screen 13's dashboard summary. `store` is a loaded
   * MandateStore; `recoveryStore` is the shared Feature 1 RecoveryStore.
   *
   * Verified Mandate Repair Rate = eligible problematic mandates
   * successfully repaired & verified / eligible problematic mandates in
   * the cohort (one row per SIP, keyed by its ORIGINAL diagnosed issue so
   * a mandate already repaired still counts in the cohort denominator).
   *
   * Mandate-related Payment Recovery Rate = mandate-related failed
   * instalments subsequently recovered via a verified successful payment
   * within 7 days / eligible mandate-related failed instalments. This is
   * tracked entirely through Feature 1's own instalment records and is
   * never conflated with a mandate repair itself.
   */
  function computeMetrics(store, recoveryStore) {
    var state = store.ensureLoaded();
    var events = state.analyticsEvents;
    var today = store.getDemoToday();

    var allSips = recoveryStore.getAllSips().filter(function (s) { return !!state.capabilities[s.id]; });
    var byStatus = {};
    var problematicSipIds = [];
    allSips.forEach(function (sip) {
      var capability = state.capabilities[sip.id];
      var status = Data.ISSUE_TO_STATUS[capability.issueType];
      byStatus[status] = (byStatus[status] || 0) + 1;
      var isMandateProblem = capability.issueType !== Data.MandateIssueType.HEALTHY && capability.issueType !== Data.MandateIssueType.INSUFFICIENT_BALANCE;
      if (isMandateProblem) problematicSipIds.push(sip.id);
    });

    var issueIncidence = pct(problematicSipIds.length, allSips.length);

    var repairStartedSips = {};
    events.forEach(function (e) { if (e.name === Events.REPAIR_STARTED && e.props && e.props.sipId) repairStartedSips[e.props.sipId] = true; });
    var repairInitiationRate = pct(Object.keys(repairStartedSips).length, problematicSipIds.length);

    var repairedSipIds = problematicSipIds.filter(function (sipId) { return !!state.repairedOverrides[sipId]; });
    var verifiedRepairRate = pct(repairedSipIds.length, problematicSipIds.length);

    var repairDurationsHrs = [];
    problematicSipIds.forEach(function (sipId) {
      var requests = state.repairRequests.filter(function (r) { return r.sipId === sipId && r.status === Data.RepairRequestStatus.REPAIRED; });
      if (requests.length) {
        var req = requests[requests.length - 1];
        if (req.submittedAt && req.decisionAt) repairDurationsHrs.push(hoursBetween(req.submittedAt, req.decisionAt));
      }
    });
    var medianRepairHours = median(repairDurationsHrs);

    var failedOutcomes = state.repairRequests.filter(function (r) { return r.status === Data.RepairRequestStatus.REJECTED || r.status === Data.RepairRequestStatus.UNRESOLVED; });
    var failureReasonCounts = {};
    failedOutcomes.forEach(function (r) {
      var reason = r.status === Data.RepairRequestStatus.UNRESOLVED ? 'provider_unavailable' : (r.rejectionReason || 'rejected');
      failureReasonCounts[reason] = (failureReasonCounts[reason] || 0) + 1;
    });

    var pendingVerificationCount = state.repairRequests.filter(function (r) {
      return r.status === Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING || r.status === Data.RepairRequestStatus.AUTHORIZATION_PENDING;
    }).length;

    var unresolvedCount = problematicSipIds.filter(function (sipId) { return !state.repairedOverrides[sipId]; }).length;

    // Next-instalment payment success among repaired mandates: look at the shared RecoveryStore for
    // the first instalment scheduled on/after each repair's verification date, counted only when its
    // own 7-day observation window is already complete (never an incomplete window).
    var nextInstalmentEligible = 0, nextInstalmentSuccess = 0, incompleteWindows = 0;
    repairedSipIds.forEach(function (sipId) {
      var override = state.repairedOverrides[sipId];
      var windowEnd = DateUtils.addDays(override.verifiedAt.slice(0, 10), 7);
      var instalments = recoveryStore.getInstalmentsForSip(sipId).filter(function (i) {
        return new Date(i.scheduledDate).toISOString().slice(0, 10) >= override.verifiedAt.slice(0, 10);
      });
      if (!instalments.length) return;
      if (DateUtils.compareKeys(today, windowEnd) < 0) { incompleteWindows++; return; }
      nextInstalmentEligible++;
      if (instalments.some(function (i) { return i.status === 'success' || i.status === 'recovered'; })) nextInstalmentSuccess++;
    });
    var nextInstalmentSuccessRate = pct(nextInstalmentSuccess, nextInstalmentEligible);

    // Mandate-related Payment Recovery Rate — entirely via Feature 1's own instalment ledger.
    var mandateRelatedFailed = [];
    recoveryStore.getAllSips().forEach(function (sip) {
      recoveryStore.getInstalmentsForSip(sip.id).forEach(function (inst) {
        if (inst.failureReason === 'mandate_expired' && inst.everFailed) mandateRelatedFailed.push(inst);
      });
    });
    var recoveredWithin7Days = mandateRelatedFailed.filter(function (inst) {
      return inst.status === 'recovered' && inst.recoveredAt && inst.failedAt &&
        DateUtils.diffDays(inst.failedAt.slice(0, 10), inst.recoveredAt.slice(0, 10)) <= 7;
    });
    var paymentRecoveryRate = pct(recoveredWithin7Days.length, mandateRelatedFailed.length);

    return {
      demo: true,
      asOf: today,
      mandatesByStatus: byStatus,
      leadingMetrics: [
        { key: 'mandates_tracked', label: 'Mandates tracked', value: allSips.length, unit: '', demo: true },
        { key: 'issue_incidence', label: 'Mandate issue incidence', value: issueIncidence, unit: '%', demo: true },
        { key: 'repair_initiation_rate', label: 'Repair initiation rate', value: repairInitiationRate, unit: '%', demo: true },
        { key: 'verified_repair_rate', label: 'Verified Mandate Repair Rate', value: verifiedRepairRate, unit: '%', demo: true },
        { key: 'median_repair_hours', label: 'Median time to repair (hrs)', value: medianRepairHours, unit: 'hrs', demo: true },
        { key: 'pending_verification', label: 'Pending verification', value: pendingVerificationCount, unit: '', demo: true },
        { key: 'unresolved_issues', label: 'Unresolved mandate issues', value: unresolvedCount, unit: '', demo: true },
        { key: 'next_instalment_success_rate', label: 'Next-instalment success among repaired mandates', value: nextInstalmentSuccessRate, unit: '%', demo: true, incompleteWindows: incompleteWindows },
        { key: 'payment_recovery_rate', label: 'Mandate-related Payment Recovery Rate', value: paymentRecoveryRate, unit: '%', demo: true }
      ],
      failureReasonCounts: failureReasonCounts,
      note: 'SIMULATED — all figures are demo analytics computed from this prototype session only. They do not represent real user outcomes. Verified Mandate Repair Rate and Mandate-related Payment Recovery Rate are kept separate: a verified mandate repair is never counted as a successful SIP payment.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
