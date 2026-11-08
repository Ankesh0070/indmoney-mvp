/**
 * Salary-Aligned SIP Scheduler — calendar-safe date utilities.
 * Dates are never stored as Date objects / ISO-with-time strings, only as
 * plain 'YYYY-MM-DD' calendar keys or {year, month0, day} structs, so there
 * is no timezone-shift risk anywhere in the feature. The Gregorian
 * month/leap-year math below is timezone-agnostic by construction (it uses
 * the local Date constructor purely as a day-count calculator, never for
 * display or storage). The one place "now" genuinely matters — today's
 * calendar date — is resolved explicitly against Asia/Kolkata.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else if (typeof window !== 'undefined') window.SchedulingDateUtils = factory();
})(this, function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** Days in a given (year, month0) — month0 is 0-indexed. Timezone-agnostic day-count math only. */
  function daysInMonth(year, month0) {
    return new Date(year, month0 + 1, 0).getDate();
  }

  function isLeapYear(year) {
    return daysInMonth(year, 1) === 29;
  }

  /** Clamps a requested day-of-month (1-31) into a valid day for that calendar month. */
  function clampDay(day, year, month0) {
    return Math.max(1, Math.min(day, daysInMonth(year, month0)));
  }

  function makeKey(year, month0, day) {
    return year + '-' + pad2(month0 + 1) + '-' + pad2(day);
  }

  function parseKey(key) {
    var parts = key.split('-');
    return { year: Number(parts[0]), month0: Number(parts[1]) - 1, day: Number(parts[2]) };
  }

  /** 'YYYY-MM-DD' strings sort lexicographically in calendar order, so string compare is safe. */
  function compareKeys(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function addMonths(key, delta, dayOverride) {
    var p = parseKey(key);
    var totalMonth0 = p.month0 + delta;
    var year = p.year + Math.floor(totalMonth0 / 12);
    var month0 = ((totalMonth0 % 12) + 12) % 12;
    var day = clampDay(dayOverride || p.day, year, month0);
    return makeKey(year, month0, day);
  }

  function addDays(key, delta) {
    var p = parseKey(key);
    var d = new Date(p.year, p.month0, p.day + delta);
    return makeKey(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function diffDays(aKey, bKey) {
    var a = parseKey(aKey), b = parseKey(bKey);
    var ad = new Date(a.year, a.month0, a.day);
    var bd = new Date(b.year, b.month0, b.day);
    return Math.round((bd.getTime() - ad.getTime()) / 86400000);
  }

  /** Projects a self-reported day-of-month onto a specific calendar month, for income-date display only. */
  function projectDayToMonth(day, year, month0) {
    return makeKey(year, month0, clampDay(day, year, month0));
  }

  function keyForDayInMonth(year, month0, day) {
    return makeKey(year, month0, clampDay(day, year, month0));
  }

  /** Today's calendar date, resolved explicitly in Asia/Kolkata regardless of host timezone. */
  function todayKey() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      var now = new Date();
      return makeKey(now.getFullYear(), now.getMonth(), now.getDate());
    }
  }

  function formatIndianDate(key) {
    if (!key) return '—';
    var p = parseKey(key);
    return p.day + ' ' + MONTHS_SHORT[p.month0] + ' ' + p.year;
  }

  function ordinal(day) {
    if (day > 3 && day < 21) return day + 'th';
    switch (day % 10) {
      case 1: return day + 'st';
      case 2: return day + 'nd';
      case 3: return day + 'rd';
      default: return day + 'th';
    }
  }

  function monthLabel(year, month0) { return MONTHS[month0] + ' ' + year; }

  return {
    MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT,
    daysInMonth: daysInMonth, isLeapYear: isLeapYear, clampDay: clampDay,
    makeKey: makeKey, parseKey: parseKey, compareKeys: compareKeys,
    addMonths: addMonths, addDays: addDays, diffDays: diffDays,
    projectDayToMonth: projectDayToMonth, keyForDayInMonth: keyForDayInMonth,
    todayKey: todayKey, formatIndianDate: formatIndianDate, ordinal: ordinal, monthLabel: monthLabel
  };
});
