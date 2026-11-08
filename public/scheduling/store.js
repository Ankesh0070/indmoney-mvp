/**
 * Salary-Aligned SIP Scheduler — mock provider engine (pure) + persisted
 * store. Reads/writes SIP, mandate and instalment records through the
 * shared RecoveryStore (Feature 1) via its additive registerSip/
 * registerMandate/registerInstalment/registerAttempt API only — this file
 * never calls retryPayment/renewMandate/reauthorize/checkStatus, so
 * Feature 1's payment state machine is untouched.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.SchedulingData, window.SchedulingDateUtils);
    window.SchedulingEngine = out.SchedulingEngine;
    window.SchedulingStore = out.SchedulingStore;
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var RequestStatus = Data.RequestStatus;
  var MismatchStatus = Data.MismatchStatus;
  var IncomePattern = Data.IncomePattern;

  // ───────────────────────── SchedulingEngine (pure) ─────────────────────────
  var SchedulingEngine = {};

  SchedulingEngine.detectMismatch = function (income, debitDay, year, month0) {
    if (!income || income.skipped || !income.pattern || income.pattern === IncomePattern.IRREGULAR) {
      return { status: MismatchStatus.UNKNOWN };
    }
    if (income.pattern === IncomePattern.FIXED) {
      var projectedIncomeDay = DateUtils.clampDay(income.fixedDay, year, month0);
      if (debitDay === projectedIncomeDay) return { status: MismatchStatus.SAME_DAY, projectedIncomeDay: projectedIncomeDay };
      if (debitDay < projectedIncomeDay) return { status: MismatchStatus.MISMATCH, projectedIncomeDay: projectedIncomeDay };
      return { status: MismatchStatus.ALIGNED, projectedIncomeDay: projectedIncomeDay };
    }
    if (income.pattern === IncomePattern.VARIABLE) {
      var start = DateUtils.clampDay(income.variableStart, year, month0);
      var end = DateUtils.clampDay(income.variableEnd, year, month0);
      if (debitDay <= end) return { status: MismatchStatus.UNCERTAIN, variableStart: start, variableEnd: end };
      return { status: MismatchStatus.ALIGNED, variableStart: start, variableEnd: end };
    }
    return { status: MismatchStatus.UNKNOWN };
  };

  SchedulingEngine.submitDateChange = function (capability, requestedDay, existingOpenRequests) {
    if (existingOpenRequests && existingOpenRequests.length) return { ok: false, code: 'REQUEST_ALREADY_PENDING' };
    if (!capability || !capability.canChangeDate) return { ok: false, code: 'NOT_SUPPORTED' };
    if (capability.allowedDates && capability.allowedDates.indexOf(requestedDay) === -1) return { ok: false, code: 'DATE_NOT_ALLOWED' };
    var initialStatus = capability.requiresReauth ? RequestStatus.REQUIRES_REAUTHORIZATION : RequestStatus.PENDING_PROVIDER_APPROVAL;
    return { ok: true, status: initialStatus };
  };

  SchedulingEngine.resolveProviderDecision = function (capability) {
    if (!capability) return { outcome: 'rejected', reason: 'This SIP no longer has an active scheduling capability on record.' };
    if (capability.simulatedDecision === 'reject') {
      return { outcome: 'rejected', reason: capability.rejectionReason || 'The provider did not approve this change for the current cycle.' };
    }
    return { outcome: 'approved' };
  };

  /** Next valid occurrence of requestedDay that respects the minimum notice period. */
  SchedulingEngine.computeEffectiveDate = function (capability, requestedDay, todayKey) {
    var noticeFloor = DateUtils.addDays(todayKey, capability.minNoticeDays || 0);
    var p = DateUtils.parseKey(todayKey);
    var candidate = DateUtils.keyForDayInMonth(p.year, p.month0, requestedDay);
    if (DateUtils.compareKeys(candidate, noticeFloor) < 0 || DateUtils.compareKeys(candidate, todayKey) <= 0) {
      candidate = DateUtils.addMonths(todayKey, 1, requestedDay);
    }
    while (DateUtils.compareKeys(candidate, noticeFloor) < 0) {
      candidate = DateUtils.addMonths(candidate, 1, requestedDay);
    }
    return candidate;
  };

  SchedulingEngine.canCancel = function (capability, request) {
    if (!capability || !capability.cancellationSupported) return { ok: false, code: 'CANCELLATION_NOT_SUPPORTED' };
    if (Data.CANCELLABLE_STATUSES.indexOf(request.status) === -1) return { ok: false, code: 'NOT_CANCELLABLE' };
    return { ok: true };
  };

  // ───────────────────────── SchedulingStore (stateful) ─────────────────────────
  var STORAGE_KEY = 'indmoney_scheduling_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }

  function isoNoonFromKey(key) { return key + 'T12:00:00.000Z'; }

  function defaultState() {
    return {
      version: 1,
      income: null,
      focusedScenarioId: 'sched-a',
      capabilities: {},
      effectiveOverrides: {},
      requests: [],
      notifications: [],
      analyticsEvents: [],
      inFlight: {},
      usedIdempotencyKeys: {},
      settings: { reminderOptIn: true }
    };
  }

  function SchedulingStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.state = null;
  }

  SchedulingStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) {
      try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); }
    } else {
      this.state = defaultState();
    }
    this.ensureSeeded();
    this.save();
    return this.state;
  };

  SchedulingStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };

  SchedulingStore.prototype.ensureLoaded = function () {
    if (!this.state) this.load();
    return this.state;
  };

  SchedulingStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.ensureSeeded();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };

  SchedulingStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
  };

  /** Idempotently registers every scenario's SIP/mandate/instalment into the shared RecoveryStore and its capability here. */
  SchedulingStore.prototype.ensureSeeded = function () {
    if (!this.recoveryStore) return;
    var self = this;
    var today = DateUtils.todayKey();
    Data.buildScenarios().forEach(function (sc) {
      var sipId = sc.reuseSipId || sc.sip.id;
      if (sc.sip) {
        self.recoveryStore.registerSip(sc.sip);
        var mandate = Data.makeMandateFor(sipId);
        self.recoveryStore.registerMandate(mandate);
        if (sc.instalment) {
          var p = DateUtils.parseKey(today);
          var scheduledKey = DateUtils.keyForDayInMonth(p.year, p.month0, sc.sip.scheduledDay);
          var iso = isoNoonFromKey(scheduledKey);
          var inst = Object.assign({
            sipId: sipId, scheduledDate: iso, retryPermitted: false, recoveryAvailable: false,
            attemptSeq: 1, statusCheckCount: 0, everFailed: false, failedAt: null, recoveredAt: null
          }, sc.instalment);
          self.recoveryStore.registerInstalment(inst);
          if (self.recoveryStore.registerAttempt) {
            self.recoveryStore.registerAttempt({
              id: inst.id + '-original', instalmentId: inst.id, type: 'original', status: 'success',
              idempotencyKey: inst.id + '-original-0', createdAt: iso, resolvedAt: iso,
              message: 'Instalment processed successfully.'
            });
          }
        }
      }
      if (!self.state.capabilities[sc.capability.sipId]) self.state.capabilities[sc.capability.sipId] = sc.capability;
      if (sc.companionCapability && !self.state.capabilities[sc.companionCapability.sipId]) {
        self.state.capabilities[sc.companionCapability.sipId] = sc.companionCapability;
      }
    });
  };

  // ── income ──
  SchedulingStore.prototype.getIncome = function () { return this.ensureLoaded().income; };
  SchedulingStore.prototype.setIncome = function (income) {
    var state = this.ensureLoaded();
    state.income = Object.assign({ setupCompletedAt: new Date().toISOString(), reminderEnabled: true, skipped: false }, income);
    this.clearStaleMismatchNotifications();
    this.save();
    this.emit('expected_income_date_saved', { pattern: state.income.pattern });
    return state.income;
  };
  SchedulingStore.prototype.skipIncomeSetup = function () {
    var state = this.ensureLoaded();
    state.income = { pattern: null, skipped: true, setupCompletedAt: new Date().toISOString(), reminderEnabled: false };
    this.save();
    return state.income;
  };

  // ── scenarios / capability / current schedule ──
  SchedulingStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  SchedulingStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  SchedulingStore.prototype.setFocusedScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    var sc = Data.buildScenarios().find(function (s) { return s.id === scenarioId; });
    if (!sc) return;
    state.focusedScenarioId = scenarioId;
    if (sc.defaultIncome) this.setIncome(sc.defaultIncome);
    this.save();
  };
  SchedulingStore.prototype.getCapability = function (sipId) { return this.ensureLoaded().capabilities[sipId] || null; };
  SchedulingStore.prototype.getCurrentDebitDay = function (sipId) {
    var state = this.ensureLoaded();
    if (state.effectiveOverrides[sipId]) return state.effectiveOverrides[sipId];
    var sip = this.recoveryStore.getSip(sipId);
    return sip ? sip.scheduledDay : null;
  };
  SchedulingStore.prototype.getAllSchedulableSips = function () {
    this.ensureLoaded();
    return this.recoveryStore.getAllSips();
  };
  SchedulingStore.prototype.detectMismatchForSip = function (sipId, year, month0) {
    var income = this.getIncome();
    var debitDay = this.getCurrentDebitDay(sipId);
    return SchedulingEngine.detectMismatch(income, debitDay, year, month0);
  };

  // ── requests ──
  SchedulingStore.prototype.getOpenRequestsForSip = function (sipId) {
    return this.ensureLoaded().requests.filter(function (r) {
      return r.sipId === sipId && Data.OPEN_REQUEST_STATUSES.indexOf(r.status) !== -1;
    });
  };
  SchedulingStore.prototype.getRequestsForSip = function (sipId) {
    return this.ensureLoaded().requests.filter(function (r) { return r.sipId === sipId; })
      .sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
  };
  SchedulingStore.prototype.getAllRequests = function () {
    return this.ensureLoaded().requests.slice().sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
  };
  SchedulingStore.prototype.getRequest = function (id) {
    return this.ensureLoaded().requests.find(function (r) { return r.id === id; }) || null;
  };

  SchedulingStore.prototype.isInFlight = function (sipId) { return !!this.ensureLoaded().inFlight[sipId]; };
  SchedulingStore.prototype.beginRequest = function (sipId) { this.ensureLoaded().inFlight[sipId] = true; this.save(); };
  SchedulingStore.prototype.endRequest = function (sipId) { delete this.ensureLoaded().inFlight[sipId]; this.save(); };

  SchedulingStore.prototype.submitDateChangeRequest = function (sipId, requestedDay) {
    var state = this.ensureLoaded();
    if (this.isInFlight(sipId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest(sipId);
    try {
      var capability = this.getCapability(sipId);
      var openRequests = this.getOpenRequestsForSip(sipId);
      var result = SchedulingEngine.submitDateChange(capability, requestedDay, openRequests);
      if (!result.ok) return result;

      var idempotencyKey = sipId + '-datechange-' + (this.getRequestsForSip(sipId).length + 1);
      if (state.usedIdempotencyKeys[idempotencyKey]) return { ok: false, code: 'DUPLICATE_REQUEST' };
      state.usedIdempotencyKeys[idempotencyKey] = true;

      var request = {
        id: Data.uid('screq'), sipId: sipId, idempotencyKey: idempotencyKey,
        currentDateAtRequest: this.getCurrentDebitDay(sipId), requestedDate: requestedDay,
        status: result.status, submittedAt: new Date().toISOString(), decisionAt: null,
        effectiveDate: null, rejectionReason: null, reauthCompletedAt: null, cancelledAt: null,
        minNoticeDays: capability.minNoticeDays, requiresReauth: !!capability.requiresReauth
      };
      state.requests.push(request);
      this.addNotification('change_pending', sipId, request, 'Your SIP date-change request has been submitted and is awaiting a decision.');
      this.emit('sip_date_change_submitted', { sipId: sipId, requestId: request.id, requestedDay: requestedDay });
      this.save();
      return { ok: true, request: request };
    } finally {
      this.endRequest(sipId);
    }
  };

  SchedulingStore.prototype.completeReauthorization = function (requestId) {
    var request = this.getRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    if (request.status !== RequestStatus.REQUIRES_REAUTHORIZATION) return { ok: false, code: 'INVALID_STATE' };
    request.status = RequestStatus.PENDING_PROVIDER_APPROVAL;
    request.reauthCompletedAt = new Date().toISOString();
    this.save();
    return { ok: true, request: request };
  };

  SchedulingStore.prototype.checkRequestStatus = function (requestId) {
    var request = this.getRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);

    if (request.status === RequestStatus.APPROVED) {
      var today = DateUtils.todayKey();
      if (request.effectiveDate && DateUtils.compareKeys(today, request.effectiveDate) >= 0) {
        this.applyEffective(request);
        return { ok: true, status: RequestStatus.EFFECTIVE, request: request };
      }
      return { ok: true, status: RequestStatus.APPROVED, request: request };
    }
    if (request.status === RequestStatus.PENDING_PROVIDER_APPROVAL) {
      var decision = SchedulingEngine.resolveProviderDecision(capability);
      request.decisionAt = new Date().toISOString();
      if (decision.outcome === 'approved') {
        request.status = RequestStatus.APPROVED;
        request.effectiveDate = SchedulingEngine.computeEffectiveDate(capability, request.requestedDate, DateUtils.todayKey());
        this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'change_pending'; });
        this.addNotification('change_approved', request.sipId, request, 'Your SIP date-change request was approved.');
        this.emit('sip_date_change_approved', { sipId: request.sipId, requestId: request.id, effectiveDate: request.effectiveDate });
      } else {
        request.status = RequestStatus.REJECTED;
        request.rejectionReason = decision.reason;
        this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'change_pending'; });
        this.addNotification('change_rejected', request.sipId, request, 'Your SIP date-change request was not approved. ' + decision.reason);
        this.emit('sip_date_change_rejected', { sipId: request.sipId, requestId: request.id, reason: decision.reason });
      }
      this.save();
      return { ok: true, status: request.status, request: request };
    }
    return { ok: true, status: request.status, request: request };
  };

  SchedulingStore.prototype.applyEffective = function (request) {
    request.status = RequestStatus.EFFECTIVE;
    request.effectiveAppliedAt = new Date().toISOString();
    this.state.effectiveOverrides[request.sipId] = request.requestedDate;
    this.removeNotifications(function (n) {
      return n.sipId === request.sipId && (n.type === 'change_approved' || n.type === 'mismatch_alert');
    });
    this.addNotification('change_effective', request.sipId, request, 'Your new SIP debit date is now in effect.');
    this.emit('sip_date_change_effective', { sipId: request.sipId, requestId: request.id, effectiveDate: request.effectiveDate });
    this.save();
  };

  /** Demo-only: pulls a request's effective date to "today" so its effect can be observed without waiting. Clearly simulated. */
  SchedulingStore.prototype.simulateReachEffectiveDate = function (requestId) {
    var request = this.getRequest(requestId);
    if (!request || request.status !== RequestStatus.APPROVED) return { ok: false, code: 'NOT_APPROVED' };
    request.effectiveDate = DateUtils.todayKey();
    this.save();
    return this.checkRequestStatus(requestId);
  };

  SchedulingStore.prototype.cancelRequest = function (requestId) {
    var request = this.getRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);
    var check = SchedulingEngine.canCancel(capability, request);
    if (!check.ok) return check;
    request.status = RequestStatus.CANCELLED;
    request.cancelledAt = new Date().toISOString();
    this.removeNotifications(function (n) { return n.requestId === request.id; });
    this.save();
    return { ok: true, request: request };
  };

  // ── notifications ──
  SchedulingStore.prototype.addNotification = function (type, sipId, request, message) {
    var state = this.ensureLoaded();
    var dedupeKey = type + ':' + (request ? request.id : sipId);
    var exists = state.notifications.some(function (n) { return n.dedupeKey === dedupeKey; });
    if (exists) return null;
    var n = {
      id: Data.uid('sched-notif'), type: type, sipId: sipId, requestId: request ? request.id : null,
      dedupeKey: dedupeKey, message: message, createdAt: new Date().toISOString(), read: false
    };
    state.notifications.unshift(n);
    this.save();
    return n;
  };
  SchedulingStore.prototype.removeNotifications = function (predicate) {
    var state = this.ensureLoaded();
    state.notifications = state.notifications.filter(function (n) { return !predicate(n); });
    this.save();
  };
  SchedulingStore.prototype.getNotifications = function () {
    return this.ensureLoaded().notifications.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  };
  SchedulingStore.prototype.getUnreadCount = function () { return this.ensureLoaded().notifications.filter(function (n) { return !n.read; }).length; };
  SchedulingStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  SchedulingStore.prototype.markAllNotificationsRead = function () {
    this.ensureLoaded().notifications.forEach(function (n) { n.read = true; });
    this.save();
  };
  SchedulingStore.prototype.setReminderOptIn = function (val) {
    this.ensureLoaded().settings.reminderOptIn = !!val;
    this.save();
  };
  SchedulingStore.prototype.clearStaleMismatchNotifications = function () {
    this.removeNotifications(function (n) { return n.type === 'mismatch_alert'; });
  };

  return { SchedulingEngine: SchedulingEngine, SchedulingStore: SchedulingStore };
});
