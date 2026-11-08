/**
 * SIP Cash-Flow Planner — persisted store. Reads SIP, mandate, schedule and
 * pause state from the shared RecoveryStore/SchedulingStore/PauseStore/
 * MandateStore (Features 1-4) purely through their existing public getters
 * — this file never mutates any of their state except for one call,
 * `schedulingStore.setIncome()`, which is Feature 2's own intended public
 * setter for the one shared income-date field in the app (never a second,
 * duplicate one). The what-if simulator never touches any other store at
 * all; it only calls the pure functions in engine.js on cloned data.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./engine.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.CashFlowData, window.CashFlowEngine, window.SchedulingDateUtils);
    window.CashFlowStore = out.CashFlowStore;
  }
})(this, function (Data, Engine, DateUtils) {
  'use strict';

  var GapStatus = Data.GapStatus;
  var STORAGE_KEY = 'indmoney_cashflow_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }

  function defaultProfile() {
    return {
      openingCashPaise: null, incomeAmountPaise: null, incomeAmountRangePaise: null,
      recurringExpenses: [], oneTimeExpenses: [], setupCompletedAt: null, skipped: false
    };
  }

  function defaultState() {
    return {
      version: 1,
      demoClockOffsetDays: 0,
      profileInitialized: false,
      focusedScenarioId: 'cf-a',
      focusSipId: null,
      profile: defaultProfile(),
      manualIncomeEvents: [],
      whatIfDraft: null,
      notifications: [],
      analyticsEvents: [],
      settings: { reminderOptIn: true }
    };
  }

  function CashFlowStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.schedulingStore = opts.schedulingStore || null;
    this.pauseStore = opts.pauseStore || null;
    this.mandateStore = opts.mandateStore || null;
    this.state = null;
  }

  CashFlowStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) { try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); } }
    else { this.state = defaultState(); }
    this.ensureSeeded();
    this.save();
    return this.state;
  };
  CashFlowStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };
  CashFlowStore.prototype.ensureLoaded = function () { if (!this.state) this.load(); return this.state; };
  CashFlowStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.ensureSeeded();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };
  CashFlowStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
  };

  CashFlowStore.prototype.getDemoToday = function () {
    var state = this.ensureLoaded();
    return DateUtils.addDays(DateUtils.todayKey(), state.demoClockOffsetDays || 0);
  };
  CashFlowStore.prototype.advanceDemoClock = function (days) {
    var state = this.ensureLoaded();
    state.demoClockOffsetDays = (state.demoClockOffsetDays || 0) + days;
    this.save();
    return this.getDemoToday();
  };

  /** Idempotent: seeds scenario H's pending Feature 2 date-change request once, and the default scenario's profile on first-ever load only (never clobbers a returning user's own edits). */
  CashFlowStore.prototype.ensureSeeded = function () {
    var state = this.ensureLoaded ? this.state : this.state; // state already loaded by caller
    if (this.schedulingStore) {
      var seed = Data.buildScenarios().filter(function (s) { return s.seedPendingDateChange; })[0];
      if (seed) {
        var sipId = seed.seedPendingDateChange.sipId;
        if (this.schedulingStore.getOpenRequestsForSip(sipId).length === 0 && this.schedulingStore.getRequestsForSip(sipId).length === 0) {
          this.schedulingStore.submitDateChangeRequest(sipId, seed.seedPendingDateChange.requestedDay);
        }
      }
    }
    if (!this.state.profileInitialized) {
      this.applyScenario(this.state.focusedScenarioId || 'cf-a');
      this.state.profileInitialized = true;
    }
  };

  // ───────────────────────── profile ─────────────────────────
  CashFlowStore.prototype.getProfile = function () { return this.ensureLoaded().profile; };
  CashFlowStore.prototype.setProfile = function (partial) {
    var state = this.ensureLoaded();
    var wasEmpty = !state.profile.setupCompletedAt;
    state.profile = Object.assign({}, state.profile, partial, { setupCompletedAt: new Date().toISOString(), skipped: false });
    this.save();
    this.emit('cashflow_setup_completed', {});
    if (wasEmpty) this.emit('cashflow_setup_started', {});
    return state.profile;
  };
  CashFlowStore.prototype.addRecurringExpense = function (expense) {
    var state = this.ensureLoaded();
    var e = Object.assign({ id: Data.uid('cfexp') }, expense);
    state.profile.recurringExpenses.push(e);
    state.profile.setupCompletedAt = new Date().toISOString();
    this.save();
    return e;
  };
  CashFlowStore.prototype.removeRecurringExpense = function (id) {
    var state = this.ensureLoaded();
    state.profile.recurringExpenses = state.profile.recurringExpenses.filter(function (e) { return e.id !== id; });
    this.save();
  };
  CashFlowStore.prototype.addOneTimeExpense = function (expense) {
    var state = this.ensureLoaded();
    var e = Object.assign({ id: Data.uid('cfexp1') }, expense);
    state.profile.oneTimeExpenses.push(e);
    state.profile.setupCompletedAt = new Date().toISOString();
    this.save();
    return e;
  };
  CashFlowStore.prototype.removeOneTimeExpense = function (id) {
    var state = this.ensureLoaded();
    state.profile.oneTimeExpenses = state.profile.oneTimeExpenses.filter(function (e) { return e.id !== id; });
    this.save();
  };
  CashFlowStore.prototype.skipProfileSetup = function () {
    var state = this.ensureLoaded();
    state.profile.skipped = true;
    state.profile.setupCompletedAt = new Date().toISOString();
    this.save();
    return state.profile;
  };

  // ───────────────────────── income (reuses Feature 2's own field) ─────────────────────────
  CashFlowStore.prototype.getIncome = function () { return this.schedulingStore ? this.schedulingStore.getIncome() : null; };
  CashFlowStore.prototype.setIncomeDate = function (incomeFields) {
    if (!this.schedulingStore) return null;
    return this.schedulingStore.setIncome(incomeFields);
  };
  CashFlowStore.prototype.getManualIncomeEvents = function () { return this.ensureLoaded().manualIncomeEvents; };
  CashFlowStore.prototype.addManualIncomeEvent = function (dateKey, amountPaise, label) {
    var state = this.ensureLoaded();
    state.manualIncomeEvents.push({ id: Data.uid('cfincome'), dateKey: dateKey, amountPaise: amountPaise, label: label || 'Manually entered income' });
    this.save();
    return state.manualIncomeEvents;
  };
  CashFlowStore.prototype.removeManualIncomeEvent = function (id) {
    var state = this.ensureLoaded();
    state.manualIncomeEvents = state.manualIncomeEvents.filter(function (e) { return e.id !== id; });
    this.save();
  };

  // ───────────────────────── scenarios ─────────────────────────
  CashFlowStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  CashFlowStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  CashFlowStore.prototype.getFocusSipId = function () { return this.ensureLoaded().focusSipId; };
  CashFlowStore.prototype.applyScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    var sc = Data.buildScenarios().find(function (s) { return s.id === scenarioId; });
    if (!sc) return;
    state.focusedScenarioId = scenarioId;
    state.focusSipId = sc.focusSipId || null;
    state.profile = Object.assign(defaultProfile(), sc.profile, { setupCompletedAt: new Date().toISOString(), skipped: false });
    state.manualIncomeEvents = [];
    this.save();
    if (sc.income && this.schedulingStore) this.schedulingStore.setIncome(sc.income);
  };
  CashFlowStore.prototype.setFocusedScenario = function (scenarioId) {
    this.applyScenario(scenarioId);
    this.emit('cashflow_setup_completed', { scenarioId: scenarioId });
  };

  // ───────────────────────── SIP contexts / occurrences ─────────────────────────

  /** Builds the per-SIP projection context from the shared stores: current effective debit day, any effective pause, and (when tracked) mandate health. */
  CashFlowStore.prototype.buildSipContexts = function () {
    this.ensureLoaded();
    var self = this;
    if (!this.recoveryStore) return [];
    return this.recoveryStore.getAllSips().map(function (sip) {
      var lifecycle = self.pauseStore ? self.pauseStore.getLifecycle(sip.id) : 'active';
      var debitDay = (self.schedulingStore && self.schedulingStore.getCurrentDebitDay) ? self.schedulingStore.getCurrentDebitDay(sip.id) : sip.scheduledDay;
      var pauseInfo = null;
      if (lifecycle === 'paused' && self.pauseStore) {
        var req = self.pauseStore.getActivePauseRequestForSip(sip.id);
        if (req) pauseInfo = { affectedDateKeys: req.affectedDateKeys, resumeDateKey: req.resumeDateKey };
      }
      var mandateHealth = self.mandateStore ? self.mandateStore.getMandateHealth(sip.id) : null;
      return {
        sipId: sip.id, fundName: sip.fundName, amountPaise: Math.round(sip.amount * 100),
        debitDay: debitDay, pauseInfo: pauseInfo, mandateHealth: mandateHealth, lifecycle: lifecycle
      };
    });
  };

  CashFlowStore.prototype.getUpcomingOccurrences = function (windowDays) {
    var today = this.getDemoToday();
    var windowEnd = DateUtils.addDays(today, windowDays);
    var ctxList = this.buildSipContexts();
    return Engine.buildSipOccurrences(ctxList, today, windowEnd);
  };

  /** Attaches real Feature 1 instalment status to an occurrence when one happens to exist for that exact date (never fabricated, never double-counted). */
  CashFlowStore.prototype.enrichOccurrence = function (occ) {
    if (!this.recoveryStore) return occ;
    var insts = this.recoveryStore.getInstalmentsForSip(occ.sipId);
    var match = insts.find(function (i) { return (i.scheduledDate || '').slice(0, 10) === occ.dateKey; });
    return Object.assign({}, occ, { instalmentStatus: match ? match.status : null, instalmentId: match ? match.id : null });
  };

  // ───────────────────────── overview / breakdown / projection ─────────────────────────

  CashFlowStore.prototype.getOverview = function () {
    var today = this.getDemoToday();
    var occ7 = this.getUpcomingOccurrences(7);
    var occ30 = this.getUpcomingOccurrences(30);
    var gapAnalysis = this.getCurrentProjection(30).gapAnalysis;
    var distinctSips = {};
    occ30.forEach(function (o) { distinctSips[o.sipId] = true; });
    return {
      todayKey: today,
      next7TotalPaise: Engine.sumPaise(occ7), next7Count: occ7.length,
      next30TotalPaise: Engine.sumPaise(occ30), next30Count: occ30.length,
      nextDateKey: occ30.length ? occ30[0].dateKey : null,
      sipCount: Object.keys(distinctSips).length,
      gapCount: gapAnalysis.filter(function (g) { return g.status === GapStatus.ESTIMATED_GAP; }).length,
      unresolvedFailures: this.recoveryStore ? this.recoveryStore.getUnresolvedInstalments() : []
    };
  };

  CashFlowStore.prototype.getBreakdown = function (windowDays) {
    var self = this;
    var occ = this.getUpcomingOccurrences(windowDays || 60).map(function (o) { return self.enrichOccurrence(o); });
    var today = this.getDemoToday();
    return {
      all: occ,
      next7: Engine.withinDays(occ, today, 7),
      next30: Engine.withinDays(occ, today, 30),
      currentMonth: Engine.withinCalendarMonth(occ, today),
      followingMonth: Engine.withinFollowingCalendarMonth(occ, today),
      totalPaise: Engine.sumPaise(Engine.withinDays(occ, today, windowDays || 60))
    };
  };

  CashFlowStore.prototype.getCurrentProjection = function (windowDays) {
    var today = this.getDemoToday();
    var windowEnd = DateUtils.addDays(today, windowDays || 30);
    var profile = this.getProfile();
    var income = this.getIncome();
    var manualEvents = this.getManualIncomeEvents();
    var occurrences = this.getUpcomingOccurrences(windowDays || 30);
    var projection = Engine.computeProjection(profile, income, manualEvents, occurrences, today, windowEnd);
    projection.occurrences = occurrences;
    return projection;
  };

  // ───────────────────────── what-if simulator (isolated by construction) ─────────────────────────

  CashFlowStore.prototype.previewWhatIf = function (overrides) {
    overrides = overrides || {};
    var today = this.getDemoToday();
    var windowEnd = DateUtils.addDays(today, 30);
    var profile = this.getProfile();
    var income = this.getIncome();
    var manualEvents = this.getManualIncomeEvents();
    var occurrences = this.getUpcomingOccurrences(30);

    var currentProjection = Engine.computeProjection(profile, income, manualEvents, occurrences, today, windowEnd);

    var simProfile = JSON.parse(JSON.stringify(profile));
    if (overrides.openingCashPaise !== undefined) simProfile.openingCashPaise = overrides.openingCashPaise;
    if (overrides.incomeAmountPaise !== undefined) simProfile.incomeAmountPaise = overrides.incomeAmountPaise;
    if (overrides.oneTimeExpenseAdd) simProfile.oneTimeExpenses = simProfile.oneTimeExpenses.concat([overrides.oneTimeExpenseAdd]);

    var simIncome = income;
    if (overrides.income) simIncome = Object.assign({}, income, overrides.income);

    var simOccurrences = JSON.parse(JSON.stringify(occurrences));
    if (overrides.sipDateOverride) {
      var targetId = overrides.sipDateOverride.sipId, newDay = overrides.sipDateOverride.newDay;
      simOccurrences = simOccurrences.filter(function (o) { return o.sipId !== targetId; });
      Engine.occurrencesOfDay(newDay, today, windowEnd).forEach(function (dateKey, idx) {
        var original = occurrences.find(function (o) { return o.sipId === targetId; });
        if (original) simOccurrences.push({ sipId: targetId, fundName: original.fundName, amountPaise: original.amountPaise, dateKey: dateKey, confirmed: idx === 0 });
      });
    }
    if (overrides.pauseSipId) {
      simOccurrences = simOccurrences.filter(function (o) { return o.sipId !== overrides.pauseSipId; });
    }
    simOccurrences.sort(function (a, b) { return DateUtils.compareKeys(a.dateKey, b.dateKey); });

    var simulatedProjection = Engine.computeProjection(simProfile, simIncome, manualEvents, simOccurrences, today, windowEnd);
    var state = this.ensureLoaded();
    state.whatIfDraft = { overrides: overrides, at: new Date().toISOString() };
    this.save();
    this.emit('whatif_simulation_started', {});
    this.emit('whatif_simulation_completed', { differencePaise: (simulatedProjection.closingCashPaise || 0) - (currentProjection.closingCashPaise || 0) });

    return {
      currentProjection: currentProjection, simulatedProjection: simulatedProjection,
      differencePaise: (currentProjection.hasOpeningBalance && simulatedProjection.hasOpeningBalance)
        ? (simulatedProjection.closingCashPaise - currentProjection.closingCashPaise) : null
    };
  };
  CashFlowStore.prototype.getWhatIfDraft = function () { return this.ensureLoaded().whatIfDraft; };
  CashFlowStore.prototype.resetWhatIf = function () {
    var state = this.ensureLoaded();
    state.whatIfDraft = null;
    this.save();
  };

  // ───────────────────────── reminders / notifications ─────────────────────────

  CashFlowStore.prototype.addNotification = function (type, dedupeKey, message) {
    var state = this.ensureLoaded();
    if (state.notifications.some(function (n) { return n.dedupeKey === dedupeKey; })) return null;
    var n = { id: Data.uid('cfnotif'), type: type, dedupeKey: dedupeKey, message: message, createdAt: new Date().toISOString(), read: false };
    state.notifications.unshift(n);
    this.save();
    return n;
  };
  CashFlowStore.prototype.removeNotificationsByType = function (type) {
    var state = this.ensureLoaded();
    state.notifications = state.notifications.filter(function (n) { return n.type !== type; });
    this.save();
  };
  CashFlowStore.prototype.refreshReminders = function () {
    var occ7 = this.getUpcomingOccurrences(7);
    var projection = this.getCurrentProjection(30);
    var profile = this.getProfile();
    var missingInfo = profile.openingCashPaise == null || profile.incomeAmountPaise == null;
    var candidates = Engine.buildReminderCandidates(occ7, projection.occurrences, projection.gapAnalysis, missingInfo);
    var self = this;
    candidates.forEach(function (c) { self.addNotification(c.type, c.dedupeKey, c.message); });
    return this.getNotifications();
  };
  CashFlowStore.prototype.getNotifications = function () {
    return this.ensureLoaded().notifications.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  };
  CashFlowStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  CashFlowStore.prototype.setReminderOptIn = function (val) {
    this.ensureLoaded().settings.reminderOptIn = !!val;
    this.save();
    this.emit('commitment_reminder_enabled', { enabled: !!val });
  };
  CashFlowStore.prototype.getReminderOptIn = function () { return this.ensureLoaded().settings.reminderOptIn; };

  return { CashFlowStore: CashFlowStore };
});
