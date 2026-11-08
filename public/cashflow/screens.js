/**
 * SIP Cash-Flow Planner — DOM rendering for every cash-flow screen.
 * Browser-only: queries the real DOM and wires events. Pure markup comes
 * from CashFlowComponents; all calculation comes from CashFlowEngine via
 * CashFlowStore, which only ever reads Features 1-4's own stores (plus one
 * call to Feature 2's own setIncome()) — mirroring Features 1-4's own
 * screens.js files.
 */
(function () {
  'use strict';

  var Data = window.CashFlowData;
  var Engine = window.CashFlowEngine;
  var DateUtils = window.SchedulingDateUtils;
  var C = window.CashFlowComponents;
  var Analytics = window.CashFlowAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var schedulingStore = window.SchedulingScreens.store;
  var pauseStore = window.PauseScreens ? window.PauseScreens.store : null;
  var mandateStore = window.MandateScreens ? window.MandateScreens.store : null;
  var store = new window.CashFlowStore({ recoveryStore: recoveryStore, schedulingStore: schedulingStore, pauseStore: pauseStore, mandateStore: mandateStore });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  var CalState = { year: null, month0: null, selectedKey: null };

  // ───────────────────────── Entry slot inside screen-sips ─────────────────────────
  function renderEntrySlot() {
    var slot = $('cf-sips-slot');
    if (!slot) return;
    var ov = store.getOverview();
    slot.innerHTML =
      '<div class="section-header"><h3>SIP Cash-Flow Planner</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">See how much is scheduled for upcoming SIP instalments against your own income and expenses — a planning view, never a verified bank balance.</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Next 7 days</span><span class="small bold">' + C.inr(ov.next7TotalPaise) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Next 30 days</span><span class="small bold">' + C.inr(ov.next30TotalPaise) + '</span></div>' +
        '<button class="btn btn-primary mt-16" id="cf-entry-open">Open SIP Cash-Flow Planner</button>' +
      '</div>';
    var open = $('cf-entry-open'); if (open) open.onclick = function () { window.CashFlowUI.goOverview(); };
  }

  // ───────────────────────── Screen 1: Cash-Flow Overview ─────────────────────────
  function renderOverview() {
    var body = $('cf-overview-body');
    if (!body) return;
    store.emit(Analytics.Events.PLANNER_OPENED, {});
    var ov = store.getOverview();
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();
    var profile = store.getProfile();

    var failuresHtml = ov.unresolvedFailures.length
      ? '<div class="section-header mt-16"><h3>Unresolved Past Failures</h3></div>' +
        ov.unresolvedFailures.map(function (f) {
          var sip = recoveryStore.getSip(f.sipId);
          return '<div class="list-row cf-row"><div style="flex:1;"><span class="small bold">' + C.esc(sip ? sip.fundName : f.sipId) + '</span>' +
            '<div class="tiny muted mt-4">' + C.inr(Math.round(f.amount * 100)) + ' · not counted as an upcoming commitment</div></div>' +
            '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="cf-resolve-failure" data-instalment-id="' + C.esc(f.id) + '">Resolve</button></div>';
        }).join('')
      : '';

    body.innerHTML =
      '<div class="tiny faint mb-12">⚠️ Demo prototype — all figures are self-reported estimates, not a verified bank balance. This is not the official INDmoney app.</div>' +
      C.scenarioPillRow(scenarios, focusedId) +
      '<div class="card-glass mt-12">' +
        '<div class="tiny" style="opacity:0.85;">Upcoming SIP Commitments</div>' +
        '<div class="row-between mt-8"><span>Next 7 Days</span><span class="bold">' + C.inr(ov.next7TotalPaise) + '</span></div>' +
        '<div class="row-between mt-4"><span>Next 30 Days</span><span class="bold">' + C.inr(ov.next30TotalPaise) + '</span></div>' +
        '<div class="row-between mt-4"><span>Next Instalment</span><span class="bold">' + (ov.nextDateKey ? C.dateLabel(ov.nextDateKey) : 'None scheduled') + '</span></div>' +
      '</div>' +
      '<div class="recovery-metric-grid mt-12">' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Instalments (30d)</div><div class="bold" style="font-size:20px;">' + ov.next30Count + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">SIPs included</div><div class="bold" style="font-size:20px;">' + ov.sipCount + '</div></div>' +
      '</div>' +
      (ov.gapCount > 0
        ? '<div class="card mt-12"><div class="tiny cf-warn">⚠️ ' + ov.gapCount + ' upcoming date' + (ov.gapCount > 1 ? 's' : '') + ' may have an estimated cash-flow gap based on what you’ve entered.</div><button class="btn btn-outline btn-sm mt-8" style="width:auto;" id="cf-ov-view-gaps">View Details</button></div>'
        : (profile.openingCashPaise != null ? '<div class="card mt-12"><div class="tiny">✅ No estimated cash-flow gaps found with the information you’ve entered.</div></div>' : '')) +
      failuresHtml +
      '<button class="btn btn-primary mt-16" id="cf-ov-calendar">View Cash-Flow Calendar</button>' +
      '<button class="btn btn-secondary mt-8" id="cf-ov-setup">Add Income &amp; Expenses</button>' +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-breakdown">📋 Breakdown</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-timeline">📈 Timeline</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-whatif">🧪 What-If</button>' +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-reminders">🔔 Reminders</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-actions">🧭 Actions</button>' +
        '<button class="btn btn-outline btn-sm" style="width:auto; flex:1;" id="cf-ov-analytics">📊 Analytics</button>' +
      '</div>' +
      '<button class="btn btn-danger-outline btn-sm mt-8" id="cf-ov-reset">↺ Reset Demo Data</button>';

    qsa(body, '[data-action="focus-cf-scenario"]').forEach(function (btn) {
      btn.onclick = function () { window.CashFlowUI.switchScenario(btn.dataset.scenarioId); };
    });
    qsa(body, '[data-action="cf-resolve-failure"]').forEach(function (btn) {
      btn.onclick = function () { window.RecoveryUI.resolveNow(btn.dataset.instalmentId); };
    });
    var viewGaps = $('cf-ov-view-gaps'); if (viewGaps) viewGaps.onclick = function () { window.CashFlowUI.goGaps(); };
    $('cf-ov-calendar').onclick = function () { window.CashFlowUI.goCalendar(); };
    $('cf-ov-setup').onclick = function () { window.CashFlowUI.goSetup(); };
    $('cf-ov-breakdown').onclick = function () { window.CashFlowUI.goBreakdown(); };
    $('cf-ov-timeline').onclick = function () { window.CashFlowUI.goTimeline(); };
    $('cf-ov-whatif').onclick = function () { window.CashFlowUI.goWhatIf(); };
    $('cf-ov-reminders').onclick = function () { window.CashFlowUI.goReminders(); };
    $('cf-ov-actions').onclick = function () { window.CashFlowUI.goActions(); };
    $('cf-ov-analytics').onclick = function () { window.CashFlowUI.goAnalytics(); };
    $('cf-ov-reset').onclick = function () { window.CashFlowUI.confirmResetDemo(); };
  }

  // ───────────────────────── Screen 2: Income & Expense Setup ─────────────────────────
  function renderSetup() {
    var body = $('cf-setup-body');
    if (!body) return;
    store.emit(Analytics.Events.SETUP_STARTED, {});
    var profile = store.getProfile();
    var income = store.getIncome();
    var pattern = income && income.pattern ? income.pattern : 'fixed';

    function money(paise) { return paise == null ? '' : Math.round(paise / 100); }

    body.innerHTML =
      '<div class="tiny faint mb-12">Optional — all figures are self-reported and never a verified bank balance. We never collect banking credentials or connect to a real account.</div>' +
      '<div class="card">' +
        '<label class="small bold">Current available cash estimate (optional)</label>' +
        '<input type="number" class="cf-input" id="cf-in-opening" placeholder="e.g. 8000" value="' + money(profile.openingCashPaise) + '">' +
        '<label class="small bold mt-12">Expected monthly income</label>' +
        '<input type="number" class="cf-input" id="cf-in-income" placeholder="e.g. 30000" value="' + money(profile.incomeAmountPaise) + '">' +
      '</div>' +
      '<div class="card mt-12">' +
        '<div class="row-between"><span class="small bold">Expected income date</span><button class="btn btn-outline btn-sm" style="width:auto;" id="cf-open-f2">Open Feature 2</button></div>' +
        '<div class="tiny muted mt-4">This date is shared with Salary-Aligned SIP Scheduling — there is only one income-date setting in the app.</div>' +
        '<select class="cf-input mt-8" id="cf-income-pattern">' +
          '<option value="fixed"' + (pattern === 'fixed' ? ' selected' : '') + '>Fixed day each month</option>' +
          '<option value="variable"' + (pattern === 'variable' ? ' selected' : '') + '>Variable (date range)</option>' +
          '<option value="irregular"' + (pattern === 'irregular' ? ' selected' : '') + '>Irregular — enter income manually</option>' +
        '</select>' +
        '<div id="cf-income-pattern-fields" class="mt-8"></div>' +
        '<button class="btn btn-secondary mt-8" id="cf-save-income">Save Income Date</button>' +
      '</div>' +
      renderExpensesSection(profile) +
      '<button class="btn btn-primary mt-16" id="cf-save-profile">Save Cash-Flow Profile</button>' +
      '<button class="btn btn-outline mt-8" id="cf-setup-done">Return to Overview</button>';

    function renderPatternFields() {
      var el = $('cf-income-pattern-fields');
      var p = $('cf-income-pattern').value;
      if (p === 'fixed') {
        el.innerHTML = '<label class="tiny muted">Day of month</label><input type="number" min="1" max="31" class="cf-input" id="cf-income-day" value="' + (income && income.fixedDay ? income.fixedDay : '') + '">';
      } else if (p === 'variable') {
        el.innerHTML =
          '<label class="tiny muted">Earliest day</label><input type="number" min="1" max="31" class="cf-input" id="cf-income-start" value="' + (income && income.variableStart ? income.variableStart : '') + '">' +
          '<label class="tiny muted mt-8">Latest day</label><input type="number" min="1" max="31" class="cf-input" id="cf-income-end" value="' + (income && income.variableEnd ? income.variableEnd : '') + '">';
      } else {
        el.innerHTML = '<div class="tiny muted">Add upcoming income manually from the Overview’s Action Center, or use the date picker below for a one-off entry.</div>' +
          '<input type="date" class="cf-input mt-8" id="cf-income-manual-date">' +
          '<input type="number" class="cf-input mt-8" id="cf-income-manual-amount" placeholder="Amount (₹)">' +
          '<button class="btn btn-outline btn-sm mt-8" style="width:auto;" id="cf-add-manual-income">Add Income Entry</button>';
        var addManual = $('cf-add-manual-income');
        if (addManual) addManual.onclick = function () {
          var d = $('cf-income-manual-date').value, a = Number($('cf-income-manual-amount').value || 0);
          if (d && a > 0) { store.addManualIncomeEvent(d, Math.round(a * 100), 'Manually entered income'); window.showToast('Income entry added'); renderSetup(); }
        };
      }
    }
    renderPatternFields();
    $('cf-income-pattern').onchange = renderPatternFields;

    $('cf-open-f2').onclick = function () { window.SchedulingUI.goIncomeSetup(); };
    $('cf-save-income').onclick = function () {
      var p = $('cf-income-pattern').value;
      var fields = { pattern: p };
      if (p === 'fixed') fields.fixedDay = Number($('cf-income-day').value || 1);
      else if (p === 'variable') { fields.variableStart = Number($('cf-income-start').value || 1); fields.variableEnd = Number($('cf-income-end').value || 1); }
      store.setIncomeDate(fields);
      window.showToast('Income date saved');
      renderSetup();
    };

    qsa(body, '[data-action="cf-remove-recurring"]').forEach(function (btn) {
      btn.onclick = function () { store.removeRecurringExpense(btn.dataset.id); renderSetup(); };
    });
    qsa(body, '[data-action="cf-remove-onetime"]').forEach(function (btn) {
      btn.onclick = function () { store.removeOneTimeExpense(btn.dataset.id); renderSetup(); };
    });
    $('cf-add-recurring').onclick = function () {
      var cat = $('cf-rec-category').value, label = $('cf-rec-label').value.trim() || Data.EXPENSE_CATEGORY_LABELS[cat];
      var amount = Number($('cf-rec-amount').value || 0), day = Number($('cf-rec-day').value || 1);
      if (amount > 0) { store.addRecurringExpense({ category: cat, label: label, amountPaise: Math.round(amount * 100), dayOfMonth: day }); renderSetup(); }
    };
    $('cf-add-onetime').onclick = function () {
      var label = $('cf-one-label').value.trim() || 'One-time expense';
      var amount = Number($('cf-one-amount').value || 0), date = $('cf-one-date').value;
      if (amount > 0 && date) { store.addOneTimeExpense({ label: label, amountPaise: Math.round(amount * 100), dateKey: date }); renderSetup(); }
    };

    $('cf-save-profile').onclick = function () {
      var opening = $('cf-in-opening').value, income2 = $('cf-in-income').value;
      store.setProfile({
        openingCashPaise: opening === '' ? null : Math.round(Number(opening) * 100),
        incomeAmountPaise: income2 === '' ? null : Math.round(Number(income2) * 100)
      });
      window.showToast('Cash-flow profile saved');
      window.CashFlowUI.goOverview();
    };
    $('cf-setup-done').onclick = function () { window.CashFlowUI.goOverview(); };
  }

  function renderExpensesSection(profile) {
    var recurringRows = profile.recurringExpenses.map(function (e) {
      return '<div class="list-row cf-row"><div style="flex:1;"><span class="small bold">' + C.esc(e.label) + '</span><div class="tiny muted mt-4">' + C.inr(e.amountPaise) + ' · day ' + e.dayOfMonth + ' of each month</div></div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="cf-remove-recurring" data-id="' + C.esc(e.id) + '">Remove</button></div>';
    }).join('');
    var oneTimeRows = profile.oneTimeExpenses.map(function (e) {
      return '<div class="list-row cf-row"><div style="flex:1;"><span class="small bold">' + C.esc(e.label) + '</span><div class="tiny muted mt-4">' + C.inr(e.amountPaise) + (e.dateKey ? ' · ' + C.dateLabel(e.dateKey) : '') + '</div></div>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="cf-remove-onetime" data-id="' + C.esc(e.id) + '">Remove</button></div>';
    }).join('');
    var catOptions = Object.keys(Data.EXPENSE_CATEGORY_LABELS).map(function (k) { return '<option value="' + k + '">' + Data.EXPENSE_CATEGORY_LABELS[k] + '</option>'; }).join('');
    return (
      '<div class="card mt-12">' +
        '<div class="small bold">Recurring monthly expenses</div>' +
        (recurringRows || '<div class="tiny muted mt-8">None added yet.</div>') +
        '<select class="cf-input mt-8" id="cf-rec-category">' + catOptions + '</select>' +
        '<input type="text" class="cf-input mt-8" id="cf-rec-label" placeholder="Label (optional)">' +
        '<input type="number" class="cf-input mt-8" id="cf-rec-amount" placeholder="Amount (₹)">' +
        '<input type="number" min="1" max="31" class="cf-input mt-8" id="cf-rec-day" placeholder="Day of month">' +
        '<button class="btn btn-outline btn-sm mt-8" style="width:auto;" id="cf-add-recurring">Add Recurring Expense</button>' +
      '</div>' +
      '<div class="card mt-12">' +
        '<div class="small bold">One-time upcoming expenses</div>' +
        (oneTimeRows || '<div class="tiny muted mt-8">None added yet.</div>') +
        '<input type="text" class="cf-input mt-8" id="cf-one-label" placeholder="Label">' +
        '<input type="number" class="cf-input mt-8" id="cf-one-amount" placeholder="Amount (₹)">' +
        '<input type="date" class="cf-input mt-8" id="cf-one-date">' +
        '<button class="btn btn-outline btn-sm mt-8" style="width:auto;" id="cf-add-onetime">Add One-Time Expense</button>' +
      '</div>'
    );
  }

  // ───────────────────────── Screen 3: Upcoming SIP Calendar ─────────────────────────
  function buildMonthEvents(year, month0) {
    var monthStartKey = DateUtils.makeKey(year, month0, 1);
    var monthEndKey = DateUtils.makeKey(year, month0, DateUtils.daysInMonth(year, month0));
    var today = store.getDemoToday();
    var ctxList = store.buildSipContexts();
    var occurrences = Engine.buildSipOccurrences(ctxList, today, monthEndKey)
      .filter(function (o) { return o.dateKey >= monthStartKey && o.dateKey <= monthEndKey; })
      .map(function (o) { return store.enrichOccurrence(o); });
    var profile = store.getProfile(), income = store.getIncome(), manual = store.getManualIncomeEvents();
    var incomeEvents = Engine.buildIncomeEvents(profile, income, manual, today, monthEndKey).filter(function (e) { return e.dateKey >= monthStartKey && e.dateKey <= monthEndKey; });
    var expenseEvents = Engine.buildExpenseEvents(profile, today, monthEndKey).filter(function (e) { return e.dateKey >= monthStartKey && e.dateKey <= monthEndKey; });
    var failures = (recoveryStore.getAllInstalmentsWithSip ? recoveryStore.getAllInstalmentsWithSip() : [])
      .filter(function (r) { return r.instalment && (r.instalment.scheduledDate || '').slice(0, 10) >= monthStartKey && (r.instalment.scheduledDate || '').slice(0, 10) <= monthEndKey && (r.instalment.status === 'failed' || r.instalment.status === 'pending'); })
      .map(function (r) { return { kind: r.instalment.status === 'pending' ? 'pending' : 'failed', dateKey: (r.instalment.scheduledDate || '').slice(0, 10), label: r.sip.fundName, amountPaise: Math.round(r.instalment.amount * 100), sipId: r.sip.id }; });

    var eventsByDate = {};
    function push(key, ev) { (eventsByDate[key] = eventsByDate[key] || []).push(ev); }
    occurrences.forEach(function (o) { push(o.dateKey, Object.assign({ kind: 'sip' }, o)); });
    incomeEvents.forEach(function (e) { push(e.dateKey, e); });
    expenseEvents.forEach(function (e) { push(e.dateKey, e); });
    failures.forEach(function (f) { push(f.dateKey, f); });
    return eventsByDate;
  }

  function renderCalendar() {
    var body = $('cf-calendar-body');
    if (!body) return;
    store.emit(Analytics.Events.CALENDAR_VIEWED, {});
    var today = store.getDemoToday();
    var tp = DateUtils.parseKey(today);
    if (CalState.year == null) { CalState.year = tp.year; CalState.month0 = tp.month0; CalState.selectedKey = today; }

    var eventsByDate = buildMonthEvents(CalState.year, CalState.month0);
    var dayEvents = eventsByDate[CalState.selectedKey] || [];

    var legend =
      '<div class="cf-legend">' +
        '<span><span class="cf-cal-dot cf-cal-dot-sip"></span> SIP debit</span>' +
        '<span><span class="cf-cal-dot cf-cal-dot-income"></span> Income</span>' +
        '<span><span class="cf-cal-dot cf-cal-dot-expense"></span> Expense</span>' +
        '<span><span class="cf-cal-dot cf-cal-dot-failed"></span> Failed</span>' +
        '<span><span class="cf-cal-dot cf-cal-dot-pending"></span> Pending</span>' +
      '</div>';

    var dayDetail = dayEvents.length
      ? dayEvents.map(function (e) {
          if (e.kind === 'sip') return C.occurrenceRow(e, { hideStatus: !e.instalmentStatus });
          var label = e.kind === 'income' ? 'Expected income' : e.kind === 'expense' ? e.label : (e.kind === 'failed' ? 'Failed instalment — ' + e.label : 'Pending instalment — ' + e.label);
          var amt = e.amountPaise != null ? C.inr(Math.abs(e.amountPaise)) : '';
          return '<div class="list-row"><div style="flex:1;"><span class="small bold">' + C.esc(label) + '</span><div class="tiny muted mt-4">' + C.esc(e.kind) + (e.uncertain ? ' · estimated window' : '') + '</div></div><span class="small bold">' + amt + '</span></div>';
        }).join('')
      : '<div class="empty-state"><div class="emoji">📅</div><div class="small">Nothing scheduled on this date.</div></div>';

    body.innerHTML =
      '<div class="row-between">' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" id="cf-cal-prev">‹ Prev</button>' +
        '<span class="small bold">' + DateUtils.monthLabel(CalState.year, CalState.month0) + '</span>' +
        '<button class="btn btn-outline btn-sm" style="width:auto;" id="cf-cal-next">Next ›</button>' +
      '</div>' +
      legend +
      C.calendarGrid(CalState.year, CalState.month0, eventsByDate, CalState.selectedKey, today) +
      '<div class="section-header mt-16"><h3>' + C.dateLabel(CalState.selectedKey) + '</h3></div>' +
      dayDetail;

    $('cf-cal-prev').onclick = function () {
      var k = DateUtils.addMonths(DateUtils.makeKey(CalState.year, CalState.month0, 1), -1, 1);
      var p = DateUtils.parseKey(k); CalState.year = p.year; CalState.month0 = p.month0; renderCalendar();
    };
    $('cf-cal-next').onclick = function () {
      var k = DateUtils.addMonths(DateUtils.makeKey(CalState.year, CalState.month0, 1), 1, 1);
      var p = DateUtils.parseKey(k); CalState.year = p.year; CalState.month0 = p.month0; renderCalendar();
    };
    qsa(body, '[data-action="cf-select-date"]').forEach(function (btn) {
      btn.onclick = function () { CalState.selectedKey = btn.dataset.dateKey; renderCalendar(); };
    });
    qsa(body, '[data-action="view-cf-sip"]').forEach(function (btn) {
      btn.onclick = function () { window.CashFlowUI.viewSip(btn.dataset.sipId); };
    });
  }

  // ───────────────────────── Screen 4: Cash-Flow Timeline ─────────────────────────
  function renderTimeline() {
    var body = $('cf-timeline-body');
    if (!body) return;
    var projection = store.getCurrentProjection(30);
    var entries = projection.timeline.entries;
    var maxAbs = entries.reduce(function (m, e) { return e.closingBalancePaise != null ? Math.max(m, Math.abs(e.closingBalancePaise)) : m; }, 0);

    body.innerHTML =
      (!projection.hasOpeningBalance
        ? '<div class="card mb-12"><div class="tiny">ℹ️ No opening cash estimate on record — known commitments are shown below without a projected balance. <button class="btn btn-outline btn-sm mt-8" style="width:auto;" id="cf-tl-setup">Add Opening Cash Estimate</button></div></div>'
        : '<div class="card-glass mb-12"><div class="tiny" style="opacity:0.85;">Opening Cash Estimate</div><div class="bold" style="font-size:20px;">' + C.inr(projection.timeline.openingCashPaise) + '</div></div>') +
      (entries.length
        ? entries.map(function (e) { return C.timelineEntry(e, maxAbs); }).join('')
        : '<div class="empty-state"><div class="emoji">📈</div><div class="small">No upcoming income, expenses or SIPs in the next 30 days.</div></div>');

    var setupBtn = $('cf-tl-setup'); if (setupBtn) setupBtn.onclick = function () { window.CashFlowUI.goSetup(); };
  }

  // ───────────────────────── Screen 5: SIP Commitment Breakdown ─────────────────────────
  function renderBreakdown() {
    var body = $('cf-breakdown-body');
    if (!body) return;
    store.emit(Analytics.Events.UPCOMING_COMMITMENTS_VIEWED, {});
    var b = store.getBreakdown(60);
    body.innerHTML =
      '<div class="card"><div class="row-between"><span class="small muted">Total scheduled (60 days)</span><span class="small bold">' + C.inr(b.totalPaise) + '</span></div></div>' +
      C.groupedBreakdown('Next 7 Days', b.next7) +
      C.groupedBreakdown('Next 30 Days', b.next30) +
      C.groupedBreakdown('Current Month', b.currentMonth) +
      C.groupedBreakdown('Following Month', b.followingMonth) +
      (b.all.length ? '' : '<div class="empty-state"><div class="emoji">🔁</div><div class="small">No upcoming SIP instalments found.</div></div>');

    qsa(body, '[data-action="view-cf-sip"]').forEach(function (btn) {
      btn.onclick = function () { window.CashFlowUI.viewSip(btn.dataset.sipId); };
    });
  }

  // ───────────────────────── Screen 6: Estimated Cash-Flow Gap Detection ─────────────────────────
  function renderGaps() {
    var body = $('cf-gaps-body');
    if (!body) return;
    var projection = store.getCurrentProjection(30);
    var gaps = projection.gapAnalysis;
    var estimatedGaps = gaps.filter(function (g) { return g.status === 'estimated_gap'; });
    if (estimatedGaps.length) store.emit(Analytics.Events.GAP_IDENTIFIED, { count: estimatedGaps.length });

    body.innerHTML =
      '<div class="tiny faint mb-12">We never claim a payment will definitely fail — these are estimates based only on the information you’ve entered.</div>' +
      (gaps.length ? gaps.map(function (g) { return C.gapCard(g); }).join('') : '<div class="empty-state"><div class="emoji">🔎</div><div class="small">No scheduled SIP dates to check in the next 30 days.</div></div>');
  }

  // ───────────────────────── Screen 7: What-If Simulator ─────────────────────────
  function renderWhatIf(result) {
    var body = $('cf-whatif-body');
    if (!body) return;
    var current = store.getCurrentProjection(30);
    var r = result || { currentProjection: current, simulatedProjection: current, differencePaise: 0 };

    body.innerHTML =
      '<div class="tiny faint mb-12">Preview-only — changing an assumption here never modifies your actual SIP schedule, payments, mandates or pause requests.</div>' +
      '<div class="card">' +
        '<label class="small bold">Simulated income amount (₹)</label>' +
        '<input type="number" class="cf-input" id="cf-wi-income" placeholder="Leave blank to keep current">' +
        '<label class="small bold mt-12">Simulated opening cash (₹)</label>' +
        '<input type="number" class="cf-input" id="cf-wi-opening" placeholder="Leave blank to keep current">' +
        '<label class="small bold mt-12">Add a simulated one-time expense (₹)</label>' +
        '<input type="number" class="cf-input" id="cf-wi-expense" placeholder="e.g. 5000">' +
        '<button class="btn btn-primary mt-12" id="cf-wi-run">Run Simulation</button>' +
      '</div>' +
      '<div class="row gap-8 mt-12">' +
        C.whatIfCard('Current Projection', r.currentProjection) +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        C.whatIfCard('Simulated Projection', r.simulatedProjection) +
      '</div>' +
      (result ? '<div class="card mt-8"><div class="row-between"><span class="small bold">Difference in Estimated Cash Position</span><span class="small bold">' + (r.differencePaise != null ? C.inrSigned(r.differencePaise) : 'Not available') + '</span></div></div>' : '') +
      '<button class="btn btn-outline mt-12" id="cf-wi-reset">Reset Scenario</button>' +
      '<button class="btn btn-outline mt-8" id="cf-wi-actual">Return to Actual Schedule</button>' +
      '<button class="btn btn-secondary mt-8" id="cf-wi-actions">Review Available SIP Actions</button>';

    $('cf-wi-run').onclick = function () {
      var overrides = {};
      var inc = $('cf-wi-income').value, open = $('cf-wi-opening').value, exp = $('cf-wi-expense').value;
      if (inc !== '') overrides.incomeAmountPaise = Math.round(Number(inc) * 100);
      if (open !== '') overrides.openingCashPaise = Math.round(Number(open) * 100);
      if (exp !== '' && Number(exp) > 0) overrides.oneTimeExpenseAdd = { id: 'wi-' + Date.now(), label: 'Simulated expense', amountPaise: Math.round(Number(exp) * 100), dayOffsetFromToday: 1 };
      var res = store.previewWhatIf(overrides);
      renderWhatIf(res);
      window.showToast('Simulation updated — your actual schedule is unchanged');
    };
    $('cf-wi-reset').onclick = function () { store.resetWhatIf(); renderWhatIf(null); window.showToast('Scenario reset'); };
    $('cf-wi-actual').onclick = function () { store.resetWhatIf(); window.CashFlowUI.goOverview(); };
    $('cf-wi-actions').onclick = function () { window.CashFlowUI.goActions(); };
  }

  // ───────────────────────── Screen 8: Upcoming Commitment Reminders ─────────────────────────
  function renderReminders() {
    var body = $('cf-reminders-body');
    var toggle = $('cf-reminder-toggle');
    if (!body) return;
    store.refreshReminders();
    var notifs = store.getNotifications();
    if (toggle) toggle.checked = store.getReminderOptIn();
    body.innerHTML = notifs.length
      ? notifs.map(function (n) { return C.reminderItem(n); }).join('')
      : '<div class="empty-state"><div class="emoji">🔔</div><div class="small">No reminders right now.</div></div>';
    if (toggle) toggle.onchange = function () { window.CashFlowUI.toggleReminders(toggle.checked); };
  }

  // ───────────────────────── Screen 9: Action Center ─────────────────────────
  function renderActions(sipId) {
    var body = $('cf-actions-body');
    if (!body) return;
    var sip = sipId ? recoveryStore.getSip(sipId) : null;
    var rows =
      C.actionRow(Data.ActionType.REVIEW_PAYMENT, sipId) +
      C.actionRow(Data.ActionType.REVIEW_DATE, sipId) +
      C.actionRow(Data.ActionType.REVIEW_PAUSE, sipId) +
      C.actionRow(Data.ActionType.CHECK_AUTOPAY, sipId) +
      C.actionRow(Data.ActionType.UPDATE_PROFILE, sipId);

    body.innerHTML =
      (sip ? '<div class="tiny faint mb-12">Actions for <b>' + C.esc(sip.fundName) + '</b></div>' : '<div class="tiny faint mb-12">Choose where you’d like to go — nothing here is initiated automatically.</div>') +
      rows;

    qsa(body, '[data-action="cf-action"]').forEach(function (btn) {
      btn.onclick = function () {
        store.emit(Analytics.Events.ACTION_SELECTED, { type: btn.dataset.type, sipId: btn.dataset.sipId || null });
        window.CashFlowUI.runAction(btn.dataset.type, btn.dataset.sipId || null);
      };
    });
  }

  // ───────────────────────── Screen 10: Analytics Dashboard ─────────────────────────
  function renderAnalytics() {
    var body = $('cf-analytics-body');
    if (!body) return;
    var m = Analytics.computeMetrics(store, recoveryStore);
    body.innerHTML =
      '<div class="tiny faint mb-12">⚠️ SIMULATED — ' + C.esc(m.note) + '</div>' +
      '<div class="recovery-metric-grid">' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Planner opened</div><div class="bold" style="font-size:20px;">' + m.adoption.plannerOpened + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Setup completion rate</div><div class="bold" style="font-size:20px;">' + m.setupCompletionRate + '%</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Calendar views</div><div class="bold" style="font-size:20px;">' + m.calendarEngagement + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Commitments reviewed</div><div class="bold" style="font-size:20px;">' + m.shareReviewingCommitments + '%</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Estimated gap incidence</div><div class="bold" style="font-size:20px;">' + m.gapIncidencePct + '%</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">What-if runs</div><div class="bold" style="font-size:20px;">' + m.whatifUsage.completed + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Action click-through</div><div class="bold" style="font-size:20px;">' + m.actionCenterClickThroughPct + '%</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Reminder opt-ins</div><div class="bold" style="font-size:20px;">' + m.reminderOptIns + '</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Payment failure rate (cohort)</div><div class="bold" style="font-size:20px;">' + m.paymentFailureRatePct + '%</div></div>' +
        '<div class="recovery-metric-tile"><div class="tiny muted">Month-12 SIP activity</div><div class="bold" style="font-size:20px;">' + m.month12SipActivityPct + '%</div></div>' +
      '</div>';
  }

  window.CashFlowScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot, renderOverview: renderOverview, renderSetup: renderSetup,
    renderCalendar: renderCalendar, renderTimeline: renderTimeline, renderBreakdown: renderBreakdown,
    renderGaps: renderGaps, renderWhatIf: renderWhatIf, renderReminders: renderReminders,
    renderActions: renderActions, renderAnalytics: renderAnalytics
  };
})();
