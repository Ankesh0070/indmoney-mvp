/**
 * SIP Recovery Assistant — local analytics: event log + metric computation.
 * Entirely in-memory/localStorage, simulated — never leaves the device.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else if (typeof window !== 'undefined') {
    window.RecoveryAnalytics = factory(window.RecoveryData);
  }
})(this, function (Data) {
  'use strict';

  var EVENTS = [
    'sip_payment_failed', 'failure_alert_viewed', 'recovery_started', 'recovery_action_selected',
    'retry_requested', 'retry_succeeded', 'retry_failed', 'mandate_reauthorization_completed',
    'recovery_completed', 'support_ticket_created'
  ];

  function log(events, name, props) {
    events.push({ name: name, props: props || {}, at: new Date().toISOString() });
  }

  var MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

  /**
   * @param {object} recoveryState - the full persisted RecoveryStore state
   */
  function computeMetrics(recoveryState) {
    var instalments = recoveryState.instalments || [];
    var events = recoveryState.analyticsEvents || [];

    var everFailed = instalments.filter(function (i) { return i.everFailed; });
    var eligible = everFailed.filter(function (i) { return i.recoveryAvailable !== false; });

    var recoveryStartedInstalmentIds = {};
    events.forEach(function (e) {
      if (e.name === 'recovery_started' && e.props && e.props.instalmentId) {
        recoveryStartedInstalmentIds[e.props.instalmentId] = true;
      }
    });
    var eligibleIds = {};
    eligible.forEach(function (i) { eligibleIds[i.id] = true; });
    var initiatedEligibleCount = Object.keys(recoveryStartedInstalmentIds).filter(function (id) {
      return eligibleIds[id];
    }).length;

    var recoveredWithin7d = eligible.filter(function (i) {
      if (i.status !== 'recovered' || !i.recoveredAt || !i.failedAt) return false;
      return (new Date(i.recoveredAt) - new Date(i.failedAt)) <= MS_7_DAYS;
    });

    var pendingCount = instalments.filter(function (i) { return i.status === 'pending'; }).length;
    var unresolvedCount = instalments.filter(function (i) { return i.status === 'failed'; }).length;

    var byReason = {};
    eligible.forEach(function (i) {
      var reason = i.failureReason || 'unknown';
      if (!byReason[reason]) byReason[reason] = { total: 0, recovered: 0 };
      byReason[reason].total += 1;
      if (i.status === 'recovered') byReason[reason].recovered += 1;
    });

    return {
      simulated: true,
      failedInstalmentCount: everFailed.length,
      eligibleRecoveryCount: eligible.length,
      recoveryFlowInitiationRate: eligible.length ? initiatedEligibleCount / eligible.length : 0,
      verifiedSevenDayRecoveryRate: eligible.length ? recoveredWithin7d.length / eligible.length : 0,
      pendingCount: pendingCount,
      unresolvedCount: unresolvedCount,
      recoveredCount: eligible.filter(function (i) { return i.status === 'recovered'; }).length,
      breakdownByReason: byReason
    };
  }

  return { EVENTS: EVENTS, log: log, computeMetrics: computeMetrics };
});
