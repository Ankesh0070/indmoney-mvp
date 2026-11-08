/**
 * SIP Continuity Insights — persisted store. Reuses Feature 1's shared demo
 * SIP pool (sip-demo-1..7) purely through RecoveryStore's existing public
 * getters and reads other features' state read-only for cohort context and
 * "open the right tool" navigation — it never mutates any other feature's
 * state. Everything this feature persists (journeys, cancellation requests,
 * feedback records, privacy prefs) lives in its own storage key.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./engine.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    var out = factory(window.DiscontinuationData, window.DiscontinuationEngine, window.SchedulingDateUtils);
    window.DiscontinuationStore = out.DiscontinuationStore;
  }
})(this, function (Data, Engine, DateUtils) {
  'use strict';

  var JourneyStatus = Data.JourneyStatus;
  var CancellationStatus = Data.CancellationStatus;
  var STORAGE_KEY = 'indmoney_discontinuation_state_v1';
  var memoryFallback = null;

  function getLocalStorage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* ignore */ }
    return null;
  }

  function nowIso() { return new Date().toISOString(); }

  function defaultState() {
    return {
      version: 1,
      demoClockOffsetDays: 0,
      focusedScenarioId: 'disc-a',
      journeys: [],
      cancellationRequests: [],
      feedbackRecords: [],
      helpEngagementEvents: [],
      privacy: { nonessentialPromptsEnabled: true },
      analyticsEvents: [],
      usedIdempotencyKeys: {}
    };
  }

  function DiscontinuationStore(opts) {
    opts = opts || {};
    this.storage = opts.storage === undefined ? getLocalStorage() : opts.storage;
    this.recoveryStore = opts.recoveryStore || null;
    this.pauseStore = opts.pauseStore || null;
    this.mandateStore = opts.mandateStore || null;
    this.schedulingStore = opts.schedulingStore || null;
    this.cashFlowStore = opts.cashFlowStore || null;
    this.educationStore = opts.educationStore || null;
    this.state = null;
  }

  // ───────────────────────── persistence / lifecycle ─────────────────────────

  DiscontinuationStore.prototype.load = function () {
    var raw = null;
    if (this.storage) { try { raw = this.storage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    else { raw = memoryFallback; }
    if (raw) { try { this.state = JSON.parse(raw); } catch (e) { this.state = defaultState(); } }
    else { this.state = defaultState(); }
    this.ensureSeeded();
    this.save();
    return this.state;
  };
  DiscontinuationStore.prototype.save = function () {
    var raw = JSON.stringify(this.state);
    if (this.storage) { try { this.storage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ } }
    else { memoryFallback = raw; }
  };
  DiscontinuationStore.prototype.ensureLoaded = function () { if (!this.state) this.load(); return this.state; };
  DiscontinuationStore.prototype.reset = function () {
    memoryFallback = null;
    if (this.storage) { try { this.storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }
    this.state = defaultState();
    this.ensureSeeded();
    this.save();
    this.emit('demo_reset', {});
    return this.state;
  };
  DiscontinuationStore.prototype.emit = function (event, props) {
    if (this.state) this.state.analyticsEvents.push({ name: event, props: props || {}, at: nowIso() });
  };
  DiscontinuationStore.prototype.getAnalyticsEvents = function () { return this.ensureLoaded().analyticsEvents; };

  DiscontinuationStore.prototype.getDemoToday = function () {
    var state = this.ensureLoaded();
    return DateUtils.addDays(DateUtils.todayKey(), state.demoClockOffsetDays || 0);
  };
  DiscontinuationStore.prototype.advanceDemoClock = function (days) {
    var state = this.ensureLoaded();
    state.demoClockOffsetDays = (state.demoClockOffsetDays || 0) + days;
    this.save();
    return this.getDemoToday();
  };

  // ───────────────────────── scenario selection + seeding ─────────────────────────

  DiscontinuationStore.prototype.getScenarios = function () { return Data.buildScenarios(); };
  DiscontinuationStore.prototype.getFocusedScenarioId = function () { return this.ensureLoaded().focusedScenarioId; };
  DiscontinuationStore.prototype.setFocusedScenario = function (scenarioId) {
    var state = this.ensureLoaded();
    state.focusedScenarioId = scenarioId;
    this.save();
  };

  function logEvent(journey, type) { journey.events.push({ type: type, at: nowIso() }); }

  DiscontinuationStore.prototype.seedFromScenario = function (sc) {
    var id = 'disc-journey-' + sc.id;
    if (this.state.journeys.some(function (j) { return j.id === id; })) return;
    var now = nowIso();
    var reasonOption = sc.reasonId ? Data.REASON_OPTIONS.find(function (o) { return o.id === sc.reasonId; }) : null;

    var journey = {
      id: id, sipId: sc.sipId, demoScenarioId: sc.id, status: JourneyStatus.STARTED,
      startedAt: now, updatedAt: now, feedbackShownAt: now,
      reasonId: null, reasonCategory: null, preferNotToSay: false, skippedFeedback: !!sc.skippedFeedback,
      reasonRespondedAt: null, followUpAnswer: sc.followUp || null,
      feedbackSubmittedAt: null, feedbackRecordId: null,
      helpShownAt: null, helpOpenedAt: null, helpDismissedAt: null,
      cancellationContinuedAt: null, retainedAt: null, cancellationRequestId: null,
      events: [{ type: 'sip_discontinuation_started', at: now }, { type: 'discontinuation_feedback_shown', at: now }]
    };
    this.state.journeys.push(journey);

    if (sc.skippedFeedback) {
      journey.reasonRespondedAt = now; journey.status = JourneyStatus.FEEDBACK_SKIPPED;
      logEvent(journey, 'discontinuation_feedback_skipped');
    } else if (reasonOption) {
      if (reasonOption.category === Data.ReasonCategory.PREFER_NOT_TO_SAY) {
        journey.preferNotToSay = true;
      } else {
        journey.reasonId = reasonOption.id; journey.reasonCategory = reasonOption.category;
      }
      journey.reasonRespondedAt = now; journey.status = JourneyStatus.REASON_SELECTED;
      logEvent(journey, 'discontinuation_reason_selected');

      if (sc.freeText) {
        var sanitized = Engine.sanitizeFreeText(sc.freeText);
        journey.feedbackSubmittedAt = now; journey.status = JourneyStatus.FEEDBACK_SUBMITTED;
        var rec = {
          id: 'disc-fb-' + sc.id, journeyId: journey.id, sipId: journey.sipId, reasonCategory: journey.reasonCategory,
          freeTextSanitized: sanitized, reviewed: false, theme: Engine.classifyTheme(journey.reasonCategory),
          createdAt: now, deletedAt: null
        };
        this.state.feedbackRecords.push(rec);
        journey.feedbackRecordId = rec.id;
        logEvent(journey, 'discontinuation_feedback_submitted');
        if (sc.deleteFeedbackAfter) {
          rec.freeTextSanitized = null; rec.deletedAt = now;
          logEvent(journey, 'feedback_deleted');
        }
      }
    }

    var mapping = journey.reasonCategory ? Data.HELP_MAPPING[journey.reasonCategory] : null;
    if (mapping) {
      journey.helpShownAt = now; journey.status = JourneyStatus.HELP_SHOWN;
      logEvent(journey, 'contextual_help_shown');
      if (sc.helpOpened) {
        journey.helpOpenedAt = now; journey.status = JourneyStatus.HELP_OPENED;
        logEvent(journey, 'contextual_help_opened');
        this.state.helpEngagementEvents.push({ id: Data.uid('disc-help'), journeyId: journey.id, sipId: journey.sipId, toolId: mapping.toolId, openedAt: now });
      }
    }

    if (sc.outcome === 'retained') {
      journey.retainedAt = now; journey.status = JourneyStatus.USER_RETAINED;
      logEvent(journey, 'user_explicitly_chose_to_continue_sip');
      return;
    }

    journey.cancellationContinuedAt = now; journey.status = JourneyStatus.CANCELLATION_CONTINUED;
    logEvent(journey, 'cancellation_continued');

    var reqId = 'disc-cxl-' + sc.id;
    var targetStatus, checksDone, requiredChecks, note;
    if (sc.outcome === 'pending') { targetStatus = CancellationStatus.PENDING_PROVIDER_APPROVAL; checksDone = 1; requiredChecks = 3; note = 'Still awaiting confirmation from the fund provider.'; }
    else if (sc.outcome === 'rejected') { targetStatus = CancellationStatus.REJECTED; checksDone = 2; requiredChecks = 2; note = 'The provider was unable to process this cancellation request. You can contact support or try again later.'; }
    else { targetStatus = CancellationStatus.EFFECTIVE; checksDone = 2; requiredChecks = 2; note = 'This SIP’s cancellation has been confirmed as effective by the provider.'; }

    var request = {
      id: reqId, journeyId: journey.id, sipId: journey.sipId, status: targetStatus,
      checksDone: checksDone, requiredChecks: requiredChecks, idempotencyKey: reqId,
      targetOutcome: sc.outcome === 'pending' ? 'effective' : sc.outcome,
      createdAt: now, updatedAt: now, providerNote: note
    };
    this.state.cancellationRequests.push(request);
    this.state.usedIdempotencyKeys[reqId] = request.id;
    journey.cancellationRequestId = request.id;
    journey.status = JourneyStatus.CANCELLATION_REQUESTED;
    logEvent(journey, 'cancellation_requested');
    if (targetStatus === CancellationStatus.EFFECTIVE) logEvent(journey, 'cancellation_effective');
    if (targetStatus === CancellationStatus.REJECTED) logEvent(journey, 'cancellation_rejected');
  };

  DiscontinuationStore.prototype.ensureSeeded = function () {
    if (!this.recoveryStore) return;
    var self = this;
    Data.buildScenarios().forEach(function (sc) { if (!sc.isAggregateView) self.seedFromScenario(sc); });
  };

  // ───────────────────────── SIP context (read-only cross-feature reads) ─────────────────────────

  DiscontinuationStore.prototype.getAllSips = function () {
    return this.recoveryStore ? this.recoveryStore.getAllSips() : [];
  };

  function monthsBetween(startKey, endKey) {
    var a = DateUtils.parseKey(startKey), b = DateUtils.parseKey(endKey);
    var months = (b.year - a.year) * 12 + (b.month0 - a.month0);
    if (b.day < a.day) months -= 1;
    return Math.max(0, months);
  }

  DiscontinuationStore.prototype.getSipContext = function (sipId) {
    if (!this.recoveryStore) return null;
    var sip = this.recoveryStore.getSip(sipId);
    if (!sip) return null;
    var today = this.getDemoToday();
    var startKey = sip.startDate ? sip.startDate.slice(0, 10) : today;
    var tenureMonths = monthsBetween(startKey, today);
    var instalments = this.recoveryStore.getInstalmentsForSip(sipId);
    var recentFailure = instalments.some(function (i) { return i.status === 'failed'; });
    var pauseHistory = false;
    if (this.pauseStore) {
      try { pauseHistory = this.pauseStore.getLifecycleEvents(sipId).length > 0; } catch (e) { pauseHistory = false; }
    }
    var mandateStatus = null;
    if (this.mandateStore) {
      try { var health = this.mandateStore.getMandateHealth(sipId); mandateStatus = health ? health.status : null; } catch (e) { mandateStatus = null; }
    }
    return { sip: sip, tenureMonths: tenureMonths, recentFailure: recentFailure, pauseHistory: pauseHistory, mandateStatus: mandateStatus };
  };

  DiscontinuationStore.prototype.isSipAlreadyCancelled = function (sipId) {
    return this.ensureLoaded().cancellationRequests.some(function (r) { return r.sipId === sipId && r.status === CancellationStatus.EFFECTIVE; });
  };
  DiscontinuationStore.prototype.getOpenCancellationForSip = function (sipId) {
    return this.ensureLoaded().cancellationRequests.find(function (r) {
      return r.sipId === sipId && (r.status === CancellationStatus.REQUESTED || r.status === CancellationStatus.PENDING_PROVIDER_APPROVAL);
    }) || null;
  };

  // ───────────────────────── journeys ─────────────────────────

  DiscontinuationStore.prototype.getJourney = function (id) {
    return this.ensureLoaded().journeys.find(function (j) { return j.id === id; }) || null;
  };
  DiscontinuationStore.prototype.getAllJourneys = function () { return this.ensureLoaded().journeys.slice(); };
  DiscontinuationStore.prototype.getJourneysForSip = function (sipId) {
    return this.ensureLoaded().journeys.filter(function (j) { return j.sipId === sipId; });
  };
  function isTerminal(j) { return j.status === JourneyStatus.USER_RETAINED || !!j.cancellationRequestId; }
  DiscontinuationStore.prototype.getOpenJourneyForSip = function (sipId) {
    return this.ensureLoaded().journeys.find(function (j) { return j.sipId === sipId && !j.demoScenarioId && !isTerminal(j); }) || null;
  };

  DiscontinuationStore.prototype.startJourney = function (sipId) {
    this.ensureLoaded();
    if (this.isSipAlreadyCancelled(sipId)) return { ok: false, code: 'ALREADY_CANCELLED' };
    var existing = this.getOpenJourneyForSip(sipId);
    if (existing) return { ok: true, journey: existing, resumed: true };
    var now = nowIso();
    var journey = {
      id: Data.uid('disc-journey'), sipId: sipId, demoScenarioId: null, status: JourneyStatus.STARTED,
      startedAt: now, updatedAt: now, feedbackShownAt: null,
      reasonId: null, reasonCategory: null, preferNotToSay: false, skippedFeedback: false,
      reasonRespondedAt: null, followUpAnswer: null, feedbackSubmittedAt: null, feedbackRecordId: null,
      helpShownAt: null, helpOpenedAt: null, helpDismissedAt: null,
      cancellationContinuedAt: null, retainedAt: null, cancellationRequestId: null,
      events: [{ type: 'sip_discontinuation_started', at: now }]
    };
    this.state.journeys.push(journey);
    this.emit('sip_discontinuation_started', { journeyId: journey.id, sipId: sipId });
    this.save();
    return { ok: true, journey: journey, resumed: false };
  };

  DiscontinuationStore.prototype.showFeedbackPrompt = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return;
    if (!journey.feedbackShownAt) {
      journey.feedbackShownAt = nowIso();
      journey.status = JourneyStatus.FEEDBACK_SHOWN;
      logEvent(journey, 'discontinuation_feedback_shown');
      this.emit('discontinuation_feedback_shown', { journeyId: journeyId });
      this.save();
    }
  };

  DiscontinuationStore.prototype.skipFeedback = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    journey.skippedFeedback = true;
    journey.reasonRespondedAt = nowIso();
    journey.status = JourneyStatus.FEEDBACK_SKIPPED;
    logEvent(journey, 'discontinuation_feedback_skipped');
    this.emit('discontinuation_feedback_skipped', { journeyId: journeyId });
    this.save();
    return { ok: true, journey: journey };
  };

  DiscontinuationStore.prototype.selectReason = function (journeyId, reasonId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false, code: 'NOT_FOUND' };
    var option = Data.REASON_OPTIONS.find(function (o) { return o.id === reasonId; });
    if (!option) return { ok: false, code: 'INVALID_REASON' };
    if (option.category === Data.ReasonCategory.PREFER_NOT_TO_SAY) {
      journey.reasonId = null; journey.reasonCategory = null; journey.preferNotToSay = true;
    } else {
      journey.reasonId = option.id; journey.reasonCategory = option.category; journey.preferNotToSay = false;
    }
    journey.reasonRespondedAt = nowIso();
    journey.status = JourneyStatus.REASON_SELECTED;
    logEvent(journey, 'discontinuation_reason_selected');
    this.emit('discontinuation_reason_selected', { journeyId: journeyId, category: journey.reasonCategory || 'prefer_not_to_say' });
    this.save();
    return { ok: true, journey: journey };
  };

  DiscontinuationStore.prototype.submitFollowUp = function (journeyId, answer) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    journey.followUpAnswer = answer ? String(answer).slice(0, 80) : null;
    this.save();
    return { ok: true, journey: journey };
  };

  DiscontinuationStore.prototype.submitFeedback = function (journeyId, fields) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    var sanitized = Engine.sanitizeFreeText((fields || {}).freeText || '');
    journey.feedbackSubmittedAt = nowIso();
    journey.status = JourneyStatus.FEEDBACK_SUBMITTED;
    if (sanitized) {
      var rec = {
        id: Data.uid('disc-fb'), journeyId: journey.id, sipId: journey.sipId, reasonCategory: journey.reasonCategory,
        freeTextSanitized: sanitized, reviewed: false, theme: Engine.classifyTheme(journey.reasonCategory),
        createdAt: nowIso(), deletedAt: null
      };
      this.state.feedbackRecords.push(rec);
      journey.feedbackRecordId = rec.id;
    }
    logEvent(journey, 'discontinuation_feedback_submitted');
    this.emit('discontinuation_feedback_submitted', { journeyId: journeyId, hasFreeText: !!sanitized });
    this.save();
    return { ok: true, journey: journey };
  };

  // ───────────────────────── contextual help ─────────────────────────

  DiscontinuationStore.prototype.getHelpOffer = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey || !journey.reasonCategory) return null;
    var mapping = Data.HELP_MAPPING[journey.reasonCategory];
    return mapping || null;
  };

  DiscontinuationStore.prototype.markHelpShown = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey || journey.helpShownAt) return;
    var mapping = this.getHelpOffer(journeyId);
    if (!mapping) return;
    journey.helpShownAt = nowIso();
    journey.status = JourneyStatus.HELP_SHOWN;
    logEvent(journey, 'contextual_help_shown');
    this.emit('contextual_help_shown', { journeyId: journeyId, toolId: mapping.toolId });
    this.save();
  };

  DiscontinuationStore.prototype.openHelp = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    var mapping = this.getHelpOffer(journeyId);
    if (!mapping) return { ok: false, code: 'NO_HELP_AVAILABLE' };
    journey.helpOpenedAt = journey.helpOpenedAt || nowIso();
    journey.status = JourneyStatus.HELP_OPENED;
    logEvent(journey, 'contextual_help_opened');
    this.state.helpEngagementEvents.push({ id: Data.uid('disc-help'), journeyId: journey.id, sipId: journey.sipId, toolId: mapping.toolId, openedAt: nowIso() });
    this.emit('contextual_help_opened', { journeyId: journeyId, toolId: mapping.toolId });
    this.save();
    return { ok: true, toolId: mapping.toolId, title: mapping.title };
  };

  DiscontinuationStore.prototype.dismissHelp = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return;
    journey.helpDismissedAt = nowIso();
    logEvent(journey, 'contextual_help_dismissed');
    this.emit('contextual_help_dismissed', { journeyId: journeyId });
    this.save();
  };

  // ───────────────────────── cancellation continuation ─────────────────────────

  DiscontinuationStore.prototype.continueToCancellation = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    journey.cancellationContinuedAt = nowIso();
    journey.status = JourneyStatus.CANCELLATION_CONTINUED;
    logEvent(journey, 'cancellation_continued');
    this.emit('cancellation_continued', { journeyId: journeyId });
    this.save();
    return { ok: true, journey: journey };
  };

  DiscontinuationStore.prototype.chooseToRetain = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false };
    if (journey.cancellationRequestId) return { ok: false, code: 'ALREADY_REQUESTED' };
    journey.retainedAt = nowIso();
    journey.status = JourneyStatus.USER_RETAINED;
    logEvent(journey, 'user_explicitly_chose_to_continue_sip');
    this.emit('user_explicitly_chose_to_continue_sip', { journeyId: journeyId });
    this.save();
    return { ok: true, journey: journey };
  };

  DiscontinuationStore.prototype.submitCancellationRequest = function (journeyId) {
    var journey = this.getJourney(journeyId);
    if (!journey) return { ok: false, code: 'NOT_FOUND' };
    if (journey.cancellationRequestId) {
      return { ok: true, request: this.getCancellationRequest(journey.cancellationRequestId), duplicate: true };
    }
    if (this.isSipAlreadyCancelled(journey.sipId)) return { ok: false, code: 'ALREADY_CANCELLED' };
    var idempotencyKey = 'disc-cancel-' + journeyId;
    if (this.state.usedIdempotencyKeys[idempotencyKey]) {
      return { ok: true, request: this.getCancellationRequest(this.state.usedIdempotencyKeys[idempotencyKey]), duplicate: true };
    }
    var now = nowIso();
    var request = {
      id: Data.uid('disc-cxl'), journeyId: journeyId, sipId: journey.sipId, status: CancellationStatus.REQUESTED,
      checksDone: 0, requiredChecks: 2, idempotencyKey: idempotencyKey, targetOutcome: 'effective',
      createdAt: now, updatedAt: now, providerNote: 'Submitted — awaiting confirmation from the fund provider.'
    };
    this.state.cancellationRequests.push(request);
    this.state.usedIdempotencyKeys[idempotencyKey] = request.id;
    journey.cancellationRequestId = request.id;
    journey.status = JourneyStatus.CANCELLATION_REQUESTED;
    logEvent(journey, 'cancellation_requested');
    this.emit('cancellation_requested', { journeyId: journeyId, sipId: journey.sipId });
    this.save();
    return { ok: true, request: request, duplicate: false };
  };

  DiscontinuationStore.prototype.getCancellationRequest = function (id) {
    return this.ensureLoaded().cancellationRequests.find(function (r) { return r.id === id; }) || null;
  };

  DiscontinuationStore.prototype.checkCancellationStatus = function (requestId) {
    var request = this.getCancellationRequest(requestId);
    if (!request) return { ok: false };
    if (request.status === CancellationStatus.EFFECTIVE || request.status === CancellationStatus.REJECTED || request.status === CancellationStatus.NOT_AVAILABLE) {
      return { ok: true, request: request, changed: false };
    }
    request.checksDone += 1;
    request.updatedAt = nowIso();
    if (request.status === CancellationStatus.REQUESTED) request.status = CancellationStatus.PENDING_PROVIDER_APPROVAL;
    var changed = true;
    if (request.checksDone >= request.requiredChecks) {
      var outcome = request.targetOutcome || 'effective';
      request.status = outcome === 'rejected' ? CancellationStatus.REJECTED
        : outcome === 'not_available' ? CancellationStatus.NOT_AVAILABLE
        : CancellationStatus.EFFECTIVE;
      request.providerNote = request.status === CancellationStatus.EFFECTIVE
        ? 'This SIP’s cancellation has been confirmed as effective by the provider.'
        : request.status === CancellationStatus.REJECTED
        ? 'The provider was unable to process this cancellation request. You can contact support or try again later.'
        : 'This provider does not support cancellation through this flow.';
      var journey = this.state.journeys.find(function (j) { return j.id === request.journeyId; });
      if (journey) {
        logEvent(journey, request.status === CancellationStatus.EFFECTIVE ? 'cancellation_effective' : 'cancellation_rejected');
      }
      this.emit(request.status === CancellationStatus.EFFECTIVE ? 'cancellation_effective' : 'cancellation_rejected', { requestId: requestId });
    } else {
      changed = false;
    }
    this.save();
    return { ok: true, request: request, changed: changed };
  };

  // ───────────────────────── analytics / research (Screens 8-9) ─────────────────────────

  DiscontinuationStore.prototype.getAnalyticsSummary = function () {
    var journeys = this.getAllJourneys();
    var state = this.ensureLoaded();
    var rates = Engine.computeRates(journeys);
    return {
      totalStarted: journeys.length,
      reasonsSelected: Engine.buildReasonDistribution(journeys),
      helpShown: journeys.filter(function (j) { return !!j.helpShownAt; }).length,
      helpOpened: journeys.filter(function (j) { return !!j.helpOpenedAt; }).length,
      cancellationRequestsSubmitted: state.cancellationRequests.length,
      cancellationsEffective: state.cancellationRequests.filter(function (r) { return r.status === CancellationStatus.EFFECTIVE; }).length,
      retainedVoluntarily: journeys.filter(function (j) { return j.status === JourneyStatus.USER_RETAINED; }).length,
      skippedFeedback: journeys.filter(function (j) { return j.skippedFeedback; }).length,
      rates: rates
    };
  };

  DiscontinuationStore.prototype.getEnrichedJourneys = function () {
    var self = this;
    return this.getAllJourneys().map(function (j) {
      var ctx = self.getSipContext(j.sipId);
      var request = j.cancellationRequestId ? self.getCancellationRequest(j.cancellationRequestId) : null;
      return { journey: j, context: ctx, request: request };
    });
  };

  DiscontinuationStore.prototype.getInsightsExplorer = function (filters) {
    filters = filters || {};
    var rows = this.getEnrichedJourneys().filter(function (row) {
      if (filters.reasonCategory && row.journey.reasonCategory !== filters.reasonCategory) return false;
      if (filters.paymentStatus === 'recent_failure' && !(row.context && row.context.recentFailure)) return false;
      if (filters.paymentStatus === 'no_recent_failure' && (row.context && row.context.recentFailure)) return false;
      if (filters.pauseHistory === 'yes' && !(row.context && row.context.pauseHistory)) return false;
      if (filters.pauseHistory === 'no' && (row.context && row.context.pauseHistory)) return false;
      if (filters.outcome) {
        var status = row.request ? row.request.status : (row.journey.status === JourneyStatus.USER_RETAINED ? 'retained' : 'none');
        if (status !== filters.outcome) return false;
      }
      return true;
    });
    var matchedJourneys = rows.map(function (r) { return r.journey; });
    return {
      rows: rows, totalMatched: rows.length, totalAll: this.getAllJourneys().length,
      distribution: Engine.buildReasonDistribution(matchedJourneys),
      funnel: Engine.buildFunnel(matchedJourneys)
    };
  };

  // ───────────────────────── qualitative feedback review (Screen 10) ─────────────────────────

  DiscontinuationStore.prototype.getFeedbackRecords = function (filters) {
    filters = filters || {};
    return this.ensureLoaded().feedbackRecords.filter(function (r) {
      if (filters.reasonCategory && r.reasonCategory !== filters.reasonCategory) return false;
      if (filters.theme && r.theme !== filters.theme) return false;
      if (filters.reviewedOnly && !r.reviewed) return false;
      return true;
    });
  };
  DiscontinuationStore.prototype.markFeedbackReviewed = function (id, reviewed) {
    var rec = this.ensureLoaded().feedbackRecords.find(function (r) { return r.id === id; });
    if (!rec) return;
    rec.reviewed = reviewed !== false;
    this.save();
  };
  DiscontinuationStore.prototype.assignTheme = function (id, theme) {
    if (Data.THEMES.indexOf(theme) === -1) return { ok: false };
    var rec = this.ensureLoaded().feedbackRecords.find(function (r) { return r.id === id; });
    if (!rec) return { ok: false };
    rec.theme = theme;
    this.save();
    return { ok: true };
  };
  DiscontinuationStore.prototype.deleteFeedback = function (id) {
    var rec = this.ensureLoaded().feedbackRecords.find(function (r) { return r.id === id; });
    if (!rec) return { ok: false };
    rec.freeTextSanitized = null;
    rec.deletedAt = nowIso();
    this.emit('feedback_deleted', { feedbackId: id });
    this.save();
    return { ok: true };
  };
  DiscontinuationStore.prototype.clearAllOptionalFeedback = function () {
    var self = this;
    this.ensureLoaded().feedbackRecords.forEach(function (r) {
      if (r.deletedAt) return;
      r.freeTextSanitized = null; r.deletedAt = nowIso();
      self.emit('feedback_deleted', { feedbackId: r.id });
    });
    this.save();
  };
  DiscontinuationStore.prototype.exportFeedbackCSV = function (filters) {
    var rows = this.getFeedbackRecords(filters);
    var header = ['id', 'reasonCategory', 'theme', 'reviewed', 'createdAt', 'feedback'];
    function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var lines = [header.join(',')];
    rows.forEach(function (r) {
      lines.push([r.id, r.reasonCategory || '', r.theme || '', r.reviewed, r.createdAt, r.deletedAt ? '[deleted by user]' : (r.freeTextSanitized || '')].map(csvCell).join(','));
    });
    return lines.join('\n');
  };

  // ───────────────────────── journey history (Screen 11) ─────────────────────────

  DiscontinuationStore.prototype.getJourneyHistory = function (sipId) {
    var self = this;
    var journeys = sipId ? this.getJourneysForSip(sipId) : this.getAllJourneys();
    return journeys.map(function (j) {
      var sip = self.recoveryStore ? self.recoveryStore.getSip(j.sipId) : null;
      var request = j.cancellationRequestId ? self.getCancellationRequest(j.cancellationRequestId) : null;
      return { journey: j, fundName: sip ? sip.fundName : j.sipId, request: request };
    });
  };

  // ───────────────────────── privacy (Screen 12) ─────────────────────────

  DiscontinuationStore.prototype.getPrivacyPrefs = function () { return this.ensureLoaded().privacy; };
  DiscontinuationStore.prototype.setNonessentialPromptsEnabled = function (val) {
    this.ensureLoaded().privacy.nonessentialPromptsEnabled = !!val;
    this.save();
  };

  return { DiscontinuationStore: DiscontinuationStore };
});
