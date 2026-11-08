/**
 * SIP Pause & Resume Manager — mock provider engine (pure) + persisted
 * store. Reads/writes SIP, mandate and instalment records through the
 * shared RecoveryStore (Feature 1) via its additive registerSip/
 * registerMandate/registerInstalment/registerAttempt API only, and reads
 * Feature 2's SchedulingStore only to detect pending date-change conflicts
 * — this file never touches either feature's own state machine.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.PauseData, window.SchedulingDateUtils);
    window.PauseEngine = out.PauseEngine;
    window.PauseStore = out.PauseStore;
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var PauseRequestStatus = Data.PauseRequestStatus;
  var ResumeRequestStatus = Data.ResumeRequestStatus;
  var SipLifecycleStatus = Data.SipLifecycleStatus;
  var ScheduleEntryStatus = Data.ScheduleEntryStatus;

  // ───────────────────────── PauseEngine (pure) ─────────────────────────
  var PauseEngine = {};

  PauseEngine.checkPauseEligibility = function (capability) {
    if (!capability || !capability.pauseSupported) return { ok: false, code: 'NOT_SUPPORTED' };
    return { ok: true };
  };

  /**
   * Projects which upcoming debit-day occurrences would be skipped by a
   * `cycles`-length pause starting from `todayKey`, honoring the minimum
   * notice period and never silently skipping an instalment that is
   * already processing in the real payment record (`protectedInfo`).
   */
  PauseEngine.computePauseSchedule = function (capability, cycles, todayKey, scheduledDay, protectedInfo) {
    var noticeFloor = DateUtils.addDays(todayKey, capability.noticeDays || 0);
    var p = DateUtils.parseKey(todayKey);
    var candidate = DateUtils.keyForDayInMonth(p.year, p.month0, scheduledDay);
    if (DateUtils.compareKeys(candidate, noticeFloor) < 0) {
      candidate = DateUtils.addMonths(todayKey, 1, scheduledDay);
    }
    var protectedDateKey = null;
    if (protectedInfo && protectedInfo.isProcessing && protectedInfo.dateKey === candidate) {
      protectedDateKey = candidate;
      candidate = DateUtils.addMonths(candidate, 1, scheduledDay);
    }
    var affectedDateKeys = [];
    var cursor = candidate;
    for (var i = 0; i < cycles; i++) {
      affectedDateKeys.push(cursor);
      cursor = DateUtils.addMonths(cursor, 1, scheduledDay);
    }
    return { affectedDateKeys: affectedDateKeys, protectedDateKey: protectedDateKey, resumeDateKey: cursor, nextEligibleDateKey: affectedDateKeys[0] };
  };

  PauseEngine.submitPause = function (capability, cycles, openPauseExists, conflictingDateChangeExists) {
    if (!capability || !capability.pauseSupported) return { ok: false, code: 'NOT_SUPPORTED' };
    if (openPauseExists) return { ok: false, code: 'REQUEST_ALREADY_PENDING' };
    if (cycles < capability.minCycles || cycles > capability.maxCycles) return { ok: false, code: 'CYCLES_OUT_OF_RANGE' };
    if (conflictingDateChangeExists) return { ok: false, code: 'SCHEDULING_CONFLICT' };
    return { ok: true, status: PauseRequestStatus.PENDING_PROVIDER_APPROVAL };
  };

  PauseEngine.resolvePauseDecision = function (capability) {
    if (!capability) return { outcome: 'reject', reason: 'This SIP no longer has an active pause capability on record.' };
    if (capability.simulatedPauseDecision === 'reject') {
      return { outcome: 'reject', reason: capability.rejectionReason || 'The provider did not approve this pause request for the current cycle.' };
    }
    if (capability.simulatedPauseDecision === 'pending') return { outcome: 'pending' };
    return { outcome: 'approve' };
  };

  PauseEngine.checkEarlyResumeEligibility = function (capability, lifecycle) {
    if (lifecycle !== SipLifecycleStatus.PAUSED) return { ok: false, code: 'NOT_PAUSED' };
    if (!capability || !capability.earlyResumeSupported) return { ok: false, code: 'NOT_SUPPORTED' };
    return { ok: true };
  };

  PauseEngine.resolveResumeDecision = function (capability) {
    if (!capability) return { outcome: 'reject', reason: 'This SIP no longer has an active resume capability on record.' };
    if (capability.simulatedResumeDecision === 'reject') {
      return { outcome: 'reject', reason: capability.resumeRejectionReason || 'The provider could not confirm this resume request right now.' };
    }
    if (capability.simulatedResumeDecision === 'pending') return { outcome: 'pending' };
    return { outcome: 'approve' };
  };

  PauseEngine.scheduleEntryStatus = function (pauseRequest, dateKey) {
    if (!pauseRequest) return ScheduleEntryStatus.SCHEDULED;
    if (pauseRequest.protectedDateKey === dateKey) return ScheduleEntryStatus.PROCESSING_PROTECTED;
    if (pauseRequest.affectedDateKeys && pauseRequest.affectedDateKeys.indexOf(dateKey) !== -1) return ScheduleEntryStatus.SKIPPED_PAUSED;
    return ScheduleEntryStatus.SCHEDULED;
  };

  // ───────────────────────── PauseStore (stateful) ─────────────────────────
  var STORAGE_KEY = 'indmoney_pause_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }
  function isoNoonFromKey(key) { return key + 'T12:00:00.000Z'; }

  function defaultState() {
    return {
      version: 1, demoClockOffsetDays: 0, focusedScenarioId: 'pause-a',
      lifecycle: {}, capabilities: {}, pauseRequests: [], resumeRequests: [],
      lifecycleEvents: [], notifications: [], analyticsEvents: [],
      inFlight: {}, usedIdempotencyKeys: {}, settings: { reminderOptIn: true },
      firstPostResumeInstalment: {}
    };
  }

  function PauseStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.schedulingStore = opts.schedulingStore || null;
    this.state = null;
  }

  PauseStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) { try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); } }
    else { this.state = defaultState(); }
    this.ensureSeeded();
    this.save();
    return this.state;
  };
  PauseStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };
  PauseStore.prototype.ensureLoaded = function () { if (!this.state) this.load(); return this.state; };
  PauseStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.ensureSeeded();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };
  PauseStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
  };

  // ── demo clock ──
  PauseStore.prototype.getDemoToday = function () {
    var state = this.ensureLoaded();
    return DateUtils.addDays(DateUtils.todayKey(), state.demoClockOffsetDays || 0);
  };
  PauseStore.prototype.advanceDemoClock = function (days) {
    var state = this.ensureLoaded();
    state.demoClockOffsetDays = (state.demoClockOffsetDays || 0) + days;
    this.save();
    this.runScheduledSweep();
    return this.getDemoToday();
  };

  // ── seeding ──
  PauseStore.prototype.ensureSeeded = function () {
    if (!this.recoveryStore) return;
    var self = this;
    Data.buildScenarios().forEach(function (sc) {
      var sipId = sc.sipId;
      if (sc.newSip) {
        self.recoveryStore.registerSip(sc.newSip);
        self.recoveryStore.registerMandate(Data.makeMandateFor(sipId));
      }
      if (sc.newInstalment) {
        var today = self.getDemoToday();
        var p = DateUtils.parseKey(today);
        var scheduledKey = DateUtils.keyForDayInMonth(p.year, p.month0, sc.newSip ? sc.newSip.scheduledDay : self.recoveryStore.getSip(sipId).scheduledDay);
        var inst = Object.assign({
          sipId: sipId, scheduledDate: isoNoonFromKey(scheduledKey), retryPermitted: false, recoveryAvailable: false,
          attemptSeq: 1, statusCheckCount: 0, everFailed: false, failedAt: null, recoveredAt: null
        }, sc.newInstalment);
        self.recoveryStore.registerInstalment(inst);
      }
      if (!self.state.capabilities[sipId]) self.state.capabilities[sipId] = sc.capability;
      if (!self.state.lifecycle[sipId]) self.state.lifecycle[sipId] = SipLifecycleStatus.ACTIVE;

      if (sc.seedConflictingDateChange && self.schedulingStore) {
        var open = self.schedulingStore.getOpenRequestsForSip(sipId);
        if (!open.length) self.schedulingStore.submitDateChangeRequest(sipId, sc.seedConflictingDateChange.requestedDay);
      }

      if (sc.preSeed) self.seedPauseLifecycle(sc, sipId);
    });
  };

  PauseStore.prototype.seedPauseLifecycle = function (sc, sipId) {
    var id = 'pause-req-' + sc.id + '-seed';
    if (this.getPauseRequest(id)) return;
    var capability = this.state.capabilities[sipId];
    var sip = this.recoveryStore.getSip(sipId);
    var cycles = sc.preSeed.pauseCycles;
    var elapsed = sc.preSeed.pauseElapsedCycles || 0;
    var refToday = DateUtils.addMonths(this.getDemoToday(), -elapsed, sip.scheduledDay);
    var schedule = PauseEngine.computePauseSchedule(capability, cycles, refToday, sip.scheduledDay, null);
    var request = {
      id: id, sipId: sipId, idempotencyKey: id, requestedCycles: cycles,
      status: PauseRequestStatus.EFFECTIVE, submittedAt: isoNoonFromKey(refToday), decisionAt: isoNoonFromKey(refToday),
      effectiveDate: schedule.affectedDateKeys[0], affectedDateKeys: schedule.affectedDateKeys,
      protectedDateKey: schedule.protectedDateKey, resumeDateKey: schedule.resumeDateKey,
      approvalRequired: capability.approvalRequired, rejectionReason: null, cancelledAt: null
    };
    this.state.pauseRequests.push(request);
    this.state.lifecycle[sipId] = SipLifecycleStatus.PAUSED;
    this.logLifecycleEvent(sipId, 'pause_effective_seeded', { requestId: id });

    if (sc.preSeed.alreadyResumed) {
      var resumeId = 'resume-req-' + sc.id + '-seed';
      var resumeReq = {
        id: resumeId, sipId: sipId, pauseRequestId: id, type: 'scheduled', idempotencyKey: resumeId,
        status: ResumeRequestStatus.EFFECTIVE, submittedAt: isoNoonFromKey(refToday), decisionAt: isoNoonFromKey(refToday),
        requestedResumeDate: schedule.resumeDateKey, effectiveDate: schedule.resumeDateKey, reauthCompletedAt: null, rejectionReason: null, cancelledAt: null
      };
      this.state.resumeRequests.push(resumeReq);
      this.state.lifecycle[sipId] = SipLifecycleStatus.ACTIVE;
      this.logLifecycleEvent(sipId, 'resume_effective_seeded', { requestId: resumeId });
      if (sc.preSeed.firstPostResumeInstalmentId) {
        this.state.firstPostResumeInstalment[sipId] = sc.preSeed.firstPostResumeInstalmentId;
      }
    }
  };

  /**
   * Additive, parameterized seeding hook used by Feature 4 (AutoPay Health
   * & Mandate Repair) so its own "paused SIP" demo scenario starts in a
   * real, EFFECTIVE pause on Feature 3's own state — not a shadow copy of
   * it — without reaching into any of Feature 3's own scenario wiring.
   * Idempotent: a second call for the same sipId is a no-op.
   */
  PauseStore.prototype.seedExternalPause = function (sipId, cycles) {
    this.ensureLoaded();
    var id = 'pause-req-external-' + sipId;
    var existing = this.getPauseRequest(id);
    if (existing) return existing;
    var capability = this.getCapability(sipId) || {
      sipId: sipId, pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 0,
      approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
      resumeRequiresReauth: false, cancellationSupported: true,
      simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
      stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
    };
    this.state.capabilities[sipId] = capability;
    var sip = this.recoveryStore.getSip(sipId);
    var refToday = this.getDemoToday();
    var schedule = PauseEngine.computePauseSchedule(capability, cycles || 1, refToday, sip.scheduledDay, null);
    var request = {
      id: id, sipId: sipId, idempotencyKey: id, requestedCycles: cycles || 1,
      status: PauseRequestStatus.EFFECTIVE, submittedAt: new Date().toISOString(), decisionAt: new Date().toISOString(),
      effectiveDate: schedule.affectedDateKeys[0], affectedDateKeys: schedule.affectedDateKeys,
      protectedDateKey: schedule.protectedDateKey, resumeDateKey: schedule.resumeDateKey,
      approvalRequired: capability.approvalRequired, rejectionReason: null, cancelledAt: null
    };
    this.state.pauseRequests.push(request);
    this.state.lifecycle[sipId] = SipLifecycleStatus.PAUSED;
    this.logLifecycleEvent(sipId, 'pause_effective_seeded', { requestId: id });
    this.save();
    return request;
  };

  // ── capability / lifecycle / schedule ──
  PauseStore.prototype.getCapability = function (sipId) { return this.ensureLoaded().capabilities[sipId] || null; };
  PauseStore.prototype.getLifecycle = function (sipId) { return this.ensureLoaded().lifecycle[sipId] || SipLifecycleStatus.ACTIVE; };
  PauseStore.prototype.getAllPauseEligibleSips = function () {
    this.ensureLoaded();
    return this.recoveryStore.getAllSips().filter(function (s) { return true; });
  };
  PauseStore.prototype.logLifecycleEvent = function (sipId, type, meta) {
    this.ensureLoaded().lifecycleEvents.push({ id: Data.uid('evt'), sipId: sipId, type: type, at: new Date().toISOString(), meta: meta || {} });
  };
  PauseStore.prototype.getLifecycleEvents = function (sipId) {
    return this.ensureLoaded().lifecycleEvents.filter(function (e) { return e.sipId === sipId; });
  };

  PauseStore.prototype.getNextRealInstalmentInfo = function (sipId) {
    var sip = this.recoveryStore.getSip(sipId);
    if (!sip) return null;
    var instalments = this.recoveryStore.getInstalmentsForSip(sipId);
    var today = this.getDemoToday();
    var p = DateUtils.parseKey(today);
    var thisMonthKey = DateUtils.keyForDayInMonth(p.year, p.month0, sip.scheduledDay);
    var pendingThisMonth = instalments.find(function (i) {
      var dt = new Date(i.scheduledDate);
      return i.status === 'pending' && dt.getFullYear() === p.year && dt.getMonth() === p.month0;
    });
    if (pendingThisMonth) return { dateKey: thisMonthKey, isProcessing: true };
    return { dateKey: thisMonthKey, isProcessing: false };
  };

  PauseStore.prototype.previewPauseSchedule = function (sipId, cycles) {
    var capability = this.getCapability(sipId);
    var sip = this.recoveryStore.getSip(sipId);
    var protectedInfo = this.getNextRealInstalmentInfo(sipId);
    return PauseEngine.computePauseSchedule(capability, cycles, this.getDemoToday(), sip.scheduledDay, protectedInfo);
  };

  // ── pause requests ──
  PauseStore.prototype.getPauseRequest = function (id) { return this.ensureLoaded().pauseRequests.find(function (r) { return r.id === id; }) || null; };
  PauseStore.prototype.getPauseRequestsForSip = function (sipId) {
    return this.ensureLoaded().pauseRequests.filter(function (r) { return r.sipId === sipId; })
      .sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
  };
  PauseStore.prototype.getOpenPauseRequestsForSip = function (sipId) {
    return this.getPauseRequestsForSip(sipId).filter(function (r) { return Data.OPEN_PAUSE_STATUSES.indexOf(r.status) !== -1; });
  };
  PauseStore.prototype.getActivePauseRequestForSip = function (sipId) {
    var open = this.getPauseRequestsForSip(sipId).filter(function (r) { return r.status === PauseRequestStatus.EFFECTIVE; });
    return open.length ? open[open.length - 1] : null;
  };
  PauseStore.prototype.isInFlight = function (key) { return !!this.ensureLoaded().inFlight[key]; };
  PauseStore.prototype.beginRequest = function (key) { this.ensureLoaded().inFlight[key] = true; this.save(); };
  PauseStore.prototype.endRequest = function (key) { delete this.ensureLoaded().inFlight[key]; this.save(); };

  PauseStore.prototype.submitPauseRequest = function (sipId, cycles) {
    var state = this.ensureLoaded();
    if (this.isInFlight('pause:' + sipId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest('pause:' + sipId);
    try {
      var capability = this.getCapability(sipId);
      var openPause = this.getOpenPauseRequestsForSip(sipId);
      var conflict = this.schedulingStore ? this.schedulingStore.getOpenRequestsForSip(sipId).length > 0 : false;
      var result = PauseEngine.submitPause(capability, cycles, openPause.length > 0, conflict);
      if (!result.ok) return result;

      var idempotencyKey = sipId + '-pause-' + (this.getPauseRequestsForSip(sipId).length + 1);
      if (state.usedIdempotencyKeys[idempotencyKey]) return { ok: false, code: 'DUPLICATE_REQUEST' };
      state.usedIdempotencyKeys[idempotencyKey] = true;

      var request = {
        id: Data.uid('pausereq'), sipId: sipId, idempotencyKey: idempotencyKey, requestedCycles: cycles,
        status: result.status, submittedAt: new Date().toISOString(), decisionAt: null,
        effectiveDate: null, affectedDateKeys: [], protectedDateKey: null, resumeDateKey: null,
        approvalRequired: capability.approvalRequired, rejectionReason: null, cancelledAt: null
      };
      state.pauseRequests.push(request);
      state.lifecycle[sipId] = SipLifecycleStatus.PAUSE_REQUESTED;
      this.logLifecycleEvent(sipId, 'pause_request_submitted', { requestId: request.id, cycles: cycles });
      this.addNotification('pause_received', sipId, request, 'Your SIP pause request has been submitted and is awaiting a decision.');
      this.emit('sip_pause_request_submitted', { sipId: sipId, requestId: request.id, cycles: cycles });
      this.save();
      return { ok: true, request: request };
    } finally {
      this.endRequest('pause:' + sipId);
    }
  };

  PauseStore.prototype.checkPauseStatus = function (requestId) {
    var request = this.getPauseRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);

    if (request.status === PauseRequestStatus.APPROVED) {
      if (request.effectiveDate && DateUtils.compareKeys(this.getDemoToday(), request.effectiveDate) >= 0) {
        this.applyPauseEffective(request);
        return { ok: true, status: PauseRequestStatus.EFFECTIVE, request: request };
      }
      return { ok: true, status: PauseRequestStatus.APPROVED, request: request };
    }
    if (request.status === PauseRequestStatus.PENDING_PROVIDER_APPROVAL) {
      var decision = PauseEngine.resolvePauseDecision(capability);
      if (decision.outcome === 'pending') return { ok: true, status: request.status, request: request };
      request.decisionAt = new Date().toISOString();
      if (decision.outcome === 'approve') {
        var sip = this.recoveryStore.getSip(request.sipId);
        var protectedInfo = this.getNextRealInstalmentInfo(request.sipId);
        var schedule = PauseEngine.computePauseSchedule(capability, request.requestedCycles, this.getDemoToday(), sip.scheduledDay, protectedInfo);
        request.status = PauseRequestStatus.APPROVED;
        request.affectedDateKeys = schedule.affectedDateKeys;
        request.protectedDateKey = schedule.protectedDateKey;
        request.resumeDateKey = schedule.resumeDateKey;
        request.effectiveDate = schedule.affectedDateKeys[0];
        this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'pause_received'; });
        this.addNotification('pause_approved', request.sipId, request, 'Your SIP pause request was approved.');
        this.emit('sip_pause_request_approved', { sipId: request.sipId, requestId: request.id, effectiveDate: request.effectiveDate });
        this.logLifecycleEvent(request.sipId, 'pause_request_approved', { requestId: request.id });
      } else {
        request.status = PauseRequestStatus.REJECTED;
        request.rejectionReason = decision.reason;
        this.state.lifecycle[request.sipId] = SipLifecycleStatus.ACTIVE;
        this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'pause_received'; });
        this.addNotification('pause_rejected', request.sipId, request, 'Your SIP pause request was not approved. ' + decision.reason);
        this.emit('sip_pause_request_rejected', { sipId: request.sipId, requestId: request.id, reason: decision.reason });
        this.logLifecycleEvent(request.sipId, 'pause_request_rejected', { requestId: request.id });
      }
      this.save();
      return { ok: true, status: request.status, request: request };
    }
    return { ok: true, status: request.status, request: request };
  };

  PauseStore.prototype.applyPauseEffective = function (request) {
    request.status = PauseRequestStatus.EFFECTIVE;
    request.effectiveAppliedAt = new Date().toISOString();
    this.state.lifecycle[request.sipId] = SipLifecycleStatus.PAUSED;
    this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'pause_approved'; });
    this.addNotification('pause_effective', request.sipId, request, 'Your SIP pause is now in effect.');
    this.emit('sip_pause_effective', { sipId: request.sipId, requestId: request.id });
    this.logLifecycleEvent(request.sipId, 'pause_effective', { requestId: request.id });
    this.save();
  };

  PauseStore.prototype.cancelPauseRequest = function (requestId) {
    var request = this.getPauseRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);
    if (!capability || !capability.cancellationSupported) return { ok: false, code: 'CANCELLATION_NOT_SUPPORTED' };
    if (Data.CANCELLABLE_PAUSE_STATUSES.indexOf(request.status) === -1) return { ok: false, code: 'NOT_CANCELLABLE' };
    request.status = PauseRequestStatus.CANCELLED;
    request.cancelledAt = new Date().toISOString();
    this.state.lifecycle[request.sipId] = SipLifecycleStatus.ACTIVE;
    this.removeNotifications(function (n) { return n.requestId === request.id; });
    this.logLifecycleEvent(request.sipId, 'pause_request_cancelled', { requestId: request.id });
    this.save();
    return { ok: true, request: request };
  };

  // ── early / scheduled resume ──
  PauseStore.prototype.getResumeRequest = function (id) { return this.ensureLoaded().resumeRequests.find(function (r) { return r.id === id; }) || null; };
  PauseStore.prototype.getResumeRequestsForSip = function (sipId) {
    return this.ensureLoaded().resumeRequests.filter(function (r) { return r.sipId === sipId; })
      .sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
  };
  PauseStore.prototype.getOpenResumeRequestsForSip = function (sipId) {
    return this.getResumeRequestsForSip(sipId).filter(function (r) { return Data.OPEN_RESUME_STATUSES.indexOf(r.status) !== -1; });
  };

  PauseStore.prototype.requestEarlyResume = function (sipId) {
    if (this.isInFlight('resume:' + sipId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest('resume:' + sipId);
    try {
      var capability = this.getCapability(sipId);
      var lifecycle = this.getLifecycle(sipId);
      var eligible = PauseEngine.checkEarlyResumeEligibility(capability, lifecycle);
      if (!eligible.ok) return eligible;
      if (this.getOpenResumeRequestsForSip(sipId).length) return { ok: false, code: 'REQUEST_ALREADY_PENDING' };

      var pauseRequest = this.getActivePauseRequestForSip(sipId);
      var initialStatus = capability.resumeRequiresReauth ? ResumeRequestStatus.REQUIRES_REAUTHORIZATION : ResumeRequestStatus.PENDING_PROVIDER_APPROVAL;
      var request = {
        id: Data.uid('resumereq'), sipId: sipId, pauseRequestId: pauseRequest ? pauseRequest.id : null, type: 'early',
        idempotencyKey: sipId + '-resume-' + (this.getResumeRequestsForSip(sipId).length + 1),
        status: initialStatus, submittedAt: new Date().toISOString(), decisionAt: null,
        requestedResumeDate: this.getDemoToday(), effectiveDate: null, reauthCompletedAt: null, rejectionReason: null, cancelledAt: null
      };
      this.state.resumeRequests.push(request);
      this.state.lifecycle[sipId] = initialStatus === ResumeRequestStatus.REQUIRES_REAUTHORIZATION ? SipLifecycleStatus.PROVIDER_ACTION_REQUIRED : SipLifecycleStatus.RESUME_REQUESTED;
      this.logLifecycleEvent(sipId, 'early_resume_requested', { requestId: request.id });
      this.emit('sip_early_resume_requested', { sipId: sipId, requestId: request.id });
      this.save();
      return { ok: true, request: request };
    } finally {
      this.endRequest('resume:' + sipId);
    }
  };

  PauseStore.prototype.completeResumeReauthorization = function (requestId) {
    var request = this.getResumeRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    if (request.status !== ResumeRequestStatus.REQUIRES_REAUTHORIZATION) return { ok: false, code: 'INVALID_STATE' };
    request.status = ResumeRequestStatus.PENDING_PROVIDER_APPROVAL;
    request.reauthCompletedAt = new Date().toISOString();
    this.state.lifecycle[request.sipId] = SipLifecycleStatus.RESUME_REQUESTED;
    this.save();
    return { ok: true, request: request };
  };

  PauseStore.prototype.checkResumeStatus = function (requestId) {
    var request = this.getResumeRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);

    if (request.status === ResumeRequestStatus.APPROVED) {
      if (request.effectiveDate && DateUtils.compareKeys(this.getDemoToday(), request.effectiveDate) >= 0) {
        this.applyResumeEffective(request);
        return { ok: true, status: ResumeRequestStatus.EFFECTIVE, request: request };
      }
      return { ok: true, status: ResumeRequestStatus.APPROVED, request: request };
    }
    if (request.status === ResumeRequestStatus.PENDING_PROVIDER_APPROVAL) {
      var decision = PauseEngine.resolveResumeDecision(capability);
      if (decision.outcome === 'pending') return { ok: true, status: request.status, request: request };
      request.decisionAt = new Date().toISOString();
      if (decision.outcome === 'approve') {
        request.status = ResumeRequestStatus.APPROVED;
        request.effectiveDate = request.type === 'early' ? DateUtils.addDays(this.getDemoToday(), 1) : this.getDemoToday();
        this.emit('sip_resume_approved', { sipId: request.sipId, requestId: request.id });
        this.logLifecycleEvent(request.sipId, 'resume_approved', { requestId: request.id });
      } else {
        request.status = ResumeRequestStatus.REJECTED;
        request.rejectionReason = decision.reason;
        this.state.lifecycle[request.sipId] = SipLifecycleStatus.PAUSED;
        this.logLifecycleEvent(request.sipId, 'resume_rejected', { requestId: request.id });
      }
      this.save();
      return { ok: true, status: request.status, request: request };
    }
    return { ok: true, status: request.status, request: request };
  };

  PauseStore.prototype.applyResumeEffective = function (request) {
    request.status = ResumeRequestStatus.EFFECTIVE;
    request.effectiveAppliedAt = new Date().toISOString();
    this.state.lifecycle[request.sipId] = SipLifecycleStatus.ACTIVE;
    this.removeNotifications(function (n) { return n.sipId === request.sipId && (n.type === 'resume_upcoming' || n.type === 'resume_reauth_required'); });
    this.addNotification('resume_effective', request.sipId, request, 'Your SIP has resumed. It is now active again.');
    this.emit('sip_resume_effective', { sipId: request.sipId, requestId: request.id });
    this.logLifecycleEvent(request.sipId, 'resume_effective', { requestId: request.id });

    if (!this.state.firstPostResumeInstalment[request.sipId]) {
      var sip = this.recoveryStore.getSip(request.sipId);
      var instId = 'inst-postresume-' + request.sipId + '-' + request.id;
      var p = DateUtils.parseKey(this.getDemoToday());
      var dateKey = DateUtils.keyForDayInMonth(p.year, p.month0, sip.scheduledDay);
      this.recoveryStore.registerInstalment({
        id: instId, sipId: request.sipId, amount: sip.amount, status: 'pending', failureReason: null,
        scheduledDate: isoNoonFromKey(dateKey), retryPermitted: false, recoveryAvailable: false,
        attemptSeq: 1, statusCheckCount: 0, everFailed: false, failedAt: null, recoveredAt: null
      });
      this.state.firstPostResumeInstalment[request.sipId] = instId;
    }
    this.save();
  };

  PauseStore.prototype.getFirstPostResumeStatus = function (sipId) {
    var instId = this.ensureLoaded().firstPostResumeInstalment[sipId];
    if (!instId) return null;
    var inst = this.recoveryStore.getInstalment(instId);
    return inst ? { instalmentId: instId, status: inst.status } : null;
  };

  // ── scheduled resume sweep (DemoClock) ──
  PauseStore.prototype.runScheduledSweep = function () {
    var self = this;
    var today = this.getDemoToday();
    this.state.pauseRequests.forEach(function (req) {
      if (req.status === PauseRequestStatus.APPROVED && req.effectiveDate && DateUtils.compareKeys(today, req.effectiveDate) >= 0) {
        self.applyPauseEffective(req);
      }
    });
    this.state.pauseRequests.forEach(function (req) {
      if (req.status !== PauseRequestStatus.EFFECTIVE) return;
      if (self.getLifecycle(req.sipId) !== SipLifecycleStatus.PAUSED) return;
      if (!req.resumeDateKey || DateUtils.compareKeys(today, req.resumeDateKey) < 0) return;
      if (self.getOpenResumeRequestsForSip(req.sipId).length) return;

      var capability = self.getCapability(req.sipId);
      var initialStatus = capability.resumeRequiresReauth ? ResumeRequestStatus.REQUIRES_REAUTHORIZATION : ResumeRequestStatus.APPROVED;
      var request = {
        id: Data.uid('resumereq'), sipId: req.sipId, pauseRequestId: req.id, type: 'scheduled',
        idempotencyKey: req.sipId + '-scheduled-resume-' + req.id,
        status: initialStatus, submittedAt: new Date().toISOString(), decisionAt: new Date().toISOString(),
        requestedResumeDate: req.resumeDateKey, effectiveDate: initialStatus === ResumeRequestStatus.APPROVED ? req.resumeDateKey : null,
        reauthCompletedAt: null, rejectionReason: null, cancelledAt: null
      };
      self.state.resumeRequests.push(request);
      if (initialStatus === ResumeRequestStatus.REQUIRES_REAUTHORIZATION) {
        self.state.lifecycle[req.sipId] = SipLifecycleStatus.PROVIDER_ACTION_REQUIRED;
        self.addNotification('resume_reauth_required', req.sipId, request, 'Your SIP is due to resume, but reauthorization is needed first.');
        self.logLifecycleEvent(req.sipId, 'scheduled_resume_requires_reauth', { requestId: request.id });
        self.save();
      } else {
        self.state.lifecycle[req.sipId] = SipLifecycleStatus.RESUME_SCHEDULED;
        self.logLifecycleEvent(req.sipId, 'scheduled_resume_created', { requestId: request.id });
        self.save();
        self.applyResumeEffective(request);
      }
    });
    this.save();
  };

  // ── notifications ──
  PauseStore.prototype.addNotification = function (type, sipId, request, message) {
    var state = this.ensureLoaded();
    var dedupeKey = type + ':' + (request ? request.id : sipId);
    if (state.notifications.some(function (n) { return n.dedupeKey === dedupeKey; })) return null;
    var n = {
      id: Data.uid('pause-notif'), type: type, sipId: sipId, requestId: request ? request.id : null,
      dedupeKey: dedupeKey, message: message, createdAt: new Date().toISOString(), read: false
    };
    state.notifications.unshift(n);
    this.save();
    return n;
  };
  PauseStore.prototype.removeNotifications = function (predicate) {
    var state = this.ensureLoaded();
    state.notifications = state.notifications.filter(function (n) { return !predicate(n); });
    this.save();
  };
  PauseStore.prototype.getNotifications = function () {
    return this.ensureLoaded().notifications.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  };
  PauseStore.prototype.getUnreadCount = function () { return this.ensureLoaded().notifications.filter(function (n) { return !n.read; }).length; };
  PauseStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  PauseStore.prototype.markAllNotificationsRead = function () { this.ensureLoaded().notifications.forEach(function (n) { n.read = true; }); this.save(); };
  PauseStore.prototype.setReminderOptIn = function (val) { this.ensureLoaded().settings.reminderOptIn = !!val; this.save(); };

  // ── scenarios ──
  PauseStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  PauseStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  PauseStore.prototype.setFocusedScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    var sc = Data.buildScenarios().find(function (s) { return s.id === scenarioId; });
    if (!sc) return;
    state.focusedScenarioId = scenarioId;
    this.save();
  };

  return { PauseEngine: PauseEngine, PauseStore: PauseStore };
});
