/**
 * SIP Recovery Assistant — DOM rendering for every recovery screen.
 * Browser-only: queries the real DOM and wires events. Pure markup comes
 * from RecoveryComponents; all state mutation goes through RecoveryStore.
 */
(function () {
  'use strict';

  var Data = window.RecoveryData;
  var C = window.RecoveryComponents;
  var store = new window.RecoveryStore();
  var Analytics = window.RecoveryAnalytics;

  var viewedAlerts = {}; // de-dupes failure_alert_viewed per instalment per session

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function fmtAmount(sip) { return C.inr(sip.amount) + '/mo'; }

  // ───────────────────────── Screen 1 (home banner) ─────────────────────────
  function renderHomeSlot() {
    var slot = $('recovery-home-slot');
    if (!slot) return;
    var focused = getFocusedPair();
    if (focused && (focused.instalment.status === 'failed' || focused.instalment.status === 'pending')) {
      slot.innerHTML = C.alertBanner(focused.instalment, focused.sip);
      markAlertViewed(focused.instalment.id);
    } else {
      var unresolved = store.getUnresolvedInstalments();
      if (unresolved.length === 0) {
        slot.innerHTML = '<div class="card" style="border-color:rgba(31,216,150,0.3);"><div class="row gap-12"><span style="font-size:20px;">✅</span><div class="small bold">All SIP instalments are up to date</div></div></div>';
      } else {
        var sip = store.getSip(unresolved[0].sipId);
        slot.innerHTML = C.alertBanner(unresolved[0], sip);
        markAlertViewed(unresolved[0].id);
      }
    }
    wireDelegatedActions(slot);
  }

  function markAlertViewed(instalmentId) {
    if (viewedAlerts[instalmentId]) return;
    viewedAlerts[instalmentId] = true;
    store.emit('failure_alert_viewed', { instalmentId: instalmentId });
  }

  function getFocusedPair() {
    var inst = store.getFocusedInstalment();
    if (!inst) return null;
    return { instalment: inst, sip: store.getSip(inst.sipId) };
  }

  function wireDelegatedActions(root) {
    qsa(root, '[data-action="resolve-now"]').forEach(function (btn) {
      btn.onclick = function () { window.RecoveryUI.resolveNow(btn.dataset.instalmentId); };
    });
    qsa(root, '[data-action="view-details"]').forEach(function (btn) {
      btn.onclick = function () { window.RecoveryUI.viewDetails(btn.dataset.sipId); };
    });
  }

  // ───────────────────────── Screen 1 (My SIPs section) ─────────────────────────
  function renderSipsSlot() {
    var slot = $('recovery-sips-slot');
    if (!slot) return;
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();

    var pills = scenarios.map(function (sc) {
      return '<button class="recovery-scenario-pill' + (sc.id === focusedId ? ' active' : '') + '" data-scenario-id="' + sc.id + '">' + C.esc(sc.shortLabel) + '</button>';
    }).join('');

    var rows = scenarios.map(function (sc) {
      var inst = store.getInstalment(sc.instalment.id);
      var sip = store.getSip(sc.sip.id);
      return recoverySipRow(inst, sip);
    }).join('');

    slot.innerHTML =
      '<div class="section-header"><h3>SIP Recovery Assistant</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">Switch between 6+ demo scenarios below — each is deterministic and safe to replay.</div>' +
      '<div class="recovery-scenario-row">' + pills + '</div>' +
      rows +
      '<div class="row gap-8 mt-12">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" onclick="RecoveryUI.goHistory()">🧾 History</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" onclick="RecoveryUI.goAnalytics()">📊 Analytics</button>' +
        '<button class="btn btn-danger-outline btn-sm" style="width:auto; flex:1;" onclick="RecoveryUI.confirmResetDemo()">↺ Reset</button>' +
      '</div>';

    qsa(slot, '[data-scenario-id]').forEach(function (btn) {
      btn.onclick = function () { window.RecoveryUI.switchScenario(btn.dataset.scenarioId); };
    });
    wireDelegatedActions(slot);
    updateBellDot();
  }

  function recoverySipRow(inst, sip) {
    var statusHtml = C.statusBadge(inst.status, inst.status === 'failed' && inst.recoveryAvailable === false ? { label: 'Not Available' } : {});
    var actionsHtml;
    if (inst.status === 'failed' || inst.status === 'pending') {
      actionsHtml = '<button class="btn btn-sm btn-primary" style="width:auto;" data-action="resolve-now" data-instalment-id="' + inst.id + '">Resolve</button>';
    } else {
      actionsHtml = '<button class="btn btn-sm btn-outline" style="width:auto;" data-action="view-details" data-sip-id="' + sip.id + '">Details</button>';
    }
    return (
      '<div class="recovery-sip-row">' +
        '<div class="fund-icon" style="background:' + sip.color + ';">' + sip.fundName.charAt(0) + '</div>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="small bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + C.esc(sip.fundName) + '</div>' +
          '<div class="tiny muted mt-4">' + fmtAmount(sip) + ' · ' + C.formatIndianDate(inst.scheduledDate) + '</div>' +
        '</div>' +
        '<div class="col gap-8" style="align-items:flex-end;">' + statusHtml + actionsHtml + '</div>' +
      '</div>'
    );
  }

  function updateBellDot() {
    var dot = $('recovery-bell-dot');
    if (dot) dot.style.display = store.getUnreadCount() > 0 ? 'block' : 'none';
  }

  // ───────────────────────── Screen 2: SIP Details ─────────────────────────
  function renderDetails(sipId) {
    var sip = store.getSip(sipId);
    var body = $('recovery-details-body');
    if (!sip || !body) return;
    var instalments = store.getInstalmentsForSip(sipId);
    var unresolved = instalments.filter(function (i) { return i.status === 'failed' || i.status === 'pending'; });

    var attempts = [];
    instalments.forEach(function (i) { attempts = attempts.concat(store.getPaymentHistory(i.id)); });
    attempts.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    body.innerHTML =
      '<div class="card">' +
        '<div class="row gap-12">' +
          '<div class="fund-icon" style="background:' + sip.color + '; width:50px; height:50px;">' + sip.fundName.charAt(0) + '</div>' +
          '<div><div class="bold small">' + C.esc(sip.fundName) + '</div><div class="tiny muted mt-4">' + sip.category + ' · ' + fmtAmount(sip) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">SIP plan status</span><span class="badge badge-active">Active</span></div>' +
        '<div class="tiny faint mt-4">Plan status is independent of individual instalment outcomes below.</div>' +
        '<div class="row-between mt-12"><span class="small muted">Start date</span><span class="small bold">' + C.formatIndianDate(sip.startDate) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Scheduled day</span><span class="small bold">' + sip.scheduledDay + ' of every month</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Last successful instalment</span><span class="small bold">' + C.formatIndianDate(sip.lastSuccessfulDate) + '</span></div>' +
      '</div>' +
      (unresolved.length ? (
        '<div class="card" style="border-color:rgba(241,55,69,0.3);">' +
          '<div class="section-header"><h3>Unresolved Failed Instalments</h3></div>' +
          unresolved.map(function (i) {
            return '<div class="list-row"><span>' + C.statusBadge(i.status) + '</span><div class="small bold" style="flex:1;">' + C.inr(i.amount) + ' · ' + C.formatIndianDate(i.scheduledDate) + '</div><button class="btn btn-sm btn-primary" style="width:auto;" data-action="resolve-now" data-instalment-id="' + i.id + '">Resolve</button></div>';
          }).join('') +
        '</div>'
      ) : '') +
      '<div class="section-header mt-16"><h3>Instalment Payment History</h3></div>' +
      C.paymentTimeline(attempts);

    wireDelegatedActions(body);
  }

  // ───────────────────────── Screen 3: Failure Explanation ─────────────────────────
  function renderFailure(instalmentId) {
    var inst = store.getInstalment(instalmentId);
    var body = $('recovery-failure-body');
    var actionsEl = $('recovery-failure-actions');
    if (!inst || !body) return;
    var sip = store.getSip(inst.sipId);
    store.emit('recovery_started', { instalmentId: instalmentId });

    var offlineBanner = store.isSimulatingOffline()
      ? '<div class="recovery-offline-banner">📡 Offline mode (demo) — actions will be queued safely and resumed automatically once you are back online.</div>'
      : '';
    body.innerHTML = offlineBanner + C.failureExplanationCard(inst, sip);

    var buttons = [];
    if (inst.status === 'pending') {
      buttons.push(btn('Check Status', 'btn-primary', 'check-status'));
      buttons.push(disabledNote('Retry Unavailable — a payment is already pending verification with your bank.'));
    } else if (inst.status === 'recovered') {
      buttons.push('<div class="tiny muted center-flex">This instalment has already been recovered.</div>');
      buttons.push(btn('View Payment History', 'btn-outline', 'history'));
    } else {
      switch (inst.failureReason) {
        case Data.FailureReason.INSUFFICIENT_BALANCE:
          if (inst.retryPermitted) {
            buttons.push(btn('Retry Payment', 'btn-primary', 'retry'));
          } else {
            buttons.push(disabledNote(inst.retryBlockedReason || 'Retry is not available for this instalment.'));
            buttons.push(btn('Contact Support', 'btn-outline', 'support'));
          }
          break;
        case Data.FailureReason.MANDATE_EXPIRED:
          buttons.push(btn('Renew AutoPay', 'btn-primary', 'renew_mandate'));
          break;
        case Data.FailureReason.BANK_SERVER_ERROR:
          buttons.push(btn('Check Status', 'btn-primary', 'check-status'));
          break;
        case Data.FailureReason.AUTH_FAILURE:
          buttons.push(btn('Reauthorize Payment', 'btn-primary', 'reauthorize'));
          break;
        default:
          buttons.push(btn('Check Status', 'btn-outline', 'check-status'));
          buttons.push(btn('Create Support Ticket', 'btn-primary', 'support'));
      }
    }
    actionsEl.innerHTML = buttons.join('');

    qsa(actionsEl, '[data-recovery-action]').forEach(function (b) {
      b.onclick = function () { window.RecoveryUI.selectAction(instalmentId, b.dataset.recoveryAction); };
    });

    function btn(label, cls, action) {
      return '<button class="btn ' + cls + '" data-recovery-action="' + action + '">' + label + '</button>';
    }
    function disabledNote(msg) {
      return '<div class="card-flat tiny muted" style="text-align:center;">' + C.esc(msg) + '</div>';
    }
  }

  // ───────────────────────── Screen 4: Step-by-step recovery ─────────────────────────
  var STEP_LABELS = ['Review failure', 'Review recovery action', 'Confirm', 'Processing'];

  function renderStepper(ui) {
    var inst = store.getInstalment(ui.instalmentId);
    var sip = store.getSip(inst.sipId);
    var progressEl = $('recovery-stepper-progress');
    var contentEl = $('recovery-stepper-content');
    var navEl = $('recovery-stepper-nav');
    if (!inst || !progressEl) return;

    progressEl.innerHTML = C.recoveryStepper(ui.step, STEP_LABELS);
    var actionCopy = {
      retry: { label: 'Retry Payment', desc: 'We will ask your bank to attempt the debit of ' + C.inr(inst.amount) + ' again.' },
      renew_mandate: { label: 'Renew AutoPay Mandate', desc: 'We will ask your bank to reauthorize automatic debits for this SIP, then retry the instalment.' },
      reauthorize: { label: 'Secure Reauthorization', desc: 'You will securely reauthorize this payment with your bank, then we will retry the debit.' },
      'check-status': { label: 'Check Payment Status', desc: 'We will check the latest confirmation from your bank / payment provider. No new debit is made.' }
    }[ui.actionType] || { label: 'Resolve', desc: '' };

    if (ui.step === 1) {
      contentEl.innerHTML = C.failureExplanationCard(inst, sip);
    } else if (ui.step === 2) {
      contentEl.innerHTML = '<div class="card"><div class="bold small">' + actionCopy.label + '</div><div class="tiny muted mt-8">' + actionCopy.desc + '</div></div>';
    } else if (ui.step === 3) {
      var needsConfirm = ui.actionType === 'renew_mandate' || ui.actionType === 'reauthorize';
      var confirmMsg = needsConfirm
        ? 'Please confirm you want to proceed. This will ' + (ui.actionType === 'renew_mandate' ? 'reauthorize AutoPay with your bank' : 'reauthorize this payment') + ' (simulated).'
        : 'Please confirm you want to proceed with this simulated action.';
      contentEl.innerHTML =
        '<div class="card">' +
          '<div class="bold small">Confirm ' + C.esc(actionCopy.label) + '</div>' +
          '<div class="tiny muted mt-8">' + C.esc(confirmMsg) + '</div>' +
          (needsConfirm ? (
            '<label class="row gap-8 mt-16" style="align-items:flex-start; cursor:pointer;">' +
              '<input type="checkbox" id="recovery-dialog-checkbox" style="margin-top:3px;">' +
              '<span class="tiny">I authorize this action with my bank (demo simulation — no real bank contacted).</span>' +
            '</label>'
          ) : '') +
        '</div>';
    } else if (ui.step === 4) {
      contentEl.innerHTML = '<div class="card center-flex" style="flex-direction:column; gap:10px; padding:32px 18px;">' +
        '<div class="recovery-spinner" aria-hidden="true">⏳</div>' +
        '<div class="small bold">Processing your request…</div>' +
        '<div class="tiny muted" style="text-align:center;">' + (store.isSimulatingOffline() ? 'You appear to be offline — we will keep this safely pending and resume automatically once you reconnect.' : 'Please wait while we verify this with the bank / payment provider (simulated).') + '</div>' +
      '</div>';
    }

    navEl.innerHTML = '';
    if (ui.step > 1 && ui.step < 4) {
      navEl.innerHTML += '<button class="btn btn-outline" style="flex:1;" id="recovery-step-back">Back</button>';
    } else if (ui.step === 1) {
      navEl.innerHTML += '<button class="btn btn-outline" style="flex:1;" id="recovery-step-cancel1">Cancel</button>';
    }
    if (ui.step === 3) {
      navEl.innerHTML += '<button class="btn btn-primary" style="flex:1;" id="recovery-step-continue">Confirm &amp; Proceed</button>';
    } else if (ui.step < 3) {
      navEl.innerHTML += '<button class="btn btn-primary" style="flex:1;" id="recovery-step-continue">Continue</button>';
    }
    var back = $('recovery-step-back'); if (back) back.onclick = function () { window.RecoveryUI.stepperBack(); };
    var cancel1 = $('recovery-step-cancel1'); if (cancel1) cancel1.onclick = function () { window.RecoveryUI.cancelStepper(); };
    var cont = $('recovery-step-continue');
    if (cont) cont.onclick = function () {
      if (ui.step === 3) {
        var needsConfirm = ui.actionType === 'renew_mandate' || ui.actionType === 'reauthorize';
        var checkbox = $('recovery-dialog-checkbox');
        if (needsConfirm && checkbox && !checkbox.checked) {
          window.showToast('Please confirm authorization to continue');
          return;
        }
      }
      window.RecoveryUI.stepperNext();
    };
  }

  // ───────────────────────── Screen 5: Payment Result ─────────────────────────
  function renderResult(payload) {
    var body = $('recovery-result-body');
    if (!body) return;
    var meta = {
      success: { icon: '✅', title: 'Recovery Successful', cls: '' },
      retry_failed: { icon: '❌', title: 'Retry Failed', cls: '' },
      processing: { icon: '⏳', title: 'Payment Processing', cls: '' },
      auth_required: { icon: '🔐', title: 'Authorization Required', cls: '' },
      not_available: { icon: '🚫', title: 'Recovery Not Available', cls: '' }
    }[payload.type] || { icon: 'ℹ️', title: 'Result' };

    body.innerHTML =
      '<div class="px center-flex" style="flex-direction:column; gap:12px; text-align:center; padding-top:40px;">' +
        '<div style="font-size:56px;">' + meta.icon + '</div>' +
        '<div class="screen-title">' + meta.title + '</div>' +
        '<div class="screen-sub">' + C.esc(payload.message) + '</div>' +
        (payload.type === 'success' ? '<div class="sim-chip mt-8">Verified Simulated Payment</div>' : '') +
        '<div class="col gap-8 mt-16" style="width:100%;">' +
          (payload.type === 'not_available' || payload.type === 'retry_failed' ? '<button class="btn btn-outline" id="recovery-result-support">Contact Support</button>' : '') +
          '<button class="btn btn-primary" id="recovery-result-history">View Payment History</button>' +
          '<button class="btn btn-outline" id="recovery-result-home">Back to Dashboard</button>' +
        '</div>' +
      '</div>';

    var h = $('recovery-result-history'); if (h) h.onclick = function () { go('screen-recovery-history'); };
    var d = $('recovery-result-home'); if (d) d.onclick = function () { go('screen-home'); };
    var s = $('recovery-result-support'); if (s) s.onclick = function () { window.RecoveryUI.openSupport(payload.instalmentId); };
  }

  // ───────────────────────── Screen 6: Payment History ─────────────────────────
  function renderHistory() {
    var list = $('recovery-history-list');
    if (!list) return;
    var pairs = store.getAllInstalmentsWithSip();
    if (!pairs.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🧾</div><div class="small">No payment history yet.</div></div>';
      return;
    }
    list.innerHTML = pairs.map(function (p) {
      var attempts = store.getPaymentHistory(p.instalment.id);
      return (
        '<div class="card">' +
          '<div class="row-between"><div class="small bold">' + C.esc(p.sip.fundName) + '</div>' + C.statusBadge(p.instalment.status) + '</div>' +
          '<div class="tiny muted mt-4">' + C.inr(p.instalment.amount) + ' · Attempted ' + C.formatIndianDate(p.instalment.scheduledDate) + '</div>' +
          '<div class="mt-12">' + C.paymentTimeline(attempts) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ───────────────────────── Screen 7: Notifications ─────────────────────────
  function renderNotifications() {
    var list = $('recovery-notif-list');
    var toggle = $('recovery-reminders-toggle');
    var offlineToggle = $('recovery-offline-toggle');
    if (!list) return;
    var state = store.ensureLoaded();
    if (toggle) toggle.checked = !!state.settings.remindersEnabled;
    if (offlineToggle) offlineToggle.checked = !!state.settings.simulateOffline;
    var notifs = store.getNotifications();
    if (!notifs.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><div class="small">No notifications yet.</div></div>';
    } else {
      list.innerHTML = '<div class="card">' + notifs.map(C.notificationItem).join('') + '</div>';
      qsa(list, '.recovery-notif').forEach(function (row) {
        row.onclick = function () { window.RecoveryUI.markNotificationRead(row.dataset.notifId); };
      });
    }
    updateBellDot();
  }

  // ───────────────────────── Screen 8: Support ─────────────────────────
  function renderSupport(instalmentId) {
    var body = $('recovery-support-body');
    if (!body) return;
    var inst = instalmentId ? store.getInstalment(instalmentId) : null;
    var sip = inst ? store.getSip(inst.sipId) : null;
    var existing = store.getSupportTickets().filter(function (t) { return !instalmentId || t.instalmentId === instalmentId; });

    body.innerHTML =
      (inst ? (
        '<div class="card-flat mb-16">' +
          '<div class="tiny muted">Prefilled from</div>' +
          '<div class="small bold mt-4">' + C.esc(sip.fundName) + ' · ' + C.inr(inst.amount) + ' · ' + C.formatIndianDate(inst.scheduledDate) + '</div>' +
          '<div class="tiny muted mt-4">' + C.esc(Data.FAILURE_EXPLANATIONS[inst.failureReason].title) + '</div>' +
        '</div>'
      ) : '') +
      '<label class="field-label">Subject</label>' +
      '<input class="field-input" id="recovery-support-subject" value="' + (inst ? 'Help recovering a failed SIP instalment' : '') + '">' +
      '<label class="field-label mt-16">Describe the issue</label>' +
      '<textarea class="field-input" id="recovery-support-desc" rows="4" style="resize:vertical;">' + (inst ? 'My SIP instalment failed and I need help resolving it.' : '') + '</textarea>' +
      '<div class="tiny faint mt-8">We only share your SIP and instalment details with support — never your bank password, OTP or card details.</div>' +
      '<button class="btn btn-primary mt-16" id="recovery-support-submit">Create Support Ticket</button>' +
      '<div id="recovery-support-result" class="mt-16"></div>' +
      (existing.length ? (
        '<div class="section-header mt-24"><h3>Your Tickets</h3></div>' +
        existing.map(function (t) {
          return '<div class="list-row"><span>🎫</span><div style="flex:1;"><div class="small bold">' + t.ticketNumber + '</div><div class="tiny muted">' + C.esc(t.subject) + '</div></div><span class="badge badge-paused">' + t.status + '</span></div>';
        }).join('')
      ) : '');

    var submit = $('recovery-support-submit');
    if (submit) submit.onclick = function () {
      var subject = $('recovery-support-subject').value.trim() || 'SIP Recovery Support Request';
      var desc = $('recovery-support-desc').value.trim() || 'No additional details provided.';
      var ticket = store.createSupportTicket({ sipId: sip ? sip.id : null, instalmentId: instalmentId || null, subject: subject, description: desc });
      $('recovery-support-result').innerHTML =
        '<div class="card" style="border-color:rgba(31,216,150,0.3);">' +
          '<div class="row gap-12"><span style="font-size:20px;">✅</span><div><div class="small bold">Ticket ' + ticket.ticketNumber + ' created</div><div class="tiny muted mt-4">Status: Open — our team will follow up (simulated).</div></div></div>' +
        '</div>';
      window.showToast('Support ticket ' + ticket.ticketNumber + ' created');
      submit.disabled = true;
    };
  }

  // ───────────────────────── Analytics (demo) ─────────────────────────
  function renderAnalytics() {
    var body = $('recovery-analytics-body');
    if (!body) return;
    var state = store.ensureLoaded();
    var m = Analytics.computeMetrics(state);
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var reasonRows = Object.keys(m.breakdownByReason).map(function (r) {
      var row = m.breakdownByReason[r];
      return '<div class="row-between tiny mt-8"><span class="muted">' + C.esc(r.replace(/_/g, ' ')) + '</span><span class="bold">' + row.recovered + ' / ' + row.total + ' recovered</span></div>';
    }).join('');

    body.innerHTML =
      '<div class="tiny faint mb-16">⚠️ Simulated demo analytics only — computed from local mock data on this device. Does not represent real investor behaviour and does not prove any retention improvement.</div>' +
      '<div class="recovery-metric-grid">' +
        metricTile('Failed instalments', m.failedInstalmentCount) +
        metricTile('Eligible for recovery', m.eligibleRecoveryCount) +
        metricTile('Recovery flow started', pct(m.recoveryFlowInitiationRate)) +
        metricTile('7-day recovery rate', pct(m.verifiedSevenDayRecoveryRate)) +
        metricTile('Pending', m.pendingCount) +
        metricTile('Unresolved', m.unresolvedCount) +
      '</div>' +
      '<div class="card mt-16"><div class="section-header"><h3>Recovery by Failure Reason</h3></div>' + (reasonRows || '<div class="tiny muted">No data yet.</div>') + '</div>';

    function metricTile(label, value) {
      return '<div class="recovery-metric-tile"><div class="tiny muted">' + label + '</div><div class="bold" style="font-size:20px;">' + value + '</div></div>';
    }
  }

  window.RecoveryScreens = {
    store: store,
    renderHomeSlot: renderHomeSlot,
    renderSipsSlot: renderSipsSlot,
    renderDetails: renderDetails,
    renderFailure: renderFailure,
    renderStepper: renderStepper,
    renderResult: renderResult,
    renderHistory: renderHistory,
    renderNotifications: renderNotifications,
    renderSupport: renderSupport,
    renderAnalytics: renderAnalytics,
    updateBellDot: updateBellDot
  };
})();
