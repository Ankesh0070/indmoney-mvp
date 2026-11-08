/**
 * SIP Pause & Resume Manager — reusable, pure HTML-string component
 * builders. No DOM access (Node-testable); screens.js wires interactivity
 * after inserting the markup, mirroring Features 1 & 2's components.js.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.PauseComponents = factory(window.PauseData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function inr(n) { if (n == null) return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }

  var LIFECYCLE_META = {};
  LIFECYCLE_META[Data.SipLifecycleStatus.ACTIVE] = { icon: '✅', label: 'Active', cls: 'pause-badge-success' };
  LIFECYCLE_META[Data.SipLifecycleStatus.PAUSE_REQUESTED] = { icon: '⏳', label: 'Pause Requested', cls: 'pause-badge-pending' };
  LIFECYCLE_META[Data.SipLifecycleStatus.PAUSED] = { icon: '⏸️', label: 'Paused', cls: 'pause-badge-amber' };
  LIFECYCLE_META[Data.SipLifecycleStatus.RESUME_REQUESTED] = { icon: '⏳', label: 'Resume Requested', cls: 'pause-badge-pending' };
  LIFECYCLE_META[Data.SipLifecycleStatus.RESUME_SCHEDULED] = { icon: '🔄', label: 'Resume Scheduled', cls: 'pause-badge-pending' };
  LIFECYCLE_META[Data.SipLifecycleStatus.PROVIDER_ACTION_REQUIRED] = { icon: '🔐', label: 'Provider Action Required', cls: 'pause-badge-danger' };
  LIFECYCLE_META[Data.SipLifecycleStatus.CANCELLED] = { icon: '🚫', label: 'Cancelled', cls: 'pause-badge-muted' };

  function lifecycleBadge(status) {
    var meta = LIFECYCLE_META[status] || { icon: 'ℹ️', label: status, cls: 'pause-badge-muted' };
    return '<span class="pause-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var REQUEST_META = {
    draft: { icon: '📝', label: 'Draft', cls: 'pause-badge-muted' },
    submitted: { icon: '📤', label: 'Submitted', cls: 'pause-badge-pending' },
    pending_provider_approval: { icon: '⏳', label: 'Pending Provider Approval', cls: 'pause-badge-pending' },
    requires_reauthorization: { icon: '🔐', label: 'Requires Reauthorization', cls: 'pause-badge-amber' },
    approved: { icon: '✅', label: 'Approved', cls: 'pause-badge-success' },
    rejected: { icon: '❌', label: 'Rejected', cls: 'pause-badge-danger' },
    cancelled: { icon: '🚫', label: 'Cancelled', cls: 'pause-badge-muted' },
    effective: { icon: '🟢', label: 'Effective', cls: 'pause-badge-success' }
  };
  function requestStatusBadge(status) {
    var meta = REQUEST_META[status] || { icon: 'ℹ️', label: status, cls: 'pause-badge-muted' };
    return '<span class="pause-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var SCHEDULE_ENTRY_META = {
    scheduled: { icon: '💳', label: 'Scheduled', cls: 'pause-sched-scheduled' },
    skipped_paused: { icon: '⏸️', label: 'Skipped (paused)', cls: 'pause-sched-skipped' },
    processing_protected: { icon: '⚠️', label: 'Already processing — cannot be skipped', cls: 'pause-sched-protected' },
    resumed: { icon: '▶️', label: 'Resumed', cls: 'pause-sched-scheduled' }
  };

  /** SIP management row for Screen 1 (My SIPs dashboard extension). */
  function sipManageRow(sip, lifecycle, pauseEligible, pendingRequestLabel) {
    return (
      '<div class="list-row pause-sip-row" data-sip-id="' + esc(sip.id) + '">' +
        '<span class="pause-sip-dot" style="background:' + esc(sip.color || '#3d99ff') + ';"></span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="row-between">' +
            '<span class="small bold">' + esc(sip.fundName) + '</span>' +
            lifecycleBadge(lifecycle) +
          '</div>' +
          '<div class="tiny muted mt-4">' + inr(sip.amount) + '/mo' + (pauseEligible ? '' : ' · pause unsupported') + (pendingRequestLabel ? ' · ' + esc(pendingRequestLabel) : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="manage-sip" data-sip-id="' + esc(sip.id) + '">Manage SIP</button>' +
      '</div>'
    );
  }

  /** Capability summary card for the eligibility-check screen. */
  function capabilitySummaryCard(capability) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Pause cycles allowed</span><span class="tiny bold">' + capability.minCycles + '–' + capability.maxCycles + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Minimum notice period</span><span class="tiny bold">' + (capability.noticeDays || 0) + ' day(s)</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Provider approval required</span><span class="tiny bold">' + (capability.approvalRequired ? 'Yes' : 'No') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Mandate implication</span><span class="tiny bold">' + (capability.mandateImplication === 'reauth_may_be_required' ? 'May need reauthorization' : 'None recorded') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Early resume</span><span class="tiny bold">' + (capability.earlyResumeSupported ? 'Supported' : 'Not supported') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Cancelling a pending request</span><span class="tiny bold">' + (capability.cancellationSupported ? 'Supported' : 'Not supported') + '</span></div>' +
        '<div class="tiny faint mt-12">' + esc(capability.stateRestrictions || 'These are simulated scheduling-provider rules for this demo, not confirmed INDmoney or AMC policy.') + '</div>' +
      '</div>'
    );
  }

  /** Unsupported-pause notice (Screen 3). */
  function unavailableNotice(sip) {
    return (
      '<div class="empty-state">' +
        '<div class="emoji">🔒</div>' +
        '<div class="small bold">Temporary pause is not available for this SIP through this demo provider.</div>' +
        '<div class="tiny muted mt-8">' + esc(sip.fundName) + '’s scheduling provider has not enabled self-service pausing for this mandate in this demo. This reflects a simulated provider policy, not a universal rule.</div>' +
      '</div>'
    );
  }

  /** Duration selector pills (Screen 4). */
  function durationOptions(minCycles, maxCycles, selected) {
    var out = [];
    for (var c = minCycles; c <= maxCycles; c++) {
      out.push('<button class="pill' + (c === selected ? ' active' : '') + '" data-action="select-pause-cycles" data-cycles="' + c + '">Pause for ' + c + ' instalment' + (c > 1 ? 's' : '') + '</button>');
    }
    return '<div class="pill-row">' + out.join('') + '</div>';
  }

  /** Projected schedule list used by Screens 4 and 5. */
  function scheduleList(schedule) {
    var rows = [];
    if (schedule.protectedDateKey) {
      rows.push(scheduleRow(schedule.protectedDateKey, 'processing_protected'));
    }
    schedule.affectedDateKeys.forEach(function (key) { rows.push(scheduleRow(key, 'skipped_paused')); });
    rows.push(scheduleRow(schedule.resumeDateKey, 'resumed'));
    return '<div class="card">' + rows.join('') + '</div>';
  }
  function scheduleRow(dateKey, entryStatus) {
    var meta = SCHEDULE_ENTRY_META[entryStatus];
    return (
      '<div class="row-between mt-8">' +
        '<span class="small">' + meta.icon + ' ' + DateUtils.formatIndianDate(dateKey) + '</span>' +
        '<span class="tiny ' + meta.cls + '">' + esc(meta.label) + '</span>' +
      '</div>'
    );
  }

  /** Pause impact preview card (Screen 5). */
  function pauseImpactCard(sip, schedule, capability) {
    return (
      '<div class="card">' +
        '<div class="small bold">' + esc(sip.fundName) + '</div>' +
        '<div class="row-between mt-12"><span class="small muted">Monthly amount</span><span class="small bold">' + inr(sip.amount) + '</span></div>' +
        (schedule.protectedDateKey ? '<div class="row-between mt-8"><span class="small muted">Next instalment (already processing)</span><span class="small bold">' + DateUtils.formatIndianDate(schedule.protectedDateKey) + '</span></div>' : '') +
        '<div class="row-between mt-8"><span class="small muted">Instalments to be skipped</span><span class="small bold">' + schedule.affectedDateKeys.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Next instalment expected</span><span class="small bold">' + DateUtils.formatIndianDate(schedule.resumeDateKey) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Mandate reauthorization</span><span class="small bold">' + (capability.mandateImplication === 'reauth_may_be_required' ? 'May be required later' : 'Not required') + '</span></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="tiny">• No mutual fund units are redeemed by this pause operation.</div>' +
        '<div class="tiny mt-8">• A paused SIP is not counted as an active SIP under the 30-day activity metric.</div>' +
        '<div class="tiny mt-8">• Market movements and the performance of your existing investment are unaffected by this operation — only your future contribution schedule changes.</div>' +
        (schedule.protectedDateKey ? '<div class="tiny mt-8">• A debit already in progress may still proceed and is not cancelled by this request.</div>' : '') +
      '</div>'
    );
  }

  /** Pause/resume request status card (Screen 7 / early-resume tracker). */
  function requestStatusCard(request, kind) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Request ID</span><span class="tiny bold">' + esc(request.id) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Submitted</span><span class="tiny bold">' + DateUtils.formatIndianDate(request.submittedAt ? request.submittedAt.slice(0, 10) : null) + '</span></div>' +
        (kind === 'pause' ? '<div class="row-between mt-8"><span class="tiny muted">Requested duration</span><span class="tiny bold">' + request.requestedCycles + ' instalment(s)</span></div>' : '') +
        '<div class="row-between mt-8"><span class="tiny muted">Provider status</span>' + requestStatusBadge(request.status) + '</div>' +
        (request.effectiveDate ? '<div class="row-between mt-8"><span class="tiny muted">Effective date</span><span class="tiny bold">' + DateUtils.formatIndianDate(request.effectiveDate) + '</span></div>' : '') +
        (request.rejectionReason ? '<div class="row-between mt-8"><span class="tiny muted">Reason</span><span class="tiny bold" style="text-align:right; max-width:60%;">' + esc(request.rejectionReason) + '</span></div>' : '') +
      '</div>'
    );
  }

  /** Paused SIP dashboard card (Screen 8). */
  function pausedDashboardCard(sip, pauseRequest, mandateStatus, todayKey) {
    var remaining = pauseRequest.affectedDateKeys.filter(function (k) { return DateUtils.compareKeys(todayKey || DateUtils.todayKey(), k) < 0; });
    return (
      '<div class="card" style="border-color:rgba(238,190,110,0.35);">' +
        '<div class="row gap-12"><span style="font-size:22px;">⏸️</span><div class="small bold">SIP Temporarily Paused</div></div>' +
        '<div class="row-between mt-12"><span class="small muted">Original monthly amount</span><span class="small bold">' + inr(sip.amount) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Pause start date</span><span class="small bold">' + DateUtils.formatIndianDate(pauseRequest.effectiveDate) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Remaining paused instalments</span><span class="small bold">' + remaining.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Projected resume date</span><span class="small bold">' + DateUtils.formatIndianDate(pauseRequest.resumeDateKey) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Mandate status</span><span class="small bold">' + esc(mandateStatus || 'Active') + '</span></div>' +
      '</div>'
    );
  }

  /** History timeline (Screen 11), reusing the recovery-timeline visual pattern. */
  function historyTimeline(events) {
    if (!events || !events.length) return '<div class="tiny muted">No pause or resume activity recorded yet for this SIP.</div>';
    var ICONS = {
      pause_request_submitted: '📤', pause_request_approved: '✅', pause_request_rejected: '❌',
      pause_request_cancelled: '🚫', pause_effective: '⏸️', pause_effective_seeded: '⏸️',
      early_resume_requested: '🔄', resume_approved: '✅', resume_rejected: '❌',
      resume_effective: '▶️', resume_effective_seeded: '▶️',
      scheduled_resume_created: '⏰', scheduled_resume_requires_reauth: '🔐'
    };
    var LABELS = {
      pause_request_submitted: 'Pause request created', pause_request_approved: 'Pause approved',
      pause_request_rejected: 'Pause rejected', pause_request_cancelled: 'Pause request cancelled',
      pause_effective: 'Pause became effective', pause_effective_seeded: 'Pause became effective',
      early_resume_requested: 'Early resume requested', resume_approved: 'Resume approved',
      resume_rejected: 'Resume rejected', resume_effective: 'Resume became effective',
      resume_effective_seeded: 'Resume became effective', scheduled_resume_created: 'Scheduled resume triggered',
      scheduled_resume_requires_reauth: 'Scheduled resume needs reauthorization'
    };
    return '<div class="recovery-timeline">' + events.map(function (e) {
      return (
        '<div class="recovery-timeline-item">' +
          '<div class="recovery-timeline-dot">' + (ICONS[e.type] || '•') + '</div>' +
          '<div class="recovery-timeline-content">' +
            '<div class="small bold">' + esc(LABELS[e.type] || e.type) + '</div>' +
            '<div class="tiny faint mt-4">' + DateUtils.formatIndianDate(e.at ? e.at.slice(0, 10) : null) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  /** Notification row (Screen 12). */
  var NOTIF_ICONS = {
    pause_received: '⏳', pause_approved: '✅', pause_rejected: '❌', pause_effective: '⏸️',
    resume_upcoming: '🔔', resume_reauth_required: '🔐', resume_effective: '▶️',
    post_resume_payment: '💳'
  };
  function notificationItem(n) {
    return (
      '<div class="list-row recovery-notif ' + (n.read ? '' : 'recovery-notif-unread') + '" data-pause-notif-id="' + esc(n.id) + '">' +
        '<span style="font-size:18px;">' + (NOTIF_ICONS[n.type] || '🔔') + '</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small">' + esc(n.message) + (!n.read ? ' <span class="recovery-dot"></span>' : '') + '</div>' +
          '<div class="tiny faint mt-4">' + DateUtils.formatIndianDate(n.createdAt ? n.createdAt.slice(0, 10) : null) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Scenario switcher pill row, reusing Features 1 & 2's visual pattern. */
  function scenarioPillRow(scenarios, focusedId) {
    return '<div class="recovery-scenario-row">' + scenarios.map(function (sc) {
      return '<button class="recovery-scenario-pill' + (sc.id === focusedId ? ' active' : '') + '" data-action="focus-pause-scenario" data-scenario-id="' + esc(sc.id) + '">' + esc(sc.shortLabel) + '</button>';
    }).join('') + '</div>';
  }

  return {
    esc: esc, inr: inr,
    lifecycleBadge: lifecycleBadge, requestStatusBadge: requestStatusBadge,
    sipManageRow: sipManageRow, capabilitySummaryCard: capabilitySummaryCard, unavailableNotice: unavailableNotice,
    durationOptions: durationOptions, scheduleList: scheduleList, pauseImpactCard: pauseImpactCard,
    requestStatusCard: requestStatusCard, pausedDashboardCard: pausedDashboardCard,
    historyTimeline: historyTimeline, notificationItem: notificationItem, scenarioPillRow: scenarioPillRow
  };
});
