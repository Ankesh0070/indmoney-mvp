/**
 * SIP Pause & Resume Manager — DOM rendering for every pause/resume screen.
 * Browser-only: queries the real DOM and wires events. Pure markup comes
 * from PauseComponents; all state mutation goes through PauseStore, which
 * itself only ever touches Feature 1's RecoveryStore through its additive
 * registerX API and only *reads* Feature 2's SchedulingStore.
 */
(function () {
  'use strict';

  var Data = window.PauseData;
  var DateUtils = window.SchedulingDateUtils;
  var C = window.PauseComponents;
  var Analytics = window.PauseAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var schedulingStore = window.SchedulingScreens.store;
  var store = new window.PauseStore({ recoveryStore: recoveryStore, schedulingStore: schedulingStore });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) { return C.esc(s); }

  var startedFlow = {};

  // ───────────────────────── Entry slot inside screen-sips ─────────────────────────
  function renderEntrySlot() {
    var slot = $('pause-sips-slot');
    if (!slot) return;
    var sips = recoveryStore.getAllSips();
    var pendingCount = sips.filter(function (s) {
      var l = store.getLifecycle(s.id);
      return l !== Data.SipLifecycleStatus.ACTIVE && l !== Data.SipLifecycleStatus.CANCELLED;
    }).length;

    slot.innerHTML =
      '<div class="section-header"><h3>SIP Pause &amp; Resume Manager</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">Going through a tight month? Temporarily pause a SIP and resume it later — voluntary, transparent, and reversible.</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">SIPs tracked</span><span class="small bold">' + sips.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Currently paused or in-progress</span><span class="small bold">' + pendingCount + '</span></div>' +
        '<button class="btn btn-primary mt-16" id="pause-entry-open">Open SIP Pause &amp; Resume Manager</button>' +
      '</div>';
    var open = $('pause-entry-open'); if (open) open.onclick = function () { window.PauseUI.goDashboard(); };
  }

  // ───────────────────────── Screen 1: My SIPs dashboard extension ─────────────────────────
  function renderDashboard() {
    var body = $('pause-dashboard-body');
    if (!body) return;
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();
    var sips = recoveryStore.getAllSips();

    var rows = sips.map(function (sip) {
      var lifecycle = store.getLifecycle(sip.id);
      var capability = store.getCapability(sip.id);
      var openPause = store.getOpenPauseRequestsForSip(sip.id);
      var openResume = store.getOpenResumeRequestsForSip(sip.id);
      var pendingLabel = openPause.length ? 'pause request in progress' : (openResume.length ? 'resume request in progress' : null);
      return C.sipManageRow(sip, lifecycle, !!(capability && capability.pauseSupported), pendingLabel);
    }).join('');

    body.innerHTML =
      '<div class="tiny faint mb-12">⚠️ Demo prototype — no real bank or fund-house schedule is changed here, and this is not the official INDmoney app.</div>' +
      C.scenarioPillRow(scenarios, focusedId) +
      '<div class="section-header mt-16"><h3>My SIPs</h3></div>' +
      (rows || '<div class="empty-state"><div class="emoji">🔁</div><div class="small">No SIPs yet.</div></div>') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="pause-dash-notifs">🔔 Notifications</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="pause-dash-analytics">📊 Analytics</button>' +
      '</div>' +
      '<button class="btn btn-danger-outline btn-sm mt-8" id="pause-dash-reset">↺ Reset Pause Demo Data</button>';

    qsa(body, '[data-action="focus-pause-scenario"]').forEach(function (btn) {
      btn.onclick = function () { window.PauseUI.switchScenario(btn.dataset.scenarioId); };
    });
    qsa(body, '[data-action="manage-sip"]').forEach(function (btn) {
      btn.onclick = function () { window.PauseUI.manageSip(btn.dataset.sipId); };
    });
    $('pause-dash-notifs').onclick = function () { window.PauseUI.goNotifications(); };
    $('pause-dash-analytics').onclick = function () { window.PauseUI.goAnalytics(); };
    $('pause-dash-reset').onclick = function () { window.PauseUI.confirmResetDemo(); };
  }

  // ───────────────────────── Screen 2: SIP Management Center ─────────────────────────
  function renderManage(sipId) {
    var body = $('pause-manage-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    if (!sip) return;
    var lifecycle = store.getLifecycle(sipId);
    var capability = store.getCapability(sipId);
    var instalments = recoveryStore.getInstalmentsForSip(sipId);
    var lastSuccess = instalments.filter(function (i) { return i.status === 'success' || i.status === 'recovered'; }).pop();
    var failures = instalments.filter(function (i) { return i.everFailed; });
    var pendingSchedChange = schedulingStore.getOpenRequestsForSip(sipId);
    var nextDebitDay = schedulingStore.getCurrentDebitDay(sipId);
    var activePause = store.getActivePauseRequestForSip(sipId);

    body.innerHTML =
      '<div class="card">' +
        '<div class="row gap-12"><div class="fund-icon" style="background:' + esc(sip.color) + ';">' + esc(sip.fundName.charAt(0)) + '</div>' +
        '<div><div class="bold small">' + esc(sip.fundName) + '</div><div class="tiny muted mt-4">' + esc(sip.category) + ' · ' + C.inr(sip.amount) + '/mo</div></div></div>' +
        '<div class="row-between mt-12"><span class="small muted">Status</span>' + C.lifecycleBadge(lifecycle) + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Current debit date</span><span class="small bold">' + DateUtils.ordinal(nextDebitDay) + ' of every month</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Last successful payment</span><span class="small bold">' + (lastSuccess ? DateUtils.formatIndianDate(new Date(lastSuccess.scheduledDate).toISOString().slice(0, 10)) : 'None yet') + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Pending scheduling change (Feature 2)</span><span class="small bold">' + (pendingSchedChange.length ? 'Yes — in progress' : 'None') + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Existing payment failures (Feature 1)</span><span class="small bold">' + failures.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Pause eligibility</span><span class="small bold">' + (capability && capability.pauseSupported ? 'Eligible' : 'Not eligible') + '</span></div>' +
      '</div>' +
      '<div class="row gap-8 mt-16">' +
        (lifecycle === Data.SipLifecycleStatus.ACTIVE ? '<button class="btn btn-primary" style="flex:1;" id="pause-manage-pause">Pause SIP</button>' : '') +
        ((lifecycle === Data.SipLifecycleStatus.PAUSED || lifecycle === Data.SipLifecycleStatus.PROVIDER_ACTION_REQUIRED) ? '<button class="btn btn-primary" style="flex:1;" id="pause-manage-resume">Resume SIP</button>' : '') +
      '</div>' +
      (activePause ? '<button class="btn btn-outline mt-8" id="pause-manage-view-active">View Current Pause</button>' : '') +
      '<button class="btn btn-outline mt-8" id="pause-manage-history">View Pause History</button>' +
      '<button class="btn btn-outline mt-8" id="pause-manage-return">Return to SIP Details</button>';

    var pauseBtn = $('pause-manage-pause'); if (pauseBtn) pauseBtn.onclick = function () { window.PauseUI.startPauseFlow(sipId); };
    var resumeBtn = $('pause-manage-resume'); if (resumeBtn) resumeBtn.onclick = function () { window.PauseUI.goEarlyResume(sipId); };
    var viewActive = $('pause-manage-view-active'); if (viewActive) viewActive.onclick = function () { window.PauseUI.viewPauseRequest(activePause.id); };
    $('pause-manage-history').onclick = function () { window.PauseUI.goHistory(sipId); };
    $('pause-manage-return').onclick = function () { window.RecoveryUI.viewDetails(sipId); };
  }

  // ───────────────────────── Screen 3: Pause Eligibility Check ─────────────────────────
  function renderEligibility(sipId) {
    var body = $('pause-eligibility-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    store.emit(Analytics.Events.ELIGIBILITY_CHECKED, { sipId: sipId, supported: !!(capability && capability.pauseSupported) });

    if (!capability || !capability.pauseSupported) {
      body.innerHTML =
        '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
        C.unavailableNotice(sip) +
        '<div class="row gap-8 mt-16">' +
          '<button class="btn btn-outline" style="flex:1;" id="pause-elig-back">Back to SIP</button>' +
          '<button class="btn btn-primary" style="flex:1;" id="pause-elig-support">View Support Options</button>' +
        '</div>';
      $('pause-elig-back').onclick = function () { window.PauseUI.manageSip(sipId); };
      $('pause-elig-support').onclick = function () { window.PauseUI.goSupport(sipId, 'pause_unsupported'); };
      return;
    }
    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      '<div class="tiny muted mb-12">This simulated provider allows a temporary pause for this SIP. Review the rules below before continuing.</div>' +
      C.capabilitySummaryCard(capability) +
      '<button class="btn btn-primary mt-16" id="pause-elig-continue">Continue</button>' +
      '<button class="btn btn-outline mt-8" id="pause-elig-back2">Back to SIP</button>';
    $('pause-elig-continue').onclick = function () { window.PauseUI.goDuration(sipId); };
    $('pause-elig-back2').onclick = function () { window.PauseUI.manageSip(sipId); };
  }

  // ───────────────────────── Screen 4: Select Pause Duration ─────────────────────────
  function renderDuration(sipId, selectedCycles) {
    var body = $('pause-duration-body');
    if (!body) return;
    if (!startedFlow[sipId]) { startedFlow[sipId] = true; store.emit(Analytics.Events.FLOW_STARTED, { sipId: sipId }); }
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    var cycles = selectedCycles || capability.minCycles;
    var schedule = store.previewPauseSchedule(sipId, cycles);

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="tiny muted mt-4 mb-12">Choose how many upcoming instalments to pause. Only durations this simulated provider allows are shown.</div>' +
      C.durationOptions(capability.minCycles, capability.maxCycles, cycles) +
      '<div class="section-header mt-16"><h3>Projected Schedule</h3></div>' +
      C.scheduleList(schedule) +
      '<div class="tiny faint mt-8 mb-8">Handles month-end and leap-year dates safely — every date above lands on a real calendar day.</div>' +
      '<button class="btn btn-primary mt-8" id="pause-duration-continue">Continue</button>' +
      '<button class="btn btn-outline mt-8" id="pause-duration-back">Back to Eligibility</button>';

    qsa(body, '[data-action="select-pause-cycles"]').forEach(function (btn) {
      btn.onclick = function () {
        var c = Number(btn.dataset.cycles);
        store.emit(Analytics.Events.DURATION_SELECTED, { sipId: sipId, cycles: c });
        window.PauseUI.selectCycles(sipId, c);
      };
    });
    $('pause-duration-continue').onclick = function () { window.PauseUI.goImpact(sipId, cycles); };
    $('pause-duration-back').onclick = function () { window.PauseUI.goEligibility(sipId); };
  }

  // ───────────────────────── Screen 5: Pause Impact Preview ─────────────────────────
  function renderImpact(sipId, cycles) {
    var body = $('pause-impact-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    var schedule = store.previewPauseSchedule(sipId, cycles);

    body.innerHTML =
      '<div class="tiny muted mb-4">Current date: ' + DateUtils.formatIndianDate(store.getDemoToday()) + '</div>' +
      '<div class="tiny muted mb-12">Selected pause: ' + cycles + ' eligible instalment' + (cycles > 1 ? 's' : '') + '</div>' +
      C.pauseImpactCard(sip, schedule, capability) +
      '<button class="btn btn-primary mt-16" id="pause-impact-continue">Continue to Confirmation</button>' +
      '<button class="btn btn-outline mt-8" id="pause-impact-back">Back</button>';

    $('pause-impact-continue').onclick = function () { window.PauseUI.goConfirm(sipId, cycles); };
    $('pause-impact-back').onclick = function () { window.PauseUI.goDuration(sipId, cycles); };
  }

  // ───────────────────────── Screen 6: Pause Confirmation ─────────────────────────
  function renderConfirm(sipId, cycles) {
    var body = $('pause-confirm-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var schedule = store.previewPauseSchedule(sipId, cycles);

    body.innerHTML =
      '<div class="card">' +
        '<div class="small bold">' + esc(sip.fundName) + '</div>' +
        '<div class="row-between mt-12"><span class="small muted">Pause duration</span><span class="small bold">' + cycles + ' instalment(s)</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">First skipped instalment</span><span class="small bold">' + DateUtils.formatIndianDate(schedule.affectedDateKeys[0]) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Expected resume date</span><span class="small bold">' + DateUtils.formatIndianDate(schedule.resumeDateKey) + '</span></div>' +
      '</div>' +
      '<label class="row gap-8 mt-16" style="align-items:flex-start; cursor:pointer;">' +
        '<input type="checkbox" id="pause-confirm-checkbox" style="margin-top:3px;">' +
        '<span class="tiny">I understand which future instalments may be paused and when my SIP is expected to resume.</span>' +
      '</label>' +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-confirm-back">Go Back</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-confirm-cancel">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1;" id="pause-confirm-submit">Confirm Pause</button>' +
      '</div>';

    $('pause-confirm-back').onclick = function () { window.PauseUI.goImpact(sipId, cycles); };
    $('pause-confirm-cancel').onclick = function () { window.PauseUI.manageSip(sipId); };
    var submitBtn = $('pause-confirm-submit');
    var submitted = false;
    submitBtn.onclick = function () {
      if (submitted) return;
      if (!$('pause-confirm-checkbox').checked) { window.showToast('Please confirm you understand the impact before continuing'); return; }
      submitted = true;
      submitBtn.disabled = true;
      window.PauseUI.submitPause(sipId, cycles);
    };
  }

  // ───────────────────────── Screen 7: Pause Request Tracker ─────────────────────────
  function renderTracker(requestId) {
    var body = $('pause-tracker-body');
    if (!body) return;
    var request = store.getPauseRequest(requestId);
    if (!request) { body.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><div class="small">Request not found.</div></div>'; return; }
    var sip = recoveryStore.getSip(request.sipId);

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="mt-12">' + C.requestStatusCard(request, 'pause') + '</div>' +
      (request.status === Data.PauseRequestStatus.PENDING_PROVIDER_APPROVAL || request.status === Data.PauseRequestStatus.APPROVED ?
        '<button class="btn btn-outline mt-8" id="pause-tracker-check">Check Status</button>' : '') +
      (Data.CANCELLABLE_PAUSE_STATUSES.indexOf(request.status) !== -1 ?
        '<button class="btn btn-danger-outline mt-8" id="pause-tracker-cancel">Cancel Request</button>' : '') +
      (request.status === Data.PauseRequestStatus.EFFECTIVE ?
        '<button class="btn btn-primary mt-8" id="pause-tracker-view-paused">View Paused SIP</button>' : '') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-tracker-manage">Return to SIP Details</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-tracker-history">View Request History</button>' +
      '</div>';

    var check = $('pause-tracker-check'); if (check) check.onclick = function () { store.checkPauseStatus(requestId); renderTracker(requestId); };
    var cancel = $('pause-tracker-cancel'); if (cancel) cancel.onclick = function () {
      var res = store.cancelPauseRequest(requestId);
      if (!res.ok) { window.showToast('This request cannot be cancelled right now.'); return; }
      window.showToast('Pause request cancelled');
      renderTracker(requestId);
    };
    var viewPaused = $('pause-tracker-view-paused'); if (viewPaused) viewPaused.onclick = function () { window.PauseUI.goPausedDashboard(request.sipId); };
    $('pause-tracker-manage').onclick = function () { window.PauseUI.manageSip(request.sipId); };
    $('pause-tracker-history').onclick = function () { window.PauseUI.goHistory(request.sipId); };
  }

  // ───────────────────────── Screen 8: Paused SIP Dashboard ─────────────────────────
  function renderPausedDashboard(sipId) {
    var body = $('pause-paused-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var request = store.getActivePauseRequestForSip(sipId);
    var mandate = recoveryStore.getMandateForSip(sipId);
    if (!sip || !request) {
      body.innerHTML = '<div class="empty-state"><div class="emoji">⏸️</div><div class="small">This SIP is not currently paused.</div></div>';
      return;
    }
    body.innerHTML =
      C.pausedDashboardCard(sip, request, mandate ? (mandate.status === 'active' ? 'Active' : 'Needs attention') : 'Active', store.getDemoToday()) +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-primary" style="flex:1;" id="pause-paused-resume">Resume Earlier</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-paused-schedule">View Schedule</button>' +
      '</div>' +
      '<button class="btn btn-outline mt-8" id="pause-paused-reminders">Manage Reminders</button>' +
      '<div class="card mt-16">' +
        '<div class="small bold">Demo Clock</div>' +
        '<div class="tiny muted mt-4">Advance the simulated date to test scheduled resumption without waiting for real time.</div>' +
        '<div class="tiny bold mt-8">Current demo date: ' + DateUtils.formatIndianDate(store.getDemoToday()) + '</div>' +
        '<div class="row gap-8 mt-12">' +
          '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="pause-advance-30">⏩ +30 days</button>' +
          '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="pause-advance-90">⏩ +90 days</button>' +
        '</div>' +
      '</div>';

    $('pause-paused-resume').onclick = function () { window.PauseUI.goEarlyResume(sipId); };
    $('pause-paused-schedule').onclick = function () { window.PauseUI.viewPauseRequest(request.id); };
    $('pause-paused-reminders').onclick = function () { window.PauseUI.goNotifications(); };
    $('pause-advance-30').onclick = function () { store.advanceDemoClock(30); window.showToast('Demo date advanced by 30 days'); renderPausedDashboard(sipId); };
    $('pause-advance-90').onclick = function () { store.advanceDemoClock(90); window.showToast('Demo date advanced by 90 days'); renderPausedDashboard(sipId); };
  }

  // ───────────────────────── Screen 9: Early Resume Flow ─────────────────────────
  function renderEarlyResume(sipId) {
    var body = $('pause-early-resume-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    var lifecycle = store.getLifecycle(sipId);
    var eligible = window.PauseEngine.checkEarlyResumeEligibility(capability, lifecycle);
    var activePause = store.getActivePauseRequestForSip(sipId);

    if (!eligible.ok) {
      body.innerHTML =
        '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
        '<div class="empty-state">' +
          '<div class="emoji">📅</div>' +
          '<div class="small bold">Early resume isn’t available for this SIP.</div>' +
          '<div class="tiny muted mt-8">' + (eligible.code === 'NOT_SUPPORTED' ? 'This simulated provider only supports resuming on the originally scheduled date shown below.' : 'This SIP is not currently paused.') + '</div>' +
          (activePause ? '<div class="tiny bold mt-12">Scheduled resume date: ' + DateUtils.formatIndianDate(activePause.resumeDateKey) + '</div>' : '') +
        '</div>' +
        '<button class="btn btn-outline mt-16" id="pause-early-back">Return to SIP</button>';
      $('pause-early-back').onclick = function () { window.PauseUI.manageSip(sipId); };
      return;
    }

    var openResume = store.getOpenResumeRequestsForSip(sipId);
    if (openResume.length) { window.PauseUI.goResumeTracker(openResume[0].id); return; }

    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Currently paused since</span><span class="small bold">' + DateUtils.formatIndianDate(activePause.effectiveDate) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Originally scheduled resume</span><span class="small bold">' + DateUtils.formatIndianDate(activePause.resumeDateKey) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Reauthorization needed</span><span class="small bold">' + (capability.resumeRequiresReauth ? 'Yes' : 'No') + '</span></div>' +
      '</div>' +
      '<div class="tiny faint mb-8">This is a simulated early-resume request. No instalment is debited immediately — your next eligible instalment follows your mandate’s normal schedule once resume is confirmed.</div>' +
      '<button class="btn btn-primary mt-8" id="pause-early-confirm">Request Early Resume</button>' +
      '<button class="btn btn-outline mt-8" id="pause-early-cancel">Cancel</button>';

    $('pause-early-confirm').onclick = function () { window.PauseUI.submitEarlyResume(sipId); };
    $('pause-early-cancel').onclick = function () { window.PauseUI.manageSip(sipId); };
  }

  // ───────────────────────── Resume tracker (supports Screen 9 + scheduled resume) ─────────────────────────
  function renderResumeTracker(requestId) {
    var body = $('pause-resume-tracker-body');
    if (!body) return;
    var request = store.getResumeRequest(requestId);
    if (!request) { body.innerHTML = '<div class="empty-state"><div class="emoji">🔄</div><div class="small">Request not found.</div></div>'; return; }
    var sip = recoveryStore.getSip(request.sipId);

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="tiny muted mt-4 mb-8">' + (request.type === 'early' ? 'Early resume request' : 'Scheduled resume') + '</div>' +
      C.requestStatusCard(request, 'resume') +
      (request.status === Data.ResumeRequestStatus.REQUIRES_REAUTHORIZATION ? '<button class="btn btn-primary mt-8" id="pause-resume-reauth">Complete Reauthorization (demo)</button>' : '') +
      (request.status === Data.ResumeRequestStatus.PENDING_PROVIDER_APPROVAL || request.status === Data.ResumeRequestStatus.REQUIRES_REAUTHORIZATION || request.status === Data.ResumeRequestStatus.APPROVED ?
        '<button class="btn btn-outline mt-8" id="pause-resume-check">Check Status</button>' : '') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-resume-manage">Return to SIP Details</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="pause-resume-history">View History</button>' +
      '</div>';

    var reauth = $('pause-resume-reauth'); if (reauth) reauth.onclick = function () { store.completeResumeReauthorization(requestId); window.showToast('Reauthorization completed (simulated)'); renderResumeTracker(requestId); };
    var check = $('pause-resume-check'); if (check) check.onclick = function () { store.checkResumeStatus(requestId); renderResumeTracker(requestId); };
    $('pause-resume-manage').onclick = function () { window.PauseUI.manageSip(request.sipId); };
    $('pause-resume-history').onclick = function () { window.PauseUI.goHistory(request.sipId); };
  }

  // ───────────────────────── Screen 11: Pause & Resume History ─────────────────────────
  function renderHistory(sipId) {
    var body = $('pause-history-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var events = store.getLifecycleEvents(sipId);
    var firstPostResume = store.getFirstPostResumeStatus(sipId);

    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      '<div class="section-header"><h3>Pause &amp; Resume Timeline</h3></div>' +
      C.historyTimeline(events) +
      (firstPostResume ? (
        '<div class="section-header mt-16"><h3>First Post-Resume Payment</h3></div>' +
        '<div class="card"><div class="row-between"><span class="small muted">Status</span>' + window.RecoveryComponents.statusBadge(firstPostResume.status) + '</div>' +
        '<div class="tiny faint mt-8">A resumed SIP is never treated as having a successful instalment until a verified payment-success event exists.</div></div>'
      ) : '');
  }

  // ───────────────────────── Screen 12: Reminders and Notifications ─────────────────────────
  function renderNotifications() {
    var list = $('pause-notif-list');
    var toggle = $('pause-reminder-toggle');
    if (!list) return;
    if (toggle) {
      toggle.checked = !!store.ensureLoaded().settings.reminderOptIn;
      toggle.onchange = function () { window.PauseUI.toggleReminders(toggle.checked); };
    }
    var notifs = store.getNotifications();
    if (!notifs.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><div class="small">No pause notifications yet.</div></div>';
    } else {
      list.innerHTML = '<div class="card">' + notifs.map(C.notificationItem).join('') + '</div>';
      qsa(list, '[data-pause-notif-id]').forEach(function (row) {
        row.onclick = function () { store.markNotificationRead(row.dataset.pauseNotifId); renderNotifications(); };
      });
    }
  }

  // ───────────────────────── Screen 13: Support & Exceptions ─────────────────────────
  var SUPPORT_COPY = {
    pause_unsupported: 'Temporary pause is not available for this SIP through this demo provider.',
    scheduling_conflict: 'This SIP has a pending debit-date change request. Resolve or wait for that request before requesting a pause.',
    already_requested: 'A pause or resume request is already in progress for this SIP.',
    processing_protected: 'Your next instalment is already being processed and cannot be skipped once started.',
    resume_failed: 'We could not resume this SIP right now.',
    general: 'We ran into an issue completing this request.'
  };
  function renderSupport(sipId, reasonCode) {
    var body = $('pause-support-body');
    if (!body) return;
    var sip = sipId ? recoveryStore.getSip(sipId) : null;
    var existing = recoveryStore.getSupportTickets().filter(function (t) { return !sipId || t.sipId === sipId; });

    body.innerHTML =
      (sip ? '<div class="card-flat mb-16"><div class="tiny muted">Prefilled from</div><div class="small bold mt-4">' + esc(sip.fundName) + '</div><div class="tiny muted mt-4">' + esc(SUPPORT_COPY[reasonCode] || SUPPORT_COPY.general) + '</div></div>' : '') +
      '<label class="field-label">Subject</label>' +
      '<input class="field-input" id="pause-support-subject" value="' + (sip ? 'Help with SIP pause/resume' : '') + '">' +
      '<label class="field-label mt-16">Describe the issue</label>' +
      '<textarea class="field-input" id="pause-support-desc" rows="4" style="resize:vertical;">' + esc(SUPPORT_COPY[reasonCode] || '') + '</textarea>' +
      '<div class="tiny faint mt-8">We only share your SIP and request details with support — never your bank password, OTP or card details.</div>' +
      '<button class="btn btn-primary mt-16" id="pause-support-submit">Create Support Ticket</button>' +
      '<div id="pause-support-result" class="mt-16"></div>' +
      (existing.length ? (
        '<div class="section-header mt-24"><h3>Your Tickets</h3></div>' +
        existing.map(function (t) {
          return '<div class="list-row"><span>🎫</span><div style="flex:1;"><div class="small bold">' + esc(t.ticketNumber) + '</div><div class="tiny muted">' + esc(t.subject) + '</div></div><span class="badge badge-paused">' + esc(t.status) + '</span></div>';
        }).join('')
      ) : '');

    var submit = $('pause-support-submit');
    if (submit) submit.onclick = function () {
      var subject = $('pause-support-subject').value.trim() || 'SIP Pause/Resume Support Request';
      var desc = $('pause-support-desc').value.trim() || 'No additional details provided.';
      var ticket = recoveryStore.createSupportTicket({ sipId: sipId || null, instalmentId: null, subject: subject, description: desc });
      $('pause-support-result').innerHTML =
        '<div class="card" style="border-color:rgba(31,216,150,0.3);"><div class="row gap-12"><span style="font-size:20px;">✅</span><div><div class="small bold">Ticket ' + esc(ticket.ticketNumber) + ' created</div><div class="tiny muted mt-4">Status: Open — our team will follow up (simulated).</div></div></div></div>';
      window.showToast('Support ticket ' + ticket.ticketNumber + ' created');
      submit.disabled = true;
    };
  }

  // ───────────────────────── Product Analytics Dashboard ─────────────────────────
  function renderAnalytics() {
    var body = $('pause-analytics-body');
    if (!body) return;
    var summary = Analytics.computeMetrics(store, recoveryStore);
    body.innerHTML =
      '<div class="tiny faint mb-16">⚠️ ' + esc(summary.note) + '</div>' +
      '<div class="section-header"><h3>Leading Indicators</h3></div>' +
      '<div class="recovery-metric-grid">' + summary.leadingMetrics.map(function (m) {
        return '<div class="recovery-metric-tile"><div class="tiny muted">' + esc(m.label) + '</div><div class="bold" style="font-size:20px;">' + (m.value == null ? '—' : m.value + (m.unit === '%' ? '%' : m.unit === 'cycles' ? '' : '')) + '</div>' + (m.incompleteWindows ? '<div class="tiny faint mt-4">' + m.incompleteWindows + ' SIP(s) still mid-observation window</div>' : '') + '</div>';
      }).join('') + '</div>' +
      '<div class="section-header mt-16"><h3>Long-Term Outcome (not proven by the above)</h3></div>' +
      '<div class="recovery-metric-tile" style="max-width:220px;"><div class="tiny muted">' + esc(summary.outcomeMetric.label) + '</div><div class="bold" style="font-size:22px;">' + summary.outcomeMetric.value + '%</div></div>';
  }

  window.PauseScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot,
    renderDashboard: renderDashboard,
    renderManage: renderManage,
    renderEligibility: renderEligibility,
    renderDuration: renderDuration,
    renderImpact: renderImpact,
    renderConfirm: renderConfirm,
    renderTracker: renderTracker,
    renderPausedDashboard: renderPausedDashboard,
    renderEarlyResume: renderEarlyResume,
    renderResumeTracker: renderResumeTracker,
    renderHistory: renderHistory,
    renderNotifications: renderNotifications,
    renderSupport: renderSupport,
    renderAnalytics: renderAnalytics
  };
})();
