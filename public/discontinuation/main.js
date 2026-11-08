/**
 * SIP Continuity Insights — controller wiring. Layers a seventh wrapper on
 * top of app.js's go()/goBack() (already wrapped by Features 1-6), so every
 * discontinuation screen renders itself on entry. Exposes DiscontinuationUI
 * for index.html's onclick handlers and discontinuation/screens.js's wired
 * buttons.
 */
(function () {
  'use strict';

  var Screens = window.DiscontinuationScreens;
  var store = Screens.store;
  var Analytics = window.DiscontinuationAnalytics;
  var RC = window.RecoveryComponents;

  store.ensureLoaded();

  var UIState = {
    journeyId: null,
    historyFocusSipId: null,
    insightsFilters: {},
    feedbackFilters: {}
  };

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-discontinuation-dashboard') Screens.renderDashboard();
    else if (id === 'screen-discontinuation-prompt') Screens.renderPrompt(UIState.journeyId);
    else if (id === 'screen-discontinuation-reason') Screens.renderReason(UIState.journeyId);
    else if (id === 'screen-discontinuation-followup') Screens.renderFollowup(UIState.journeyId);
    else if (id === 'screen-discontinuation-help') Screens.renderHelp(UIState.journeyId);
    else if (id === 'screen-discontinuation-help-preview') Screens.renderHelpPreview(UIState.journeyId);
    else if (id === 'screen-discontinuation-cancel') Screens.renderCancel(UIState.journeyId);
    else if (id === 'screen-discontinuation-exit') Screens.renderExit(UIState.journeyId);
    else if (id === 'screen-discontinuation-analytics') Screens.renderAnalytics();
    else if (id === 'screen-discontinuation-insights') Screens.renderInsights(UIState.insightsFilters);
    else if (id === 'screen-discontinuation-feedback-review') Screens.renderFeedbackReview(UIState.feedbackFilters);
    else if (id === 'screen-discontinuation-history') Screens.renderHistory(UIState.historyFocusSipId);
    else if (id === 'screen-discontinuation-privacy') Screens.renderPrivacy();
  }

  var _origGo = window.go;
  window.go = function (id, opts) {
    _origGo(id, opts);
    onNavigate(id);
  };

  function rerenderActive() {
    var active = document.querySelector('.screen.active');
    if (active) onNavigate(active.id);
  }

  function showDialog(opts, onConfirm) {
    var root = document.getElementById('recovery-dialog-root');
    root.innerHTML = RC.confirmDialog(opts);
    function close() { root.innerHTML = ''; }
    document.getElementById('recovery-dialog-cancel').onclick = close;
    document.getElementById('recovery-dialog-confirm').onclick = function () { close(); onConfirm(); };
  }

  function navigateToTool(sipId, toolId) {
    if (toolId === 'pause' && window.PauseUI) window.PauseUI.manageSip(sipId);
    else if (toolId === 'cashflow' && window.CashFlowUI) window.CashFlowUI.goOverview();
    else if (toolId === 'scheduling' && window.SchedulingUI) window.SchedulingUI.viewMismatch(sipId);
    else if (toolId === 'recovery' && window.RecoveryUI) window.RecoveryUI.viewDetails(sipId);
    else if (toolId === 'mandate' && window.MandateUI) window.MandateUI.goDashboard();
    else if (toolId === 'education' && window.EducationUI) window.EducationUI.goOverview();
    else if (toolId === 'support' && window.RecoveryUI) window.RecoveryUI.openSupport(null);
    else window.showToast('This tool isn’t available in the current demo build.');
  }

  window.DiscontinuationUI = {
    goDashboard: function () { window.go('screen-discontinuation-dashboard'); },
    switchScenario: function (scenarioId) {
      store.setFocusedScenario(scenarioId);
      var sc = store.getScenarios().find(function (s) { return s.id === scenarioId; });
      if (sc && sc.isAggregateView) { window.DiscontinuationUI.goAnalytics(); return; }
      if (sc) {
        var journey = store.getAllJourneys().find(function (j) { return j.demoScenarioId === scenarioId; });
        if (journey) { UIState.journeyId = journey.id; window.DiscontinuationUI.goHistory(journey.sipId); return; }
      }
      rerenderActive();
    },

    beginCancel: function (sipId) {
      var res = store.startJourney(sipId);
      if (!res.ok) {
        if (res.code === 'ALREADY_CANCELLED') window.showToast('This SIP has already been cancelled in this demo.');
        else window.showToast('Could not start a cancellation journey right now.');
        return;
      }
      UIState.journeyId = res.journey.id;
      window.go('screen-discontinuation-prompt');
      if (res.resumed) window.showToast('Resuming your in-progress cancellation journey for this SIP.');
    },

    goReason: function (journeyId) { UIState.journeyId = journeyId; window.go('screen-discontinuation-reason'); },

    skipFeedback: function (journeyId) {
      store.skipFeedback(journeyId);
      UIState.journeyId = journeyId;
      window.showToast('Feedback skipped');
      window.go('screen-discontinuation-help');
    },

    selectReason: function (journeyId, reasonId) {
      var res = store.selectReason(journeyId, reasonId);
      if (!res.ok) return;
      UIState.journeyId = journeyId;
      window.go('screen-discontinuation-followup');
    },

    submitFeedback: function (journeyId, freeText) {
      store.submitFeedback(journeyId, { freeText: freeText });
      UIState.journeyId = journeyId;
      window.go('screen-discontinuation-help');
    },

    goHelpPreview: function (journeyId) { UIState.journeyId = journeyId; window.go('screen-discontinuation-help-preview'); },

    openHelp: function (journeyId) {
      var journey = store.getJourney(journeyId);
      var res = store.openHelp(journeyId);
      if (!res.ok) { window.showToast('No specific tool is available for this reason.'); return; }
      navigateToTool(journey.sipId, res.toolId);
    },

    goCancel: function (journeyId) { UIState.journeyId = journeyId; window.go('screen-discontinuation-cancel'); },

    keepSip: function (journeyId) {
      var res = store.chooseToRetain(journeyId);
      if (!res.ok) { window.showToast('A cancellation request has already been submitted for this journey.'); return; }
      UIState.journeyId = journeyId;
      window.showToast('Your SIP will continue — thank you for letting us know.');
      window.go('screen-discontinuation-exit');
    },

    confirmSubmitCancellation: function (journeyId) {
      var journey = store.getJourney(journeyId);
      var sip = journey ? Screens.store.getAllSips().find(function (s) { return s.id === journey.sipId; }) : null;
      showDialog({
        title: 'Confirm cancellation request?',
        message: 'This is a simulated cancellation request for ' + (sip ? sip.fundName : 'this SIP') + '. No real brokerage or banking operation will occur. The provider may take time to confirm.',
        confirmLabel: 'Confirm Cancellation', cancelLabel: 'Go Back'
      }, function () {
        var res = store.submitCancellationRequest(journeyId);
        if (!res.ok) {
          if (res.code === 'ALREADY_CANCELLED') window.showToast('This SIP has already been cancelled.');
          else window.showToast('Could not submit the cancellation request right now.');
          return;
        }
        UIState.journeyId = journeyId;
        window.showToast(res.duplicate ? 'A cancellation request for this journey already exists.' : 'Cancellation request submitted');
        window.go('screen-discontinuation-exit');
      });
    },

    checkStatus: function (requestId) {
      var res = store.checkCancellationStatus(requestId);
      if (res.ok) rerenderActive();
    },

    goAnalytics: function () { window.go('screen-discontinuation-analytics'); },

    goInsights: function () { UIState.insightsFilters = {}; window.go('screen-discontinuation-insights'); },
    applyInsightsFilters: function (filters) { UIState.insightsFilters = filters || {}; Screens.renderInsights(UIState.insightsFilters); },

    goFeedbackReview: function () { UIState.feedbackFilters = {}; window.go('screen-discontinuation-feedback-review'); },
    applyFeedbackFilters: function (filters) { UIState.feedbackFilters = filters || {}; rerenderActive(); },

    toggleReviewed: function (feedbackId) {
      var rec = store.getFeedbackRecords({}).find(function (r) { return r.id === feedbackId; });
      store.markFeedbackReviewed(feedbackId, rec ? !rec.reviewed : true);
      rerenderActive();
    },
    assignTheme: function (feedbackId, theme) {
      if (!theme) return;
      store.assignTheme(feedbackId, theme);
      rerenderActive();
    },
    confirmDeleteFeedback: function (feedbackId) {
      showDialog({
        title: 'Delete this feedback?',
        message: 'This permanently removes the written feedback text. It never changes payment, SIP or cancellation records.',
        confirmLabel: 'Delete Feedback', cancelLabel: 'Keep It'
      }, function () {
        store.deleteFeedback(feedbackId);
        window.showToast('Feedback deleted');
        rerenderActive();
      });
    },
    confirmClearAllFeedback: function () {
      showDialog({
        title: 'Clear all optional feedback?',
        message: 'This deletes all written feedback you have submitted in this demo. Your SIP, payment and cancellation history are not affected.',
        confirmLabel: 'Clear All Feedback', cancelLabel: 'Keep It'
      }, function () {
        store.clearAllOptionalFeedback();
        window.showToast('All optional feedback cleared');
        rerenderActive();
      });
    },
    exportCsv: function (filters) {
      var csv = store.exportFeedbackCSV(filters);
      try {
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'sip-continuity-feedback.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        window.showToast('Sanitized feedback exported');
      } catch (e) { window.showToast('Export is not supported in this browser.'); }
    },

    goHistory: function (sipId) { UIState.historyFocusSipId = sipId || null; window.go('screen-discontinuation-history'); },

    goPrivacy: function () { window.go('screen-discontinuation-privacy'); },
    togglePrompts: function (enabled) {
      store.setNonessentialPromptsEnabled(enabled);
      window.showToast(enabled ? 'Research prompts enabled' : 'Research prompts disabled');
    },

    advanceDemoClock: function (days) {
      store.advanceDemoClock(days);
      window.showToast('Demo date advanced by ' + days + ' days');
      rerenderActive();
    },

    confirmResetDemo: function () {
      showDialog({
        title: 'Reset SIP Continuity Insights demo data?',
        message: 'This clears all cancellation journeys, cancellation requests and feedback records, and reseeds the original sixteen demo scenarios. Features 1–6’s own data is not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        UIState.journeyId = null;
        rerenderActive();
        window.showToast('SIP Continuity Insights demo data reset');
      });
    }
  };

  void Analytics;
})();
