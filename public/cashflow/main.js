/**
 * SIP Cash-Flow Planner — controller wiring. Layers a fifth wrapper on top
 * of app.js's go()/goBack() (already wrapped by Features 1-4), so every
 * cash-flow screen renders itself on entry. Exposes CashFlowUI for
 * index.html's onclick handlers and cashflow/screens.js's wired buttons.
 */
(function () {
  'use strict';

  var Screens = window.CashFlowScreens;
  var store = Screens.store;

  store.ensureLoaded();

  var UIState = { sipId: null, lastWhatIfResult: null };

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-cashflow-overview') Screens.renderOverview();
    else if (id === 'screen-cashflow-setup') Screens.renderSetup();
    else if (id === 'screen-cashflow-calendar') Screens.renderCalendar();
    else if (id === 'screen-cashflow-timeline') Screens.renderTimeline();
    else if (id === 'screen-cashflow-breakdown') Screens.renderBreakdown();
    else if (id === 'screen-cashflow-gaps') Screens.renderGaps();
    else if (id === 'screen-cashflow-whatif') Screens.renderWhatIf(UIState.lastWhatIfResult);
    else if (id === 'screen-cashflow-reminders') Screens.renderReminders();
    else if (id === 'screen-cashflow-actions') Screens.renderActions(UIState.sipId);
    else if (id === 'screen-cashflow-analytics') Screens.renderAnalytics();
  }

  var _origGo = window.go;
  window.go = function (id, opts) {
    _origGo(id, opts);
    onNavigate(id);
  };

  function showDialog(opts, onConfirm) {
    var root = document.getElementById('recovery-dialog-root');
    root.innerHTML = window.RecoveryComponents.confirmDialog(opts);
    function close() { root.innerHTML = ''; }
    document.getElementById('recovery-dialog-cancel').onclick = close;
    document.getElementById('recovery-dialog-confirm').onclick = function () { close(); onConfirm(); };
  }

  window.CashFlowUI = {
    goOverview: function () { window.go('screen-cashflow-overview'); },
    goSetup: function () { window.go('screen-cashflow-setup'); },
    goCalendar: function () { window.go('screen-cashflow-calendar'); },
    goTimeline: function () { window.go('screen-cashflow-timeline'); },
    goBreakdown: function () { window.go('screen-cashflow-breakdown'); },
    goGaps: function () { window.go('screen-cashflow-gaps'); },
    goWhatIf: function () { UIState.lastWhatIfResult = null; window.go('screen-cashflow-whatif'); },
    goReminders: function () { window.go('screen-cashflow-reminders'); },
    goActions: function (sipId) { UIState.sipId = sipId || null; window.go('screen-cashflow-actions'); },
    goAnalytics: function () { window.go('screen-cashflow-analytics'); },

    switchScenario: function (scenarioId) {
      store.setFocusedScenario(scenarioId);
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
      window.showToast('Switched cash-flow demo scenario');
    },

    viewSip: function (sipId) { window.RecoveryUI.viewDetails(sipId); },

    runAction: function (type, sipId) {
      if (type === 'review_payment') { if (sipId) window.RecoveryUI.viewDetails(sipId); else window.go('screen-sips'); }
      else if (type === 'review_date') { if (sipId) window.SchedulingUI.viewMismatch(sipId); else window.SchedulingUI.goOverview(); }
      else if (type === 'review_pause') { if (sipId && window.PauseUI) window.PauseUI.manageSip(sipId); else if (window.PauseUI) window.PauseUI.goDashboard(); }
      else if (type === 'check_autopay') {
        if (sipId && window.MandateUI && store.mandateStore && store.mandateStore.getMandateHealth(sipId)) window.MandateUI.viewMandate(sipId);
        else if (window.MandateUI) { window.MandateUI.goDashboard(); if (sipId) window.showToast('AutoPay Health isn’t tracking this SIP in this demo.'); }
      }
      else if (type === 'update_profile') { window.CashFlowUI.goSetup(); }
    },

    toggleReminders: function (enabled) {
      store.setReminderOptIn(!!enabled);
      window.showToast(enabled ? 'Cash-flow reminders enabled' : 'Cash-flow reminders disabled');
    },

    advanceDemoClock: function (days) {
      store.advanceDemoClock(days);
      window.showToast('Demo date advanced by ' + days + ' days');
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
    },

    confirmResetDemo: function () {
      showDialog({
        title: 'Reset cash-flow demo data?',
        message: 'This clears your self-reported income, expenses and any what-if previews, and reseeds the original demo scenarios. Features 1-4’s own data is not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('Cash-flow demo data reset');
      });
    }
  };
})();
