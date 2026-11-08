/**
 * SIP Continuity Insights — DOM rendering for every discontinuation screen.
 * Browser-only: queries the real DOM and wires events. Pure markup comes
 * from DiscontinuationComponents; all state mutation goes through
 * DiscontinuationStore, which only ever *reads* Features 1-6's state.
 */
(function () {
  'use strict';

  var Data = window.DiscontinuationData;
  var DateUtils = window.SchedulingDateUtils;
  var C = window.DiscontinuationComponents;
  var Analytics = window.DiscontinuationAnalytics;
  var recoveryStore = window.RecoveryScreens.store;
  var pauseStore = window.PauseScreens ? window.PauseScreens.store : null;
  var mandateStore = window.MandateScreens ? window.MandateScreens.store : null;
  var schedulingStore = window.SchedulingScreens ? window.SchedulingScreens.store : null;
  var cashFlowStore = window.CashFlowScreens ? window.CashFlowScreens.store : null;
  var educationStore = window.EducationScreens ? window.EducationScreens.store : null;

  var store = new window.DiscontinuationStore({
    recoveryStore: recoveryStore, pauseStore: pauseStore, mandateStore: mandateStore,
    schedulingStore: schedulingStore, cashFlowStore: cashFlowStore, educationStore: educationStore
  });

  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) { return C.esc(s); }

  // ───────────────────────── Entry slot inside screen-sips ─────────────────────────
  function renderEntrySlot() {
    var slot = $('disc-sips-slot');
    if (!slot) return;
    var summary = store.getAnalyticsSummary();
    slot.innerHTML =
      '<div class="section-header"><h3>SIP Continuity Insights</h3><span class="sim-chip">Demo</span></div>' +
      '<div class="tiny faint mb-12">If you ever pause or cancel a SIP, you can optionally tell us why — it is always skippable, and never blocks cancellation.</div>' +
      '<div class="card">' +
        '<div class="row-between"><span class="small muted">Cancellation journeys recorded</span><span class="small bold">' + summary.totalStarted + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Chose to keep their SIP after reviewing help</span><span class="small bold">' + summary.retainedVoluntarily + '</span></div>' +
        '<button class="btn btn-primary mt-16" id="disc-entry-open">Open SIP Continuity Insights</button>' +
      '</div>';
    var open = $('disc-entry-open'); if (open) open.onclick = function () { window.DiscontinuationUI.goDashboard(); };
  }

  // ───────────────────────── Dashboard hub (demo SIP list + scenario switcher) ─────────────────────────
  function renderDashboard() {
    var body = $('disc-dashboard-body');
    if (!body) return;
    var sips = store.getAllSips();
    var scenarios = store.getScenarios();
    var focusedId = store.getFocusedScenarioId();

    body.innerHTML =
      '<div class="tiny faint mb-12">Demo scenario switcher — jump to any of the sixteen scripted narratives (A–P).</div>' +
      C.scenarioPillRow(scenarios, focusedId) +
      '<div class="section-header mt-16"><h3>Your SIPs</h3></div>' +
      sips.map(function (sip) {
        return C.sipManageRow(sip, { alreadyCancelled: store.isSipAlreadyCancelled(sip.id) });
      }).join('') +
      '<div class="row gap-8 mt-16">' +
        '<button class="btn btn-outline" style="flex:1;" data-action="disc-view-analytics">Analytics Dashboard</button>' +
        '<button class="btn btn-outline" style="flex:1;" data-action="disc-view-insights">Research Explorer</button>' +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        '<button class="btn btn-outline" style="flex:1;" data-action="disc-view-feedback-review">Feedback Review</button>' +
        '<button class="btn btn-outline" style="flex:1;" data-action="disc-view-history">Journey History</button>' +
      '</div>' +
      '<button class="btn btn-outline mt-8" data-action="disc-view-privacy">Feedback Preferences &amp; Privacy</button>' +
      '<button class="btn btn-danger-outline mt-16" data-action="disc-reset-demo">↺ Reset Demo Data</button>';

    qsa(body, '[data-action="disc-pause"]').forEach(function (btn) {
      btn.onclick = function () { window.PauseUI ? window.PauseUI.manageSip(btn.dataset.sip) : window.showToast('Pause manager unavailable.'); };
    });
    qsa(body, '[data-action="disc-cancel"]').forEach(function (btn) {
      btn.onclick = function () { window.DiscontinuationUI.beginCancel(btn.dataset.sip); };
    });
    var a = qsa(body, '[data-action="disc-view-analytics"]')[0]; if (a) a.onclick = function () { window.DiscontinuationUI.goAnalytics(); };
    var i = qsa(body, '[data-action="disc-view-insights"]')[0]; if (i) i.onclick = function () { window.DiscontinuationUI.goInsights(); };
    var f = qsa(body, '[data-action="disc-view-feedback-review"]')[0]; if (f) f.onclick = function () { window.DiscontinuationUI.goFeedbackReview(); };
    var h = qsa(body, '[data-action="disc-view-history"]')[0]; if (h) h.onclick = function () { window.DiscontinuationUI.goHistory(null); };
    var p = qsa(body, '[data-action="disc-view-privacy"]')[0]; if (p) p.onclick = function () { window.DiscontinuationUI.goPrivacy(); };
    var r = qsa(body, '[data-action="disc-reset-demo"]')[0]; if (r) r.onclick = function () { window.DiscontinuationUI.confirmResetDemo(); };
  }

  // ───────────────────────── Screen 1: optional feedback offer ─────────────────────────
  function renderPrompt(journeyId) {
    var body = $('disc-prompt-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    store.showFeedbackPrompt(journeyId);
    var sip = recoveryStore.getSip(journey.sipId);
    body.innerHTML =
      '<div class="card">' +
        '<div class="small bold">' + esc(sip ? sip.fundName : journey.sipId) + '</div>' +
        '<div class="small mt-12">Would you like to share why you are stopping this SIP? Your feedback helps us understand what could work better.</div>' +
        '<button class="btn btn-primary mt-16" data-action="disc-share">Share Feedback</button>' +
        '<button class="btn btn-outline mt-8" data-action="disc-skip">Skip &amp; Continue</button>' +
      '</div>';
    var share = qsa(body, '[data-action="disc-share"]')[0]; if (share) share.onclick = function () { window.DiscontinuationUI.goReason(journeyId); };
    var skip = qsa(body, '[data-action="disc-skip"]')[0]; if (skip) skip.onclick = function () { window.DiscontinuationUI.skipFeedback(journeyId); };
  }

  // ───────────────────────── Screen 2: reason selection ─────────────────────────
  function renderReason(journeyId) {
    var body = $('disc-reason-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    body.innerHTML =
      '<div class="small bold">What is your main reason for stopping this SIP?</div>' +
      '<div class="tiny muted mt-4">Optional — choose one, or skip.</div>' +
      '<div class="disc-option-list mt-16">' +
        Data.REASON_OPTIONS.map(function (opt) { return C.reasonOptionButton(opt, journey.reasonId === opt.id); }).join('') +
      '</div>' +
      '<button class="btn btn-outline mt-16" data-action="disc-skip-reason">Skip &amp; Continue</button>';
    qsa(body, '[data-action="disc-select-reason"]').forEach(function (btn) {
      btn.onclick = function () { window.DiscontinuationUI.selectReason(journeyId, btn.dataset.reason); };
    });
    var skip = qsa(body, '[data-action="disc-skip-reason"]')[0]; if (skip) skip.onclick = function () { window.DiscontinuationUI.skipFeedback(journeyId); };
  }

  // ───────────────────────── Screen 3: optional follow-up + free text ─────────────────────────
  function renderFollowup(journeyId) {
    var body = $('disc-followup-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    var followUpCfg = journey.reasonCategory ? Data.FOLLOWUP_CONFIG[journey.reasonCategory] : null;

    body.innerHTML =
      (followUpCfg ? (
        '<div class="small bold">' + esc(followUpCfg.question) + '</div>' +
        '<div class="disc-option-list mt-12">' +
          followUpCfg.options.map(function (o) { return C.followUpOptionButton(o, journey.followUpAnswer === o); }).join('') +
        '</div>'
      ) : '') +
      '<label class="field-label mt-16">Anything else you would like to share? (optional)</label>' +
      '<textarea class="field-input" id="disc-freetext" rows="4" maxlength="1000" placeholder="Please do not include account numbers, passwords or OTPs."></textarea>' +
      '<div class="tiny faint mt-8">We never ask for your bank password, OTP, UPI PIN or full account/card numbers, and anything that looks like one is automatically removed before it is saved.</div>' +
      '<button class="btn btn-primary mt-16" data-action="disc-submit-feedback">Continue</button>' +
      '<button class="btn btn-outline mt-8" data-action="disc-skip-followup">Skip</button>';

    qsa(body, '[data-action="disc-select-followup"]').forEach(function (btn) {
      btn.onclick = function () {
        store.submitFollowUp(journeyId, btn.dataset.value);
        renderFollowup(journeyId);
      };
    });
    var submit = qsa(body, '[data-action="disc-submit-feedback"]')[0];
    if (submit) submit.onclick = function () {
      var text = $('disc-freetext').value;
      window.DiscontinuationUI.submitFeedback(journeyId, text);
    };
    var skip = qsa(body, '[data-action="disc-skip-followup"]')[0];
    if (skip) skip.onclick = function () { window.DiscontinuationUI.submitFeedback(journeyId, ''); };
  }

  // ───────────────────────── Screen 4: contextual help options ─────────────────────────
  function renderHelp(journeyId) {
    var body = $('disc-help-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    var mapping = store.getHelpOffer(journeyId);
    if (mapping) store.markHelpShown(journeyId);

    body.innerHTML =
      (mapping ? C.helpOfferTile(mapping) : '<div class="tiny muted mb-12">No specific tool applies to what you shared — that’s okay, you can continue whenever you’re ready.</div>') +
      '<button class="btn btn-primary mt-16" data-action="disc-continue-cancel">Continue to Cancellation</button>';

    var viewBtn = qsa(body, '[data-action="disc-view-help-option"]')[0];
    if (viewBtn) viewBtn.onclick = function () { window.DiscontinuationUI.goHelpPreview(journeyId); };
    var cont = qsa(body, '[data-action="disc-continue-cancel"]')[0];
    if (cont) cont.onclick = function () { window.DiscontinuationUI.goCancel(journeyId); };
  }

  // ───────────────────────── Screen 5: help preview (shown inline on screen 4 via helpOfferCard; this screen is the "Open Tool" landing confirmation) ─────────────────────────
  function renderHelpPreview(journeyId) {
    var body = $('disc-help-preview-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    var mapping = journey ? store.getHelpOffer(journeyId) : null;
    body.innerHTML = mapping ? C.helpOfferCard(mapping) : '<div class="tiny muted">No help tool is associated with this journey.</div>';
    var openBtn = qsa(body, '[data-action="disc-open-help"]')[0];
    if (openBtn) openBtn.onclick = function () { window.DiscontinuationUI.openHelp(journeyId); };
    var returnBtn = qsa(body, '[data-action="disc-return-to-cancellation"]')[0];
    if (returnBtn) returnBtn.onclick = function () { window.DiscontinuationUI.goCancel(journeyId); };
  }

  // ───────────────────────── Screen 6: cancellation continuation ─────────────────────────
  function renderCancel(journeyId) {
    var body = $('disc-cancel-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    store.continueToCancellation(journeyId);
    var sip = recoveryStore.getSip(journey.sipId);
    var request = journey.cancellationRequestId ? store.getCancellationRequest(journey.cancellationRequestId) : null;

    body.innerHTML =
      '<div class="card">' +
        '<div class="small bold">' + esc(sip ? sip.fundName : journey.sipId) + '</div>' +
        '<div class="tiny muted mt-4">' + inr(sip ? sip.amount : 0) + '/mo</div>' +
      '</div>' +
      (request ? ('<div class="mt-16">' + C.cancellationRequestCard(request) + '</div>' +
        (request.status !== 'effective' && request.status !== 'rejected' && request.status !== 'not_available'
          ? '<button class="btn btn-outline mt-12" data-action="disc-check-status">Check Status</button>' : '')
      ) : (
        '<div class="small mt-16">This is a simulated cancellation — no real brokerage, banking or provider operation occurs. Submitting is required to actually cancel; you can still change your mind below.</div>' +
        '<button class="btn btn-danger-outline mt-16" data-action="disc-submit-cancel">Confirm Cancellation Request</button>' +
        '<button class="btn btn-primary mt-8" data-action="disc-keep-sip">Actually, Keep My SIP</button>'
      ));

    function inr(n) { return C.inr(n); }

    var submit = qsa(body, '[data-action="disc-submit-cancel"]')[0];
    if (submit) submit.onclick = function () { window.DiscontinuationUI.confirmSubmitCancellation(journeyId); };
    var keep = qsa(body, '[data-action="disc-keep-sip"]')[0];
    if (keep) keep.onclick = function () { window.DiscontinuationUI.keepSip(journeyId); };
    var check = qsa(body, '[data-action="disc-check-status"]')[0];
    if (check) check.onclick = function () { window.DiscontinuationUI.checkStatus(journey.cancellationRequestId); };
  }

  // ───────────────────────── Screen 7: exit feedback confirmation ─────────────────────────
  function renderExit(journeyId) {
    var body = $('disc-exit-body');
    if (!body) return;
    var journey = store.getJourney(journeyId);
    if (!journey) { body.innerHTML = '<div class="tiny muted">Journey not found.</div>'; return; }
    var request = journey.cancellationRequestId ? store.getCancellationRequest(journey.cancellationRequestId) : null;
    var sharedFeedback = !!journey.feedbackSubmittedAt;

    body.innerHTML =
      (sharedFeedback ? '<div class="card"><div class="small bold">Thank you for sharing your experience.</div></div>' : '') +
      (journey.status === Data.JourneyStatus.USER_RETAINED
        ? '<div class="card mt-12"><div class="small bold">Your SIP remains active</div><div class="tiny muted mt-4">You chose not to submit a cancellation request.</div></div>'
        : '<div class="mt-12">' + C.cancellationRequestCard(request) + '</div>') +
      '<button class="btn btn-primary mt-16" data-action="disc-go-manage">Continue SIP Management</button>' +
      (request ? '<button class="btn btn-outline mt-8" data-action="disc-go-status">View Cancellation Status</button>' : '') +
      '<button class="btn btn-outline mt-8" data-action="disc-go-home">Return to Dashboard</button>';

    var manage = qsa(body, '[data-action="disc-go-manage"]')[0]; if (manage) manage.onclick = function () { window.DiscontinuationUI.goDashboard(); };
    var status = qsa(body, '[data-action="disc-go-status"]')[0]; if (status) status.onclick = function () { window.DiscontinuationUI.goCancel(journeyId); };
    var home = qsa(body, '[data-action="disc-go-home"]')[0]; if (home) home.onclick = function () { window.go('screen-home'); };
  }

  // ───────────────────────── Screen 8: analytics dashboard ─────────────────────────
  function renderAnalytics() {
    var body = $('disc-analytics-body');
    if (!body) return;
    var m = Analytics.computeMetrics(store, recoveryStore);
    function pctLabel(v) { return v == null ? '— (insufficient data)' : v + '%'; }
    body.innerHTML =
      '<div class="tiny faint mb-12">' + esc(m.note) + '</div>' +
      '<div class="row gap-8">' +
        tile('Journeys started', m.totalStarted) + tile('Help shown', m.helpShown) +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        tile('Help opened', m.helpOpened) + tile('Skipped feedback', m.skippedFeedback) +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        tile('Cancellation requests', m.cancellationRequestsSubmitted) + tile('Cancellations effective', m.cancellationsEffective) +
      '</div>' +
      '<div class="row gap-8 mt-8">' +
        tile('Kept SIP after help', m.retainedVoluntarily) + tile('', '') +
      '</div>' +
      '<div class="card mt-16">' +
        '<div class="row-between"><span class="small muted">Feedback response rate</span><span class="small bold">' + pctLabel(m.feedbackResponseRatePct) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Help engagement rate</span><span class="small bold">' + pctLabel(m.helpEngagementRatePct) + '</span></div>' +
        '<div class="row-between mt-8"><span class="small muted">Voluntary continuation rate</span><span class="small bold">' + pctLabel(m.voluntaryContinuationRatePct) + '</span></div>' +
      '</div>' +
      '<div class="section-header mt-16"><h3>Reasons selected</h3></div>' +
      '<div class="card">' + C.distributionList(m.reasonsSelected) + '</div>' +
      '<div class="section-header mt-16"><h3>Real month-12 SIP activity (separate outcome)</h3></div>' +
      '<div class="card"><div class="tiny muted">Share of all demo SIPs with a verified successful instalment in the last 30 days</div><div class="small bold mt-4">' + pctLabel(m.month12SipActivityPct) + '</div>' +
      '<div class="tiny faint mt-8">This is tracked separately and is never used to infer whether a user was "retained" by this feature.</div></div>';

    function tile(label, value) {
      if (label === '') return '<div style="flex:1;"></div>';
      return '<div class="card" style="flex:1;"><div class="tiny muted">' + esc(label) + '</div><div class="small bold mt-4">' + esc(value) + '</div></div>';
    }
  }

  // ───────────────────────── Screen 9: research insights explorer ─────────────────────────
  function renderInsights(filters) {
    var body = $('disc-insights-body');
    if (!body) return;
    filters = filters || {};
    var result = store.getInsightsExplorer(filters);
    var smallSample = result.totalMatched > 0 && result.totalMatched < 5;

    body.innerHTML =
      '<div class="row gap-8">' +
        C.filterSelect('disc-filter-reason', 'Reason category', Data.REASON_OPTIONS.reduce(function (acc, o) {
          if (!acc.some(function (x) { return x.value === o.category; })) acc.push({ value: o.category, label: o.category.replace(/_/g, ' ') });
          return acc;
        }, [])) +
        C.filterSelect('disc-filter-payment', 'Payment status', [{ value: 'recent_failure', label: 'Recent failure' }, { value: 'no_recent_failure', label: 'No recent failure' }]) +
      '</div>' +
      '<div class="row gap-8 mt-12">' +
        C.filterSelect('disc-filter-pause', 'Pause history', [{ value: 'yes', label: 'Has pause history' }, { value: 'no', label: 'No pause history' }]) +
        C.filterSelect('disc-filter-outcome', 'Outcome', [
          { value: 'effective', label: 'Effective' }, { value: 'pending_provider_approval', label: 'Pending' },
          { value: 'rejected', label: 'Rejected' }, { value: 'retained', label: 'Retained' }, { value: 'none', label: 'No request yet' }
        ]) +
      '</div>' +
      '<div class="tiny muted mt-12">Matching ' + result.totalMatched + ' of ' + result.totalAll + ' journeys' + (smallSample ? ' — small demo cohort, interpret with caution.' : '') + '</div>' +
      '<div class="section-header mt-12"><h3>Reason distribution</h3></div><div class="card">' + C.distributionList(result.distribution) + '</div>' +
      '<div class="section-header mt-16"><h3>Funnel</h3></div><div class="card">' + C.funnelList(result.funnel) + '</div>' +
      '<div class="tiny faint mt-12">Counts reflect correlations within this demo dataset only — they are not evidence of a causal relationship.</div>';

    var filterFieldMap = { 'disc-filter-reason': 'reasonCategory', 'disc-filter-payment': 'paymentStatus', 'disc-filter-pause': 'pauseHistory', 'disc-filter-outcome': 'outcome' };
    Object.keys(filterFieldMap).forEach(function (id) {
      var el = $(id);
      if (el) { el.value = filters[filterFieldMap[id]] || ''; el.onchange = applyFilters; }
    });
    function applyFilters() {
      window.DiscontinuationUI.applyInsightsFilters({
        reasonCategory: $('disc-filter-reason').value || null,
        paymentStatus: $('disc-filter-payment').value || null,
        pauseHistory: $('disc-filter-pause').value || null,
        outcome: $('disc-filter-outcome').value || null
      });
    }
  }

  // ───────────────────────── Screen 10: qualitative feedback review ─────────────────────────
  function renderFeedbackReview(filters) {
    var body = $('disc-feedback-review-body');
    if (!body) return;
    filters = filters || {};
    var records = store.getFeedbackRecords(filters);

    body.innerHTML =
      '<div class="row gap-8">' +
        C.filterSelect('disc-fb-filter-reason', 'Reason category', Data.REASON_OPTIONS.reduce(function (acc, o) {
          if (!acc.some(function (x) { return x.value === o.category; })) acc.push({ value: o.category, label: o.category.replace(/_/g, ' ') });
          return acc;
        }, [])) +
        C.filterSelect('disc-fb-filter-theme', 'Theme', Data.THEMES.map(function (t) { return { value: t, label: t }; })) +
      '</div>' +
      '<div class="row gap-8 mt-12">' +
        '<button class="btn btn-outline" style="flex:1;" data-action="disc-export-csv">Export Sanitized CSV</button>' +
        '<button class="btn btn-danger-outline" style="flex:1;" data-action="disc-clear-all-feedback">Clear All Feedback</button>' +
      '</div>' +
      '<div class="mt-16">' + (records.length ? records.map(function (r) {
        var sip = recoveryStore.getSip(r.sipId);
        return C.feedbackRecordRow(r, sip ? sip.fundName : r.sipId);
      }).join('') : '<div class="tiny muted">No feedback records match these filters.</div>') + '</div>';

    var rf = $('disc-fb-filter-reason'); if (rf) { rf.value = filters.reasonCategory || ''; rf.onchange = applyFilters; }
    var tf = $('disc-fb-filter-theme'); if (tf) { tf.value = filters.theme || ''; tf.onchange = applyFilters; }
    function applyFilters() {
      window.DiscontinuationUI.applyFeedbackFilters({ reasonCategory: $('disc-fb-filter-reason').value || null, theme: $('disc-fb-filter-theme').value || null });
    }

    qsa(body, '[data-action="disc-toggle-reviewed"]').forEach(function (btn) {
      btn.onclick = function () { window.DiscontinuationUI.toggleReviewed(btn.dataset.feedback); };
    });
    qsa(body, '[data-action="disc-delete-feedback"]').forEach(function (btn) {
      btn.onclick = function () { window.DiscontinuationUI.confirmDeleteFeedback(btn.dataset.feedback); };
    });
    qsa(body, '[data-action="disc-assign-theme"]').forEach(function (sel) {
      sel.onchange = function () { window.DiscontinuationUI.assignTheme(sel.dataset.feedback, sel.value); };
    });
    var exportBtn = qsa(body, '[data-action="disc-export-csv"]')[0]; if (exportBtn) exportBtn.onclick = function () { window.DiscontinuationUI.exportCsv(filters); };
    var clearBtn = qsa(body, '[data-action="disc-clear-all-feedback"]')[0]; if (clearBtn) clearBtn.onclick = function () { window.DiscontinuationUI.confirmClearAllFeedback(); };
  }

  // ───────────────────────── Screen 11: journey history ─────────────────────────
  function renderHistory(sipId) {
    var body = $('disc-history-body');
    if (!body) return;
    var rows = store.getJourneyHistory(sipId);
    body.innerHTML =
      (sipId ? '<div class="tiny muted mb-12">Showing journeys for this SIP only. <button class="btn-link" data-action="disc-history-clear">Show all</button></div>' : '') +
      (rows.length ? rows.map(function (r) { return C.journeyHistoryCard(r); }).join('') : '<div class="tiny muted">No journeys recorded yet.</div>');
    var clear = qsa(body, '[data-action="disc-history-clear"]')[0];
    if (clear) clear.onclick = function () { window.DiscontinuationUI.goHistory(null); };
  }

  // ───────────────────────── Screen 12: feedback preferences & privacy ─────────────────────────
  function renderPrivacy() {
    var body = $('disc-privacy-body');
    if (!body) return;
    var prefs = store.getPrivacyPrefs();
    var myFeedback = store.getFeedbackRecords({});
    body.innerHTML =
      '<div class="card"><div class="small">Your feedback is optional. You can manage your SIP without submitting it.</div></div>' +
      '<div class="card mt-12">' +
        '<div class="recovery-reminder-toggle">' +
          '<div><div class="small bold">Non-essential research prompts</div><div class="tiny muted">Dismissible prompts asking for optional feedback during cancellation.</div></div>' +
          '<label class="switch"><input type="checkbox" id="disc-prompts-toggle" ' + (prefs.nonessentialPromptsEnabled ? 'checked' : '') + '><span class="switch-track"></span></label>' +
        '</div>' +
      '</div>' +
      '<div class="section-header mt-16"><h3>Your submitted demo feedback (' + myFeedback.length + ')</h3></div>' +
      (myFeedback.length ? myFeedback.map(function (r) {
        var sip = recoveryStore.getSip(r.sipId);
        return C.feedbackRecordRow(r, sip ? sip.fundName : r.sipId);
      }).join('') : '<div class="tiny muted">No feedback submitted yet.</div>') +
      '<button class="btn btn-danger-outline mt-16" data-action="disc-clear-my-feedback">Clear All My Optional Feedback</button>';

    var toggle = $('disc-prompts-toggle'); if (toggle) toggle.onchange = function () { window.DiscontinuationUI.togglePrompts(toggle.checked); };
    qsa(body, '[data-action="disc-delete-feedback"]').forEach(function (btn) { btn.onclick = function () { window.DiscontinuationUI.confirmDeleteFeedback(btn.dataset.feedback); }; });
    qsa(body, '[data-action="disc-toggle-reviewed"]').forEach(function (btn) { btn.onclick = function () { window.DiscontinuationUI.toggleReviewed(btn.dataset.feedback); }; });
    qsa(body, '[data-action="disc-assign-theme"]').forEach(function (sel) { sel.onchange = function () { window.DiscontinuationUI.assignTheme(sel.dataset.feedback, sel.value); }; });
    var clear = qsa(body, '[data-action="disc-clear-my-feedback"]')[0]; if (clear) clear.onclick = function () { window.DiscontinuationUI.confirmClearAllFeedback(); };
  }

  window.DiscontinuationScreens = {
    store: store,
    renderEntrySlot: renderEntrySlot, renderDashboard: renderDashboard,
    renderPrompt: renderPrompt, renderReason: renderReason, renderFollowup: renderFollowup,
    renderHelp: renderHelp, renderHelpPreview: renderHelpPreview, renderCancel: renderCancel, renderExit: renderExit,
    renderAnalytics: renderAnalytics, renderInsights: renderInsights, renderFeedbackReview: renderFeedbackReview,
    renderHistory: renderHistory, renderPrivacy: renderPrivacy
  };
})();
