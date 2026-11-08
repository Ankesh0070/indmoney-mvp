/**
 * Salary-Aligned SIP Scheduler — analytics event catalogue + demo metrics.
 * All numbers here are computed from this demo session's own event log and
 * simulated-provider outcomes, never from a real user base — every metric
 * returned by computeMetrics() carries demo: true and must be labelled as
 * demo analytics wherever it is rendered. No causal retention claim is made.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./dateUtils.js'));
  else if (typeof window !== 'undefined') window.SchedulingAnalytics = factory(window.SchedulingDateUtils);
})(this, function (DateUtils) {
  'use strict';

  var Events = {
    SETUP_STARTED: 'salary_schedule_setup_started',
    INCOME_DATE_SAVED: 'expected_income_date_saved',
    CALENDAR_VIEWED: 'sip_calendar_viewed',
    MISMATCH_DETECTED: 'timing_mismatch_detected',
    DATES_VIEWED: 'available_dates_viewed',
    CHANGE_STARTED: 'sip_date_change_started',
    CHANGE_SUBMITTED: 'sip_date_change_submitted',
    CHANGE_APPROVED: 'sip_date_change_approved',
    CHANGE_REJECTED: 'sip_date_change_rejected',
    CHANGE_EFFECTIVE: 'sip_date_change_effective',
    REMINDER_ENABLED: 'scheduling_reminder_enabled'
  };

  function track(store, name, props) { store.emit(name, props || {}); }

  function countEvents(events, name) { return events.filter(function (e) { return e.name === name; }).length; }
  function distinctProp(events, name, key) {
    var seen = {};
    events.forEach(function (e) { if (e.name === name && e.props && e.props[key] !== undefined) seen[e.props[key]] = true; });
    return Object.keys(seen);
  }
  function pct(numerator, denominator) {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  /**
   * Computes the Screen 10 analytics summary. `store` is a SchedulingStore
   * (already loaded); `recoveryStore` is the shared Feature 1 RecoveryStore.
   */
  function computeMetrics(store, recoveryStore) {
    var state = store.ensureLoaded();
    var events = state.analyticsEvents;
    var sips = recoveryStore.getAllSips();
    var today = DateUtils.todayKey();
    var p = DateUtils.parseKey(today);

    var schedulableSips = sips.filter(function (s) { return !!store.getCapability(s.id); });
    var changeableSips = schedulableSips.filter(function (s) { var c = store.getCapability(s.id); return c && c.canChangeDate; });
    var engagedSipIds = {};
    distinctProp(events, Events.CALENDAR_VIEWED, 'sipId').forEach(function (id) { engagedSipIds[id] = true; });
    state.requests.forEach(function (r) { engagedSipIds[r.sipId] = true; });
    if (state.income && !state.income.skipped) schedulableSips.forEach(function (s) { engagedSipIds[s.id] = true; });

    var adoptionRate = pct(Object.keys(engagedSipIds).length, schedulableSips.length);

    var setupStarted = countEvents(events, Events.SETUP_STARTED);
    var setupSaved = countEvents(events, Events.INCOME_DATE_SAVED);
    var incomeSetupCompletionRate = setupStarted === 0 && setupSaved === 0 ? null : pct(setupSaved, Math.max(setupStarted, setupSaved));

    var mismatchedCount = 0;
    schedulableSips.forEach(function (s) {
      var m = store.detectMismatchForSip(s.id, p.year, p.month0);
      if (m.status === 'mismatch' || m.status === 'uncertain') mismatchedCount++;
    });
    var mismatchRate = pct(mismatchedCount, schedulableSips.length);

    var sipsWithAnyRequest = {};
    state.requests.forEach(function (r) { sipsWithAnyRequest[r.sipId] = true; });
    var dateChangeInitiationRate = pct(Object.keys(sipsWithAnyRequest).length, changeableSips.length);

    var decided = state.requests.filter(function (r) { return r.status === 'approved' || r.status === 'rejected' || r.status === 'effective'; });
    var approvedOrEffective = decided.filter(function (r) { return r.status === 'approved' || r.status === 'effective'; });
    var dateChangeApprovalRate = pct(approvedOrEffective.length, decided.length);

    var effectiveRequests = state.requests.filter(function (r) { return r.status === 'effective' && r.effectiveAppliedAt; });
    var totalDays = 0, counted = 0;
    effectiveRequests.forEach(function (r) {
      var submitted = new Date(r.submittedAt), applied = new Date(r.effectiveAppliedAt);
      var days = Math.max(0, Math.round((applied - submitted) / 86400000));
      totalDays += days; counted++;
    });
    var avgTimeToEffectiveDays = counted ? Math.round((totalDays / counted) * 10) / 10 : null;

    var beforeFailures = 0, beforeTotal = 0, afterFailures = 0, afterTotal = 0;
    effectiveRequests.forEach(function (r) {
      var instalments = recoveryStore.getInstalmentsForSip(r.sipId);
      instalments.forEach(function (inst) {
        var attempts = recoveryStore.getAttemptsForInstalment(inst.id);
        attempts.forEach(function (a) {
          var isBefore = new Date(a.createdAt) < new Date(r.effectiveAppliedAt);
          if (isBefore) { beforeTotal++; if (a.status === 'failed') beforeFailures++; }
          else { afterTotal++; if (a.status === 'failed') afterFailures++; }
        });
      });
    });

    return {
      demo: true,
      asOf: today,
      metrics: [
        { key: 'feature_adoption_rate', label: 'Feature adoption rate', value: adoptionRate, unit: '%', demo: true },
        { key: 'income_setup_completion_rate', label: 'Income-date setup completion rate', value: incomeSetupCompletionRate, unit: '%', demo: true },
        { key: 'timing_mismatch_rate', label: 'SIPs with a timing mismatch', value: mismatchRate, unit: '%', demo: true },
        { key: 'date_change_initiation_rate', label: 'Date-change initiation rate', value: dateChangeInitiationRate, unit: '%', demo: true },
        { key: 'date_change_approval_rate', label: 'Date-change approval rate', value: dateChangeApprovalRate, unit: '%', demo: true },
        { key: 'avg_time_to_effective_days', label: 'Average time to effective change', value: avgTimeToEffectiveDays, unit: 'days', demo: true },
        { key: 'failed_payment_rate_before', label: 'Failed-payment rate before effective change', value: pct(beforeFailures, beforeTotal), unit: '%', demo: true },
        { key: 'failed_payment_rate_after', label: 'Failed-payment rate after effective change', value: pct(afterFailures, afterTotal), unit: '%', demo: true }
      ],
      note: 'All figures are demo analytics computed from this prototype session only. They do not represent real user outcomes, and no causal retention or success claim should be inferred from them.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
