// script.js - MMU Biometric Voting System
(async function () {
    'use strict';

    // ---------- Application State ----------
    const SUPABASE_URL = 'https://klgkwzdedomqcfbkykmb.supabase.co';
    // REPLACE WITH YOUR ACTUAL SUPABASE ANON KEY
    const SUPABASE_KEY = 'sb_publishable_olRrnvF7Fz-eQK1hRNSpjw_1z4KrQg6';
    const AUTH_REDIRECT_URL = import.meta.env?.VITE_AUTH_REDIRECT_URL || '';
    const LOCAL_NETWORK_HOST = '192.168.0.102';

    let createSupabaseClient = window.supabase?.createClient;

    if (!createSupabaseClient) {
        try {
            ({ createClient: createSupabaseClient } = await import('@supabase/supabase-js'));
        } catch (error) {
            console.error('Supabase failed to load from the CDN and bundled fallback:', error);
            alert('Supabase failed to load. Run the app with npm run dev, or check that the Supabase script is available.');
            return;
        }
    }

    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

    let voters = [];
    let userProfiles = [];
    let positions = [
        'President', 'Vice President', 'Secretary General', 'Finance Secretary',
        'Secretary for Academics', 'Secretary for Clubs and Society', 'Secretary for Sports and Entertainment'
    ];
    let dbCandidates = [];
    let votesCount = {}; // candidate_id -> count
    let verifiedVoterId = null; // Storing the db id (UUID)
    let selectedCandidates = {}; // position -> candidate_id
    let faceModelsLoaded = false;
    let faceModelsPromise = null;
    const FACE_API_SCRIPT_URLS = [
        'vendor/face-api.min.js',
        'public/vendor/face-api.min.js',
        '/vendor/face-api.min.js'
    ];
    const FACE_MODELS_URLS = [
        'models',
        'public/models',
        '/models'
    ];
    const FACE_MATCH_THRESHOLD = 0.6;
    const DUPLICATE_FACE_THRESHOLD = 0.55;
    const FACE_SAMPLE_COUNT = 3;
    const FACE_SAMPLE_DELAY_MS = 220;
    const MIN_FACE_HEIGHT_RATIO = 0.22;
    const MAX_FACE_HEIGHT_RATIO = 0.48;
    const PROTECTED_PAGES = new Set(['register', 'vote']);
    const VOTER_LIST_COLUMNS = 'id,name,reg_number,email,phone,auth_user_id,has_voted,election_id,created_at';
    const VOTER_FACE_COLUMNS = 'id,name,reg_number,face_hash,has_voted,election_id';
    const CANDIDATE_COLUMNS = 'id,name,position,motto,image_url,election_id,created_at';
    const VOTE_COLUMNS = 'id,voter_id,candidate_id,position,election_id,created_at';

    // ---------- DOM Elements ----------
    const navLinks = document.querySelectorAll('a.nav-link');
    const pages = {
        home: document.getElementById('homePage'),
        auth: document.getElementById('authPage'),
        register: document.getElementById('registerPage'),
        vote: document.getElementById('votePage'),
        results: document.getElementById('resultsPage'),
        admin: document.getElementById('adminPage')
    };
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');

    // Stats elements
    const statRegistered = document.getElementById('statRegistered');
    const statVotesCast = document.getElementById('statVotesCast');

    // Register page
    const registerVideo = document.getElementById('registerVideo');
    const registerCameraPlaceholder = document.getElementById('registerCameraPlaceholder');
    const registerCanvas = document.getElementById('registerCanvas');
    const startRegisterCamera = document.getElementById('startRegisterCamera');
    const captureRegisterBtn = document.getElementById('captureRegisterBtn');
    const voterFirstName = document.getElementById('voterFirstName');
    const voterLastName = document.getElementById('voterLastName');
    const voterStudentId = document.getElementById('voterStudentId');
    const voterEmail = document.getElementById('voterEmail');
    const voterPhone = document.getElementById('voterPhone');
    const registerMessage = document.getElementById('registerMessage');

    // Vote page
    const voteVideo = document.getElementById('voteVideo');
    const voteCameraPlaceholder = document.getElementById('voteCameraPlaceholder');
    const verifyFaceBtn = document.getElementById('verifyFaceBtn');
    const verifyStudentId = document.getElementById('verifyStudentId');
    const verificationPanel = document.getElementById('verificationPanel');
    const ballotPanel = document.getElementById('ballotPanel');
    const candidatesContainer = document.getElementById('candidatesContainer');
    const submitVoteBtn = document.getElementById('submitVoteBtn');
    const voteMessage = document.getElementById('voteMessage');

    // Results page
    const resultsTotalVotes = document.getElementById('resultsTotalVotes');
    const resultsTotalRegistered = document.getElementById('resultsTotalRegistered');
    const resultsTurnout = document.getElementById('resultsTurnout');
    const resultsChart = document.getElementById('resultsChart');
    const backToHomeBtn = document.getElementById('backToHomeBtn');

    // Admin page
    const adminRegistered = document.getElementById('adminRegistered');
    const adminVotesFull = document.getElementById('adminVotesFull');
    const adminCandidates = document.getElementById('adminCandidates');
    const adminVotes = document.getElementById('adminVotes');
    const adminVotersTable = document.getElementById('adminVotersTable');
    const adminAccountsTable = document.getElementById('adminAccountsTable');
    const adminCandidatesList = document.getElementById('adminCandidatesList');
    const newCandidatePosition = document.getElementById('newCandidatePosition');
    const addCandidateForm = document.getElementById('addCandidateForm');
    const addCandidateMessage = document.getElementById('addCandidateMessage');
    const resetElectionBtn = document.getElementById('resetElectionBtn');
    const openNextElectionBtn = document.getElementById('openNextElectionBtn');
    const currentElectionName = document.getElementById('currentElectionName');
    const currentElectionStatus = document.getElementById('currentElectionStatus');
    const currentElectionOpened = document.getElementById('currentElectionOpened');
    const currentElectionClosed = document.getElementById('currentElectionClosed');
    const adminClock = document.getElementById('adminClock');
    const adminTurnoutLabel = document.getElementById('adminTurnoutLabel');
    const preservedReportStatus = document.getElementById('preservedReportStatus');
    const preservedReportSubtext = document.getElementById('preservedReportSubtext');
    const preservedReportsBadge = document.getElementById('preservedReportsBadge');
    const exportPreservedReportBtn = document.getElementById('exportPreservedReportBtn');
    const preservedReportsList = document.getElementById('preservedReportsList');
    const adminReportViewer = document.getElementById('adminReportViewer');
    const selectedReportTitle = document.getElementById('selectedReportTitle');
    const selectedReportMeta = document.getElementById('selectedReportMeta');
    const selectedReportBody = document.getElementById('selectedReportBody');
    const selectedReportDownloadBtn = document.getElementById('selectedReportDownloadBtn');
    const reportViewerCloseBtn = document.getElementById('reportViewerCloseBtn');
    const adminCandidateSummary = document.getElementById('adminCandidateSummary');
    const adminVoterRange = document.getElementById('adminVoterRange');
    const lifecycleActiveStep = document.getElementById('lifecycleActiveStep');
    const lifecycleClosedStep = document.getElementById('lifecycleClosedStep');

    // User auth page
    const authNavLink = document.getElementById('authNavLink');
    const authNavText = document.getElementById('authNavText');
    const authNavAvatar = document.getElementById('authNavAvatar');
    const authNavPhoto = document.getElementById('authNavPhoto');
    const authNavInitials = document.getElementById('authNavInitials');
    const authLogoutBtn = document.getElementById('authLogoutBtn');
    const accountMenu = document.getElementById('accountMenu');
    const accountMenuClose = document.getElementById('accountMenuClose');
    const accountMenuEmail = document.getElementById('accountMenuEmail');
    const accountMenuAvatar = document.getElementById('accountMenuAvatar');
    const accountMenuPhoto = document.getElementById('accountMenuPhoto');
    const accountMenuInitials = document.getElementById('accountMenuInitials');
    const accountMenuGreeting = document.getElementById('accountMenuGreeting');
    const accountProfileBtn = document.getElementById('accountProfileBtn');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const signInEmail = document.getElementById('signInEmail');
    const signInPassword = document.getElementById('signInPassword');
    const resendConfirmationBtn = document.getElementById('resendConfirmationBtn');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const resendSignupVerificationBtn = document.getElementById('resendSignupVerificationBtn');
    const signUpFirstName = document.getElementById('signUpFirstName');
    const signUpLastName = document.getElementById('signUpLastName');
    const signUpEmail = document.getElementById('signUpEmail');
    const signUpPassword = document.getElementById('signUpPassword');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    const resetPassword = document.getElementById('resetPassword');
    const resetPasswordConfirm = document.getElementById('resetPasswordConfirm');
    const authMessage = document.getElementById('authMessage');

    // Home Buttons
    const homeRegisterBtn = document.getElementById('homeRegisterBtn');
    const homeVoteBtn = document.getElementById('homeVoteBtn');
    const viewResultsBtn = document.getElementById('viewResultsBtn');

    let pendingAuthPage = 'home';
    let currentPage = 'home';
    let currentAuthSession = null;
    let currentAuthUser = null;
    let isPasswordRecoveryMode = false;
    let currentElection = null;
    let electionHistory = [];
    let selectedReportElection = null;
    let removingCandidateIds = new Set();
    let activeVoteRows = [];
    let electionCyclesAvailable = false;

    // ---------- Helper Functions ----------
    function showPage(pageName, options = {}) {
        if (PROTECTED_PAGES.has(pageName) && !isAuthenticated() && !options.skipAuthGate) {
            pendingAuthPage = pageName;
            switchAuthMode('signin');
            showPage('auth', { skipAuthGate: true });
            showMessage(authMessage, 'Please sign in or create an account to continue.', true);
            return;
        }

        Object.values(pages).forEach(page => {
            if (page) page.classList.remove('active-page');
        });
        if (pages[pageName]) pages[pageName].classList.add('active-page');
        currentPage = pageName;

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageName) {
                link.classList.add('active');
            }
        });

        window.scrollTo(0, 0); // Always scroll to top on page change

        if (pageName === 'auth' && !isPasswordRecoveryMode) switchAuthMode('signin');
        if (pageName === 'register') {
            prefillAuthenticatedVoter();
            warmFaceModels();
        }
        if (pageName === 'vote') warmFaceModels();
        if (pageName === 'results') updateResultsDisplay();
        if (pageName === 'admin') updateAdminDisplay();
        updateAuthUI();
    }

    function showMessage(element, text, isError = false) {
        if (!element) return;
        element.textContent = text;
        element.style.color = isError ? 'hsl(var(--destructive))' : 'hsl(var(--success))';
        setTimeout(() => {
            if (element.textContent === text) element.textContent = '';
        }, 5000);
    }

    function readableAuthError(error, fallback = 'Authentication failed. Please try again.') {
        const code = error?.code || '';
        const message = error?.message || '';

        if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
            return 'Invalid login credentials. If you just created this account, open the confirmation email first. If no email arrived, signup may not have completed because Supabase is rate-limiting confirmation emails.';
        }

        if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
            return 'Confirm your email before signing in. Open the confirmation link Supabase sent to your inbox, then try again.';
        }

        if (code === 'email_address_invalid' || /email address .* invalid/i.test(message)) {
            return 'Supabase rejected that email address. Use a real email account you can open, then try again.';
        }

        if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
            return 'Supabase is temporarily limiting confirmation emails. Wait a few minutes, then try again.';
        }

        if (/password/i.test(message) && /weak|short|characters/i.test(message)) {
            return 'Use a stronger password with at least 9 characters, uppercase, lowercase, a number, and a special character.';
        }

        if (/already registered|already exists/i.test(message)) {
            return 'That email already has an account. Use Sign In instead.';
        }

        return message || fallback;
    }

    function isEmailNotConfirmedError(error) {
        const code = error?.code || '';
        const message = error?.message || '';
        return code === 'email_not_confirmed' || /email not confirmed/i.test(message);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function isElectionActive() {
        return !currentElection || currentElection.status === 'active';
    }

    function voterBelongsToCurrentElection(voter) {
        if (!electionCyclesAvailable || !currentElection?.id) return true;
        if (!Object.prototype.hasOwnProperty.call(voter, 'election_id')) return true;
        return voter.election_id === currentElection.id;
    }

    function voteBelongsToCurrentElection(vote) {
        if (!electionCyclesAvailable || !currentElection?.id) return true;
        if (!Object.prototype.hasOwnProperty.call(vote, 'election_id')) return true;
        return vote.election_id === currentElection.id;
    }

    function candidateBelongsToCurrentElection(candidate) {
        if (!electionCyclesAvailable || !currentElection?.id) return true;
        if (!Object.prototype.hasOwnProperty.call(candidate, 'election_id')) return true;
        return candidate.election_id === currentElection.id;
    }

    function formatVoteError(error) {
        const message = error?.message || String(error || '');

        if (/duplicate key|votes_voter_id_position_election_id_key|already submitted|already has/i.test(message)) {
            return 'This voter already has a recorded ballot for the current election.';
        }

        if (/foreign key|candidate_id|not available|does not match/i.test(message)) {
            return 'One selected candidate is no longer available. Refresh the ballot and vote again.';
        }

        if (/closed/i.test(message)) {
            return 'This election is closed. Voting is no longer available.';
        }

        return message || 'The vote could not be submitted. Please try again.';
    }

    function voterHasVoted(voter) {
        if (electionCyclesAvailable && currentElection?.id) {
            return activeVoteRows.some(vote => vote.voter_id === voter.id);
        }

        return Boolean(voter.has_voted);
    }

    function buildElectionReportSnapshot() {
        const totalsByPosition = {};

        positions.forEach(position => {
            const candidates = dbCandidates.filter(candidate => candidate.position === position);
            if (candidates.length === 0) return;

            totalsByPosition[position] = candidates
                .map(candidate => ({
                    candidate_id: candidate.id,
                    name: candidate.name,
                    motto: candidate.motto || '',
                    votes: votesCount[candidate.id] || 0
                }))
                .sort((a, b) => b.votes - a.votes);
        });

        return {
            election_id: currentElection?.id || null,
            election_name: currentElection?.name || 'Current Election',
            closed_at: new Date().toISOString(),
            registered_voters: voters.length,
            participating_voters: new Set(activeVoteRows.map(vote => vote.voter_id)).size,
            total_ballot_entries: activeVoteRows.length,
            positions: totalsByPosition
        };
    }

    function updateAdminClock() {
        if (!adminClock) return;
        adminClock.textContent = new Date().toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function isAuthenticated() {
        return Boolean(currentAuthUser);
    }

    function isCurrentUserAdmin() {
        return currentAuthUser?.app_metadata?.role === 'admin';
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function getPasswordChecks(password) {
        const value = String(password || '');
        return {
            length: value.length >= 9,
            upper: /[A-Z]/.test(value),
            lower: /[a-z]/.test(value),
            number: /\d/.test(value),
            special: /[^A-Za-z0-9]/.test(value)
        };
    }

    function getPasswordIssues(password) {
        const checks = getPasswordChecks(password);
        const messages = {
            length: 'at least 9 characters',
            upper: 'one uppercase letter',
            lower: 'one lowercase letter',
            number: 'one number',
            special: 'one special character'
        };

        return Object.entries(checks)
            .filter(([, isValid]) => !isValid)
            .map(([key]) => messages[key]);
    }

    function renderPasswordRequirements(password, selectorPrefix = 'password') {
        const checks = getPasswordChecks(password);
        const attributeName = selectorPrefix === 'resetPassword'
            ? 'data-reset-password-rule'
            : 'data-password-rule';

        Object.entries(checks).forEach(([rule, isValid]) => {
            const item = document.querySelector(`[${attributeName}="${rule}"]`);
            if (item) item.classList.toggle('is-valid', isValid);
        });
    }

    function getPasswordErrorMessage(password) {
        const issues = getPasswordIssues(password);
        if (!issues.length) return '';
        return `Use a stronger password with ${issues.join(', ')}.`;
    }

    function getAuthRedirectUrl() {
        if (AUTH_REDIRECT_URL) return AUTH_REDIRECT_URL;

        if (['127.0.0.1', 'localhost'].includes(window.location.hostname) && LOCAL_NETWORK_HOST) {
            return `${window.location.protocol}//${LOCAL_NETWORK_HOST}${window.location.port ? `:${window.location.port}` : ''}${window.location.pathname}`;
        }

        return `${window.location.origin}${window.location.pathname}`;
    }

    function getAuthLinkErrorMessage() {
        const params = getAuthUrlParams();
        const error = params.get('error');
        const code = params.get('error_code');
        const description = params.get('error_description');

        if (!error && !code && !description) return '';

        if (code === 'otp_expired' || /expired/i.test(description || '')) {
            return 'This email link has expired. Request a fresh verification or password reset email and use the newest link.';
        }

        if (/access_denied/i.test(error || '') || /denied/i.test(description || '')) {
            return 'This email link could not open a valid session. Request a fresh email and make sure the link opens on the same reachable app URL.';
        }

        return description || 'The email link could not be verified. Request a fresh email and try again.';
    }

    function getAuthUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        hashParams.forEach((value, key) => {
            if (!params.has(key)) params.set(key, value);
        });
        return params;
    }

    async function restoreSessionFromAuthLink() {
        const params = getAuthUrlParams();
        const linkType = params.get('type') || '';
        const code = params.get('code');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!code && (!accessToken || !refreshToken)) {
            return { handled: false, type: linkType, session: null, error: null };
        }

        try {
            const { data, error } = code
                ? await supabase.auth.exchangeCodeForSession(code)
                : await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });

            if (error) {
                return { handled: true, type: linkType, session: null, error };
            }

            if (data?.session) {
                currentAuthSession = data.session;
                currentAuthUser = data.session.user;
                updateAuthUI();
            }

            window.history.replaceState({}, document.title, window.location.pathname);
            return { handled: true, type: linkType, session: data?.session || null, error: null };
        } catch (error) {
            return { handled: true, type: linkType, session: null, error };
        }
    }

    function hasRecoveryParams() {
        return getAuthUrlParams().get('type') === 'recovery';
    }

    function getAuthMetadata(user = currentAuthUser) {
        const metadata = user?.user_metadata || {};
        const email = user?.email || '';
        const emailName = email.split('@')[0] || '';
        const displayName = metadata.full_name || metadata.name || '';
        const firstName = metadata.first_name || metadata.firstName || displayName.split(/\s+/)[0] || '';
        const lastName = metadata.last_name || metadata.lastName || '';
        const fullName = displayName || `${firstName} ${lastName}`.trim() || emailName || email || 'Account';
        const photoURL = metadata.avatar_url || metadata.picture || '';

        return {
            firstName,
            lastName,
            fullName,
            email,
            emailName,
            photoURL
        };
    }

    function getProfileInitials(metadata) {
        const sourceName = metadata.fullName && metadata.fullName !== metadata.email
            ? metadata.fullName
            : metadata.emailName;
        const nameParts = String(sourceName || '')
            .trim()
            .replace(/[^a-z0-9]+/gi, ' ')
            .split(/\s+/)
            .filter(Boolean);

        if (nameParts.length >= 2) {
            return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
        }

        if (nameParts.length === 1 && !nameParts[0].includes('@')) {
            return nameParts[0].slice(0, 2).toUpperCase();
        }

        return String(metadata.email || 'AC').slice(0, 2).toUpperCase();
    }

    function renderAvatar(photoElement, initialsElement, photoURL, initials) {
        if (photoElement) {
            photoElement.hidden = !photoURL;
            if (photoURL) photoElement.src = photoURL;
            else photoElement.removeAttribute('src');
            photoElement.onerror = () => {
                photoElement.hidden = true;
                photoElement.removeAttribute('src');
                if (initialsElement) initialsElement.hidden = false;
            };
        }
        if (initialsElement) {
            initialsElement.hidden = Boolean(photoURL);
            initialsElement.textContent = initials;
        }
    }

    function closeAccountMenu() {
        if (accountMenu) accountMenu.hidden = true;
        if (authNavLink) authNavLink.setAttribute('aria-expanded', 'false');
    }

    function toggleAccountMenu() {
        if (!accountMenu || !isAuthenticated()) return;
        const shouldOpen = accountMenu.hidden;
        accountMenu.hidden = !shouldOpen;
        if (authNavLink) authNavLink.setAttribute('aria-expanded', String(shouldOpen));
    }

    function switchAuthMode(mode) {
        const isSignUp = mode === 'signup';
        const isReset = mode === 'reset';

        document.querySelectorAll('[data-auth-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.authMode === mode);
        });

        if (signInForm) signInForm.hidden = isSignUp || isReset;
        if (signUpForm) signUpForm.hidden = !isSignUp || isReset;
        if (resetPasswordForm) resetPasswordForm.hidden = !isReset;
        if (authTitle) {
            authTitle.textContent = isReset
                ? 'Set a new password'
                : isSignUp
                    ? 'Create your account'
                    : 'Welcome back';
        }
        if (authSubtitle) {
            authSubtitle.textContent = isReset
                ? 'Choose a strong password before returning to the election portal.'
                : isSignUp
                    ? 'Set up secure access before registering or voting.'
                    : 'Sign in to continue to the secure election portal.';
        }
        if (authMessage) authMessage.textContent = '';
    }

    function updateAuthUI() {
        const isSignedIn = Boolean(currentAuthUser);
        const metadata = getAuthMetadata();
        const initials = getProfileInitials(metadata);

        if (authNavText) {
            authNavText.textContent = 'Sign In';
            authNavText.hidden = isSignedIn;
        }
        if (authNavAvatar) {
            authNavAvatar.hidden = !isSignedIn;
        }
        renderAvatar(authNavPhoto, authNavInitials, isSignedIn ? metadata.photoURL : '', initials);
        if (authNavLink) {
            authNavLink.classList.toggle('is-profile', isSignedIn);
            authNavLink.setAttribute('aria-label', isSignedIn ? 'Open profile menu' : 'Sign in');
            authNavLink.title = isSignedIn ? `Signed in as ${metadata.email}` : 'Sign in';
        }
        if (authLogoutBtn) {
            authLogoutBtn.hidden = !isSignedIn;
        }
        if (!isSignedIn) {
            closeAccountMenu();
        }
        if (accountMenuEmail) {
            accountMenuEmail.textContent = metadata.email || '';
        }
        renderAvatar(accountMenuPhoto, accountMenuInitials, isSignedIn ? metadata.photoURL : '', initials);
        if (accountMenuGreeting) {
            accountMenuGreeting.textContent = `Hi, ${metadata.firstName || metadata.emailName || 'Student'}!`;
        }
    }

    function prefillAuthenticatedVoter() {
        if (!currentAuthUser) return;
        const metadata = getAuthMetadata();

        if (voterFirstName && !voterFirstName.value) voterFirstName.value = metadata.firstName || '';
        if (voterLastName && !voterLastName.value) voterLastName.value = metadata.lastName || '';
        if (voterEmail && !voterEmail.value) voterEmail.value = metadata.email || '';
    }

    async function syncUserProfile(user = currentAuthUser) {
        if (!user) return;

        const metadata = getAuthMetadata(user);
        const { error } = await supabase
            .from('user_profiles')
            .upsert({
                id: user.id,
                email: metadata.email,
                first_name: metadata.firstName,
                last_name: metadata.lastName,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) {
            console.warn('Could not sync user profile. Make sure migration 005_auth_user_profiles.sql is applied.', error);
        }
    }

    async function logoutUser() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Logout failed: ' + error.message);
            return false;
        }

        currentAuthSession = null;
        currentAuthUser = null;
        closeAccountMenu();
        updateAuthUI();

        if (PROTECTED_PAGES.has(currentPage)) {
            showPage('home');
        } else if (currentPage === 'admin') {
            updateAdminDisplay();
        }

        return true;
    }

    async function refreshAuthSession() {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            console.warn('Could not restore Supabase Auth user:', error);
        }

        currentAuthUser = data?.user || null;
        currentAuthSession = currentAuthUser ? { user: currentAuthUser } : null;
        updateAuthUI();
    }

    function loadScriptOnce(src) {
        return new Promise((resolve, reject) => {
            const existingScript = Array.from(document.scripts).find(script => script.src === new URL(src, document.baseURI).href);

            if (existingScript?.dataset.loaded === 'true') {
                resolve();
                return;
            }

            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => reject(new Error(`Could not load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensureFaceApiLoaded() {
        if (window.faceapi) return;

        const loadErrors = [];

        for (const scriptUrl of FACE_API_SCRIPT_URLS) {
            try {
                await loadScriptOnce(scriptUrl);
                if (window.faceapi) return;
            } catch (error) {
                loadErrors.push(`${scriptUrl}: ${error.message}`);
            }
        }

        console.error('Face API script load attempts failed:', loadErrors);
        throw new Error('Face recognition could not start because the local face-api script was not found. Run the app with npm run dev, or make sure public/vendor/face-api.min.js is being served.');
    }

    async function loadFaceModelsFrom(modelsUrl) {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(modelsUrl),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelsUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(modelsUrl)
        ]);
    }

    async function ensureFaceModelsLoaded() {
        if (faceModelsLoaded) return;
        if (faceModelsPromise) {
            await faceModelsPromise;
            return;
        }

        faceModelsPromise = (async () => {
            await ensureFaceApiLoaded();

            const loadErrors = [];

            for (const modelsUrl of FACE_MODELS_URLS) {
                try {
                    await loadFaceModelsFrom(modelsUrl);
                    faceModelsLoaded = true;
                    return;
                } catch (error) {
                    loadErrors.push(`${modelsUrl}: ${error.message}`);
                }
            }

            console.error('Face model load attempts failed:', loadErrors);
            throw new Error('Face recognition models were not found. Run the app with npm run dev, or make sure the public/models folder is being served.');
        })().catch(error => {
            faceModelsPromise = null;
            throw error;
        });

        await faceModelsPromise;
    }

    function warmFaceModels() {
        ensureFaceModelsLoaded().catch(error => {
            console.warn('Face models are not ready yet:', error);
        });
    }

    function waitForVideoFrame(videoElement, timeoutMs = 2500) {
        if (!videoElement) return Promise.resolve();
        if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && videoElement.videoWidth > 0) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                videoElement.removeEventListener('loadeddata', finish);
                videoElement.removeEventListener('canplay', finish);
            };
            const timer = setTimeout(() => {
                finish();
                resolve();
            }, timeoutMs);

            videoElement.addEventListener('loadeddata', () => {
                finish();
                resolve();
            }, { once: true });
            videoElement.addEventListener('canplay', () => {
                finish();
                resolve();
            }, { once: true });
        });
    }

    async function detectCurrentFace(videoElement) {
        await ensureFaceModelsLoaded();

        if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            throw new Error('Camera is not ready yet. Wait a moment and try again.');
        }

        const detection = await faceapi
            .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new Error('No face detected. Face the camera and try again.');
        }

        validateFaceFraming(videoElement, detection);
        return detection;
    }

    async function captureStableDescriptor(videoElement, cameraHandler) {
        if (cameraHandler) cameraHandler.setScanning(true);

        try {
            const descriptors = [];

            for (let index = 0; index < FACE_SAMPLE_COUNT; index += 1) {
                const detection = await detectCurrentFace(videoElement);
                descriptors.push(detection.descriptor);

                if (index < FACE_SAMPLE_COUNT - 1) {
                    await delay(FACE_SAMPLE_DELAY_MS);
                }
            }

            return descriptorToJson(averageDescriptors(descriptors));
        } finally {
            if (cameraHandler) cameraHandler.setScanning(false);
        }
    }

    function validateFaceFraming(videoElement, detection) {
        const frameHeight = videoElement.videoHeight || videoElement.clientHeight;
        const faceHeightRatio = detection.detection.box.height / frameHeight;

        if (faceHeightRatio < MIN_FACE_HEIGHT_RATIO) {
            throw new Error('Move closer and keep your face centered. Around 50cm from the camera works best.');
        }

        if (faceHeightRatio > MAX_FACE_HEIGHT_RATIO) {
            throw new Error('Move back a little. Keep about 50cm between your face and the camera.');
        }
    }

    function averageDescriptors(descriptors) {
        const averaged = new Float32Array(128);

        descriptors.forEach(descriptor => {
            descriptor.forEach((value, index) => {
                averaged[index] += value / descriptors.length;
            });
        });

        return averaged;
    }

    function descriptorToJson(descriptor) {
        const values = Array.from(descriptor, Number);

        if (values.length !== 128 || values.some(value => !Number.isFinite(value))) {
            throw new Error('Invalid face descriptor. Please try scanning again.');
        }

        return values;
    }

    function parseStoredDescriptor(voter) {
        const stored = voter.face_descriptor || voter.face_hash;

        if (!stored) return null;

        try {
            const values = typeof stored === 'string' ? JSON.parse(stored) : stored;

            if (!Array.isArray(values) || values.length !== 128) return null;

            const descriptor = new Float32Array(values.map(Number));

            if (Array.from(descriptor).some(value => !Number.isFinite(value))) return null;

            return descriptor;
        } catch (error) {
            return null;
        }
    }

    async function fetchActiveVoterFaceRecords() {
        let query = supabase
            .from('voters')
            .select(VOTER_FACE_COLUMNS);

        if (electionCyclesAvailable && currentElection?.id) {
            query = query.eq('election_id', currentElection.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    async function fetchVoterFaceRecordByRegNumber(regNumber) {
        let query = supabase
            .from('voters')
            .select(VOTER_FACE_COLUMNS)
            .eq('reg_number', regNumber);

        if (electionCyclesAvailable && currentElection?.id) {
            query = query.eq('election_id', currentElection.id);
        }

        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;
        return data;
    }

    async function findDuplicateFace(faceDescriptor, excludedRegNumber = '') {
        const queryDescriptor = new Float32Array(faceDescriptor);
        let closestMatch = null;
        const faceVoters = await fetchActiveVoterFaceRecords();

        faceVoters.forEach(voter => {
            if (excludedRegNumber && voter.reg_number === excludedRegNumber) return;

            const storedDescriptor = parseStoredDescriptor(voter);
            if (!storedDescriptor) return;

            const distance = faceapi.euclideanDistance(queryDescriptor, storedDescriptor);

            if (!closestMatch || distance < closestMatch.distance) {
                closestMatch = {
                    voter,
                    distance
                };
            }
        });

        if (closestMatch && closestMatch.distance < DUPLICATE_FACE_THRESHOLD) {
            return closestMatch;
        }

        return null;
    }

    function delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    // ---------- Supabase Integration ----------
    async function loadCurrentElection() {
        try {
            const { data, error } = await supabase
                .from('elections')
                .select('*')
                .order('opened_at', { ascending: false })

            if (error) throw error;

            electionCyclesAvailable = true;
            electionHistory = data || [];
            currentElection = electionHistory.find(election => election.status === 'active') || electionHistory[0] || null;
        } catch (error) {
            electionCyclesAvailable = false;
            electionHistory = [];
            currentElection = {
                id: null,
                name: 'Current Election',
                status: 'active',
                opened_at: null,
                closed_at: null
            };
            console.warn('Election lifecycle table is not available yet. Apply migration 007_election_cycles.sql to enable close/open election controls.', error);
        }
    }

    async function loadDataFromSupabase() {
        try {
            await loadCurrentElection();

            let votersQuery = supabase
                .from('voters')
                .select(VOTER_LIST_COLUMNS)
                .order('created_at', { ascending: false });

            let candidatesQuery = supabase
                .from('candidates')
                .select(CANDIDATE_COLUMNS)
                .order('position', { ascending: true })
                .order('name', { ascending: true });

            let votesQuery = supabase
                .from('votes')
                .select(VOTE_COLUMNS);

            if (electionCyclesAvailable && currentElection?.id) {
                votersQuery = votersQuery.eq('election_id', currentElection.id);
                candidatesQuery = candidatesQuery.eq('election_id', currentElection.id);
                votesQuery = votesQuery.eq('election_id', currentElection.id);
            }

            const [
                { data: vData, error: vErr },
                { data: cData, error: cErr },
                { data: voteData, error: voteErr }
            ] = await Promise.all([votersQuery, candidatesQuery, votesQuery]);

            if (vErr) throw vErr;
            if (cErr) throw cErr;
            if (voteErr) throw voteErr;

            voters = vData || [];
            dbCandidates = cData || [];

            votesCount = {};
            dbCandidates.forEach(c => votesCount[c.id] = 0);

            activeVoteRows = voteData || [];

            if (activeVoteRows) {
                activeVoteRows.forEach(v => {
                    votesCount[v.candidate_id] = (votesCount[v.candidate_id] || 0) + 1;
                });
            }

            updateAllStats();
            updateElectionLifecycleUI();
            renderAdminVotersTable();
            renderAdminCandidates();
            renderAdminCandidateSummary();
            renderPreservedReportsList();
            updateResultsDisplay();
        } catch (err) {
            console.error('Error fetching data from Supabase:', err);
        }
    }

    function setupRealtimeSubscriptions() {
        supabase.channel('public:votes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, payload => {
                if (payload.eventType === 'INSERT' && voteBelongsToCurrentElection(payload.new)) {
                    if (!activeVoteRows.some(vote => vote.id === payload.new.id)) {
                        activeVoteRows.push(payload.new);
                        votesCount[payload.new.candidate_id] = (votesCount[payload.new.candidate_id] || 0) + 1;
                    }
                } else if (payload.eventType === 'DELETE') {
                    const index = activeVoteRows.findIndex(vote => vote.id === payload.old.id);
                    if (index !== -1) {
                        const [removed] = activeVoteRows.splice(index, 1);
                        votesCount[removed.candidate_id] = Math.max(0, (votesCount[removed.candidate_id] || 0) - 1);
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const index = activeVoteRows.findIndex(vote => vote.id === payload.new.id);
                    if (voteBelongsToCurrentElection(payload.new)) {
                        if (index !== -1) activeVoteRows[index] = payload.new;
                        else activeVoteRows.push(payload.new);
                        votesCount = {};
                        dbCandidates.forEach(candidate => votesCount[candidate.id] = 0);
                        activeVoteRows.forEach(vote => {
                            votesCount[vote.candidate_id] = (votesCount[vote.candidate_id] || 0) + 1;
                        });
                    } else if (index !== -1) {
                        activeVoteRows.splice(index, 1);
                    }
                }
                updateAllStats();
                renderAdminVotersTable();
                updateResultsDisplay();
            })
            .subscribe();

        supabase.channel('public:voters')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'voters' }, payload => {
                if (payload.eventType === 'INSERT') {
                    if (voterBelongsToCurrentElection(payload.new)) voters.push(payload.new);
                } else if (payload.eventType === 'UPDATE') {
                    const idx = voters.findIndex(v => v.id === payload.new.id);
                    if (voterBelongsToCurrentElection(payload.new)) {
                        if (idx !== -1) voters[idx] = payload.new;
                        else voters.push(payload.new);
                    } else if (idx !== -1) {
                        voters.splice(idx, 1);
                    }
                } else if (payload.eventType === 'DELETE') {
                    voters = voters.filter(v => v.id !== payload.old.id);
                }
                updateAllStats();
                renderAdminVotersTable();
                updateResultsDisplay();
            })
            .subscribe();

        supabase.channel('public:candidates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, payload => {
                if (payload.eventType === 'INSERT' && candidateBelongsToCurrentElection(payload.new)) {
                    if (!dbCandidates.some(candidate => candidate.id === payload.new.id)) dbCandidates.push(payload.new);
                } else if (payload.eventType === 'UPDATE') {
                    const idx = dbCandidates.findIndex(candidate => candidate.id === payload.new.id);
                    if (candidateBelongsToCurrentElection(payload.new)) {
                        if (idx !== -1) dbCandidates[idx] = payload.new;
                        else dbCandidates.push(payload.new);
                    } else if (idx !== -1) {
                        dbCandidates.splice(idx, 1);
                    }
                } else if (payload.eventType === 'DELETE') {
                    dbCandidates = dbCandidates.filter(candidate => candidate.id !== payload.old.id);
                }

                dbCandidates.sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name));
                renderAdminCandidates();
                renderAdminCandidateSummary();
                updateAllStats();
                updateResultsDisplay();
            })
            .subscribe();

        supabase.channel('public:elections')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'elections' }, () => {
                loadDataFromSupabase();
            })
            .subscribe();
    }

    function updateAllStats() {
        const totalRegistered = voters.length;
        const totalVotes = electionCyclesAvailable && currentElection?.id
            ? new Set(activeVoteRows.map(vote => vote.voter_id)).size
            : voters.filter(v => v.has_voted).length;

        if (statRegistered) statRegistered.textContent = totalRegistered;
        if (statVotesCast) statVotesCast.textContent = totalVotes;

        if (adminRegistered) adminRegistered.textContent = totalRegistered;
        if (adminVotesFull) adminVotesFull.textContent = totalVotes;
        if (adminCandidates) adminCandidates.textContent = dbCandidates.length;
        if (adminTurnoutLabel) {
            const turnout = totalRegistered > 0 ? ((totalVotes / totalRegistered) * 100).toFixed(2) : '0.00';
            adminTurnoutLabel.textContent = `${turnout}% Turnout`;
        }

        if (adminVotes) {
            const allVotesCount = Object.values(votesCount).reduce((sum, val) => sum + val, 0);
            adminVotes.textContent = allVotesCount;
        }
    }

    // ---------- Camera Handler Class ----------
    class CameraHandler {
        constructor(videoElement, placeholder, type) {
            this.videoElement = videoElement;
            this.placeholder = placeholder;
            this.type = type;
            this.stream = null;

            // Set up scanner UI dynamically
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'video-wrapper';
            this.wrapper.style.position = 'relative';
            this.wrapper.style.width = '200px';
            this.wrapper.style.height = '200px';
            this.wrapper.style.marginBottom = '1.5rem';
            this.wrapper.style.display = 'none';
            this.wrapper.style.borderRadius = '50%';

            this.overlay = document.createElement('div');
            this.overlay.className = 'scanner-overlay';
            this.overlay.innerHTML = '<div class="scanner-laser"></div>';

            this.videoElement.parentNode.insertBefore(this.wrapper, this.videoElement);
            this.wrapper.appendChild(this.videoElement);
            this.wrapper.appendChild(this.overlay);

            this.videoElement.style.width = '100%';
            this.videoElement.style.height = '100%';
            this.videoElement.style.marginBottom = '0';
            this.videoElement.style.display = 'block';
        }

        async start() {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Camera access is not available in this browser. On phones, open this site over HTTPS or use localhost on the device.');
                }
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }
                this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                this.videoElement.srcObject = this.stream;
                await this.videoElement.play().catch(() => {});
                await waitForVideoFrame(this.videoElement);
                this.wrapper.style.display = 'block';
                this.placeholder.style.display = 'none';
                warmFaceModels();
                return true;
            } catch (err) {
                console.error('Camera error:', err);
                const messageTarget = this.type === 'register' ? registerMessage : voteMessage;
                const isInsecurePhoneLink = !window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
                const fallbackMessage = isInsecurePhoneLink
                    ? 'Camera access is blocked on phone browsers over plain HTTP. Use an HTTPS link for face scanning.'
                    : 'Unable to access the camera. Allow camera permission and try again.';
                showMessage(messageTarget, err.message || fallbackMessage, true);
                return false;
            }
        }

        stop() {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            this.wrapper.style.display = 'none';
            this.placeholder.style.display = 'flex';
            this.overlay.classList.remove('active');
        }

        async scan() {
            return captureStableDescriptor(this.videoElement, this);
        }

        setScanning(isScanning) {
            this.overlay.classList.toggle('active', isScanning);
        }
    }

    const regCamera = new CameraHandler(registerVideo, registerCameraPlaceholder, 'register');
    const authCamera = new CameraHandler(voteVideo, voteCameraPlaceholder, 'vote');

    // ---------- Registration ----------
    async function captureAndRegister() {
        if (!isAuthenticated()) {
            showPage('auth');
            showMessage(authMessage, 'Please sign in before registering as a voter.', true);
            return;
        }

        if (!isElectionActive()) {
            showMessage(registerMessage, 'This election is closed. Registration is locked until a new election is opened.', true);
            return;
        }

        const firstName = voterFirstName.value.trim();
        const lastName = voterLastName.value.trim();
        const name = `${firstName} ${lastName}`.trim();
        const studentId = voterStudentId.value.trim();
        const email = voterEmail.value.trim();
        const phone = voterPhone.value.trim();

        if (!firstName || !lastName || !studentId || !phone) {
            showMessage(registerMessage, 'First name, last name, Reg No., and Phone are required.', true);
            return;
        }

        const phoneRegex = /^\+254 ?\d{3} ?\d{3} ?\d{3}$/;
        if (!phoneRegex.test(phone)) {
            showMessage(registerMessage, 'Invalid Phone format. Must start with +254 and have 9 digits (e.g., +254712345678).', true);
            return;
        }

        const regRegex = /^[A-Z]{3}-\d{3}-\d{3}\/\d{4}$/i;
        if (!regRegex.test(studentId)) {
            showMessage(registerMessage, 'Invalid Reg Number format. e.g. BUS-242-000/2021', true);
            return;
        }

        if (voters.some(v => v.reg_number === studentId)) {
            showMessage(registerMessage, 'Registration number already registered.', true);
            return;
        }

        if (!regCamera.stream) {
            showMessage(registerMessage, 'Please turn on the camera first.', true);
            return;
        }

        captureRegisterBtn.disabled = true;
        captureRegisterBtn.textContent = 'Scanning Face...';

        let faceDescriptor;
        let faceHash;

        try {
            faceDescriptor = await regCamera.scan();
            const duplicateFace = await findDuplicateFace(faceDescriptor, studentId);

            if (duplicateFace) {
                showMessage(
                    registerMessage,
                    `This face looks like an existing voter: ${duplicateFace.voter.name} (${duplicateFace.voter.reg_number}). Match score: ${duplicateFace.distance.toFixed(3)}. If this is wrong, ask the election office to review the record before registration continues.`,
                    true
                );
                captureRegisterBtn.disabled = false;
                captureRegisterBtn.textContent = 'Register';
                return;
            }

            faceHash = JSON.stringify(faceDescriptor);
        } catch (err) {
            console.error('Face capture error:', err);
            showMessage(registerMessage, err.message || 'Face capture failed. Try again.', true);
            captureRegisterBtn.disabled = false;
            captureRegisterBtn.textContent = 'Register';
            return;
        }

        captureRegisterBtn.textContent = 'Saving to Database...';

        try {
            const voterRecord = {
                name: name,
                reg_number: studentId,
                email: email,
                phone: phone,
                face_hash: faceHash,
                face_descriptor: faceDescriptor,
                auth_user_id: currentAuthUser?.id || null,
                ...(currentElection?.id ? { election_id: currentElection.id } : {}),
                has_voted: false
            };

            let { data, error } = await supabase.from('voters').insert([voterRecord]).select();

            if (error && error.message && error.message.includes('face_descriptor')) {
                delete voterRecord.face_descriptor;
                ({ data, error } = await supabase.from('voters').insert([voterRecord]).select());
            }

            if (error && error.message && error.message.includes('auth_user_id')) {
                delete voterRecord.auth_user_id;
                ({ data, error } = await supabase.from('voters').insert([voterRecord]).select());
            }

            if (error && error.message && error.message.includes('election_id')) {
                delete voterRecord.election_id;
                ({ data, error } = await supabase.from('voters').insert([voterRecord]).select());
            }

            if (error) throw error;

            const insertedVoter = data?.[0];
            if (insertedVoter && voterBelongsToCurrentElection(insertedVoter)) {
                voters = [insertedVoter, ...voters.filter(voter => voter.id !== insertedVoter.id)];
                updateAllStats();
                renderAdminVotersTable();
            }

            showMessage(registerMessage, `✅ ${name} registered successfully!`);
            voterFirstName.value = '';
            voterLastName.value = '';
            voterStudentId.value = '';
            voterEmail.value = '';
            if (voterPhone) voterPhone.value = '';
            regCamera.stop();

            setTimeout(() => {
                showPage('home');
                showMessage(registerMessage, ''); // Clear message after redirect
            }, 2000);
        } catch (err) {
            console.error('Registration error:', err);
            // Specifically show the exact error message so the user can debug DB issues
            showMessage(registerMessage, `DB Error: ${err.message || 'Check console logs'}`, true);
        } finally {
            captureRegisterBtn.disabled = false;
            captureRegisterBtn.textContent = 'Register';
        }
    }

    // ---------- Voting Auth & Ballot ----------
    async function verifyVoter() {
        if (!isAuthenticated()) {
            showPage('auth');
            showMessage(authMessage, 'Please sign in before verifying your voter identity.', true);
            return;
        }

        if (!isElectionActive()) {
            showMessage(voteMessage, 'This election is closed. Voting is no longer available for this election.', true);
            return;
        }

        const studentId = verifyStudentId.value.trim();

        if (!studentId) {
            showMessage(voteMessage, 'Please enter your Registration Number', true);
            return;
        }

        let voter = voters.find(v => v.reg_number === studentId);

        if (!voter) {
            showMessage(voteMessage, 'Voter not found. Please register first.', true);
            return;
        }

        if (voterHasVoted(voter)) {
            showMessage(voteMessage, 'You have already cast your vote. Double voting is not allowed.', true);
            return;
        }

        if (!authCamera.stream) {
            showMessage(voteMessage, 'Please turn on the camera for face verification.', true);
            return;
        }

        const originalText = verifyFaceBtn.innerHTML;
        verifyFaceBtn.disabled = true;
        verifyFaceBtn.innerHTML = 'Scanning Face...';

        try {
            const faceRecord = await fetchVoterFaceRecordByRegNumber(studentId);
            if (!faceRecord) {
                showMessage(voteMessage, 'Voter face record was not found. Please register first.', true);
                verifyFaceBtn.disabled = false;
                verifyFaceBtn.innerHTML = originalText;
                return;
            }

            voter = { ...voter, ...faceRecord };
            const storedDescriptor = parseStoredDescriptor(voter);

            if (!storedDescriptor) {
                showMessage(voteMessage, 'This voter has no valid registered face. Please register again.', true);
                verifyFaceBtn.disabled = false;
                verifyFaceBtn.innerHTML = originalText;
                return;
            }

            const faceDescriptor = await authCamera.scan();
            const distance = faceapi.euclideanDistance(new Float32Array(faceDescriptor), storedDescriptor);

            if (distance >= FACE_MATCH_THRESHOLD) {
                showMessage(voteMessage, `Face not recognized. Match score: ${distance.toFixed(3)}. Required: below ${FACE_MATCH_THRESHOLD.toFixed(2)}.`, true);
                verifyFaceBtn.disabled = false;
                verifyFaceBtn.innerHTML = originalText;
                return;
            }
        } catch (err) {
            console.error('Verification error:', err);
            showMessage(voteMessage, err.message || 'Face verification failed.', true);
            verifyFaceBtn.disabled = false;
            verifyFaceBtn.innerHTML = originalText;
            return;
        } finally {
            authCamera.stop();
        }

        verifiedVoterId = voter.id;
        showMessage(voteMessage, `✅ Face verified! Welcome, ${voter.name}.`);

        setTimeout(() => {
            verificationPanel.style.display = 'none';
            const welcomeNameEl = document.getElementById('voterWelcomeName');
            if (welcomeNameEl) welcomeNameEl.textContent = voter.name;
            ballotPanel.style.display = 'block';
            verifyFaceBtn.disabled = false;
            verifyFaceBtn.innerHTML = originalText;
            renderCandidatesBallot();
        }, 1500);
    }

    function renderCandidatesBallot() {
        const grouped = {};
        positions.forEach(p => grouped[p] = []);
        dbCandidates.forEach(c => {
            if (grouped[c.position]) grouped[c.position].push(c);
        });

        candidatesContainer.innerHTML = positions.map(pos => {
            const cands = grouped[pos] || [];
            if (cands.length === 0) return '';

            return `
            <div class="position-card-vote">
                <div class="position-card-header">
                    <h3>${pos}</h3>
                </div>
                <div class="candidates-grid">
                    ${cands.map(c => `
                        <label class="candidate-vote-option">
                            <input type="radio" name="${pos.replace(/\s+/g, '')}" value="${c.id}" data-pos="${pos}">
                            <div class="candidate-vote-content">
                                <div class="candidate-avatar">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                </div>
                                <div class="candidate-info-text">
                                    <div class="candidate-name">${escapeHtml(c.name)}</div>
                                    <div class="candidate-slogan">"${escapeHtml(c.motto || 'No slogan')}"</div>
                                </div>
                                <div class="selection-indicator">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                </div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>`;
        }).join('');

        document.querySelectorAll('.candidate-vote-option input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const pos = e.target.getAttribute('data-pos');
                selectedCandidates[pos] = e.target.value;
            });
        });
    }

    async function submitVote() {
        if (submitVoteBtn.disabled) return;

        if (!isAuthenticated()) {
            showPage('auth');
            showMessage(authMessage, 'Please sign in before submitting a ballot.', true);
            return;
        }

        if (!isElectionActive()) {
            showMessage(voteMessage, 'This election is closed. Voting is no longer available for this election.', true);
            return;
        }

        if (!verifiedVoterId) {
            showMessage(voteMessage, 'Authentication required.', true);
            return;
        }

        if (!currentElection?.id) {
            showMessage(voteMessage, 'Active election could not be confirmed. Refresh the page and try again.', true);
            return;
        }

        const requiredPositions = positions.filter(pos => dbCandidates.some(c => c.position === pos));

        for (let pos of requiredPositions) {
            if (!selectedCandidates[pos]) {
                showMessage(voteMessage, `Please select a candidate for ${pos}`, true);
                return;
            }
        }

        submitVoteBtn.disabled = true;
        submitVoteBtn.textContent = 'Submitting...';
        let voteSubmitted = false;
        const progressMessageTimer = setTimeout(() => {
            showMessage(voteMessage, 'Still saving securely. Please keep this page open until it completes.');
        }, 12000);

        try {
            const ballotSelections = requiredPositions.map(pos => ({
                candidate_id: selectedCandidates[pos],
                position: pos
            }));

            const { data, error: voteErr } = await supabase.rpc('cast_ballot', {
                p_voter_id: verifiedVoterId,
                p_election_id: currentElection.id,
                p_votes: ballotSelections
            });

            if (voteErr) throw voteErr;
            if (data && data.success === false) throw new Error(data.message || 'The ballot was not accepted.');

            clearTimeout(progressMessageTimer);
            voteSubmitted = true;
            submitVoteBtn.textContent = 'Vote Submitted';
            const voterRecord = voters.find(voter => voter.id === verifiedVoterId);
            if (voterRecord) voterRecord.has_voted = true;
            ballotSelections.forEach(selection => {
                votesCount[selection.candidate_id] = (votesCount[selection.candidate_id] || 0) + 1;
                activeVoteRows.push({
                    voter_id: verifiedVoterId,
                    candidate_id: selection.candidate_id,
                    position: selection.position,
                    election_id: currentElection.id
                });
            });
            updateAllStats();
            updateResultsDisplay();
            loadDataFromSupabase().catch(error => {
                console.warn('Vote saved, but live data refresh failed:', error);
            });

            showMessage(voteMessage, 'Vote submitted successfully. Thank you for voting.');

            setTimeout(() => {
                verificationPanel.style.display = 'grid';
                ballotPanel.style.display = 'none';
                verifyStudentId.value = '';
                verifiedVoterId = null;
                selectedCandidates = {};
                submitVoteBtn.disabled = false;
                submitVoteBtn.textContent = 'Submit Ballot';
                showPage('home');
            }, 3000);

        } catch (err) {
            clearTimeout(progressMessageTimer);
            console.error('Voting error:', err);
            showMessage(voteMessage, `Voting failed: ${formatVoteError(err)}`, true);
        } finally {
            if (!voteSubmitted) {
                submitVoteBtn.disabled = false;
                submitVoteBtn.textContent = 'Submit Ballot';
            }
        }
    }

    // ---------- Results Page ----------
    function updateResultsDisplay() {
        const totalVotes = electionCyclesAvailable && currentElection?.id
            ? new Set(activeVoteRows.map(vote => vote.voter_id)).size
            : voters.filter(v => v.has_voted).length;
        const totalRegistered = voters.length;

        if (resultsTotalVotes) resultsTotalVotes.textContent = totalVotes;
        if (resultsTotalRegistered) resultsTotalRegistered.textContent = totalRegistered;
        if (resultsTurnout) {
            const turnout = totalRegistered > 0 ? ((totalVotes / totalRegistered) * 100).toFixed(0) : 0;
            resultsTurnout.textContent = turnout + '%';
        }

        const grouped = {};
        positions.forEach(p => grouped[p] = []);
        dbCandidates.forEach(c => {
            if (grouped[c.position]) grouped[c.position].push(c);
        });

        if (resultsChart) {
            resultsChart.innerHTML = positions.map(pos => {
                const cands = grouped[pos];
                if (cands.length === 0) return '';

                const totalPosVotes = cands.reduce((sum, c) => sum + (votesCount[c.id] || 0), 0);
                const sortedCands = [...cands].sort((a, b) => (votesCount[b.id] || 0) - (votesCount[a.id] || 0));

                const posCandidatesHtml = sortedCands.map(c => {
                    const voteCount = votesCount[c.id] || 0;
                    const percentage = totalPosVotes > 0 ? ((voteCount / totalPosVotes) * 100).toFixed(0) : 0;

                    return `
                    <div class="result-candidate-row">
                        <div class="candidate-row-header">
                            <div class="candidate-info">
                                <div class="candidate-avatar">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                </div>
                                <span class="candidate-name">${escapeHtml(c.name)}</span>
                            </div>
                            <div class="candidate-score">${voteCount} votes (${percentage}%)</div>
                        </div>
                        <div class="candidate-progress-bar">
                            <div class="candidate-progress-fill ${voteCount > 0 ? 'active' : ''}" style="width: ${percentage}%"></div>
                        </div>
                    </div>`;
                }).join('');

                return `
                <div class="position-card">
                    <h3 class="position-title">${escapeHtml(pos)}</h3>
                    <div class="position-candidates">${posCandidatesHtml}</div>
                    <div class="position-status">${totalPosVotes === 0 ? 'No votes yet' : totalPosVotes + ' total votes cast'}</div>
                </div>`;
            }).join('');
        }
    }

    // ---------- Admin Page ----------
    function updateElectionLifecycleUI() {
        if (currentElectionName) currentElectionName.textContent = currentElection?.name || 'Current Election';
        if (currentElectionStatus) {
            const status = currentElection?.status || 'active';
            currentElectionStatus.textContent = status === 'closed' ? 'Closed' : 'Active';
            currentElectionStatus.classList.toggle('closed', status === 'closed');
        }
        if (lifecycleActiveStep) {
            lifecycleActiveStep.classList.toggle('done', !isElectionActive());
            lifecycleActiveStep.classList.toggle('active', isElectionActive());
            lifecycleActiveStep.querySelector('small').textContent = isElectionActive() ? 'In Progress' : 'Completed';
        }
        if (currentElectionOpened) currentElectionOpened.textContent = formatDateTime(currentElection?.opened_at);
        if (currentElectionClosed) currentElectionClosed.textContent = formatDateTime(currentElection?.closed_at);
        if (lifecycleClosedStep) {
            lifecycleClosedStep.classList.toggle('done', !isElectionActive());
            lifecycleClosedStep.querySelector('small').textContent = isElectionActive() ? 'Pending' : 'Completed';
            lifecycleClosedStep.querySelector('span').textContent = isElectionActive() ? '' : '✓';
        }
        const preservedReports = getPreservedReports();
        const hasCurrentReport = Boolean(currentElection?.report_snapshot);
        if (preservedReportStatus) {
            preservedReportStatus.textContent = preservedReports.length > 0 ? 'Preserved' : 'Not Preserved';
            preservedReportStatus.classList.toggle('preserved', preservedReports.length > 0);
        }
        if (preservedReportSubtext) {
            preservedReportSubtext.textContent = preservedReports.length > 0
                ? `${preservedReports.length} report${preservedReports.length === 1 ? '' : 's'} available`
                : isElectionActive() ? 'Election Ongoing' : 'Awaiting report snapshot';
        }
        if (preservedReportsBadge) {
            preservedReportsBadge.textContent = preservedReports.length > 0 ? String(preservedReports.length) : 'None';
        }
        if (exportPreservedReportBtn) {
            exportPreservedReportBtn.disabled = preservedReports.length === 0;
            exportPreservedReportBtn.textContent = preservedReports.length > 0
                ? 'Download Latest Report'
                : 'Download Preserved Report';
        }

        if (resetElectionBtn) {
            resetElectionBtn.textContent = isElectionActive() ? 'Close Election & Preserve Report' : 'Election Closed';
            resetElectionBtn.disabled = !isElectionActive();
        }
        if (openNextElectionBtn) {
            openNextElectionBtn.disabled = isElectionActive();
            openNextElectionBtn.title = isElectionActive()
                ? 'Close the current election before opening the next one.'
                : 'Open a new active election cycle.';
        }
        if (addCandidateForm) {
            addCandidateForm.querySelectorAll('input, select, button').forEach(control => {
                control.disabled = !isElectionActive();
            });
        }
    }

    function updateAdminDisplay() {
        const adminLoginGate = document.getElementById('adminLoginGate');
        const adminDashboard = document.getElementById('adminDashboard');

        if (adminLoginGate && adminDashboard) {
            const hasAdminAccess = isCurrentUserAdmin();
            adminLoginGate.style.display = hasAdminAccess ? 'none' : 'flex';
            adminDashboard.style.display = hasAdminAccess ? 'block' : 'none';

            if (!hasAdminAccess) return;
        }

        updateAllStats();
        updateElectionLifecycleUI();
        renderAdminVotersTable();
        fetchAndRenderUserProfiles();
        renderAdminCandidates();
        renderAdminCandidateSummary();
        renderPreservedReportsList();
    }

    async function closeCurrentElection() {
        if (!electionCyclesAvailable || !currentElection?.id) {
            alert('Election lifecycle controls need migration 007_election_cycles.sql. The reset action is disabled to protect existing data.');
            return;
        }

        if (!isElectionActive()) {
            alert('This election is already closed.');
            return;
        }

        if (!confirm('Close this election and preserve its final report? This does not delete votes, voters, or candidates.')) return;

        const originalText = resetElectionBtn.textContent;
        resetElectionBtn.disabled = true;
        resetElectionBtn.textContent = 'Closing...';

        try {
            const snapshot = buildElectionReportSnapshot();
            const { error } = await supabase
                .from('elections')
                .update({
                    status: 'closed',
                    closed_at: snapshot.closed_at,
                    report_snapshot: snapshot
                })
                .eq('id', currentElection.id);

            if (error) throw error;

            alert('Election closed. The report snapshot has been preserved.');
            await loadDataFromSupabase();
        } catch (err) {
            console.error('Error closing election:', err);
            alert('Failed to close election: ' + err.message);
        } finally {
            resetElectionBtn.disabled = false;
            resetElectionBtn.textContent = originalText;
            updateElectionLifecycleUI();
        }
    }

    async function openNextElection() {
        if (!electionCyclesAvailable) {
            alert('Election lifecycle controls need migration 007_election_cycles.sql before a new election can be opened.');
            return;
        }

        if (isElectionActive()) {
            alert('Close the current election before opening the next one.');
            return;
        }

        const defaultName = `${new Date().getFullYear()} Election`;
        const name = prompt('Name for the new election:', defaultName);
        if (!name) return;

        const originalText = openNextElectionBtn.textContent;
        openNextElectionBtn.disabled = true;
        openNextElectionBtn.textContent = 'Opening...';

        try {
            const { error } = await supabase
                .from('elections')
                .insert([{ name: name.trim(), status: 'active' }]);

            if (error) throw error;

            alert('New election opened with a clean voter register. Add candidates and register voters for this election before voting begins.');
            await loadDataFromSupabase();
            showPage('admin');
        } catch (err) {
            console.error('Error opening next election:', err);
            alert('Failed to open next election: ' + err.message);
        } finally {
            openNextElectionBtn.disabled = false;
            openNextElectionBtn.textContent = originalText;
            updateElectionLifecycleUI();
        }
    }

    async function fetchAndRenderUserProfiles() {
        if (!adminAccountsTable || !isCurrentUserAdmin()) return;

        adminAccountsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:3rem; color:#adb5bd;">Loading accounts...</td></tr>';

        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('id,email,first_name,last_name,created_at,updated_at')
                .order('created_at', { ascending: false });

            if (error) throw error;
            userProfiles = data || [];
            renderAdminAccountsTable();
        } catch (err) {
            console.error('Error fetching user profiles:', err);
            adminAccountsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:3rem; color:hsl(var(--destructive));">Could not load signup accounts. Apply migration 005_auth_user_profiles.sql to allow admin profile reads.</td></tr>';
        }
    }

    window.deleteVoter = async function () {
        alert('Registered voter records are locked for election integrity. Admins can review records, but cannot remove them from the election register.');
    };

    window.deleteCandidate = async function (id) {
        if (removingCandidateIds.has(id)) {
            alert('Candidate removal is already in progress. Please wait for the list to refresh.');
            return;
        }

        if (!isElectionActive()) {
            alert('This election is closed. Candidate records for closed elections cannot be changed.');
            return;
        }

        const candidate = dbCandidates.find(item => item.id === id);
        if (!candidate) {
            alert('This candidate is already removed or is not part of the active election. Refreshing the candidate list now.');
            await loadDataFromSupabase();
            return;
        }

        if ((votesCount[id] || 0) > 0) {
            alert('This candidate already has votes and cannot be removed. This protects the election report.');
            return;
        }

        if (!confirm(`Remove ${candidate.name} from the active election? This is only allowed before votes are cast for the candidate.`)) return;

        try {
            removingCandidateIds.add(id);
            renderAdminCandidates();
            const { error } = await supabase.rpc('remove_active_candidate', { p_candidate_id: id });
            if (error) throw error;
            dbCandidates = dbCandidates.filter(item => item.id !== id);
            renderAdminCandidates();
            renderAdminCandidateSummary();
            updateAllStats();
            await loadDataFromSupabase();
            alert('Candidate removed from the active election.');
        } catch (err) {
            console.error('Failed to remove candidate:', err);
            alert('Failed to remove candidate: ' + err.message);
            removingCandidateIds.delete(id);
            renderAdminCandidates();
        } finally {
            removingCandidateIds.delete(id);
        }
    };

    function renderAdminVotersTable() {
        if (!adminVotersTable) return;
        if (voters.length === 0) {
            adminVotersTable.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:#adb5bd;">No registered voters</td></tr>';
            if (adminVoterRange) adminVoterRange.textContent = 'Showing 0 voters';
            return;
        }

        adminVotersTable.innerHTML = voters.map(v => {
            const rowNumber = voters.indexOf(v) + 1;
            const hasVoted = voterHasVoted(v);
            return `
            <tr>
                <td>${rowNumber}</td>
                <td>${escapeHtml(v.name)}</td>
                <td style="font-family:monospace;">${escapeHtml(v.reg_number)}</td>
                <td>${escapeHtml(v.email || '-')}</td>
                <td><span class="${hasVoted ? 'admin-badge-approved' : 'admin-badge-pending'}">${hasVoted ? 'Voted' : 'Pending'}</span></td>
                <td>
                    <span class="integrity-lock" title="Voter records cannot be removed from the admin panel.">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                        Locked
                    </span>
                </td>
            </tr>
        `;
        }).join('');
        if (adminVoterRange) {
            adminVoterRange.textContent = `Showing 1 to ${voters.length} of ${voters.length} voters`;
        }
    }

    function renderAdminAccountsTable() {
        if (!adminAccountsTable) return;
        if (userProfiles.length === 0) {
            adminAccountsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:3rem; color:#adb5bd;">No student accounts found</td></tr>';
            return;
        }

        adminAccountsTable.innerHTML = userProfiles.map(profile => {
            const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Account';

            return `
            <tr>
                <td>${escapeHtml(fullName)}</td>
                <td>${escapeHtml(profile.email || '-')}</td>
                <td>${formatDate(profile.created_at)}</td>
                <td>${formatDate(profile.updated_at)}</td>
            </tr>`;
        }).join('');
    }

    function renderAdminCandidates() {
        if (!adminCandidatesList) return;

        const grouped = {};
        positions.forEach(p => grouped[p] = []);
        dbCandidates.forEach(c => {
            if (grouped[c.position]) grouped[c.position].push(c);
        });

        adminCandidatesList.innerHTML = positions.map(pos => {
            const cands = grouped[pos];
            if (cands.length === 0) return '';

            return `
            <div class="candidate-group">
                <h4>${escapeHtml(pos)}</h4>
                <div class="candidate-admin-list">
                    ${cands.map(c => `
                    <div class="candidate-admin-row">
                        <div class="candidate-admin-main">
                            <div class="candidate-admin-avatar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </div>
                            <div>
                                <div class="candidate-admin-name">${escapeHtml(c.name)}</div>
                                <div class="candidate-admin-motto">"${escapeHtml(c.motto || '')}"</div>
                            </div>
                        </div>
                        <button class="candidate-remove-btn" onclick="window.deleteCandidate('${c.id}')" ${!isElectionActive() || (votesCount[c.id] || 0) > 0 || removingCandidateIds.has(c.id) ? 'disabled' : ''} type="button">
                            ${removingCandidateIds.has(c.id) ? 'Removing...' : 'Remove'}
                        </button>
                    </div>
                    `).join('')}
                </div>
            </div>`;
        }).join('');
    }

    function renderAdminCandidateSummary() {
        if (!adminCandidateSummary) return;

        const rows = positions
            .map(position => ({
                position,
                count: dbCandidates.filter(candidate => candidate.position === position).length
            }))
            .filter(row => row.count > 0);

        if (rows.length === 0) {
            adminCandidateSummary.innerHTML = '<p class="candidate-summary-empty">No candidates added yet.</p>';
            return;
        }

        adminCandidateSummary.innerHTML = rows.map(row => `
            <div class="candidate-summary-row">
                <span>${escapeHtml(row.position)}</span>
                <strong>${row.count}</strong>
            </div>
        `).join('');
    }

    function renderPreservedReportsList() {
        if (!preservedReportsList) return;

        const reports = getPreservedReports();

        if (reports.length === 0) {
            preservedReportsList.innerHTML = '<p class="report-history-empty">No preserved reports yet.</p>';
            return;
        }

        preservedReportsList.innerHTML = reports.map(report => {
            const snapshot = report.report_snapshot || {};
            return `
                <div class="report-history-row">
                    <div>
                        <strong>${escapeHtml(report.name)}</strong>
                        <span>Closed ${escapeHtml(formatDateTime(report.closed_at || snapshot.closed_at))}</span>
                    </div>
                    <div class="report-history-actions">
                        <button type="button" data-report-view="${report.id}">View</button>
                        <button type="button" data-report-download="${report.id}">Download</button>
                    </div>
                </div>
            `;
        }).join('');

        preservedReportsList.querySelectorAll('[data-report-view]').forEach(button => {
            button.addEventListener('click', () => {
                const report = reports.find(item => item.id === button.dataset.reportView);
                showPreservedReport(report);
            });
        });

        preservedReportsList.querySelectorAll('[data-report-download]').forEach(button => {
            button.addEventListener('click', () => {
                const report = reports.find(item => item.id === button.dataset.reportDownload);
                exportPreservedReport(report);
            });
        });
    }

    function getPreservedReports() {
        return electionHistory.filter(election => election.report_snapshot);
    }

    function exportPreservedReport(election = currentElection) {
        if (!election?.report_snapshot) return;

        const blob = buildReportPdfBlob(election);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeName = String(election.name || 'election-report')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'election-report';

        link.href = url;
        link.download = `${safeName}-preserved-report.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function showPreservedReport(election) {
        if (!election?.report_snapshot || !adminReportViewer) {
            alert('This preserved report is not available.');
            return;
        }

        selectedReportElection = election;
        if (selectedReportTitle) selectedReportTitle.textContent = `${election.name} Preserved Report`;
        if (selectedReportMeta) {
            const snapshot = election.report_snapshot || {};
            selectedReportMeta.textContent = `Closed ${formatDateTime(election.closed_at || snapshot.closed_at)} | ${snapshot.registered_voters || 0} registered voters | ${snapshot.participating_voters || 0} voters participated`;
        }
        if (selectedReportBody) selectedReportBody.innerHTML = buildReportViewerHtml(election);
        showAdminTab('report');
    }

    function buildReportViewerHtml(election) {
        const snapshot = election.report_snapshot || {};
        const positionsData = snapshot.positions || {};
        const positionEntries = Object.entries(positionsData);
        const turnout = snapshot.registered_voters > 0
            ? ((Number(snapshot.participating_voters || 0) / Number(snapshot.registered_voters || 0)) * 100).toFixed(1)
            : '0.0';

        const tablesHtml = positionEntries.length > 0
            ? positionEntries.map(([position, candidates]) => `
                <section class="report-section">
                    <h4>${escapeHtml(position)}</h4>
                    <div class="admin-table-wrapper">
                        <table class="admin-table report-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Candidate</th>
                                    <th>Campaign Slogan</th>
                                    <th>Votes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(candidates || []).map((candidate, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${escapeHtml(candidate.name)}</td>
                                        <td>${escapeHtml(candidate.motto || '-')}</td>
                                        <td><strong>${Number(candidate.votes || 0)}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
            `).join('')
            : '<p class="report-history-empty">No candidate results were preserved in this report.</p>';

        return `
            <div class="report-summary-grid">
                <div><span>Election</span><strong>${escapeHtml(snapshot.election_name || election.name)}</strong></div>
                <div><span>Registered Voters</span><strong>${Number(snapshot.registered_voters || 0)}</strong></div>
                <div><span>Participating Voters</span><strong>${Number(snapshot.participating_voters || 0)}</strong></div>
                <div><span>Turnout</span><strong>${turnout}%</strong></div>
                <div><span>Ballot Entries</span><strong>${Number(snapshot.total_ballot_entries || 0)}</strong></div>
                <div><span>Preserved On</span><strong>${escapeHtml(formatDateTime(snapshot.closed_at || election.closed_at))}</strong></div>
            </div>
            ${tablesHtml}
        `;
    }

    function buildReportPdfBlob(election) {
        const snapshot = election?.report_snapshot || {};
        const positionsData = snapshot.positions || {};
        const turnout = snapshot.registered_voters > 0
            ? ((Number(snapshot.participating_voters || 0) / Number(snapshot.registered_voters || 0)) * 100).toFixed(1)
            : '0.0';
        const reportTitle = `${snapshot.election_name || election?.name || 'Election'} Preserved Report`;

        const lines = [
            { text: reportTitle, size: 18, font: 'F2', gapAfter: 8 },
            { text: `Closed ${formatDateTime(snapshot.closed_at || election?.closed_at)}`, size: 10, font: 'F1', gapAfter: 14 },
            { text: 'Summary', size: 14, font: 'F2', gapAfter: 7 },
            { text: `Election: ${snapshot.election_name || election?.name || '-'}`, size: 10, font: 'F1' },
            { text: `Registered Voters: ${Number(snapshot.registered_voters || 0)}`, size: 10, font: 'F1' },
            { text: `Participating Voters: ${Number(snapshot.participating_voters || 0)}`, size: 10, font: 'F1' },
            { text: `Turnout: ${turnout}%`, size: 10, font: 'F1' },
            { text: `Ballot Entries: ${Number(snapshot.total_ballot_entries || 0)}`, size: 10, font: 'F1', gapAfter: 14 }
        ];

        const positionEntries = Object.entries(positionsData);

        if (positionEntries.length === 0) {
            lines.push({ text: 'No candidate results were preserved in this report.', size: 10, font: 'F1' });
        } else {
            positionEntries.forEach(([position, candidates]) => {
                lines.push({ text: position, size: 13, font: 'F2', gapBefore: 6, gapAfter: 6 });
                lines.push({ text: 'Rank   Candidate                         Votes', size: 10, font: 'F2', gapAfter: 4 });

                (candidates || []).forEach((candidate, index) => {
                    lines.push({
                        text: `${String(index + 1).padEnd(6)} ${String(candidate.name || '-').padEnd(32).slice(0, 32)} ${Number(candidate.votes || 0)}`,
                        size: 10,
                        font: 'F1'
                    });

                    if (candidate.motto) {
                        wrapPdfText(`Slogan: ${candidate.motto}`, 78).forEach(wrapped => {
                            lines.push({ text: `       ${wrapped}`, size: 9, font: 'F1' });
                        });
                    }
                });
            });
        }

        return new Blob([createPdfFromLines(lines)], { type: 'application/pdf' });
    }

    function wrapPdfText(text, maxLength) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';

        words.forEach(word => {
            const next = current ? `${current} ${word}` : word;
            if (next.length > maxLength && current) {
                lines.push(current);
                current = word;
            } else {
                current = next;
            }
        });

        if (current) lines.push(current);
        return lines.length ? lines : [''];
    }

    function createPdfFromLines(lines) {
        const pageWidth = 595;
        const pageHeight = 842;
        const marginX = 48;
        const marginTop = 56;
        const marginBottom = 52;
        const contentWidth = 82;
        const pages = [[]];
        let y = pageHeight - marginTop;

        lines.forEach(item => {
            const size = item.size || 10;
            const lineHeight = size + 5;
            const wrappedLines = wrapPdfText(item.text, item.font === 'F2' ? 66 : contentWidth);
            const neededHeight = (item.gapBefore || 0) + wrappedLines.length * lineHeight + (item.gapAfter || 0);

            if (y - neededHeight < marginBottom) {
                pages.push([]);
                y = pageHeight - marginTop;
            }

            y -= item.gapBefore || 0;
            wrappedLines.forEach(text => {
                pages[pages.length - 1].push({ text, x: marginX, y, size, font: item.font || 'F1' });
                y -= lineHeight;
            });
            y -= item.gapAfter || 0;
        });

        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
        ];
        const pageObjectNumbers = [];
        const contentObjectNumbers = [];

        pages.forEach(pageLines => {
            const pageNumber = objects.length + 1;
            const contentNumber = objects.length + 2;
            pageObjectNumbers.push(pageNumber);
            contentObjectNumbers.push(contentNumber);
            objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`);

            const commands = pageLines.map(line => {
                const safeText = escapePdfString(line.text);
                return `BT /${line.font} ${line.size} Tf ${line.x} ${line.y.toFixed(2)} Td (${safeText}) Tj ET`;
            }).join('\n');

            objects.push(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
        });

        objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`;
        return buildPdfDocument(objects);
    }

    function buildPdfDocument(objects) {
        let pdf = '%PDF-1.4\n';
        const offsets = [0];

        objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });

        const xrefOffset = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach(offset => {
            pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
        return pdf;
    }

    function escapePdfString(value) {
        return String(value ?? '')
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    }

    function populatePositionSelect() {
        if (!newCandidatePosition) return;
        newCandidatePosition.innerHTML = '<option value="">Select position...</option>' +
            positions.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    if (addCandidateForm) {
        addCandidateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newCandidateName').value.trim();
            const pos = newCandidatePosition.value;
            const motto = document.getElementById('newCandidateSlogan').value.trim();

            if (!name || !pos) {
                showMessage(addCandidateMessage, 'Name and Position required.', true);
                return;
            }

            if (!isElectionActive()) {
                showMessage(addCandidateMessage, 'This election is closed. Open the next election before adding candidates.', true);
                return;
            }

            try {
                const candidateRecord = {
                    name,
                    position: pos,
                    motto,
                    ...(currentElection?.id ? { election_id: currentElection.id } : {})
                };
                const { error } = await supabase.from('candidates').insert([candidateRecord]);
                if (error) throw error;

                showMessage(addCandidateMessage, `✅ ${name} added successfully!`);
                addCandidateForm.reset();
            } catch (err) {
                console.error(err);
                showMessage(addCandidateMessage, 'Failed to add candidate.', true);
            }
        });
    }

    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = normalizeEmail(signInEmail.value);
            const password = signInPassword.value;
            const submitButton = signInForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;

            submitButton.disabled = true;
            submitButton.textContent = 'Signing In...';

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                if (isEmailNotConfirmedError(error)) {
                    const resendError = await sendSignupVerificationEmail(email);
                    showMessage(authMessage, resendError
                        ? `${readableAuthError(error)} Also, verification email resend failed: ${readableAuthError(resendError, 'Could not resend verification email.')}`
                        : 'Your email is not verified yet. A fresh verification email has been sent. Open it, then sign in again.', Boolean(resendError));
                } else {
                    showMessage(authMessage, readableAuthError(error, 'Sign in failed. Please try again.'), true);
                }
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }

            currentAuthSession = data.session;
            currentAuthUser = data.user;
            await syncUserProfile(currentAuthUser);
            updateAuthUI();
            showMessage(authMessage, `Signed in as ${getAuthMetadata().fullName}.`);

            const destination = pendingAuthPage || 'home';
            pendingAuthPage = 'home';
            window.setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                showPage(destination);
            }, 700);
        });
    }

    if (signUpForm) {
        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const firstName = signUpFirstName.value.trim();
            const lastName = signUpLastName.value.trim();
            const email = normalizeEmail(signUpEmail.value);
            const password = signUpPassword.value;
            const submitButton = signUpForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;

            const passwordError = getPasswordErrorMessage(password);
            if (!firstName || !lastName || !email || passwordError) {
                showMessage(authMessage, !firstName || !lastName || !email
                    ? 'Enter your name, email, and a strong password.'
                    : passwordError, true);
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'Creating Account...';

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: getAuthRedirectUrl(),
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        full_name: `${firstName} ${lastName}`
                    }
                }
            });

            if (error) {
                showMessage(authMessage, readableAuthError(error, 'Account creation failed. Please try again.'), true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }

            if (!data.session) {
                const resendError = await sendSignupVerificationEmail(email);
                showMessage(authMessage, resendError
                    ? `Account created, but the verification email could not be resent: ${readableAuthError(resendError, 'Email delivery failed.')} Try the "Send verification email" button in a few minutes.`
                    : `Account created. A verification email has been sent. The link should return to ${getAuthRedirectUrl()}.`);
                switchAuthMode('signin');
                if (signInEmail) signInEmail.value = email;
                signUpForm.reset();
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }

            currentAuthSession = data.session;
            currentAuthUser = data.user;
            await syncUserProfile(currentAuthUser);
            updateAuthUI();
            signUpForm.reset();
            showMessage(authMessage, `Account created for ${firstName}.`);

            const destination = pendingAuthPage || 'register';
            pendingAuthPage = 'home';
            window.setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                showPage(destination);
            }, 700);
        });
    }

    async function sendSignupVerificationEmail(email) {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: getAuthRedirectUrl()
            }
        });

        return error || null;
    }

    async function handleVerificationResend(emailInput, button) {
        const email = normalizeEmail(emailInput?.value);

        if (!email) {
            showMessage(authMessage, 'Enter your email address first, then send the verification email.', true);
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Sending...';

        const error = await sendSignupVerificationEmail(email);

        if (error) {
            showMessage(authMessage, readableAuthError(error, 'Could not send verification email.'), true);
        } else {
            showMessage(authMessage, `Verification email sent. The link should return to ${getAuthRedirectUrl()}.`);
        }

        button.disabled = false;
        button.textContent = originalText;
    }

    if (resendConfirmationBtn) {
        resendConfirmationBtn.addEventListener('click', () => {
            handleVerificationResend(signInEmail, resendConfirmationBtn);
        });
    }

    if (resendSignupVerificationBtn) {
        resendSignupVerificationBtn.addEventListener('click', () => {
            handleVerificationResend(signUpEmail, resendSignupVerificationBtn);
        });
    }

    async function sendPasswordReset(emailInput, button) {
        const email = normalizeEmail(emailInput?.value);

        if (!email) {
            showMessage(authMessage, 'Enter your email address first, then request a password reset.', true);
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Sending reset link...';

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl()
        });

        if (error) {
            showMessage(authMessage, readableAuthError(error, 'Could not send the password reset email.'), true);
        } else {
            showMessage(authMessage, `Password reset email sent. The link should return to ${getAuthRedirectUrl()}.`);
        }

        button.disabled = false;
        button.textContent = originalText;
    }

    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', () => sendPasswordReset(signInEmail, forgotPasswordBtn));
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newPassword = resetPassword.value;
            const confirmPassword = resetPasswordConfirm.value;
            const submitButton = resetPasswordForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            const passwordError = getPasswordErrorMessage(newPassword);

            if (passwordError) {
                showMessage(authMessage, passwordError, true);
                return;
            }

            if (newPassword !== confirmPassword) {
                showMessage(authMessage, 'Passwords do not match. Re-enter the same new password.', true);
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'Updating Password...';

            const updatedEmail = currentAuthUser?.email || '';
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                showMessage(authMessage, readableAuthError(error, 'Could not update password.'), true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }

            await supabase.auth.signOut();
            currentAuthSession = null;
            currentAuthUser = null;
            isPasswordRecoveryMode = false;
            updateAuthUI();
            resetPasswordForm.reset();
            renderPasswordRequirements('', 'resetPassword');
            switchAuthMode('signin');
            if (signInEmail && updatedEmail) signInEmail.value = updatedEmail;
            showMessage(authMessage, 'Password updated. Sign in with your new password.');
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        });
    }

    if (signUpPassword) {
        renderPasswordRequirements(signUpPassword.value);
        signUpPassword.addEventListener('input', () => renderPasswordRequirements(signUpPassword.value));
    }

    if (resetPassword) {
        renderPasswordRequirements(resetPassword.value, 'resetPassword');
        resetPassword.addEventListener('input', () => renderPasswordRequirements(resetPassword.value, 'resetPassword'));
    }

    document.querySelectorAll('[data-auth-mode]').forEach(button => {
        button.addEventListener('click', () => {
            isPasswordRecoveryMode = false;
            switchAuthMode(button.dataset.authMode);
        });
    });

    if (authLogoutBtn) {
        authLogoutBtn.addEventListener('click', logoutUser);
    }

    if (accountMenuClose) {
        accountMenuClose.addEventListener('click', closeAccountMenu);
    }

    if (accountProfileBtn) {
        accountProfileBtn.addEventListener('click', () => {
            closeAccountMenu();
            showPage('register');
        });
    }

    document.querySelectorAll('[data-toggle-password]').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.togglePassword);
            if (!input) return;

            const shouldShow = input.type === 'password';
            input.type = shouldShow ? 'text' : 'password';
            button.textContent = shouldShow ? 'Hide' : 'Show';
            button.setAttribute('aria-label', `${shouldShow ? 'Hide' : 'Show'} password`);
        });
    });

    document.addEventListener('click', (event) => {
        if (!accountMenu || accountMenu.hidden) return;
        if (accountMenu.contains(event.target) || authNavLink?.contains(event.target)) return;
        closeAccountMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAccountMenu();
    });

    // ---------- Event Listeners Setup ----------
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            if (link === authNavLink && isAuthenticated()) {
                toggleAccountMenu();
                if (navMenu) navMenu.classList.remove('active');
                if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
                return;
            }

            closeAccountMenu();
            showPage(link.dataset.page);
            if (navMenu) navMenu.classList.remove('active');
            if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
        });
    });

    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('active');
            mobileToggle.setAttribute('aria-expanded', String(isOpen));
        });
    }

    if (homeRegisterBtn) homeRegisterBtn.addEventListener('click', () => showPage('register'));
    if (homeVoteBtn) homeVoteBtn.addEventListener('click', () => showPage('vote'));
    if (viewResultsBtn) viewResultsBtn.addEventListener('click', () => showPage('results'));

    if (backToHomeBtn) backToHomeBtn.addEventListener('click', () => showPage('home'));

    if (startRegisterCamera) startRegisterCamera.addEventListener('click', async () => {
        const originalText = startRegisterCamera.innerHTML;
        startRegisterCamera.disabled = true;
        startRegisterCamera.textContent = 'Opening Camera...';
        const success = await regCamera.start();
        startRegisterCamera.disabled = false;
        startRegisterCamera.innerHTML = success ? 'Camera Ready' : originalText;
        if (success && captureRegisterBtn) captureRegisterBtn.disabled = false;
    });

    if (captureRegisterBtn) captureRegisterBtn.addEventListener('click', captureAndRegister);

    if (voterPhone) {
        voterPhone.addEventListener('input', function (e) {
            // Remove any characters that are not digits or a plus sign
            this.value = this.value.replace(/[^\d+]/g, '');
        });

        voterPhone.addEventListener('blur', function (e) {
            let val = this.value;
            if (val) {
                // Auto-format for Kenyan phone numbers if possible
                if (val.startsWith('0')) {
                    val = '+254' + val.substring(1);
                } else if (val.startsWith('7') || val.startsWith('1')) {
                    val = '+254' + val;
                } else if (val.startsWith('254')) {
                    val = '+' + val;
                } else if (!val.startsWith('+')) {
                    val = '+' + val;
                }
            }
            this.value = val;
        });
    }

    if (verifyFaceBtn) verifyFaceBtn.addEventListener('click', () => {
        if (!authCamera.stream) {
            const originalText = verifyFaceBtn.innerHTML;
            verifyFaceBtn.disabled = true;
            verifyFaceBtn.textContent = 'Opening Camera...';
            authCamera.start().then(success => {
                verifyFaceBtn.disabled = false;
                if (success) {
                    verifyFaceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Verify Identity';
                    verifyFaceBtn.style.background = 'hsl(var(--success))';
                    showMessage(voteMessage, 'Camera is ready. Position your face, then tap Verify Identity.', false);
                } else {
                    verifyFaceBtn.innerHTML = originalText;
                }
            });
        } else {
            verifyVoter();
        }
    });

    if (submitVoteBtn) submitVoteBtn.addEventListener('click', submitVote);

    const adminLoginForm = document.getElementById('adminLoginForm');
    const adminLoginGate = document.getElementById('adminLoginGate');
    const adminDashboard = document.getElementById('adminDashboard');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const adminEmail = document.getElementById('adminEmail').value.trim();
            const adminPassword = document.getElementById('adminPassword').value;
            const adminLoginError = document.getElementById('adminLoginError');
            const submitButton = adminLoginForm.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;

            if (adminLoginError) adminLoginError.style.display = 'none';
            submitButton.disabled = true;
            submitButton.innerHTML = 'Signing In...';

            const { data, error } = await supabase.auth.signInWithPassword({
                email: adminEmail,
                password: adminPassword
            });

            if (error) {
                if (adminLoginError) {
                    adminLoginError.textContent = error.message || 'Invalid admin credentials.';
                    adminLoginError.style.display = 'block';
                }
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                return;
            }

            currentAuthSession = data.session;
            currentAuthUser = data.user;

            if (!isCurrentUserAdmin()) {
                await supabase.auth.signOut();
                currentAuthSession = null;
                currentAuthUser = null;
                updateAuthUI();

                if (adminLoginError) {
                    adminLoginError.textContent = 'This account is not authorized for admin access.';
                    adminLoginError.style.display = 'block';
                }
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                return;
            }

            await syncUserProfile(currentAuthUser);
            updateAuthUI();
            updateAdminDisplay();
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        });
    }

    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            if (adminLogoutBtn.disabled) return;

            const originalHTML = adminLogoutBtn.innerHTML;
            adminLogoutBtn.disabled = true;
            adminLogoutBtn.innerHTML = '<span><strong>Signing out...</strong><small>Please wait</small></span>';

            const didLogout = await logoutUser();
            if (didLogout) {
                if (adminDashboard) adminDashboard.style.display = 'none';
                if (adminLoginGate) adminLoginGate.style.display = 'flex';
                showPage('home');
            } else {
                adminLogoutBtn.disabled = false;
                adminLogoutBtn.innerHTML = originalHTML;
            }
        });
    }

    if (resetElectionBtn) {
        resetElectionBtn.addEventListener('click', closeCurrentElection);
    }

    if (openNextElectionBtn) {
        openNextElectionBtn.addEventListener('click', openNextElection);
    }

    function showAdminTab(tabName) {
        document.querySelectorAll('.admin-side-nav [data-admin-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.adminTab === tabName);
        });

        const dashboardPanels = [
            document.querySelector('.admin-lifecycle-panel'),
            document.querySelector('.candidates-summary'),
            document.getElementById('adminTabVoters'),
            document.querySelector('.audit-panel')
        ];

        dashboardPanels.forEach(panel => {
            if (panel) panel.style.display = tabName === 'voters' ? '' : 'none';
        });

        const tabPanels = {
            candidates: document.getElementById('adminTabCandidates'),
            accounts: document.getElementById('adminTabAccounts'),
            addCandidate: document.getElementById('adminTabAddCandidate'),
            report: adminReportViewer
        };

        Object.entries(tabPanels).forEach(([name, panel]) => {
            if (panel) panel.style.display = tabName === name ? 'block' : 'none';
        });

        if (tabName === 'accounts') fetchAndRenderUserProfiles();
        if (tabName === 'candidates') renderAdminCandidates();
    }

    document.querySelectorAll('[data-admin-tab]').forEach(tab => {
        tab.addEventListener('click', () => showAdminTab(tab.dataset.adminTab));
    });

    if (exportPreservedReportBtn) {
        exportPreservedReportBtn.addEventListener('click', () => {
            exportPreservedReport(getPreservedReports()[0]);
        });
    }

    if (selectedReportDownloadBtn) {
        selectedReportDownloadBtn.addEventListener('click', () => {
            exportPreservedReport(selectedReportElection);
        });
    }

    if (reportViewerCloseBtn) {
        reportViewerCloseBtn.addEventListener('click', () => showAdminTab('voters'));
    }

    if (auditReportSummary) {
        auditReportSummary.addEventListener('click', () => {
            const latestReport = getPreservedReports()[0];
            if (latestReport) {
                showPreservedReport(latestReport);
            } else {
                alert('No preserved report is available yet. Close the election to preserve the final report.');
            }
        });
    }

    // Initialize application
    async function initialize() {
        const authLinkError = getAuthLinkErrorMessage();
        const authLinkResult = authLinkError ? null : await restoreSessionFromAuthLink();
        await refreshAuthSession();
        supabase.auth.onAuthStateChange(async (event, session) => {
            currentAuthSession = session;
            currentAuthUser = session?.user || null;
            updateAuthUI();

            if (event === 'PASSWORD_RECOVERY') {
                isPasswordRecoveryMode = true;
                pendingAuthPage = 'home';
                showPage('auth', { skipAuthGate: true });
                switchAuthMode('reset');
                showMessage(authMessage, 'Enter a new strong password to finish account recovery.');
                return;
            }

            if (currentAuthUser) {
                await syncUserProfile(currentAuthUser);
            }

            if (currentPage === 'admin') {
                updateAdminDisplay();
            }
        });

        if (authLinkError) {
            showPage('auth', { skipAuthGate: true });
            switchAuthMode('signin');
            showMessage(authMessage, authLinkError, true);
        } else if (authLinkResult?.error) {
            showPage('auth', { skipAuthGate: true });
            switchAuthMode('signin');
            showMessage(authMessage, readableAuthError(authLinkResult.error, 'This email link could not open a valid session. Request a fresh email and try again.'), true);
        } else if (authLinkResult?.type === 'recovery' || hasRecoveryParams()) {
            isPasswordRecoveryMode = true;
            showPage('auth', { skipAuthGate: true });
            switchAuthMode('reset');
            showMessage(authMessage, 'Enter a new strong password to finish account recovery.');
        } else if (authLinkResult?.handled) {
            isPasswordRecoveryMode = false;
            showPage('auth', { skipAuthGate: true });
            switchAuthMode('signin');
            showMessage(authMessage, 'Email verified successfully. You can now sign in and continue.');
        } else {
            switchAuthMode('signin');
        }
        populatePositionSelect();
        updateAdminClock();
        setInterval(updateAdminClock, 60000);
        if (SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
            loadDataFromSupabase().then(() => {
                setupRealtimeSubscriptions();
            });
        } else {
            console.warn('Please replace YOUR_SUPABASE_ANON_KEY in bio.js to connect to the DB.');
        }
    }

    initialize().catch(error => {
        console.error('Application initialization failed:', error);
    });
})();
