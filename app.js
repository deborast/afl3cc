import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { 
    ref, 
    push, 
    set, 
    onValue, 
    update, 
    remove 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let currentUid = null;
let allTransactions = {};
let expenseChartInstance = null;

const CATEGORIES = {
    expense: [
        { value: 'Konsumsi', label: '🍔 Konsumsi & Makan' },
        { value: 'Transportasi', label: '🛵 Transportasi' },
        { value: 'Kebutuhan Kuliah', label: '📚 Kuliah & Tugas' },
        { value: 'Hiburan', label: '🎮 Hiburan & Jajan' },
        { value: 'Tagihan & Kos', label: '🏠 Tagihan & Kos' },
        { value: 'Lainnya', label: '📦 Lainnya' }
    ],
    income: [
        { value: 'Saldo Awal', label: '🏦 Saldo Awal' },
        { value: 'Uang Saku', label: '💵 Uang Saku / Kiriman' },
        { value: 'Gaji & Freelance', label: '💼 Gaji / Freelance' },
        { value: 'Bonus & Hadiah', label: '🎁 Bonus / Hadiah' },
        { value: 'Lainnya', label: '✨ Pemasukan Lainnya' }
    ]
};

const CATEGORY_COLORS = {
    'Konsumsi': '#10b981',
    'Transportasi': '#3b82f6',
    'Kebutuhan Kuliah': '#8b5cf6',
    'Hiburan': '#f59e0b',
    'Tagihan & Kos': '#ec4899',
    'Lainnya': '#64748b'
};

const today = new Date();
const defaultYear = today.getFullYear().toString();
const defaultMonth = today.toISOString().slice(0, 7);
const defaultDate = today.toISOString().slice(0, 10);
const firstDayOfMonth = `${defaultMonth}-01`;

document.getElementById('filter-month').value = defaultMonth;
document.getElementById('filter-year').value = defaultYear;
document.getElementById('filter-start').value = firstDayOfMonth;
document.getElementById('filter-end').value = defaultDate;
document.getElementById('trx-date').value = defaultDate;

window.handleFilterModeChange = () => {
    const mode = document.getElementById('filter-mode').value;
    const monthlyBox = document.getElementById('filter-monthly-box');
    const yearlyBox = document.getElementById('filter-yearly-box');
    const customBox = document.getElementById('filter-custom-box');

    monthlyBox.classList.add('hidden');
    yearlyBox.classList.add('hidden');
    customBox.classList.add('hidden');

    if (mode === 'monthly') {
        monthlyBox.classList.remove('hidden');
    } else if (mode === 'yearly') {
        yearlyBox.classList.remove('hidden');
    } else if (mode === 'custom') {
        customBox.classList.remove('hidden');
    }

    renderDashboard();
};

window.updateCategoryOptions = () => {
    const type = document.getElementById('trx-type').value;
    const catSelect = document.getElementById('trx-category');
    catSelect.innerHTML = '';
    CATEGORIES[type].forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.value;
        opt.textContent = c.label;
        catSelect.appendChild(opt);
    });
};
updateCategoryOptions();

window.switchTab = (tab) => {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    hideAlert();

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabReg.classList.add('active');
    }
};

const alertBox = document.getElementById('auth-alert');
function showAlert(msg) {
    alertBox.textContent = msg;
    alertBox.className = 'alert-banner alert-error';
    alertBox.classList.remove('hidden');
}
function hideAlert() {
    alertBox.classList.add('hidden');
}

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        document.getElementById('register-form').reset();
        hideAlert();
    } catch (err) {
        showAlert('Gagal mendaftar: ' + err.message);
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById('login-form').reset();
        hideAlert();
    } catch (err) {
        showAlert('Login gagal: Email atau kata sandi salah.');
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    const authSec = document.getElementById('auth-section');
    const appSec = document.getElementById('app-section');

    if (user) {
        currentUid = user.uid;
        authSec.classList.add('hidden');
        appSec.classList.remove('hidden');
        document.getElementById('active-user-email').textContent = user.email;
        listenToTransactions(user.uid);
    } else {
        currentUid = null;
        authSec.classList.remove('hidden');
        appSec.classList.add('hidden');
    }
});

document.getElementById('filter-month').addEventListener('change', renderDashboard);
document.getElementById('filter-year').addEventListener('input', renderDashboard);
document.getElementById('filter-start').addEventListener('change', renderDashboard);
document.getElementById('filter-end').addEventListener('change', renderDashboard);

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUid) return;

    const type = document.getElementById('trx-type').value;
    const title = document.getElementById('trx-title').value;
    const amount = Number(document.getElementById('trx-amount').value);
    const date = document.getElementById('trx-date').value;
    const category = document.getElementById('trx-category').value;
    const trxMonth = date.slice(0, 7);

    const trxRef = push(ref(db, `afl3cc/${currentUid}/transactions`));
    await set(trxRef, {
        type,
        title,
        amount,
        date,
        month: trxMonth,
        category,
        status: type === 'income' ? 'Diterima' : 'Lunas'
    });

    document.getElementById('trx-title').value = '';
    document.getElementById('trx-amount').value = '';
});

function listenToTransactions(uid) {
    const trxRef = ref(db, `afl3cc/${uid}/transactions`);
    onValue(trxRef, (snapshot) => {
        allTransactions = snapshot.val() || {};
        renderDashboard();
    });
}

function renderDashboard() {
    const mode = document.getElementById('filter-mode').value;
    const selectedMonth = document.getElementById('filter-month').value;
    const selectedYear = document.getElementById('filter-year').value;
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;

    const listContainer = document.getElementById('transaction-list');
    listContainer.innerHTML = '';

    let totalIncome = 0;
    let totalExpense = 0;
    let count = 0;
    const expenseByCategory = {};

    let periodLabel = '';
    if (mode === 'monthly') {
        periodLabel = `bulan ${selectedMonth}`;
    } else if (mode === 'yearly') {
        periodLabel = `tahun ${selectedYear}`;
    } else {
        periodLabel = `periode ${startDate || '...'} s/d ${endDate || '...'}`;
    }

    const entries = Object.entries(allTransactions).filter(([_, item]) => {
        const itemDate = item.date || `${defaultMonth}-01`;
        const itemMonth = item.month || itemDate.slice(0, 7);
        const itemYear = itemDate.slice(0, 4);

        if (mode === 'monthly') {
            return itemMonth === selectedMonth;
        } else if (mode === 'yearly') {
            return itemYear === String(selectedYear);
        } else if (mode === 'custom') {
            if (startDate && endDate) {
                return itemDate >= startDate && itemDate <= endDate;
            } else if (startDate) {
                return itemDate >= startDate;
            } else if (endDate) {
                return itemDate <= endDate;
            }
            return true;
        }
        return true;
    });

    entries.sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

    if (entries.length === 0) {
        listContainer.innerHTML = `<p class="empty-msg">Belum ada transaksi pada ${periodLabel}.</p>`;
    } else {
        entries.forEach(([key, data]) => {
            const isIncome = data.type === 'income';
            const nominal = Number(data.amount);
            count++;

            if (isIncome) {
                totalIncome += nominal;
            } else {
                totalExpense += nominal;
                const cat = data.category || 'Lainnya';
                expenseByCategory[cat] = (expenseByCategory[cat] || 0) + nominal;
            }

            const itemEl = document.createElement('div');
            itemEl.className = `expense-item ${isIncome ? 'type-income' : ''} ${data.status === 'Ditunda' ? 'pending' : ''}`;
            itemEl.innerHTML = `
                <div class="item-left">
                    <h4>${data.title}</h4>
                    <span class="item-meta">
                        ${isIncome ? '🔺 Pemasukan' : '🔻 Pengeluaran'} • ${data.category} • 📅 ${data.date} • <b>[${data.status}]</b>
                    </span>
                </div>
                <div class="item-right">
                    <span class="item-price ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '+' : '-'} Rp ${nominal.toLocaleString('id-ID')}
                    </span>
                    <button class="action-btn" onclick="toggleStatus('${currentUid}', '${key}', '${data.status}', '${data.type}')">Status</button>
                    <button class="action-btn delete" onclick="deleteTrx('${currentUid}', '${key}')">✕</button>
                </div>
            `;
            listContainer.appendChild(itemEl);
        });
    }

    const remainingBalance = totalIncome - totalExpense;
    document.getElementById('display-income').textContent = 'Rp ' + totalIncome.toLocaleString('id-ID');
    document.getElementById('total-amount').textContent = 'Rp ' + totalExpense.toLocaleString('id-ID');
    document.getElementById('remaining-balance').textContent = 'Rp ' + remainingBalance.toLocaleString('id-ID');
    document.getElementById('total-items').textContent = count + ' Catatan';

    const balanceCardBox = document.getElementById('balance-card-box');
    if (remainingBalance < 0) {
        balanceCardBox.classList.add('minus');
    } else {
        balanceCardBox.classList.remove('minus');
    }

    renderCategoryChart(expenseByCategory, totalExpense, periodLabel);
}

function renderCategoryChart(expenseByCategory, totalExpense, periodLabel) {
    const chartContent = document.getElementById('chart-content');
    const canvas = document.getElementById('expenseChart');
    const emptyMsg = document.getElementById('empty-chart-msg');
    const breakdownContainer = document.getElementById('category-breakdown');
    breakdownContainer.innerHTML = '';

    const categories = Object.keys(expenseByCategory);
    const values = Object.values(expenseByCategory);

    if (categories.length === 0) {
        chartContent.classList.add('hidden');
        emptyMsg.textContent = `Belum ada data pengeluaran pada ${periodLabel}.`;
        emptyMsg.classList.remove('hidden');
        if (expenseChartInstance) {
            expenseChartInstance.destroy();
            expenseChartInstance = null;
        }
        return;
    }

    chartContent.classList.remove('hidden');
    emptyMsg.classList.add('hidden');

    const colors = categories.map(cat => CATEGORY_COLORS[cat] || '#10b981');

    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    expenseChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: '#0f172a',
                borderWidth: 3
            }]
        },
        options: {
            plugins: {
                legend: { display: false }
            },
            cutout: '65%'
        }
    });

    const sortedCats = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
    sortedCats.forEach(([cat, amount]) => {
        const pct = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
        const color = CATEGORY_COLORS[cat] || '#10b981';

        const row = document.createElement('div');
        row.className = 'cat-row';
        row.innerHTML = `
            <div class="cat-row-top">
                <span><b style="color:${color}">●</b> ${cat} (${pct}%)</span>
                <b>Rp ${amount.toLocaleString('id-ID')}</b>
            </div>
            <div class="cat-bar-bg">
                <div class="cat-bar-fill" style="width:${pct}%; background:${color}"></div>
            </div>
        `;
        breakdownContainer.appendChild(row);
    });
}

window.toggleStatus = (uid, key, currentStatus, type) => {
    let nextStatus;
    if (type === 'income') {
        nextStatus = currentStatus === 'Diterima' ? 'Ditunda' : 'Diterima';
    } else {
        nextStatus = currentStatus === 'Lunas' ? 'Ditunda' : 'Lunas';
    }
    update(ref(db, `afl3cc/${uid}/transactions/${key}`), { status: nextStatus });
};

window.deleteTrx = (uid, key) => {
    remove(ref(db, `afl3cc/${uid}/transactions/${key}`));
};