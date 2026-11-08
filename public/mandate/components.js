/**
 * AutoPay Health & Mandate Repair Assistant — reusable, pure HTML-string
 * component builders. No DOM access (Node-testable); screens.js wires
 * interactivity after inserting the markup, mirroring Features 1-3's
 * components.js files.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.MandateComponents = factory(window.MandateData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function inr(n) { if (n == null) return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }

  var STATUS_META = {};
  STATUS_META[Data.MandateHealthStatus.ACTIVE] = { icon: '✅', label: 'Active', cls: 'mandate-badge-success' };
  STATUS_META[Data.MandateHealthStatus.PENDING_AUTHORIZATION] = { icon: '⏳', label: 'Pending Authorization', cls: 'mandate-badge-pending' };
  STATUS_META[Data.MandateHealthStatus.REJECTED] = { icon: '❌', label: 'Rejected', cls: 'mandate-badge-danger' };
  STATUS_META[Data.MandateHealthStatus.EXPIRED] = { icon: '⌛', label: 'Expired', cls: 'mandate-badge-danger' };
  STATUS_META[Data.MandateHealthStatus.REVOKED] = { icon: '🚫', label: 'Revoked', cls: 'mandate-badge-danger' };
  STATUS_META[Data.MandateHealthStatus.SUSPENDED] = { icon: '⏸️', label: 'Suspended', cls: 'mandate-badge-amber' };
  STATUS_META[Data.MandateHealthStatus.PROVIDER_VERIFICATION_PENDING] = { icon: '🔌', label: 'Provider Verification Pending', cls: 'mandate-badge-pending' };
  STATUS_META[Data.MandateHealthStatus.UNKNOWN] = { icon: '❓', label: 'Unknown', cls: 'mandate-badge-muted' };
  function healthBadge(status) {
    var meta = STATUS_META[status] || { icon: 'ℹ️', label: status, cls: 'mandate-badge-muted' };
    return '<span class="mandate-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var REQUEST_META = {};
  REQUEST_META[Data.RepairRequestStatus.ISSUE_DETECTED] = { icon: '🔍', label: 'Issue Detected', cls: 'mandate-badge-danger' };
  REQUEST_META[Data.RepairRequestStatus.ACTION_REQUIRED] = { icon: '⚠️', label: 'Action Required', cls: 'mandate-badge-amber' };
  REQUEST_META[Data.RepairRequestStatus.REPAIR_REQUESTED] = { icon: '📤', label: 'Repair Requested', cls: 'mandate-badge-pending' };
  REQUEST_META[Data.RepairRequestStatus.AUTHORIZATION_PENDING] = { icon: '⏳', label: 'Authorization Pending', cls: 'mandate-badge-pending' };
  REQUEST_META[Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING] = { icon: '🔌', label: 'Provider Verification Pending', cls: 'mandate-badge-pending' };
  REQUEST_META[Data.RepairRequestStatus.REPAIRED] = { icon: '✅', label: 'Repaired', cls: 'mandate-badge-success' };
  REQUEST_META[Data.RepairRequestStatus.REJECTED] = { icon: '❌', label: 'Rejected', cls: 'mandate-badge-danger' };
  REQUEST_META[Data.RepairRequestStatus.CANCELLED] = { icon: '🚫', label: 'Cancelled', cls: 'mandate-badge-muted' };
  REQUEST_META[Data.RepairRequestStatus.UNRESOLVED] = { icon: '🔄', label: 'Unresolved — Provider Unavailable', cls: 'mandate-badge-amber' };
  function requestStatusBadge(status) {
    var meta = REQUEST_META[status] || { icon: 'ℹ️', label: status, cls: 'mandate-badge-muted' };
    return '<span class="mandate-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  var METHOD_LABEL = {};
  METHOD_LABEL[Data.PaymentMethod.UPI_AUTOPAY] = 'Demo UPI AutoPay';
  METHOD_LABEL[Data.PaymentMethod.ENACH] = 'Demo eNACH';
  METHOD_LABEL[Data.PaymentMethod.OTHER] = 'Other';
  function methodLabel(method) { return METHOD_LABEL[method] || 'Other'; }

  /** SIP row for Screen 1 (AutoPay Health Overview). */
  function sipHealthRow(sip, health, pendingRequestLabel) {
    return (
      '<div class="list-row mandate-sip-row" data-sip-id="' + esc(sip.id) + '">' +
        '<span class="mandate-sip-dot" style="background:' + esc(sip.color || '#3d99ff') + ';"></span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="row-between">' +
            '<span class="small bold">' + esc(sip.fundName) + '</span>' +
            healthBadge(health.status) +
          '</div>' +
          '<div class="tiny muted mt-4">' + inr(sip.amount) + '/mo · ' + esc(methodLabel(health.capability.paymentMethod)) + (pendingRequestLabel ? ' · ' + esc(pendingRequestLabel) : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="view-mandate" data-sip-id="' + esc(sip.id) + '">Manage</button>' +
      '</div>'
    );
  }

  /** Mandate Details card (Screen 2). Never exposes a full bank account identifier. */
  function mandateDetailsCard(sip, mandate, health, nextInstalmentKey) {
    var capability = health.capability;
    return (
      '<div class="card">' +
        '<div class="row gap-12"><div class="fund-icon" style="background:' + esc(sip.color) + ';">' + esc(sip.fundName.charAt(0)) + '</div>' +
        '<div><div class="bold small">' + esc(sip.fundName) + '</div><div class="tiny muted mt-4">' + inr(sip.amount) + '/mo</div></div></div>' +
        '<div class="row-between mt-12"><span class="small muted">Mandate status</span>' + healthBadge(health.status) + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Mandate reference</span><span class="tiny bold">' + esc(mandate.id.replace('mandate-', 'MNDT-').toUpperCase()) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Payment method</span><span class="tiny bold">' + esc(methodLabel(capability.paymentMethod)) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Linked bank</span><span class="tiny bold">' + esc(mandate.bankName) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Last verified event</span><span class="tiny bold">' + (health.verifiedAt ? DateUtils.formatIndianDate(health.verifiedAt.slice(0, 10)) : 'Not yet verified') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Authorization requirement</span><span class="tiny bold">' + (health.actionRequired ? 'Authorization needed' : 'None currently') + '</span></div>' +
        (capability.maxDebitAmount ? '<div class="row-between mt-8"><span class="tiny muted">Maximum permitted debit</span><span class="tiny bold">' + inr(capability.maxDebitAmount) + '</span></div>' : '') +
        '<div class="row-between mt-8"><span class="tiny muted">Validity / expiry</span><span class="tiny bold">' + (capability.hasValidity ? (capability.validUntil ? DateUtils.formatIndianDate(capability.validUntil) : 'Provider-defined, not disclosed in this demo') : 'Not applicable — this provider does not report an expiry date') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Next scheduled debit</span><span class="tiny bold">' + (nextInstalmentKey ? DateUtils.formatIndianDate(nextInstalmentKey) : '—') + '</span></div>' +
      '</div>'
    );
  }

  /** Issue row for Screen 3's global issue-detection list. */
  function issueRow(sip, health, nextInstalmentKey) {
    return (
      '<div class="list-row mandate-sip-row" data-sip-id="' + esc(sip.id) + '">' +
        '<span style="font-size:18px;">⚠️</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="row-between"><span class="small bold">' + esc(sip.fundName) + '</span>' + healthBadge(health.status) + '</div>' +
          '<div class="tiny muted mt-4">Next instalment: ' + (nextInstalmentKey ? DateUtils.formatIndianDate(nextInstalmentKey) : '—') + '</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="explain-issue" data-sip-id="' + esc(sip.id) + '">Review</button>' +
      '</div>'
    );
  }

  /** Issue explanation card (Screen 4) — copy comes from MandateEngine.explanationFor(). */
  function issueExplanationCard(sip, explanation, health) {
    return (
      '<div class="card">' +
        '<div class="row gap-12"><span style="font-size:22px;">⚠️</span><div class="small bold">' + esc(explanation.title) + '</div></div>' +
        '<div class="tiny muted mt-12">' + esc(explanation.message) + '</div>' +
      '</div>' +
      (health.isMandateProblem ? '' :
        '<div class="card" style="border-color:rgba(31,216,150,0.3);"><div class="tiny">This is not an authorization problem — no mandate repair is needed. If an instalment failed, resolve it directly in SIP Recovery.</div></div>')
    );
  }

  /** Guided repair step card (Screen 5). */
  function repairOptionsCard(health) {
    var capability = health.capability;
    var rows = [];
    if (capability.reauthSupported) rows.push('<button class="btn btn-primary mt-8" data-action="choose-repair" data-type="reauthorization">Reauthorize Existing Mandate</button>');
    if (capability.replacementSupported) rows.push('<button class="btn btn-outline mt-8" data-action="choose-repair" data-type="replacement">Request Replacement Mandate</button>');
    if (!rows.length) rows.push('<div class="tiny muted mt-8">No self-service repair is available for this mandate through this simulated provider. Please contact support.</div>');
    return '<div class="card"><div class="small bold">Supported repair options</div>' + rows.join('') + '</div>';
  }

  /** Simulated authorization summary (Screen 6). Never collects a real OTP/PIN/password/CVV/account number. */
  function authorizationSummaryCard(sip, capability, type) {
    return (
      '<div class="card" style="border-color:rgba(61,153,255,0.3);">' +
        '<div class="row gap-12"><span style="font-size:20px;">🔐</span><div class="small bold">' + (type === 'replacement' ? 'Simulated Replacement Authorization' : 'Simulated Reauthorization') + '</div></div>' +
        '<div class="tiny faint mt-8">Demo only — this never collects a real OTP, UPI PIN, bank password, card CVV or full account number.</div>' +
        '<div class="row-between mt-12"><span class="small muted">SIP</span><span class="small bold">' + esc(sip.fundName) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Payment amount</span><span class="small bold">' + inr(sip.amount) + '</span></div>' +
        (capability.maxDebitAmount ? '<div class="row-between mt-8"><span class="small muted">Mandate limit</span><span class="small bold">' + inr(capability.maxDebitAmount) + '</span></div>' : '') +
        '<div class="row-between mt-8"><span class="small muted">Frequency</span><span class="small bold">Monthly</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Payment method</span><span class="small bold">' + esc(methodLabel(capability.paymentMethod)) + '</span></div>' +
      '</div>'
    );
  }

  /** Replacement request card (Screen 7). The original mandate is never deleted; its history is preserved. */
  function replacementCard(sip, originalHealth, replacement) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Existing mandate status</span>' + healthBadge(originalHealth.status) + '</div>' +
        '<div class="tiny faint mt-8">The original mandate record is preserved, never deleted — only a new replacement request is created.</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Linked SIP</span><span class="small bold">' + esc(sip.fundName) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Replacement status</span>' + replacementStatusBadge(replacement.status) + '</div>' +
        '<div class="row-between mt-8"><span class="small muted">Authorization requirement</span><span class="small bold">' + esc(replacement.authorizationRequirement) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Impact on scheduled instalments</span><span class="small bold">None until effective</span></div>' +
        (replacement.effectiveAt ? '<div class="row-between mt-8"><span class="small muted">Expected effective date</span><span class="small bold">' + DateUtils.formatIndianDate(replacement.effectiveAt) + '</span></div>' : '<div class="row-between mt-8"><span class="small muted">Expected effective date</span><span class="small bold">Not yet known</span></div>') +
      '</div>'
    );
  }
  var REPLACEMENT_META = {};
  REPLACEMENT_META[Data.ReplacementStatus.REQUESTED] = { icon: '📤', label: 'Requested', cls: 'mandate-badge-pending' };
  REPLACEMENT_META[Data.ReplacementStatus.AUTHORIZATION_PENDING] = { icon: '⏳', label: 'Authorization Pending', cls: 'mandate-badge-pending' };
  REPLACEMENT_META[Data.ReplacementStatus.APPROVED_NOT_EFFECTIVE] = { icon: '✅', label: 'Approved — Not Yet Effective', cls: 'mandate-badge-amber' };
  REPLACEMENT_META[Data.ReplacementStatus.EFFECTIVE] = { icon: '🟢', label: 'Effective', cls: 'mandate-badge-success' };
  REPLACEMENT_META[Data.ReplacementStatus.REJECTED] = { icon: '❌', label: 'Rejected', cls: 'mandate-badge-danger' };
  REPLACEMENT_META[Data.ReplacementStatus.CANCELLED] = { icon: '🚫', label: 'Cancelled', cls: 'mandate-badge-muted' };
  function replacementStatusBadge(status) {
    var meta = REPLACEMENT_META[status] || { icon: 'ℹ️', label: status, cls: 'mandate-badge-muted' };
    return '<span class="mandate-badge ' + meta.cls + '">' + meta.icon + ' ' + esc(meta.label) + '</span>';
  }

  /** Repair request status/tracker card (Screen 8). */
  function trackerCard(request) {
    return (
      '<div class="card">' +
        '<div class="row-between"><span class="tiny muted">Request reference</span><span class="tiny bold">' + esc(request.id) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Started</span><span class="tiny bold">' + DateUtils.formatIndianDate(request.submittedAt ? request.submittedAt.slice(0, 10) : null) + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Repair method</span><span class="tiny bold">' + (request.type === 'replacement' ? 'Replacement mandate' : 'Reauthorization') + '</span></div>' +
        '<div class="row-between mt-8"><span class="tiny muted">Current status</span>' + requestStatusBadge(request.status) + '</div>' +
        (request.rejectionReason ? '<div class="row-between mt-8"><span class="tiny muted">Verification result</span><span class="tiny bold" style="text-align:right; max-width:60%;">' + esc(request.rejectionReason) + '</span></div>' : '') +
      '</div>'
    );
  }

  /** Payment readiness card (Screen 9). A repaired mandate is never shown as recovering a past failed instalment. */
  function readinessCard(sip, health, nextInstalmentKey) {
    return (
      '<div class="card" style="border-color:rgba(31,216,150,0.3);">' +
        '<div class="row gap-12"><span style="font-size:22px;">✅</span><div class="small bold">AutoPay authorization is active.</div></div>' +
        '<div class="tiny muted mt-8">Future SIP deductions remain subject to available funds, bank processing, and the payment provider.</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Next SIP date</span><span class="small bold">' + (nextInstalmentKey ? DateUtils.formatIndianDate(nextInstalmentKey) : '—') + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Monthly amount</span><span class="small bold">' + inr(sip.amount) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Mandate readiness</span>' + healthBadge(health.status) + '</div>' +
      '</div>'
    );
  }

  /** Unresolved prior failure link (Screen 9). */
  function unresolvedFailureRow(instalment) {
    return (
      '<div class="list-row">' +
        '<span>⚠️</span>' +
        '<div style="flex:1; min-width:0;"><div class="small bold">A previous instalment of ' + inr(instalment.amount) + ' is still unresolved</div>' +
        '<div class="tiny muted mt-4">Repairing the mandate does not recover this payment automatically.</div></div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="resolve-instalment" data-instalment-id="' + esc(instalment.id) + '">Resolve in SIP Recovery</button>' +
      '</div>'
    );
  }

  /** History timeline (Screen 12), reusing the recovery-timeline visual pattern. Entries are immutable. */
  var EVENT_ICONS = {
    repair_requested: '📤', replacement_requested: '📤', authorization_attempt_submitted: '🔐',
    rejected: '❌', provider_unavailable: '🔄', repaired: '✅',
    replacement_approved_not_effective: '⏳', replacement_effective: '🟢', repair_cancelled: '🚫'
  };
  var EVENT_LABELS = {
    repair_requested: 'Mandate repair requested', replacement_requested: 'Replacement mandate requested',
    authorization_attempt_submitted: 'Authorization attempt submitted', rejected: 'Authorization rejected',
    provider_unavailable: 'Provider temporarily unavailable', repaired: 'Mandate repaired and verified',
    replacement_approved_not_effective: 'Replacement approved — not yet effective',
    replacement_effective: 'Replacement mandate became effective', repair_cancelled: 'Repair request cancelled'
  };
  function historyTimeline(events) {
    if (!events || !events.length) return '<div class="tiny muted">No mandate activity recorded yet for this SIP.</div>';
    return '<div class="recovery-timeline">' + events.map(function (e) {
      return (
        '<div class="recovery-timeline-item">' +
          '<div class="recovery-timeline-dot">' + (EVENT_ICONS[e.type] || '•') + '</div>' +
          '<div class="recovery-timeline-content">' +
            '<div class="small bold">' + esc(EVENT_LABELS[e.type] || e.type) + '</div>' +
            '<div class="tiny faint mt-4">' + DateUtils.formatIndianDate(e.at ? e.at.slice(0, 10) : null) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  /** Notification row (Screen 10). */
  var NOTIF_ICONS = {
    issue_detected: '⚠️', authorization_pending: '⏳', authorization_rejected: '❌',
    provider_status_updated: '🔄', mandate_repaired: '✅',
    upcoming_instalment_unresolved: '🔔', replacement_authorization_required: '🔐'
  };
  function notificationItem(n) {
    return (
      '<div class="list-row recovery-notif ' + (n.read ? '' : 'recovery-notif-unread') + '" data-mandate-notif-id="' + esc(n.id) + '">' +
        '<span style="font-size:18px;">' + (NOTIF_ICONS[n.type] || '🔔') + '</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small">' + esc(n.message) + (!n.read ? ' <span class="recovery-dot"></span>' : '') + '</div>' +
          '<div class="tiny faint mt-4">' + DateUtils.formatIndianDate(n.createdAt ? n.createdAt.slice(0, 10) : null) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Scenario switcher pill row, reusing Features 1-3's visual pattern. */
  function scenarioPillRow(scenarios, focusedId) {
    return '<div class="recovery-scenario-row">' + scenarios.map(function (sc) {
      return '<button class="recovery-scenario-pill' + (sc.id === focusedId ? ' active' : '') + '" data-action="focus-mandate-scenario" data-scenario-id="' + esc(sc.id) + '">' + esc(sc.shortLabel) + '</button>';
    }).join('') + '</div>';
  }

  return {
    esc: esc, inr: inr, methodLabel: methodLabel,
    healthBadge: healthBadge, requestStatusBadge: requestStatusBadge, replacementStatusBadge: replacementStatusBadge,
    sipHealthRow: sipHealthRow, mandateDetailsCard: mandateDetailsCard, issueRow: issueRow,
    issueExplanationCard: issueExplanationCard, repairOptionsCard: repairOptionsCard,
    authorizationSummaryCard: authorizationSummaryCard, replacementCard: replacementCard,
    trackerCard: trackerCard, readinessCard: readinessCard, unresolvedFailureRow: unresolvedFailureRow,
    historyTimeline: historyTimeline, notificationItem: notificationItem, scenarioPillRow: scenarioPillRow
  };
});
