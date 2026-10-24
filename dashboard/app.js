// Pixel Push money dashboard: subscriptions (expenses), client retainers (income),
// a payment ledger and profit, all stored in this browser's localStorage.

const STORAGE_KEY = 'pixelpush-dashboard-v1';

const CYCLE_PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const CYCLE_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const CATEGORY_COLORS = ['#4e54c8', '#1f9d6b', '#e0564f', '#c98a12', '#8e44ad', '#0f8fb5', '#d35490', '#5a6b7b'];

// ---------- State ----------

let state = load();

function emptyState() {
  return { settings: { currency: 'INR' }, items: [], payments: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return { ...emptyState(), ...data, settings: { ...emptyState().settings, ...data.settings } };
  } catch {
    return emptyState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save. Browser storage may be full or blocked.');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function money(n, opts = {}) {
  const locale = state.settings.currency === 'INR' ? 'en-IN' : undefined;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: state.settings.currency,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(n || 0);
}

function shortMoney(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (state.settings.currency === 'INR') {
    if (abs >= 1e7) return sign + (abs / 1e7).toFixed(1) + 'Cr';
    if (abs >= 1e5) return sign + (abs / 1e5).toFixed(1) + 'L';
  }
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'k';
  return sign + Math.round(abs);
}

// Dates are stored as YYYY-MM-DD strings and handled in local time.
function todayStr() {
  const d = new Date();
  return toDateStr(d);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function fmtDate(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function monthKey(s) {
  return s.slice(0, 7);
}

function addCycle(dateStr, cycle) {
  const d = parseDate(dateStr);
  if (cycle === 'weekly') {
    d.setDate(d.getDate() + 7);
    return toDateStr(d);
  }
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[cycle] || 1;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp to the last day of the target month (e.g. 31 Jan -> 28/29 Feb).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toDateStr(d);
}

const monthly = item => item.status === 'active' ? item.amount * (CYCLE_PER_MONTH[item.cycle] || 1) : 0;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Navigation ----------

function showView(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  try { localStorage.setItem(STORAGE_KEY + '-tab', name); } catch {}
}

$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (btn) showView(btn.dataset.view);
});

// ---------- Render ----------

function render() {
  renderKpis();
  renderChart();
  renderUpcoming();
  renderBreakdowns();
  renderItemsTable('expense');
  renderItemsTable('income');
  renderPayments();
  renderCategoryList();
  $('#s-currency').value = state.settings.currency;
}

function renderKpis() {
  const active = state.items.filter(i => i.status === 'active');
  const mrr = active.filter(i => i.type === 'income').reduce((s, i) => s + monthly(i), 0);
  const burn = active.filter(i => i.type === 'expense').reduce((s, i) => s + monthly(i), 0);
  const net = mrr - burn;
  const margin = mrr > 0 ? Math.round((net / mrr) * 100) : 0;

  const thisMonth = monthKey(todayStr());
  const paidThisMonth = state.payments.filter(p => p.status === 'paid' && monthKey(p.date) === thisMonth);
  const inThis = paidThisMonth.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0);
  const outThis = paidThisMonth.filter(p => p.type === 'expense').reduce((s, p) => s + p.amount, 0);

  const yearStart = new Date().getFullYear() + '-01';
  const paidYtd = state.payments.filter(p => p.status === 'paid' && monthKey(p.date) >= yearStart);
  const ytd = paidYtd.reduce((s, p) => s + (p.type === 'income' ? p.amount : -p.amount), 0);

  const overdue = state.items.filter(i => i.status === 'active' && i.nextDate < todayStr()).length;
  const activeSubs = active.filter(i => i.type === 'expense').length;
  const activeClients = active.filter(i => i.type === 'income').length;

  const tiles = [
    { cls: 'income', label: 'Monthly recurring revenue', value: money(mrr), sub: `${activeClients} active client${activeClients === 1 ? '' : 's'}` },
    { cls: 'expense', label: 'Monthly subscription costs', value: money(burn), sub: `${activeSubs} active subscription${activeSubs === 1 ? '' : 's'}` },
    { cls: net < 0 ? 'negative' : 'profit', label: 'Expected monthly profit', value: money(net), sub: mrr > 0 ? `${margin}% margin` : 'Add clients to see margin' },
    { cls: inThis - outThis < 0 ? 'negative' : 'profit', label: 'Actual profit this month', value: money(inThis - outThis), sub: `${money(inThis)} in · ${money(outThis)} out` },
    { cls: ytd < 0 ? 'negative' : 'profit', label: `Profit so far in ${new Date().getFullYear()}`, value: money(ytd), sub: overdue ? `⚠ ${overdue} overdue item${overdue === 1 ? '' : 's'}` : 'Nothing overdue' },
  ];

  $('#kpis').innerHTML = tiles.map(t => `
    <div class="kpi ${t.cls}">
      <div class="label">${esc(t.label)}</div>
      <div class="value">${esc(t.value)}</div>
      <div class="sub">${esc(t.sub)}</div>
    </div>`).join('');
}

function last12Months() {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: m.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return out;
}

function renderChart() {
  const months = last12Months().map(m => ({ ...m, income: 0, expense: 0 }));
  const byKey = Object.fromEntries(months.map(m => [m.key, m]));
  for (const p of state.payments) {
    if (p.status !== 'paid') continue;
    const m = byKey[monthKey(p.date)];
    if (m) m[p.type] += p.amount;
  }
  months.forEach(m => { m.profit = m.income - m.expense; });

  const W = 640, H = 260, padL = 48, padR = 10, padT = 10, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxVal = Math.max(1, ...months.map(m => Math.max(m.income, m.expense, m.profit)));
  const minVal = Math.min(0, ...months.map(m => m.profit));
  const range = maxVal - minVal;
  const y = v => padT + innerH - ((v - minVal) / range) * innerH;
  const slot = innerW / months.length;
  const barW = Math.min(16, slot / 3);

  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = minVal + (range * i) / ticks;
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    grid += `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(shortMoney(v))}</text>`;
  }

  let bars = '', labels = '', points = [];
  months.forEach((m, i) => {
    const cx = padL + slot * i + slot / 2;
    const zero = y(0);
    const bar = (v, x, color) => {
      const top = y(v);
      return `<rect x="${x}" y="${Math.min(top, zero)}" width="${barW}" height="${Math.max(0, Math.abs(zero - top))}" rx="3" fill="${color}">
        <title>${esc(m.label)}: ${esc(money(v))}</title></rect>`;
    };
    bars += bar(m.income, cx - barW - 1, 'var(--income)');
    bars += bar(m.expense, cx + 1, 'var(--expense)');
    labels += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(m.label)}</text>`;
    points.push([cx, y(m.profit), m]);
  });

  const line = `<polyline fill="none" stroke="var(--profit)" stroke-width="2.5" points="${points.map(p => p.slice(0, 2).join(',')).join(' ')}"/>`;
  const dots = points.map(([x, py, m]) =>
    `<circle cx="${x}" cy="${py}" r="3.5" fill="var(--profit)"><title>${esc(m.label)} profit: ${esc(money(m.profit))}</title></circle>`
  ).join('');

  const hasData = months.some(m => m.income || m.expense);
  $('#chart').innerHTML = hasData
    ? `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income, expenses and profit over the last 12 months">
        <g class="grid">${grid}</g>${bars}${line}${dots}${labels}
      </svg>`
    : `<p class="empty">No payments logged yet. Mark a subscription or client as paid, or log a payment, and it will show up here.</p>`;
}

function renderUpcoming() {
  const today = todayStr();
  const items = state.items
    .filter(i => i.status === 'active' && daysBetween(today, i.nextDate) <= 30)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  $('#upcoming').innerHTML = items.length ? items.map(i => {
    const days = daysBetween(today, i.nextDate);
    const when = days < 0 ? `<span class="badge overdue">${-days}d overdue</span>`
      : days === 0 ? '<span class="badge pending">Today</span>'
      : `<small>in ${days} day${days === 1 ? '' : 's'}</small>`;
    return `<li>
      <div class="meta">
        <strong>${esc(i.name)}</strong>
        <small>${fmtDate(i.nextDate)}</small> ${when}
      </div>
      <span class="amount ${i.type}">${i.type === 'income' ? '+' : '−'}${esc(money(i.amount))}</span>
      <button class="btn small" data-pay="${i.id}">${i.type === 'income' ? 'Received' : 'Paid'}</button>
    </li>`;
  }).join('') : '<li class="empty">Nothing due in the next 30 days 🎉</li>';
}

function breakdownHtml(groups, total) {
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="empty">Nothing here yet.</p>';
  return entries.map(([name, value], idx) => {
    const pct = total ? (value / total) * 100 : 0;
    return `<div class="bar-row">
      <div class="bar-label"><span>${esc(name)}</span><span class="amount">${esc(money(value))} <small class="muted">${pct.toFixed(0)}%</small></span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}"></div></div>
    </div>`;
  }).join('');
}

function renderBreakdowns() {
  const cats = {}, clients = {};
  let catTotal = 0, clientTotal = 0;
  for (const i of state.items) {
    const m = monthly(i);
    if (!m) continue;
    if (i.type === 'expense') {
      const key = i.category || 'Uncategorised';
      cats[key] = (cats[key] || 0) + m;
      catTotal += m;
    } else {
      clients[i.name] = (clients[i.name] || 0) + m;
      clientTotal += m;
    }
  }
  $('#by-category').innerHTML = breakdownHtml(cats, catTotal);
  $('#by-client').innerHTML = breakdownHtml(clients, clientTotal);
}

function renderItemsTable(type) {
  const today = todayStr();
  const statusOrder = { active: 0, paused: 1, cancelled: 2 };
  const items = state.items
    .filter(i => i.type === type)
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.nextDate.localeCompare(b.nextDate));

  const isIncome = type === 'income';
  const table = $(`#table-${type}`);
  if (!items.length) {
    table.innerHTML = `<tbody><tr><td class="empty">${isIncome
      ? 'No clients yet. Add your first retainer to start tracking revenue.'
      : 'No subscriptions yet. Add the platforms you pay for, such as Canva, Adobe or Meta ads.'}</td></tr></tbody>`;
    return;
  }

  const total = items.reduce((s, i) => s + monthly(i), 0);
  table.innerHTML = `
    <thead><tr>
      <th>${isIncome ? 'Client' : 'Platform'}</th>
      <th>${isIncome ? 'Service' : 'Category'}</th>
      <th class="num">Amount</th>
      <th>Cycle</th>
      <th class="num">Per month</th>
      <th>Next due</th>
      <th>Status</th>
      <th></th>
    </tr></thead>
    <tbody>${items.map(i => {
      const overdue = i.status === 'active' && i.nextDate < today;
      return `<tr class="${i.status !== 'active' ? 'dim' : ''}">
        <td><strong>${esc(i.name)}</strong>${i.method ? `<span class="sub">${esc(i.method)}</span>` : ''}</td>
        <td>${esc(i.category || '—')}</td>
        <td class="num">${esc(money(i.amount, { decimals: 2 }))}</td>
        <td>${CYCLE_LABEL[i.cycle]}</td>
        <td class="num">${esc(money(monthly(i)))}</td>
        <td>${fmtDate(i.nextDate)} ${overdue ? '<span class="badge overdue">Overdue</span>' : ''}</td>
        <td><span class="badge ${i.status}">${i.status}</span></td>
        <td><div class="actions">
          ${i.status === 'active' ? `<button class="btn small" data-pay="${i.id}">${isIncome ? 'Mark received' : 'Mark paid'}</button>` : ''}
          <button class="btn small ghost" data-edit="${i.id}">Edit</button>
          <button class="btn small ghost danger" data-delete-item="${i.id}">Delete</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr>
      <td colspan="4"><strong>Total (active)</strong></td>
      <td class="num"><strong>${esc(money(total))}</strong></td>
      <td colspan="3" class="muted">${esc(money(total * 12))} per year</td>
    </tr></tfoot>`;
}

function filteredPayments() {
  const type = $('#f-type').value;
  const month = $('#f-month').value;
  const q = $('#f-search').value.trim().toLowerCase();
  return state.payments
    .filter(p => (!type || p.type === type)
      && (!month || monthKey(p.date) === month)
      && (!q || `${p.description} ${p.category}`.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderPayments() {
  const rows = filteredPayments();
  const paid = rows.filter(p => p.status === 'paid');
  const inSum = paid.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0);
  const outSum = paid.filter(p => p.type === 'expense').reduce((s, p) => s + p.amount, 0);
  $('#f-summary').textContent = `In ${money(inSum)} · Out ${money(outSum)} · Profit ${money(inSum - outSum)}`;

  const table = $('#table-payments');
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty">${state.payments.length ? 'No payments match these filters.' : 'No payments logged yet.'}</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead>
    <tbody>${rows.map(p => `<tr>
      <td>${fmtDate(p.date)}</td>
      <td>${esc(p.description)}</td>
      <td>${esc(p.category || '—')}</td>
      <td><span class="badge ${p.type}">${p.type}</span></td>
      <td><span class="badge ${p.status}">${p.status}</span></td>
      <td class="num"><span class="amount ${p.type}">${p.type === 'income' ? '+' : '−'}${esc(money(p.amount, { decimals: 2 }))}</span></td>
      <td><div class="actions">
        <button class="btn small ghost" data-edit-payment="${p.id}">Edit</button>
        <button class="btn small ghost danger" data-delete-payment="${p.id}">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody>`;
}

function renderCategoryList() {
  const defaults = ['Design', 'Social media', 'Ads', 'Hosting', 'Software', 'Analytics', 'Email marketing', 'Retainer', 'Project'];
  const used = [...state.items, ...state.payments].map(x => x.category).filter(Boolean);
  const all = [...new Set([...used, ...defaults])];
  $('#category-list').innerHTML = all.map(c => `<option value="${esc(c)}"></option>`).join('');
}

// ---------- Actions ----------

function markPaid(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.payments.push({
    id: uid(),
    type: item.type,
    date: todayStr(),
    description: item.name,
    category: item.category,
    amount: item.amount,
    status: 'paid',
    itemId: item.id,
  });
  item.nextDate = addCycle(item.nextDate, item.cycle);
  save();
  render();
  toast(`${item.type === 'income' ? 'Received' : 'Paid'}: ${item.name}. Next due ${fmtDate(item.nextDate)}`);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-close]');
  if (!t) return;
  const d = t.dataset;
  if (d.pay) markPaid(d.pay);
  else if (d.add) openItemDialog(d.add);
  else if (d.edit) openItemDialog(null, d.edit);
  else if (d.deleteItem) {
    const item = state.items.find(i => i.id === d.deleteItem);
    if (item && confirm(`Delete "${item.name}"? Past payments stay in your history.`)) {
      state.items = state.items.filter(i => i.id !== item.id);
      save(); render();
    }
  } else if (d.editPayment) openPaymentDialog(d.editPayment);
  else if (d.deletePayment) {
    if (confirm('Delete this payment?')) {
      state.payments = state.payments.filter(p => p.id !== d.deletePayment);
      save(); render();
    }
  } else if ('close' in d) t.closest('dialog').close();
});

// ---------- Dialogs ----------

const itemDialog = $('#item-dialog');
const itemForm = $('#item-form');

function openItemDialog(type, id) {
  const item = id ? state.items.find(i => i.id === id) : null;
  type = item ? item.type : type;
  const isIncome = type === 'income';
  itemForm.reset();
  $('#item-title').textContent = `${item ? 'Edit' : 'Add'} ${isIncome ? 'client' : 'subscription'}`;
  $('#name-label').textContent = isIncome ? 'Client name' : 'Platform / service';
  $('#cat-label').textContent = isIncome ? 'Service provided' : 'Category';
  const f = itemForm.elements;
  f.id.value = item?.id || '';
  f.type.value = type;
  f.name.value = item?.name || '';
  f.category.value = item?.category || '';
  f.amount.value = item?.amount ?? '';
  f.cycle.value = item?.cycle || 'monthly';
  f.nextDate.value = item?.nextDate || todayStr();
  f.status.value = item?.status || 'active';
  f.method.value = item?.method || '';
  f.notes.value = item?.notes || '';
  itemDialog.showModal();
}

itemForm.addEventListener('submit', () => {
  const f = itemForm.elements;
  const data = {
    id: f.id.value || uid(),
    type: f.type.value,
    name: f.name.value.trim(),
    category: f.category.value.trim(),
    amount: parseFloat(f.amount.value) || 0,
    cycle: f.cycle.value,
    nextDate: f.nextDate.value,
    status: f.status.value,
    method: f.method.value.trim(),
    notes: f.notes.value.trim(),
  };
  const idx = state.items.findIndex(i => i.id === data.id);
  if (idx >= 0) state.items[idx] = { ...state.items[idx], ...data };
  else state.items.push(data);
  save();
  render();
  toast('Saved');
});

const paymentDialog = $('#payment-dialog');
const paymentForm = $('#payment-form');

function openPaymentDialog(id) {
  const p = id ? state.payments.find(x => x.id === id) : null;
  paymentForm.reset();
  $('#payment-title').textContent = p ? 'Edit payment' : 'Log payment';
  const f = paymentForm.elements;
  f.id.value = p?.id || '';
  f.type.value = p?.type || 'income';
  f.date.value = p?.date || todayStr();
  f.description.value = p?.description || '';
  f.amount.value = p?.amount ?? '';
  f.category.value = p?.category || '';
  f.status.value = p?.status || 'paid';
  paymentDialog.showModal();
}

$('#add-payment').addEventListener('click', () => openPaymentDialog());

paymentForm.addEventListener('submit', () => {
  const f = paymentForm.elements;
  const data = {
    id: f.id.value || uid(),
    type: f.type.value,
    date: f.date.value,
    description: f.description.value.trim(),
    amount: parseFloat(f.amount.value) || 0,
    category: f.category.value.trim(),
    status: f.status.value,
  };
  const idx = state.payments.findIndex(p => p.id === data.id);
  if (idx >= 0) state.payments[idx] = { ...state.payments[idx], ...data };
  else state.payments.push(data);
  save();
  render();
  toast('Payment saved');
});

// ---------- Filters ----------

['#f-type', '#f-month', '#f-search'].forEach(sel => $(sel).addEventListener('input', renderPayments));

// ---------- Settings ----------

$('#s-currency').addEventListener('change', e => {
  state.settings.currency = e.target.value;
  save();
  render();
});

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$('#export-json').addEventListener('click', () => {
  download(`pixelpush-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
});

$('#export-csv').addEventListener('click', () => {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Description', 'Category', 'Status', 'Amount', 'Currency']];
  [...state.payments].sort((a, b) => a.date.localeCompare(b.date)).forEach(p => {
    rows.push([p.date, p.type, p.description, p.category, p.status, p.amount, state.settings.currency]);
  });
  download(`pixelpush-payments-${todayStr()}.csv`, rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
});

$('#import-json').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.payments)) throw new Error('bad file');
    if (!confirm('Replace all current data with this backup?')) return;
    state = { ...emptyState(), ...data, settings: { ...emptyState().settings, ...data.settings } };
    save();
    render();
    toast('Backup imported');
  } catch {
    toast('That file is not a valid Pixel Push backup.');
  } finally {
    e.target.value = '';
  }
});

$('#clear-all').addEventListener('click', () => {
  if (!confirm('Delete ALL subscriptions, clients and payments? This cannot be undone. Export a backup first if unsure.')) return;
  state = { ...emptyState(), settings: state.settings };
  save();
  render();
  toast('All data deleted');
});

$('#load-sample').addEventListener('click', () => {
  if ((state.items.length || state.payments.length)
    && !confirm('Replace your current data with sample data?')) return;
  state = sampleData(state.settings);
  save();
  render();
  showView('overview');
  toast('Sample data loaded');
});

function sampleData(settings) {
  const today = todayStr();
  const inDays = n => { const d = parseDate(today); d.setDate(d.getDate() + n); return toDateStr(d); };
  const items = [
    { name: 'Canva Pro', category: 'Design', amount: 499, cycle: 'monthly', nextDate: inDays(4), method: 'HDFC credit card' },
    { name: 'Adobe Creative Cloud', category: 'Design', amount: 4230, cycle: 'monthly', nextDate: inDays(12), method: 'HDFC credit card' },
    { name: 'Meta Verified', category: 'Social media', amount: 699, cycle: 'monthly', nextDate: inDays(-2), method: 'UPI' },
    { name: 'Later (scheduler)', category: 'Social media', amount: 2100, cycle: 'monthly', nextDate: inDays(20) },
    { name: 'Google Workspace', category: 'Software', amount: 1380, cycle: 'monthly', nextDate: inDays(8) },
    { name: 'Website hosting', category: 'Hosting', amount: 3600, cycle: 'yearly', nextDate: inDays(95) },
    { name: 'ChatGPT Plus', category: 'Software', amount: 1950, cycle: 'monthly', nextDate: inDays(15) },
    { name: 'Mailchimp', category: 'Email marketing', amount: 1100, cycle: 'monthly', nextDate: inDays(25), status: 'paused' },
  ].map(i => ({ type: 'expense', status: 'active', method: '', notes: '', ...i, id: uid() }));

  const clients = [
    { name: 'The Sacred Cocoon', category: 'Instagram management', amount: 18000, cycle: 'monthly', nextDate: inDays(3) },
    { name: 'Bloom Bakery', category: 'Social media + content', amount: 25000, cycle: 'monthly', nextDate: inDays(10) },
    { name: 'Urban Fit Studio', category: 'Ads management', amount: 15000, cycle: 'monthly', nextDate: inDays(-1) },
    { name: 'Nova Interiors', category: 'Brand identity retainer', amount: 45000, cycle: 'quarterly', nextDate: inDays(40) },
  ].map(i => ({ type: 'income', status: 'active', method: 'Bank transfer', notes: '', ...i, id: uid() }));

  // Generate roughly 10 months of history, with the client list growing over time.
  const payments = [];
  for (let m = 9; m >= 0; m--) {
    const base = parseDate(today);
    base.setDate(1);
    base.setMonth(base.getMonth() - m);
    const dateIn = day => {
      const d = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28));
      return toDateStr(d) > today ? null : toDateStr(d);
    };
    items.filter(i => i.cycle === 'monthly' && i.status === 'active').forEach((i, idx) => {
      const date = dateIn(3 + idx * 3);
      if (date) payments.push({ id: uid(), type: 'expense', date, description: i.name, category: i.category, amount: i.amount, status: 'paid', itemId: i.id });
    });
    clients.forEach((c, idx) => {
      if (c.cycle === 'monthly' && m <= 9 - idx * 2) {
        const date = dateIn(5 + idx * 4);
        if (date) payments.push({ id: uid(), type: 'income', date, description: c.name, category: c.category, amount: c.amount, status: 'paid', itemId: c.id });
      }
      if (c.cycle === 'quarterly' && m % 3 === 1) {
        const date = dateIn(12);
        if (date) payments.push({ id: uid(), type: 'income', date, description: c.name, category: c.category, amount: c.amount, status: 'paid', itemId: c.id });
      }
    });
    if (m === 6 || m === 2) {
      const date = dateIn(18);
      if (date) payments.push({ id: uid(), type: 'income', date, description: 'One-off logo project', category: 'Project', amount: 12000, status: 'paid' });
    }
    if (m === 4) {
      const date = dateIn(22);
      if (date) payments.push({ id: uid(), type: 'expense', date, description: 'Meta ads test budget', category: 'Ads', amount: 8000, status: 'paid' });
    }
  }
  return { settings: { ...settings }, items: [...items, ...clients], payments };
}

// ---------- Boot ----------

render();
try {
  const tab = localStorage.getItem(STORAGE_KEY + '-tab');
  if (tab && $(`#view-${tab}`)) showView(tab);
} catch {}
