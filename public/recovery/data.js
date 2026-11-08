/**
 * SIP Recovery Assistant — entity definitions, enums and demo seed data.
 * Dual-exported: usable as a browser global (window.RecoveryData) and via
 * require() from the Node test suite, so the same seed/enum definitions
 * back both the UI and the automated tests.
 */
(function (root) {
  'use strict';

  var FailureReason = {
    INSUFFICIENT_BALANCE: 'insufficient_balance',
    MANDATE_EXPIRED: 'mandate_expired',
    BANK_SERVER_ERROR: 'bank_server_error',
    AUTH_FAILURE: 'auth_failure',
    UNKNOWN: 'unknown'
  };

  var InstalmentStatus = {
    SUCCESS: 'success',
    FAILED: 'failed',
    PENDING: 'pending',
    RECOVERED: 'recovered',
    CANCELLED: 'cancelled'
  };

  var AttemptStatus = { PENDING: 'pending', SUCCESS: 'success', FAILED: 'failed' };

  var AttemptType = {
    ORIGINAL: 'original',
    RETRY: 'retry',
    MANDATE_RENEWAL: 'mandate_renewal',
    REAUTH: 'reauth',
    STATUS_CHECK: 'status_check'
  };

  var MandateStatus = { ACTIVE: 'active', EXPIRED: 'expired', PENDING_REAUTH: 'pending_reauth' };

  var RecoveryActionType = {
    RETRY: 'retry',
    RENEW_MANDATE: 'renew_mandate',
    REAUTHORIZE: 'reauthorize',
    CHECK_STATUS: 'check_status',
    SUPPORT: 'support',
    NONE: 'none'
  };

  var NotificationType = {
    PAYMENT_FAILED: 'payment_failed',
    OUTSTANDING_REMINDER: 'outstanding_reminder',
    MANDATE_REMINDER: 'mandate_reminder',
    PROCESSING_UPDATE: 'processing_update',
    RECOVERY_SUCCESS: 'recovery_success'
  };

  var TicketStatus = { OPEN: 'open', IN_PROGRESS: 'in_progress', RESOLVED: 'resolved' };

  // Human-readable copy for each failure reason — used by the explanation
  // screen and kept in one place so every surface describes a reason the
  // same way.
  var FAILURE_EXPLANATIONS = {};
  FAILURE_EXPLANATIONS[FailureReason.INSUFFICIENT_BALANCE] = {
    title: 'Insufficient balance in your bank account',
    message: 'Your bank could not process this debit because the available balance was lower than the instalment amount at the time of the attempt.',
    guidance: 'Please ensure your linked bank account has sufficient balance before retrying. We never check or access your actual bank balance — this is based only on the failure code your bank sent back.',
    defaultAction: RecoveryActionType.RETRY
  };
  FAILURE_EXPLANATIONS[FailureReason.MANDATE_EXPIRED] = {
    title: 'Your AutoPay mandate has expired',
    message: 'The AutoPay (NACH) mandate authorizing automatic debits for this SIP is no longer active, so your bank declined the instalment.',
    guidance: 'You will need to reauthorize AutoPay with your bank to resume automatic debits for this SIP.',
    defaultAction: RecoveryActionType.RENEW_MANDATE
  };
  FAILURE_EXPLANATIONS[FailureReason.BANK_SERVER_ERROR] = {
    title: 'Bank or payment provider was temporarily unavailable',
    message: 'The payment could not be completed because your bank or our payment provider experienced a temporary technical issue. This is not related to your account.',
    guidance: 'We are waiting for a final confirmation from the bank. You can check the latest status at any time — we will never submit a second debit while this one is still pending.',
    defaultAction: RecoveryActionType.CHECK_STATUS
  };
  FAILURE_EXPLANATIONS[FailureReason.AUTH_FAILURE] = {
    title: 'Bank authorization was unsuccessful',
    message: 'Your bank declined to authorize this payment. This can happen if a one-time authorization step was not completed in time.',
    guidance: 'You can securely reauthorize this payment. You will need to confirm the authorization explicitly before we try again.',
    defaultAction: RecoveryActionType.REAUTHORIZE
  };
  FAILURE_EXPLANATIONS[FailureReason.UNKNOWN] = {
    title: 'We could not confirm why this payment failed',
    message: 'We did not receive a clear reason from your bank or payment provider for this failure. We never guess or invent a cause.',
    guidance: 'You can check the latest status, or raise a support ticket and our team will investigate.',
    defaultAction: RecoveryActionType.SUPPORT
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function isoDaysAgo(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }
  function isoDaysFromNow(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  function monthsAgoIso(months) {
    var d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
  }

  /**
   * Seven selectable demo scenarios (spec requires at least six; the 7th —
   * authorization failure — is added so all five failure-reason types in
   * Screen 3 are reachable from the switcher).
   */
  function buildScenarios() {
    return [
      {
        id: 'scenario-1',
        label: '₹2,000 · Insufficient balance',
        shortLabel: 'Insufficient balance',
        sip: {
          id: 'sip-demo-1', fundName: 'Axis Bluechip Fund', category: 'Equity', color: '#6c5ce7',
          amount: 2000, scheduledDay: 5, startDate: monthsAgoIso(14),
          lastSuccessfulDate: isoDaysAgo(35), status: 'active'
        },
        mandate: { id: 'mandate-demo-1', status: MandateStatus.ACTIVE, bankName: 'HDFC Bank ••1234' },
        instalment: {
          id: 'inst-demo-1', amount: 2000, scheduledDate: isoDaysAgo(3),
          status: InstalmentStatus.FAILED, failureReason: FailureReason.INSUFFICIENT_BALANCE,
          retryPermitted: true, recoveryAvailable: true, simulatedOutcome: 'success'
        }
      },
      {
        id: 'scenario-2',
        label: '₹5,000 · Expired mandate',
        shortLabel: 'Expired mandate',
        sip: {
          id: 'sip-demo-2', fundName: 'Mirae Asset Large Cap Fund', category: 'Equity', color: '#3d99ff',
          amount: 5000, scheduledDay: 10, startDate: monthsAgoIso(20),
          lastSuccessfulDate: isoDaysAgo(48), status: 'active'
        },
        mandate: { id: 'mandate-demo-2', status: MandateStatus.EXPIRED, bankName: 'ICICI Bank ••5566' },
        instalment: {
          id: 'inst-demo-2', amount: 5000, scheduledDate: isoDaysAgo(5),
          status: InstalmentStatus.FAILED, failureReason: FailureReason.MANDATE_EXPIRED,
          retryPermitted: false, recoveryAvailable: true, simulatedOutcome: 'success'
        }
      },
      {
        id: 'scenario-3',
        label: '₹1,500 · Bank outage (pending)',
        shortLabel: 'Bank outage',
        sip: {
          id: 'sip-demo-3', fundName: 'ICICI Prudential Short Term Debt Fund', category: 'Debt', color: '#1fd896',
          amount: 1500, scheduledDay: 12, startDate: monthsAgoIso(9),
          lastSuccessfulDate: isoDaysAgo(33), status: 'active'
        },
        mandate: { id: 'mandate-demo-3', status: MandateStatus.ACTIVE, bankName: 'Axis Bank ••7788' },
        instalment: {
          id: 'inst-demo-3', amount: 1500, scheduledDate: isoDaysAgo(1),
          status: InstalmentStatus.PENDING, failureReason: FailureReason.BANK_SERVER_ERROR,
          retryPermitted: false, recoveryAvailable: true, pendingResolvesAfterChecks: 2,
          seedPendingAttempt: true
        }
      },
      {
        id: 'scenario-4',
        label: '₹3,000 · Already recovered',
        shortLabel: 'Recovered',
        sip: {
          id: 'sip-demo-4', fundName: 'SBI Small Cap Fund', category: 'Equity', color: '#eebe6e',
          amount: 3000, scheduledDay: 7, startDate: monthsAgoIso(11),
          lastSuccessfulDate: isoDaysAgo(2), status: 'active'
        },
        mandate: { id: 'mandate-demo-4', status: MandateStatus.ACTIVE, bankName: 'HDFC Bank ••3344' },
        instalment: {
          id: 'inst-demo-4', amount: 3000, scheduledDate: isoDaysAgo(9),
          status: InstalmentStatus.RECOVERED, failureReason: FailureReason.INSUFFICIENT_BALANCE,
          retryPermitted: true, recoveryAvailable: true, simulatedOutcome: 'success',
          seedAsAlreadyRecovered: true, failedAtDaysAgo: 9, recoveredAtDaysAgo: 7
        }
      },
      {
        id: 'scenario-5',
        label: '₹2,500 · Retry not permitted',
        shortLabel: 'Retry not permitted',
        sip: {
          id: 'sip-demo-5', fundName: 'HDFC Mid Cap Opportunities Fund', category: 'Equity', color: '#f13745',
          amount: 2500, scheduledDay: 15, startDate: monthsAgoIso(16),
          lastSuccessfulDate: isoDaysAgo(60), status: 'active'
        },
        mandate: { id: 'mandate-demo-5', status: MandateStatus.ACTIVE, bankName: 'SBI Bank ••9900' },
        instalment: {
          id: 'inst-demo-5', amount: 2500, scheduledDate: isoDaysAgo(6),
          status: InstalmentStatus.FAILED, failureReason: FailureReason.INSUFFICIENT_BALANCE,
          retryPermitted: false, recoveryAvailable: false,
          retryBlockedReason: 'You have reached the maximum number of retry attempts allowed for this instalment.'
        }
      },
      {
        id: 'scenario-6',
        label: '₹4,000 · Unknown reason',
        shortLabel: 'Unknown reason',
        sip: {
          id: 'sip-demo-6', fundName: 'Kotak Flexicap Fund', category: 'Equity', color: '#3d99ff',
          amount: 4000, scheduledDay: 20, startDate: monthsAgoIso(7),
          lastSuccessfulDate: isoDaysAgo(50), status: 'active'
        },
        mandate: { id: 'mandate-demo-6', status: MandateStatus.ACTIVE, bankName: 'Kotak Bank ••2211' },
        instalment: {
          id: 'inst-demo-6', amount: 4000, scheduledDate: isoDaysAgo(2),
          status: InstalmentStatus.FAILED, failureReason: FailureReason.UNKNOWN,
          retryPermitted: false, recoveryAvailable: true
        }
      },
      {
        id: 'scenario-7',
        label: '₹1,800 · Authorization failure',
        shortLabel: 'Authorization failure',
        sip: {
          id: 'sip-demo-7', fundName: 'Parag Parikh Flexi Cap Fund', category: 'Equity', color: '#6c5ce7',
          amount: 1800, scheduledDay: 18, startDate: monthsAgoIso(5),
          lastSuccessfulDate: isoDaysAgo(32), status: 'active'
        },
        mandate: { id: 'mandate-demo-7', status: MandateStatus.ACTIVE, bankName: 'Yes Bank ••4455' },
        instalment: {
          id: 'inst-demo-7', amount: 1800, scheduledDate: isoDaysAgo(4),
          status: InstalmentStatus.FAILED, failureReason: FailureReason.AUTH_FAILURE,
          retryPermitted: false, recoveryAvailable: true, simulatedOutcome: 'success'
        }
      }
    ];
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** Builds a fresh, fully-seeded recovery state from the scenario catalogue. */
  function buildSeedState() {
    var scenarios = buildScenarios();
    var state = {
      version: 2,
      seededAt: new Date().toISOString(),
      scenarioFocus: 'scenario-1',
      sips: [],
      instalments: [],
      attempts: [],
      mandates: [],
      notifications: [],
      supportTickets: [],
      analyticsEvents: [],
      inFlight: {},
      usedIdempotencyKeys: {},
      settings: { remindersEnabled: true, simulateOffline: false }
    };

    scenarios.forEach(function (sc) {
      state.sips.push(Object.assign({ mandateId: sc.mandate.id }, sc.sip));
      state.mandates.push(sc.mandate);

      var inst = Object.assign({
        sipId: sc.sip.id,
        attemptSeq: 0,
        statusCheckCount: 0,
        everFailed: true
      }, sc.instalment);

      if (inst.seedAsAlreadyRecovered) {
        var failedAt = isoDaysAgo(inst.failedAtDaysAgo);
        var recoveredAt = isoDaysAgo(inst.recoveredAtDaysAgo);
        inst.failedAt = failedAt;
        inst.recoveredAt = recoveredAt;
        state.attempts.push({
          id: uid('attempt'), instalmentId: inst.id, type: AttemptType.ORIGINAL,
          status: AttemptStatus.FAILED, idempotencyKey: inst.id + '-original-0',
          createdAt: failedAt, resolvedAt: failedAt, message: 'Original debit failed — insufficient balance.'
        });
        inst.attemptSeq = 1;
        state.attempts.push({
          id: uid('attempt'), instalmentId: inst.id, type: AttemptType.RETRY,
          status: AttemptStatus.SUCCESS, idempotencyKey: inst.id + '-retry-1',
          createdAt: recoveredAt, resolvedAt: recoveredAt, message: 'Retry succeeded — instalment recovered.'
        });
        state.notifications.push(makeNotification(NotificationType.PAYMENT_FAILED, inst, sc.sip, failedAt, true));
        state.notifications.push(makeNotification(NotificationType.RECOVERY_SUCCESS, inst, sc.sip, recoveredAt, true));
      } else {
        inst.failedAt = inst.status === InstalmentStatus.PENDING ? null : isoDaysAgo(2);
        inst.recoveredAt = null;
        state.attempts.push({
          id: uid('attempt'), instalmentId: inst.id, type: AttemptType.ORIGINAL,
          status: AttemptStatus.FAILED, idempotencyKey: inst.id + '-original-0',
          createdAt: inst.scheduledDate, resolvedAt: inst.scheduledDate,
          message: FAILURE_EXPLANATIONS[inst.failureReason].title
        });
        state.notifications.push(makeNotification(NotificationType.PAYMENT_FAILED, inst, sc.sip, inst.scheduledDate, false));

        if (inst.seedPendingAttempt) {
          inst.attemptSeq = 1;
          state.attempts.push({
            id: uid('attempt'), instalmentId: inst.id, type: AttemptType.STATUS_CHECK,
            status: AttemptStatus.PENDING, idempotencyKey: inst.id + '-retry-1',
            createdAt: inst.scheduledDate, resolvedAt: null,
            message: 'Awaiting confirmation from the bank / payment provider.'
          });
          state.notifications.push(makeNotification(NotificationType.PROCESSING_UPDATE, inst, sc.sip, inst.scheduledDate, false));
        }

        if (inst.status === InstalmentStatus.FAILED) {
          state.notifications.push(makeNotification(
            inst.failureReason === FailureReason.MANDATE_EXPIRED ? NotificationType.MANDATE_REMINDER : NotificationType.OUTSTANDING_REMINDER,
            inst, sc.sip, isoDaysAgo(1), false
          ));
        }
      }

      state.instalments.push(inst);
    });

    return state;
  }

  function makeNotification(type, inst, sip, createdAt, read) {
    var copy = {};
    copy[NotificationType.PAYMENT_FAILED] = 'Your ' + inrLabel(inst.amount) + ' SIP instalment for ' + sip.fundName + ' could not be processed.';
    copy[NotificationType.OUTSTANDING_REMINDER] = 'Reminder: you still have an unresolved failed instalment for ' + sip.fundName + '.';
    copy[NotificationType.MANDATE_REMINDER] = 'Your AutoPay mandate for ' + sip.fundName + ' needs to be renewed to resume SIPs.';
    copy[NotificationType.PROCESSING_UPDATE] = 'We are still verifying a pending payment for ' + sip.fundName + ' with your bank.';
    copy[NotificationType.RECOVERY_SUCCESS] = 'Your ' + inrLabel(inst.amount) + ' SIP instalment for ' + sip.fundName + ' has been successfully recovered.';
    var titles = {};
    titles[NotificationType.PAYMENT_FAILED] = 'Payment failed';
    titles[NotificationType.OUTSTANDING_REMINDER] = 'Outstanding recovery';
    titles[NotificationType.MANDATE_REMINDER] = 'Mandate renewal needed';
    titles[NotificationType.PROCESSING_UPDATE] = 'Payment processing';
    titles[NotificationType.RECOVERY_SUCCESS] = 'Recovery successful';
    return {
      id: uid('notif'), type: type, instalmentId: inst.id, sipId: sip.id,
      title: titles[type], message: copy[type], createdAt: createdAt, read: !!read,
      category: (type === NotificationType.OUTSTANDING_REMINDER || type === NotificationType.MANDATE_REMINDER) ? 'reminder'
        : type === NotificationType.PAYMENT_FAILED ? 'alert' : 'update'
    };
  }

  function inrLabel(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

  var api = {
    FailureReason: FailureReason,
    InstalmentStatus: InstalmentStatus,
    AttemptStatus: AttemptStatus,
    AttemptType: AttemptType,
    MandateStatus: MandateStatus,
    RecoveryActionType: RecoveryActionType,
    NotificationType: NotificationType,
    TicketStatus: TicketStatus,
    FAILURE_EXPLANATIONS: FAILURE_EXPLANATIONS,
    buildScenarios: buildScenarios,
    buildSeedState: buildSeedState,
    makeNotification: makeNotification,
    inrLabel: inrLabel,
    uid: uid,
    isoDaysAgo: isoDaysAgo,
    isoDaysFromNow: isoDaysFromNow
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RecoveryData = api;
})(this);
