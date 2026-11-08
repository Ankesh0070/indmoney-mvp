/**
 * SIP Recovery Assistant — controller wiring. Installs a thin wrapper
 * around app.js's existing go()/goBack() navigation (left untouched) so
 * every recovery screen renders itself on entry, and exposes the
 * RecoveryUI dispatcher that index.html's onclick handlers call.
 */
(function () {
  'use strict';

  var Screens = window.RecoveryScreens;
  var store = Screens.store;
  var C = window.RecoveryComponents;

  store.ensureLoaded();

  var UIState = {
    stepper: null,
    detailsSipId: null,
    failureInstalmentId: null,
    resultPayload: null,
    supportContext: null
  };
  var pendingOfflineActions = [];

  function onNavigate(id) {
    if (id === 'screen-home') Screens.renderHomeSlot();
    else if (id === 'screen-sips') Screens.renderSipsSlot();
    else if (id === 'screen-recovery-details') Screens.renderDetails(UIState.detailsSipId);
    else if (id === 'screen-recovery-failure') Screens.renderFailure(UIState.failureInstalmentId);
    else if (id === 'screen-recovery-stepper') Screens.renderStepper(UIState.stepper);
    else if (id === 'screen-recovery-result') Screens.renderResult(UIState.resultPayload);
    else if (id === 'screen-recovery-history') Screens.renderHistory();
    else if (id === 'screen-recovery-notifications') Screens.renderNotifications();
    else if (id === 'screen-recovery-support') Screens.renderSupport(UIState.supportContext);
    else if (id === 'screen-recovery-analytics') Screens.renderAnalytics();
  }

  var _origGo = window.go;
  window.go = function (id, opts) {
    _origGo(id, opts);
    onNavigate(id);
  };

  function showDialog(opts, onConfirm) {
    var root = document.getElementById('recovery-dialog-root');
    root.innerHTML = C.confirmDialog(opts);
    function close() { root.innerHTML = ''; }
    document.getElementById('recovery-dialog-cancel').onclick = close;
    document.getElementById('recovery-dialog-confirm').onclick = function () {
      var checkbox = document.getElementById('recovery-dialog-checkbox');
      if (opts.checkboxLabel && checkbox && !checkbox.checked) {
        window.showToast('Please check the box to continue');
        return;
      }
      close();
      onConfirm();
    };
  }

  function performAction(instalmentId, actionType) {
    if (actionType === 'retry') return store.retryPayment(instalmentId);
    if (actionType === 'renew_mandate') return store.renewMandate(instalmentId, true);
    if (actionType === 'reauthorize') return store.reauthorize(instalmentId, true);
    if (actionType === 'check-status') return store.checkStatus(instalmentId);
    return { ok: false, code: 'UNKNOWN_ACTION' };
  }

  function resultPayloadFor(actionType, instalmentId, result) {
    var inst = store.getInstalment(instalmentId);
    var payload = { instalmentId: instalmentId };
    if (!result.ok) {
      if (result.code === 'DUPLICATE_REQUEST') {
        payload.type = 'processing';
        payload.message = 'This instalment already has a request in progress. Please wait for it to finish before trying again.';
      } else if (result.code === 'NOT_PERMITTED' || result.code === 'PENDING_EXISTS') {
        payload.type = result.code === 'PENDING_EXISTS' ? 'processing' : 'not_available';
        payload.message = result.code === 'PENDING_EXISTS'
          ? 'A previous attempt is still pending verification with your bank.'
          : (inst.retryBlockedReason || 'Recovery is not available for this instalment right now.');
      } else if (result.code === 'CONFIRMATION_REQUIRED') {
        payload.type = 'auth_required';
        payload.message = 'Please complete the authorization step to continue.';
      } else if (result.code === 'ALREADY_RESOLVED') {
        payload.type = 'success';
        payload.message = 'This instalment has already been recovered.';
      } else {
        payload.type = 'retry_failed';
        payload.message = 'We could not complete this action right now. Please try again later.';
      }
      return payload;
    }
    if (result.outcome === 'offline_pending') {
      payload.type = 'processing';
      payload.message = 'You appear to be offline. Your request is safely queued and will resume automatically once you reconnect — no data has been lost.';
    } else if (result.outcome === 'success' || result.outcome === 'recovered') {
      payload.type = 'success';
      payload.message = 'Your ' + C.inr(inst.amount) + ' SIP instalment has been successfully recovered.';
    } else if (result.outcome === 'still_pending') {
      payload.type = 'processing';
      payload.message = 'Still pending verification with your bank / payment provider. Please check back shortly.';
    } else if (result.outcome === 'still_failed') {
      payload.type = 'not_available';
      payload.message = 'We still could not confirm why this payment failed. Please create a support ticket and our team will investigate.';
    } else if (result.outcome === 'failed') {
      payload.type = 'retry_failed';
      payload.message = actionType === 'renew_mandate'
        ? 'Your AutoPay mandate was renewed, but the retried debit failed. Please try again later.'
        : 'The payment attempt failed again. Please try again later or contact support.';
    } else {
      payload.type = 'retry_failed';
      payload.message = 'We could not confirm the outcome of this action.';
    }
    return payload;
  }

  function beginProcessing(stepperRef) {
    stepperRef.step = 4;
    Screens.renderStepper(stepperRef);
    setTimeout(function () {
      if (stepperRef.cancelled) return;
      var instalmentId = stepperRef.instalmentId;
      var actionType = stepperRef.actionType;
      var result;
      if (store.isSimulatingOffline() && actionType !== 'check-status') {
        result = { ok: true, outcome: 'offline_pending' };
        pendingOfflineActions.push({ instalmentId: instalmentId, actionType: actionType });
      } else {
        result = performAction(instalmentId, actionType);
      }
      if (stepperRef.cancelled) return;
      UIState.resultPayload = resultPayloadFor(actionType, instalmentId, result);
      UIState.stepper = null;
      window.go('screen-recovery-result');
    }, 1300);
  }

  function resumeOfflineQueue() {
    if (!pendingOfflineActions.length) return;
    var queue = pendingOfflineActions.slice();
    pendingOfflineActions = [];
    window.showToast('Back online — resolving ' + queue.length + ' pending request' + (queue.length > 1 ? 's' : '') + '…');
    queue.forEach(function (item) {
      var result = performAction(item.instalmentId, item.actionType);
      var active = document.querySelector('.screen.active');
      if (active && (active.id === 'screen-sips' || active.id === 'screen-home')) onNavigate(active.id);
      if (active && active.id === 'screen-recovery-notifications') onNavigate(active.id);
      void result;
    });
  }

  window.addEventListener('online', resumeOfflineQueue);

  window.RecoveryUI = {
    resolveNow: function (instalmentId) {
      UIState.failureInstalmentId = instalmentId;
      window.go('screen-recovery-failure');
    },
    viewDetails: function (sipId) {
      UIState.detailsSipId = sipId;
      window.go('screen-recovery-details');
    },
    switchScenario: function (scenarioId) {
      store.setFocusedScenarioId(scenarioId);
      var active = document.querySelector('.screen.active');
      if (active) onNavigate(active.id);
      window.showToast('Switched demo scenario');
    },
    confirmResetDemo: function () {
      showDialog({
        title: 'Reset demo data?',
        message: 'This clears all simulated recovery progress (retries, notifications, support tickets) and reseeds the original six demo scenarios. This cannot be undone.',
        confirmLabel: 'Reset Demo Data', cancelLabel: 'Keep my data'
      }, function () {
        store.reset();
        pendingOfflineActions = [];
        var active = document.querySelector('.screen.active');
        if (active) onNavigate(active.id);
        window.showToast('Demo data reset');
      });
    },
    goHistory: function () { window.go('screen-recovery-history'); },
    goAnalytics: function () { window.go('screen-recovery-analytics'); },
    selectAction: function (instalmentId, actionType) {
      if (actionType === 'support') { window.RecoveryUI.openSupport(instalmentId); return; }
      if (actionType === 'history') { window.go('screen-recovery-history'); return; }
      store.emit('recovery_action_selected', { instalmentId: instalmentId, actionType: actionType });
      UIState.stepper = { instalmentId: instalmentId, actionType: actionType, step: 1, cancelled: false };
      window.go('screen-recovery-stepper');
    },
    stepperNext: function () {
      var s = UIState.stepper;
      if (!s) return;
      if (s.step < 3) { s.step += 1; Screens.renderStepper(s); return; }
      if (s.step === 3) beginProcessing(s);
    },
    stepperBack: function () {
      var s = UIState.stepper;
      if (!s) return;
      s.step = Math.max(1, s.step - 1);
      Screens.renderStepper(s);
    },
    cancelStepper: function () {
      if (UIState.stepper) UIState.stepper.cancelled = true;
      UIState.stepper = null;
      window.goBack();
    },
    markNotificationRead: function (id) {
      store.markNotificationRead(id);
      Screens.renderNotifications();
    },
    markAllRead: function () {
      store.markAllNotificationsRead();
      Screens.renderNotifications();
    },
    toggleReminders: function (checked) {
      store.setRemindersEnabled(checked);
      window.showToast(checked ? 'Recovery reminders enabled' : 'Recovery reminders disabled');
    },
    toggleOffline: function (checked) {
      store.setSimulateOffline(checked);
      window.showToast(checked ? 'Simulating offline mode' : 'Back online');
      if (!checked) resumeOfflineQueue();
    },
    openSupport: function (instalmentId) {
      UIState.supportContext = instalmentId || null;
      window.go('screen-recovery-support');
    }
  };

  Screens.updateBellDot();
})();
