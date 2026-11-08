/**
 * SIP Pause & Resume Manager — controller wiring. Layers a third wrapper
 * on top of app.js's go()/goBack() (already wrapped by Feature 1's SIP
 * Recovery Assistant and Feature 2's Salary-Aligned Scheduler), so every
 * pause/resume screen renders itself on entry. Exposes PauseUI for
 * index.html's onclick handlers and pause/screens.js's wired buttons.
 */
(function () {
  'use strict';

  var Screens = window.PauseScreens;
  var store = Screens.store;
  var Data = window.PauseData;
  var Analytics = window.PauseAnalytics;
  var RC = window.RecoveryComponents;

  store.ensureLoaded();

  var UIState = {
    sipId: null,
    cycles: null,
    pauseRequestId: null,
    resumeRequestId: null,
    historyFocusSipId: null,
    supportSipId: null,
    supportReason: null
  };

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-pause-dashboard') Screens.renderDashboard();
    else if (id === 'screen-pause-manage') Screens.renderManage(UIState.sipId);
    else if (id === 'screen-pause-eligibility') Screens.renderEligibility(UIState.sipId);
    else if (id === 'screen-pause-duration') Screens.renderDuration(UIState.sipId, UIState.cycles);
    else if (id === 'screen-pause-impact') Screens.renderImpact(UIState.sipId, UIState.cycles);
    else if (id === 'screen-pause-confirm') Screens.renderConfirm(UIState.sipId, UIState.cycles);
    else if (id === 'screen-pause-tracker') Screens.renderTracker(UIState.pauseRequestId);
    else if (id === 'screen-pause-paused') Screens.renderPausedDashboard(UIState.sipId);
    else if (id === 'screen-pause-early-resume') Screens.renderEarlyResume(UIState.sipId);
    else if (id === 'screen-pause-resume-tracker') Screens.renderResumeTracker(UIState.resumeRequestId);
    else if (id === 'screen-pause-history') Screens.renderHistory(UIState.historyFocusSipId);
    else if (id === 'screen-pause-notifications') Screens.renderNotifications();
    else if (id === 'screen-pause-support') Screens.renderSupport(UIState.supportSipId, UIState.supportReason);
    else if (id === 'screen-pause-analytics') Screens.renderAnalytics();
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

  window.PauseUI = {
    goDashboard: function () { window.go('screen-pause-dashboard'); },
    switchScenario: function (scenarioId) {
      store.setFocusedScenario(scenarioId);
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
      window.showToast('Switched pause/resume demo scenario');
    },

    manageSip: function (sipId) { UIState.sipId = sipId; window.go('screen-pause-manage'); },

    goEligibility: function (sipId) { UIState.sipId = sipId; window.go('screen-pause-eligibility'); },
    startPauseFlow: function (sipId) {
      var openPause = store.getOpenPauseRequestsForSip(sipId);
      if (openPause.length) {
        UIState.pauseRequestId = openPause[0].id;
        window.go('screen-pause-tracker');
        window.showToast('A pause request for this SIP is already in progress.');
        return;
      }
      UIState.sipId = sipId;
      UIState.cycles = null;
      window.go('screen-pause-eligibility');
    },

    goDuration: function (sipId, cycles) { UIState.sipId = sipId; UIState.cycles = cycles || UIState.cycles; window.go('screen-pause-duration'); },
    selectCycles: function (sipId, cycles) { UIState.cycles = cycles; Screens.renderDuration(sipId, cycles); },
    goImpact: function (sipId, cycles) { UIState.sipId = sipId; UIState.cycles = cycles; window.go('screen-pause-impact'); },
    goConfirm: function (sipId, cycles) { UIState.sipId = sipId; UIState.cycles = cycles; window.go('screen-pause-confirm'); },

    submitPause: function (sipId, cycles) {
      store.emit(Analytics.Events.REQUEST_SUBMITTED, { sipId: sipId, cycles: cycles });
      var res = store.submitPauseRequest(sipId, cycles);
      if (!res.ok) {
        if (res.code === 'REQUEST_ALREADY_PENDING') {
          window.showToast('A pause request for this SIP is already in progress.');
          var open = store.getOpenPauseRequestsForSip(sipId);
          if (open.length) { UIState.pauseRequestId = open[0].id; window.go('screen-pause-tracker'); return; }
        } else if (res.code === 'SCHEDULING_CONFLICT') {
          window.showToast('This SIP has a pending debit-date change request.');
          window.PauseUI.goSupport(sipId, 'scheduling_conflict');
          return;
        } else if (res.code === 'NOT_SUPPORTED') {
          window.showToast('Temporary pause is not available for this SIP.');
        } else if (res.code === 'CYCLES_OUT_OF_RANGE') {
          window.showToast('That duration is not offered by this provider.');
        } else {
          window.showToast('We could not submit this pause request right now.');
        }
        window.go('screen-pause-manage');
        return;
      }
      UIState.pauseRequestId = res.request.id;
      window.go('screen-pause-tracker');
      window.showToast('Pause request submitted');
    },

    viewPauseRequest: function (requestId) { UIState.pauseRequestId = requestId; window.go('screen-pause-tracker'); },

    goPausedDashboard: function (sipId) { UIState.sipId = sipId; window.go('screen-pause-paused'); },

    goEarlyResume: function (sipId) { UIState.sipId = sipId; window.go('screen-pause-early-resume'); },
    submitEarlyResume: function (sipId) {
      store.emit(Analytics.Events.EARLY_RESUME_REQUESTED, { sipId: sipId });
      var res = store.requestEarlyResume(sipId);
      if (!res.ok) {
        if (res.code === 'REQUEST_ALREADY_PENDING') {
          var open = store.getOpenResumeRequestsForSip(sipId);
          if (open.length) { UIState.resumeRequestId = open[0].id; window.go('screen-pause-resume-tracker'); return; }
        } else if (res.code === 'NOT_SUPPORTED') {
          window.showToast('Early resume isn’t available for this SIP.');
        } else if (res.code === 'NOT_PAUSED') {
          window.showToast('This SIP is not currently paused.');
        } else {
          window.showToast('We could not submit this resume request right now.');
        }
        window.go('screen-pause-manage');
        return;
      }
      UIState.resumeRequestId = res.request.id;
      window.go('screen-pause-resume-tracker');
      window.showToast('Resume request submitted');
    },
    goResumeTracker: function (requestId) { UIState.resumeRequestId = requestId; window.go('screen-pause-resume-tracker'); },

    goHistory: function (sipId) { UIState.historyFocusSipId = sipId || null; window.go('screen-pause-history'); },
    goNotifications: function () { window.go('screen-pause-notifications'); },
    goSupport: function (sipId, reasonCode) { UIState.supportSipId = sipId || null; UIState.supportReason = reasonCode || null; window.go('screen-pause-support'); },
    goAnalytics: function () { window.go('screen-pause-analytics'); },

    toggleReminders: function (enabled) {
      store.setReminderOptIn(!!enabled);
      window.showToast(enabled ? 'Pause reminders enabled' : 'Pause reminders disabled');
    },

    advanceDemoClock: function (days) {
      store.advanceDemoClock(days);
      window.showToast('Demo date advanced by ' + days + ' days');
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
    },

    confirmResetDemo: function () {
      showDialog({
        title: 'Reset pause/resume demo data?',
        message: 'This clears all pause and resume requests, lifecycle history, pause notifications and the demo clock, and reseeds the original demo scenarios. Feature 1’s recovery data and Feature 2’s scheduling data are not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('Pause/resume demo data reset');
      });
    }
  };

  void Data;
})();
