/**
 * ==========================================================================
 * FAMILY EXPENSE TRACKER BANGLA — CORE APPLICATION LOGIC
 * ==========================================================================
 */

// Helper selector
const $ = id => document.getElementById(id);

// Bengali Constants & Localization
const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const DAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

const CATEGORIES = {
  expense: [
    'বাজার ও সদাই',
    'বাসা ভাড়া',
    'বিদ্যুৎ/গ্যাস/পানি',
    'যাতায়াত ও জ্বালানি',
    'চিকিৎসা ও ওষুধ',
    'শিক্ষা ও বইপত্র',
    'মোবাইল ও ইন্টারনেট',
    'পোশাক-আশাক',
    'বিনোদন ও ভ্রমণ',
    'ঋণ ও কিস্তি',
    'উপহার ও সাহায্য',
    'গৃহস্থালি ও অন্যান্য'
  ],
  income: [
    'বেতন',
    'ব্যবসা',
    'ফ্রিল্যান্সিং',
    'বাড়ি/দোকান ভাড়া',
    'বিনিয়োগ ও মুনাফা',
    'উপহার ও অনুদান',
    'অন্যান্য আয়'
  ]
};

const STORAGE_KEY = 'familyExpenseTracker.v1';

// Application State
let state = loadStoredState();
let activeView = 'dashboard';
let pendingDeleteId = null;
let toastTimers = [];
let currentFilteredTransactions = [];

/**
 * Universal safe ID generator (Works across all devices & non-secure LANs)
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Bengali & English Digits Normalizer
 */
function normalizeBnDigits(str) {
  const bnToEn = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  return String(str ?? '').replace(/[০-৯]/g, d => bnToEn[d] || d);
}

/**
 * Parse numbers supporting Bengali digits, decimals, and commas
 */
function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = normalizeBnDigits(val).replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Robust Date Parts Parser (handles YYYY-MM-DD, YYYY/M/D, YYYY.M.D)
 */
function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.replace(/[\/\.]/g, '-').split('-');
  if (parts.length >= 3) {
    const y = parseInt(normalizeBnDigits(parts[0]), 10);
    const m = parseInt(normalizeBnDigits(parts[1]), 10);
    const d = parseInt(normalizeBnDigits(parts[2]), 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12) {
      return { year: y, month: m, day: d };
    }
  }
  return null;
}

/**
 * Load state safely from localStorage
 */
function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      lastSaved: parsed.lastSaved || null,
      version: parsed.version || 1,
      settings: Object.assign({
        familyName: 'পরিবারের হিসাব',
        budgetLimit: 0,
        defaultMethod: 'নগদ'
      }, parsed.settings || {})
    };
  } catch (e) {
    console.error('Failed to load local storage state:', e);
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    transactions: [],
    lastSaved: null,
    version: 1,
    settings: {
      familyName: 'পরিবারের হিসাব',
      budgetLimit: 0,
      defaultMethod: 'নগদ'
    }
  };
}

/**
 * Save state to localStorage & update UI metrics
 */
function persistState() {
  state.lastSaved = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateStorageStatsUI();
}

/**
 * Bengali number and currency helpers
 */
function bn(num) {
  if (num === null || num === undefined || isNaN(num)) return '০';
  return Number(num).toLocaleString('bn-BD', { maximumFractionDigits: 2 });
}

function money(num) {
  const n = Number(num || 0);
  const prefix = n < 0 ? '− ৳' : '৳';
  return prefix + bn(Math.abs(n));
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Toast Notification System
 */
function showToast(msg, type = 'info') {
  const hub = $('toastHub');
  if (!hub) return;

  const item = document.createElement('div');
  item.className = `toast-item ${type}`;
  item.textContent = msg;
  hub.appendChild(item);

  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    item.style.transition = 'all 0.2s ease';
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 200);
  }, 3200);
}

/**
 * Sorting & Filtering Helpers
 */
function sortTxByDateDesc(a, b) {
  return (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
}

function getAvailableYears() {
  const currentYear = new Date().getFullYear();
  const set = new Set([currentYear]);
  state.transactions.forEach(t => {
    const p = parseDateParts(t.date);
    if (p && !isNaN(p.year)) set.add(p.year);
  });
  return Array.from(set).sort((a, b) => b - a);
}

function populateYearSelects() {
  const years = getAvailableYears();
  const selects = ['dashYear', 'yearFilter', 'reportYear'];

  selects.forEach(selectId => {
    const el = $(selectId);
    if (!el) return;
    const currentVal = el.value || (selectId === 'yearFilter' ? 'all' : new Date().getFullYear());

    let html = '';
    if (selectId === 'yearFilter') {
      html += '<option value="all">সব বছর</option>';
    }
    html += years.map(y => `<option value="${y}">${bn(y)}</option>`).join('');
    el.innerHTML = html;

    if ([...el.options].some(o => o.value === String(currentVal))) {
      el.value = currentVal;
    }
  });
}

function populateMonthSelects() {
  const dashMonth = $('dashMonth');
  const monthFilter = $('monthFilter');

  const optionsHTML = MONTHS_BN.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  if (dashMonth) {
    const prev = dashMonth.value;
    dashMonth.innerHTML = '<option value="all">সব মাস (পুরো বছর)</option>' + optionsHTML;
    if (prev) dashMonth.value = prev;
  }
  if (monthFilter) {
    const prev = monthFilter.value;
    monthFilter.innerHTML = '<option value="all">সব মাস</option>' + optionsHTML;
    if (prev) monthFilter.value = prev;
  }
}

function populateCategoryFilter() {
  const el = $('categoryFilter');
  if (!el) return;
  const prev = el.value;
  const allCats = Array.from(new Set([
    ...CATEGORIES.expense,
    ...CATEGORIES.income,
    ...state.transactions.map(t => t.category).filter(Boolean)
  ]));

  el.innerHTML = '<option value="all">সব খাত</option>' + allCats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (prev && [...el.options].some(o => o.value === prev)) {
    el.value = prev;
  }
}

/**
 * Financial Calculation Helpers
 */
function calculateSums(transactions) {
  return transactions.reduce((acc, t) => {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') {
      acc.income += amount;
    } else {
      acc.expense += amount;
    }
    acc.net = acc.income - acc.expense;
    return acc;
  }, { income: 0, expense: 0, net: 0 });
}

/**
 * Filter transactions for current Dashboard view
 */
function getFilteredDashboardTx() {
  const yearSelect = $('dashYear');
  const monthSelect = $('dashMonth');
  const y = Number(yearSelect ? yearSelect.value : new Date().getFullYear());
  const m = monthSelect ? monthSelect.value : 'all';

  return state.transactions.filter(t => {
    if (!t.date) return false;
    const p = parseDateParts(t.date);
    if (!p || p.year !== y) return false;
    if (m !== 'all') {
      if (p.month !== Number(m)) return false;
    }
    return true;
  });
}

/**
 * Update the Top Navigation and Sub-Header Bar
 */
function renderTopbarAndHeader() {
  const d = new Date();
  const dayName = DAYS_BN[d.getDay()];
  const monthName = MONTHS_BN[d.getMonth()];
  const dateFormatted = `${bn(d.getDate())} ${monthName}, ${bn(d.getFullYear())} | ${dayName}`;

  const liveDate = $('liveDateText');
  if (liveDate) liveDate.textContent = dateFormatted;

  const familyName = state.settings?.familyName || 'পরিবারের হিসাব';
  const nameEl = $('displayFamilyName');
  if (nameEl) nameEl.textContent = familyName;

  // Global net balance
  const globalSums = calculateSums(state.transactions);
  const topbarBal = $('topbarBalance');
  if (topbarBal) {
    topbarBal.textContent = money(globalSums.net);
    topbarBal.style.color = globalSums.net < 0 ? '#E11D48' : '#0B2A4A';
  }

  // Header executive balance chip
  const navBal = $('navBalanceVal');
  if (navBal) {
    navBal.textContent = money(globalSums.net);
    navBal.style.color = globalSums.net < 0 ? '#FCA5A5' : '#86EFAC';
  }

  // Header transaction counter badge
  const navBadge = $('navTxBadge');
  if (navBadge) {
    navBadge.textContent = bn(state.transactions.length);
  }
}

/**
 * ==========================================================================
 * 1. DASHBOARD VIEW RENDERING
 * ==========================================================================
 */
function renderDashboard() {
  const list = getFilteredDashboardTx();
  const sums = calculateSums(list);

  // Update Period summary chip
  const y = Number($('dashYear')?.value || new Date().getFullYear());
  const m = $('dashMonth')?.value || 'all';
  const periodText = m === 'all'
    ? `${bn(y)} সালের পুরো বছরের হিসাব`
    : `${MONTHS_BN[Number(m) - 1]}, ${bn(y)} এর হিসাব`;
  const periodChipText = $('periodChipText');
  if (periodChipText) periodChipText.textContent = periodText;

  // Card 1: মোট আয়
  $('totalIncome').textContent = money(sums.income);

  // Card 2: মোট খরচ & বাজেট সতর্কতা
  $('totalExpense').textContent = money(sums.expense);
  const budgetLimit = Number(state.settings?.budgetLimit || 0);
  const budgetStatus = $('expenseBudgetStatus');
  if (budgetStatus) {
    if (budgetLimit > 0) {
      if (sums.expense > budgetLimit) {
        const over = sums.expense - budgetLimit;
        budgetStatus.textContent = `⚠ বাজেট অতিক্রম করেছে! (অতিরিক্ত: ${money(over)})`;
        budgetStatus.style.color = '#E11D48';
        budgetStatus.style.fontWeight = '700';
      } else {
        const remaining = budgetLimit - sums.expense;
        budgetStatus.textContent = `✓ বাজেটের মধ্যে রয়েছে (বাকি: ${money(remaining)})`;
        budgetStatus.style.color = '#059669';
        budgetStatus.style.fontWeight = '600';
      }
    } else {
      budgetStatus.textContent = 'নির্বাচিত সময়ের পারিবারিক ব্যয়';
      budgetStatus.style.color = '';
      budgetStatus.style.fontWeight = '';
    }
  }

  // Card 3: বর্তমান ব্যালেন্স
  const balEl = $('totalBalance');
  balEl.textContent = money(sums.net);
  const balStatus = $('balanceStatusText');
  if (balStatus) {
    if (sums.net < 0) {
      balStatus.textContent = 'খরচ আয়ের চেয়ে বেশি (ঘাটতি)';
      balStatus.style.color = '#FFE4E6';
    } else {
      balStatus.textContent = 'আয় থেকে খরচ বাদে সঞ্চিত স্থিতি';
      balStatus.style.color = 'rgba(255,255,255,0.85)';
    }
  }

  // Card 4: মোট লেনদেন
  $('totalCount').textContent = `${bn(list.length)} টি`;

  // Render Dashboard Chart: 12 Months Comparison for selected Year
  renderMonthlyBarChart(y);

  // Render Top Expense Categories
  renderCategoryBreakdown(list);

  // Render Recent Transactions
  renderRecentTransactionsTable(list);
}

/**
 * Render Monthly Income vs Expense Bars
 */
function renderMonthlyBarChart(selectedYear) {
  const chartEl = $('monthlyChart');
  if (!chartEl) return;

  const yearTx = state.transactions.filter(t => {
    const p = parseDateParts(t.date);
    return p && p.year === selectedYear;
  });

  const monthSums = Array.from({ length: 12 }, (_, i) => {
    const monthNumber = i + 1;
    const txs = yearTx.filter(t => {
      const p = parseDateParts(t.date);
      return p && p.month === monthNumber;
    });
    return calculateSums(txs);
  });

  const maxVal = Math.max(1, ...monthSums.flatMap(m => [m.income, m.expense]));

  chartEl.innerHTML = monthSums.map((m, i) => {
    const incomeHeight = Math.max(m.income > 0 ? 3 : 0, Math.round((m.income / maxVal) * 100));
    const expenseHeight = Math.max(m.expense > 0 ? 3 : 0, Math.round((m.expense / maxVal) * 100));
    const monthShort = MONTHS_BN[i].slice(0, 3);

    return `
      <div class="chart-month-col" title="${MONTHS_BN[i]}: আয় ${money(m.income)}, ব্যয় ${money(m.expense)}">
        <div class="chart-bars-wrap">
          <div class="chart-bar bar-income" style="height: ${incomeHeight}%"></div>
          <div class="chart-bar bar-expense" style="height: ${expenseHeight}%"></div>
        </div>
        <span class="chart-month-lbl">${monthShort}</span>
      </div>
    `;
  }).join('');
}

/**
 * Render Category Breakdown
 */
function renderCategoryBreakdown(list) {
  const catContainer = $('categoryChart');
  if (!catContainer) return;

  const expenses = list.filter(t => t.type === 'expense');
  if (!expenses.length) {
    catContainer.innerHTML = '<div class="empty-placeholder"><p>নির্বাচিত সময়ে কোনো খরচের হিসাব নেই।</p></div>';
    return;
  }

  const categoryTotals = expenses.reduce((acc, t) => {
    const cat = t.category || 'অন্যান্য';
    acc[cat] = (acc[cat] || 0) + (Number(t.amount) || 0);
    return acc;
  }, {});

  const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalExpense = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  catContainer.innerHTML = sorted.map(([name, amount]) => {
    const percent = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
    return `
      <div class="cat-row" data-cat="${esc(name)}" style="cursor:pointer;" title="“${esc(name)}” খাতের সকল লেনদেন দেখতে ক্লিক করুন">
        <span class="cat-name" title="${esc(name)}">${esc(name)}</span>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${percent}%"></div>
        </div>
        <span class="cat-amount-tag">${money(amount)} (${bn(percent)}%)</span>
      </div>
    `;
  }).join('');

  // Allow clicking on any category row to filter in transactions view
  catContainer.querySelectorAll('.cat-row[data-cat]').forEach(row => {
    row.addEventListener('click', () => {
      const cat = row.dataset.cat;
      switchView('transactions');
      if ($('categoryFilter')) {
        $('categoryFilter').value = cat;
        renderTransactions();
      }
    });
  });
}

/**
 * Render Recent Transactions preview
 */
function renderRecentTransactionsTable(list) {
  const container = $('recentTableWrap');
  if (!container) return;

  const recents = [...list].sort(sortTxByDateDesc).slice(0, 5);
  if (!recents.length) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <div class="empty-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
        </div>
        <h4>কোনো হিসাব পাওয়া যায়নি</h4>
        <p>নতুন আয়ের বা ব্যয়ের হিসাব যোগ করুন।</p>
      </div>
    `;
    return;
  }

  container.innerHTML = buildTableHTML(recents, false);
}

/**
 * ==========================================================================
 * 2. TRANSACTIONS MANAGEMENT VIEW RENDERING
 * ==========================================================================
 */
function renderTransactions() {
  const rawQuery = ($('searchInput')?.value || '').trim();
  const query = rawQuery.toLowerCase();
  const normQuery = normalizeBnDigits(rawQuery).toLowerCase();
  const typeFilter = $('typeFilter')?.value || 'all';
  const catFilter = $('categoryFilter')?.value || 'all';
  const yearFilter = $('yearFilter')?.value || 'all';
  const monthFilter = $('monthFilter')?.value || 'all';

  const clearBtn = $('clearSearchBtn');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !rawQuery);
  }

  const filtered = state.transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter !== 'all' && t.category !== catFilter) return false;

    const p = parseDateParts(t.date);
    if (yearFilter !== 'all') {
      if (!p || p.year !== Number(yearFilter)) return false;
    }
    if (monthFilter !== 'all') {
      if (!p || p.month !== Number(monthFilter)) return false;
    }

    if (rawQuery) {
      const desc = String(t.description || '').toLowerCase();
      const cat = String(t.category || '').toLowerCase();
      const meth = String(t.method || '').toLowerCase();
      const numStr = String(t.amount || '');
      const bnNumStr = bn(t.amount);
      const dateStr = String(t.date || '');

      const matches = desc.includes(query) ||
        cat.includes(query) ||
        meth.includes(query) ||
        numStr.includes(normQuery) ||
        bnNumStr.includes(rawQuery) ||
        dateStr.includes(query);

      if (!matches) return false;
    }
    return true;
  }).sort(sortTxByDateDesc);

  currentFilteredTransactions = filtered;

  // Update strip metrics
  const sums = calculateSums(filtered);
  const countEl = $('filterCount');
  const incEl = $('filterIncome');
  const expEl = $('filterExpense');
  const netEl = $('filterNet');

  if (countEl) countEl.textContent = `${bn(filtered.length)} টি`;
  if (incEl) incEl.textContent = money(sums.income);
  if (expEl) expEl.textContent = money(sums.expense);
  if (netEl) netEl.textContent = money(sums.net);

  const container = $('transactionsTableWrap');
  if (container) {
    container.innerHTML = buildTableHTML(filtered, true);
  }
}

/**
 * HTML Table Generator
 */
function buildTableHTML(list, includeActions = false) {
  if (!list.length) {
    return `
      <div class="empty-placeholder">
        <div class="empty-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <h4>কোনো লেনদেন মেলেনি</h4>
        <p>ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন বা নতুন হিসাব যোগ করুন।</p>
      </div>
    `;
  }

  const rows = list.map(t => {
    const isIncome = t.type === 'income';
    const tagClass = isIncome ? 'income' : 'expense';
    const tagText = isIncome ? '＋ আয়' : '− খরচ';
    const amountClass = isIncome ? 'income' : 'expense';
    const formattedAmount = `${isIncome ? '+' : '−'} ${money(t.amount)}`;

    let dateDisplay = t.date;
    const p = parseDateParts(t.date);
    if (p && !isNaN(p.year) && p.month >= 1 && p.month <= 12) {
      dateDisplay = `${bn(p.day)} ${MONTHS_BN[p.month - 1]}, ${bn(p.year)}`;
    }

    const actionsHTML = includeActions ? `
      <td class="actions-cell">
        <button class="btn-table-action" data-edit="${esc(t.id)}" title="হিসাব সম্পাদনা করুন">সম্পাদনা</button>
        <button class="btn-table-action delete-action" data-delete="${esc(t.id)}" title="হিসাব মুছে ফেলুন">মুছুন</button>
      </td>
    ` : '';

    return `
      <tr>
        <td>${esc(dateDisplay)}</td>
        <td><span class="type-tag ${tagClass}">${tagText}</span></td>
        <td><strong>${esc(t.category)}</strong></td>
        <td>${esc(t.description || '—')}</td>
        <td><span class="method-badge">${esc(t.method || 'নগদ')}</span></td>
        <td class="amount-val ${amountClass}">${formattedAmount}</td>
        ${actionsHTML}
      </tr>
    `;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>তারিখ</th>
          <th>ধরন</th>
          <th>খাত</th>
          <th>বিবরণ</th>
          <th>পদ্ধতি</th>
          <th>পরিমাণ</th>
          ${includeActions ? '<th>অ্যাকশন</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * ==========================================================================
 * 3. REPORTS VIEW RENDERING
 * ==========================================================================
 */
function renderReports() {
  const y = Number($('reportYear')?.value || new Date().getFullYear());
  const yearTx = state.transactions.filter(t => {
    const p = parseDateParts(t.date);
    return p && p.year === y;
  });
  const totalSums = calculateSums(yearTx);

  const savingsRate = totalSums.income > 0
    ? Math.round((totalSums.net / totalSums.income) * 100)
    : 0;

  // 1. Report Metric Cards
  const cardsContainer = $('reportSummaryCards');
  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div class="report-summary-card">
        <small>${bn(y)} সালের মোট আয়</small>
        <strong style="color: var(--green-dark);">${money(totalSums.income)}</strong>
        <span>১২ মাসের সম্পূর্ণ পারিবারিক আয়</span>
      </div>
      <div class="report-summary-card">
        <small>${bn(y)} সালের মোট ব্যয়</small>
        <strong style="color: var(--orange-dark);">${money(totalSums.expense)}</strong>
        <span>১২ মাসের সকল খরচের যোগফল</span>
      </div>
      <div class="report-summary-card">
        <small>নিট সঞ্চিত স্থিতি</small>
        <strong style="color: ${totalSums.net < 0 ? '#E11D48' : 'var(--blue)'};">${money(totalSums.net)}</strong>
        <span>${totalSums.net < 0 ? 'বার্ষিক ঘাটতি' : 'আয় থেকে ব্যয় বাদে সঞ্চয়'}</span>
      </div>
      <div class="report-summary-card">
        <small>বার্ষিক সঞ্চয়ের হার</small>
        <strong style="color: var(--purple-dark);">${bn(savingsRate)}%</strong>
        <span>${savingsRate >= 20 ? 'চমৎকার সঞ্চয় লক্ষ্যমাত্রা ✓' : 'সঞ্চয় বাড়ানোর সুযোগ রয়েছে'}</span>
      </div>
    `;
  }

  // 2. Annual 12-Month Table
  const reportTableWrap = $('reportTableWrap');
  if (reportTableWrap) {
    const monthRows = MONTHS_BN.map((m, i) => {
      const txs = yearTx.filter(t => {
        const p = parseDateParts(t.date);
        return p && p.month === i + 1;
      });
      const s = calculateSums(txs);
      const statusText = s.income === 0 && s.expense === 0
        ? '—'
        : s.net > 0 ? '<span style="color:var(--green-dark);">সঞ্চয়ী ✓</span>'
        : s.net < 0 ? '<span style="color:#E11D48;">ঘাটতি ⚠</span>'
        : '<span style="color:var(--text-muted);">সমতা</span>';

      return `
        <tr>
          <td><strong>${m}</strong></td>
          <td class="amount-val income">${money(s.income)}</td>
          <td class="amount-val expense">${money(s.expense)}</td>
          <td class="amount-val" style="color: ${s.net < 0 ? '#E11D48' : 'inherit'};">${money(s.net)}</td>
          <td>${statusText}</td>
        </tr>
      `;
    }).join('');

    reportTableWrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>মাস</th>
            <th>মোট আয়</th>
            <th>মোট ব্যয়</th>
            <th>অবশিষ্ট স্থিতি</th>
            <th>পরিস্থিতি</th>
          </tr>
        </thead>
        <tbody>
          ${monthRows}
        </tbody>
        <tfoot>
          <tr style="background:#F1F5F9; font-weight:700;">
            <td><strong>সর্বমোট হিসাব (${bn(y)})</strong></td>
            <td class="amount-val income">${money(totalSums.income)}</td>
            <td class="amount-val expense">${money(totalSums.expense)}</td>
            <td class="amount-val" style="color: ${totalSums.net < 0 ? '#E11D48' : 'inherit'};">${money(totalSums.net)}</td>
            <td><strong>${savingsRate >= 0 ? '+' : ''}${bn(savingsRate)}%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  // 3. Category Expense Table
  const catWrap = $('reportCategoryWrap');
  if (catWrap) {
    const expenses = yearTx.filter(t => t.type === 'expense');
    const catMap = expenses.reduce((acc, t) => {
      const c = t.category || 'অন্যান্য';
      acc[c] = (acc[c] || 0) + (Number(t.amount) || 0);
      return acc;
    }, {});

    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const totalCatExp = Object.values(catMap).reduce((a, b) => a + b, 0);

    if (!sortedCats.length) {
      catWrap.innerHTML = '<div class="empty-placeholder"><p>এই বছরে কোনো খরচের হিসাব রেকর্ড নেই।</p></div>';
    } else {
      const rows = sortedCats.map(([cat, amt]) => {
        const pct = totalCatExp > 0 ? Math.round((amt / totalCatExp) * 100) : 0;
        return `
          <tr>
            <td><strong>${esc(cat)}</strong></td>
            <td class="amount-val expense">${money(amt)}</td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <div class="cat-bar-track" style="flex:1;">
                  <div class="cat-bar-fill" style="width:${pct}%;"></div>
                </div>
                <span style="font-size:12px; font-weight:600; width:45px;">${bn(pct)}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      catWrap.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>খরচের খাত</th>
              <th>মোট পরিমাণ</th>
              <th>শতাংশ অনুপাত</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }
  }
}

/**
 * ==========================================================================
 * 4. BACKUP & GOOGLE DRIVE VIEW
 * ==========================================================================
 */
function updateStorageStatsUI() {
  const count = state.transactions.length;
  const countText = `${bn(count)} টি`;

  const localCount = $('localTxCount');
  if (localCount) localCount.textContent = countText;

  const settingsCount = $('settingsTxCount');
  if (settingsCount) settingsCount.textContent = countText;

  const lastSavedEl = $('localLastSaved');
  if (lastSavedEl) {
    if (state.lastSaved) {
      const d = new Date(state.lastSaved);
      lastSavedEl.textContent = `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}, ${d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      lastSavedEl.textContent = 'এখনো নেই';
    }
  }
}

async function checkGoogleDriveStatus() {
  const box = $('driveStatusBox');
  const heading = $('driveStatusHeading');
  const detail = $('driveStatusDetail');
  const dot = $('statusDot');
  const connectBtn = $('connectDriveBtn');

  if (!heading || !detail || !dot || !connectBtn) return;

  try {
    const res = await fetch('/api/drive/status');
    if (!res.ok) throw new Error('সার্ভার সাড়া দেয়নি');
    const data = await res.json();

    const navCloud = $('navCloudIndicator');

    if (data.connected) {
      dot.className = 'status-indicator-dot connected';
      heading.textContent = 'Google Drive সংযুক্ত রয়েছে ✓';
      detail.textContent = `অনুমোদিত অ্যাকাউন্ট: ${data.account || 'rafiqulislam.globalwork@gmail.com'}। আপনার ব্যাকআপ ড্রাইভের ফোল্ডারে পাঠানো যাবে।`;
      connectBtn.textContent = 'Google Drive সংযুক্ত (পুনরায় কানেক্ট)';
      connectBtn.disabled = false;
      connectBtn.onclick = () => { location.href = '/auth/google'; };
      if (navCloud) {
        navCloud.className = 'nav-cloud-dot connected';
        navCloud.title = 'Google Drive সংযুক্ত আছে ✓';
      }
    } else if (data.configured) {
      dot.className = 'status-indicator-dot configured';
      heading.textContent = 'OAuth কনফিগার করা হয়েছে, অনুমতি প্রয়োজন';
      detail.textContent = 'গুগল ক্লাউড শংসাপত্র লোড হয়েছে। ব্যাকআপ চালু করতে নিচের বাটনে চাপ দিয়ে ড্রাইভ এক্সেস দিন।';
      connectBtn.textContent = 'Google Drive সংযোগ করুন';
      connectBtn.disabled = false;
      connectBtn.onclick = () => { location.href = '/auth/google'; };
      if (navCloud) {
        navCloud.className = 'nav-cloud-dot configured';
        navCloud.title = 'Google Drive কনফিগার করা হয়েছে, অনুমতি দিন';
      }
    } else {
      dot.className = 'status-indicator-dot';
      heading.textContent = 'Google OAuth সেটআপ এখনো সম্পন্ন হয়নি';
      detail.textContent = 'প্রজেক্টের .env.example থেকে .env তৈরি করে Client ID ও Secret বসাতে হবে। নিচে পূর্ণ নির্দেশিকা দেখুন।';
      connectBtn.textContent = 'Google Drive সেটআপ আবশ্যক';
      connectBtn.disabled = true;
      if (navCloud) {
        navCloud.className = 'nav-cloud-dot';
        navCloud.title = 'Google Drive সংযুক্ত নেই';
      }
    }
  } catch (err) {
    dot.className = 'status-indicator-dot';
    heading.textContent = 'লোকাল ব্রাউজার অফলাইন মোড';
    detail.textContent = 'Node.js সার্ভার চালু থাকলে গুগল ড্রাইভ স্ট্যাটাস স্বয়ংক্রিয়ভাবে যাচাই করা হবে।';
    connectBtn.textContent = 'সার্ভার সংযোগ নেই';
    connectBtn.disabled = true;
    const navCloud = $('navCloudIndicator');
    if (navCloud) {
      navCloud.className = 'nav-cloud-dot';
      navCloud.title = 'সার্ভার সংযোগ নেই / লোকাল মোড';
    }
  }
}

async function runGoogleDriveBackup() {
  if (!state.transactions.length) {
    if (!confirm('আপনার বর্তমান হিসাবের তালিকা খালি। তবুও কি খালি ব্যাকআপ Google Drive-এ পাঠাবেন?')) return;
  }

  const btn = $('backupNowBtn');
  const alertEl = $('driveResultMsg');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'ব্যাকআপ ড্রাইভ-এ পাঠানো হচ্ছে…';
  }

  const payload = {
    app: 'Family Expense Tracker Bangla',
    version: 2,
    exportedAt: new Date().toISOString(),
    account: 'rafiqulislam.globalwork@gmail.com',
    settings: state.settings,
    transactions: state.transactions
  };

  try {
    const res = await fetch('/api/drive/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'ব্যাকআপ সম্পন্ন করা সম্ভব হয়নি');

    if (alertEl) {
      alertEl.className = 'drive-result-alert ok';
      alertEl.textContent = `✓ ড্রাইভ ব্যাকআপ সফল: "${result.name}" (ফোল্ডার: ${result.folder})`;
      alertEl.classList.remove('hidden');
    }
    showToast('Google Drive-এ সফলভাবে ব্যাকআপ সংরক্ষিত হয়েছে!', 'success');
    listGoogleDriveBackups();
  } catch (e) {
    if (alertEl) {
      alertEl.className = 'drive-result-alert error';
      alertEl.textContent = `ত্রুটি: ${e.message}`;
      alertEl.classList.remove('hidden');
    }
    showToast(e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'এখনই ক্লাউডে ব্যাকআপ নিন';
    }
  }
}

async function listGoogleDriveBackups() {
  const container = $('driveFilesList');
  if (!container) return;
  container.innerHTML = '<div style="padding:10px; font-size:12px; color:#64748B;">ড্রাইভ থেকে তালিকা লোড হচ্ছে…</div>';

  try {
    const res = await fetch('/api/drive/backups');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ড্রাইভের ফাইল দেখা যায়নি');

    if (!data.files || !data.files.length) {
      container.innerHTML = '<div style="padding:10px; font-size:12px; color:#64748B;">Drive-এ এখনো কোনো ব্যাকআপ ফাইল পাওয়া যায়নি।</div>';
      return;
    }

    container.innerHTML = data.files.map(f => {
      const createdDate = new Date(f.createdTime).toLocaleString('bn-BD');
      return `
        <div class="drive-file-card">
          <div>
            <strong>${esc(f.name)}</strong>
            <small style="display:block; color:#64748B;">তৈরি: ${createdDate}</small>
          </div>
          <div style="display:flex; gap:6px;">
            ${f.webViewLink ? `<a href="${esc(f.webViewLink)}" target="_blank" rel="noopener" class="btn-table-action">Drive-এ খুলুন</a>` : ''}
            <button class="btn-table-action" onclick="restoreFromDrive('${f.id}')">রিস্টোর</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="padding:10px; font-size:12px; color:#E11D48;">${err.message}</div>`;
  }
}

// Global helper for drive restore
window.restoreFromDrive = async function(fileId) {
  if (!confirm('এই ড্রাইভ ব্যাকআপ থেকে ডেটা রিস্টোর করতে চান? বর্তমান হিসাবগুলো আপডেট হবে।')) return;
  try {
    const res = await fetch(`/api/drive/backup/${fileId}`);
    if (!res.ok) throw new Error('ফাইল ডাউনলোড করা সম্ভব হয়নি');
    const data = await res.json();
    if (!Array.isArray(data.transactions)) throw new Error('ফাইলে কোনো লেনদেন তালিকা নেই');

    applyImportedTransactions(data.transactions);
    showToast(`Google Drive থেকে ${bn(data.transactions.length)}টি হিসাব রিস্টোর সম্পন্ন!`, 'success');
  } catch (e) {
    showToast('রিস্টোর ব্যর্থ: ' + e.message, 'error');
  }
};

/**
 * ==========================================================================
 * 5. DATA EXPORT & IMPORT (JSON & CSV)
 * ==========================================================================
 */
function downloadFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSONBackup() {
  const payload = {
    app: 'Family Expense Tracker Bangla',
    version: 2,
    exportedAt: new Date().toISOString(),
    account: 'rafiqulislam.globalwork@gmail.com',
    settings: state.settings,
    transactions: state.transactions
  };
  downloadFile(`family-expense-backup-${todayDateStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showToast('JSON ব্যাকআপ ফাইল ডাউনলোড সম্পন্ন হয়েছে।', 'success');
}

function exportCSVData() {
  const targetList = (currentFilteredTransactions && currentFilteredTransactions.length > 0)
    ? currentFilteredTransactions
    : state.transactions;

  if (!targetList.length) {
    showToast('ডাউনলোড করার জন্য কোনো হিসাব নেই।', 'info');
    return;
  }

  const headers = ['তারিখ (Date)', 'ধরন (Type)', 'খাত (Category)', 'বিবরণ (Description)', 'পদ্ধতি (Method)', 'পরিমাণ (Amount)'];
  const rows = [...targetList].sort(sortTxByDateDesc).map(t => [
    t.date,
    t.type === 'income' ? 'আয়' : 'খরচ',
    t.category || '',
    (t.description || '').replace(/"/g, '""'),
    t.method || 'নগদ',
    t.amount
  ]);

  const csvContent = '\uFEFF' + [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
  ].join('\r\n');

  downloadFile(`family-expense-report-${todayDateStr()}.csv`, csvContent, 'text/csv;charset=utf-8');
  showToast(`${bn(targetList.length)}টি হিসাবের CSV ফাইল ডাউনলোড হয়েছে।`, 'success');
}

function handleJSONImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.transactions)) {
        throw new Error('ফাইলটিতে সঠিক লেনদেনের তথ্য পাওয়া যায়নি');
      }

      if (confirm(`ফাইলে ${bn(data.transactions.length)}টি হিসাব পাওয়া গেছে। আপনি কি এটি বর্তমান হিসাবের সাথে যোগ করতে চান? (Cancel চাপলে বাতিল হবে)`)) {
        applyImportedTransactions(data.transactions);
        if (data.settings) {
          state.settings = Object.assign(state.settings, data.settings);
        }
        showToast('JSON ব্যাকআপ ফাইল সফলভাবে রিস্টোর হয়েছে!', 'success');
      }
    } catch (err) {
      showToast('ইমপোর্ট ব্যর্থ: ' + err.message, 'error');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

/**
 * Standard RFC-compliant CSV line parser
 */
function parseCSVLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) throw new Error('CSV ফাইলটিতে কোনো তথ্য নেই');

      const parsedTransactions = [];
      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const clean = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, '').trim());
        if (clean && clean.length >= 2) {
          const date = clean[0] || todayDateStr();
          const typeStr = clean[1] || '';
          const type = (typeStr.includes('আয়') || typeStr.toLowerCase() === 'income') ? 'income' : 'expense';
          const category = clean[2] || (type === 'income' ? 'অন্যান্য আয়' : 'গৃহস্থালি ও অন্যান্য');
          const description = clean[3] || '';
          const method = clean[4] || 'নগদ';
          const amount = Math.abs(parseNum(clean[5]) || 0);

          if (amount > 0) {
            parsedTransactions.push({
              id: generateId(),
              type,
              date,
              amount,
              category,
              description,
              method,
              createdAt: Date.now() + i
            });
          }
        }
      }

      if (!parsedTransactions.length) throw new Error('সঠিক ফরম্যাটের কোনো হিসাব পাওয়া যায়নি');

      if (confirm(`CSV ফাইলে ${bn(parsedTransactions.length)}টি হিসাব পাওয়া গেছে। যোগ করতে চান?`)) {
        applyImportedTransactions(parsedTransactions);
        showToast('CSV ফাইল থেকে হিসাব সফলভাবে যুক্ত হয়েছে!', 'success');
      }
    } catch (err) {
      showToast('CSV ইমপোর্ট ব্যর্থ: ' + err.message, 'error');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function applyImportedTransactions(newTxList) {
  const map = new Map(state.transactions.map(t => [t.id, t]));
  newTxList.forEach(t => {
    if (!t.id) t.id = generateId();
    map.set(t.id, t);
  });
  state.transactions = Array.from(map.values());
  persistState();
  renderAllViews();
}

/**
 * ==========================================================================
 * 6. MODAL & TRANSACTION FORM HANDLING
 * ==========================================================================
 */
function openTransactionModal(editTransaction = null, defaultType = 'expense') {
  const form = $('transactionForm');
  if (!form) return;
  form.reset();

  const title = $('modalTitle');
  const eyebrow = $('modalEyebrow');
  const editId = $('editTxId');

  const typeToSet = editTransaction ? editTransaction.type : defaultType;
  const radio = form.querySelector(`input[name="txType"][value="${typeToSet}"]`);
  if (radio) radio.checked = true;

  updateCategoryDropdownOptions(typeToSet, editTransaction?.category);

  if (editTransaction) {
    if (title) title.textContent = 'হিসাব সম্পাদনা করুন';
    if (eyebrow) eyebrow.textContent = 'EDIT TRANSACTION';
    if (editId) editId.value = editTransaction.id;
    $('txDate').value = editTransaction.date || todayDateStr();
    $('txAmount').value = editTransaction.amount || '';
    $('txCategory').value = editTransaction.category || '';
    $('txDescription').value = editTransaction.description || '';
    $('txMethod').value = editTransaction.method || 'নগদ';
  } else {
    if (title) title.textContent = 'নতুন হিসাব যোগ করুন';
    if (eyebrow) eyebrow.textContent = 'NEW TRANSACTION';
    if (editId) editId.value = '';
    $('txDate').value = todayDateStr();
    $('txAmount').value = '';
    $('txDescription').value = '';
    $('txMethod').value = state.settings?.defaultMethod || 'নগদ';
  }

  const modal = $('transactionModal');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => $('txAmount')?.focus(), 50);
  }
}

function closeTransactionModal() {
  const modal = $('transactionModal');
  if (modal) modal.classList.add('hidden');
}

function updateCategoryDropdownOptions(type, selectedCategory = '') {
  const select = $('txCategory');
  if (!select) return;
  const list = CATEGORIES[type] || CATEGORIES.expense;
  select.innerHTML = list.map(c => `
    <option value="${esc(c)}" ${c === selectedCategory ? 'selected' : ''}>${esc(c)}</option>
  `).join('');
}

function handleTransactionFormSubmit(e) {
  e.preventDefault();

  const id = $('editTxId')?.value || generateId();
  const typeRadio = document.querySelector('input[name="txType"]:checked');
  const type = typeRadio ? typeRadio.value : 'expense';

  const dateVal = $('txDate')?.value;
  const amountVal = parseNum($('txAmount')?.value);
  const categoryVal = $('txCategory')?.value;
  const descVal = ($('txDescription')?.value || '').trim();
  const methodVal = $('txMethod')?.value || 'নগদ';

  // Strict Validation
  if (!dateVal) {
    showToast('দয়া করে সঠিক তারিখ নির্ধারণ করুন।', 'error');
    return;
  }
  if (isNaN(amountVal) || amountVal <= 0) {
    showToast('দয়া করে সঠিক ইতিবাচক টাকার পরিমাণ লিখুন।', 'error');
    return;
  }
  if (!categoryVal) {
    showToast('দয়া করে একটি খাত নির্বাচন করুন।', 'error');
    return;
  }

  const isEditing = Boolean($('editTxId')?.value);
  const existingIdx = state.transactions.findIndex(t => t.id === id);

  const txObject = {
    id,
    type,
    date: dateVal,
    amount: amountVal,
    category: categoryVal,
    description: descVal,
    method: methodVal,
    createdAt: isEditing && existingIdx >= 0 ? state.transactions[existingIdx].createdAt : Date.now()
  };

  if (isEditing && existingIdx >= 0) {
    state.transactions[existingIdx] = txObject;
    showToast('হিসাব সফলভাবে আপডেট করা হয়েছে।', 'success');
  } else {
    state.transactions.unshift(txObject);
    showToast('নতুন হিসাব সফলভাবে সংরক্ষণ হয়েছে!', 'success');
  }

  persistState();
  renderAllViews();
  closeTransactionModal();
}

/**
 * ==========================================================================
 * 7. DELETE CONFIRMATION DIALOG
 * ==========================================================================
 */
function promptDeleteTransaction(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;

  pendingDeleteId = txId;
  const descEl = $('deleteModalDesc');
  if (descEl) {
    descEl.textContent = `“${tx.category}” খাতের ${money(tx.amount)} টাকার (${tx.type === 'income' ? 'আয়' : 'খরচ'}) হিসাবটি মুছে ফেলতে চান?`;
  }
  const modal = $('deleteConfirmModal');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  const modal = $('deleteConfirmModal');
  if (modal) modal.classList.add('hidden');
}

function confirmDeleteTransaction() {
  if (!pendingDeleteId) return;

  state.transactions = state.transactions.filter(t => t.id !== pendingDeleteId);
  persistState();
  renderAllViews();
  closeDeleteModal();
  showToast('হিসাবটি মুছে ফেলা হয়েছে।', 'info');
}

/**
 * ==========================================================================
 * 8. NAVIGATION & VIEW SWITCHING
 * ==========================================================================
 */
function switchView(viewName) {
  activeView = viewName;

  // Update Nav Buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update View Panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active-view', panel.id === `${viewName}View`);
  });

  // Update Subheader Titles
  const titles = {
    dashboard: { title: 'ড্যাশবোর্ড', eyebrow: 'FAMILY FINANCE DASHBOARD' },
    transactions: { title: 'আয়-ব্যয়ের তালিকা', eyebrow: 'TRANSACTION MANAGEMENT' },
    reports: { title: 'রিপোর্ট ও বিশ্লেষণ', eyebrow: 'FINANCIAL REPORTS & INSIGHTS' },
    backup: { title: 'ডেটা সুরক্ষা ও ক্লাউড ব্যাকআপ', eyebrow: 'SECURE BACKUP & CLOUD STORAGE' },
    settings: { title: 'অ্যাপ সেটিংস', eyebrow: 'APPLICATION PREFERENCES' }
  };

  const meta = titles[viewName] || { title: 'পরিবারের হিসাব', eyebrow: 'FINANCE' };
  const pageTitle = $('pageTitle');
  const pageEyebrow = $('pageEyebrow');
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageEyebrow) pageEyebrow.textContent = meta.eyebrow;

  // View specific updates
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'transactions') renderTransactions();
  if (viewName === 'reports') renderReports();
  if (viewName === 'backup') {
    updateStorageStatsUI();
    checkGoogleDriveStatus();
  }
  if (viewName === 'settings') {
    loadSettingsIntoForm();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * ==========================================================================
 * 9. SETTINGS & DEMO DATA
 * ==========================================================================
 */
function loadSettingsIntoForm() {
  const s = state.settings || {};
  if ($('settingFamilyName')) $('settingFamilyName').value = s.familyName || 'পরিবারের হিসাব';
  if ($('settingBudgetLimit')) $('settingBudgetLimit').value = s.budgetLimit || '';
  if ($('settingDefaultMethod')) $('settingDefaultMethod').value = s.defaultMethod || 'নগদ';
  updateStorageStatsUI();
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  state.settings = {
    familyName: ($('settingFamilyName')?.value || 'পরিবারের হিসাব').trim(),
    budgetLimit: Math.max(0, parseNum($('settingBudgetLimit')?.value) || 0),
    defaultMethod: $('settingDefaultMethod')?.value || 'নগদ'
  };
  persistState();
  renderTopbarAndHeader();
  showToast('সেটিংস সফলভাবে সংরক্ষিত হয়েছে!', 'success');
}

function loadSampleDemoData() {
  if (state.transactions.length > 0) {
    if (!confirm('আপনার বর্তমান হিসাবের সঙ্গে ১০টি নমুনা পারিবারিক হিসাব যোগ করা হবে। অগ্রসর হবেন?')) return;
  }

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');

  const demoList = [
    { id: generateId(), type: 'income', date: `${y}-${m}-01`, amount: 55000, category: 'বেতন', description: 'মাসিক মূল বেতন', method: 'ব্যাংক', createdAt: Date.now() - 90000 },
    { id: generateId(), type: 'income', date: `${y}-${m}-05`, amount: 12000, category: 'ফ্রিল্যান্সিং', description: 'ওয়েবসাইট প্রজেক্ট পারিশ্রমিক', method: 'বিকাশ', createdAt: Date.now() - 80000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-02`, amount: 18000, category: 'বাসা ভাড়া', description: 'চলতি মাসের বাসা ভাড়া', method: 'ব্যাংক', createdAt: Date.now() - 70000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-03`, amount: 6500, category: 'বাজার ও সদাই', description: 'সাপ্তাহিক কাঁচাবাজার ও মাছ', method: 'নগদ', createdAt: Date.now() - 60000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-06`, amount: 2400, category: 'বিদ্যুৎ/গ্যাস/পানি', description: 'বিদ্যুৎ বিল ও প্রিপেইড মিটার', method: 'বিকাশ', createdAt: Date.now() - 50000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-08`, amount: 1500, category: 'চিকিৎসা ও ওষুধ', description: 'পারিবারিক প্রয়োজনীয় ওষুধ', method: 'নগদ', createdAt: Date.now() - 40000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-10`, amount: 1000, category: 'মোবাইল ও ইন্টারনেট', description: 'ব্রডব্যান্ড ওয়াইফাই বিল', method: 'নগদ (Nagad)', createdAt: Date.now() - 30000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-11`, amount: 3200, category: 'শিক্ষা ও বইপত্র', description: 'বাচ্চাদের স্কুলের বেতন ও খাতা', method: 'বিকাশ', createdAt: Date.now() - 20000 },
    { id: generateId(), type: 'expense', date: `${y}-${m}-12`, amount: 1800, category: 'যাতায়াত ও জ্বালানি', description: 'সিএনজি ও যাতায়াত খরচ', method: 'নগদ', createdAt: Date.now() - 10000 },
    { id: generateId(), type: 'income', date: `${y}-${m}-14`, amount: 5000, category: 'বাড়ি/দোকান ভাড়া', description: 'দোকান ভাড়া বাবদ আয়', method: 'নগদ', createdAt: Date.now() }
  ];

  state.transactions = [...demoList, ...state.transactions];
  persistState();
  renderAllViews();
  showToast('১০টি নমুনা হিসাব ড্যাশবোর্ডে যোগ করা হয়েছে!', 'success');
  switchView('dashboard');
}

/**
 * ==========================================================================
 * 10. REFRESH ALL VIEWS
 * ==========================================================================
 */
function renderAllViews() {
  populateYearSelects();
  populateMonthSelects();
  populateCategoryFilter();
  renderTopbarAndHeader();
  renderDashboard();
  renderTransactions();
  renderReports();
  updateStorageStatsUI();
}

/**
 * ==========================================================================
 * 11. EVENT LISTENERS BINDING
 * ==========================================================================
 */
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Direct modal trigger in navbar & mobile bar
  $('navNewTransaction')?.addEventListener('click', () => openTransactionModal(null, 'expense'));
  $('headerQuickAdd')?.addEventListener('click', () => openTransactionModal(null, 'expense'));
  $('mobileFabAdd')?.addEventListener('click', () => openTransactionModal(null, 'expense'));
  $('addTransactionBtn')?.addEventListener('click', () => openTransactionModal(null, 'expense'));
  $('brandHome')?.addEventListener('click', () => switchView('dashboard'));
  $('navBalanceChip')?.addEventListener('click', () => switchView('reports'));
  $('viewAllRecentBtn')?.addEventListener('click', () => switchView('transactions'));

  // 8 Dashboard 3D Cards Click Interactions
  // Card 1: মোট আয় -> Filters transactions to income
  $('cardIncome')?.addEventListener('click', () => {
    switchView('transactions');
    if ($('typeFilter')) {
      $('typeFilter').value = 'income';
      renderTransactions();
    }
  });

  // Card 2: মোট খরচ -> Filters transactions to expense
  $('cardExpense')?.addEventListener('click', () => {
    switchView('transactions');
    if ($('typeFilter')) {
      $('typeFilter').value = 'expense';
      renderTransactions();
    }
  });

  // Card 3: বর্তমান ব্যালেন্স -> Reports & detailed balance
  $('cardBalance')?.addEventListener('click', () => {
    switchView('reports');
  });

  // Card 4: মোট লেনদেন -> All transactions view
  $('cardCount')?.addEventListener('click', () => {
    switchView('transactions');
    if ($('typeFilter')) {
      $('typeFilter').value = 'all';
      renderTransactions();
    }
  });

  // Card 5: নতুন আয় -> Open modal pre-selected to income
  $('cardAddIncome')?.addEventListener('click', () => {
    openTransactionModal(null, 'income');
  });

  // Card 6: নতুন খরচ -> Open modal pre-selected to expense
  $('cardAddExpense')?.addEventListener('click', () => {
    openTransactionModal(null, 'expense');
  });

  // Card 7: রিপোর্ট ও হিসাব -> Reports section
  $('cardOpenReports')?.addEventListener('click', () => {
    switchView('reports');
  });

  // Card 8: ব্যাকআপ ও ডেটা -> Backup section
  $('cardOpenBackup')?.addEventListener('click', () => {
    switchView('backup');
  });

  // Keyboard accessibility for cards
  document.querySelectorAll('.card-3d').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Dashboard Filters
  $('dashYear')?.addEventListener('change', renderDashboard);
  $('dashMonth')?.addEventListener('change', renderDashboard);
  $('resetFilter')?.addEventListener('click', () => {
    const d = new Date();
    if ($('dashYear')) $('dashYear').value = d.getFullYear();
    if ($('dashMonth')) $('dashMonth').value = String(d.getMonth() + 1);
    renderDashboard();
    showToast('চলতি মাসের ফিল্টার সেট করা হয়েছে।', 'info');
  });

  // Transactions View Filters
  $('searchInput')?.addEventListener('input', renderTransactions);
  $('clearSearchBtn')?.addEventListener('click', () => {
    if ($('searchInput')) {
      $('searchInput').value = '';
      renderTransactions();
    }
  });
  $('typeFilter')?.addEventListener('change', renderTransactions);
  $('categoryFilter')?.addEventListener('change', renderTransactions);
  $('yearFilter')?.addEventListener('change', renderTransactions);
  $('monthFilter')?.addEventListener('change', renderTransactions);

  // Table action buttons (Delegation)
  document.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const tx = state.transactions.find(t => t.id === editBtn.dataset.edit);
      if (tx) openTransactionModal(tx);
      return;
    }

    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      promptDeleteTransaction(delBtn.dataset.delete);
      return;
    }
  });

  // Reports View Handlers
  $('reportYear')?.addEventListener('change', renderReports);
  $('printReportBtn')?.addEventListener('click', () => window.print());

  // Export / Import
  $('exportCsv')?.addEventListener('click', exportCSVData);
  $('exportJsonBtn')?.addEventListener('click', exportJSONBackup);
  $('localDownloadJsonBtn')?.addEventListener('click', exportJSONBackup);
  $('importJsonFile')?.addEventListener('change', handleJSONImport);
  $('importCsvFile')?.addEventListener('change', handleCSVImport);

  // Clear data safely
  $('clearAllDataBtn')?.addEventListener('click', () => {
    if (confirm('সতর্কতা: আপনার সকল সংরক্ষিত লেনদেন মুছে ফেলা হবে। পূর্বে কি JSON ব্যাকআপ নিয়েছেন?') &&
        confirm('নিশ্চিতভাবে সব হিসাব চিরতরে মুছে ফেলবেন?')) {
      state.transactions = [];
      persistState();
      renderAllViews();
      showToast('সকল ডেটা মুছে ফেলা হয়েছে।', 'info');
    }
  });

  // Drive integration
  $('backupNowBtn')?.addEventListener('click', runGoogleDriveBackup);
  $('listBackupsBtn')?.addEventListener('click', listGoogleDriveBackups);

  // Settings
  $('settingsForm')?.addEventListener('submit', handleSettingsSubmit);
  $('loadSampleDataBtn')?.addEventListener('click', loadSampleDemoData);

  // Modal events
  $('closeModalBtn')?.addEventListener('click', closeTransactionModal);
  $('cancelModalBtn')?.addEventListener('click', closeTransactionModal);
  $('transactionModal')?.addEventListener('click', e => {
    if (e.target === $('transactionModal')) closeTransactionModal();
  });
  $('transactionForm')?.addEventListener('submit', handleTransactionFormSubmit);

  // Type change inside modal switches categories
  document.querySelectorAll('input[name="txType"]').forEach(r => {
    r.addEventListener('change', () => {
      updateCategoryDropdownOptions(r.value);
    });
  });

  // Delete modal buttons
  $('cancelDeleteBtn')?.addEventListener('click', closeDeleteModal);
  $('confirmDeleteBtn')?.addEventListener('click', confirmDeleteTransaction);
  $('deleteConfirmModal')?.addEventListener('click', e => {
    if (e.target === $('deleteConfirmModal')) closeDeleteModal();
  });

  // Global keyboard shortcuts (Escape to close, '+' or 'N' to create new entry)
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeDeleteModal();
    }
    if ((e.key === '+' || e.key === 'n' || e.key === 'N') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      openTransactionModal(null, 'expense');
    }
  });
}

/**
 * ==========================================================================
 * INITIALIZATION
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  // Initial selects setup
  populateYearSelects();
  populateMonthSelects();
  populateCategoryFilter();

  // Set default filters to current month & year
  const now = new Date();
  if ($('dashYear')) $('dashYear').value = String(now.getFullYear());
  if ($('dashMonth')) $('dashMonth').value = String(now.getMonth() + 1);

  renderAllViews();
  switchView('dashboard');
  checkGoogleDriveStatus();

  // Check URL query parameters for OAuth redirect feedback
  const params = new URLSearchParams(window.location.search);
  if (params.get('drive') === 'connected') {
    showToast('গুগল ড্রাইভ সফলভাবে সংযুক্ত হয়েছে!', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});
