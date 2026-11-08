/**
 * AutoPay Health & Mandate Repair Assistant — controller wiring. Layers a
 * fourth wrapper on top of app.js's go()/goBack() (already wrapped by
 * Features 1-3), so every mandate-health screen renders itself on entry.
 * Exposes MandateUI for index.html's onclick handlers and
 * mandate/screens.js's wired buttons.
 */
(function () {
  'use strict';

  var Screens = window.MandateScreens;
  var store = Screens.store;
  var Data = window.MandateData;
  var Analytics = window.MandateAnalytics;
  var RC = window.RecoveryComponents;

  store.ensureLoaded();

  var UIState = {
    sipId: null,
    repairRequestId: null,
    historyFocusSipId: null,
    supportSipId: null,
    supportReason: null
  };

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-mandate-dashboard') Screens.renderDashboard();
    else if (id === 'screen-mandate-details') Screens.renderDetails(UIState.sipId);
    else if (id === 'screen-mandate-issues') Screens.renderIssues();
    else if (id === 'screen-mandate-explain') Screens.renderExplain(UIState.sipId);
    else if (id === 'screen-mandate-repair') Screens.renderRepair(UIState.sipId);
    else if (id === 'screen-mandate-reauth') Screens.renderReauth(UIState.repairRequestId);
    else if (id === 'screen-mandate-replacement') Screens.renderReplacement(UIState.repairRequestId);
    else if (id === 'screen-mandate-tracker') Screens.renderTracker(UIState.repairRequestId);
    else if (id === 'screen-mandate-readiness') Screens.renderReadiness(UIState.sipId);
    else if (id === 'screen-mandate-notifications') Screens.renderNotifications();
    else if (id === 'screen-mandate-support') Screens.renderSupport(UIState.supportSipId, UIState.supportReason);
    else if (id === 'screen-mandate-history') Screens.renderHistory(UIState.historyFocusSipId);
    else if (id === 'screen-mandate-analytics') Screens.renderAnalytics();
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

  window.MandateUI = {
    goDashboard: function () { window.go('screen-mandate-dashboard'); },
    switchScenario: function (scenarioId) {
      store.setFocusedScenario(scenarioId);
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
      window.showToast('Switched AutoPay demo scenario');
    },

    viewMandate: function (sipId) { UIState.sipId = sipId; window.go('screen-mandate-details'); },
    goDetails: function (sipId) { UIState.sipId = sipId; window.go('screen-mandate-details'); },
    goIssues: function () { window.go('screen-mandate-issues'); },
    goExplain: function (sipId) { UIState.sipId = sipId; window.go('screen-mandate-explain'); },

    goRepair: function (sipId) {
      var openRepair = store.getOpenRepairRequestsForSip(sipId);
      if (openRepair.length) {
        UIState.repairRequestId = openRepair[0].id;
        window.go('screen-mandate-tracker');
        window.showToast('A mandate repair request for this SIP is already in progress.');
        return;
      }
      UIState.sipId = sipId;
      window.go('screen-mandate-repair');
    },

    confirmRepairType: function (sipId, type) {
      var res = store.submitRepairRequest(sipId, type);
      if (!res.ok) {
        if (res.code === 'REQUEST_ALREADY_PENDING') {
          var open = store.getOpenRepairRequestsForSip(sipId);
          if (open.length) { UIState.repairRequestId = open[0].id; window.go('screen-mandate-tracker'); return; }
          window.MandateUI.goSupport(sipId, 'conflicting_repair_requests');
        } else if (res.code === 'NOT_SUPPORTED') {
          window.showToast('That repair option isn’t available for this mandate.');
          window.MandateUI.goSupport(sipId, 'unsupported_reauthorization');
        } else {
          window.showToast('We could not start this repair right now.');
          window.MandateUI.goSupport(sipId, 'general');
        }
        return;
      }
      UIState.repairRequestId = res.request.id;
      window.go('screen-mandate-reauth');
      window.showToast('Repair request started');
    },

    submitAuthorization: function (requestId) {
      var res = store.submitAuthorizationAttempt(requestId);
      if (!res.ok) { window.showToast('We could not process this authorization right now.'); return; }
      var request = res.request;
      if (request.type === Data.RepairType.REPLACEMENT && request.replacementRequestId && request.status === Data.RepairRequestStatus.PROVIDER_VERIFICATION_PENDING) {
        UIState.repairRequestId = requestId;
        window.go('screen-mandate-replacement');
        return;
      }
      UIState.repairRequestId = requestId;
      window.go('screen-mandate-tracker');
      if (res.attempt.outcome === 'approved') window.showToast('Authorization approved — verifying with provider');
      else if (res.attempt.outcome === 'rejected') window.showToast('Authorization was not approved');
      else if (res.attempt.outcome === 'provider_unavailable') window.showToast('Provider temporarily unavailable');
      else window.showToast('Authorization submitted');
    },

    viewRepairRequest: function (requestId) { UIState.repairRequestId = requestId; window.go('screen-mandate-tracker'); },
    goTracker: function (requestId) { UIState.repairRequestId = requestId; window.go('screen-mandate-tracker'); },
    goReplacement: function (requestId) { UIState.repairRequestId = requestId; window.go('screen-mandate-replacement'); },
    goReadiness: function (sipId) { UIState.sipId = sipId; window.go('screen-mandate-readiness'); },

    goHistory: function (sipId) { UIState.historyFocusSipId = sipId || null; window.go('screen-mandate-history'); },
    goNotifications: function () { window.go('screen-mandate-notifications'); },
    goSupport: function (sipId, reasonCode) { UIState.supportSipId = sipId || null; UIState.supportReason = reasonCode || null; window.go('screen-mandate-support'); },
    goAnalytics: function () { window.go('screen-mandate-analytics'); },

    toggleReminders: function (enabled) {
      store.setReminderOptIn(!!enabled);
      window.showToast(enabled ? 'AutoPay reminders enabled' : 'AutoPay reminders disabled');
    },

    advanceDemoClock: function (days) {
      store.advanceDemoClock(days);
      window.showToast('Demo date advanced by ' + days + ' days');
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
    },

    confirmResetDemo: function () {
      showDialog({
        title: 'Reset AutoPay demo data?',
        message: 'This clears all mandate repair and replacement requests, mandate history and AutoPay notifications, and reseeds the original demo scenarios. Features 1-3’s own data is not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('AutoPay demo data reset');
      });
    }
  };
})();
