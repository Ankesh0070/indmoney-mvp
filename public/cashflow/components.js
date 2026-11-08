/**
 * SIP Cash-Flow Planner — pure HTML-string component builders. No DOM
 * access (Node-testable); screens.js wires interactivity after insertion,
 * mirroring Features 1-4's own components.js files.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.CashFlowComponents = factory(window.CashFlowData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function inr(paise) { if (paise == null) return '—'; return '₹' + Math.round(paise / 100).toLocaleString('en-IN'); }
  function inrSigned(paise) {
    if (paise == null) return '—';
    var sign = paise < 0 ? '-' : '+';
    return sign + '₹' + Math.round(Math.abs(paise) / 100).toLocaleString('en-IN');
  }
  function dateLabel(key) { return DateUtils.formatIndianDate(key); }

  var GapStatus = Data.GapStatus;
  var GAP_META = {};
  GAP_META[GapStatus.NO_GAP] = { icon: '✅', label: 'No estimated gap', cls: 'cf-badge-success' };
  GAP_META[GapStatus.ESTIMATED_GAP] = { icon: '⚠️', label: 'Estimated gap', cls: 'cf-badge-danger' };
  GAP_META[GapStatus.SAME_DAY_UNCERTAIN] = { icon: '❔', label: 'Same-day timing uncertain', cls: 'cf-badge-amber' };
  GAP_META[GapStatus.INSUFFICIENT_DATA] = { icon: 'ℹ️', label: 'Not enough information', cls: 'cf-badge-muted' };
  function gapBadge(status) {
    var meta = GAP_META[status] || { icon: 'ℹ️', label: status, cls: 'cf-badge-muted' };
    return '<span class="cf-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var EVENT_ICON = { opening: '🏦', income: '💰', expense: '🧾', sip: '🔁' };

  /** SIP commitment row — used by the calendar day detail, breakdown list and action center. */
  function occurrenceRow(occ, opts) {
    opts = opts || {};
    var mh = occ.mandateHealth;
    var mandateFlag = (mh && mh.actionRequired)
      ? '<div class="tiny cf-warn mt-4">🔐 AutoPay authorization needs attention</div>' : '';
    var statusTag = occ.instalmentStatus
      ? '<span class="cf-badge cf-badge-muted">' + esc(occ.instalmentStatus) + '</span>'
      : '<span class="cf-badge ' + (occ.confirmed ? 'cf-badge-success' : 'cf-badge-pending') + '">' + (occ.confirmed ? 'Confirmed date' : 'Projected date') + '</span>';
    return (
      '<div class="list-row cf-row" data-sip-id="' + esc(occ.sipId) + '">' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="row-between"><span class="small bold">' + esc(occ.fundName) + '</span><span class="small bold">' + inr(occ.amountPaise) + '</span></div>' +
          '<div class="tiny muted mt-4">' + dateLabel(occ.dateKey) + (opts.hideStatus ? '' : ' · ') + (opts.hideStatus ? '' : statusTag) + '</div>' +
          mandateFlag +
        '</div>' +
        (opts.noAction ? '' : '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="view-cf-sip" data-sip-id="' + esc(occ.sipId) + '">View</button>') +
      '</div>'
    );
  }

  function groupedBreakdown(title, occurrences) {
    if (!occurrences.length) return '';
    return (
      '<div class="section-header mt-16"><h3>' + esc(title) + '</h3><span class="tiny muted">' + inr(occurrences.reduce(function (s, o) { return s + o.amountPaise; }, 0)) + '</span></div>' +
      occurrences.map(function (o) { return occurrenceRow(o); }).join('')
    );
  }

  function timelineEntry(entry, maxAbsBalance) {
    var icon = EVENT_ICON[entry.kind] || '•';
    var amountCls = entry.amountPaise < 0 ? 'cf-amount-neg' : 'cf-amount-pos';
    var bar = '';
    if (entry.closingBalancePaise != null && maxAbsBalance > 0) {
      var pct = Math.max(4, Math.min(100, Math.round((Math.abs(entry.closingBalancePaise) / maxAbsBalance) * 100)));
      bar = '<div class="cf-bar-track"><div class="cf-bar-fill ' + (entry.closingBalancePaise < 0 ? 'cf-bar-neg' : 'cf-bar-pos') + '" style="width:' + pct + '%;"></div></div>';
    }
    return (
      '<div class="recovery-timeline-item">' +
        '<div class="recovery-timeline-dot">' + icon + '</div>' +
        '<div class="recovery-timeline-content">' +
          '<div class="row-between"><span class="small bold">' + esc(entry.label) + '</span><span class="small bold ' + amountCls + '">' + inrSigned(entry.amountPaise) + '</span></div>' +
          '<div class="tiny muted mt-4">' + dateLabel(entry.dateKey) + (entry.uncertain ? ' · estimated window' : '') + '</div>' +
          (entry.closingBalancePaise != null
            ? '<div class="tiny mt-4">Estimated balance after: <b>' + inr(entry.closingBalancePaise) + '</b></div>' + bar
            : '<div class="tiny muted mt-4">No opening cash estimate on record — balance not shown</div>') +
        '</div>' +
      '</div>'
    );
  }

  function gapCard(gap) {
    var explain;
    if (gap.status === GapStatus.ESTIMATED_GAP) {
      explain = 'Based on the information you entered, your estimated cash available before this payment may be lower than the scheduled SIP amount.';
    } else if (gap.status === GapStatus.SAME_DAY_UNCERTAIN) {
      explain = 'Expected income is dated the same day as this SIP. We never assume it lands before the debit, so this is shown as uncertain rather than a confirmed gap.';
    } else if (gap.status === GapStatus.INSUFFICIENT_DATA) {
      explain = 'Add an opening cash estimate to check this date for a potential shortfall.';
    } else {
      explain = 'Based on the information you entered, your estimated cash on hand covers this payment.';
    }
    return (
      '<div class="card mt-8">' +
        '<div class="row-between"><span class="small bold">' + dateLabel(gap.dateKey) + '</span>' + gapBadge(gap.status) + '</div>' +
        '<div class="tiny muted mt-4">Scheduled SIP total: ' + inr(gap.totalPaise) + (gap.availableBeforePaise != null ? ' · Estimated available before: ' + inr(gap.availableBeforePaise) : '') + '</div>' +
        (gap.gapPaise > 0 ? '<div class="tiny cf-warn mt-4">Estimated gap: ' + inr(gap.gapPaise) + '</div>' : '') +
        '<div class="tiny mt-8">' + esc(explain) + '</div>' +
      '</div>'
    );
  }

  function whatIfCard(label, projection) {
    return (
      '<div class="card">' +
        '<div class="small bold">' + esc(label) + '</div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Scheduled SIP total (30 days)</span><span class="tiny bold">' + inr(projection.totalSipPaise) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Projected closing cash</span><span class="tiny bold">' + (projection.hasOpeningBalance ? inr(projection.closingCashPaise) : 'Not available — no opening cash estimate') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Estimated gap dates</span><span class="tiny bold">' + projection.gapAnalysis.filter(function (g) { return g.status === 'estimated_gap'; }).length + '</span></div>' +
      '</div>'
    );
  }

  function reminderItem(n) {
    return (
      '<div class="recovery-timeline-item">' +
        '<div class="recovery-timeline-dot">🔔</div>' +
        '<div class="recovery-timeline-content"><div class="small' + (n.read ? ' muted' : ' bold') + '">' + esc(n.message) + '</div><div class="tiny muted mt-4">' + new Date(n.createdAt).toLocaleDateString('en-IN') + '</div></div>' +
      '</div>'
    );
  }

  var ACTION_META = {};
  ACTION_META[Data.ActionType.REVIEW_PAYMENT] = { icon: '💳', label: 'Review SIP Payment', sub: 'Resolve a failed or pending instalment in SIP Recovery.' };
  ACTION_META[Data.ActionType.REVIEW_DATE] = { icon: '📅', label: 'Review SIP Date', sub: 'Request or check a debit-date change in Salary-Aligned Scheduling.' };
  ACTION_META[Data.ActionType.REVIEW_PAUSE] = { icon: '⏸️', label: 'Review Pause Options', sub: 'Temporarily pause or resume this SIP.' };
  ACTION_META[Data.ActionType.CHECK_AUTOPAY] = { icon: '🔐', label: 'Check AutoPay Status', sub: 'Inspect or repair this SIP’s AutoPay mandate.' };
  ACTION_META[Data.ActionType.UPDATE_PROFILE] = { icon: '✏️', label: 'Update Income & Expenses', sub: 'Keep your cash-flow assumptions current.' };
  function actionRow(type, sipId) {
    var meta = ACTION_META[type];
    return (
      '<button class="list-row cf-row" style="width:100%; text-align:left; border:none; background:none; cursor:pointer;" data-action="cf-action" data-type="' + esc(type) + '" data-sip-id="' + esc(sipId || '') + '">' +
        '<span style="font-size:20px;">' + meta.icon + '</span>' +
        '<div style="flex:1; min-width:0;"><div class="small bold">' + esc(meta.label) + '</div><div class="tiny muted mt-4">' + esc(meta.sub) + '</div></div>' +
        '<span class="tiny muted">›</span>' +
      '</button>'
    );
  }

  /** Lightweight month calendar grid. `eventsByDate` maps 'YYYY-MM-DD' -> array of {kind}. */
  function calendarGrid(year, month0, eventsByDate, selectedKey, todayKey) {
    var first = DateUtils.makeKey(year, month0, 1);
    var p0 = DateUtils.parseKey(first);
    var firstWeekday = new Date(p0.year, p0.month0, 1).getDay();
    var daysInMonth = DateUtils.daysInMonth(year, month0);
    var cells = [];
    for (var i = 0; i < firstWeekday; i++) cells.push('<div class="cf-cal-cell cf-cal-empty"></div>');
    for (var d = 1; d <= daysInMonth; d++) {
      var key = DateUtils.makeKey(year, month0, d);
      var events = eventsByDate[key] || [];
      var kinds = {};
      events.forEach(function (e) { kinds[e.kind] = true; });
      var dots = Object.keys(kinds).map(function (k) { return '<span class="cf-cal-dot cf-cal-dot-' + k + '"></span>'; }).join('');
      var cls = 'cf-cal-cell' + (key === selectedKey ? ' selected' : '') + (key === todayKey ? ' today' : '');
      cells.push('<button class="' + cls + '" data-action="cf-select-date" data-date-key="' + key + '"><span class="cf-cal-daynum">' + d + '</span><span class="cf-cal-dots">' + dots + '</span></button>');
    }
    return (
      '<div class="cf-cal-weekdays">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="cf-cal-grid">' + cells.join('') + '</div>'
    );
  }

  function scenarioPillRow(scenarios, focusedId) {
    return '<div class="recovery-scenario-row">' + scenarios.map(function (sc) {
      return '<button class="recovery-scenario-pill' + (sc.id === focusedId ? ' active' : '') + '" data-action="focus-cf-scenario" data-scenario-id="' + esc(sc.id) + '">' + esc(sc.shortLabel) + '</button>';
    }).join('') + '</div>';
  }

  return {
    esc: esc, inr: inr, inrSigned: inrSigned, dateLabel: dateLabel,
    gapBadge: gapBadge, occurrenceRow: occurrenceRow, groupedBreakdown: groupedBreakdown,
    timelineEntry: timelineEntry, gapCard: gapCard, whatIfCard: whatIfCard, reminderItem: reminderItem,
    actionRow: actionRow, calendarGrid: calendarGrid, scenarioPillRow: scenarioPillRow
  };
});
