// admin.js - MMU E-Voting Admin Dashboard
// ===========================================
// Supabase Configuration
// Replace these with your actual project credentials
// ===========================================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // e.g. https://xyzcompany.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;
let currentUser = null;

// ---------- Initialize Supabase ----------
function initSupabase() {
    try {
        if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
            console.warn('⚠ Supabase credentials not set. Running in demo mode.');
            return false;
        }
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
    } catch (err) {
        console.error('Supabase init error:', err);
        return false;
    }
}

// ---------- DOM References ----------
const loginScreen = document.getElementById('loginScreen');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');

// Stats
const statTotalUsers = document.getElementById('statTotalUsers');
const statPending = document.getElementById('statPending');
const statVotes = document.getElementById('statVotes');

// Table
const usersTableBody = document.getElementById('usersTableBody');

// System Status
const endpointStatus = document.getElementById('endpointStatus');
const lastSyncTime = document.getElementById('lastSyncTime');

// Edit Modal
const editModal = document.getElementById('editModal');
const editModalContent = document.getElementById('editModalContent');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const saveModalBtn = document.getElementById('saveModalBtn');
const editId = document.getElementById('editId');
const editName = document.getElementById('editName');
const editEmail = document.getElementById('editEmail');
const editStatus = document.getElementById('editStatus');

// Sidebar Navigation
const navItems = document.querySelectorAll('.nav-item');

// ---------- Demo Data ----------
const DEMO_VOTERS = [
    { id: 1, name: 'Johnson Laizer', student_id: '123', email: 'blaizer259@gmail.com', phone: '+254727714669', status: 'Pending', has_voted: false },
    { id: 2, name: 'Amina Hassan', student_id: 'BUS-242-001/2021', email: 'amina@students.mmu.ac.ke', phone: '+254712345678', status: 'Approved', has_voted: true },
    { id: 3, name: 'Brian Ochieng', student_id: 'BUS-242-002/2021', email: 'brian.o@students.mmu.ac.ke', phone: '+254700112233', status: 'Approved', has_voted: false },
    { id: 4, name: 'Grace Wanjiku', student_id: 'ENG-119-003/2022', email: 'grace.w@students.mmu.ac.ke', phone: '+254711223344', status: 'Pending', has_voted: false },
    { id: 5, name: 'Kevin Mutua', student_id: 'SCI-305-004/2023', email: 'kevin.m@students.mmu.ac.ke', phone: '+254722334455', status: 'Approved', has_voted: true },
];

let localVoters = [...DEMO_VOTERS];

// ---------- Authentication ----------
async function handleLogin(username, password) {
    if (supabase) {
        try {
            // If Supabase is strictly expecting an email format, you may need to append a domain
            // e.g. email: username + '@admin.local'
            const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });
            if (error) throw error;
            currentUser = data.user;
            showDashboard();
        } catch (err) {
            showLoginError(err.message || 'Invalid credentials');
        }
    } else {
        // Demo mode: accept any username/password
        if (username && password) {
            currentUser = { username };
            showDashboard();
        } else {
            showLoginError('Please enter credentials');
        }
    }
}

async function handleLogout() {
    if (supabase) {
        await supabase.auth.signOut();
    }
    currentUser = null;
    showLogin();
}

async function checkSession() {
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            showDashboard();
            return;
        }
    }
    showLogin();
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
    loadDashboardData();
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
    loginError.classList.add('hidden');
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
}

// ---------- CRUD Operations ----------
async function fetchVoters() {
    if (supabase) {
        try {
            const { data, error } = await supabase.from('voters').select('*').order('id', { ascending: true });
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('Fetch error:', err);
            showToast('Failed to load data from Supabase', 'error');
            return [];
        }
    } else {
        // Demo mode
        return localVoters;
    }
}

async function deleteVoter(id) {
    if (!confirm('Are you sure you want to delete this voter record? This action cannot be undone.')) return;

    if (supabase) {
        try {
            const { error } = await supabase.from('voters').delete().eq('id', id);
            if (error) throw error;
            showToast('Voter deleted successfully', 'success');
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete voter', 'error');
            return;
        }
    } else {
        localVoters = localVoters.filter(v => v.id !== id);
        showToast('Voter deleted successfully', 'success');
    }
    loadDashboardData();
}

async function updateVoter(id, updates) {
    if (supabase) {
        try {
            const { error } = await supabase.from('voters').update(updates).eq('id', id);
            if (error) throw error;
            showToast('Voter updated successfully', 'success');
        } catch (err) {
            console.error('Update error:', err);
            showToast('Failed to update voter', 'error');
            return;
        }
    } else {
        const idx = localVoters.findIndex(v => v.id === id);
        if (idx !== -1) {
            localVoters[idx] = { ...localVoters[idx], ...updates };
        }
        showToast('Voter updated successfully', 'success');
    }
    closeEditModal();
    loadDashboardData();
}

// ---------- Dashboard Render ----------
async function loadDashboardData() {
    const voters = await fetchVoters();
    renderStats(voters);
    renderTable(voters);
    updateSystemStatus();
}

function renderStats(voters) {
    const total = voters.length;
    const pending = voters.filter(v => v.status === 'Pending').length;
    const voted = voters.filter(v => v.has_voted).length;

    animateCount(statTotalUsers, total);
    animateCount(statPending, pending);
    animateCount(statVotes, voted);
}

function animateCount(el, target) {
    const duration = 600;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = Math.round(start + diff * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function renderTable(voters) {
    if (voters.length === 0) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400 text-sm">
                    <div class="flex flex-col items-center gap-2">
                        <svg class="w-10 h-10 text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                        No registered voters found.
                    </div>
                </td>
            </tr>`;
        return;
    }

    usersTableBody.innerHTML = voters.map(voter => `
        <tr class="border-b border-slate-100 transition-colors">
            <td class="py-4 px-6">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold shrink-0">
                        ${voter.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p class="font-semibold text-slate-800 text-sm">${voter.name}</p>
                        <p class="text-xs text-slate-400">${voter.phone || '-'}</p>
                    </div>
                </div>
            </td>
            <td class="py-4 px-6 text-sm text-slate-600 font-mono">${voter.student_id}</td>
            <td class="py-4 px-6 text-sm text-slate-600">${voter.email}</td>
            <td class="py-4 px-6">
                <span class="${voter.status === 'Approved' ? 'badge-approved' : 'badge-pending'}">${voter.status}</span>
            </td>
            <td class="py-4 px-6 text-right">
                <div class="flex justify-end gap-1">
                    <button class="btn-edit" onclick="openEditModal(${voter.id})" title="Edit">
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="btn-delete" onclick="handleDelete(${voter.id})" title="Delete">
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateSystemStatus() {
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        endpointStatus.textContent = SUPABASE_URL;
    } else {
        endpointStatus.textContent = 'Demo Mode (No Supabase URL set)';
    }
    lastSyncTime.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------- Edit Modal ----------
function openEditModal(id) {
    let voters = supabase ? [] : localVoters;
    // For demo, use local data
    const voter = localVoters.find(v => v.id === id);
    if (!voter) return;

    editId.value = voter.id;
    editName.value = voter.name;
    editEmail.value = voter.email;
    editStatus.value = voter.status;

    editModal.classList.add('active');
    editModal.classList.remove('hidden');
    // Trigger scale animation
    setTimeout(() => {
        editModalContent.style.transform = 'scale(1)';
    }, 10);

    // Re-init Lucide icons inside modal
    if (window.lucide) lucide.createIcons();
}

function closeEditModal() {
    editModalContent.style.transform = 'scale(0.95)';
    setTimeout(() => {
        editModal.classList.remove('active');
        editModal.classList.add('hidden');
    }, 200);
}

async function saveEdit() {
    const id = parseInt(editId.value);
    const updates = {
        name: editName.value.trim(),
        email: editEmail.value.trim(),
        status: editStatus.value
    };

    if (!updates.name || !updates.email) {
        showToast('Name and email are required', 'error');
        return;
    }

    await updateVoter(id, updates);
}

// ---------- Toast Notifications ----------
function showToast(message, type = 'success') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---------- Mobile Sidebar ----------
function setupMobileSidebar() {
    // Create mobile sidebar overlay and sidebar clone
    const overlay = document.createElement('div');
    overlay.className = 'mobile-sidebar-overlay';
    overlay.id = 'mobileSidebarOverlay';

    const sidebar = document.createElement('aside');
    sidebar.className = 'mobile-sidebar';
    sidebar.id = 'mobileSidebar';
    sidebar.innerHTML = `
        <div class="p-6 flex items-center justify-between border-b border-slate-800">
            <div class="flex items-center gap-3">
                <div class="bg-brand-blue p-2 rounded-lg" style="background:#2b5cbe;">
                    <svg class="w-6 h-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div>
                    <h1 class="text-lg font-bold text-white">E-Voting</h1>
                    <span class="text-xs text-slate-400">Admin Portal</span>
                </div>
            </div>
            <button id="closeMobileSidebar" class="text-slate-400 hover:text-white">
                <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <nav class="flex-1 p-4 space-y-1">
            <a href="#dashboard" class="flex items-center gap-3 px-4 py-3 bg-blue-600 rounded-lg text-white font-medium" style="background:#2b5cbe;">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                Dashboard
            </a>
            <a href="#users" class="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>
                User Management
            </a>
            <a href="#settings" class="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"/><circle cx="12" cy="12" r="3"/></svg>
                System Status
            </a>
        </nav>
        <div class="p-4 border-t border-slate-800">
            <button id="mobileLogoutBtn" class="flex w-full items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Logout
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(sidebar);

    // Events
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            overlay.classList.add('active');
            sidebar.classList.add('active');
        });
    }

    overlay.addEventListener('click', closeMobileSidebar);

    const closeBtn = document.getElementById('closeMobileSidebar');
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);

    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);
}

function closeMobileSidebar() {
    const overlay = document.getElementById('mobileSidebarOverlay');
    const sidebar = document.getElementById('mobileSidebar');
    if (overlay) overlay.classList.remove('active');
    if (sidebar) sidebar.classList.remove('active');
}

// ---------- Expose globals for onclick handlers ----------
window.openEditModal = openEditModal;
window.handleDelete = deleteVoter;

// ---------- Event Listeners ----------
document.addEventListener('DOMContentLoaded', () => {
    const isConnected = initSupabase();

    // Login
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin(usernameInput.value, passwordInput.value);
    });

    // Logout
    logoutBtn.addEventListener('click', handleLogout);

    // Refresh
    refreshBtn.addEventListener('click', () => {
        loadDashboardData();
        showToast('Data refreshed', 'success');
    });

    // Modal
    closeModalBtn.addEventListener('click', closeEditModal);
    cancelModalBtn.addEventListener('click', closeEditModal);
    saveModalBtn.addEventListener('click', saveEdit);

    // Close modal on backdrop click
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    // Sidebar Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(n => {
                n.classList.remove('active');
                n.classList.add('text-slate-300');
                n.style.backgroundColor = '';
            });
            item.classList.add('active');
            item.classList.remove('text-slate-300');
        });
    });



    // Mobile sidebar
    setupMobileSidebar();

    // Check existing session
    checkSession();
});
