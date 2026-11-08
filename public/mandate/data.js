/**
 * AutoPay Health & Mandate Repair Assistant — entity definitions, enums and
 * demo scenario catalogue (A-L). Pure/no side effects, dual-exported like
 * Features 1-3. Every scenario defines its own new demo SIP (own amount,
 * own mandate) so Feature 4 never collides with another feature's seed
 * data; mandate/store.js registers each SIP into the shared RecoveryStore
 * via its additive registerSip()/registerMandate() API only.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.MandateData = factory();
})(this, function () {
  'use strict';

  // The mandate's user-facing health status (Screen 2's exact label set).
  var MandateHealthStatus = {
    ACTIVE: 'active',
    PENDING_AUTHORIZATION: 'pending_authorization',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    SUSPENDED: 'suspended',
    PROVIDER_VERIFICATION_PENDING: 'provider_verification_pending',
    UNKNOWN: 'unknown'
  };

  // The specific diagnostic code behind a status (Screen 3's 8 detection
  // categories, plus the two non-mandate outcomes a mock provider can
  // report: a healthy mandate, and a payment failure that is NOT a mandate
  // problem at all).
  var MandateIssueType = {
    EXPIRED: 'expired', REVOKED: 'revoked', REJECTED: 'rejected', PENDING: 'pending',
    SUSPENDED: 'suspended', AUTH_MISMATCH: 'auth_mismatch', PROVIDER_DELAY: 'provider_delay',
    UNKNOWN_STATE: 'unknown_state', HEALTHY: 'healthy', INSUFFICIENT_BALANCE: 'insufficient_balance'
  };

  var ISSUE_TO_STATUS = {};
  ISSUE_TO_STATUS[MandateIssueType.EXPIRED] = MandateHealthStatus.EXPIRED;
  ISSUE_TO_STATUS[MandateIssueType.REVOKED] = MandateHealthStatus.REVOKED;
  ISSUE_TO_STATUS[MandateIssueType.REJECTED] = MandateHealthStatus.REJECTED;
  ISSUE_TO_STATUS[MandateIssueType.PENDING] = MandateHealthStatus.PENDING_AUTHORIZATION;
  ISSUE_TO_STATUS[MandateIssueType.SUSPENDED] = MandateHealthStatus.SUSPENDED;
  ISSUE_TO_STATUS[MandateIssueType.AUTH_MISMATCH] = MandateHealthStatus.UNKNOWN;
  ISSUE_TO_STATUS[MandateIssueType.PROVIDER_DELAY] = MandateHealthStatus.PROVIDER_VERIFICATION_PENDING;
  ISSUE_TO_STATUS[MandateIssueType.UNKNOWN_STATE] = MandateHealthStatus.UNKNOWN;
  ISSUE_TO_STATUS[MandateIssueType.HEALTHY] = MandateHealthStatus.ACTIVE;
  ISSUE_TO_STATUS[MandateIssueType.INSUFFICIENT_BALANCE] = MandateHealthStatus.ACTIVE;

  var PaymentMethod = { UPI_AUTOPAY: 'demo_upi_autopay', ENACH: 'demo_enach', OTHER: 'other' };

  var RepairType = { REAUTHORIZATION: 'reauthorization', REPLACEMENT: 'replacement' };

  // Screen 8's status-tracker vocabulary. ISSUE_DETECTED / ACTION_REQUIRED
  // describe a mandate with no repair request yet (derived, not stored);
  // everything else is a MandateRepairRequest's own stored status.
  var RepairRequestStatus = {
    ISSUE_DETECTED: 'issue_detected', ACTION_REQUIRED: 'action_required',
    REPAIR_REQUESTED: 'repair_requested', AUTHORIZATION_PENDING: 'authorization_pending',
    PROVIDER_VERIFICATION_PENDING: 'provider_verification_pending',
    REPAIRED: 'repaired', REJECTED: 'rejected', CANCELLED: 'cancelled', UNRESOLVED: 'unresolved'
  };
  var OPEN_REPAIR_STATUSES = [
    RepairRequestStatus.REPAIR_REQUESTED, RepairRequestStatus.AUTHORIZATION_PENDING,
    RepairRequestStatus.PROVIDER_VERIFICATION_PENDING
  ];
  var CANCELLABLE_REPAIR_STATUSES = [RepairRequestStatus.REPAIR_REQUESTED, RepairRequestStatus.AUTHORIZATION_PENDING];

  var AuthorizationOutcome = {
    APPROVED: 'approved', REJECTED: 'rejected', PENDING: 'pending',
    EXPIRED: 'expired', PROVIDER_UNAVAILABLE: 'provider_unavailable'
  };

  var ReplacementStatus = {
    REQUESTED: 'requested', AUTHORIZATION_PENDING: 'authorization_pending',
    APPROVED_NOT_EFFECTIVE: 'approved_not_effective', EFFECTIVE: 'effective',
    REJECTED: 'rejected', CANCELLED: 'cancelled'
  };
  var OPEN_REPLACEMENT_STATUSES = [
    ReplacementStatus.REQUESTED, ReplacementStatus.AUTHORIZATION_PENDING, ReplacementStatus.APPROVED_NOT_EFFECTIVE
  ];

  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10); }

  function makeMandateFor(sipId, label) {
    return { id: 'mandate-' + sipId, status: 'active', bankName: label || 'Demo Bank ••0000' };
  }

  /**
   * Each scenario's `capability` is a MandateProviderCapability: the
   * deterministic mock-provider rulebook for that one SIP's mandate. No
   * field here is ever chosen randomly at runtime.
   */
  function buildScenarios() {
    return [
      {
        id: 'mandate-a', label: 'A · ₹2,000 · Expired mandate, repair succeeds', shortLabel: 'A: Expired → repaired',
        sipId: 'sip-mandate-a',
        newSip: { id: 'sip-mandate-a', fundName: 'UTI Nifty Index Fund', category: 'Equity', color: '#6c5ce7', amount: 2000, scheduledDay: 10, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-a', issueType: 'expired', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 2500, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-b', label: 'B · ₹5,000 · Revoked, replacement required', shortLabel: 'B: Revoked → replacement',
        sipId: 'sip-mandate-b',
        newSip: { id: 'sip-mandate-b', fundName: 'HDFC Top 100 Fund', category: 'Equity', color: '#eebe6e', amount: 5000, scheduledDay: 15, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-b', issueType: 'revoked', paymentMethod: PaymentMethod.ENACH,
          maxDebitAmount: 6000, hasValidity: false, validUntil: null,
          reauthSupported: false, replacementSupported: true, cancellationSupported: true,
          simulatedReauthDecision: null, simulatedReplacementDecision: 'approve',
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-c', label: 'C · ₹1,500 · Authorization rejected, repair unsuccessful', shortLabel: 'C: Rejected → fails',
        sipId: 'sip-mandate-c',
        newSip: { id: 'sip-mandate-c', fundName: 'SBI Bluechip Fund', category: 'Equity', color: '#3d99ff', amount: 1500, scheduledDay: 8, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-c', issueType: 'rejected', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 2000, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: true, cancellationSupported: true,
          simulatedReauthDecision: 'reject', simulatedReplacementDecision: null,
          rejectionReason: 'The bank or payment provider did not approve this authorization.',
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-d', label: 'D · ₹3,000 · Pending authorization, verification delayed', shortLabel: 'D: Pending (delayed)',
        sipId: 'sip-mandate-d',
        newSip: { id: 'sip-mandate-d', fundName: 'Mirae Asset Midcap Fund', category: 'Equity', color: '#f27a7a', amount: 3000, scheduledDay: 12, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-d', issueType: 'pending', paymentMethod: PaymentMethod.ENACH,
          maxDebitAmount: 3500, hasValidity: false, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'pending', simulatedReplacementDecision: null,
          providerVerificationDelayed: true, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-e', label: 'E · ₹2,500 · Healthy mandate, no action needed', shortLabel: 'E: Healthy',
        sipId: 'sip-mandate-e',
        newSip: { id: 'sip-mandate-e', fundName: 'Axis Long Term Equity Fund', category: 'ELSS', color: '#1fd896', amount: 2500, scheduledDay: 5, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-e', issueType: 'healthy', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 3000, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: true, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: 'approve',
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-f', label: 'F · ₹4,000 · Insufficient balance (mandate healthy)', shortLabel: 'F: Not a mandate issue',
        sipId: 'sip-mandate-f',
        newSip: { id: 'sip-mandate-f', fundName: 'Nippon India Growth Fund', category: 'Equity', color: '#9b6cff', amount: 4000, scheduledDay: 18, startDate: null, lastSuccessfulDate: null, status: 'active' },
        newInstalment: { id: 'inst-mandate-f', amount: 4000, status: 'failed', failureReason: 'insufficient_balance' },
        capability: {
          sipId: 'sip-mandate-f', issueType: 'insufficient_balance', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 5000, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: true, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: 'approve',
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-g', label: 'G · ₹6,000 · Suspended, repair supported', shortLabel: 'G: Suspended → repaired',
        sipId: 'sip-mandate-g',
        newSip: { id: 'sip-mandate-g', fundName: 'Kotak Emerging Equity Fund', category: 'Equity', color: '#e85d75', amount: 6000, scheduledDay: 22, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-g', issueType: 'suspended', paymentMethod: PaymentMethod.ENACH,
          maxDebitAmount: 7000, hasValidity: false, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-h', label: 'H · ₹3,500 · Provider unavailable, safe verification', shortLabel: 'H: Provider unavailable',
        sipId: 'sip-mandate-h',
        newSip: { id: 'sip-mandate-h', fundName: 'DSP Nifty 50 Index Fund', category: 'Index', color: '#5bc0be', amount: 3500, scheduledDay: 25, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-h', issueType: 'provider_delay', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 4000, hasValidity: false, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'provider_unavailable', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        }
      },
      {
        id: 'mandate-i', label: 'I · ₹2,000 · Paused SIP, mandate repaired without resuming', shortLabel: 'I: Paused, repaired',
        sipId: 'sip-mandate-i',
        newSip: { id: 'sip-mandate-i', fundName: 'Franklin India Prima Fund', category: 'Equity', color: '#f6a623', amount: 2000, scheduledDay: 14, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-i', issueType: 'expired', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 2500, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        },
        seedPaused: true
      },
      {
        id: 'mandate-j', label: 'J · ₹4,500 · Existing pending repair, duplicate blocked', shortLabel: 'J: Duplicate blocked',
        sipId: 'sip-mandate-j',
        newSip: { id: 'sip-mandate-j', fundName: 'ICICI Prudential Value Discovery', category: 'Equity', color: '#4a90e2', amount: 4500, scheduledDay: 9, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-j', issueType: 'expired', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 5000, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        },
        seedOpenRepair: true
      },
      {
        id: 'mandate-k', label: 'K · ₹5,500 · Replacement approved, not yet effective', shortLabel: 'K: Approved, pending effect',
        sipId: 'sip-mandate-k',
        newSip: { id: 'sip-mandate-k', fundName: 'Quant Tax Plan', category: 'ELSS', color: '#7ed957', amount: 5500, scheduledDay: 20, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-mandate-k', issueType: 'revoked', paymentMethod: PaymentMethod.ENACH,
          maxDebitAmount: 6000, hasValidity: false, validUntil: null,
          reauthSupported: false, replacementSupported: true, cancellationSupported: true,
          simulatedReauthDecision: null, simulatedReplacementDecision: 'approve',
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 10
        },
        seedApprovedReplacement: true
      },
      {
        id: 'mandate-l', label: 'L · ₹1,000 · Repaired, but a prior failed instalment remains unresolved', shortLabel: 'L: Repaired, old failure remains',
        sipId: 'sip-mandate-l',
        newSip: { id: 'sip-mandate-l', fundName: 'Parag Parikh Tax Saver Fund', category: 'ELSS', color: '#c77dff', amount: 1000, scheduledDay: 2, startDate: null, lastSuccessfulDate: null, status: 'active' },
        newInstalment: { id: 'inst-mandate-l', amount: 1000, status: 'failed', failureReason: 'mandate_expired' },
        capability: {
          sipId: 'sip-mandate-l', issueType: 'expired', paymentMethod: PaymentMethod.UPI_AUTOPAY,
          maxDebitAmount: 1500, hasValidity: true, validUntil: null,
          reauthSupported: true, replacementSupported: false, cancellationSupported: true,
          simulatedReauthDecision: 'approve', simulatedReplacementDecision: null,
          providerVerificationDelayed: false, replacementEffectiveDelayDays: 0
        },
        seedRepaired: true
      }
    ];
  }

  return {
    MandateHealthStatus: MandateHealthStatus, MandateIssueType: MandateIssueType, ISSUE_TO_STATUS: ISSUE_TO_STATUS,
    PaymentMethod: PaymentMethod, RepairType: RepairType,
    RepairRequestStatus: RepairRequestStatus, OPEN_REPAIR_STATUSES: OPEN_REPAIR_STATUSES, CANCELLABLE_REPAIR_STATUSES: CANCELLABLE_REPAIR_STATUSES,
    AuthorizationOutcome: AuthorizationOutcome,
    ReplacementStatus: ReplacementStatus, OPEN_REPLACEMENT_STATUSES: OPEN_REPLACEMENT_STATUSES,
    buildScenarios: buildScenarios, makeMandateFor: makeMandateFor, uid: uid
  };
});
