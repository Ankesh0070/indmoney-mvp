/**
 * Salary-Aligned SIP Scheduler — reusable, pure HTML-string component
 * builders. No DOM access (Node-testable); screens.js wires interactivity
 * after inserting the markup, mirroring the SIP Recovery Assistant's
 * components.js pattern.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.SchedulingComponents = factory(window.SchedulingData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function inr(n) {
    if (n == null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN');
  }

  var REQUEST_STATUS_META = {};
  REQUEST_STATUS_META[Data.RequestStatus.DRAFT] = { icon: '📝', label: 'Draft', cls: 'sched-badge-muted' };
  REQUEST_STATUS_META[Data.RequestStatus.AWAITING_CONFIRMATION] = { icon: '✍️', label: 'Awaiting Confirmation', cls: 'sched-badge-pending' };
  REQUEST_STATUS_META[Data.RequestStatus.SUBMITTED] = { icon: '📤', label: 'Submitted', cls: 'sched-badge-pending' };
  REQUEST_STATUS_META[Data.RequestStatus.PENDING_PROVIDER_APPROVAL] = { icon: '⏳', label: 'Pending Provider Approval', cls: 'sched-badge-pending' };
  REQUEST_STATUS_META[Data.RequestStatus.REQUIRES_REAUTHORIZATION] = { icon: '🔐', label: 'Requires Reauthorization', cls: 'sched-badge-amber' };
  REQUEST_STATUS_META[Data.RequestStatus.APPROVED] = { icon: '✅', label: 'Approved', cls: 'sched-badge-success' };
  REQUEST_STATUS_META[Data.RequestStatus.REJECTED] = { icon: '❌', label: 'Rejected', cls: 'sched-badge-danger' };
  REQUEST_STATUS_META[Data.RequestStatus.CANCELLED] = { icon: '🚫', label: 'Cancelled', cls: 'sched-badge-muted' };
  REQUEST_STATUS_META[Data.RequestStatus.EFFECTIVE] = { icon: '🟢', label: 'Effective', cls: 'sched-badge-success' };

  function requestStatusBadge(status) {
    var meta = REQUEST_STATUS_META[status] || { icon: 'ℹ️', label: status, cls: 'sched-badge-muted' };
    return '<span class="sched-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var MISMATCH_META = {};
  MISMATCH_META[Data.MismatchStatus.ALIGNED] = { icon: '✅', label: 'Looks aligned', cls: 'sched-badge-success' };
  MISMATCH_META[Data.MismatchStatus.MISMATCH] = { icon: '⚠️', label: 'Scheduled before income', cls: 'sched-badge-danger' };
  MISMATCH_META[Data.MismatchStatus.UNCERTAIN] = { icon: '❔', label: 'Timing uncertain', cls: 'sched-badge-amber' };
  MISMATCH_META[Data.MismatchStatus.SAME_DAY] = { icon: 'ℹ️', label: 'Same day as income', cls: 'sched-badge-amber' };
  MISMATCH_META[Data.MismatchStatus.UNKNOWN] = { icon: '➖', label: 'Income date not set', cls: 'sched-badge-muted' };

  function mismatchBadge(status) {
    var meta = MISMATCH_META[status] || MISMATCH_META[Data.MismatchStatus.UNKNOWN];
    return '<span class="sched-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  /** Overview row: one SIP with current debit day, mismatch status and a review CTA. */
  function sipScheduleRow(sip, debitDay, mismatch, opts) {
    opts = opts || {};
    return (
      '<div class="list-row sched-sip-row" data-sip-id="' + esc(sip.id) + '">' +
        '<span class="sched-sip-dot" style="background:' + esc(sip.color || '#3d99ff') + ';"></span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="row-between">' +
            '<span class="small bold">' + esc(sip.fundName) + '</span>' +
            mismatchBadge(mismatch ? mismatch.status : Data.MismatchStatus.UNKNOWN) +
          '</div>' +
          '<div class="tiny muted mt-4">' + inr(sip.amount) + ' · debited on the ' + DateUtils.ordinal(debitDay) + '</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="review-sip-schedule" data-sip-id="' + esc(sip.id) + '">Review</button>' +
      '</div>'
    );
  }

  /** Plain-English mismatch explanation card (Screen 4). */
  function mismatchExplanationCard(sip, debitDay, income, mismatch) {
    var body;
    if (mismatch.status === Data.MismatchStatus.MISMATCH) {
      body = 'Your SIP is scheduled for the ' + DateUtils.ordinal(debitDay) + ', while your expected salary date is the ' + DateUtils.ordinal(mismatch.projectedIncomeDay) + '. You can review available SIP dates.';
    } else if (mismatch.status === Data.MismatchStatus.SAME_DAY) {
      body = 'Your SIP and your expected salary date both fall on the ' + DateUtils.ordinal(debitDay) + '. Some SIPs run before funds have fully settled on the same day.';
    } else if (mismatch.status === Data.MismatchStatus.UNCERTAIN) {
      body = 'Your SIP is scheduled for the ' + DateUtils.ordinal(debitDay) + ', which overlaps your estimated income window (' + DateUtils.ordinal(income.variableStart) + '–' + DateUtils.ordinal(income.variableEnd) + '). Since your income is variable, this is a possibility to review, not a certainty.';
    } else if (mismatch.status === Data.MismatchStatus.ALIGNED) {
      body = 'Your SIP is scheduled for the ' + DateUtils.ordinal(debitDay) + ', after your expected income date of the ' + DateUtils.ordinal(mismatch.projectedIncomeDay) + '.';
    } else {
      body = 'Add your expected income date to see how it compares with this SIP\'s debit date.';
    }
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">SIP debit date</span><span class="small bold">' + DateUtils.ordinal(debitDay) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Expected income date</span><span class="small bold">' + (income && !income.skipped ? incomeSummary(income) : 'Not set') + '</span></div>' +
        '<div class="mt-12">' + mismatchBadge(mismatch.status) + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="small">' + esc(body) + '</div>' +
        '<div class="tiny faint mt-12">This is a self-reported comparison, not a bank balance check. INDmoney never confirms whether your salary has actually arrived.</div>' +
      '</div>'
    );
  }

  function incomeSummary(income) {
    if (!income || income.skipped || !income.pattern) return 'Not set';
    if (income.pattern === Data.IncomePattern.FIXED) return 'Around the ' + DateUtils.ordinal(income.fixedDay) + ' (fixed)';
    if (income.pattern === Data.IncomePattern.VARIABLE) return DateUtils.ordinal(income.variableStart) + '–' + DateUtils.ordinal(income.variableEnd) + ' (variable)';
    return 'Irregular — no fixed pattern';
  }

  /** Month calendar grid. `eventsByDay[day] = [{icon, label, cls}]`. Sun-first, 7 columns. */
  function monthCalendar(year, month0, eventsByDay, opts) {
    opts = opts || {};
    var firstWeekday = new Date(year, month0, 1).getDay();
    var totalDays = DateUtils.daysInMonth(year, month0);
    var todayKey = opts.todayKey || DateUtils.todayKey();
    var cells = [];
    for (var i = 0; i < firstWeekday; i++) cells.push('<div class="sched-cal-cell sched-cal-cell-empty"></div>');
    for (var day = 1; day <= totalDays; day++) {
      var key = DateUtils.makeKey(year, month0, day);
      var isToday = key === todayKey;
      var evs = eventsByDay[day] || [];
      var dots = evs.map(function (e) {
        return '<span class="sched-cal-dot ' + esc(e.cls || '') + '" title="' + esc(e.label) + '">' + esc(e.icon || '•') + '</span>';
      }).join('');
      cells.push(
        '<div class="sched-cal-cell' + (isToday ? ' sched-cal-today' : '') + '" data-day="' + day + '">' +
          '<div class="sched-cal-daynum">' + day + '</div>' +
          '<div class="sched-cal-dots">' + dots + '</div>' +
        '</div>'
      );
    }
    var dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return (
      '<div class="sched-cal">' +
        '<div class="sched-cal-dow">' + dow.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
        '<div class="sched-cal-grid">' + cells.join('') + '</div>' +
      '</div>'
    );
  }

  /** Eligible-date selector list (Screen 5, provider-supported case). */
  function eligibleDatesList(allowedDates, selectedDay) {
    return '<div class="pill-row sched-dates-row">' + allowedDates.map(function (d) {
      return '<button class="pill' + (d === selectedDay ? ' active' : '') + '" data-action="select-eligible-date" data-day="' + d + '">' + DateUtils.ordinal(d) + '</button>';
    }).join('') + '</div>';
  }

  /** Unsupported-change notice (Screen 5, provider does not allow changes). */
  function unavailableNotice(sip) {
    return (
      '<div class="empty-state">' +
        '<div class="emoji">🔒</div>' +
        '<div class="small bold">This SIP\'s debit date cannot currently be changed through this flow.</div>' +
        '<div class="tiny muted mt-8">' + esc(sip.fundName) + '\'s scheduling provider has not enabled self-service date changes for this mandate in this demo. This reflects a simulated provider policy, not a universal rule — availability can differ by fund house and mandate type.</div>' +
      '</div>'
    );
  }

  /** Capability summary card shown alongside eligible dates or the unavailable notice. */
  function capabilitySummaryCard(capability) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Minimum notice period</span><span class="tiny bold">' + (capability.minNoticeDays || 0) + ' day(s)</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Reauthorization needed</span><span class="tiny bold">' + (capability.requiresReauth ? 'Yes' : 'No') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Cancelling a pending request</span><span class="tiny bold">' + (capability.cancellationSupported ? 'Supported' : 'Not supported') + '</span></div>' +
        '<div class="tiny faint mt-12">These are simulated scheduling-provider rules for this demo, not confirmed INDmoney policy.</div>' +
      '</div>'
    );
  }

  /** Date-change confirmation card (Screen 6). */
  function changeConfirmationCard(sip, currentDay, requestedDay, capability, computedEffectiveDate) {
    return (
      '<div class="card">' +
        '<div class="small bold">' + esc(sip.fundName) + '</div>' +
        '<div class="row-between mt-12"><span class="small muted">Current debit date</span><span class="small bold">' + DateUtils.ordinal(currentDay) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Requested date</span><span class="small bold">' + DateUtils.ordinal(requestedDay) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Reauthorization needed</span><span class="small bold">' + (capability.requiresReauth ? 'Yes' : 'No') + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Earliest effective instalment</span><span class="small bold">' + DateUtils.formatIndianDate(computedEffectiveDate) + '</span></div>' +
      '</div>' +
      '<div class="tiny faint mb-8">Your current debit date stays active until this request is approved and its effective date is reached. This is a simulated scheduling request — the real effective date depends on provider rules.</div>'
    );
  }

  /** Request status card (Screen 7). */
  function requestStatusCard(request, sip) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Request ID</span><span class="tiny bold">' + esc(request.id) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Submitted</span><span class="tiny bold">' + DateUtils.formatIndianDate(request.submittedAt ? request.submittedAt.slice(0, 10) : null) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Current status</span>' + requestStatusBadge(request.status) + '</div>' +
        (request.effectiveDate ? '<div class="row-between mt-8"><span class="tiny muted">Expected effective date</span><span class="tiny bold">' + DateUtils.formatIndianDate(request.effectiveDate) + '</span></div>' : '') +
        (request.rejectionReason ? '<div class="row-between mt-8"><span class="tiny muted">Reason</span><span class="tiny bold" style="text-align:right; max-width:60%;">' + esc(request.rejectionReason) + '</span></div>' : '') +
      '</div>'
    );
  }

  /** Scheduling timeline for Screen 8 history view. */
  function schedulingTimeline(requests) {
    if (!requests || !requests.length) return '<div class="tiny muted">No date-change requests yet for this SIP.</div>';
    return '<div class="recovery-timeline">' + requests.map(function (r) {
      return (
        '<div class="recovery-timeline-item">' +
          '<div class="recovery-timeline-dot">' + (REQUEST_STATUS_META[r.status] || {}).icon + '</div>' +
          '<div class="recovery-timeline-content">' +
            '<div class="row-between"><span class="small bold">Requested the ' + DateUtils.ordinal(r.requestedDate) + '</span>' + requestStatusBadge(r.status) + '</div>' +
            '<div class="tiny muted mt-4">Was on the ' + DateUtils.ordinal(r.currentDateAtRequest) + ' at the time of this request.</div>' +
            '<div class="tiny faint mt-4">Submitted ' + DateUtils.formatIndianDate(r.submittedAt ? r.submittedAt.slice(0, 10) : null) + (r.effectiveDate ? ' · Effective ' + DateUtils.formatIndianDate(r.effectiveDate) : '') + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  /** Notification row (Screen 9), styled consistently with Feature 1's notification list. */
  var NOTIF_ICONS = {
    change_pending: '⏳', change_approved: '✅', change_rejected: '❌', change_effective: '🟢',
    mismatch_alert: '⚠️', sip_reminder: '🔔', income_reminder: '💰'
  };
  function schedulingNotificationItem(n) {
    return (
      '<div class="list-row recovery-notif ' + (n.read ? '' : 'recovery-notif-unread') + '" data-sched-notif-id="' + esc(n.id) + '">' +
        '<span style="font-size:18px;">' + (NOTIF_ICONS[n.type] || '🔔') + '</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small">' + esc(n.message) + (!n.read ? ' <span class="recovery-dot"></span>' : '') + '</div>' +
          '<div class="tiny faint mt-4">' + DateUtils.formatIndianDate(n.createdAt ? n.createdAt.slice(0, 10) : null) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Scenario switcher pill row, reusing Feature 1's visual pattern with its own data-action. */
  function scenarioPillRow(scenarios, focusedId) {
    return '<div class="recovery-scenario-row">' + scenarios.map(function (sc) {
      return '<button class="recovery-scenario-pill' + (sc.id === focusedId ? ' active' : '') + '" data-action="focus-sched-scenario" data-scenario-id="' + esc(sc.id) + '">' + esc(sc.shortLabel) + '</button>';
    }).join('') + '</div>';
  }

  return {
    esc: esc, inr: inr,
    requestStatusBadge: requestStatusBadge, mismatchBadge: mismatchBadge,
    sipScheduleRow: sipScheduleRow, mismatchExplanationCard: mismatchExplanationCard, incomeSummary: incomeSummary,
    monthCalendar: monthCalendar, eligibleDatesList: eligibleDatesList, unavailableNotice: unavailableNotice,
    capabilitySummaryCard: capabilitySummaryCard, changeConfirmationCard: changeConfirmationCard,
    requestStatusCard: requestStatusCard, schedulingTimeline: schedulingTimeline,
    schedulingNotificationItem: schedulingNotificationItem, scenarioPillRow: scenarioPillRow
  };
});
