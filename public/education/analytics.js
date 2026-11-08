/**
 * My First-Year SIP Journey — analytics event names and simulated dashboard
 * metrics (Screen 12). All metrics are demo-labeled and computed from this
 * session's own data only; nothing here is a real production measurement.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.EducationAnalytics = factory();
})(this, function () {
  'use strict';

  var Events = {
    EDUCATION_OPENED: 'sip_education_opened',
    JOURNEY_TIMELINE_VIEWED: 'sip_journey_timeline_viewed',
    VALUE_EXPLAINER_VIEWED: 'investment_value_explainer_viewed',
    NAV_MODULE_COMPLETED: 'nav_module_completed',
    MARKET_SCENARIO_VIEWED: 'market_scenario_viewed',
    RETURNS_EXPLAINER_VIEWED: 'returns_explainer_viewed',
    QUIZ_STARTED: 'education_quiz_started',
    QUIZ_COMPLETED: 'education_quiz_completed',
    MODULE_COMPLETED: 'education_module_completed',
    PROMPT_DISMISSED: 'education_prompt_dismissed'
  };

  function track(store, name, props) { store.emit(name, props || {}); }

  function countEvents(events, name) { return events.filter(function (e) { return e.name === name; }).length; }

  function computeMetrics(store, recoveryStore) {
    var events = store.getAnalyticsEvents();
    var progress = store.getProgress();
    var quiz = store.getQuizState();
    var opened = countEvents(events, Events.EDUCATION_OPENED);
    var timelineViews = countEvents(events, Events.JOURNEY_TIMELINE_VIEWED);
    var quizStarts = countEvents(events, Events.QUIZ_STARTED);
    var promptDismissals = countEvents(events, Events.PROMPT_DISMISSED);

    var moduleCompletionRate = progress.modulesTotal > 0 ? (progress.modulesCompleted / progress.modulesTotal) * 100 : 0;
    var cardCompletionRate = progress.cardsTotal > 0 ? (progress.cardsCompleted / progress.cardsTotal) * 100 : 0;
    var quizCompletionRate = quiz.total > 0 ? (quiz.answeredCount / quiz.total) * 100 : 0;

    var month12ActiveRate = null;
    if (recoveryStore) {
      var all = recoveryStore.getAllInstalmentsWithSip();
      var totalSips = recoveryStore.getAllSips().length;
      if (totalSips > 0) {
        var activeSipIds = {};
        all.forEach(function (row) {
          if ((row.instalment.status === 'success' || row.instalment.status === 'recovered')) activeSipIds[row.sip.id] = true;
        });
        month12ActiveRate = (Object.keys(activeSipIds).length / totalSips) * 100;
      }
    }

    return {
      demo: true, asOf: new Date().toISOString(),
      adoption: { educationOpened: opened },
      journeyTimelineViews: timelineViews,
      moduleCompletionRatePct: moduleCompletionRate,
      cardCompletionRatePct: cardCompletionRate,
      quizStarts: quizStarts,
      quizCompletionRatePct: quizCompletionRate,
      quizCorrectRatePct: quiz.answeredCount > 0 ? (quiz.correctCount / quiz.answeredCount) * 100 : null,
      promptDismissals: promptDismissals,
      month12ActiveSipRatePct: month12ActiveRate,
      note: 'DEMO DATA — all figures are computed from this prototype session only. They do not measure or prove real-world retention impact; education engagement and retention are reported separately and are not implied to be causally linked.'
    };
  }

  return { Events: Events, track: track, computeMetrics: computeMetrics };
});
