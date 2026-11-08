/**
 * SIP Continuity Insights — pure UI builders. Every function takes plain
 * data and returns an HTML string; no DOM access, no store access.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.DiscontinuationComponents = factory(window.DiscontinuationData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var Status = Data.JourneyStatus;
  var CxlStatus = Data.CancellationStatus;
  var C = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function inr(n) { return Data.inr(n); }
  function dateLabel(iso) { return iso ? DateUtils.formatIndianDate(iso.slice(0, 10)) : '—'; }

  C.esc = esc; C.inr = inr; C.dateLabel = dateLabel;

  C.journeyStatusBadge = function (status) {
    var map = {};
    map[Status.USER_RETAINED] = { cls: 'edu-badge-success', label: '✓ Kept the SIP' };
    map[Status.CANCELLATION_REQUESTED] = { cls: 'edu-badge-amber', label: '⏳ Cancellation requested' };
    map[Status.ABANDONED] = { cls: 'edu-badge-muted', label: 'Abandoned' };
    var m = map[status] || { cls: 'edu-badge-muted', label: status.replace(/_/g, ' ') };
    return '<span class="edu-badge ' + m.cls + '">' + m.label + '</span>';
  };

  C.cancellationStatusBadge = function (status) {
    var map = {};
    map[CxlStatus.REQUESTED] = { cls: 'edu-badge-amber', label: '⏳ Requested' };
    map[CxlStatus.PENDING_PROVIDER_APPROVAL] = { cls: 'edu-badge-amber', label: '⏳ Pending provider approval' };
    map[CxlStatus.EFFECTIVE] = { cls: 'edu-badge-success', label: '✓ Effective' };
    map[CxlStatus.REJECTED] = { cls: 'edu-badge-danger', label: '✗ Rejected' };
    map[CxlStatus.NOT_AVAILABLE] = { cls: 'edu-badge-danger', label: 'Not available through this provider' };
    map[CxlStatus.UNKNOWN] = { cls: 'edu-badge-muted', label: 'Unknown' };
    var m = map[status] || { cls: 'edu-badge-muted', label: status };
    return '<span class="edu-badge ' + m.cls + '">' + m.label + '</span>';
  };

  C.sipManageRow = function (sip, flags) {
    flags = flags || {};
    return '<div class="card disc-sip-row">' +
      '<div class="row gap-12">' +
        '<div class="fund-icon" style="background:' + sip.color + ';">' + esc(sip.fundName.charAt(0)) + '</div>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small bold">' + esc(sip.fundName) + '</div>' +
          '<div class="tiny muted mt-4">' + inr(sip.amount) + '/mo · ' + sip.category + '</div>' +
        '</div>' +
      '</div>' +
      (flags.alreadyCancelled ? '<div class="tiny muted mt-8">This SIP has already been cancelled in this demo.</div>' :
        '<div class="row gap-8 mt-12">' +
          '<button class="btn btn-sm btn-outline" style="flex:1;" data-action="disc-pause" data-sip="' + sip.id + '">Pause SIP</button>' +
          '<button class="btn btn-sm btn-danger-outline" style="flex:1;" data-action="disc-cancel" data-sip="' + sip.id + '">Cancel SIP</button>' +
        '</div>') +
      '</div>';
  };

  C.reasonOptionButton = function (opt, selected) {
    return '<button class="disc-option' + (selected ? ' disc-option-selected' : '') + '" data-action="disc-select-reason" data-reason="' + opt.id + '">' + esc(opt.label) + '</button>';
  };

  C.followUpOptionButton = function (value, selected) {
    return '<button class="disc-option' + (selected ? ' disc-option-selected' : '') + '" data-action="disc-select-followup" data-value="' + esc(value) + '">' + esc(value) + '</button>';
  };

  // Screen 4 tile — a short, tappable preview of the one relevant tool.
  C.helpOfferTile = function (mapping) {
    if (!mapping) return '';
    return '<button class="card disc-help-card" style="text-align:left; width:100%;" data-action="disc-view-help-option">' +
      '<div class="small bold">' + esc(mapping.title) + '</div>' +
      '<div class="tiny muted mt-4">' + esc(mapping.description) + '</div>' +
      '</button>';
  };

  // Screen 5 — full help preview with the Open Tool / Return actions.
  C.helpOfferCard = function (mapping) {
    if (!mapping) return '';
    return '<div class="card disc-help-card">' +
      '<div class="section-header"><h3>' + esc(mapping.title) + '</h3></div>' +
      '<div class="small muted">' + esc(mapping.description) + '</div>' +
      '<button class="btn btn-primary mt-12" data-action="disc-open-help">Open Tool</button>' +
      '<button class="btn btn-outline mt-8" data-action="disc-return-to-cancellation">Return to Cancellation</button>' +
      '</div>';
  };

  C.cancellationRequestCard = function (request) {
    if (!request) return '<div class="tiny muted">No cancellation request has been submitted for this journey yet.</div>';
    return '<div class="card">' +
      '<div class="row-between"><span class="small muted">Status</span>' + C.cancellationStatusBadge(request.status) + '</div>' +
      '<div class="tiny muted mt-8">' + esc(request.providerNote) + '</div>' +
      '<div class="tiny faint mt-8">Submitted ' + dateLabel(request.createdAt) + ' · Simulated provider check-ins: ' + request.checksDone + ' of ' + request.requiredChecks + '</div>' +
      '</div>';
  };

  C.feedbackRecordRow = function (rec, fundName) {
    return '<div class="card">' +
      '<div class="row-between"><span class="small bold">' + esc(fundName || rec.sipId) + '</span>' + (rec.reviewed ? '<span class="edu-badge edu-badge-success">Reviewed</span>' : '') + '</div>' +
      '<div class="tiny muted mt-4">' + esc(rec.reasonCategory ? rec.reasonCategory.replace(/_/g, ' ') : 'No reason given') + ' · ' + dateLabel(rec.createdAt) + '</div>' +
      '<div class="disc-feedback-text mt-8">' + (rec.deletedAt ? '<em>Deleted by user.</em>' : esc(rec.freeTextSanitized || '(no written feedback)')) + '</div>' +
      '<div class="row gap-8 mt-12">' +
        '<select class="field-input disc-theme-select" style="flex:1;" data-action="disc-assign-theme" data-feedback="' + rec.id + '">' +
          '<option value="">Assign a theme…</option>' +
          Data.THEMES.map(function (t) { return '<option value="' + esc(t) + '"' + (rec.theme === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        '<button class="btn btn-sm btn-outline" style="flex:1;" data-action="disc-toggle-reviewed" data-feedback="' + rec.id + '">' + (rec.reviewed ? 'Mark unreviewed' : 'Mark reviewed') + '</button>' +
        (rec.deletedAt ? '' : '<button class="btn btn-sm btn-danger-outline" style="flex:1;" data-action="disc-delete-feedback" data-feedback="' + rec.id + '">Delete</button>') +
      '</div>' +
      '</div>';
  };

  C.journeyHistoryCard = function (row) {
    var j = row.journey;
    var eventLabels = {
      sip_discontinuation_started: 'Cancellation intent initiated',
      discontinuation_feedback_shown: 'Feedback prompt shown',
      discontinuation_feedback_skipped: 'Feedback skipped',
      discontinuation_reason_selected: 'Reason selected',
      discontinuation_feedback_submitted: 'Feedback submitted',
      contextual_help_shown: 'Help option offered',
      contextual_help_opened: 'Help option opened',
      contextual_help_dismissed: 'Help option dismissed',
      cancellation_continued: 'Returned to cancellation',
      cancellation_requested: 'Cancellation requested',
      cancellation_effective: 'Cancellation confirmed effective',
      cancellation_rejected: 'Cancellation rejected by provider',
      user_explicitly_chose_to_continue_sip: 'Explicitly chose to keep the SIP',
      feedback_deleted: 'Feedback deleted by user'
    };
    var timeline = j.events.map(function (e) {
      return '<div class="list-row"><span class="tiny bold" style="flex:1;">' + esc(eventLabels[e.type] || e.type) + '</span><span class="tiny muted">' + dateLabel(e.at) + '</span></div>';
    }).join('');
    return '<div class="card">' +
      '<div class="row-between"><span class="small bold">' + esc(row.fundName) + '</span>' + C.journeyStatusBadge(j.status) + '</div>' +
      (j.demoScenarioId ? '<div class="tiny muted mt-4">Demo scenario ' + esc(j.demoScenarioId.replace('disc-', '').toUpperCase()) + '</div>' : '') +
      '<div class="mt-12">' + timeline + '</div>' +
      (row.request ? '<div class="mt-12">' + C.cancellationRequestCard(row.request) + '</div>' : '') +
      '</div>';
  };

  C.funnelList = function (stages) {
    var max = stages.length ? stages[0].count : 1;
    return stages.map(function (s) {
      var pct = max > 0 ? Math.round((s.count / max) * 100) : 0;
      return '<div class="mt-8"><div class="row-between tiny"><span class="muted">' + esc(s.label) + '</span><span class="bold">' + s.count + '</span></div>' +
        '<div style="height:8px; background:var(--bg); border-radius:999px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:#6c5ce7; border-radius:999px;"></div></div></div>';
    }).join('');
  };

  C.distributionList = function (dist) {
    if (!dist.rows.length && !dist.noReasonGiven) return '<div class="tiny muted">No data yet.</div>';
    var rows = dist.rows.map(function (r) {
      var pct = dist.total > 0 ? Math.round((r.count / dist.total) * 100) : 0;
      return '<div class="list-row"><span class="small" style="flex:1;">' + esc(r.category.replace(/_/g, ' ')) + '</span><span class="small bold">' + r.count + ' · ' + pct + '%</span></div>';
    }).join('');
    var noReasonRow = dist.noReasonGiven ? '<div class="list-row"><span class="small muted" style="flex:1;">No reason given / skipped / prefer not to say</span><span class="small bold">' + dist.noReasonGiven + '</span></div>' : '';
    return rows + noReasonRow;
  };

  C.scenarioPillRow = function (scenarios, focusedId) {
    return '<div class="edu-pill-row">' + scenarios.map(function (s) {
      var active = s.id === focusedId ? ' edu-pill-active' : '';
      return '<button class="edu-pill' + active + '" data-action="disc-focus-scenario" data-scenario="' + s.id + '">' + esc(s.letter) + '</button>';
    }).join('') + '</div>';
  };

  C.filterSelect = function (id, label, options) {
    return '<div><label class="field-label">' + esc(label) + '</label>' +
      '<select class="field-input" id="' + id + '"><option value="">All</option>' +
      options.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') +
      '</select></div>';
  };

  return C;
});
