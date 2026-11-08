/**
 * Salary-Aligned SIP Scheduler — controller wiring. Layers a second
 * wrapper on top of app.js's go()/goBack() (already wrapped once by the
 * SIP Recovery Assistant), so every scheduling screen renders itself on
 * entry. Exposes SchedulingUI for index.html's onclick handlers.
 */
(function () {
  'use strict';

  var Screens = window.SchedulingScreens;
  var store = Screens.store;
  var Data = window.SchedulingData;
  var Analytics = window.SchedulingAnalytics;
  var RC = window.RecoveryComponents;

  store.ensureLoaded();

  var UIState = {
    mismatchSipId: null,
    eligibleSipId: null,
    eligibleSelectedDay: null,
    confirmSipId: null,
    confirmDay: null,
    requestId: null,
    historyFocusSipId: null
  };

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-sched-overview') Screens.renderOverview();
    else if (id === 'screen-sched-income-setup') Screens.renderIncomeSetup();
    else if (id === 'screen-sched-calendar') Screens.renderCalendar();
    else if (id === 'screen-sched-mismatch') Screens.renderMismatch(UIState.mismatchSipId);
    else if (id === 'screen-sched-eligible-dates') Screens.renderEligibleDates(UIState.eligibleSipId, UIState.eligibleSelectedDay);
    else if (id === 'screen-sched-confirm') Screens.renderConfirm(UIState.confirmSipId, UIState.confirmDay);
    else if (id === 'screen-sched-request') Screens.renderRequest(UIState.requestId);
    else if (id === 'screen-sched-history') Screens.renderHistory(UIState.historyFocusSipId);
    else if (id === 'screen-sched-notifications') Screens.renderNotifications();
    else if (id === 'screen-sched-analytics') Screens.renderAnalytics();
  }

  var _origGo = window.go;
  window.go = function (id, opts) {
    _origGo(id, opts);
    onNavigate(id);
  };

  function showDialog(opts, onConfirm) {
    var root = document.getElementById('recovery-dialog-root');
    root.innerHTML = RC.confirmDialog(opts);
    function close() { root.innerHTML = ''; }
    document.getElementById('recovery-dialog-cancel').onclick = close;
    document.getElementById('recovery-dialog-confirm').onclick = function () { close(); onConfirm(); };
  }

  window.SchedulingUI = {
    goOverview: function () { window.go('screen-sched-overview'); },
    goIncomeSetup: function () { window.go('screen-sched-income-setup'); },
    goCalendar: function () { window.go('screen-sched-calendar'); },
    viewMismatch: function (sipId) { UIState.mismatchSipId = sipId; window.go('screen-sched-mismatch'); },
    viewRecoveryDetails: function (sipId) { window.RecoveryUI.viewDetails(sipId); },

    startDateChange: function (sipId) {
      var open = store.getOpenRequestsForSip(sipId);
      store.emit(Analytics.Events.CHANGE_STARTED, { sipId: sipId });
      if (open.length) {
        UIState.requestId = open[0].id;
        window.go('screen-sched-request');
        window.showToast('A scheduling request for this SIP is already in progress.');
        return;
      }
      UIState.eligibleSipId = sipId;
      UIState.eligibleSelectedDay = null;
      window.go('screen-sched-eligible-dates');
    },
    selectEligibleDate: function (sipId, day) {
      UIState.eligibleSelectedDay = day;
      Screens.renderEligibleDates(sipId, day);
    },
    goConfirm: function (sipId, day) {
      UIState.confirmSipId = sipId;
      UIState.confirmDay = day;
      window.go('screen-sched-confirm');
    },
    submitDateChange: function (sipId, day) {
      var res = store.submitDateChangeRequest(sipId, day);
      if (!res.ok) {
        if (res.code === 'REQUEST_ALREADY_PENDING' || res.code === 'DUPLICATE_REQUEST') {
          window.showToast('A request for this SIP is already in progress.');
          var open = store.getOpenRequestsForSip(sipId);
          if (open.length) { UIState.requestId = open[0].id; window.go('screen-sched-request'); return; }
        } else if (res.code === 'NOT_SUPPORTED') {
          window.showToast('This SIP’s date cannot be changed through this flow.');
        } else if (res.code === 'DATE_NOT_ALLOWED') {
          window.showToast('That date is not offered by this SIP’s provider.');
        } else {
          window.showToast('We could not submit this request right now.');
        }
        window.go('screen-sched-overview');
        return;
      }
      UIState.requestId = res.request.id;
      window.go('screen-sched-request');
      window.showToast('Date-change request submitted');
    },
    goHistory: function (sipId) { UIState.historyFocusSipId = sipId || null; window.go('screen-sched-history'); },
    goNotifications: function () { window.go('screen-sched-notifications'); },
    goAnalytics: function () { window.go('screen-sched-analytics'); },
    switchScenario: function (scenarioId) {
      store.setFocusedScenario(scenarioId);
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
      window.showToast('Switched scheduling demo scenario');
    },
    confirmResetDemo: function () {
      showDialog({
        title: 'Reset scheduling demo data?',
        message: 'This clears your saved income date, all date-change requests and scheduling notifications, and reseeds the original demo scenarios. Feature 1’s SIP Recovery data is not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('Scheduling demo data reset');
      });
    },
    setReminderPref: function (enabled) {
      var income = store.getIncome();
      if (income) { income.reminderEnabled = !!enabled; store.setIncome(income); }
      if (enabled) store.emit(Analytics.Events.REMINDER_ENABLED, {});
      window.showToast(enabled ? 'Scheduling reminders enabled' : 'Scheduling reminders disabled');
    }
  };

  void Data;
})();
