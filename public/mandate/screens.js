/**
 * AutoPay Health & Mandate Repair Assistant — DOM rendering for every
 * mandate-health screen. Browser-only: queries the real DOM and wires
 * events. Pure markup comes from MandateComponents; all state mutation
 * goes through MandateStore, which itself only ever touches Feature 1's
 * RecoveryStore through its additive API, reads Feature 2's
 * SchedulingStore, and calls Feature 3's additive seedExternalPause once.
 */
(function () {
  'use strict';

  var Data = window.MandateData;
  var DateUtils = window.SchedulingDateUtils;
  var C = window.MandateComponents;
  var Analytics = window.MandateAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var schedulingStore = window.SchedulingScreens.store;
  var pauseStore = window.PauseScreens ? window.PauseScreens.store : null;
  var store = new window.MandateStore({ recoveryStore: recoveryStore, schedulingStore: schedulingStore, pauseStore: pauseStore });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) { return C.esc(s); }

  function latestFailedInstalment(sipId) {
    var list = recoveryStore.getInstalmentsForSip(sipId).filter(function (i) { return i.status === 'failed'; });
    return list.length ? list[list.length - 1] : null;
  }

  // ───────────────────────── Entry slot inside screen-sips ─────────────────────────
  function renderEntrySlot() {
    var slot = $('mandate-sips-slot');
    if (!slot) return;
    var sips = store.getAllMandateSips();
    var needingAction = sips.filter(function (s) { return store.getMandateHealth(s.id).actionRequired; }).length;

    slot.innerHTML =
      '<div class="section-header"><h3>AutoPay Health</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">We check your SIPs’ AutoPay authorizations and help you repair any that need attention — simulated, never a real bank connection.</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Mandates tracked</span><span class="small bold">' + sips.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Need action</span><span class="small bold">' + needingAction + '</span></div>' +
        '<button class="btn btn-primary mt-16" id="mandate-entry-open">Open AutoPay Health</button>' +
      '</div>';
    var open = $('mandate-entry-open'); if (open) open.onclick = function () { window.MandateUI.goDashboard(); };
  }

  // ───────────────────────── Screen 1: AutoPay Health Overview ─────────────────────────
  function renderDashboard() {
    var body = $('mandate-dashboard-body');
    if (!body) return;
    store.emit(Analytics.Events.HEALTH_VIEWED, {});
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();
    var sips = store.getAllMandateSips();

    var healthy = 0, requiringAction = 0, pendingAuth = 0, unknownCount = 0;
    var rows = sips.map(function (sip) {
      var health = store.getMandateHealth(sip.id);
      if (health.status === Data.MandateHealthStatus.ACTIVE) healthy++;
      else if (health.status === Data.MandateHealthStatus.PENDING_AUTHORIZATION || health.status === Data.MandateHealthStatus.PROVIDER_VERIFICATION_PENDING) pendingAuth++;
      else if (health.status === Data.MandateHealthStatus.UNKNOWN) unknownCount++;
      else if (health.actionRequired) requiringAction++;
      var openRepair = store.getOpenRepairRequestsForSip(sip.id);
      var label = openRepair.length ? 'repair in progress' : null;
      return C.sipHealthRow(sip, health, label);
    }).join('');

    body.innerHTML =
      '<div class="tiny faint mb-12">⚠️ Demo prototype — all authorizations below are simulated. No real bank, UPI or eNACH connection is made.</div>' +
      C.scenarioPillRow(scenarios, focusedId) +
      '<div class="recovery-metric-grid mt-16">' +
        '<div class="recovery-metric-tile"><div class="tiny muted">SIPs with mandates</div><div class="bold" style="font-size:20px;">' + sips.length + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Healthy mandates</div><div class="bold" style="font-size:20px;">' + healthy + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Need action</div><div class="bold" style="font-size:20px;">' + requiringAction + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Pending authorization</div><div class="bold" style="font-size:20px;">' + pendingAuth + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Unknown status</div><div class="bold" style="font-size:20px;">' + unknownCount + '</div></div>' +
      '</div>' +
      '<button class="btn btn-primary mt-16" id="mandate-dash-review">Review AutoPay</button>' +
      '<div class="section-header mt-16"><h3>Your SIPs</h3></div>' +
      (rows || '<div class="empty-state"><div class="emoji">🔐</div><div class="small">No SIP mandates tracked yet.</div></div>') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="mandate-dash-notifs">🔔 Notifications</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="mandate-dash-analytics">📊 Analytics</button>' +
      '</div>' +
      '<button class="btn btn-danger-outline btn-sm mt-8" id="mandate-dash-reset">↺ Reset AutoPay Demo Data</button>';

    qsa(body, '[data-action="focus-mandate-scenario"]').forEach(function (btn) {
      btn.onclick = function () { window.MandateUI.switchScenario(btn.dataset.scenarioId); };
    });
    qsa(body, '[data-action="view-mandate"]').forEach(function (btn) {
      btn.onclick = function () { window.MandateUI.viewMandate(btn.dataset.sipId); };
    });
    $('mandate-dash-review').onclick = function () { window.MandateUI.goIssues(); };
    $('mandate-dash-notifs').onclick = function () { window.MandateUI.goNotifications(); };
    $('mandate-dash-analytics').onclick = function () { window.MandateUI.goAnalytics(); };
    $('mandate-dash-reset').onclick = function () { window.MandateUI.confirmResetDemo(); };
  }

  // ───────────────────────── Screen 2: Mandate Details ─────────────────────────
  function renderDetails(sipId) {
    var body = $('mandate-details-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    if (!sip) return;
    var mandate = recoveryStore.getMandateForSip(sipId);
    var health = store.getMandateHealth(sipId);
    var nextKey = store.getNextInstalmentDateKey(sipId);
    var pendingSchedChange = schedulingStore.getOpenRequestsForSip(sipId);
    var pauseLifecycle = pauseStore ? pauseStore.getLifecycle(sipId) : 'active';
    var openRepair = store.getOpenRepairRequestsForSip(sipId);

    body.innerHTML =
      C.mandateDetailsCard(sip, mandate, health, nextKey) +
      (pendingSchedChange.length ? '<div class="card"><div class="tiny">📅 A Feature 2 debit-date change is pending for this SIP' + (pendingSchedChange[0].status === 'requires_reauthorization' ? ' and needs mandate reauthorization' : '') + '.</div></div>' : '') +
      (pauseStore && pauseLifecycle === 'paused' ? '<div class="card"><div class="tiny">⏸️ This SIP is currently paused. You can inspect and repair its mandate, but no payment will be executed and the SIP will not be resumed automatically.</div></div>' : '') +
      '<div class="row gap-8 mt-16">' +
        (health.actionRequired ? (openRepair.length
          ? '<button class="btn btn-primary" style="flex:1;" id="mandate-details-track">View Repair Status</button>'
          : '<button class="btn btn-primary" style="flex:1;" id="mandate-details-repair">Start Repair</button>') : '') +
      '</div>' +
      '<button class="btn btn-outline mt-8" id="mandate-details-history">View Mandate History</button>' +
      '<button class="btn btn-outline mt-8" id="mandate-details-return">Return to SIP Details</button>';

    var repairBtn = $('mandate-details-repair'); if (repairBtn) repairBtn.onclick = function () { window.MandateUI.goRepair(sipId); };
    var trackBtn = $('mandate-details-track'); if (trackBtn) trackBtn.onclick = function () { window.MandateUI.viewRepairRequest(openRepair[0].id); };
    $('mandate-details-history').onclick = function () { window.MandateUI.goHistory(sipId); };
    $('mandate-details-return').onclick = function () { window.RecoveryUI.viewDetails(sipId); };
  }

  // ───────────────────────── Screen 3: Mandate Issue Detection ─────────────────────────
  function renderIssues() {
    var body = $('mandate-issues-body');
    if (!body) return;
    var sips = store.getAllMandateSips().filter(function (s) { return store.getMandateHealth(s.id).actionRequired; });
    body.innerHTML =
      '<div class="tiny muted mb-12">These are mandate problems detected from simulated provider events — never estimated from unrelated payment data, and insufficient balance is never classified here.</div>' +
      (sips.length
        ? sips.map(function (sip) { return C.issueRow(sip, store.getMandateHealth(sip.id), store.getNextInstalmentDateKey(sip.id)); }).join('')
        : '<div class="empty-state"><div class="emoji">✅</div><div class="small">No mandate issues detected right now.</div></div>');
    qsa(body, '[data-action="explain-issue"]').forEach(function (btn) {
      btn.onclick = function () { window.MandateUI.goExplain(btn.dataset.sipId); };
    });
  }

  // ───────────────────────── Screen 4: Mandate Issue Explanation ─────────────────────────
  function renderExplain(sipId) {
    var body = $('mandate-explain-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var health = store.getMandateHealth(sipId);
    var explanation = window.MandateEngine.explanationFor(health.issueType);
    store.emit(Analytics.Events.ISSUE_DETAILS_VIEWED, { sipId: sipId, issueType: health.issueType });
    store.emit(Analytics.Events.ISSUE_DETECTED, { sipId: sipId, issueType: health.issueType });

    var failedInst = latestFailedInstalment(sipId);
    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      C.issueExplanationCard(sip, explanation, health) +
      (failedInst && !health.isMandateProblem ? '<button class="btn btn-primary mt-8" id="mandate-explain-resolve">Resolve Failed Instalment in SIP Recovery</button>' : '') +
      (health.actionRequired ? '<button class="btn btn-primary mt-16" id="mandate-explain-repair">Start Guided Repair</button>' : '') +
      '<button class="btn btn-outline mt-8" id="mandate-explain-back">Back to AutoPay Health</button>';

    var resolveBtn = $('mandate-explain-resolve'); if (resolveBtn) resolveBtn.onclick = function () { window.RecoveryUI.resolveNow(failedInst.id); };
    var repairBtn = $('mandate-explain-repair'); if (repairBtn) repairBtn.onclick = function () { window.MandateUI.goRepair(sipId); };
    $('mandate-explain-back').onclick = function () { window.MandateUI.goDashboard(); };
  }

  // ───────────────────────── Screen 5: Guided Mandate Repair ─────────────────────────
  function renderRepair(sipId) {
    var body = $('mandate-repair-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var health = store.getMandateHealth(sipId);
    var explanation = window.MandateEngine.explanationFor(health.issueType);
    var openRepair = store.getOpenRepairRequestsForSip(sipId);

    if (openRepair.length) {
      body.innerHTML = '<div class="tiny muted mb-12">A repair request for this SIP is already in progress.</div>';
      window.MandateUI.viewRepairRequest(openRepair[0].id);
      return;
    }

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="tiny muted mt-4 mb-12">Step 1 of 3 — Review the issue</div>' +
      '<div class="card"><div class="small bold">' + esc(explanation.title) + '</div><div class="tiny muted mt-8">' + esc(explanation.message) + '</div></div>' +
      '<div class="tiny muted mt-16 mb-4">Step 2 of 3 — Choose a supported repair option</div>' +
      C.repairOptionsCard(health) +
      '<button class="btn btn-outline mt-16" id="mandate-repair-support">Contact Support Instead</button>' +
      '<button class="btn btn-outline mt-8" id="mandate-repair-back">Cancel</button>';

    qsa(body, '[data-action="choose-repair"]').forEach(function (btn) {
      btn.onclick = function () { window.MandateUI.confirmRepairType(sipId, btn.dataset.type); };
    });
    $('mandate-repair-support').onclick = function () { window.MandateUI.goSupport(sipId, 'unsupported_reauthorization'); };
    $('mandate-repair-back').onclick = function () { window.MandateUI.goDetails(sipId); };
  }

  // ───────────────────────── Screen 6: Simulated Reauthorization / Authorization ─────────────────────────
  function renderReauth(requestId) {
    var body = $('mandate-reauth-body');
    if (!body) return;
    var request = store.getRepairRequest(requestId);
    if (!request) return;
    var sip = recoveryStore.getSip(request.sipId);
    var capability = store.getCapability(request.sipId);

    body.innerHTML =
      '<div class="tiny muted mb-12">Step 3 of 6 — Confirm your intent, then complete the simulated provider authorization.</div>' +
      C.authorizationSummaryCard(sip, capability, request.type) +
      '<label class="row gap-8 mt-16" style="align-items:flex-start; cursor:pointer;">' +
        '<input type="checkbox" id="mandate-reauth-checkbox" style="margin-top:3px;">' +
        '<span class="tiny">I confirm I want to authorize this AutoPay ' + (request.type === 'replacement' ? 'replacement' : 'reauthorization') + ' request.</span>' +
      '</label>' +
      '<button class="btn btn-primary mt-16" id="mandate-reauth-submit">Authorize (Demo)</button>' +
      '<button class="btn btn-outline mt-8" id="mandate-reauth-cancel">Cancel</button>';

    $('mandate-reauth-cancel').onclick = function () { window.MandateUI.goDetails(request.sipId); };
    var submitBtn = $('mandate-reauth-submit');
    var submitted = false;
    submitBtn.onclick = function () {
      if (submitted) return;
      if (!$('mandate-reauth-checkbox').checked) { window.showToast('Please confirm your intent before continuing'); return; }
      submitted = true;
      submitBtn.disabled = true;
      window.MandateUI.submitAuthorization(requestId);
    };
  }

  // ───────────────────────── Screen 7: Mandate Replacement Flow ─────────────────────────
  function renderReplacement(requestId) {
    var body = $('mandate-replacement-body');
    if (!body) return;
    var request = store.getRepairRequest(requestId);
    if (!request || !request.replacementRequestId) { window.MandateUI.goTracker(requestId); return; }
    var sip = recoveryStore.getSip(request.sipId);
    var replacement = store.getReplacementRequest(request.replacementRequestId);
    var health = store.getMandateHealth(request.sipId);

    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      C.replacementCard(sip, health, replacement) +
      '<button class="btn btn-primary mt-16" id="mandate-replacement-track">View Repair Status</button>' +
      '<button class="btn btn-outline mt-8" id="mandate-replacement-return">Return to SIP Details</button>';

    $('mandate-replacement-track').onclick = function () { window.MandateUI.goTracker(requestId); };
    $('mandate-replacement-return').onclick = function () { window.RecoveryUI.viewDetails(request.sipId); };
  }

  // ───────────────────────── Screen 8: Verification & Status Tracker ─────────────────────────
  function renderTracker(requestId) {
    var body = $('mandate-tracker-body');
    if (!body) return;
    var request = store.getRepairRequest(requestId);
    if (!request) { body.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><div class="small">Request not found.</div></div>'; return; }
    var sip = recoveryStore.getSip(request.sipId);

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="mt-12">' + C.trackerCard(request) + '</div>' +
      (request.status === Data.RepairRequestStatus.REPAIR_REQUESTED || request.status === Data.RepairRequestStatus.AUTHORIZATION_PENDING || request.status === Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING || request.status === Data.RepairRequestStatus.UNRESOLVED
        ? '<button class="btn btn-outline mt-8" id="mandate-tracker-check">Check Status</button>' : '') +
      (Data.CANCELLABLE_REPAIR_STATUSES.indexOf(request.status) !== -1 ? '<button class="btn btn-danger-outline mt-8" id="mandate-tracker-cancel">Cancel Request</button>' : '') +
      (request.type === 'replacement' && request.replacementRequestId ? '<button class="btn btn-outline mt-8" id="mandate-tracker-replacement">View Replacement Details</button>' : '') +
      (request.status === Data.RepairRequestStatus.REPAIRED ? '<button class="btn btn-primary mt-8" id="mandate-tracker-readiness">View Payment Readiness</button>' : '') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="mandate-tracker-details">View Details</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="mandate-tracker-return">Return to SIP</button>' +
      '</div>' +
      '<button class="btn btn-outline mt-8" id="mandate-tracker-support">Contact Support</button>';

    var check = $('mandate-tracker-check'); if (check) check.onclick = function () { store.checkRepairStatus(requestId); renderTracker(requestId); };
    var cancel = $('mandate-tracker-cancel'); if (cancel) cancel.onclick = function () {
      var res = store.cancelRepairRequest(requestId);
      if (!res.ok) { window.showToast('This request cannot be cancelled right now.'); return; }
      window.showToast('Repair request cancelled');
      renderTracker(requestId);
    };
    var replacementBtn = $('mandate-tracker-replacement'); if (replacementBtn) replacementBtn.onclick = function () { window.MandateUI.goReplacement(requestId); };
    var readinessBtn = $('mandate-tracker-readiness'); if (readinessBtn) readinessBtn.onclick = function () { window.MandateUI.goReadiness(request.sipId); };
    $('mandate-tracker-details').onclick = function () { window.MandateUI.goDetails(request.sipId); };
    $('mandate-tracker-return').onclick = function () { window.RecoveryUI.viewDetails(request.sipId); };
    $('mandate-tracker-support').onclick = function () { window.MandateUI.goSupport(request.sipId, request.status === Data.RepairRequestStatus.UNRESOLVED ? 'provider_timeout' : 'general'); };
  }

  // ───────────────────────── Screen 9: Payment Readiness Status ─────────────────────────
  function renderReadiness(sipId) {
    var body = $('mandate-readiness-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var health = store.getMandateHealth(sipId);
    var nextKey = store.getNextInstalmentDateKey(sipId);
    var failedInstalments = recoveryStore.getInstalmentsForSip(sipId).filter(function (i) { return i.status === 'failed'; });

    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      C.readinessCard(sip, health, nextKey) +
      (failedInstalments.length ? ('<div class="section-header mt-16"><h3>Unresolved Prior Failures</h3></div>' + failedInstalments.map(C.unresolvedFailureRow).join('')) : '') +
      '<button class="btn btn-outline mt-16" id="mandate-readiness-return">Return to SIP Details</button>';

    qsa(body, '[data-action="resolve-instalment"]').forEach(function (btn) {
      btn.onclick = function () { window.RecoveryUI.resolveNow(btn.dataset.instalmentId); };
    });
    $('mandate-readiness-return').onclick = function () { window.RecoveryUI.viewDetails(sipId); };
  }

  // ───────────────────────── Screen 10: Mandate Reminders ─────────────────────────
  function renderNotifications() {
    var list = $('mandate-notif-list');
    var toggle = $('mandate-reminder-toggle');
    if (!list) return;
    if (toggle) {
      toggle.checked = !!store.ensureLoaded().settings.reminderOptIn;
      toggle.onchange = function () { window.MandateUI.toggleReminders(toggle.checked); };
    }
    var notifs = store.getNotifications();
    if (!notifs.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><div class="small">No AutoPay notifications yet.</div></div>';
    } else {
      list.innerHTML = '<div class="card">' + notifs.map(C.notificationItem).join('') + '</div>';
      qsa(list, '[data-mandate-notif-id]').forEach(function (row) {
        row.onclick = function () { store.markNotificationRead(row.dataset.mandateNotifId); renderNotifications(); };
      });
    }
  }

  // ───────────────────────── Screen 11: Support & Exception Handling ─────────────────────────
  var SUPPORT_COPY = {
    provider_timeout: 'The payment provider did not respond in time. You can try checking status again shortly, or let our team follow up.',
    unsupported_reauthorization: 'This mandate does not support self-service reauthorization through this simulated provider.',
    authorization_rejection: 'Your authorization request was not approved by the bank or payment provider.',
    verification_delay: 'Provider verification for this mandate is taking longer than usual.',
    conflicting_repair_requests: 'There is already an open mandate repair request for this SIP.',
    replacement_pending: 'A replacement mandate request is already awaiting provider confirmation.',
    missing_capability_metadata: 'We don’t have enough provider information to safely offer a repair action for this mandate.',
    network_interruption: 'We lost connection while processing your request. Nothing was changed.',
    sip_paused: 'This SIP is currently paused. You can repair its mandate, but the SIP will not resume automatically.',
    sip_cancelled: 'This SIP has been permanently cancelled, so a mandate repair is no longer applicable.',
    payment_already_processing: 'An instalment for this SIP is already being processed and cannot be affected by a mandate repair right now.',
    unknown_mandate_status: 'We could not verify your AutoPay status right now.',
    general: 'We ran into an issue completing this request.'
  };
  function renderSupport(sipId, reasonCode) {
    var body = $('mandate-support-body');
    if (!body) return;
    store.emit(Analytics.Events.SUPPORT_REQUESTED, { sipId: sipId, reasonCode: reasonCode });
    var sip = sipId ? recoveryStore.getSip(sipId) : null;
    var existing = recoveryStore.getSupportTickets().filter(function (t) { return !sipId || t.sipId === sipId; });

    body.innerHTML =
      (sip ? '<div class="card-flat mb-16"><div class="tiny muted">Prefilled from</div><div class="small bold mt-4">' + esc(sip.fundName) + '</div><div class="tiny muted mt-4">' + esc(SUPPORT_COPY[reasonCode] || SUPPORT_COPY.general) + '</div></div>' : '') +
      '<label class="field-label">Subject</label>' +
      '<input class="field-input" id="mandate-support-subject" value="' + (sip ? 'Help with AutoPay / mandate repair' : '') + '">' +
      '<label class="field-label mt-16">Describe the issue</label>' +
      '<textarea class="field-input" id="mandate-support-desc" rows="4" style="resize:vertical;">' + esc(SUPPORT_COPY[reasonCode] || '') + '</textarea>' +
      '<div class="tiny faint mt-8">We only share your SIP and mandate request details with support — never your OTP, UPI PIN, bank password or card details.</div>' +
      '<button class="btn btn-primary mt-16" id="mandate-support-submit">Create Support Ticket</button>' +
      '<div id="mandate-support-result" class="mt-16"></div>' +
      (existing.length ? (
        '<div class="section-header mt-24"><h3>Your Tickets</h3></div>' +
        existing.map(function (t) {
          return '<div class="list-row"><span>🎫</span><div style="flex:1;"><div class="small bold">' + esc(t.ticketNumber) + '</div><div class="tiny muted">' + esc(t.subject) + '</div></div><span class="badge badge-paused">' + esc(t.status) + '</span></div>';
        }).join('')
      ) : '');

    var submit = $('mandate-support-submit');
    if (submit) submit.onclick = function () {
      var subject = $('mandate-support-subject').value.trim() || 'AutoPay / Mandate Repair Support Request';
      var desc = $('mandate-support-desc').value.trim() || 'No additional details provided.';
      var ticket = recoveryStore.createSupportTicket({ sipId: sipId || null, instalmentId: null, subject: subject, description: desc });
      $('mandate-support-result').innerHTML =
        '<div class="card" style="border-color:rgba(31,216,150,0.3);"><div class="row gap-12"><span style="font-size:20px;">✅</span><div><div class="small bold">Ticket ' + esc(ticket.ticketNumber) + ' created</div><div class="tiny muted mt-4">Status: Open — our team will follow up (simulated).</div></div></div></div>';
      window.showToast('Support ticket ' + ticket.ticketNumber + ' created');
      submit.disabled = true;
    };
  }

  // ───────────────────────── Screen 12: Mandate History ─────────────────────────
  function renderHistory(sipId) {
    var body = $('mandate-history-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var events = store.getStatusEvents(sipId);
    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      '<div class="section-header"><h3>Mandate Timeline</h3></div>' +
      C.historyTimeline(events) +
      '<div class="tiny faint mt-16">This history is an immutable audit log — past events are never edited or removed.</div>';
  }

  // ───────────────────────── Screen 13: Analytics Dashboard ─────────────────────────
  function renderAnalytics() {
    var body = $('mandate-analytics-body');
    if (!body) return;
    var summary = Analytics.computeMetrics(store, recoveryStore);
    body.innerHTML =
      '<div class="tiny faint mb-16">⚠️ ' + esc(summary.note) + '</div>' +
      '<div class="recovery-metric-grid">' + summary.leadingMetrics.map(function (m) {
        return '<div class="recovery-metric-tile"><div class="tiny muted">' + esc(m.label) + '</div><div class="bold" style="font-size:20px;">' + (m.value == null ? '—' : m.value + (m.unit === '%' ? '%' : '')) + '</div>' + (m.incompleteWindows ? '<div class="tiny faint mt-4">' + m.incompleteWindows + ' still mid-observation window</div>' : '') + '</div>';
      }).join('') + '</div>';
  }

  window.MandateScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot, renderDashboard: renderDashboard, renderDetails: renderDetails,
    renderIssues: renderIssues, renderExplain: renderExplain, renderRepair: renderRepair,
    renderReauth: renderReauth, renderReplacement: renderReplacement, renderTracker: renderTracker,
    renderReadiness: renderReadiness, renderNotifications: renderNotifications, renderSupport: renderSupport,
    renderHistory: renderHistory, renderAnalytics: renderAnalytics
  };
})();
