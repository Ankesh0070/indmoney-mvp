/**
 * My First-Year SIP Journey — DOM rendering for every education screen.
 * Browser-only. Pure markup from EducationComponents; all calculation from
 * EducationEngine via EducationStore, which only ever reads Feature 1's
 * RecoveryStore through its existing public getters and never mutates it.
 */
(function () {
  'use strict';

  var Data = window.EducationData;
  var C = window.EducationComponents;
  var Analytics = window.EducationAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var store = new window.EducationStore({ recoveryStore: recoveryStore });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  var UIState = { selectedMonth: null };

  // ───────────────────────── Entry slot + prompt (inside screen-sips) ─────────────────────────
  function renderEntrySlot() {
    var slot = $('edu-sips-slot');
    if (!slot) return;
    var summary = store.getOverviewSummary();
    store.refreshNotifications();
    var prompt = store.getPendingPrompt();
    var promptHtml = prompt ? C.promptBanner(prompt) : '';
    slot.innerHTML =
      promptHtml +
      '<div class="section-header"><h3>Understand Your Investment Journey</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">A beginner-friendly, simulated walkthrough of what your first year of SIP investing can look like — educational only, never investment advice.</div>' +
      '<div class="card">' +
        (summary ? (
          '<div class="row-between"><span class="small muted">SIP start date</span><span class="small bold">' + C.dateLabel(summary.startDateKey) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Successful instalments shown</span><span class="small bold">' + summary.successfulCount + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Total invested (simulated)</span><span class="small bold">' + C.inr(summary.totalInvestedPaise) + '</span></div>'
        ) : '<div class="tiny muted">No SIP available to illustrate yet.</div>') +
        '<button class="btn btn-primary mt-16" id="edu-entry-open">Explore My SIP Journey</button>' +
      '</div>';
    var open = $('edu-entry-open'); if (open) open.onclick = function () { window.EducationUI.goOverview(); };
    qsa(slot, '[data-action="edu-dismiss-prompt"]').forEach(function (btn) {
      btn.onclick = function () { store.dismissPrompt(btn.getAttribute('data-prompt')); renderEntrySlot(); };
    });
    qsa(slot, '[data-action="edu-learn-more"]').forEach(function (btn) {
      btn.onclick = function () { window.EducationUI.goOverview(); };
    });
  }

  // ───────────────────────── Screen 1: Journey Overview ─────────────────────────
  function renderOverview() {
    var body = $('edu-overview-body');
    if (!body) return;
    store.emit(Analytics.Events.EDUCATION_OPENED, {});
    var summary = store.getOverviewSummary();
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();
    var progress = store.getProgress();

    body.innerHTML =
      C.disclaimer('Demo prototype — all figures are simulated estimates for education, not your verified investment performance. This is not the official INDmoney app.') +
      C.scenarioPillRow(scenarios, focusedId) +
      (summary ? (
        '<div class="card-glass mt-16">' +
          '<div class="tiny muted">SIP</div><div class="small bold">' + C.esc(summary.sip.fundName) + '</div>' +
          '<div class="row-between mt-12"><span class="small muted">Start date</span><span class="small bold">' + C.dateLabel(summary.startDateKey) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Months since first instalment</span><span class="small bold">' + summary.monthsSinceFirst + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Successful instalments (illustrated)</span><span class="small bold">' + summary.successfulCount + '</span></div>' +
        '</div>' +
        '<div class="card mt-12">' +
          '<div class="row-between"><span class="small muted">Total invested</span><span class="small bold">' + C.inr(summary.totalInvestedPaise) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Simulated current value</span><span class="small bold">' + C.inr(summary.currentValuePaise) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Unrealized gain/loss</span><span class="small bold ' + (summary.gainLossPaise > 0 ? 'edu-amount-pos' : summary.gainLossPaise < 0 ? 'edu-amount-neg' : '') + '">' + C.inrSigned(summary.gainLossPaise) + '</span></div>' +
        '</div>' +
        '<div class="card mt-12"><div class="tiny muted">Educational progress</div><div class="small bold mt-4">' + progress.modulesCompleted + '/' + progress.modulesTotal + ' modules · ' + progress.cardsCompleted + '/' + progress.cardsTotal + ' cards · quiz ' + (progress.quizCompleted ? 'complete' : 'not started') + '</div></div>' +
        (!summary.hasAnyContribution ? '<div class="card mt-12"><div class="tiny muted">No successful contributions illustrated yet for this scenario — try switching to a different demo scenario above.</div></div>' : '')
      ) : '<div class="card mt-16"><div class="tiny muted">No SIP available to illustrate.</div></div>') +
      '<button class="btn btn-primary mt-16" data-action="edu-go-timeline">Explore My SIP Journey</button>' +
      '<div class="edu-nav-grid mt-16">' +
        '<button class="edu-nav-tile" data-action="edu-go-value">📊 Invested vs Value</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-navlesson">📘 How SIPs Work</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-scenarios">📉 Market Scenarios</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-expectations">💬 First-Year FAQs</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-metrics">📈 Return Metrics</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-quiz">❓ Learning Quiz</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-progress">🎓 My Progress</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-notifications">🔔 Reminders</button>' +
        '<button class="edu-nav-tile" data-action="edu-go-analytics">📊 Analytics</button>' +
      '</div>' +
      '<button class="edu-reset-btn mt-16" data-action="edu-reset-demo">↺ Reset Demo Data</button>';

    bindNav(body);
    qsa(body, '[data-action="edu-focus-scenario"]').forEach(function (btn) {
      btn.onclick = function () { store.setFocusedScenario(btn.getAttribute('data-scenario')); window.showToast('Switched education demo scenario'); renderOverview(); };
    });
    var resetBtn = body.querySelector('[data-action="edu-reset-demo"]');
    if (resetBtn) resetBtn.onclick = function () { window.EducationUI.confirmResetDemo(); };
  }

  function bindNav(body) {
    var map = {
      'edu-go-timeline': function () { window.EducationUI.goTimeline(); },
      'edu-go-value': function () { window.EducationUI.goValue(); },
      'edu-go-navlesson': function () { window.EducationUI.goNavLesson(); },
      'edu-go-scenarios': function () { window.EducationUI.goScenarios(); },
      'edu-go-expectations': function () { window.EducationUI.goExpectations(); },
      'edu-go-metrics': function () { window.EducationUI.goMetrics(); },
      'edu-go-quiz': function () { window.EducationUI.goQuiz(); },
      'edu-go-progress': function () { window.EducationUI.goProgress(); },
      'edu-go-notifications': function () { window.EducationUI.goNotifications(); },
      'edu-go-analytics': function () { window.EducationUI.goAnalytics(); }
    };
    Object.keys(map).forEach(function (action) {
      qsa(body, '[data-action="' + action + '"]').forEach(function (btn) { btn.onclick = map[action]; });
    });
  }

  // ───────────────────────── Screen 2: Timeline ─────────────────────────
  function renderTimeline() {
    var body = $('edu-timeline-body');
    if (!body) return;
    store.emit(Analytics.Events.JOURNEY_TIMELINE_VIEWED, {});
    var j = store.buildJourney();
    if (!j || !j.allMonths.length) {
      body.innerHTML = C.disclaimer('No months to illustrate for this scenario yet.') + '<div class="card mt-12"><div class="tiny muted">Try switching to a different demo scenario from the Overview screen.</div></div>';
      return;
    }
    if (UIState.selectedMonth == null || !j.allMonths.some(function (m) { return m.monthIndex === UIState.selectedMonth; })) {
      UIState.selectedMonth = j.historicalMonths.length ? j.historicalMonths[j.historicalMonths.length - 1].monthIndex : j.allMonths[0].monthIndex;
    }
    var selected = j.allMonths.find(function (m) { return m.monthIndex === UIState.selectedMonth; });
    body.innerHTML =
      C.disclaimer('Simulated first-year journey. Historical months are illustrative; future months are hypothetical projections, never guarantees.') +
      '<div class="edu-month-grid">' + j.allMonths.map(function (m) { return C.monthCard(m, m.monthIndex === UIState.selectedMonth); }).join('') + '</div>' +
      '<div class="mt-16">' + C.monthDetail(selected) + '</div>';
    qsa(body, '[data-action="edu-select-month"]').forEach(function (btn) {
      btn.onclick = function () { UIState.selectedMonth = Number(btn.getAttribute('data-month')); renderTimeline(); };
    });
  }

  // ───────────────────────── Screen 3: Invested vs Current Value ─────────────────────────
  function renderValue() {
    var body = $('edu-value-body');
    if (!body) return;
    store.emit(Analytics.Events.VALUE_EXPLAINER_VIEWED, {});
    var cmp = store.getValueComparison();
    body.innerHTML =
      C.disclaimer('Your investment value can be higher or lower than the total amount invested. No simulated redemptions are modelled here, so the difference shown is a simple invested-vs-value comparison.') +
      (cmp.hasData ?
        '<div class="card">' + C.valueChartSvg(cmp.cumulative) + '</div>' +
        '<div class="card mt-12">' + C.valueDataTable(cmp.cumulative) + '</div>'
        : '<div class="card mt-12"><div class="tiny muted">No successful contributions illustrated yet for this scenario.</div></div>');
  }

  // ───────────────────────── Screen 4: How SIP Investing Works ─────────────────────────
  var NAV_EXAMPLE_STEPS = [
    { month: 1, navPaise: 2000, contributionPaise: 200000 },
    { month: 2, navPaise: 2500, contributionPaise: 200000 },
    { month: 3, navPaise: 1600, contributionPaise: 200000 }
  ];
  var NavState = { navPaise: 2000 };
  function renderNavLesson() {
    var body = $('edu-navlesson-body');
    if (!body) return;
    var totalInvested = NAV_EXAMPLE_STEPS.reduce(function (s, x) { return s + x.contributionPaise; }, 0);
    var totalUnits = NAV_EXAMPLE_STEPS.reduce(function (s, x) { return s + (x.contributionPaise / x.navPaise); }, 0);
    var rows = NAV_EXAMPLE_STEPS.map(function (x) {
      return '<tr><td>Month ' + x.month + '</td><td>' + C.inr(x.contributionPaise) + '</td><td>₹' + (x.navPaise / 100).toFixed(2) + '</td><td>' + (x.contributionPaise / x.navPaise).toFixed(2) + '</td></tr>';
    }).join('');
    body.innerHTML =
      C.disclaimer('A SIP is a recurring investment: each month’s fixed contribution buys mutual fund units at that month’s NAV. This example ignores fees, taxes and rounding purely for simplicity.') +
      '<div class="card"><table class="edu-table"><thead><tr><th>Month</th><th>Investment</th><th>NAV</th><th>Units</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="row-between mt-12"><span class="small muted">Total Invested</span><span class="small bold">' + C.inr(totalInvested) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Total Units</span><span class="small bold">' + totalUnits.toFixed(2) + '</span></div>' +
      '</div>' +
      '<div class="section-header mt-16"><h3>Try it yourself</h3></div>' +
      '<div class="tiny muted mb-8">Move the NAV slider — the fixed ₹2,000 contribution stays the same, but the units purchased change.</div>' +
      '<input type="range" min="500" max="5000" step="50" value="' + NavState.navPaise + '" id="edu-nav-slider" class="edu-slider" />' +
      '<div id="edu-nav-example">' + C.navSelectorExample(200000, NavState.navPaise) + '</div>' +
      '<button class="btn btn-primary mt-16" data-action="edu-nav-complete">Mark This Lesson Complete</button>';
    var slider = $('edu-nav-slider');
    if (slider) slider.oninput = function () { NavState.navPaise = Number(slider.value); $('edu-nav-example').innerHTML = C.navSelectorExample(200000, NavState.navPaise); };
    var completeBtn = body.querySelector('[data-action="edu-nav-complete"]');
    if (completeBtn) completeBtn.onclick = function () { store.markModuleComplete(Data.ModuleId.NAV_LESSON); store.emit(Analytics.Events.NAV_MODULE_COMPLETED, {}); window.showToast('Lesson marked complete'); renderNavLesson(); };
  }

  // ───────────────────────── Screen 5: Market Fluctuation Scenarios ─────────────────────────
  var MARKET_SCENARIOS = [
    { id: 'rising', label: 'A. Market value increases', type: 'rising', blurb: 'A rising market: existing units gain value over time.' },
    { id: 'falling', label: 'B. Market value decreases', type: 'falling', blurb: 'A falling market: existing units lose value over time.' },
    { id: 'flat', label: 'C. Market stays broadly flat', type: 'flat', blurb: 'A flat market: value hovers close to the amount invested.' },
    { id: 'volatile', label: 'D. Significant volatility', type: 'volatile', blurb: 'A volatile market: large swings up and down.' },
    { id: 'decline_no_recovery', label: 'E. Decline without recovery (illustrated period)', type: 'decline_no_recovery', blurb: 'A sustained decline that does not recover within this illustrated period. Future recovery is never guaranteed.' }
  ];
  var ScenarioState = { selected: 'rising' };
  function renderScenarios() {
    var body = $('edu-scenarios-body');
    if (!body) return;
    store.emit(Analytics.Events.MARKET_SCENARIO_VIEWED, { type: ScenarioState.selected });
    var Engine = window.EducationEngine;
    var monthsCount = 12;
    var nav = Engine.generateNavSeries('market-explorer', ScenarioState.selected, monthsCount);
    var amountPaise = 200000;
    var months = Engine.buildMonthlyJourney({ startKey: window.SchedulingDateUtils.addMonths(window.SchedulingDateUtils.todayKey(), -monthsCount), monthsToShow: monthsCount, amountPaise: amountPaise, navSeries: nav, realInstalment: null, injectedMissedMonths: [], injectedPausedMonths: [], futureMonths: 0 });
    var cumulative = months.map(function (m) { return { monthIndex: m.monthIndex, dateKey: m.dateKey, investedPaise: m.cumulativeInvestedPaise, valuePaise: m.portfolioValuePaise, gainLossPaise: m.gainLossPaise }; });
    var active = MARKET_SCENARIOS.find(function (s) { return s.id === ScenarioState.selected; });
    body.innerHTML =
      C.disclaimer('Past performance and hypothetical scenarios do not predict future returns. Continuing a SIP never guarantees recovery or higher returns.') +
      '<div class="edu-pill-row">' + MARKET_SCENARIOS.map(function (s) {
        return '<button class="edu-pill' + (s.id === ScenarioState.selected ? ' edu-pill-active' : '') + '" data-action="edu-select-market" data-market="' + s.id + '">' + s.label.split('.')[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="card mt-12"><div class="small bold">' + C.esc(active.label) + '</div><div class="tiny muted mt-4">' + C.esc(active.blurb) + '</div></div>' +
      '<div class="card mt-12">' + C.valueChartSvg(cumulative) + '</div>' +
      '<button class="btn btn-primary mt-16" data-action="edu-market-complete">Mark This Lesson Complete</button>';
    qsa(body, '[data-action="edu-select-market"]').forEach(function (btn) {
      btn.onclick = function () { ScenarioState.selected = btn.getAttribute('data-market'); renderScenarios(); };
    });
    var completeBtn = body.querySelector('[data-action="edu-market-complete"]');
    if (completeBtn) completeBtn.onclick = function () { store.markModuleComplete(Data.ModuleId.MARKET_SCENARIOS); window.showToast('Lesson marked complete'); renderScenarios(); };
  }

  // ───────────────────────── Screen 6: First-Year Expectations Explainer ─────────────────────────
  function renderExpectations() {
    var body = $('edu-expectations-body');
    if (!body) return;
    body.innerHTML = Data.EXPECTATION_CARDS.map(function (card) {
      return C.lessonCard(card, store.isCardComplete(card.id));
    }).join('');
    qsa(body, '[data-action="edu-card-done"]').forEach(function (btn) {
      btn.onclick = function () { store.markCardComplete(btn.getAttribute('data-card')); renderExpectations(); };
    });
  }

  // ───────────────────────── Screen 7: Return Metrics Explainer ─────────────────────────
  function renderMetrics() {
    var body = $('edu-metrics-body');
    if (!body) return;
    store.emit(Analytics.Events.RETURNS_EXPLAINER_VIEWED, {});
    var m = store.getReturnMetrics();
    body.innerHTML =
      C.disclaimer('A single estimated return figure is never a guaranteed future outcome.') +
      (m.hasData ? (
        '<div class="card">' +
          '<div class="row-between"><span class="small muted">Absolute gain/loss</span><span class="small bold ' + (m.gainLossPaise > 0 ? 'edu-amount-pos' : m.gainLossPaise < 0 ? 'edu-amount-neg' : '') + '">' + C.inrSigned(m.gainLossPaise) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Absolute return</span><span class="small bold">' + C.pct(m.absoluteReturnPct) + '</span></div>' +
          '<div class="row-between mt-8"><span class="small muted">Estimated annualized return (XIRR)</span><span class="small bold">' + (m.xirr != null ? C.pct(m.xirr * 100) : '—') + '</span></div>' +
          (m.xirrUnavailableReason ? '<div class="tiny muted mt-8">' + C.esc(m.xirrUnavailableReason) + '</div>' : '') +
        '</div>' +
        '<div class="card mt-12"><div class="tiny muted">Absolute return simply compares gain/loss to amount invested. XIRR accounts for the timing of each contribution, which is why the two numbers can differ — and why XIRR can be unstable over short periods with few contributions.</div></div>'
      ) : '<div class="card mt-12"><div class="tiny muted">Not enough data to compute return metrics for this scenario yet.</div></div>') +
      '<button class="btn btn-primary mt-16" data-action="edu-metrics-complete">Mark This Lesson Complete</button>';
    var completeBtn = body.querySelector('[data-action="edu-metrics-complete"]');
    if (completeBtn) completeBtn.onclick = function () { store.markModuleComplete(Data.ModuleId.RETURN_METRICS); window.showToast('Lesson marked complete'); renderMetrics(); };
  }

  // ───────────────────────── Screen 8: Learning Quiz ─────────────────────────
  function renderQuiz() {
    var body = $('edu-quiz-body');
    if (!body) return;
    var quiz = store.getQuizState();
    if (quiz.answeredCount === 0) store.emit(Analytics.Events.QUIZ_STARTED, {});
    body.innerHTML =
      '<div class="tiny muted mb-12">' + quiz.answeredCount + ' of ' + quiz.total + ' answered' + (quiz.completed ? ' · quiz complete' : '') + '</div>' +
      Data.QUIZ_QUESTIONS.map(function (q, i) { return C.quizQuestionCard(q, quiz.answered[q.id], i + 1, Data.QUIZ_QUESTIONS.length); }).join('') +
      '<button class="edu-reset-btn mt-16" data-action="edu-quiz-retry">Retry Quiz</button>';
    qsa(body, '[data-action="edu-quiz-answer"]').forEach(function (btn) {
      btn.onclick = function () {
        var res = store.submitQuizAnswer(btn.getAttribute('data-question'), btn.getAttribute('data-option'));
        if (res) window.showToast(res.correct ? 'Correct!' : 'Not quite — see the explanation below.');
        renderQuiz();
      };
    });
    var retryBtn = body.querySelector('[data-action="edu-quiz-retry"]');
    if (retryBtn) retryBtn.onclick = function () { store.resetQuiz(); renderQuiz(); };
  }

  // ───────────────────────── Screen 10: Personal Learning Progress ─────────────────────────
  function renderProgress() {
    var body = $('edu-progress-body');
    if (!body) return;
    var progress = store.getProgress();
    var quiz = store.getQuizState();
    body.innerHTML =
      '<div class="edu-progress-grid">' +
        C.progressTile('Modules completed', progress.modulesCompleted + '/' + progress.modulesTotal) +
        C.progressTile('Topic cards reviewed', progress.cardsCompleted + '/' + progress.cardsTotal) +
        C.progressTile('Quiz', quiz.completed ? 'Complete (' + quiz.correctCount + '/' + quiz.total + ' correct)' : quiz.answeredCount + '/' + quiz.total + ' answered') +
      '</div>' +
      '<div class="tiny muted mt-12">Educational engagement reflects how much of this module you’ve explored — it is not a measure of your financial readiness or preparedness.</div>' +
      '<button class="btn btn-primary mt-16" data-action="edu-continue-learning">Continue Learning</button>' +
      '<button class="btn btn-outline mt-12" data-action="edu-review-topics">Review Completed Topics</button>' +
      '<button class="btn btn-outline mt-12" data-action="edu-restart-quiz">Restart Quiz</button>';
    var cont = body.querySelector('[data-action="edu-continue-learning"]'); if (cont) cont.onclick = function () { window.EducationUI.goOverview(); };
    var review = body.querySelector('[data-action="edu-review-topics"]'); if (review) review.onclick = function () { window.EducationUI.goExpectations(); };
    var restart = body.querySelector('[data-action="edu-restart-quiz"]'); if (restart) restart.onclick = function () { store.resetQuiz(); window.EducationUI.goQuiz(); };
  }

  // ───────────────────────── Screen 11: Educational Notifications ─────────────────────────
  function renderNotifications() {
    var body = $('edu-notifications-body');
    if (!body) return;
    store.refreshNotifications();
    var list = store.getNotifications();
    var toggle = $('edu-notif-toggle');
    if (toggle) toggle.checked = store.getNotificationsOptIn();
    body.innerHTML = list.length ? list.map(C.notificationItem).join('') : '<div class="tiny muted">No educational notifications yet.</div>';
    if (toggle) toggle.onchange = function () { store.setNotificationsOptIn(toggle.checked); window.showToast(toggle.checked ? 'Educational notifications enabled' : 'Educational notifications disabled'); };
  }

  // ───────────────────────── Screen 12: Education Analytics ─────────────────────────
  function renderAnalytics() {
    var body = $('edu-analytics-body');
    if (!body) return;
    var m = Analytics.computeMetrics(store, recoveryStore);
    body.innerHTML =
      C.disclaimer(m.note) +
      '<div class="edu-progress-grid">' +
        C.progressTile('Education opened', m.adoption.educationOpened) +
        C.progressTile('Journey timeline views', m.journeyTimelineViews) +
        C.progressTile('Module completion rate', m.moduleCompletionRatePct.toFixed(1) + '%') +
        C.progressTile('Card completion rate', m.cardCompletionRatePct.toFixed(1) + '%') +
        C.progressTile('Quiz starts', m.quizStarts) +
        C.progressTile('Quiz completion rate', m.quizCompletionRatePct.toFixed(1) + '%') +
        C.progressTile('Quiz correct rate', m.quizCorrectRatePct != null ? m.quizCorrectRatePct.toFixed(1) + '%' : '—') +
        C.progressTile('Prompt dismissals', m.promptDismissals) +
        C.progressTile('Month-12 active SIP rate', m.month12ActiveSipRatePct != null ? m.month12ActiveSipRatePct.toFixed(1) + '%' : '—') +
      '</div>' +
      '<div class="tiny muted mt-12">Correlation between education engagement and retention is not interpreted here as causal proof.</div>';
  }

  window.EducationScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot,
    renderOverview: renderOverview,
    renderTimeline: renderTimeline,
    renderValue: renderValue,
    renderNavLesson: renderNavLesson,
    renderScenarios: renderScenarios,
    renderExpectations: renderExpectations,
    renderMetrics: renderMetrics,
    renderQuiz: renderQuiz,
    renderProgress: renderProgress,
    renderNotifications: renderNotifications,
    renderAnalytics: renderAnalytics
  };
})();
