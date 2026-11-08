/**
 * SIP Cash-Flow Planner — pure calculation engine. Every function here is
 * side-effect-free and takes plain data in, so the same functions back both
 * the live store and the automated test suite (and the what-if simulator,
 * which must never be able to mutate real state by construction — it can
 * only ever call these pure functions on cloned/overridden inputs).
 * All monetary amounts are integer paise throughout; no floating-point
 * rupee arithmetic is ever used for a total.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.CashFlowEngine = factory(window.CashFlowData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var GapStatus = Data.GapStatus;
  var EventKind = Data.EventKind;
  var Engine = {};

  // ───────────────────────── date projection ─────────────────────────

  /** Every occurrence of `day`-of-month from the first one on/after `fromKey` through `toKey` inclusive. */
  Engine.occurrencesOfDay = function (day, fromKey, toKey) {
    if (!day) return [];
    var p = DateUtils.parseKey(fromKey);
    var candidate = DateUtils.keyForDayInMonth(p.year, p.month0, day);
    if (DateUtils.compareKeys(candidate, fromKey) < 0) candidate = DateUtils.addMonths(fromKey, 1, day);
    var out = [];
    var guard = 0;
    while (DateUtils.compareKeys(candidate, toKey) <= 0 && guard < 24) {
      out.push(candidate);
      candidate = DateUtils.addMonths(candidate, 1, day);
      guard++;
    }
    return out;
  };

  // ───────────────────────── SIP occurrences ─────────────────────────

  /**
   * ctxList: [{ sipId, fundName, amountPaise, debitDay, pauseInfo, mandateHealth }]
   * pauseInfo, when the SIP has an EFFECTIVE pause, is { affectedDateKeys, resumeDateKey };
   * dates in affectedDateKeys are skipped — they are not scheduled obligations.
   * A pending (not-yet-effective) pause/date-change is simply not reflected
   * in ctxList's debitDay/pauseInfo by the caller, so it has no effect here.
   */
  Engine.buildSipOccurrences = function (ctxList, todayKey, windowEndKey) {
    var out = [];
    (ctxList || []).forEach(function (ctx) {
      var dates = Engine.occurrencesOfDay(ctx.debitDay, todayKey, windowEndKey);
      dates.forEach(function (dateKey, idx) {
        if (ctx.pauseInfo && ctx.pauseInfo.affectedDateKeys && ctx.pauseInfo.affectedDateKeys.indexOf(dateKey) !== -1) return;
        out.push({
          sipId: ctx.sipId, fundName: ctx.fundName, amountPaise: ctx.amountPaise, dateKey: dateKey,
          confirmed: idx === 0, mandateHealth: ctx.mandateHealth || null
        });
      });
    });
    out.sort(function (a, b) { return DateUtils.compareKeys(a.dateKey, b.dateKey) || a.sipId.localeCompare(b.sipId); });
    return out;
  };

  Engine.sumPaise = function (occurrences) {
    return occurrences.reduce(function (sum, o) { return sum + o.amountPaise; }, 0);
  };

  Engine.withinDays = function (occurrences, todayKey, days) {
    var endKey = DateUtils.addDays(todayKey, days);
    return occurrences.filter(function (o) { return DateUtils.compareKeys(o.dateKey, endKey) <= 0; });
  };

  Engine.withinCalendarMonth = function (occurrences, refKey) {
    var p = DateUtils.parseKey(refKey);
    return occurrences.filter(function (o) {
      var q = DateUtils.parseKey(o.dateKey);
      return q.year === p.year && q.month0 === p.month0;
    });
  };

  Engine.withinFollowingCalendarMonth = function (occurrences, refKey) {
    var nextMonthKey = DateUtils.addMonths(refKey, 1, 1);
    return Engine.withinCalendarMonth(occurrences, nextMonthKey);
  };

  /** Groups same-date occurrences (e.g. two SIPs debiting the same day) into one combined demand. */
  Engine.groupOccurrencesByDate = function (occurrences) {
    var byDate = {};
    var order = [];
    occurrences.forEach(function (o) {
      if (!byDate[o.dateKey]) { byDate[o.dateKey] = { dateKey: o.dateKey, totalPaise: 0, items: [] }; order.push(o.dateKey); }
      byDate[o.dateKey].totalPaise += o.amountPaise;
      byDate[o.dateKey].items.push(o);
    });
    order.sort(DateUtils.compareKeys);
    return order.map(function (k) { return byDate[k]; });
  };

  // ───────────────────────── income / expense events ─────────────────────────

  /**
   * `income` is Feature 2's own raw income record ({pattern, fixedDay} /
   * {pattern, variableStart, variableEnd} / {pattern:'irregular'} / null).
   * `profile` carries the amount Feature 2 does not track.
   */
  Engine.buildIncomeEvents = function (profile, income, manualIncomeEvents, todayKey, windowEndKey) {
    var events = [];
    if (income && !income.skipped && income.pattern === 'fixed' && income.fixedDay && profile.incomeAmountPaise != null) {
      Engine.occurrencesOfDay(income.fixedDay, todayKey, windowEndKey).forEach(function (dateKey) {
        events.push({ kind: EventKind.INCOME, dateKey: dateKey, amountPaise: profile.incomeAmountPaise, label: 'Expected income', uncertain: false });
      });
    } else if (income && !income.skipped && income.pattern === 'variable' && income.variableStart && income.variableEnd && profile.incomeAmountPaise != null) {
      Engine.occurrencesOfDay(income.variableStart, todayKey, windowEndKey).forEach(function (startKey) {
        var p = DateUtils.parseKey(startKey);
        var endKey = DateUtils.keyForDayInMonth(p.year, p.month0, income.variableEnd);
        events.push({
          kind: EventKind.INCOME, dateKey: startKey, rangeEndKey: endKey, amountPaise: profile.incomeAmountPaise,
          label: 'Expected income (estimated window, earliest date shown)', uncertain: true
        });
      });
    }
    (manualIncomeEvents || []).forEach(function (ev) {
      if (DateUtils.compareKeys(ev.dateKey, todayKey) >= 0 && DateUtils.compareKeys(ev.dateKey, windowEndKey) <= 0) {
        events.push({ kind: EventKind.INCOME, dateKey: ev.dateKey, amountPaise: ev.amountPaise, label: ev.label || 'Manually entered income', uncertain: false });
      }
    });
    events.sort(function (a, b) { return DateUtils.compareKeys(a.dateKey, b.dateKey); });
    return events;
  };

  Engine.buildExpenseEvents = function (profile, todayKey, windowEndKey) {
    var events = [];
    (profile.recurringExpenses || []).forEach(function (exp) {
      Engine.occurrencesOfDay(exp.dayOfMonth, todayKey, windowEndKey).forEach(function (dateKey) {
        events.push({ kind: EventKind.EXPENSE, dateKey: dateKey, amountPaise: exp.amountPaise, label: exp.label, category: exp.category, uncertain: false, expenseId: exp.id });
      });
    });
    (profile.oneTimeExpenses || []).forEach(function (exp) {
      var dateKey = exp.dateKey || (exp.dayOffsetFromToday != null ? DateUtils.addDays(todayKey, exp.dayOffsetFromToday) : null);
      if (!dateKey) return;
      if (DateUtils.compareKeys(dateKey, todayKey) >= 0 && DateUtils.compareKeys(dateKey, windowEndKey) <= 0) {
        events.push({ kind: EventKind.EXPENSE, dateKey: dateKey, amountPaise: exp.amountPaise, label: exp.label, category: 'one_time', uncertain: false, expenseId: exp.id });
      }
    });
    events.sort(function (a, b) { return DateUtils.compareKeys(a.dateKey, b.dateKey); });
    return events;
  };

  // ───────────────────────── timeline ─────────────────────────

  /**
   * Chronological running-balance view (Screen 4). Same-day ordering here
   * always applies income, then expenses, then SIPs — a simplifying,
   * clearly-labelled assumption for the combined estimate. (The gap
   * detector below uses a separate, more conservative same-day rule.)
   * When openingCashPaise is unknown, no running balance is fabricated.
   */
  Engine.buildTimeline = function (profile, incomeEvents, expenseEvents, sipOccurrences, todayKey) {
    var hasOpening = profile.openingCashPaise != null;
    var entries = [];
    incomeEvents.forEach(function (e) { entries.push(Object.assign({ kindOrder: 0 }, e)); });
    expenseEvents.forEach(function (e) { entries.push(Object.assign({ kindOrder: 1, amountPaise: -e.amountPaise }, e)); });
    sipOccurrences.forEach(function (o) {
      entries.push({ kind: EventKind.SIP, kindOrder: 2, dateKey: o.dateKey, amountPaise: -o.amountPaise, label: o.fundName, sipId: o.sipId, uncertain: false, confirmed: o.confirmed });
    });
    entries.sort(function (a, b) { return DateUtils.compareKeys(a.dateKey, b.dateKey) || a.kindOrder - b.kindOrder; });

    var running = hasOpening ? profile.openingCashPaise : 0;
    entries.forEach(function (e) {
      running += e.amountPaise;
      e.closingBalancePaise = hasOpening ? running : null;
    });

    return {
      hasOpeningBalance: hasOpening,
      openingCashPaise: hasOpening ? profile.openingCashPaise : null,
      entries: entries,
      closingCashPaise: hasOpening && entries.length ? entries[entries.length - 1].closingBalancePaise : (hasOpening ? profile.openingCashPaise : null)
    };
  };

  // ───────────────────────── estimated gap detection ─────────────────────────

  /**
   * Conservative, explainable gap check (Screen 6). For each calendar date
   * with scheduled SIP demand, "available cash before this payment" only
   * counts income/expenses/other SIPs dated strictly earlier — same-day
   * income is never assumed to land before the debit; it is flagged
   * uncertain instead, per spec.
   */
  Engine.computeGapAnalysis = function (profile, incomeEvents, expenseEvents, sipOccurrences, todayKey) {
    var sipGroups = Engine.groupOccurrencesByDate(sipOccurrences);
    var hasOpening = profile.openingCashPaise != null;

    return sipGroups.map(function (group) {
      var sameDayIncome = incomeEvents.some(function (e) { return e.dateKey === group.dateKey; });
      if (!hasOpening) {
        return { dateKey: group.dateKey, totalPaise: group.totalPaise, sipIds: group.items.map(function (i) { return i.sipId; }), availableBeforePaise: null, status: GapStatus.INSUFFICIENT_DATA, gapPaise: 0 };
      }
      var incomeBefore = incomeEvents.filter(function (e) { return DateUtils.compareKeys(e.dateKey, group.dateKey) < 0; })
        .reduce(function (s, e) { return s + e.amountPaise; }, 0);
      var expenseBefore = expenseEvents.filter(function (e) { return DateUtils.compareKeys(e.dateKey, group.dateKey) < 0; })
        .reduce(function (s, e) { return s + e.amountPaise; }, 0);
      var otherSipBefore = sipGroups.filter(function (g) { return DateUtils.compareKeys(g.dateKey, group.dateKey) < 0; })
        .reduce(function (s, g) { return s + g.totalPaise; }, 0);
      var availableBefore = profile.openingCashPaise + incomeBefore - expenseBefore - otherSipBefore;
      var gap = Math.max(0, group.totalPaise - availableBefore);

      var status;
      if (sameDayIncome) status = GapStatus.SAME_DAY_UNCERTAIN;
      else if (gap > 0) status = GapStatus.ESTIMATED_GAP;
      else status = GapStatus.NO_GAP;

      return { dateKey: group.dateKey, totalPaise: group.totalPaise, sipIds: group.items.map(function (i) { return i.sipId; }), availableBeforePaise: availableBefore, status: status, gapPaise: gap };
    });
  };

  // ───────────────────────── reminders ─────────────────────────

  function inrLabel(paise) { return '₹' + Math.round(paise / 100).toLocaleString('en-IN'); }

  Engine.buildReminderCandidates = function (occurrences7, occurrences30, gapAnalysis, missingInfo) {
    var out = [];
    if (occurrences7.length) {
      out.push({
        type: 'sip_due_soon', dedupeKey: 'sip_due_soon',
        message: 'You have ' + occurrences7.length + ' SIP instalment' + (occurrences7.length > 1 ? 's' : '') + ' totalling ' + inrLabel(Engine.sumPaise(occurrences7)) + ' scheduled over the next 7 days.',
        amountPaise: Engine.sumPaise(occurrences7), count: occurrences7.length
      });
    }
    var sameDateGroups = Engine.groupOccurrencesByDate(occurrences7).filter(function (g) { return g.items.length > 1; });
    if (sameDateGroups.length) {
      out.push({ type: 'multiple_sips_due', dedupeKey: 'multiple_sips_due', message: sameDateGroups.length + ' day' + (sameDateGroups.length > 1 ? 's' : '') + ' in the next 7 days have more than one SIP instalment scheduled.', count: sameDateGroups.length });
    }
    var gaps = gapAnalysis.filter(function (g) { return g.status === GapStatus.ESTIMATED_GAP; });
    if (gaps.length) {
      out.push({ type: 'cash_flow_gap', dedupeKey: 'cash_flow_gap', message: 'Based on the information you entered, ' + gaps.length + ' upcoming SIP payment' + (gaps.length > 1 ? 's' : '') + ' may face an estimated cash-flow gap.', count: gaps.length });
    }
    if (missingInfo) {
      out.push({ type: 'missing_info', dedupeKey: 'missing_info', message: 'Add your income and expense details to get a clearer picture of your upcoming cash flow.' });
    }
    return out;
  };

  // ───────────────────────── what-if (pure, isolated by construction) ─────────────────────────

  /**
   * Recomputes a full projection from plain, already-cloned inputs. Used
   * identically for the "current" projection (fed real data by the store)
   * and the "simulated" projection (fed an overridden clone) — it has no
   * access to any store, so it cannot mutate real SIP schedules, mandates
   * or pause requests no matter what overrides are passed in.
   */
  Engine.computeProjection = function (profile, income, manualIncomeEvents, sipOccurrences, todayKey, windowEndKey) {
    var incomeEvents = Engine.buildIncomeEvents(profile, income, manualIncomeEvents, todayKey, windowEndKey);
    var expenseEvents = Engine.buildExpenseEvents(profile, todayKey, windowEndKey);
    var timeline = Engine.buildTimeline(profile, incomeEvents, expenseEvents, sipOccurrences, todayKey);
    var gapAnalysis = Engine.computeGapAnalysis(profile, incomeEvents, expenseEvents, sipOccurrences, todayKey);
    return {
      incomeEvents: incomeEvents, expenseEvents: expenseEvents, timeline: timeline, gapAnalysis: gapAnalysis,
      totalSipPaise: Engine.sumPaise(sipOccurrences),
      closingCashPaise: timeline.closingCashPaise, hasOpeningBalance: timeline.hasOpeningBalance
    };
  };

  return Engine;
});
