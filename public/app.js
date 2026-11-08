/**
 * INDmoney MVP — client-side app logic.
 * Single-page, vanilla JS. All "backend" state (user, KYC, SIPs, transactions)
 * is mocked and persisted to localStorage so the journey feels real across
 * reloads, without any real brokerage, banking, or KYC integration. Fully
 * self-contained — no network calls. (The RAG review-assistant lives only
 * in dashboard/; this app never talks to it.)
 */

const STORAGE_KEY = 'indmoney_state_v1';
let FUNDS = [];
let STATE = loadState();
let selectedFundId = null;
let lastMainTab = 'screen-home';
let currentCategory = 'All';
let navHistory = [];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    user: { name: '', email: '', mobile: '', pan: '', aadhaar: '', bankName: '', bankAcc: '', bankIfsc: '' },
    kycStatus: 'none',
    sips: [],
    transactions: [],
    onboarded: false,
    dailyChangePct: +((Math.random() * 3.6) - 1.0).toFixed(2)
  };
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch {}
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtINR(n) {
  n = Math.round(n || 0);
  return '₹' + n.toLocaleString('en-IN');
}
function monthsAgoDate(m) {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return d.toISOString().slice(0, 10);
}
function fundById(id) { return FUNDS.find(f => f.id === id); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ───────────────────────────── Navigation ─────────────────────────────
// go() tracks where we came from in navHistory so a back button can always
// return to the actual previous screen, instead of a hardcoded guess that
// breaks when a screen is reached from more than one place.
function go(id, opts) {
  opts = opts || {};
  const current = document.querySelector('.screen.active');
  if (!opts.isBack && current && current.id !== id) {
    navHistory.push(current.id);
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add('active');

  const mainTabs = ['screen-home', 'screen-sips', 'screen-explore', 'screen-planner', 'screen-profile'];
  const nav = document.getElementById('bottom-nav');
  if (STATE.onboarded && mainTabs.includes(id)) {
    nav.classList.add('visible');
    lastMainTab = id;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  } else {
    nav.classList.remove('visible');
  }

  if (id === 'screen-home') renderHome();
  if (id === 'screen-sips') renderSips();
  if (id === 'screen-explore') renderExplore();
  if (id === 'screen-transactions') renderTransactions();
  if (id === 'screen-profile') renderProfile();
  if (id === 'screen-planner') renderGoalPlanner();

  target.scrollTop = 0;
}

// Every back-btn in the app calls this instead of a hardcoded go('screen-x'),
// so it always lands on wherever the user actually came from.
function goBack() {
  let prev = navHistory.pop();
  while (prev === 'screen-splash') prev = navHistory.pop(); // splash is a loader, never a valid back target
  if (prev && document.getElementById(prev)) {
    go(prev, { isBack: true });
  } else {
    go(STATE.onboarded ? 'screen-home' : 'screen-welcome', { isBack: true });
  }
}

// ───────────────────────────── Onboarding: mobile + OTP ─────────────────────────────
function sendOtp() {
  const val = document.getElementById('input-mobile').value.trim();
  if (!/^\d{10}$/.test(val)) { showToast('Enter a valid 10-digit mobile number'); return; }
  STATE.user.mobile = val;
  saveState();
  document.getElementById('otp-sub').textContent = `Enter the 4-digit code sent to +91 ${val.slice(0, 5)} ${val.slice(5)}`;
  go('screen-otp');
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach(b => b.value = '');
  boxes[0].focus();
}

function wireOtpBoxes() {
  // Handles both single-digit typing AND a full code typed/pasted into one
  // box (common when an autofill/password-manager or a fast typer drops the
  // whole OTP into the first field) by distributing extra digits forward.
  const boxes = Array.from(document.querySelectorAll('.otp-box'));
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const digits = box.value.replace(/\D/g, '');
      if (digits.length > 1) {
        for (let j = 0; j < digits.length && (i + j) < boxes.length; j++) {
          boxes[i + j].value = digits[j];
        }
        boxes[Math.min(i + digits.length, boxes.length - 1)].focus();
      } else {
        box.value = digits;
        if (digits && boxes[i + 1]) boxes[i + 1].focus();
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && boxes[i - 1]) boxes[i - 1].focus();
    });
  });
}

function verifyOtp() {
  const boxes = Array.from(document.querySelectorAll('.otp-box'));
  const code = boxes.map(b => b.value).join('');
  if (code.length !== 4) { showToast('Enter the full 4-digit code'); return; }
  showToast('Mobile number verified');
  if (!STATE.user.name) {
    go('screen-signup');
  } else if (STATE.kycStatus !== 'complete') {
    go('screen-kyc-intro');
  } else {
    finishOnboarding();
  }
}

function completeSignup() {
  const name = document.getElementById('input-name').value.trim();
  const email = document.getElementById('input-email').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  STATE.user.name = name;
  STATE.user.email = email;
  saveState();
  go('screen-kyc-intro');
}

function skipKyc() {
  STATE.kycStatus = 'none';
  saveState();
  finishOnboarding();
}

// ───────────────────────────── KYC flow ─────────────────────────────
function validatePanFormat(v) { return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v); }

function submitPan() {
  const pan = document.getElementById('input-pan').value.trim().toUpperCase();
  if (!validatePanFormat(pan)) { showToast('Enter a valid PAN (e.g. ABCDE1234F)'); return; }
  STATE.user.pan = pan;
  saveState();
  go('screen-kyc-aadhaar');
}

function submitAadhaar() {
  const aad = document.getElementById('input-aadhaar').value.trim();
  if (aad.replace(/\s/g, '').length !== 12) { showToast('Enter a valid 12-digit Aadhaar number'); return; }
  STATE.user.aadhaar = aad;
  saveState();
  showToast('Aadhaar OTP verified (simulated)');
  go('screen-kyc-bank');
}

function submitBank() {
  const name = document.getElementById('input-bank-name').value.trim();
  const acc = document.getElementById('input-bank-acc').value.trim();
  const ifsc = document.getElementById('input-bank-ifsc').value.trim().toUpperCase();
  if (!name || acc.length < 6 || ifsc.length < 8) { showToast('Fill in all bank details correctly'); return; }
  STATE.user.bankName = name;
  STATE.user.bankAcc = acc;
  STATE.user.bankIfsc = ifsc;
  saveState();
  go('screen-kyc-selfie');
}

function submitSelfie() {
  document.getElementById('selfie-status').textContent = 'Captured ✓ Verifying liveness…';
  document.getElementById('btn-selfie').textContent = 'Verifying…';
  document.getElementById('btn-selfie').disabled = true;
  setTimeout(() => {
    STATE.kycStatus = 'complete';
    saveState();
    go('screen-kyc-success');
  }, 1200);
}

function finishOnboarding() {
  STATE.onboarded = true;
  saveState();
  navHistory = [];
  go('screen-home');
}

// ───────────────────────────── Home dashboard ─────────────────────────────
function computePortfolio() {
  let invested = 0, current = 0;
  const byCategory = {};
  STATE.sips.forEach(s => {
    if (s.status === 'cancelled') return;
    invested += s.investedSoFar;
    current += s.currentValue;
    byCategory[s.category] = (byCategory[s.category] || 0) + s.currentValue;
  });
  return { invested, current, byCategory };
}

function renderHome() {
  const hour = new Date().getHours();
  document.getElementById('home-greeting').textContent =
    (hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,');
  document.getElementById('home-username').textContent = STATE.user.name || 'Investor';

  const { invested, current, byCategory } = computePortfolio();
  document.getElementById('home-networth').textContent = fmtINR(current);

  const changeAmt = current * (STATE.dailyChangePct / 100);
  const chip = document.getElementById('home-change-chip');
  chip.textContent = `${changeAmt >= 0 ? '+' : ''}${fmtINR(changeAmt)} (${STATE.dailyChangePct}%) today`;

  const allocWrap = document.getElementById('allocation-bars');
  allocWrap.innerHTML = '';
  const catColors = { Equity: '#6c5ce7', Debt: '#3d99ff', Hybrid: '#ff6b9d', Index: '#1fd896', ELSS: '#eebe6e' };
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  if (total === 0) {
    allocWrap.innerHTML = '<div class="tiny muted">No investments yet. Start your first SIP to see your allocation here.</div>';
  } else {
    Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
      const pct = ((val / total) * 100).toFixed(0);
      const row = document.createElement('div');
      row.innerHTML = `
        <div class="row-between tiny mb-8"><span class="bold">${cat}</span><span class="muted">${pct}% · ${fmtINR(val)}</span></div>
        <div style="height:8px; background:var(--bg); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${catColors[cat] || '#6c5ce7'}; border-radius:999px;"></div>
        </div>`;
      allocWrap.appendChild(row);
    });
  }

  const preview = document.getElementById('home-sip-preview');
  const activeSips = STATE.sips.filter(s => s.status !== 'cancelled').slice(0, 2);
  if (activeSips.length === 0) {
    preview.innerHTML = `<div class="card" style="text-align:center;"><div class="small muted">You haven't started any SIPs yet.</div><button class="btn btn-secondary btn-sm mt-12" style="width:auto;" onclick="go('screen-explore')">Explore Funds</button></div>`;
  } else {
    preview.innerHTML = '';
    activeSips.forEach(s => preview.appendChild(sipCardEl(s)));
  }
}

// ───────────────────────────── SIP hub ─────────────────────────────
function sipCardEl(sip) {
  const el = document.createElement('div');
  el.className = 'card';
  const badgeClass = sip.status === 'active' ? 'badge-active' : sip.status === 'paused' ? 'badge-paused' : 'badge-cancelled';
  const gain = sip.currentValue - sip.investedSoFar;
  const gainPct = sip.investedSoFar ? ((gain / sip.investedSoFar) * 100).toFixed(1) : '0.0';
  el.innerHTML = `
    <div class="row gap-12">
      <div class="fund-icon" style="background:${sip.color};">${sip.fundName.charAt(0)}</div>
      <div style="flex:1; min-width:0;">
        <div class="small bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sip.fundName}</div>
        <div class="tiny muted mt-4">${fmtINR(sip.amount)}/mo · ${sip.date} of every month</div>
      </div>
      <span class="badge ${badgeClass}">${sip.status}</span>
    </div>
    <div class="row-between mt-12">
      <div><div class="tiny muted">Invested</div><div class="small bold">${fmtINR(sip.investedSoFar)}</div></div>
      <div><div class="tiny muted">Current Value</div><div class="small bold">${fmtINR(sip.currentValue)}</div></div>
      <div><div class="tiny muted">Gain/Loss</div><div class="small bold ${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : ''}${gainPct}%</div></div>
    </div>
    <div class="row gap-8 mt-12" id="sip-actions-${sip.id}"></div>
  `;
  const actions = el.querySelector(`#sip-actions-${sip.id}`);
  if (sip.status === 'active') {
    actions.appendChild(actionBtn('Pause', 'btn-outline', () => setSipStatus(sip.id, 'paused')));
    actions.appendChild(actionBtn('Cancel', 'btn-danger-outline', () => setSipStatus(sip.id, 'cancelled')));
  } else if (sip.status === 'paused') {
    actions.appendChild(actionBtn('Resume', 'btn-primary', () => setSipStatus(sip.id, 'active')));
    actions.appendChild(actionBtn('Cancel', 'btn-danger-outline', () => setSipStatus(sip.id, 'cancelled')));
  } else {
    actions.appendChild(actionBtn('Restart SIP', 'btn-secondary', () => setSipStatus(sip.id, 'active')));
  }
  return el;
}
function actionBtn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = `btn btn-sm ${cls}`;
  b.style.flex = '1';
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function setSipStatus(sipId, status) {
  const sip = STATE.sips.find(s => s.id === sipId);
  if (!sip) return;
  sip.status = status;
  STATE.transactions.unshift({
    id: uid(), type: `SIP ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    fundName: sip.fundName, amount: sip.amount, date: new Date().toISOString().slice(0, 10), status: 'Success'
  });
  saveState();
  showToast(`SIP ${status}`);
  renderSips();
}

function renderSips() {
  const totalMonthly = STATE.sips.filter(s => s.status === 'active').reduce((a, s) => a + s.amount, 0);
  document.getElementById('sip-total-monthly').textContent = fmtINR(totalMonthly);
  const list = document.getElementById('sip-list');
  list.innerHTML = '';
  if (STATE.sips.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🔁</div><div class="bold">No SIPs yet</div><div class="small mt-8">Start your first SIP from the Explore tab.</div></div>`;
    return;
  }
  STATE.sips.slice().reverse().forEach(sip => list.appendChild(sipCardEl(sip)));
}

// ───────────────────────────── Explore / fund list ─────────────────────────────
function renderCategoryPills() {
  const cats = ['All', ...new Set(FUNDS.map(f => f.category))];
  const wrap = document.getElementById('category-pills');
  wrap.innerHTML = '';
  cats.forEach(c => {
    const b = document.createElement('button');
    b.className = 'pill' + (c === currentCategory ? ' active' : '');
    b.textContent = c;
    b.onclick = () => { currentCategory = c; renderExplore(); };
    wrap.appendChild(b);
  });
}

function renderExplore() {
  renderCategoryPills();
  const q = (document.getElementById('explore-search').value || '').toLowerCase();
  const list = document.getElementById('fund-list');
  list.innerHTML = '';
  const filtered = FUNDS.filter(f => {
    const matchesCat = currentCategory === 'All' || f.category === currentCategory;
    const matchesQ = !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q);
    return matchesCat && matchesQ;
  });
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div><div class="small">No funds match your search.</div></div>`;
    return;
  }
  filtered.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'fund-card';
    btn.onclick = () => openFundDetail(f.id);
    btn.innerHTML = `
      <div class="fund-icon" style="background:${f.color};">${f.name.charAt(0)}</div>
      <div style="flex:1; min-width:0;">
        <div class="fund-name">${f.name}</div>
        <div class="fund-meta">${f.category} · ${f.sub} · <span class="stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</span></div>
      </div>
      <div class="fund-return">
        <div class="val pos">+${f.r1y}%</div>
        <div class="lbl">1Y return</div>
      </div>`;
    list.appendChild(btn);
  });
}

// ───────────────────────────── Fund detail ─────────────────────────────
function openFundDetail(fundId) {
  selectedFundId = fundId;
  const f = fundById(fundId);
  document.getElementById('fd-name').textContent = f.name;
  const body = document.getElementById('fund-detail-body');
  body.innerHTML = `
    <div class="card">
      <div class="row gap-12">
        <div class="fund-icon" style="background:${f.color}; width:54px; height:54px; font-size:20px;">${f.name.charAt(0)}</div>
        <div>
          <div class="bold small">${f.name}</div>
          <div class="tiny muted mt-4">${f.category} · ${f.sub} · Risk: ${f.risk}</div>
          <div class="stars mt-4">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-header"><h3>NAV Trend (illustrative)</h3><span class="sim-chip">Simulated</span></div>
      <canvas id="nav-chart" width="340" height="120" style="width:100%; height:120px;"></canvas>
      <div class="row-between mt-8 tiny muted"><span>6mo ago</span><span>Today: ₹${f.nav}</span></div>
    </div>

    <div class="card">
      <div class="section-header"><h3>Returns</h3></div>
      <div class="row-between" style="text-align:center;">
        <div style="flex:1;"><div class="tiny muted">1 Year</div><div class="bold pos">+${f.r1y}%</div></div>
        <div style="flex:1;"><div class="tiny muted">3 Years</div><div class="bold pos">+${f.r3y}%</div></div>
        <div style="flex:1;"><div class="tiny muted">5 Years</div><div class="bold pos">+${f.r5y}%</div></div>
      </div>
    </div>

    <div class="card">
      <div class="section-header"><h3>Fund Facts</h3></div>
      <div class="list-row"><span class="small muted" style="flex:1;">Minimum SIP</span><span class="small bold">${fmtINR(f.minSip)}/mo</span></div>
      <div class="list-row"><span class="small muted" style="flex:1;">Risk Level</span><span class="small bold">${f.risk}</span></div>
      <div class="list-row"><span class="small muted" style="flex:1;">Category</span><span class="small bold">${f.category} — ${f.sub}</span></div>
      <div class="list-row"><span class="small muted" style="flex:1;">Current NAV</span><span class="small bold">₹${f.nav}</span></div>
    </div>

    <div class="tiny faint mb-16">⚠️ Illustrative sample data for demo purposes only — not live market data and not a recommendation to invest in this or any fund. Past performance (real or simulated) does not guarantee future returns.</div>
    <button class="btn btn-primary" onclick="openSipSetup('${f.id}')">Start SIP in this Fund</button>
  `;
  go('screen-fund-detail');
  requestAnimationFrame(() => drawNavSparkline(f));
}

function drawNavSparkline(f) {
  const canvas = document.getElementById('nav-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // Deterministic pseudo-random walk ending at the fund's current NAV.
  let seed = f.id.charCodeAt(1) * 97 + f.nav;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  const points = 24;
  const start = f.nav / (1 + f.r1y / 100);
  const vals = [start];
  for (let i = 1; i < points; i++) {
    const drift = (f.nav - start) / points;
    const noise = (rnd() - 0.5) * (f.nav * 0.02);
    vals.push(vals[i - 1] + drift + noise);
  }
  vals[points - 1] = f.nav;
  const min = Math.min(...vals), max = Math.max(...vals);
  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = f.color;
  vals.forEach((v, i) => {
    const x = (i / (points - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 10) - 5;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, f.color + '33');
  grad.addColorStop(1, f.color + '00');
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
}

// ───────────────────────────── SIP setup ─────────────────────────────
function openSipSetup(fundId) {
  selectedFundId = fundId;
  const f = fundById(fundId);
  document.getElementById('sip-setup-fund-card').innerHTML = `
    <div class="row gap-12">
      <div class="fund-icon" style="background:${f.color};">${f.name.charAt(0)}</div>
      <div><div class="small bold">${f.name}</div><div class="tiny muted mt-4">Min. SIP ${fmtINR(f.minSip)}/mo · ${f.category}</div></div>
    </div>`;
  document.getElementById('sip-amount').value = f.minSip;
  updateSipReview();
  go('screen-sip-setup');
}
function setSipAmount(v) {
  document.getElementById('sip-amount').value = v;
  updateSipReview();
}
function updateSipReview() {
  const amt = Number(document.getElementById('sip-amount').value) || 0;
  document.getElementById('sip-review-amount').textContent = fmtINR(amt);
  const date = document.getElementById('sip-date').value;
  document.getElementById('sip-review-date').textContent = `${date} of every month`;
}
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'sip-amount') updateSipReview();
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'sip-date') updateSipReview();
});

function confirmSip() {
  if (STATE.kycStatus !== 'complete') {
    showToast('Please complete your KYC before investing');
    go('screen-kyc-intro');
    return;
  }
  const f = fundById(selectedFundId);
  const amount = Number(document.getElementById('sip-amount').value);
  if (!amount || amount < f.minSip) { showToast(`Minimum SIP for this fund is ${fmtINR(f.minSip)}`); return; }
  const date = document.getElementById('sip-date').value;

  const monthsActive = 1 + Math.floor(Math.random() * 10);
  const investedSoFar = amount * monthsActive;
  const currentValue = Math.round(investedSoFar * (1 + (f.r1y / 100) * (monthsActive / 12)));

  const sip = {
    id: uid(), fundId: f.id, fundName: f.name, category: f.category, color: f.color,
    amount, date, status: 'active', startedAt: monthsAgoDate(monthsActive),
    monthsActive, investedSoFar, currentValue
  };
  STATE.sips.push(sip);

  for (let i = monthsActive; i >= 1; i--) {
    STATE.transactions.unshift({
      id: uid(), type: 'SIP Debit', fundName: f.name, amount,
      date: monthsAgoDate(i), status: 'Success'
    });
  }
  STATE.transactions.unshift({
    id: uid(), type: 'SIP Started', fundName: f.name, amount, date: new Date().toISOString().slice(0, 10), status: 'Success'
  });

  saveState();
  document.getElementById('sip-success-detail').textContent =
    `Your ${fmtINR(amount)}/mo SIP in ${f.name} is active, debiting on the ${date} of every month.`;
  go('screen-sip-success');
}

// ───────────────────────────── Transactions ─────────────────────────────
function renderTransactions() {
  const list = document.getElementById('transactions-list');
  list.innerHTML = '';
  if (STATE.transactions.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🧾</div><div class="small">No transactions yet.</div></div>`;
    return;
  }
  const iconFor = (type) => type.includes('Debit') ? '💸' : type.includes('Started') ? '🚀' : type.includes('Paused') ? '⏸️' : type.includes('Cancelled') ? '❌' : type.includes('Active') ? '▶️' : '🔁';
  const card = document.createElement('div');
  card.className = 'card';
  STATE.transactions.forEach(tx => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <span style="font-size:18px;">${iconFor(tx.type)}</span>
      <div style="flex:1; min-width:0;">
        <div class="small bold">${tx.type}</div>
        <div class="tiny muted">${tx.fundName} · ${tx.date}</div>
      </div>
      <div style="text-align:right;">
        <div class="small bold">${fmtINR(tx.amount)}</div>
        <div class="tiny pos">${tx.status}</div>
      </div>`;
    card.appendChild(row);
  });
  list.appendChild(card);
}

// ───────────────────────────── Profile ─────────────────────────────
function renderProfile() {
  document.getElementById('profile-initial').textContent = (STATE.user.name || 'I').charAt(0).toUpperCase();
  document.getElementById('profile-name').textContent = STATE.user.name || 'Investor';
  document.getElementById('profile-mobile').textContent = STATE.user.mobile ? `+91 ${STATE.user.mobile}` : '—';
  document.getElementById('profile-email').textContent = STATE.user.email || '—';
  document.getElementById('profile-pan').textContent = STATE.user.pan || '—';
  document.getElementById('profile-bank').textContent = STATE.user.bankAcc ? `••••${STATE.user.bankAcc.slice(-4)}` : '—';
  const kycBadge = document.getElementById('profile-kyc-badge');
  if (STATE.kycStatus === 'complete') {
    kycBadge.textContent = 'KYC Verified'; kycBadge.className = 'badge badge-active mt-8';
  } else {
    kycBadge.textContent = 'KYC Pending'; kycBadge.className = 'badge badge-paused mt-8';
  }
}

function logout() {
  localStorage.removeItem(STORAGE_KEY);
  STATE = loadState();
  const plannerOut = document.getElementById('planner-result');
  if (plannerOut) { plannerOut.innerHTML = ''; delete plannerOut.dataset.rendered; }
  navHistory = [];
  go('screen-welcome');
}

// ───────────────────────────── Goal Planner (SIP calculator) ─────────────────
function elc(tag, className, text) {
  const e = document.createElement('div');
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function renderGoalPlanner() {
  const out = document.getElementById('planner-result');
  if (out && !out.dataset.rendered) {
    out.dataset.rendered = '1';
    calculateGoal();
  }
}

function calculateGoal() {
  const monthly = Math.max(0, Number(document.getElementById('planner-monthly').value) || 0);
  const years = Math.max(0, Number(document.getElementById('planner-years').value) || 0);
  const annualReturn = Math.max(0, Number(document.getElementById('planner-return').value) || 0);

  const months = Math.round(years * 12);
  const monthlyRate = annualReturn / 100 / 12;
  const invested = monthly * months;

  // Future value of a monthly SIP (ordinary annuity, compounded monthly).
  let futureValue;
  if (monthlyRate === 0) {
    futureValue = invested;
  } else {
    futureValue = monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
  }
  const gains = Math.max(0, futureValue - invested);

  const out = document.getElementById('planner-result');
  if (!out) return;
  out.dataset.rendered = '1';

  const investedPct = futureValue > 0 ? Math.round((invested / futureValue) * 100) : 0;
  out.innerHTML = `
    <div class="card">
      <div class="section-header"><h3>Projected Value</h3></div>
      <div class="bold" style="font-size:28px;">₹${Math.round(futureValue).toLocaleString('en-IN')}</div>
      <div class="tiny muted mt-4">after ${months} month${months === 1 ? '' : 's'} of ₹${monthly.toLocaleString('en-IN')}/mo @ ${annualReturn}% p.a.</div>
      <div class="col gap-8 mt-16">
        <div class="allocation-bar-track" style="display:flex; height:10px; border-radius:6px; overflow:hidden; background:var(--border);">
          <div style="width:${investedPct}%; background:#6c5ce7;"></div>
          <div style="width:${100 - investedPct}%; background:#1fd896;"></div>
        </div>
        <div class="row-between tiny">
          <span><span style="color:#6c5ce7;">●</span> Invested: ₹${Math.round(invested).toLocaleString('en-IN')}</span>
          <span><span style="color:#1fd896;">●</span> Est. Returns: ₹${Math.round(gains).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="tiny faint mt-16">Illustrative only, assumes a constant annual return — actual mutual fund returns vary and are not guaranteed.</div>
    </div>`;
}

// ───────────────────────────── Init ─────────────────────────────
function updateClock() {
  const now = new Date();
  let h = now.getHours() % 12 || 12;
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;
}

async function init() {
  updateClock();
  setInterval(updateClock, 30000);

  try {
    const res = await fetch('data/funds.json');
    FUNDS = await res.json();
  } catch {
    FUNDS = [];
  }

  document.getElementById('input-pan').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    document.getElementById('btn-pan-next').disabled = !validatePanFormat(e.target.value);
  });

  wireOtpBoxes();

  setTimeout(() => {
    if (STATE.onboarded) {
      go('screen-home');
    } else if (STATE.user.mobile) {
      go(STATE.kycStatus === 'complete' ? 'screen-kyc-success' : 'screen-kyc-intro');
    } else {
      go('screen-welcome');
    }
  }, 900);
}

init();
