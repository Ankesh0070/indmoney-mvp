/**
 * SIP Pause & Resume Manager — entity definitions, enums and demo scenario
 * catalogue (A-J). Pure/no side effects, dual-exported like Features 1 & 2.
 * Scenarios that reuse an existing SIP (from Feature 1 or 2's seed data)
 * reference its id directly; scenarios that need a SIP neither feature
 * seeded (H, I, J) define one here, which pause/store.js registers into
 * the shared RecoveryStore via its additive registerSip() API only.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.PauseData = factory();
})(this, function () {
  'use strict';

  var PauseRequestStatus = {
    DRAFT: 'draft', SUBMITTED: 'submitted', PENDING_PROVIDER_APPROVAL: 'pending_provider_approval',
    APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled', EFFECTIVE: 'effective'
  };
  var ResumeRequestStatus = {
    DRAFT: 'draft', SUBMITTED: 'submitted', PENDING_PROVIDER_APPROVAL: 'pending_provider_approval',
    REQUIRES_REAUTHORIZATION: 'requires_reauthorization', APPROVED: 'approved',
    REJECTED: 'rejected', CANCELLED: 'cancelled', EFFECTIVE: 'effective'
  };
  var SipLifecycleStatus = {
    ACTIVE: 'active', PAUSE_REQUESTED: 'pause_requested', PAUSED: 'paused',
    RESUME_REQUESTED: 'resume_requested', RESUME_SCHEDULED: 'resume_scheduled',
    PROVIDER_ACTION_REQUIRED: 'provider_action_required', CANCELLED: 'cancelled'
  };
  var ScheduleEntryStatus = {
    SCHEDULED: 'scheduled', SKIPPED_PAUSED: 'skipped_paused',
    PROCESSING_PROTECTED: 'processing_protected', RESUMED: 'resumed'
  };

  var OPEN_PAUSE_STATUSES = [PauseRequestStatus.SUBMITTED, PauseRequestStatus.PENDING_PROVIDER_APPROVAL, PauseRequestStatus.APPROVED];
  var CANCELLABLE_PAUSE_STATUSES = [PauseRequestStatus.SUBMITTED, PauseRequestStatus.PENDING_PROVIDER_APPROVAL, PauseRequestStatus.APPROVED];
  var OPEN_RESUME_STATUSES = [
    ResumeRequestStatus.SUBMITTED, ResumeRequestStatus.PENDING_PROVIDER_APPROVAL,
    ResumeRequestStatus.REQUIRES_REAUTHORIZATION, ResumeRequestStatus.APPROVED
  ];

  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10); }

  function buildScenarios() {
    return [
      {
        id: 'pause-a', label: 'A · ₹2,000 · Eligible, 2-cycle pause approved', shortLabel: 'A: Approved pause',
        sipId: 'sip-demo-1',
        capability: {
          sipId: 'sip-demo-1', pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 3,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        },
        note: 'Reuses Feature 1’s Axis Bluechip SIP (also used by Feature 2’s scenario A) to show all three features sharing one record.'
      },
      {
        id: 'pause-b', label: 'B · ₹3,000 · Pause not supported', shortLabel: 'B: Unsupported',
        sipId: 'sip-sched-b',
        capability: {
          sipId: 'sip-sched-b', pauseSupported: false, minCycles: 0, maxCycles: 0, noticeDays: 0,
          approvalRequired: false, mandateImplication: 'none', earlyResumeSupported: false,
          resumeRequiresReauth: false, cancellationSupported: false,
          simulatedPauseDecision: null, simulatedResumeDecision: null,
          stateRestrictions: 'This fund house has not enabled temporary pause for this mandate type in this demo.'
        }
      },
      {
        id: 'pause-c', label: 'C · ₹1,500 · Pause rejected by provider', shortLabel: 'C: Gets rejected',
        sipId: 'sip-sched-c',
        capability: {
          sipId: 'sip-sched-c', pauseSupported: true, minCycles: 1, maxCycles: 2, noticeDays: 2,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'reject', simulatedResumeDecision: 'approve',
          rejectionReason: 'The fund house did not approve this pause request for the current cycle. Your SIP continues as scheduled.',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        }
      },
      {
        id: 'pause-d', label: 'D · ₹5,000 · Pending provider approval', shortLabel: 'D: Pending approval',
        sipId: 'sip-sched-e',
        capability: {
          sipId: 'sip-sched-e', pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 5,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'pending', simulatedResumeDecision: 'approve',
          stateRestrictions: 'This provider takes longer to confirm pause requests in this demo.'
        }
      },
      {
        id: 'pause-e', label: 'E · ₹2,500 · Already paused, early resume OK', shortLabel: 'E: Paused, can resume early',
        sipId: 'sip-sched-f',
        capability: {
          sipId: 'sip-sched-f', pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 2,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        },
        preSeed: { pauseCycles: 2, pauseElapsedCycles: 1 }
      },
      {
        id: 'pause-f', label: 'F · ₹4,000 · Early resume needs reauth', shortLabel: 'F: Resume needs reauth',
        sipId: 'sip-sched-d',
        capability: {
          sipId: 'sip-sched-d', pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 3,
          approvalRequired: true, mandateImplication: 'reauth_may_be_required', earlyResumeSupported: true,
          resumeRequiresReauth: true, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'Resuming before the scheduled date requires reauthorizing this mandate in this demo.'
        },
        preSeed: { pauseCycles: 2, pauseElapsedCycles: 0 }
      },
      {
        id: 'pause-g', label: 'G · ₹3,500 · Conflicts with a pending date change', shortLabel: 'G: Scheduling conflict',
        sipId: 'sip-sched-g',
        capability: {
          sipId: 'sip-sched-g', pauseSupported: true, minCycles: 1, maxCycles: 2, noticeDays: 3,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        },
        seedConflictingDateChange: { requestedDay: 15 }
      },
      {
        id: 'pause-h', label: 'H · ₹2,000 · Next instalment already processing', shortLabel: 'H: Processing protected',
        sipId: 'sip-pause-h',
        newSip: { id: 'sip-pause-h', fundName: 'HDFC Balanced Advantage Fund', category: 'Hybrid', color: '#eebe6e', amount: 2000, scheduledDay: 12, startDate: null, lastSuccessfulDate: null, status: 'active' },
        newInstalment: { id: 'inst-pause-h', amount: 2000, status: 'pending', failureReason: null },
        capability: {
          sipId: 'sip-pause-h', pauseSupported: true, minCycles: 1, maxCycles: 3, noticeDays: 2,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'An instalment already being processed cannot be skipped once it has started.'
        }
      },
      {
        id: 'pause-i', label: 'I · ₹6,000 · Scheduled resume via Demo Clock', shortLabel: 'I: DemoClock resume',
        sipId: 'sip-pause-i',
        newSip: { id: 'sip-pause-i', fundName: 'ICICI Prudential Technology Fund', category: 'Equity', color: '#3d99ff', amount: 6000, scheduledDay: 20, startDate: null, lastSuccessfulDate: null, status: 'active' },
        capability: {
          sipId: 'sip-pause-i', pauseSupported: true, minCycles: 1, maxCycles: 2, noticeDays: 2,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        },
        preSeed: { pauseCycles: 1, pauseElapsedCycles: 0 }
      },
      {
        id: 'pause-j', label: 'J · ₹1,000 · Resumed, first payment not yet succeeded', shortLabel: 'J: Awaiting first payment',
        sipId: 'sip-pause-j',
        newSip: { id: 'sip-pause-j', fundName: 'Motilal Oswal Midcap Fund', category: 'Equity', color: '#6c5ce7', amount: 1000, scheduledDay: 3, startDate: null, lastSuccessfulDate: null, status: 'active' },
        newInstalment: { id: 'inst-pause-j-first', amount: 1000, status: 'pending', failureReason: null },
        capability: {
          sipId: 'sip-pause-j', pauseSupported: true, minCycles: 1, maxCycles: 2, noticeDays: 2,
          approvalRequired: true, mandateImplication: 'none', earlyResumeSupported: true,
          resumeRequiresReauth: false, cancellationSupported: true,
          simulatedPauseDecision: 'approve', simulatedResumeDecision: 'approve',
          stateRestrictions: 'No restrictions recorded for this mandate in this demo.'
        },
        preSeed: { pauseCycles: 1, pauseElapsedCycles: 1, alreadyResumed: true, firstPostResumeInstalmentId: 'inst-pause-j-first' }
      }
    ];
  }

  function makeMandateFor(sipId) {
    return { id: 'mandate-' + sipId, status: 'active', bankName: 'Demo Bank ••0000' };
  }

  return {
    PauseRequestStatus: PauseRequestStatus, ResumeRequestStatus: ResumeRequestStatus,
    SipLifecycleStatus: SipLifecycleStatus, ScheduleEntryStatus: ScheduleEntryStatus,
    OPEN_PAUSE_STATUSES: OPEN_PAUSE_STATUSES, CANCELLABLE_PAUSE_STATUSES: CANCELLABLE_PAUSE_STATUSES,
    OPEN_RESUME_STATUSES: OPEN_RESUME_STATUSES,
    buildScenarios: buildScenarios, makeMandateFor: makeMandateFor, uid: uid
  };
});
