/**
 * My First-Year SIP Journey — controller wiring. Layers a sixth wrapper on
 * top of app.js's go()/goBack() (already wrapped by Features 1-5), so every
 * education screen renders itself on entry.
 */
(function () {
  'use strict';

  var Screens = window.EducationScreens;
  var store = Screens.store;

  store.ensureLoaded();

  function onNavigate(id) {
    if (id === 'screen-sips') Screens.renderEntrySlot();
    else if (id === 'screen-education-overview') Screens.renderOverview();
    else if (id === 'screen-education-timeline') Screens.renderTimeline();
    else if (id === 'screen-education-value') Screens.renderValue();
    else if (id === 'screen-education-navlesson') Screens.renderNavLesson();
    else if (id === 'screen-education-scenarios') Screens.renderScenarios();
    else if (id === 'screen-education-expectations') Screens.renderExpectations();
    else if (id === 'screen-education-metrics') Screens.renderMetrics();
    else if (id === 'screen-education-quiz') Screens.renderQuiz();
    else if (id === 'screen-education-progress') Screens.renderProgress();
    else if (id === 'screen-education-notifications') Screens.renderNotifications();
    else if (id === 'screen-education-analytics') Screens.renderAnalytics();
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

  window.EducationUI = {
    goOverview: function () { window.go('screen-education-overview'); },
    goTimeline: function () { window.go('screen-education-timeline'); },
    goValue: function () { window.go('screen-education-value'); },
    goNavLesson: function () { window.go('screen-education-navlesson'); },
    goScenarios: function () { window.go('screen-education-scenarios'); },
    goExpectations: function () { window.go('screen-education-expectations'); },
    goMetrics: function () { window.go('screen-education-metrics'); },
    goQuiz: function () { window.go('screen-education-quiz'); },
    goProgress: function () { window.go('screen-education-progress'); },
    goNotifications: function () { window.go('screen-education-notifications'); },
    goAnalytics: function () { window.go('screen-education-analytics'); },

    advanceDemoClock: function (days) {
      store.advanceDemoClock(days);
      window.showToast('Demo date advanced by ' + days + ' days');
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
    },

    confirmResetDemo: function () {
      showDialog({
        title: 'Reset learning demo data?',
        message: 'This clears your lesson, quiz and notification progress and reseeds the default demo scenario. Features 1-5’s own data is not affected.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('Learning demo data reset');
      });
    }
  };
})();
