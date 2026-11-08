/**
 * SIP Recovery Assistant — mock payment engine (pure) + persisted store.
 * RecoveryEngine holds pure, deterministic functions with no I/O, so the
 * Node test suite can exercise retry/mandate/reauth/status-check logic
 * directly. RecoveryStore wraps it with localStorage persistence,
 * idempotency / request-level guards and notification bookkeeping.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.RecoveryData);
    window.RecoveryEngine = out.RecoveryEngine;
    window.RecoveryStore = out.RecoveryStore;
  }
})(this, function (Data) {
  'use strict';

  var InstalmentStatus = Data.InstalmentStatus;
  var AttemptStatus = Data.AttemptStatus;
  var AttemptType = Data.AttemptType;
  var MandateStatus = Data.MandateStatus;
  var NotificationType = Data.NotificationType;
  var TicketStatus = Data.TicketStatus;

  // ───────────────────────── RecoveryEngine (pure) ─────────────────────────
  var RecoveryEngine = {};

  /**
   * @param {object} instalment
   * @param {object[]} existingAttempts - all attempts for this instalment
   */
  RecoveryEngine.retryPayment = function (instalment, existingAttempts) {
    if (instalment.status === InstalmentStatus.RECOVERED || instalment.status === InstalmentStatus.SUCCESS) {
      return { ok: false, code: 'ALREADY_RESOLVED' };
    }
    if (!instalment.retryPermitted) {
      return { ok: false, code: 'NOT_PERMITTED' };
    }
    var hasPending = (existingAttempts || []).some(function (a) {
      return a.instalmentId === instalment.id && a.status === AttemptStatus.PENDING;
    });
    if (hasPending) {
      return { ok: false, code: 'PENDING_EXISTS' };
    }
    var seq = (instalment.attemptSeq || 0) + 1;
    var idempotencyKey = instalment.id + '-retry-' + seq;
    var outcome = instalment.simulatedOutcome === 'failed' ? AttemptStatus.FAILED : AttemptStatus.SUCCESS;
    return {
      ok: true,
      idempotencyKey: idempotencyKey,
      seq: seq,
      outcome: outcome,
      attempt: {
        type: AttemptType.RETRY,
        status: outcome,
        idempotencyKey: idempotencyKey,
        message: outcome === AttemptStatus.SUCCESS
          ? 'Retry succeeded — instalment recovered.'
          : 'Retry failed — the bank declined the debit again.'
      }
    };
  };

  RecoveryEngine.checkStatus = function (instalment) {
    if (instalment.status === InstalmentStatus.FAILED) {
      return { ok: true, outcome: 'still_failed', checks: (instalment.statusCheckCount || 0) + 1 };
    }
    if (instalment.status !== InstalmentStatus.PENDING) {
      return { ok: false, code: 'NOT_PENDING' };
    }
    var checks = (instalment.statusCheckCount || 0) + 1;
    var resolvesAfter = instalment.pendingResolvesAfterChecks || 1;
    if (checks < resolvesAfter) {
      return { ok: true, outcome: 'still_pending', checks: checks };
    }
    return { ok: true, outcome: 'recovered', checks: checks };
  };

  RecoveryEngine.renewMandate = function (mandate, instalment, confirmed) {
    if (!confirmed) return { ok: false, code: 'CONFIRMATION_REQUIRED' };
    if (mandate.status === MandateStatus.ACTIVE) return { ok: false, code: 'ALREADY_ACTIVE' };
    var outcome = instalment.simulatedOutcome === 'failed' ? AttemptStatus.FAILED : AttemptStatus.SUCCESS;
    return {
      ok: true,
      outcome: outcome,
      mandateStatus: MandateStatus.ACTIVE,
      attempt: {
        type: AttemptType.MANDATE_RENEWAL,
        status: outcome,
        message: outcome === AttemptStatus.SUCCESS
          ? 'AutoPay mandate renewed and instalment recovered.'
          : 'Mandate renewal succeeded but the retried debit failed.'
      }
    };
  };

  RecoveryEngine.reauthorize = function (instalment, confirmed) {
    if (!confirmed) return { ok: false, code: 'CONFIRMATION_REQUIRED' };
    var outcome = instalment.simulatedOutcome === 'failed' ? AttemptStatus.FAILED : AttemptStatus.SUCCESS;
    return {
      ok: true,
      outcome: outcome,
      attempt: {
        type: AttemptType.REAUTH,
        status: outcome,
        message: outcome === AttemptStatus.SUCCESS
          ? 'Reauthorization succeeded and instalment recovered.'
          : 'Reauthorization failed. Please try again or contact support.'
      }
    };
  };

  // ───────────────────────── RecoveryStore (stateful) ─────────────────────────
  var STORAGE_KEY = 'indmoney_recovery_state_v2';
  var memoryFallback = null;
  var analyticsSink = null;

  function getLocalStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* ignore */ }
    return null;
  }

  function RecoveryStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.state = null;
  }

  RecoveryStore.prototype.setAnalyticsSink = function (fn) { analyticsSink = fn; };
  RecoveryStore.prototype.emit = function (event, props) {
    if (this.state) {
      this.state.analyticsEvents.push({ name: event, props: props || {}, at: new Date().toISOString() });
    }
    if (typeof analyticsSink === 'function') analyticsSink(event, props);
  };

  RecoveryStore.prototype.load = function () {
    var raw = null;
    if (this.storage) {
      try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    } else {
      raw = memoryFallback;
    }
    if (raw) {
      try {
        this.state = JSON.parse(raw);
        return this.state;
      } catch (e) { /* fall through to reseed */ }
    }
    this.state = Data.buildSeedState();
    this.save();
    return this.state;
  };

  RecoveryStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) {
      try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore quota errors */ }
    } else {
      memoryFallback = raw;
    }
  };

  RecoveryStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) {
      try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
    this.state = Data.buildSeedState();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };

  RecoveryStore.prototype.ensureLoaded = function () {
    if (!this.state) this.load();
    return this.state;
  };

  // ── getters ──
  RecoveryStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  RecoveryStore.prototype.getSip = function (sipId) {
    return this.ensureLoaded().sips.find(function (s) { return s.id === sipId; }) || null;
  };
  RecoveryStore.prototype.getInstalment = function (instalmentId) {
    return this.ensureLoaded().instalments.find(function (i) { return i.id === instalmentId; }) || null;
  };
  RecoveryStore.prototype.getInstalmentsForSip = function (sipId) {
    return this.ensureLoaded().instalments.filter(function (i) { return i.sipId === sipId; });
  };
  RecoveryStore.prototype.getMandate = function (mandateId) {
    return this.ensureLoaded().mandates.find(function (m) { return m.id === mandateId; }) || null;
  };
  RecoveryStore.prototype.getMandateForSip = function (sipId) {
    var sip = this.getSip(sipId);
    return sip ? this.getMandate(sip.mandateId) : null;
  };
  RecoveryStore.prototype.getAttemptsForInstalment = function (instalmentId) {
    return this.ensureLoaded().attempts.filter(function (a) { return a.instalmentId === instalmentId; });
  };
  RecoveryStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().scenarioFocus; };
  RecoveryStore.prototype.setFocusedScenarioId = function (id) {
    this.ensureLoaded().scenarioFocus = id;
    this.save();
  };
  RecoveryStore.prototype.getFocusedInstalment = function () {
    var scenarios = this.getScenarios();
    var sc = scenarios.find(function (s) { return s.id === this.getFocusedScenarioId(); }.bind(this));
    if (!sc) return null;
    return this.getInstalment(sc.instalment.id);
  };
  RecoveryStore.prototype.getUnresolvedInstalments = function () {
    return this.ensureLoaded().instalments.filter(function (i) {
      return i.status === InstalmentStatus.FAILED || i.status === InstalmentStatus.PENDING;
    });
  };
  RecoveryStore.prototype.getAllSips = function () { return this.ensureLoaded().sips.slice(); };

  /**
   * Additive-only registration used by other features (e.g. Salary-Aligned
   * SIP Scheduling) to share this same SIP/instalment/mandate registry
   * instead of maintaining a separate one. Never touches retry, mandate or
   * payment state-machine logic — purely idempotent inserts.
   */
  RecoveryStore.prototype.registerSip = function (sip) {
    var state = this.ensureLoaded();
    if (!state.sips.some(function (s) { return s.id === sip.id; })) {
      state.sips.push(sip);
      this.save();
    }
  };
  RecoveryStore.prototype.registerMandate = function (mandate) {
    var state = this.ensureLoaded();
    if (!state.mandates.some(function (m) { return m.id === mandate.id; })) {
      state.mandates.push(mandate);
      this.save();
    }
  };
  RecoveryStore.prototype.registerInstalment = function (instalment) {
    var state = this.ensureLoaded();
    if (!state.instalments.some(function (i) { return i.id === instalment.id; })) {
      state.instalments.push(instalment);
      this.save();
    }
  };
  RecoveryStore.prototype.registerAttempt = function (attempt) {
    var state = this.ensureLoaded();
    if (!state.attempts.some(function (a) { return a.id === attempt.id; })) {
      state.attempts.push(attempt);
      this.save();
    }
  };
  /**
   * Additive status update used by Feature 4 (AutoPay Health & Mandate
   * Repair) once a repair is verified. Never touches instalment or SIP
   * lifecycle status — only the shared Mandate record's own status field,
   * the same field Feature 1's own renewMandate() already mutates in place.
   */
  RecoveryStore.prototype.updateMandateStatus = function (mandateId, status) {
    var mandate = this.getMandate(mandateId);
    if (!mandate) return null;
    mandate.status = status;
    mandate.lastUpdatedAt = new Date().toISOString();
    this.save();
    return mandate;
  };

  /** Ordered recovery timeline for one instalment: original failure + every attempt. */
  RecoveryStore.prototype.getPaymentHistory = function (instalmentId) {
    var attempts = this.getAttemptsForInstalment(instalmentId).slice();
    attempts.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    return attempts;
  };

  RecoveryStore.prototype.getAllInstalmentsWithSip = function () {
    var state = this.ensureLoaded();
    var self = this;
    return state.instalments.map(function (i) {
      return { instalment: i, sip: self.getSip(i.sipId) };
    });
  };

  // ── notifications ──
  RecoveryStore.prototype.getNotifications = function () {
    return this.ensureLoaded().notifications.slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  };
  RecoveryStore.prototype.getUnreadCount = function () {
    return this.ensureLoaded().notifications.filter(function (n) { return !n.read; }).length;
  };
  RecoveryStore.prototype.markNotificationRead = function (id) {
    var n = this.ensureLoaded().notifications.find(function (x) { return x.id === id; });
    if (n) { n.read = true; this.save(); }
  };
  RecoveryStore.prototype.markAllNotificationsRead = function () {
    this.ensureLoaded().notifications.forEach(function (n) { n.read = true; });
    this.save();
  };
  RecoveryStore.prototype.setRemindersEnabled = function (enabled) {
    this.ensureLoaded().settings.remindersEnabled = !!enabled;
    this.save();
  };
  /** Removes any still-outstanding reminder notifications for an instalment once it is no longer failed/pending. */
  RecoveryStore.prototype.cancelRemindersFor = function (instalmentId) {
    var state = this.ensureLoaded();
    state.notifications = state.notifications.filter(function (n) {
      var isReminder = n.type === NotificationType.OUTSTANDING_REMINDER || n.type === NotificationType.MANDATE_REMINDER;
      return !(isReminder && n.instalmentId === instalmentId);
    });
    this.save();
  };
  RecoveryStore.prototype.addNotification = function (type, instalment, sip) {
    var n = Data.makeNotification(type, instalment, sip, new Date().toISOString(), false);
    this.ensureLoaded().notifications.unshift(n);
    this.save();
    return n;
  };

  // ── request-level guards ──
  RecoveryStore.prototype.isInFlight = function (instalmentId) {
    return !!this.ensureLoaded().inFlight[instalmentId];
  };
  RecoveryStore.prototype.beginRequest = function (instalmentId) {
    this.ensureLoaded().inFlight[instalmentId] = true;
    this.save();
  };
  RecoveryStore.prototype.endRequest = function (instalmentId) {
    delete this.ensureLoaded().inFlight[instalmentId];
    this.save();
  };
  RecoveryStore.prototype.isDuplicateKey = function (key) {
    return !!this.ensureLoaded().usedIdempotencyKeys[key];
  };
  RecoveryStore.prototype.registerKey = function (key) {
    this.ensureLoaded().usedIdempotencyKeys[key] = true;
    this.save();
  };

  function commitInstalmentOutcome(store, instalment, sip, outcome, attemptMeta) {
    var nowIso = new Date().toISOString();
    var attempt = Object.assign({
      id: Data.uid('attempt'),
      instalmentId: instalment.id,
      createdAt: nowIso,
      resolvedAt: nowIso
    }, attemptMeta);
    store.state.attempts.push(attempt);
    instalment.attemptSeq = (instalment.attemptSeq || 0) + 1;

    if (outcome === AttemptStatus.SUCCESS) {
      instalment.status = InstalmentStatus.RECOVERED;
      instalment.recoveredAt = nowIso;
      store.cancelRemindersFor(instalment.id);
      store.addNotification(NotificationType.RECOVERY_SUCCESS, instalment, sip);
      store.emit('recovery_completed', { instalmentId: instalment.id, amount: instalment.amount });
    } else {
      instalment.status = InstalmentStatus.FAILED;
      if (!instalment.failedAt) instalment.failedAt = nowIso;
    }
    store.save();
    return attempt;
  }

  /** Retry a failed instalment. Idempotent per (instalmentId, attemptSeq); blocked while another attempt is pending. */
  RecoveryStore.prototype.retryPayment = function (instalmentId) {
    var state = this.ensureLoaded();
    var instalment = this.getInstalment(instalmentId);
    if (!instalment) return { ok: false, code: 'NOT_FOUND' };
    if (this.isInFlight(instalmentId)) return { ok: false, code: 'DUPLICATE_REQUEST' };

    this.beginRequest(instalmentId);
    this.emit('retry_requested', { instalmentId: instalmentId });
    try {
      var existingAttempts = this.getAttemptsForInstalment(instalmentId);
      var result = RecoveryEngine.retryPayment(instalment, existingAttempts);
      if (!result.ok) return result;
      if (this.isDuplicateKey(result.idempotencyKey)) return { ok: false, code: 'DUPLICATE_REQUEST' };
      this.registerKey(result.idempotencyKey);

      var sip = this.getSip(instalment.sipId);
      var attempt = commitInstalmentOutcome(this, instalment, sip, result.outcome, {
        type: result.attempt.type, status: result.attempt.status,
        idempotencyKey: result.idempotencyKey, message: result.attempt.message
      });
      this.emit(result.outcome === AttemptStatus.SUCCESS ? 'retry_succeeded' : 'retry_failed', { instalmentId: instalmentId });
      return { ok: true, outcome: result.outcome, attempt: attempt, instalment: instalment };
    } finally {
      this.endRequest(instalmentId);
    }
  };

  RecoveryStore.prototype.checkStatus = function (instalmentId) {
    var instalment = this.getInstalment(instalmentId);
    if (!instalment) return { ok: false, code: 'NOT_FOUND' };
    if (this.isInFlight(instalmentId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest(instalmentId);
    try {
      var result = RecoveryEngine.checkStatus(instalment);
      if (!result.ok) return result;
      instalment.statusCheckCount = result.checks;
      if (result.outcome === 'recovered') {
        var sip = this.getSip(instalment.sipId);
        var attempt = commitInstalmentOutcome(this, instalment, sip, AttemptStatus.SUCCESS, {
          type: AttemptType.STATUS_CHECK, status: AttemptStatus.SUCCESS,
          idempotencyKey: instalment.id + '-statuscheck-' + result.checks,
          message: 'Bank confirmed the payment went through.'
        });
        return { ok: true, outcome: 'recovered', attempt: attempt, instalment: instalment };
      }
      this.save();
      return { ok: true, outcome: result.outcome, instalment: instalment };
    } finally {
      this.endRequest(instalmentId);
    }
  };

  RecoveryStore.prototype.renewMandate = function (instalmentId, confirmed) {
    var instalment = this.getInstalment(instalmentId);
    if (!instalment) return { ok: false, code: 'NOT_FOUND' };
    var mandate = this.getMandateForSip(instalment.sipId);
    if (!mandate) return { ok: false, code: 'NOT_FOUND' };
    if (this.isInFlight(instalmentId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest(instalmentId);
    try {
      var result = RecoveryEngine.renewMandate(mandate, instalment, confirmed);
      if (!result.ok) return result;
      mandate.status = result.mandateStatus;
      mandate.lastRenewedAt = new Date().toISOString();
      var sip = this.getSip(instalment.sipId);
      var attempt = commitInstalmentOutcome(this, instalment, sip, result.outcome, {
        type: result.attempt.type, status: result.attempt.status,
        idempotencyKey: instalment.id + '-mandate-' + ((instalment.attemptSeq || 0) + 1),
        message: result.attempt.message
      });
      this.emit('mandate_reauthorization_completed', { instalmentId: instalmentId, outcome: result.outcome });
      return { ok: true, outcome: result.outcome, attempt: attempt, mandate: mandate, instalment: instalment };
    } finally {
      this.endRequest(instalmentId);
    }
  };

  RecoveryStore.prototype.reauthorize = function (instalmentId, confirmed) {
    var instalment = this.getInstalment(instalmentId);
    if (!instalment) return { ok: false, code: 'NOT_FOUND' };
    if (this.isInFlight(instalmentId)) return { ok: false, code: 'DUPLICATE_REQUEST' };
    this.beginRequest(instalmentId);
    try {
      var result = RecoveryEngine.reauthorize(instalment, confirmed);
      if (!result.ok) return result;
      var sip = this.getSip(instalment.sipId);
      var attempt = commitInstalmentOutcome(this, instalment, sip, result.outcome, {
        type: result.attempt.type, status: result.attempt.status,
        idempotencyKey: instalment.id + '-reauth-' + ((instalment.attemptSeq || 0) + 1),
        message: result.attempt.message
      });
      this.emit('mandate_reauthorization_completed', { instalmentId: instalmentId, outcome: result.outcome });
      return { ok: true, outcome: result.outcome, attempt: attempt, instalment: instalment };
    } finally {
      this.endRequest(instalmentId);
    }
  };

  // ── support tickets ──
  RecoveryStore.prototype.createSupportTicket = function (fields) {
    var state = this.ensureLoaded();
    var ticketNumber = 'NIV-' + (10000 + state.supportTickets.length + Math.floor(Math.random() * 90));
    var ticket = {
      id: Data.uid('ticket'),
      ticketNumber: ticketNumber,
      sipId: fields.sipId,
      instalmentId: fields.instalmentId,
      subject: fields.subject,
      description: fields.description,
      status: TicketStatus.OPEN,
      createdAt: new Date().toISOString()
    };
    state.supportTickets.unshift(ticket);
    this.save();
    this.emit('support_ticket_created', { ticketId: ticket.id, instalmentId: fields.instalmentId });
    return ticket;
  };
  RecoveryStore.prototype.getSupportTickets = function () { return this.ensureLoaded().supportTickets; };

  // ── simulated offline handling ──
  RecoveryStore.prototype.setSimulateOffline = function (val) {
    this.ensureLoaded().settings.simulateOffline = !!val;
    this.save();
  };
  RecoveryStore.prototype.isSimulatingOffline = function () { return !!this.ensureLoaded().settings.simulateOffline; };

  return { RecoveryEngine: RecoveryEngine, RecoveryStore: RecoveryStore };
});
