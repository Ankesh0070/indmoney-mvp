/**
 * My First-Year SIP Journey — pure UI builders. Every function takes plain
 * data and returns an HTML string; no DOM access, no store access, so these
 * are trivially testable and reusable across screens.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('../scheduling/dateUtils.js'));
  } else if (typeof window !== 'undefined') {
    window.EducationComponents = factory(window.EducationData, window.SchedulingDateUtils);
  }
})(this, function (Data, DateUtils) {
  'use strict';

  var Status = Data.JourneyMonthStatus;
  var C = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function inr(paise) { if (paise == null) return '—'; return '₹' + Math.round(paise / 100).toLocaleString('en-IN'); }
  function inrSigned(paise) { if (paise == null) return '—'; var sign = paise > 0 ? '+' : paise < 0 ? '−' : ''; return sign + '₹' + Math.abs(Math.round(paise / 100)).toLocaleString('en-IN'); }
  function pct(p) { if (p == null) return '—'; var sign = p > 0 ? '+' : ''; return sign + p.toFixed(2) + '%'; }
  function dateLabel(key) { return DateUtils.formatIndianDate(key); }

  C.esc = esc; C.inr = inr; C.inrSigned = inrSigned; C.pct = pct; C.dateLabel = dateLabel;

  C.statusBadge = function (status) {
    var map = {};
    map[Status.SUCCESSFUL] = { cls: 'edu-badge-success', label: '✓ Successful' };
    map[Status.MISSED] = { cls: 'edu-badge-danger', label: '✗ Missed' };
    map[Status.PAUSED] = { cls: 'edu-badge-pending', label: '⏸ Paused' };
    map[Status.PENDING] = { cls: 'edu-badge-amber', label: '⏳ Pending' };
    var m = map[status] || { cls: 'edu-badge-muted', label: status };
    return '<span class="edu-badge ' + m.cls + '">' + m.label + '</span>';
  };

  C.disclaimer = function (text) {
    return '<div class="edu-disclaimer">⚠️ ' + esc(text) + '</div>';
  };

  C.monthCard = function (m, selected) {
    var sel = selected ? ' edu-month-card-selected' : '';
    var future = !m.isHistorical ? ' edu-month-card-future' : '';
    return '<button class="edu-month-card' + sel + future + '" data-action="edu-select-month" data-month="' + m.monthIndex + '">' +
      '<div class="tiny muted">Month ' + m.monthIndex + (!m.isHistorical ? ' (hypothetical)' : '') + '</div>' +
      '<div class="small bold">' + dateLabel(m.dateKey) + '</div>' +
      C.statusBadge(m.status) +
      '</button>';
  };

  C.monthDetail = function (m) {
    if (!m) return '<div class="tiny muted">Select a month above to see its detail.</div>';
    var futureNote = !m.isHistorical ? C.disclaimer('This month is a hypothetical future projection, not a historical record.') : '';
    var realNote = m.isRealRecord ? '<div class="tiny edu-real-note">✓ Reflects this SIP’s real Feature 1 instalment record for this month.</div>' : '';
    return '<div class="card edu-month-detail">' + futureNote + realNote +
      '<div class="row-between"><span class="small muted">Status</span>' + C.statusBadge(m.status) + '</div>' +
      '<div class="row-between mt-8"><span class="small muted">Amount invested this month</span><span class="small bold">' + (m.status === Status.SUCCESSFUL ? inr(m.contributedPaise) : '—') + '</span></div>' +
      '<div class="row-between mt-8"><span class="small muted">Total contributions to date</span><span class="small bold">' + inr(m.cumulativeInvestedPaise) + '</span></div>' +
      '<div class="row-between mt-8"><span class="small muted">Hypothetical portfolio value</span><span class="small bold">' + inr(m.portfolioValuePaise) + '</span></div>' +
      '<div class="row-between mt-8"><span class="small muted">Gain / loss</span><span class="small bold ' + (m.gainLossPaise > 0 ? 'edu-amount-pos' : m.gainLossPaise < 0 ? 'edu-amount-neg' : '') + '">' + inrSigned(m.gainLossPaise) + '</span></div>' +
      '<div class="tiny muted mt-12">Simulated NAV this month: ' + (m.navPaise != null ? '₹' + (m.navPaise / 100).toFixed(2) : 'not available') + '</div>' +
      '</div>';
  };

  C.valueChartSvg = function (cumulative) {
    if (!cumulative.length) return '<div class="tiny muted">No data to chart yet.</div>';
    var w = 320, h = 160, padL = 8, padR = 8, padT = 10, padB = 10;
    var values = [];
    cumulative.forEach(function (c) { values.push(c.investedPaise, c.valuePaise); });
    var maxV = Math.max.apply(null, values.concat([1]));
    var minV = Math.min.apply(null, values.concat([0]));
    if (minV > 0) minV = 0;
    var range = (maxV - minV) || 1;
    function x(i) { return padL + (i / Math.max(1, cumulative.length - 1)) * (w - padL - padR); }
    function y(v) { return padT + (1 - (v - minV) / range) * (h - padT - padB); }
    var investedPts = cumulative.map(function (c, i) { return x(i) + ',' + y(c.investedPaise); }).join(' ');
    var valuePts = cumulative.map(function (c, i) { return x(i) + ',' + y(c.valuePaise); }).join(' ');
    var zeroY = y(0);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="edu-chart" role="img" aria-label="Chart comparing cumulative invested amount to simulated current value over time">' +
      '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (w - padR) + '" y2="' + zeroY + '" class="edu-chart-axis" />' +
      '<polyline points="' + investedPts + '" class="edu-chart-line edu-chart-line-invested" />' +
      '<polyline points="' + valuePts + '" class="edu-chart-line edu-chart-line-value" />' +
      '</svg>' +
      '<div class="edu-chart-legend"><span class="edu-legend-dot edu-legend-invested"></span>Invested amount <span class="edu-legend-dot edu-legend-value"></span>Simulated current value</div>';
  };

  C.valueDataTable = function (cumulative) {
    if (!cumulative.length) return '';
    var rows = cumulative.map(function (c) {
      return '<tr><td>' + dateLabel(c.dateKey) + '</td><td>' + inr(c.investedPaise) + '</td><td>' + inr(c.valuePaise) + '</td><td class="' + (c.gainLossPaise > 0 ? 'edu-amount-pos' : c.gainLossPaise < 0 ? 'edu-amount-neg' : '') + '">' + inrSigned(c.gainLossPaise) + '</td></tr>';
    }).join('');
    return '<table class="edu-table" aria-label="Invested amount vs current value, month by month">' +
      '<thead><tr><th>Month</th><th>Invested</th><th>Value</th><th>Gain/Loss</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  C.lessonCard = function (card, completed) {
    return '<div class="card edu-lesson-card">' +
      '<div class="row-between"><span class="small bold">' + esc(card.title) + '</span>' + (completed ? '<span class="edu-badge edu-badge-success">✓ Got it</span>' : '') + '</div>' +
      '<div class="tiny muted mt-8">' + esc(card.body) + '</div>' +
      (card.example ? '<div class="edu-example mt-8">' + esc(card.example) + '</div>' : '') +
      (!completed ? '<button class="btn btn-outline mt-12" data-action="edu-card-done" data-card="' + card.id + '">Got It</button>' : '') +
      '</div>';
  };

  C.quizQuestionCard = function (q, attempt, index, total) {
    var answered = !!attempt;
    var optionsHtml = q.options.map(function (opt) {
      var isSelected = answered && attempt.selected === opt;
      var isCorrectOpt = opt === q.correct;
      var cls = 'edu-quiz-option';
      if (answered) {
        if (isCorrectOpt) cls += ' edu-quiz-option-correct';
        else if (isSelected) cls += ' edu-quiz-option-wrong';
      }
      return '<button class="' + cls + '" data-action="edu-quiz-answer" data-question="' + q.id + '" data-option="' + esc(opt) + '" ' + (answered ? 'disabled' : '') + '>' + esc(opt) + '</button>';
    }).join('');
    return '<div class="card edu-quiz-card">' +
      '<div class="tiny muted">Question ' + index + ' of ' + total + '</div>' +
      '<div class="small bold mt-4">' + esc(q.text) + '</div>' +
      '<div class="edu-quiz-options mt-12">' + optionsHtml + '</div>' +
      (answered ? '<div class="tiny mt-8 ' + (attempt.correct ? 'edu-amount-pos' : 'edu-amount-neg') + '">' + (attempt.correct ? 'Correct.' : 'Not quite.') + ' ' + esc(q.explanation) + '</div>' : '') +
      '</div>';
  };

  C.navSelectorExample = function (contributionPaise, navPaise) {
    var units = navPaise > 0 ? (contributionPaise / navPaise).toFixed(2) : '—';
    return '<div class="card">' +
      '<div class="row-between"><span class="small muted">Fixed monthly contribution</span><span class="small bold">' + inr(contributionPaise) + '</span></div>' +
      '<div class="row-between mt-8"><span class="small muted">NAV (₹ per unit)</span><span class="small bold">₹' + (navPaise / 100).toFixed(2) + '</span></div>' +
      '<div class="row-between mt-8"><span class="small muted">Units purchased</span><span class="small bold">' + units + '</span></div>' +
      '</div>';
  };

  C.scenarioPillRow = function (scenarios, focusedId) {
    return '<div class="edu-pill-row">' + scenarios.map(function (s) {
      var active = s.id === focusedId ? ' edu-pill-active' : '';
      return '<button class="edu-pill' + active + '" data-action="edu-focus-scenario" data-scenario="' + s.id + '">' + esc(s.shortLabel) + '</button>';
    }).join('') + '</div>';
  };

  C.promptBanner = function (prompt) {
    if (!prompt) return '';
    return '<div class="card edu-prompt-banner" id="edu-prompt-banner">' +
      '<div class="small">' + esc(prompt.message) + '</div>' +
      '<div class="row-between mt-8">' +
      '<button class="btn btn-outline btn-sm" style="width:auto;" data-action="edu-learn-more">Learn More</button>' +
      '<button class="edu-dismiss-btn" data-action="edu-dismiss-prompt" data-prompt="' + prompt.id + '">Dismiss</button>' +
      '</div></div>';
  };

  C.notificationItem = function (n) {
    return '<div class="edu-row">' +
      '<span>🔔</span>' +
      '<div><div class="small ' + (!n.read ? 'bold' : '') + '">' + esc(n.message) + '</div><div class="tiny muted">' + new Date(n.createdAt).toLocaleDateString('en-IN') + '</div></div>' +
      '</div>';
  };

  C.progressTile = function (label, value) {
    return '<div class="card"><div class="tiny muted">' + esc(label) + '</div><div class="small bold mt-4">' + esc(value) + '</div></div>';
  };

  return C;
});
