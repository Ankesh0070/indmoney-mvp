/**
 * AutoPay Health & Mandate Repair Assistant — mock provider engine (pure) +
 * persisted store. Reads/writes SIP, mandate and instalment records through
 * the shared RecoveryStore (Feature 1) via its additive registerSip/
 * registerMandate/registerInstalment/updateMandateStatus API only; reads
 * Feature 2's SchedulingStore and calls Feature 3's additive
 * PauseStore.seedExternalPause only for the paused-SIP demo scenario. This
 * file never touches any other feature's own state machine.
 *
 * The scenario `capability` objects (mandate/data.js) are the immutable
 * mock-provider rulebook; everything about the mandate's actual, current,
 * live state lives in this store's own `repairedOverrides` / request /
 * event records — the "authoritative simulated mandate state" the spec
 * asks be kept separate from any UI presentation state.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.MandateData, window.SchedulingDateUtils);
    window.MandateEngine = out.MandateEngine;
    window.MandateStore = out.MandateStore;
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var MandateHealthStatus = Data.MandateHealthStatus;
  var MandateIssueType = Data.MandateIssueType;
  var RepairRequestStatus = Data.RepairRequestStatus;
  var ReplacementStatus = Data.ReplacementStatus;
  var AuthorizationOutcome = Data.AuthorizationOutcome;

  // ───────────────────────── MandateEngine (pure) ─────────────────────────
  var MandateEngine = {};

  /** Derives the user-facing health status + whether action is required, purely from the capability's diagnostic issueType. */
  MandateEngine.checkMandateHealth = function (capability, override) {
    var issueType = override ? override.issueType : capability.issueType;
    var status = Data.ISSUE_TO_STATUS[issueType] || MandateHealthStatus.UNKNOWN;
    var isInsufficientBalance = issueType === MandateIssueType.INSUFFICIENT_BALANCE;
    var isHealthy = issueType === MandateIssueType.HEALTHY || isInsufficientBalance;
    return { issueType: issueType, status: status, actionRequired: !isHealthy, isMandateProblem: !isInsufficientBalance };
  };

  var EXPLANATIONS = {};
  EXPLANATIONS[MandateIssueType.EXPIRED] = { title: 'AutoPay authorization expired', message: 'Your AutoPay authorization is no longer valid. Your next automatic SIP payment may not be processed until authorization is restored.' };
  EXPLANATIONS[MandateIssueType.REVOKED] = { title: 'AutoPay authorization was revoked', message: 'This payment authorization was cancelled. You can review whether a new authorization is available.' };
  EXPLANATIONS[MandateIssueType.REJECTED] = { title: 'Authorization not approved', message: 'The bank or payment provider did not approve this authorization.' };
  EXPLANATIONS[MandateIssueType.PENDING] = { title: 'Authorization in progress', message: 'Your authorization request is still being processed.' };
  EXPLANATIONS[MandateIssueType.SUSPENDED] = { title: 'AutoPay suspended', message: 'Your payment provider has temporarily suspended this authorization. A repair may restore it.' };
  EXPLANATIONS[MandateIssueType.AUTH_MISMATCH] = { title: 'Authorization details don’t match', message: 'We found a mismatch in your payment authorization details that needs to be reviewed before this SIP can continue automatically.' };
  EXPLANATIONS[MandateIssueType.PROVIDER_DELAY] = { title: 'Provider verification delayed', message: 'We could not verify your AutoPay status right now. This reflects a provider-side delay, not a change to your authorization.' };
  EXPLANATIONS[MandateIssueType.UNKNOWN_STATE] = { title: 'Status could not be verified', message: 'We could not verify your AutoPay status right now.' };
  EXPLANATIONS[MandateIssueType.HEALTHY] = { title: 'AutoPay is active', message: 'Your AutoPay authorization is active and in good standing.' };
  EXPLANATIONS[MandateIssueType.INSUFFICIENT_BALANCE] = { title: 'This isn’t a mandate problem', message: 'Your AutoPay authorization is active. The recent instalment failure was due to available balance at the time of debit, not your authorization.' };
  MandateEngine.explanationFor = function (issueType) { return EXPLANATIONS[issueType] || EXPLANATIONS[MandateIssueType.UNKNOWN_STATE]; };

  /** Which repair actions this mock provider capability actually supports right now. Never offers an action the capability doesn't declare. */
  MandateEngine.availableRepairActions = function (capability, health) {
    var actions = [];
    if (!health.actionRequired) return actions;
    if (capability.reauthSupported) actions.push(Data.RepairType.REAUTHORIZATION);
    if (capability.replacementSupported) actions.push(Data.RepairType.REPLACEMENT);
    return actions;
  };

  MandateEngine.submitRepair = function (capability, type, openRequestExists) {
    if (!capability) return { ok: false, code: 'NOT_FOUND' };
    if (type === Data.RepairType.REAUTHORIZATION && !capability.reauthSupported) return { ok: false, code: 'NOT_SUPPORTED' };
    if (type === Data.RepairType.REPLACEMENT && !capability.replacementSupported) return { ok: false, code: 'NOT_SUPPORTED' };
    if (openRequestExists) return { ok: false, code: 'REQUEST_ALREADY_PENDING' };
    return { ok: true };
  };

  var DECISION_TO_OUTCOME = {
    approve: AuthorizationOutcome.APPROVED, reject: AuthorizationOutcome.REJECTED,
    pending: AuthorizationOutcome.PENDING, expired: AuthorizationOutcome.EXPIRED,
    provider_unavailable: AuthorizationOutcome.PROVIDER_UNAVAILABLE
  };
  /** Maps a reauthorization capability's deterministic decision onto the shared AuthorizationOutcome vocabulary. */
  MandateEngine.resolveAuthorizationOutcome = function (capability) {
    return DECISION_TO_OUTCOME[capability.simulatedReauthDecision] || AuthorizationOutcome.APPROVED;
  };
  /** Same vocabulary, for the replacement flow's own authorization step. */
  MandateEngine.resolveReplacementOutcome = function (capability) {
    return DECISION_TO_OUTCOME[capability.simulatedReplacementDecision] || AuthorizationOutcome.APPROVED;
  };

  // ───────────────────────── MandateStore (stateful) ─────────────────────────
  var STORAGE_KEY = 'indmoney_mandate_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }

  function defaultState() {
    return {
      version: 1, demoClockOffsetDays: 0, focusedScenarioId: 'mandate-a',
      capabilities: {}, repairedOverrides: {}, repairRequests: [], authorizationAttempts: [],
      replacementRequests: [], statusEvents: [], notifications: [], analyticsEvents: [],
      inFlight: {}, usedIdempotencyKeys: {}, settings: { reminderOptIn: true }
    };
  }

  function MandateStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.schedulingStore = opts.schedulingStore || null;
    this.pauseStore = opts.pauseStore || null;
    this.state = null;
  }

  MandateStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) { try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); } }
    else { this.state = defaultState(); }
    this.ensureSeeded();
    this.save();
    return this.state;
  };
  MandateStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };
  MandateStore.prototype.ensureLoaded = function () { if (!this.state) this.load(); return this.state; };
  MandateStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.ensureSeeded();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };
  MandateStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
  };

  // ── demo clock ──
  MandateStore.prototype.getDemoToday = function () {
    var state = this.ensureLoaded();
    return DateUtils.addDays(DateUtils.todayKey(), state.demoClockOffsetDays || 0);
  };
  MandateStore.prototype.advanceDemoClock = function (days) {
    var state = this.ensureLoaded();
    state.demoClockOffsetDays = (state.demoClockOffsetDays || 0) + days;
    this.save();
    this.runScheduledChecks();
    return this.getDemoToday();
  };

  // ── seeding ──
  MandateStore.prototype.ensureSeeded = function () {
    if (!this.recoveryStore) return;
    var self = this;
    Data.buildScenarios().forEach(function (sc) {
      var sipId = sc.sipId;
      if (sc.newSip) {
        sc.newSip.mandateId = 'mandate-' + sipId;
        self.recoveryStore.registerSip(sc.newSip);
        self.recoveryStore.registerMandate(Data.makeMandateFor(sipId, sc.newSip.fundName.split(' ')[0] + ' Bank ••0000'));
      }
      if (sc.newInstalment) {
        var p = DateUtils.parseKey(self.getDemoToday());
        var scheduledKey = DateUtils.keyForDayInMonth(p.year, p.month0, sc.newSip.scheduledDay);
        var inst = Object.assign({
          sipId: sipId, scheduledDate: scheduledKey + 'T12:00:00.000Z', retryPermitted: true, recoveryAvailable: true,
          attemptSeq: 1, statusCheckCount: 0, everFailed: true, failedAt: new Date().toISOString(), recoveredAt: null
        }, sc.newInstalment);
        self.recoveryStore.registerInstalment(inst);
      }
      if (!self.state.capabilities[sipId]) self.state.capabilities[sipId] = sc.capability;

      if (sc.seedPaused && self.pauseStore) self.pauseStore.seedExternalPause(sipId, 1);
      if (sc.seedOpenRepair) self.seedOpenRepairRequest(sc, sipId);
      if (sc.seedApprovedReplacement) self.seedApprovedReplacement(sc, sipId);
      if (sc.seedRepaired) self.seedRepaired(sc, sipId);
    });
  };

  MandateStore.prototype.seedOpenRepairRequest = function (sc, sipId) {
    var id = 'repair-req-' + sc.id + '-seed';
    if (this.getRepairRequest(id)) return;
    var request = {
      id: id, sipId: sipId, type: Data.RepairType.REAUTHORIZATION, idempotencyKey: id,
      status: RepairRequestStatus.REPAIR_REQUESTED, submittedAt: new Date().toISOString(), decisionAt: null,
      authorizationAttemptId: null, replacementRequestId: null, rejectionReason: null, cancelledAt: null
    };
    this.state.repairRequests.push(request);
    this.logStatusEvent(sipId, 'repair_requested', { requestId: id });
  };

  MandateStore.prototype.seedApprovedReplacement = function (sc, sipId) {
    var requestId = 'repair-req-' + sc.id + '-seed';
    var replacementId = 'replacement-' + sc.id + '-seed';
    if (this.getRepairRequest(requestId)) return;
    var capability = this.state.capabilities[sipId];
    var effectiveAt = DateUtils.addDays(this.getDemoToday(), capability.replacementEffectiveDelayDays || 10);
    var replacement = {
      id: replacementId, sipId: sipId, originalMandateId: 'mandate-' + sipId, idempotencyKey: replacementId,
      status: ReplacementStatus.APPROVED_NOT_EFFECTIVE, requestedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(), effectiveAt: effectiveAt, authorizationRequirement: 'Provider authorization already completed.'
    };
    this.state.replacementRequests.push(replacement);
    var request = {
      id: requestId, sipId: sipId, type: Data.RepairType.REPLACEMENT, idempotencyKey: requestId,
      status: RepairRequestStatus.PROVIDER_VERIFICATION_PENDING, submittedAt: new Date().toISOString(), decisionAt: new Date().toISOString(),
      authorizationAttemptId: null, replacementRequestId: replacementId, rejectionReason: null, cancelledAt: null
    };
    this.state.repairRequests.push(request);
    this.logStatusEvent(sipId, 'replacement_requested', { requestId: requestId, replacementId: replacementId });
    this.logStatusEvent(sipId, 'replacement_approved_not_effective', { replacementId: replacementId, effectiveAt: effectiveAt });
  };

  MandateStore.prototype.seedRepaired = function (sc, sipId) {
    var id = 'repair-req-' + sc.id + '-seed';
    if (this.getRepairRequest(id)) return;
    var request = {
      id: id, sipId: sipId, type: Data.RepairType.REAUTHORIZATION, idempotencyKey: id,
      status: RepairRequestStatus.REPAIRED, submittedAt: new Date().toISOString(), decisionAt: new Date().toISOString(),
      authorizationAttemptId: null, replacementRequestId: null, rejectionReason: null, cancelledAt: null
    };
    this.state.repairRequests.push(request);
    this.state.repairedOverrides[sipId] = { issueType: MandateIssueType.HEALTHY, verifiedAt: new Date().toISOString(), method: 'reauthorization' };
    this.recoveryStore.updateMandateStatus('mandate-' + sipId, 'active');
    this.logStatusEvent(sipId, 'repaired', { requestId: id });
  };

  // ── capability / health ──
  MandateStore.prototype.getCapability = function (sipId) { return this.ensureLoaded().capabilities[sipId] || null; };
  MandateStore.prototype.getMandateHealth = function (sipId) {
    var capability = this.getCapability(sipId);
    if (!capability) return null;
    var override = this.ensureLoaded().repairedOverrides[sipId] || null;
    var result = MandateEngine.checkMandateHealth(capability, override);
    result.sipId = sipId;
    result.capability = capability;
    result.verifiedAt = override ? override.verifiedAt : null;
    result.repairMethod = override ? override.method : null;
    return result;
  };
  /** Next scheduled debit date, respecting any approved Feature 2 date-change for this SIP. */
  MandateStore.prototype.getNextInstalmentDateKey = function (sipId) {
    var sip = this.recoveryStore.getSip(sipId);
    if (!sip) return null;
    var day = (this.schedulingStore && this.schedulingStore.getCurrentDebitDay) ? this.schedulingStore.getCurrentDebitDay(sipId) : sip.scheduledDay;
    var today = this.getDemoToday();
    var p = DateUtils.parseKey(today);
    var candidate = DateUtils.keyForDayInMonth(p.year, p.month0, day);
    if (DateUtils.compareKeys(candidate, today) < 0) candidate = DateUtils.addMonths(today, 1, day);
    return candidate;
  };

  MandateStore.prototype.getAllMandateSips = function () {
    this.ensureLoaded();
    var self = this;
    return this.recoveryStore.getAllSips().filter(function (s) { return !!self.state.capabilities[s.id]; });
  };

  MandateStore.prototype.logStatusEvent = function (sipId, type, meta) {
    this.ensureLoaded().statusEvents.push({ id: Data.uid('mevt'), sipId: sipId, type: type, at: new Date().toISOString(), meta: meta || {} });
  };
  MandateStore.prototype.getStatusEvents = function (sipId) {
    return this.ensureLoaded().statusEvents.filter(function (e) { return e.sipId === sipId; });
  };

  MandateStore.prototype.isInFlight = function (key) { return !!this.ensureLoaded().inFlight[key]; };
  MandateStore.prototype.beginRequest = function (key) { this.ensureLoaded().inFlight[key] = true; this.save(); };
  MandateStore.prototype.endRequest = function (key) { delete this.ensureLoaded().inFlight[key]; this.save(); };

  // ── repair requests ──
  MandateStore.prototype.getRepairRequest = function (id) { return this.ensureLoaded().repairRequests.find(function (r) { return r.id === id; }) || null; };
  MandateStore.prototype.getRepairRequestsForSip = function (sipId) {
    return this.ensureLoaded().repairRequests.filter(function (r) { return r.sipId === sipId; })
      .sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
  };
  MandateStore.prototype.getOpenRepairRequestsForSip = function (sipId) {
    return this.getRepairRequestsForSip(sipId).filter(function (r) { return Data.OPEN_REPAIR_STATUSES.indexOf(r.status) !== -1; });
  };

  MandateStore.prototype.submitRepairRequest = function (sipId, type) {
    var state = this.ensureLoaded();
    if (this.isInFlight('repair:' + sipId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest('repair:' + sipId);
    try {
      var capability = this.getCapability(sipId);
      var openRepair = this.getOpenRepairRequestsForSip(sipId);
      var result = MandateEngine.submitRepair(capability, type, openRepair.length > 0);
      if (!result.ok) return result;

      var idempotencyKey = sipId + '-repair-' + (this.getRepairRequestsForSip(sipId).length + 1);
      if (state.usedIdempotencyKeys[idempotencyKey]) return { ok: false, code: 'DUPLICATE_REQUEST' };
      state.usedIdempotencyKeys[idempotencyKey] = true;

      var request = {
        id: Data.uid('repairreq'), sipId: sipId, type: type, idempotencyKey: idempotencyKey,
        status: RepairRequestStatus.REPAIR_REQUESTED, submittedAt: new Date().toISOString(), decisionAt: null,
        authorizationAttemptId: null, replacementRequestId: null, rejectionReason: null, cancelledAt: null
      };
      state.repairRequests.push(request);
      this.logStatusEvent(sipId, 'repair_requested', { requestId: request.id, type: type });
      this.emit('mandate_repair_started', { sipId: sipId, requestId: request.id, type: type });
      this.emit(type === Data.RepairType.REAUTHORIZATION ? 'mandate_reauthorization_requested' : 'mandate_replacement_requested', { sipId: sipId, requestId: request.id });
      this.save();
      return { ok: true, request: request };
    } finally {
      this.endRequest('repair:' + sipId);
    }
  };

  MandateStore.prototype.cancelRepairRequest = function (requestId) {
    var request = this.getRepairRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    if (Data.CANCELLABLE_REPAIR_STATUSES.indexOf(request.status) === -1) return { ok: false, code: 'NOT_CANCELLABLE' };
    request.status = RepairRequestStatus.CANCELLED;
    request.cancelledAt = new Date().toISOString();
    this.removeNotifications(function (n) { return n.requestId === request.id; });
    this.logStatusEvent(request.sipId, 'repair_cancelled', { requestId: request.id });
    this.save();
    return { ok: true, request: request };
  };

  /** Screen 6: the simulated reauthorization/replacement-authorization step. One attempt per call, never auto-approved. */
  MandateStore.prototype.submitAuthorizationAttempt = function (requestId) {
    var request = this.getRepairRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    var capability = this.getCapability(request.sipId);
    var outcome = request.type === Data.RepairType.REPLACEMENT
      ? MandateEngine.resolveReplacementOutcome(capability)
      : MandateEngine.resolveAuthorizationOutcome(capability);

    var attempt = {
      id: Data.uid('authattempt'), repairRequestId: request.id, sipId: request.sipId, type: request.type,
      submittedAt: new Date().toISOString(), outcome: outcome, decidedAt: new Date().toISOString()
    };
    this.state.authorizationAttempts.push(attempt);
    request.authorizationAttemptId = attempt.id;
    this.logStatusEvent(request.sipId, 'authorization_attempt_submitted', { requestId: request.id, outcome: outcome });

    if (outcome === AuthorizationOutcome.APPROVED) {
      if (request.type === Data.RepairType.REPLACEMENT) {
        var replacement = {
          id: Data.uid('replacement'), sipId: request.sipId, originalMandateId: 'mandate-' + request.sipId,
          idempotencyKey: request.id + '-replacement', status: ReplacementStatus.AUTHORIZATION_PENDING,
          requestedAt: new Date().toISOString(), approvedAt: null, effectiveAt: null,
          authorizationRequirement: 'Provider authorization completed; verification in progress.'
        };
        this.state.replacementRequests.push(replacement);
        request.replacementRequestId = replacement.id;
        replacement.status = ReplacementStatus.APPROVED_NOT_EFFECTIVE;
        replacement.approvedAt = new Date().toISOString();
        var delay = capability.replacementEffectiveDelayDays || 0;
        replacement.effectiveAt = delay > 0 ? DateUtils.addDays(this.getDemoToday(), delay) : this.getDemoToday();
        this.logStatusEvent(request.sipId, 'replacement_approved_not_effective', { replacementId: replacement.id, effectiveAt: replacement.effectiveAt });
      }
      request.status = RepairRequestStatus.PROVIDER_VERIFICATION_PENDING;
      this.removeNotifications(function (n) { return n.requestId === request.id && n.type === 'authorization_pending'; });
      this.emit('mandate_reauthorization_approved', { sipId: request.sipId, requestId: request.id, type: request.type });
    } else if (outcome === AuthorizationOutcome.REJECTED) {
      request.status = RepairRequestStatus.REJECTED;
      request.rejectionReason = capability.rejectionReason || 'The provider did not approve this authorization request.';
      request.decisionAt = new Date().toISOString();
      this.addNotification('authorization_rejected', request.sipId, request, 'Your AutoPay authorization request was not approved. ' + request.rejectionReason);
      this.emit('mandate_reauthorization_rejected', { sipId: request.sipId, requestId: request.id, reason: request.rejectionReason });
      this.emit('mandate_repair_failed', { sipId: request.sipId, requestId: request.id, reason: 'rejected' });
      this.logStatusEvent(request.sipId, 'rejected', { requestId: request.id, reason: request.rejectionReason });
    } else if (outcome === AuthorizationOutcome.EXPIRED) {
      request.status = RepairRequestStatus.REJECTED;
      request.rejectionReason = 'The authorization window expired before it could be confirmed.';
      request.decisionAt = new Date().toISOString();
      this.emit('mandate_repair_failed', { sipId: request.sipId, requestId: request.id, reason: 'expired' });
      this.logStatusEvent(request.sipId, 'rejected', { requestId: request.id, reason: request.rejectionReason });
    } else if (outcome === AuthorizationOutcome.PROVIDER_UNAVAILABLE) {
      request.status = RepairRequestStatus.UNRESOLVED;
      this.addNotification('provider_status_updated', request.sipId, request, 'The payment provider is temporarily unavailable. We could not confirm your authorization right now — you can check again shortly.');
      this.logStatusEvent(request.sipId, 'provider_unavailable', { requestId: request.id });
    } else {
      request.status = RepairRequestStatus.AUTHORIZATION_PENDING;
      this.addNotification('authorization_pending', request.sipId, request, 'Your AutoPay authorization request is still being processed.');
    }
    this.save();
    return { ok: true, request: request, attempt: attempt };
  };

  /** Screen 8: resolves PROVIDER_VERIFICATION_PENDING -> REPAIRED (reauth is instant; replacement respects its effective-date delay). Never fabricates progress while genuinely still pending. */
  MandateStore.prototype.checkRepairStatus = function (requestId) {
    var request = this.getRepairRequest(requestId);
    if (!request) return { ok: false, code: 'NOT_FOUND' };
    this.emit('mandate_status_checked', { sipId: request.sipId, requestId: request.id });

    if (request.status === RepairRequestStatus.PROVIDER_VERIFICATION_PENDING) {
      if (request.type === Data.RepairType.REPLACEMENT) {
        var replacement = this.getReplacementRequest(request.replacementRequestId);
        if (replacement && replacement.status === ReplacementStatus.APPROVED_NOT_EFFECTIVE) {
          if (DateUtils.compareKeys(this.getDemoToday(), replacement.effectiveAt) >= 0) {
            this.finalizeReplacement(request, replacement);
          }
        }
      } else {
        this.finalizeReauthorization(request);
      }
    }
    return { ok: true, status: request.status, request: request };
  };

  MandateStore.prototype.finalizeReauthorization = function (request) {
    request.status = RepairRequestStatus.REPAIRED;
    request.decisionAt = new Date().toISOString();
    this.state.repairedOverrides[request.sipId] = { issueType: MandateIssueType.HEALTHY, verifiedAt: new Date().toISOString(), method: 'reauthorization' };
    this.recoveryStore.updateMandateStatus('mandate-' + request.sipId, 'active');
    this.addNotification('mandate_repaired', request.sipId, request, 'Your AutoPay authorization has been repaired and verified.');
    this.emit('mandate_repair_verified', { sipId: request.sipId, requestId: request.id, method: 'reauthorization' });
    this.logStatusEvent(request.sipId, 'repaired', { requestId: request.id });
    this.save();
  };

  MandateStore.prototype.finalizeReplacement = function (request, replacement) {
    replacement.status = ReplacementStatus.EFFECTIVE;
    request.status = RepairRequestStatus.REPAIRED;
    request.decisionAt = new Date().toISOString();
    this.state.repairedOverrides[request.sipId] = { issueType: MandateIssueType.HEALTHY, verifiedAt: new Date().toISOString(), method: 'replacement' };
    this.recoveryStore.updateMandateStatus('mandate-' + request.sipId, 'active');
    this.addNotification('mandate_repaired', request.sipId, request, 'Your replacement AutoPay authorization is now active.');
    this.emit('mandate_repair_verified', { sipId: request.sipId, requestId: request.id, method: 'replacement' });
    this.logStatusEvent(request.sipId, 'replacement_effective', { requestId: request.id, replacementId: replacement.id });
    this.save();
  };

  MandateStore.prototype.runScheduledChecks = function () {
    var self = this;
    this.state.repairRequests.forEach(function (req) {
      if (req.status === RepairRequestStatus.PROVIDER_VERIFICATION_PENDING && req.type === Data.RepairType.REPLACEMENT) {
        var replacement = self.getReplacementRequest(req.replacementRequestId);
        if (replacement && replacement.status === ReplacementStatus.APPROVED_NOT_EFFECTIVE &&
          DateUtils.compareKeys(self.getDemoToday(), replacement.effectiveAt) >= 0) {
          self.finalizeReplacement(req, replacement);
        }
      }
    });
    this.save();
  };

  // ── replacement requests ──
  MandateStore.prototype.getReplacementRequest = function (id) { return this.ensureLoaded().replacementRequests.find(function (r) { return r.id === id; }) || null; };
  MandateStore.prototype.getReplacementRequestsForSip = function (sipId) {
    return this.ensureLoaded().replacementRequests.filter(function (r) { return r.sipId === sipId; });
  };

  // ── notifications ──
  MandateStore.prototype.addNotification = function (type, sipId, request, message) {
    var state = this.ensureLoaded();
    var dedupeKey = type + ':' + (request ? request.id : sipId);
    if (state.notifications.some(function (n) { return n.dedupeKey === dedupeKey; })) return null;
    var n = {
      id: Data.uid('mandate-notif'), type: type, sipId: sipId, requestId: request ? request.id : null,
      dedupeKey: dedupeKey, message: message, createdAt: new Date().toISOString(), read: false
    };
    state.notifications.unshift(n);
    this.save();
    return n;
  };
  MandateStore.prototype.removeNotifications = function (predicate) {
    var state = this.ensureLoaded();
    state.notifications = state.notifications.filter(function (n) { return !predicate(n); });
    this.save();
  };
  MandateStore.prototype.getNotifications = function () {
    return this.ensureLoaded().notifications.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  };
  MandateStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  MandateStore.prototype.setReminderOptIn = function (val) { this.ensureLoaded().settings.reminderOptIn = !!val; this.save(); };

  // ── scenarios ──
  MandateStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  MandateStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  MandateStore.prototype.setFocusedScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    var sc = Data.buildScenarios().find(function (s) { return s.id === scenarioId; });
    if (!sc) return;
    state.focusedScenarioId = scenarioId;
    this.save();
  };

  return { MandateEngine: MandateEngine, MandateStore: MandateStore };
});
