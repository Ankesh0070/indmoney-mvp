/**
 * My First-Year SIP Journey — pure calculation engine. No store access, no
 * randomness beyond a deterministic seeded generator, so every scenario is
 * exactly repeatable. All money is integer paise; units are tracked as
 * integer "micro-units" (1 unit = 1,000,000 micro-units) to keep unit
 * arithmetic decimal-safe without floating-point drift.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.EducationEngine = factory(window.EducationData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var Status = Data.JourneyMonthStatus;
  var MarketType = Data.MarketScenarioType;
  var MICRO = 1000000;
  var BASE_NAV_PAISE = 2000; // ₹20.00 starting NAV, purely illustrative

  var Engine = {};

  // ───────────────────────── deterministic seeded random ─────────────────────────

  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  /** mulberry32 — small, fast, deterministic PRNG seeded by a string. */
  Engine.seededRandom = function (seedStr) {
    var state = hashSeed(String(seedStr));
    return function next() {
      state |= 0; state = (state + 0x6D2B79F5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ───────────────────────── NAV series generation ─────────────────────────

  /**
   * Generates a deterministic, clearly-simulated monthly NAV series.
   * Returns an array of integer-paise NAV values, index 0 = month 1's NAV,
   * through index (monthsCount-1) = the latest month's NAV.
   */
  Engine.generateNavSeries = function (seedKey, marketType, monthsCount) {
    var rand = Engine.seededRandom(seedKey + '|' + marketType);
    var nav = BASE_NAV_PAISE;
    var out = [];
    for (var m = 0; m < monthsCount; m++) {
      var noise = rand() - 0.5; // [-0.5, 0.5)
      var drift;
      if (marketType === MarketType.RISING) drift = 0.025 + noise * 0.02;
      else if (marketType === MarketType.FALLING) drift = -0.025 + noise * 0.02;
      else if (marketType === MarketType.FLAT) drift = noise * 0.02;
      else if (marketType === MarketType.VOLATILE) drift = noise * 0.16;
      else if (marketType === MarketType.DECLINE_NO_RECOVERY) drift = -0.03 - Math.abs(noise) * 0.01;
      else drift = 0;
      nav = Math.max(100, Math.round(nav * (1 + drift))); // floor at ₹1.00
      out.push(nav);
    }
    return out;
  };

  // ───────────────────────── monthly journey construction ─────────────────────────

  /**
   * opts: {
   *   startKey, monthsToShow, amountPaise, navSeries (length >= monthsToShow+futureMonths),
   *   realInstalment: {monthIndex, status} | null,   // Feature 1's one real record, if it lands in-window
   *   injectedMissedMonths: [monthIndex,...],          // this feature's own simulated illustrations
   *   injectedPausedMonths: [monthIndex,...],
   *   futureMonths: number (hypothetical months to project beyond the historical window)
   * }
   * monthIndex is 1-based (month 1 = the first contribution).
   */
  Engine.buildMonthlyJourney = function (opts) {
    var months = [];
    var cumulativeUnitsMicro = 0;
    var cumulativeInvestedPaise = 0;
    var missedSet = {}; (opts.injectedMissedMonths || []).forEach(function (m) { missedSet[m] = true; });
    var pausedSet = {}; (opts.injectedPausedMonths || []).forEach(function (m) { pausedSet[m] = true; });
    var totalMonths = opts.monthsToShow + (opts.futureMonths || 0);
    var lastValidNavPaise = null;

    for (var i = 1; i <= totalMonths; i++) {
      var isHistorical = i <= opts.monthsToShow;
      var dateKey = DateUtils.addMonths(opts.startKey, i - 1);
      var rawNavPaise = opts.navSeries[i - 1];
      if (rawNavPaise == null) rawNavPaise = opts.navSeries.length ? opts.navSeries[opts.navSeries.length - 1] : null;
      var navValid = typeof rawNavPaise === 'number' && rawNavPaise > 0;
      var navPaise = navValid ? rawNavPaise : null;
      if (navValid) lastValidNavPaise = rawNavPaise;
      var navForValuation = navValid ? rawNavPaise : lastValidNavPaise; // hold last known value when NAV is missing/zero

      var status = Status.SUCCESSFUL;
      var isRealRecord = false;
      if (opts.realInstalment && opts.realInstalment.monthIndex === i) {
        isRealRecord = true;
        status = opts.realInstalment.status;
      } else if (pausedSet[i]) {
        status = Status.PAUSED;
      } else if (missedSet[i]) {
        status = Status.MISSED;
      }

      var contributedPaise = 0;
      var unitsMicroThisMonth = 0;
      var navUnavailableForPurchase = false;
      if (status === Status.SUCCESSFUL && !navValid) {
        // NAV missing or zero this month: the payment is treated as collected but
        // not yet able to be converted into units, rather than fabricating an
        // infinite or zero-cost unit purchase.
        status = Status.PENDING;
        navUnavailableForPurchase = true;
      } else if (status === Status.SUCCESSFUL) {
        contributedPaise = opts.amountPaise;
        unitsMicroThisMonth = Math.round((contributedPaise * MICRO) / navPaise);
        cumulativeUnitsMicro += unitsMicroThisMonth;
        cumulativeInvestedPaise += contributedPaise;
      }

      var portfolioValuePaise = navForValuation != null ? Math.round((cumulativeUnitsMicro * navForValuation) / MICRO) : null;
      var gainLossPaise = (cumulativeInvestedPaise > 0 && portfolioValuePaise != null) ? (portfolioValuePaise - cumulativeInvestedPaise) : null;

      months.push({
        monthIndex: i, dateKey: dateKey, isHistorical: isHistorical, isRealRecord: isRealRecord,
        status: status, navPaise: navPaise, navUnavailableForPurchase: navUnavailableForPurchase,
        contributedPaise: contributedPaise, unitsMicroThisMonth: unitsMicroThisMonth,
        cumulativeUnitsMicro: cumulativeUnitsMicro, cumulativeInvestedPaise: cumulativeInvestedPaise,
        portfolioValuePaise: portfolioValuePaise, gainLossPaise: gainLossPaise
      });
    }
    return months;
  };

  Engine.unitsToDisplay = function (unitsMicro) { return (unitsMicro / MICRO); };

  Engine.absoluteReturnPct = function (gainLossPaise, netInvestedPaise) {
    if (netInvestedPaise == null || netInvestedPaise <= 0 || gainLossPaise == null) return null;
    return (gainLossPaise / netInvestedPaise) * 100;
  };

  // ───────────────────────── XIRR ─────────────────────────

  /**
   * cashflows: [{dateKey, amountPaise}], contributions negative, final value
   * positive. Returns a decimal rate (0.12 = 12%) or null when there is
   * insufficient or degenerate data (fewer than 2 differently-signed flows,
   * all on the same date, or the solver fails to converge).
   */
  Engine.computeXIRR = function (cashflows) {
    if (!cashflows || cashflows.length < 2) return null;
    var hasPositive = cashflows.some(function (c) { return c.amountPaise > 0; });
    var hasNegative = cashflows.some(function (c) { return c.amountPaise < 0; });
    if (!hasPositive || !hasNegative) return null;

    var t0 = DateUtils.parseKey(cashflows[0].dateKey);
    var t0Date = new Date(t0.year, t0.month0, t0.day);
    var years = cashflows.map(function (c) {
      var p = DateUtils.parseKey(c.dateKey);
      var d = new Date(p.year, p.month0, p.day);
      return (d.getTime() - t0Date.getTime()) / (365 * 86400000);
    });
    if (years.every(function (y) { return y === 0; })) return null;

    function npv(rate) {
      var sum = 0;
      for (var i = 0; i < cashflows.length; i++) {
        sum += cashflows[i].amountPaise / Math.pow(1 + rate, years[i]);
      }
      return sum;
    }
    function dnpv(rate) {
      var sum = 0;
      for (var i = 0; i < cashflows.length; i++) {
        if (years[i] === 0) continue;
        sum += (-years[i] * cashflows[i].amountPaise) / Math.pow(1 + rate, years[i] + 1);
      }
      return sum;
    }

    var rate = 0.1;
    var converged = false;
    for (var iter = 0; iter < 100; iter++) {
      var f = npv(rate);
      var d = dnpv(rate);
      if (Math.abs(f) < 1) { converged = true; break; }
      if (!isFinite(d) || Math.abs(d) < 1e-9) break;
      var next = rate - f / d;
      if (!isFinite(next) || next <= -0.999999) next = (rate + -0.999999) / 2;
      if (Math.abs(next - rate) < 1e-9) { rate = next; converged = true; break; }
      rate = next;
    }

    if (!converged) {
      // Bisection fallback over a bounded, plausible range.
      var lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
      if ((flo > 0 && fhi > 0) || (flo < 0 && fhi < 0)) return null;
      for (var b = 0; b < 200; b++) {
        var mid = (lo + hi) / 2, fmid = npv(mid);
        if (Math.abs(fmid) < 1) { rate = mid; converged = true; break; }
        if ((fmid > 0) === (flo > 0)) { lo = mid; flo = fmid; } else { hi = mid; fhi = fmid; }
      }
      rate = (lo + hi) / 2;
    }
    if (!isFinite(rate) || rate <= -0.999999 || rate > 1000) return null;
    return rate;
  };

  Engine.buildCashflowsFromMonths = function (months, currentValuePaise, asOfDateKey) {
    var flows = [];
    months.forEach(function (m) {
      if (m.isHistorical && m.status === Status.SUCCESSFUL) flows.push({ dateKey: m.dateKey, amountPaise: -m.contributedPaise });
    });
    if (flows.length && currentValuePaise != null) flows.push({ dateKey: asOfDateKey, amountPaise: currentValuePaise });
    return flows;
  };

  return Engine;
});
