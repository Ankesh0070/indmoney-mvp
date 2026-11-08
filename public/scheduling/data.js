/**
 * Salary-Aligned SIP Scheduler — entity definitions, enums and demo
 * scenario catalogue (A-H). Pure/no side effects, dual-exported like the
 * SIP Recovery Assistant's data.js. Scenarios that reuse a Feature 1 SIP
 * reference its existing id directly; scenarios that need a SIP Feature 1
 * never seeded (B, C, D, E, F, G) define one here, which scheduling/store.js
 * registers into the shared RecoveryStore via its additive registerSip()
 * API — never by editing Feature 1's own seed.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.SchedulingData = factory();
})(this, function () {
  'use strict';

  var IncomePattern = { FIXED: 'fixed', VARIABLE: 'variable', IRREGULAR: 'irregular' };

  var RequestStatus = {
    DRAFT: 'draft',
    AWAITING_CONFIRMATION: 'awaiting_confirmation',
    SUBMITTED: 'submitted',
    PENDING_PROVIDER_APPROVAL: 'pending_provider_approval',
    REQUIRES_REAUTHORIZATION: 'requires_reauthorization',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    EFFECTIVE: 'effective'
  };

  var OPEN_REQUEST_STATUSES = [
    RequestStatus.AWAITING_CONFIRMATION, RequestStatus.SUBMITTED, RequestStatus.PENDING_PROVIDER_APPROVAL,
    RequestStatus.REQUIRES_REAUTHORIZATION, RequestStatus.APPROVED
  ];
  var CANCELLABLE_STATUSES = [
    RequestStatus.AWAITING_CONFIRMATION, RequestStatus.SUBMITTED, RequestStatus.PENDING_PROVIDER_APPROVAL,
    RequestStatus.REQUIRES_REAUTHORIZATION, RequestStatus.APPROVED
  ];

  var MismatchStatus = { ALIGNED: 'aligned', MISMATCH: 'mismatch', UNCERTAIN: 'uncertain', SAME_DAY: 'same_day', UNKNOWN: 'unknown' };
  var EffectiveRule = { NEXT_CYCLE: 'next_cycle', AFTER_NOTICE: 'after_notice' };

  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10); }

  function buildScenarios() {
    return [
      {
        id: 'sched-a', label: 'A · ₹2,000 · SIP before salary (changeable)', shortLabel: 'A: Mismatch, changeable',
        reuseSipId: 'sip-demo-1',
        capability: { sipId: 'sip-demo-1', canChangeDate: true, allowedDates: [7, 10, 12, 15], minNoticeDays: 3, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 7 },
        note: 'Reuses Feature 1\'s Axis Bluechip SIP (and its real failed instalment) to show the cross-feature link.'
      },
      {
        id: 'sched-b', label: 'B · ₹3,000 · No mismatch', shortLabel: 'B: No mismatch',
        sip: { id: 'sip-sched-b', fundName: 'Nippon India Large Cap Fund', category: 'Equity', color: '#3d99ff', amount: 3000, scheduledDay: 10, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-b', amount: 3000, status: 'success', failureReason: null },
        capability: { sipId: 'sip-sched-b', canChangeDate: true, allowedDates: [10, 15, 20], minNoticeDays: 2, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 1 }
      },
      {
        id: 'sched-c', label: 'C · ₹1,500 · Variable income (uncertain)', shortLabel: 'C: Variable, uncertain',
        sip: { id: 'sip-sched-c', fundName: 'Tata Digital India Fund', category: 'Equity', color: '#eebe6e', amount: 1500, scheduledDay: 7, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-c', amount: 1500, status: 'success', failureReason: null },
        capability: { sipId: 'sip-sched-c', canChangeDate: true, allowedDates: [11, 14, 18], minNoticeDays: 3, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.VARIABLE, variableStart: 5, variableEnd: 10 }
      },
      {
        id: 'sched-d', label: 'D · ₹4,000 · Short-month projection', shortLabel: 'D: Short-month',
        sip: { id: 'sip-sched-d', fundName: 'Quant Active Fund', category: 'Equity', color: '#6c5ce7', amount: 4000, scheduledDay: 28, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-d', amount: 4000, status: 'success', failureReason: null },
        capability: { sipId: 'sip-sched-d', canChangeDate: true, allowedDates: [28, 29, 30], minNoticeDays: 3, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 31 },
        note: 'Day 31 projects to the last calendar day of shorter months for income-date display only — the SIP\'s own day (28) is never auto-shifted.'
      },
      {
        id: 'sched-e', label: 'E · ₹5,000 · Date change unavailable', shortLabel: 'E: Unavailable',
        sip: { id: 'sip-sched-e', fundName: 'Edelweiss Mid Cap Fund', category: 'Equity', color: '#f13745', amount: 5000, scheduledDay: 18, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-e', amount: 5000, status: 'success', failureReason: null },
        capability: { sipId: 'sip-sched-e', canChangeDate: false, allowedDates: [], minNoticeDays: 0, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: false, simulatedDecision: null },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 20 }
      },
      {
        id: 'sched-f', label: 'F · ₹2,500 · Provider rejects change', shortLabel: 'F: Gets rejected',
        sip: { id: 'sip-sched-f', fundName: 'DSP Flexi Cap Fund', category: 'Equity', color: '#3d99ff', amount: 2500, scheduledDay: 5, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-f', amount: 2500, status: 'success', failureReason: null },
        capability: {
          sipId: 'sip-sched-f', canChangeDate: true, allowedDates: [9, 12, 15], minNoticeDays: 3, effectiveRule: EffectiveRule.AFTER_NOTICE, requiresReauth: false, cancellationSupported: true,
          simulatedDecision: 'reject', rejectionReason: 'The fund house did not approve this debit-date change for the current cycle. Your SIP date has not been changed.'
        },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 9 }
      },
      {
        id: 'sched-g', label: 'G · ₹3,500 · Needs reauthorization', shortLabel: 'G: Needs reauth',
        sip: { id: 'sip-sched-g', fundName: 'Canara Robeco Bluechip Fund', category: 'Equity', color: '#1fd896', amount: 3500, scheduledDay: 8, startDate: null, lastSuccessfulDate: null, status: 'active' },
        instalment: { id: 'inst-sched-g', amount: 3500, status: 'success', failureReason: null },
        capability: { sipId: 'sip-sched-g', canChangeDate: true, allowedDates: [12, 15], minNoticeDays: 5, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: true, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 12 }
      },
      {
        id: 'sched-h', label: 'H · Multiple SIPs, change one only', shortLabel: 'H: Multi-SIP isolation',
        reuseSipId: 'sip-demo-2',
        companionSipId: 'sip-demo-6',
        capability: { sipId: 'sip-demo-2', canChangeDate: true, allowedDates: [12, 15, 18], minNoticeDays: 3, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        companionCapability: { sipId: 'sip-demo-6', canChangeDate: true, allowedDates: [22, 25], minNoticeDays: 3, effectiveRule: EffectiveRule.NEXT_CYCLE, requiresReauth: false, cancellationSupported: true, simulatedDecision: 'approve' },
        defaultIncome: { pattern: IncomePattern.FIXED, fixedDay: 1 },
        note: 'Two independent SIPs on different dates — changing this one must never affect Kotak Flexicap\'s own schedule.'
      }
    ];
  }

  function makeMandateFor(sipId) {
    return { id: 'mandate-' + sipId, status: 'active', bankName: 'Demo Bank ••0000' };
  }

  return {
    IncomePattern: IncomePattern, RequestStatus: RequestStatus, OPEN_REQUEST_STATUSES: OPEN_REQUEST_STATUSES,
    CANCELLABLE_STATUSES: CANCELLABLE_STATUSES, MismatchStatus: MismatchStatus, EffectiveRule: EffectiveRule,
    buildScenarios: buildScenarios, makeMandateFor: makeMandateFor, uid: uid
  };
});
