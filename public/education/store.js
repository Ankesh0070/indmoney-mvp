/**
 * My First-Year SIP Journey — persisted store. Reads the focus SIP's real
 * fund name, amount, start date and one real Feature 1 instalment record
 * purely through RecoveryStore's existing public getters — this file never
 * mutates Feature 1-5 state. Everything this feature itself persists (module
 * and card progress, quiz attempts, dismissed prompts, notifications) lives
 * in its own storage key, entirely separate from every other feature.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./engine.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.EducationData, window.EducationEngine, window.SchedulingDateUtils);
    window.EducationStore = out.EducationStore;
  }
})(this, function (Data, Engine, DateUtils) {
  'use strict';

  var Status = Data.JourneyMonthStatus;
  var PromptType = Data.PromptType;
  var NotificationType = Data.NotificationType;
  var STORAGE_KEY = 'indmoney_education_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }

  function defaultState() {
    return {
      version: 1,
      demoClockOffsetDays: 0,
      initialized: false,
      focusedScenarioId: 'edu-a',
      progress: { modules: {}, cards: {} },
      quizAttempts: [],
      promptsDismissed: {},
      notifications: [],
      analyticsEvents: [],
      settings: { notificationsOptIn: true }
    };
  }

  function EducationStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.state = null;
  }

  EducationStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) { try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); } }
    else { this.state = defaultState(); }
    if (!this.state.initialized) { this.state.initialized = true; }
    this.save();
    return this.state;
  };
  EducationStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };
  EducationStore.prototype.ensureLoaded = function () { if (!this.state) this.load(); return this.state; };
  EducationStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };
  EducationStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
  };
  EducationStore.prototype.getAnalyticsEvents = function () { return this.ensureLoaded().analyticsEvents; };

  EducationStore.prototype.getDemoToday = function () {
    var state = this.ensureLoaded();
    return DateUtils.addDays(DateUtils.todayKey(), state.demoClockOffsetDays || 0);
  };
  EducationStore.prototype.advanceDemoClock = function (days) {
    var state = this.ensureLoaded();
    state.demoClockOffsetDays = (state.demoClockOffsetDays || 0) + days;
    this.save();
    return this.getDemoToday();
  };

  // ───────────────────────── scenario selection ─────────────────────────

  EducationStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  EducationStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  EducationStore.prototype.getFocusedScenario = function () {
    var id = this.getFocusedScenarioId();
    return this.getScenarios().find(function (s) { return s.id === id; }) || this.getScenarios()[0];
  };
  EducationStore.prototype.setFocusedScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    state.focusedScenarioId = scenarioId;
    var sc = this.getScenarios().find(function (s) { return s.id === scenarioId; });
    if (sc && sc.autoCompleteAll) {
      var Mod = Data.ModuleId;
      [Mod.NAV_LESSON, Mod.MARKET_SCENARIOS, Mod.RETURN_METRICS, Mod.QUIZ].forEach(function (m) { state.progress.modules[m] = true; });
      Data.EXPECTATION_CARDS.forEach(function (c) { state.progress.cards[c.id] = true; });
      state.quizAttempts = Data.QUIZ_QUESTIONS.map(function (q) {
        return { id: Data.uid('qa'), questionId: q.id, selected: q.correct, correct: true, at: new Date().toISOString() };
      });
    }
    if (sc && sc.ensurePromptPending) {
      Object.keys(state.promptsDismissed).forEach(function (k) { delete state.promptsDismissed[k]; });
    }
    this.save();
  };

  // ───────────────────────── focus SIP + real instalment ─────────────────────────

  EducationStore.prototype.getFocusSip = function () {
    if (!this.recoveryStore) return null;
    var sc = this.getFocusedScenario();
    return this.recoveryStore.getSip(sc.focusSipId);
  };

  EducationStore.prototype.getRealInstalmentForFocusSip = function () {
    if (!this.recoveryStore) return null;
    var sc = this.getFocusedScenario();
    var all = this.recoveryStore.getInstalmentsForSip(sc.focusSipId);
    return all.length ? all[0] : null;
  };

  function monthsBetween(startKey, endKey) {
    var a = DateUtils.parseKey(startKey), b = DateUtils.parseKey(endKey);
    var months = (b.year - a.year) * 12 + (b.month0 - a.month0);
    if (b.day < a.day) months -= 1;
    return Math.max(0, months);
  }

  function mapInstalmentStatus(realStatus) {
    if (realStatus === 'success' || realStatus === 'recovered') return Status.SUCCESSFUL;
    if (realStatus === 'pending') return Status.PENDING;
    return Status.MISSED; // failed, cancelled
  }

  // ───────────────────────── journey construction ─────────────────────────

  EducationStore.prototype.buildJourney = function () {
    var sc = this.getFocusedScenario();
    var sip = this.getFocusSip();
    if (!sip) return null;
    var today = this.getDemoToday();
    var startKey = (sip.startDate ? sip.startDate.slice(0, 10) : DateUtils.addMonths(today, -sc.monthsToShow));
    var amountPaise = Data.toPaise(sip.amount);
    var futureMonths = sc.monthsToShow > 0 ? 3 : 0;

    var realInstalment = null;
    var realInst = this.getRealInstalmentForFocusSip();
    if (realInst && sc.monthsToShow > 0) {
      var instKey = realInst.scheduledDate.slice(0, 10);
      var mi = monthsBetween(startKey, instKey) + 1;
      if (mi >= 1 && mi <= sc.monthsToShow) {
        realInstalment = { monthIndex: mi, status: mapInstalmentStatus(realInst.status) };
      }
    }

    var navSeries = Engine.generateNavSeries(sip.id, sc.market, sc.monthsToShow + futureMonths);
    var months = sc.monthsToShow > 0 ? Engine.buildMonthlyJourney({
      startKey: startKey, monthsToShow: sc.monthsToShow, amountPaise: amountPaise, navSeries: navSeries,
      realInstalment: realInstalment, injectedMissedMonths: sc.injectedMissedMonths, injectedPausedMonths: sc.injectedPausedMonths,
      futureMonths: futureMonths
    }) : [];

    return {
      scenario: sc, sip: sip, startKey: startKey, todayKey: today,
      historicalMonths: months.filter(function (m) { return m.isHistorical; }),
      futureMonths: months.filter(function (m) { return !m.isHistorical; }),
      allMonths: months
    };
  };

  EducationStore.prototype.getOverviewSummary = function () {
    var j = this.buildJourney();
    if (!j) return null;
    var hist = j.historicalMonths;
    var last = hist.length ? hist[hist.length - 1] : null;
    var successfulCount = hist.filter(function (m) { return m.status === Status.SUCCESSFUL; }).length;
    return {
      sip: j.sip, startDateKey: j.startKey,
      monthsSinceFirst: monthsBetween(j.startKey, j.todayKey),
      monthsIllustrated: hist.length,
      successfulCount: successfulCount,
      totalInvestedPaise: last ? last.cumulativeInvestedPaise : 0,
      currentValuePaise: last ? last.portfolioValuePaise : null,
      gainLossPaise: last ? last.gainLossPaise : null,
      hasAnyContribution: successfulCount > 0
    };
  };

  EducationStore.prototype.getMonthDetail = function (monthIndex) {
    var j = this.buildJourney();
    if (!j) return null;
    return j.allMonths.find(function (m) { return m.monthIndex === monthIndex; }) || null;
  };

  EducationStore.prototype.getValueComparison = function () {
    var j = this.buildJourney();
    if (!j) return { monthly: [], cumulative: [], hasData: false };
    return {
      monthly: j.historicalMonths.map(function (m) { return { monthIndex: m.monthIndex, dateKey: m.dateKey, contributedPaise: m.contributedPaise, status: m.status }; }),
      cumulative: j.historicalMonths.map(function (m) { return { monthIndex: m.monthIndex, dateKey: m.dateKey, investedPaise: m.cumulativeInvestedPaise, valuePaise: m.portfolioValuePaise, gainLossPaise: m.gainLossPaise }; }),
      hasData: j.historicalMonths.some(function (m) { return m.status === Status.SUCCESSFUL; })
    };
  };

  EducationStore.prototype.getReturnMetrics = function () {
    var j = this.buildJourney();
    if (!j || !j.historicalMonths.length) return { hasData: false };
    var last = j.historicalMonths[j.historicalMonths.length - 1];
    var absReturnPct = Engine.absoluteReturnPct(last.gainLossPaise, last.cumulativeInvestedPaise);
    var flows = Engine.buildCashflowsFromMonths(j.historicalMonths, last.portfolioValuePaise, last.dateKey);
    var xirr = Engine.computeXIRR(flows);
    return {
      hasData: last.cumulativeInvestedPaise > 0,
      investedPaise: last.cumulativeInvestedPaise, currentValuePaise: last.portfolioValuePaise, gainLossPaise: last.gainLossPaise,
      absoluteReturnPct: absReturnPct, xirr: xirr,
      xirrUnavailableReason: xirr == null ? 'Not enough distinct contribution dates yet to estimate an annualized return.' : null
    };
  };

  // ───────────────────────── progress tracking ─────────────────────────

  EducationStore.prototype.markModuleComplete = function (moduleId) {
    var state = this.ensureLoaded();
    state.progress.modules[moduleId] = true;
    this.save();
    this.emit('education_module_completed', { moduleId: moduleId });
  };
  EducationStore.prototype.isModuleComplete = function (moduleId) { return !!this.ensureLoaded().progress.modules[moduleId]; };
  EducationStore.prototype.markCardComplete = function (cardId) {
    var state = this.ensureLoaded();
    state.progress.cards[cardId] = true;
    this.save();
  };
  EducationStore.prototype.isCardComplete = function (cardId) { return !!this.ensureLoaded().progress.cards[cardId]; };
  EducationStore.prototype.getProgress = function () {
    var state = this.ensureLoaded();
    var cardIds = Data.EXPECTATION_CARDS.map(function (c) { return c.id; });
    var cardsDone = cardIds.filter(function (id) { return state.progress.cards[id]; }).length;
    var moduleIds = [Data.ModuleId.NAV_LESSON, Data.ModuleId.MARKET_SCENARIOS, Data.ModuleId.RETURN_METRICS];
    var modulesDone = moduleIds.filter(function (id) { return state.progress.modules[id]; }).length;
    return {
      cardsCompleted: cardsDone, cardsTotal: cardIds.length,
      modulesCompleted: modulesDone, modulesTotal: moduleIds.length,
      quizCompleted: this.getQuizState().completed
    };
  };

  // ───────────────────────── quiz ─────────────────────────

  EducationStore.prototype.submitQuizAnswer = function (questionId, selected) {
    var state = this.ensureLoaded();
    var q = Data.QUIZ_QUESTIONS.find(function (x) { return x.id === questionId; });
    if (!q) return null;
    var correct = selected === q.correct;
    state.quizAttempts = state.quizAttempts.filter(function (a) { return a.questionId !== questionId; });
    state.quizAttempts.push({ id: Data.uid('qa'), questionId: questionId, selected: selected, correct: correct, at: new Date().toISOString() });
    this.save();
    if (this.getQuizState().completed) { this.markModuleComplete(Data.ModuleId.QUIZ); this.emit('education_quiz_completed', {}); }
    return { correct: correct, explanation: q.explanation };
  };
  EducationStore.prototype.getQuizState = function () {
    var state = this.ensureLoaded();
    var answered = {};
    state.quizAttempts.forEach(function (a) { answered[a.questionId] = a; });
    var total = Data.QUIZ_QUESTIONS.length;
    var answeredCount = Object.keys(answered).length;
    var correctCount = state.quizAttempts.filter(function (a) { return a.correct; }).length;
    return { answered: answered, answeredCount: answeredCount, total: total, correctCount: correctCount, completed: answeredCount >= total };
  };
  EducationStore.prototype.resetQuiz = function () {
    var state = this.ensureLoaded();
    state.quizAttempts = [];
    this.save();
  };

  // ───────────────────────── educational prompts (Screen 9) ─────────────────────────

  EducationStore.prototype.getCandidatePrompts = function () {
    var summary = this.getOverviewSummary();
    var out = [];
    if (!summary) return out;
    if (summary.successfulCount >= 1) {
      out.push({ id: PromptType.FIRST_INSTALMENT, message: 'Your first simulated instalment went through. Your portfolio value can still move up or down from here — that’s expected.' });
    }
    if (summary.gainLossPaise != null && summary.gainLossPaise < 0) {
      out.push({ id: PromptType.NEGATIVE_PERFORMANCE, message: 'Your simulated portfolio value is currently below the amount invested. Learn why this happens and what it does (and doesn’t) mean.' });
    }
    if (summary.successfulCount >= 3) {
      out.push({ id: PromptType.THREE_INSTALMENTS, message: 'You’ve reached 3 simulated successful instalments. See how your contribution history is building up.' });
    }
    if (summary.monthsSinceFirst >= 6) {
      out.push({ id: PromptType.SIX_MONTHS, message: 'Six months in — a short period is not usually enough to judge a SIP’s performance. Here’s why.' });
    }
    return out;
  };
  EducationStore.prototype.getPendingPrompt = function () {
    var state = this.ensureLoaded();
    var candidates = this.getCandidatePrompts();
    for (var i = 0; i < candidates.length; i++) {
      if (!state.promptsDismissed[candidates[i].id]) return candidates[i];
    }
    return null;
  };
  EducationStore.prototype.dismissPrompt = function (promptId) {
    var state = this.ensureLoaded();
    state.promptsDismissed[promptId] = new Date().toISOString();
    this.save();
    this.emit('education_prompt_dismissed', { promptId: promptId });
  };

  // ───────────────────────── notifications (Screen 11) ─────────────────────────

  EducationStore.prototype.refreshNotifications = function () {
    var state = this.ensureLoaded();
    var summary = this.getOverviewSummary();
    if (!summary) return;
    var self = this;
    function add(type, dedupeKey, message) {
      var exists = state.notifications.some(function (n) { return n.dedupeKey === dedupeKey; });
      if (!exists) state.notifications.push({ id: Data.uid('ntf'), type: type, dedupeKey: dedupeKey, message: message, createdAt: new Date().toISOString(), read: false });
    }
    if (summary.successfulCount >= 1) add(NotificationType.FIRST_MONTH_EXPLAINER, 'first_month', 'New: understand what your first SIP instalment means for your journey.');
    if (summary.successfulCount >= 3) add(NotificationType.THREE_MONTH_MILESTONE, 'three_month', 'Milestone: 3 simulated successful instalments logged. See your journey so far.');
    if (summary.monthsSinceFirst >= 6) add(NotificationType.SIX_MONTH_MILESTONE, 'six_month', 'Milestone: 6 months since your first instalment. Review what short-term performance does and doesn’t tell you.');
    if (!this.getQuizState().completed) add(NotificationType.QUIZ_REMINDER, 'quiz_reminder', 'Optional: a short 5-question quiz is available to check your understanding.');
    this.save();
  };
  EducationStore.prototype.getNotifications = function () { return this.ensureLoaded().notifications.slice().reverse(); };
  EducationStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  EducationStore.prototype.setNotificationsOptIn = function (enabled) {
    this.ensureLoaded().settings.notificationsOptIn = !!enabled;
    this.save();
  };
  EducationStore.prototype.getNotificationsOptIn = function () { return this.ensureLoaded().settings.notificationsOptIn; };

  return { EducationStore: EducationStore };
});
