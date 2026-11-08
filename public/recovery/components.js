/**
 * SIP Recovery Assistant — reusable, pure HTML-string component builders.
 * No DOM access here (so these are unit-testable from Node); screens.js
 * injects the returned markup into the real DOM and wires interactivity.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else if (typeof window !== 'undefined') {
    window.RecoveryComponents = factory(window.RecoveryData);
  }
})(this, function (Data) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function inr(n) { return Data.inrLabel(n); }
  function formatIndianDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  var STATUS_META = {
    success: { icon: '✅', label: 'Success', cls: 'rbadge-success' },
    recovered: { icon: '✅', label: 'Recovered', cls: 'rbadge-success' },
    failed: { icon: '❌', label: 'Failed', cls: 'rbadge-danger' },
    pending: { icon: '⏳', label: 'Pending', cls: 'rbadge-pending' },
    cancelled: { icon: '🚫', label: 'Cancelled', cls: 'rbadge-muted' },
    still_pending: { icon: '⏳', label: 'Still Pending', cls: 'rbadge-pending' }
  };

  /** Status badge: icon + text label, never color alone. */
  function statusBadge(status, opts) {
    opts = opts || {};
    var meta = STATUS_META[status] || { icon: 'ℹ️', label: status, cls: 'rbadge-muted' };
    var label = opts.label || meta.label;
    return '<span class="rbadge ' + meta.cls + '">' + meta.icon + ' ' + esc(label) + '</span>';
  }

  /** Dashboard / Screen-1 prominent failure alert card. */
  function alertBanner(instalment, sip, opts) {
    opts = opts || {};
    if (!instalment || !sip) return '';
    var isPending = instalment.status === 'pending';
    var headline = isPending
      ? 'Your ' + inr(instalment.amount) + ' SIP instalment for ' + esc(sip.fundName) + ' is still being verified.'
      : 'Your ' + inr(instalment.amount) + ' SIP instalment could not be processed.';
    return (
      '<div class="recovery-alert ' + (isPending ? 'recovery-alert-pending' : 'recovery-alert-danger') + '" role="alert" data-instalment-id="' + esc(instalment.id) + '">' +
        '<div class="recovery-alert-icon">' + (isPending ? '⏳' : '⚠️') + '</div>' +
        '<div class="recovery-alert-body">' +
          '<div class="small bold">' + headline + '</div>' +
          '<div class="tiny muted mt-4">' + esc(sip.fundName) + ' · Attempted ' + formatIndianDate(instalment.scheduledDate) + '</div>' +
          '<div class="row gap-8 mt-12">' +
            '<button class="btn btn-primary btn-sm" style="width:auto; flex:1;" data-action="resolve-now" data-instalment-id="' + esc(instalment.id) + '">Resolve Now</button>' +
            '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" data-action="view-details" data-instalment-id="' + esc(instalment.id) + '" data-sip-id="' + esc(sip.id) + '">View Details</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Vertical recovery/payment timeline for Screen 6 and SIP Details. */
  function paymentTimeline(attempts) {
    if (!attempts || !attempts.length) {
      return '<div class="tiny muted">No payment attempts recorded yet.</div>';
    }
    return '<div class="recovery-timeline">' + attempts.map(function (a) {
      var meta = STATUS_META[a.status] || { icon: '•', label: a.status };
      return (
        '<div class="recovery-timeline-item">' +
          '<div class="recovery-timeline-dot">' + meta.icon + '</div>' +
          '<div class="recovery-timeline-content">' +
            '<div class="row-between">' +
              '<span class="small bold">' + esc(typeLabel(a.type)) + '</span>' +
              statusBadge(a.status) +
            '</div>' +
            '<div class="tiny muted mt-4">' + esc(a.message || '') + '</div>' +
            '<div class="tiny faint mt-4">' + formatIndianDate(a.createdAt) + (a.resolvedAt && a.resolvedAt !== a.createdAt ? ' → verified ' + formatIndianDate(a.resolvedAt) : '') + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  function typeLabel(type) {
    return ({
      original: 'Original Debit', retry: 'Retry Payment', mandate_renewal: 'AutoPay Renewal',
      reauth: 'Reauthorization', status_check: 'Status Check'
    })[type] || type;
  }

  /** Reusable step progress indicator for Screen 4 (reuses existing .step-dots pattern). */
  function recoveryStepper(currentStep, labels) {
    return (
      '<div class="step-dots recovery-stepper" aria-label="Recovery progress, step ' + currentStep + ' of ' + labels.length + '">' +
        labels.map(function (label, i) {
          var state = (i + 1) < currentStep ? 'done' : (i + 1) === currentStep ? 'current' : '';
          return '<div class="step-dot ' + state + '" title="' + esc(label) + '"></div>';
        }).join('') +
      '</div>' +
      '<div class="tiny muted center-flex mt-8">Step ' + currentStep + ' of ' + labels.length + ': ' + esc(labels[currentStep - 1] || '') + '</div>'
    );
  }

  /** Confirmation dialog markup; screens.js wires the confirm/cancel buttons after insertion. */
  function confirmDialog(opts) {
    opts = opts || {};
    return (
      '<div class="recovery-dialog-backdrop" id="recovery-dialog-backdrop">' +
        '<div class="recovery-dialog card" role="dialog" aria-modal="true" aria-labelledby="recovery-dialog-title">' +
          '<div class="screen-title" id="recovery-dialog-title" style="font-size:17px;">' + esc(opts.title || 'Confirm') + '</div>' +
          '<div class="small muted mt-8">' + esc(opts.message || '') + '</div>' +
          (opts.checkboxLabel ? (
            '<label class="row gap-8 mt-16" style="align-items:flex-start; cursor:pointer;">' +
              '<input type="checkbox" id="recovery-dialog-checkbox" style="margin-top:3px;">' +
              '<span class="tiny">' + esc(opts.checkboxLabel) + '</span>' +
            '</label>'
          ) : '') +
          '<div class="row gap-8 mt-24">' +
            '<button class="btn btn-outline" id="recovery-dialog-cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
            '<button class="btn btn-primary" id="recovery-dialog-confirm">' + esc(opts.confirmLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Notification center row for Screen 7. */
  function notificationItem(n) {
    var icons = {
      payment_failed: '⚠️', outstanding_reminder: '🔔', mandate_reminder: '🔁',
      processing_update: '⏳', recovery_success: '✅'
    };
    return (
      '<div class="list-row recovery-notif ' + (n.read ? '' : 'recovery-notif-unread') + '" data-notif-id="' + esc(n.id) + '">' +
        '<span style="font-size:18px;">' + (icons[n.type] || '🔔') + '</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small bold">' + esc(n.title) + (!n.read ? ' <span class="recovery-dot"></span>' : '') + '</div>' +
          '<div class="tiny muted mt-4">' + esc(n.message) + '</div>' +
          '<div class="tiny faint mt-4">' + formatIndianDate(n.createdAt) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Failure-reason explanation card for Screen 3. */
  function failureExplanationCard(instalment, sip) {
    var exp = Data.FAILURE_EXPLANATIONS[instalment.failureReason];
    return (
      '<div class="card">' +
        '<div class="row-between">' +
          '<div class="small muted">Attempted amount</div><div class="bold">' + inr(instalment.amount) + '</div>' +
        '</div>' +
        '<div class="row-between mt-8">' +
          '<div class="small muted">Attempted on</div><div class="small bold">' + formatIndianDate(instalment.scheduledDate) + '</div>' +
        '</div>' +
        '<div class="row-between mt-8">' +
          '<div class="small muted">Status</div>' + statusBadge(instalment.status) +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="bold small">' + esc(exp.title) + '</div>' +
        '<div class="tiny muted mt-8">' + esc(exp.message) + '</div>' +
        '<div class="tiny mt-12" style="color:var(--accent);">💡 ' + esc(exp.guidance) + '</div>' +
      '</div>' +
      '<div class="tiny faint mb-16">DEMO / SIMULATED — no real bank, card or UPI debit is made by this app.</div>'
    );
  }

  return {
    esc: esc, inr: inr, formatIndianDate: formatIndianDate,
    statusBadge: statusBadge, alertBanner: alertBanner, paymentTimeline: paymentTimeline,
    recoveryStepper: recoveryStepper, confirmDialog: confirmDialog, notificationItem: notificationItem,
    failureExplanationCard: failureExplanationCard
  };
});
