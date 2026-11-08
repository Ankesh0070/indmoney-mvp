/**
 * Salary-Aligned SIP Scheduler — DOM rendering for every scheduling screen.
 * Browser-only: queries the real DOM and wires events. Pure markup comes
 * from SchedulingComponents; all state mutation goes through
 * SchedulingStore, which itself only ever touches Feature 1's RecoveryStore
 * through its additive registerX API.
 */
(function () {
  'use strict';

  var Data = window.SchedulingData;
  var DateUtils = window.SchedulingDateUtils;
  var C = window.SchedulingComponents;
  var Analytics = window.SchedulingAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var store = new window.SchedulingStore({ recoveryStore: recoveryStore });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  var seenMismatches = {};

  // ───────────────────────── Entry slot inside screen-sips ─────────────────────────
  function renderEntrySlot() {
    var slot = $('sched-sips-slot');
    if (!slot) return;
    var sips = schedulableSips();
    var mismatchCount = countMismatches(sips);
    slot.innerHTML =
      '<div class="section-header"><h3>Salary-Aligned SIP Scheduling</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">Coordinate your SIP debit dates with when your income usually arrives — without us ever touching your schedule automatically.</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">SIP plans tracked</span><span class="small bold">' + sips.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Possible timing mismatches</span><span class="small bold">' + mismatchCount + '</span></div>' +
        '<button class="btn btn-primary mt-16" id="sched-entry-open">Open Salary-Aligned SIP Scheduling</button>' +
      '</div>';
    var open = $('sched-entry-open'); if (open) open.onclick = function () { window.SchedulingUI.goOverview(); };
  }

  function schedulableSips() {
    return store.getAllSchedulableSips().filter(function (s) { return !!store.getCapability(s.id); });
  }
  function countMismatches(sips) {
    var today = DateUtils.todayKey(); var p = DateUtils.parseKey(today);
    return sips.filter(function (s) {
      var m = store.detectMismatchForSip(s.id, p.year, p.month0);
      return m.status === Data.MismatchStatus.MISMATCH || m.status === Data.MismatchStatus.UNCERTAIN;
    }).length;
  }

  // ───────────────────────── Screen 1: Overview ─────────────────────────
  function renderOverview() {
    var body = $('sched-overview-body');
    if (!body) return;
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();
    var income = store.getIncome();
    var today = DateUtils.todayKey();
    var p = DateUtils.parseKey(today);
    var sips = schedulableSips();

    var rows = sips.map(function (sip) {
      var debitDay = store.getCurrentDebitDay(sip.id);
      var mismatch = store.detectMismatchForSip(sip.id, p.year, p.month0);
      return C.sipScheduleRow(sip, debitDay, mismatch);
    }).join('');

    body.innerHTML =
      '<div class="tiny faint mb-12">⚠️ Demo prototype — this is not the official INDmoney app, and no real bank or fund-house schedule is changed here.</div>' +
      C.scenarioPillRow(scenarios, focusedId) +
      '<div class="card mt-12">' +
        '<div class="row-between"><span class="small muted">SIP plans</span><span class="small bold">' + sips.length + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Expected income date</span><span class="small bold">' + C.incomeSummary(income) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Possible mismatches</span><span class="small bold">' + countMismatches(sips) + '</span></div>' +
        '<div class="row gap-8 mt-16">' +
          '<button class="btn btn-primary btn-sm" style="width:auto; flex:1;" id="sched-ov-calendar">Review My SIP Schedule</button>' +
          '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="sched-ov-income">Manage Income Date</button>' +
        '</div>' +
      '</div>' +
      '<div class="section-header mt-16"><h3>Per-SIP Status</h3></div>' +
      (rows || '<div class="empty-state"><div class="emoji">🔁</div><div class="small">No schedulable SIPs yet.</div></div>') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="sched-ov-history">🧾 History</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="sched-ov-notifs">🔔 Notifications</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="sched-ov-analytics">📊 Analytics</button>' +
      '</div>' +
      '<button class="btn btn-danger-outline btn-sm mt-8" id="sched-ov-reset">↺ Reset Scheduling Demo Data</button>';

    qsa(body, '[data-action="focus-sched-scenario"]').forEach(function (btn) {
      btn.onclick = function () { window.SchedulingUI.switchScenario(btn.dataset.scenarioId); };
    });
    qsa(body, '[data-action="review-sip-schedule"]').forEach(function (btn) {
      btn.onclick = function () { window.SchedulingUI.viewMismatch(btn.dataset.sipId); };
    });
    $('sched-ov-calendar').onclick = function () { window.SchedulingUI.goCalendar(); };
    $('sched-ov-income').onclick = function () { window.SchedulingUI.goIncomeSetup(); };
    $('sched-ov-history').onclick = function () { window.SchedulingUI.goHistory(); };
    $('sched-ov-notifs').onclick = function () { window.SchedulingUI.goNotifications(); };
    $('sched-ov-analytics').onclick = function () { window.SchedulingUI.goAnalytics(); };
    $('sched-ov-reset').onclick = function () { window.SchedulingUI.confirmResetDemo(); };
  }

  // ───────────────────────── Screen 2: Expected Income Date Setup ─────────────────────────
  function renderIncomeSetup() {
    var body = $('sched-income-body');
    if (!body) return;
    var income = store.getIncome();
    if (!income) store.emit(Analytics.Events.SETUP_STARTED, {});
    var pattern = (income && income.pattern) || Data.IncomePattern.FIXED;
    var fixedDay = (income && income.fixedDay) || 1;
    var varStart = (income && income.variableStart) || 1;
    var varEnd = (income && income.variableEnd) || 10;
    var reminderEnabled = income ? !!income.reminderEnabled : true;

    function dayOptions(selected) {
      var out = '';
      for (var d = 1; d <= 31; d++) out += '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + DateUtils.ordinal(d) + '</option>';
      return out;
    }

    body.innerHTML =
      '<div class="small bold">When do you usually receive your salary or regular income?</div>' +
      '<div class="tiny muted mt-8">This is self-reported and used only to compare against your SIP dates. INDmoney is not connected to your bank account and never verifies when your salary actually arrives.</div>' +
      '<div class="pill-row mt-16">' +
        pillBtn('fixed', 'Fixed date', pattern) + pillBtn('variable', 'Variable range', pattern) + pillBtn('irregular', 'Irregular', pattern) +
      '</div>' +
      '<div id="sched-income-fields" class="mt-16"></div>' +
      '<div class="recovery-reminder-toggle mt-16">' +
        '<div><div class="small bold">Monthly reminder</div><div class="tiny muted">Remind me before my SIPs are debited each month</div></div>' +
        '<label class="switch"><input type="checkbox" id="sched-income-reminder"' + (reminderEnabled ? ' checked' : '') + '><span class="switch-track"></span></label>' +
      '</div>' +
      '<button class="btn btn-primary mt-16" id="sched-income-save">Save Income Date</button>' +
      '<button class="btn btn-outline mt-8" id="sched-income-skip">Skip Setup</button>';

    function pillBtn(val, label, current) {
      return '<button class="pill' + (val === current ? ' active' : '') + '" data-pattern="' + val + '">' + label + '</button>';
    }

    function renderFields(p) {
      var el = $('sched-income-fields');
      if (p === Data.IncomePattern.FIXED) {
        el.innerHTML =
          '<label class="field-label">Day of month</label>' +
          '<select class="field-input" id="sched-income-fixed-day">' + dayOptions(fixedDay) + '</select>' +
          '<div class="tiny faint mt-8">If you choose the 29th–31st, shorter months will show the last calendar day instead for projection purposes only. Your SIP\'s own debit date is never changed automatically because of this.</div>';
      } else if (p === Data.IncomePattern.VARIABLE) {
        el.innerHTML =
          '<label class="field-label">Usually between</label>' +
          '<div class="row gap-8">' +
            '<select class="field-input" id="sched-income-var-start">' + dayOptions(varStart) + '</select>' +
            '<select class="field-input" id="sched-income-var-end">' + dayOptions(varEnd) + '</select>' +
          '</div>' +
          '<div class="tiny faint mt-8">We will flag dates that fall anywhere inside this window as uncertain, not as a confirmed mismatch.</div>';
      } else {
        el.innerHTML = '<div class="tiny muted">We will not make any date suggestions based on your income — you can still browse your SIP and income calendar manually, and review available SIP dates whenever you choose.</div>';
      }
    }
    renderFields(pattern);

    qsa(body, '[data-pattern]').forEach(function (btn) {
      btn.onclick = function () {
        qsa(body, '[data-pattern]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        pattern = btn.dataset.pattern;
        renderFields(pattern);
      };
    });

    $('sched-income-save').onclick = function () {
      var payload = { pattern: pattern, skipped: false, reminderEnabled: $('sched-income-reminder').checked };
      if (pattern === Data.IncomePattern.FIXED) payload.fixedDay = Number($('sched-income-fixed-day').value);
      if (pattern === Data.IncomePattern.VARIABLE) {
        payload.variableStart = Number($('sched-income-var-start').value);
        payload.variableEnd = Number($('sched-income-var-end').value);
      }
      var wasEnabled = income && income.reminderEnabled;
      store.setIncome(payload);
      if (payload.reminderEnabled && !wasEnabled) store.emit(Analytics.Events.REMINDER_ENABLED, {});
      window.showToast('Expected income date saved');
      window.SchedulingUI.goOverview();
    };
    $('sched-income-skip').onclick = function () {
      store.skipIncomeSetup();
      window.showToast('Income setup skipped — you can add it anytime');
      window.SchedulingUI.goOverview();
    };
  }

  // ───────────────────────── Screen 3: SIP and Income Calendar ─────────────────────────
  var calendarCursor = null;

  function buildMonthEvents(year, month0) {
    var events = {};
    function add(day, icon, label, cls) {
      if (!events[day]) events[day] = [];
      events[day].push({ icon: icon, label: label, cls: cls });
    }
    var income = store.getIncome();
    if (income && !income.skipped) {
      if (income.pattern === Data.IncomePattern.FIXED) {
        add(DateUtils.clampDay(income.fixedDay, year, month0), '💰', 'Expected income date', 'sched-cal-dot-income');
      } else if (income.pattern === Data.IncomePattern.VARIABLE) {
        var s = DateUtils.clampDay(income.variableStart, year, month0), e = DateUtils.clampDay(income.variableEnd, year, month0);
        for (var d = s; d <= e; d++) add(d, '💰', 'Estimated income window', 'sched-cal-dot-income');
      }
    }
    schedulableSips().forEach(function (sip) {
      var debitDay = store.getCurrentDebitDay(sip.id);
      add(DateUtils.clampDay(debitDay, year, month0), '💳', esc(sip.fundName) + ' debit', 'sched-cal-dot-sip');
      recoveryStore.getInstalmentsForSip(sip.id).forEach(function (inst) {
        var dt = new Date(inst.scheduledDate);
        if (dt.getFullYear() === year && dt.getMonth() === month0) {
          var icon = inst.status === 'failed' ? '❌' : inst.status === 'pending' ? '⏳' : inst.status === 'recovered' ? '✅' : '✅';
          add(dt.getDate(), icon, esc(sip.fundName) + ' instalment ' + inst.status, 'sched-cal-dot-inst-' + inst.status);
        }
      });
    });
    store.getAllRequests().forEach(function (r) {
      if (Data.OPEN_REQUEST_STATUSES.indexOf(r.status) !== -1) {
        add(DateUtils.clampDay(r.requestedDate, year, month0), '🕓', 'Requested new date (' + r.status + ')', 'sched-cal-dot-pending');
      }
    });
    return events;
  }

  function esc(s) { return C.esc(s); }

  function renderCalendar() {
    var body = $('sched-calendar-body');
    if (!body) return;
    store.emit(Analytics.Events.CALENDAR_VIEWED, {});
    if (!calendarCursor) { var t = DateUtils.parseKey(DateUtils.todayKey()); calendarCursor = { year: t.year, month0: t.month0 }; }
    var year = calendarCursor.year, month0 = calendarCursor.month0;
    var events = buildMonthEvents(year, month0);

    var sips = schedulableSips();
    var mismatched = sips.map(function (sip) {
      return { sip: sip, mismatch: store.detectMismatchForSip(sip.id, year, month0) };
    }).filter(function (x) { return x.mismatch.status === Data.MismatchStatus.MISMATCH || x.mismatch.status === Data.MismatchStatus.UNCERTAIN; });

    mismatched.forEach(function (x) {
      var key = x.sip.id + ':' + x.mismatch.status;
      if (!seenMismatches[key]) { seenMismatches[key] = true; store.emit(Analytics.Events.MISMATCH_DETECTED, { sipId: x.sip.id, status: x.mismatch.status }); }
    });

    var banner = '';
    if (mismatched.length) {
      var first = mismatched[0];
      var debitDay = store.getCurrentDebitDay(first.sip.id);
      var copy = first.mismatch.status === Data.MismatchStatus.MISMATCH
        ? 'Your SIP is scheduled for the ' + DateUtils.ordinal(debitDay) + ', while your expected salary date is the ' + DateUtils.ordinal(first.mismatch.projectedIncomeDay) + '. You can review available SIP dates.'
        : 'Your SIP is scheduled for the ' + DateUtils.ordinal(debitDay) + ', which overlaps your estimated income window. You can review available SIP dates.';
      banner =
        '<div class="recovery-alert recovery-alert-pending">' +
          '<div class="recovery-alert-icon">⚠️</div>' +
          '<div class="recovery-alert-body">' +
            '<div class="small bold">' + esc(copy) + '</div>' +
            '<div class="tiny muted mt-4">' + esc(first.sip.fundName) + '</div>' +
            '<div class="row gap-8 mt-12">' +
              '<button class="btn btn-primary btn-sm" style="width:auto; flex:1;" id="sched-cal-view-sip">View SIP Details</button>' +
              '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="sched-cal-explore">Explore Available Dates</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    body.innerHTML =
      '<div class="row-between mt-8">' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" id="sched-cal-prev">‹ Prev</button>' +
        '<div class="small bold">' + DateUtils.monthLabel(year, month0) + '</div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" id="sched-cal-next">Next ›</button>' +
      '</div>' +
      banner +
      '<div class="mt-12">' + C.monthCalendar(year, month0, events) + '</div>' +
      '<div class="tiny faint mt-12">💳 SIP debit · 💰 Expected income · 🕓 Pending date-change request · ✅/⏳/❌ Instalment outcome (from your payment history). All projected payments shown here are simulated and not completed transactions.</div>';

    $('sched-cal-prev').onclick = function () { calendarCursor = DateUtils.parseKey(DateUtils.addMonths(DateUtils.makeKey(year, month0, 1), -1)); renderCalendar(); };
    $('sched-cal-next').onclick = function () { calendarCursor = DateUtils.parseKey(DateUtils.addMonths(DateUtils.makeKey(year, month0, 1), 1)); renderCalendar(); };
    var vb = $('sched-cal-view-sip'); if (vb) vb.onclick = function () { window.SchedulingUI.viewMismatch(mismatched[0].sip.id); };
    var eb = $('sched-cal-explore'); if (eb) eb.onclick = function () { window.SchedulingUI.startDateChange(mismatched[0].sip.id); };
  }

  // ───────────────────────── Screen 4: Date Mismatch Detection ─────────────────────────
  function renderMismatch(sipId) {
    var body = $('sched-mismatch-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    if (!sip) return;
    var today = DateUtils.todayKey(); var p = DateUtils.parseKey(today);
    var debitDay = store.getCurrentDebitDay(sipId);
    var income = store.getIncome();
    var mismatch = store.detectMismatchForSip(sipId, p.year, p.month0);
    var openRequests = store.getOpenRequestsForSip(sipId);

    body.innerHTML =
      '<div class="small bold mb-8">' + esc(sip.fundName) + '</div>' +
      C.mismatchExplanationCard(sip, debitDay, income, mismatch) +
      (openRequests.length ? '<div class="tiny muted mt-8">A date-change request for this SIP is already in progress.</div>' : '') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-primary" style="flex:1;" id="sched-mismatch-explore"' + (openRequests.length ? ' disabled' : '') + '>Explore Available Dates</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="sched-mismatch-keep">Keep Current Schedule</button>' +
      '</div>';
    var exp = $('sched-mismatch-explore'); if (exp) exp.onclick = function () { window.SchedulingUI.startDateChange(sipId); };
    $('sched-mismatch-keep').onclick = function () { window.goBack(); };
  }

  // ───────────────────────── Screen 5: Eligible SIP Date Options ─────────────────────────
  function renderEligibleDates(sipId, selectedDay) {
    var body = $('sched-eligible-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    if (!sip || !capability) return;
    store.emit(Analytics.Events.DATES_VIEWED, { sipId: sipId });

    if (!capability.canChangeDate) {
      body.innerHTML = C.unavailableNotice(sip) + C.capabilitySummaryCard(capability) +
        '<button class="btn btn-outline mt-8" id="sched-eligible-return">Return to SIP Details</button>';
      $('sched-eligible-return').onclick = function () { window.SchedulingUI.viewRecoveryDetails(sipId); };
      return;
    }
    var currentDay = store.getCurrentDebitDay(sipId);
    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="tiny muted mt-4">Currently debited on the ' + DateUtils.ordinal(currentDay) + '. Choose a new date below — only dates this simulated provider allows for this SIP are shown.</div>' +
      '<div class="mt-16">' + C.eligibleDatesList(capability.allowedDates, selectedDay) + '</div>' +
      C.capabilitySummaryCard(capability) +
      '<button class="btn btn-primary mt-8" id="sched-eligible-continue"' + (selectedDay ? '' : ' disabled') + '>Continue</button>' +
      '<button class="btn btn-outline mt-8" id="sched-eligible-back">Return to SIP Details</button>';

    qsa(body, '[data-action="select-eligible-date"]').forEach(function (btn) {
      btn.onclick = function () { window.SchedulingUI.selectEligibleDate(sipId, Number(btn.dataset.day)); };
    });
    var cont = $('sched-eligible-continue');
    if (cont) cont.onclick = function () { window.SchedulingUI.goConfirm(sipId, selectedDay); };
    $('sched-eligible-back').onclick = function () { window.SchedulingUI.viewRecoveryDetails(sipId); };
  }

  // ───────────────────────── Screen 6: Date Change Confirmation ─────────────────────────
  function renderConfirm(sipId, requestedDay) {
    var body = $('sched-confirm-body');
    if (!body) return;
    var sip = recoveryStore.getSip(sipId);
    var capability = store.getCapability(sipId);
    var currentDay = store.getCurrentDebitDay(sipId);
    var effectiveDate = window.SchedulingEngine.computeEffectiveDate(capability, requestedDay, DateUtils.todayKey());

    body.innerHTML =
      C.changeConfirmationCard(sip, currentDay, requestedDay, capability, effectiveDate) +
      '<label class="row gap-8 mt-16" style="align-items:flex-start; cursor:pointer;">' +
        '<input type="checkbox" id="sched-confirm-checkbox" style="margin-top:3px;">' +
        '<span class="tiny">I understand this is a simulated scheduling request and its effective date depends on provider rules.</span>' +
      '</label>' +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="sched-confirm-back">Go Back</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="sched-confirm-cancel">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1;" id="sched-confirm-submit">Confirm Change</button>' +
      '</div>';

    $('sched-confirm-back').onclick = function () { window.goBack(); };
    $('sched-confirm-cancel').onclick = function () { window.SchedulingUI.goOverview(); };
    var submitBtn = $('sched-confirm-submit');
    var submitted = false;
    submitBtn.onclick = function () {
      if (submitted) return;
      var checkbox = $('sched-confirm-checkbox');
      if (!checkbox.checked) { window.showToast('Please confirm you understand this is a simulated request'); return; }
      submitted = true;
      submitBtn.disabled = true;
      window.SchedulingUI.submitDateChange(sipId, requestedDay);
    };
  }

  // ───────────────────────── Screen 7: Request Processing and Results ─────────────────────────
  function renderRequest(requestId) {
    var body = $('sched-request-body');
    if (!body) return;
    var request = store.getRequest(requestId);
    if (!request) { body.innerHTML = '<div class="empty-state"><div class="emoji">🕓</div><div class="small">Request not found.</div></div>'; return; }
    var sip = recoveryStore.getSip(request.sipId);

    body.innerHTML =
      '<div class="small bold">' + esc(sip.fundName) + '</div>' +
      '<div class="mt-12">' + C.requestStatusCard(request, sip) + '</div>' +
      (request.status === Data.RequestStatus.REQUIRES_REAUTHORIZATION ?
        '<button class="btn btn-primary mt-8" id="sched-req-reauth">Complete Reauthorization (demo)</button>' : '') +
      (request.status === Data.RequestStatus.PENDING_PROVIDER_APPROVAL || request.status === Data.RequestStatus.REQUIRES_REAUTHORIZATION ?
        '<button class="btn btn-outline mt-8" id="sched-req-check">Check Status</button>' : '') +
      (request.status === Data.RequestStatus.APPROVED ?
        '<button class="btn btn-outline mt-8" id="sched-req-fastforward">⏩ Simulate: Fast-forward to Effective Date (demo)</button>' : '') +
      (Data.CANCELLABLE_STATUSES.indexOf(request.status) !== -1 ?
        '<button class="btn btn-danger-outline mt-8" id="sched-req-cancel">Cancel Request</button>' : '') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" id="sched-req-details">Return to SIP Details</button>' +
        '<button class="btn btn-outline" style="flex:1;" id="sched-req-history">View Request History</button>' +
      '</div>';

    var reauth = $('sched-req-reauth'); if (reauth) reauth.onclick = function () { store.completeReauthorization(requestId); window.showToast('Reauthorization completed (simulated)'); renderRequest(requestId); };
    var check = $('sched-req-check'); if (check) check.onclick = function () { store.checkRequestStatus(requestId); renderRequest(requestId); };
    var ff = $('sched-req-fastforward'); if (ff) ff.onclick = function () { store.simulateReachEffectiveDate(requestId); window.showToast('Effective date reached (simulated)'); renderRequest(requestId); };
    var cancel = $('sched-req-cancel'); if (cancel) cancel.onclick = function () {
      var res = store.cancelRequest(requestId);
      if (!res.ok) { window.showToast('This request cannot be cancelled right now.'); return; }
      window.showToast('Request cancelled');
      renderRequest(requestId);
    };
    $('sched-req-details').onclick = function () { window.SchedulingUI.viewRecoveryDetails(request.sipId); };
    $('sched-req-history').onclick = function () { window.SchedulingUI.goHistory(request.sipId); };
  }

  // ───────────────────────── Screen 8: Scheduling History ─────────────────────────
  function renderHistory(focusSipId) {
    var body = $('sched-history-body');
    if (!body) return;
    var sips = schedulableSips();
    var activeSipId = focusSipId || (sips[0] && sips[0].id);

    var pills = sips.map(function (s) {
      return '<button class="pill' + (s.id === activeSipId ? ' active' : '') + '" data-sip-id="' + esc(s.id) + '">' + esc(s.fundName) + '</button>';
    }).join('');

    var past = [], future = [];
    if (activeSipId) {
      recoveryStore.getInstalmentsForSip(activeSipId).forEach(function (inst) {
        var dt = new Date(inst.scheduledDate);
        (dt.getTime() <= Date.now() ? past : future).push(inst);
      });
    }
    var requests = activeSipId ? store.getRequestsForSip(activeSipId) : [];

    body.innerHTML =
      '<div class="pill-row">' + pills + '</div>' +
      '<div class="section-header mt-16"><h3>Past Payment History</h3></div>' +
      (past.length ? past.map(function (i) { return historyRow(i); }).join('') : '<div class="tiny muted">No past instalments recorded.</div>') +
      '<div class="section-header mt-16"><h3>Future Scheduled Instalments</h3></div>' +
      (future.length ? future.map(function (i) { return historyRow(i); }).join('') : '<div class="tiny muted">No future instalments scheduled.</div>') +
      '<div class="section-header mt-16"><h3>Date-Change Request History</h3></div>' +
      C.schedulingTimeline(requests);

    function historyRow(inst) {
      var isoDay = new Date(inst.scheduledDate).toISOString().slice(0, 10);
      return '<div class="list-row">' + window.RecoveryComponents.statusBadge(inst.status) + '<div style="flex:1;"><div class="small bold">' + C.inr(inst.amount) + '</div><div class="tiny muted">' + DateUtils.formatIndianDate(isoDay) + '</div></div></div>';
    }

    qsa(body, '[data-sip-id]').forEach(function (btn) {
      btn.onclick = function () { renderHistory(btn.dataset.sipId); };
    });
  }

  // ───────────────────────── Screen 9: Reminders and Notifications ─────────────────────────
  function renderNotifications() {
    var list = $('sched-notif-list');
    var toggle = $('sched-reminder-toggle');
    if (!list) return;
    var income = store.getIncome();
    if (toggle) toggle.checked = !!(income && income.reminderEnabled);
    var notifs = store.getNotifications();
    if (!notifs.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><div class="small">No scheduling notifications yet.</div></div>';
    } else {
      list.innerHTML = '<div class="card">' + notifs.map(C.schedulingNotificationItem).join('') + '</div>';
      qsa(list, '[data-sched-notif-id]').forEach(function (row) {
        row.onclick = function () { store.markNotificationRead(row.dataset.schedNotifId); renderNotifications(); };
      });
    }
  }

  // ───────────────────────── Screen 10: Feature Analytics ─────────────────────────
  function renderAnalytics() {
    var body = $('sched-analytics-body');
    if (!body) return;
    var summary = Analytics.computeMetrics(store, recoveryStore);
    body.innerHTML =
      '<div class="tiny faint mb-16">⚠️ ' + esc(summary.note) + '</div>' +
      '<div class="recovery-metric-grid">' + summary.metrics.map(function (m) {
        return '<div class="recovery-metric-tile"><div class="tiny muted">' + esc(m.label) + '</div><div class="bold" style="font-size:20px;">' + (m.value == null ? '—' : m.value + (m.unit === '%' ? '%' : m.unit === 'days' ? 'd' : '')) + '</div></div>';
      }).join('') + '</div>';
  }

  window.SchedulingScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot,
    renderOverview: renderOverview,
    renderIncomeSetup: renderIncomeSetup,
    renderCalendar: renderCalendar,
    renderMismatch: renderMismatch,
    renderEligibleDates: renderEligibleDates,
    renderConfirm: renderConfirm,
    renderRequest: renderRequest,
    renderHistory: renderHistory,
    renderNotifications: renderNotifications,
    renderAnalytics: renderAnalytics
  };
})();
