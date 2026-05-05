// script.js - MMU Biometric Voting System
(function () {
    'use strict';

    // ---------- Application State ----------
    const SUPABASE_URL = 'https://klgkwzdedomqcfbkykmb.supabase.co';
    // REPLACE WITH YOUR ACTUAL SUPABASE ANON KEY
    const SUPABASE_KEY = 'sb_publishable_olRrnvF7Fz-eQK1hRNSpjw_1z4KrQg6';

    if (!window.supabase) {
        console.error('Supabase not loaded. Please ensure the CDN script is in the HTML.');
        alert('Supabase failed to load. Please check your internet connection.');
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let voters = [];
    let positions = [
        'President', 'Vice President', 'Secretary General', 'Finance Secretary',
        'Secretary for Academics', 'Secretary for Clubs and Society', 'Secretary for Sports and Entertainment'
    ];
    let dbCandidates = [];
    let votesCount = {}; // candidate_id -> count
    let verifiedVoterId = null; // Storing the db id (UUID)
    let selectedCandidates = {}; // position -> candidate_id
    let faceModelsLoaded = false;
    const FACE_MODELS_URL = '/models';
    const FACE_MATCH_THRESHOLD = 0.6;
    const DUPLICATE_FACE_THRESHOLD = 0.55;
    const FACE_SAMPLE_COUNT = 3;
    const FACE_SAMPLE_DELAY_MS = 220;
    const MIN_FACE_HEIGHT_RATIO = 0.22;
    const MAX_FACE_HEIGHT_RATIO = 0.48;

    // ---------- DOM Elements ----------
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = {
        home: document.getElementById('homePage'),
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
    const adminCandidatesList = document.getElementById('adminCandidatesList');
    const newCandidatePosition = document.getElementById('newCandidatePosition');
    const addCandidateForm = document.getElementById('addCandidateForm');
    const addCandidateMessage = document.getElementById('addCandidateMessage');
    const resetElectionBtn = document.getElementById('resetElectionBtn');

    // Home Buttons
    const homeRegisterBtn = document.getElementById('homeRegisterBtn');
    const homeVoteBtn = document.getElementById('homeVoteBtn');
    const viewResultsBtn = document.getElementById('viewResultsBtn');

    // ---------- Helper Functions ----------
    function showPage(pageName) {
        Object.values(pages).forEach(page => page.classList.remove('active-page'));
        if (pages[pageName]) pages[pageName].classList.add('active-page');

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageName) {
                link.classList.add('active');
            }
        });

        window.scrollTo(0, 0); // Always scroll to top on page change

        if (pageName === 'results') updateResultsDisplay();
        if (pageName === 'admin') updateAdminDisplay();
    }

    function showMessage(element, text, isError = false) {
        if (!element) return;
        element.textContent = text;
        element.style.color = isError ? 'hsl(var(--destructive))' : 'hsl(var(--success))';
        setTimeout(() => {
            if (element.textContent === text) element.textContent = '';
        }, 5000);
    }

    async function ensureFaceModelsLoaded() {
        if (faceModelsLoaded) return;
        if (!window.faceapi) {
            throw new Error('Face recognition library failed to load. Check your internet connection.');
        }

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL)
        ]);

        faceModelsLoaded = true;
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

    function findDuplicateFace(faceDescriptor, excludedRegNumber = '') {
        const queryDescriptor = new Float32Array(faceDescriptor);
        let closestMatch = null;

        voters.forEach(voter => {
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
    async function loadDataFromSupabase() {
        try {
            const { data: vData, error: vErr } = await supabase.from('voters').select('*');
            if (vErr) throw vErr;
            voters = vData || [];

            const { data: cData, error: cErr } = await supabase.from('candidates').select('*');
            if (cErr) throw cErr;
            dbCandidates = cData || [];

            dbCandidates.forEach(c => votesCount[c.id] = 0);

            const { data: voteData, error: voteErr } = await supabase.from('votes').select('candidate_id');
            if (voteErr) throw voteErr;
            if (voteData) {
                voteData.forEach(v => {
                    votesCount[v.candidate_id] = (votesCount[v.candidate_id] || 0) + 1;
                });
            }

            updateAllStats();
            renderAdminVotersTable();
            renderAdminCandidates();
            updateResultsDisplay();
        } catch (err) {
            console.error('Error fetching data from Supabase:', err);
        }
    }

    function setupRealtimeSubscriptions() {
        supabase.channel('public:votes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, payload => {
                const newVote = payload.new;
                votesCount[newVote.candidate_id] = (votesCount[newVote.candidate_id] || 0) + 1;
                updateAllStats();
                updateResultsDisplay();
            })
            .subscribe();

        supabase.channel('public:voters')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'voters' }, payload => {
                if (payload.eventType === 'INSERT') {
                    voters.push(payload.new);
                } else if (payload.eventType === 'UPDATE') {
                    const idx = voters.findIndex(v => v.id === payload.new.id);
                    if (idx !== -1) voters[idx] = payload.new;
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
                if (payload.eventType === 'INSERT') {
                    dbCandidates.push(payload.new);
                    votesCount[payload.new.id] = 0;
                } else if (payload.eventType === 'DELETE') {
                    dbCandidates = dbCandidates.filter(c => c.id !== payload.old.id);
                }
                updateAllStats();
                renderAdminCandidates();
                updateResultsDisplay();
            })
            .subscribe();
    }

    function updateAllStats() {
        const totalRegistered = voters.length;
        const totalVotes = voters.filter(v => v.has_voted).length;

        if (statRegistered) statRegistered.textContent = totalRegistered;
        if (statVotesCast) statVotesCast.textContent = totalVotes;

        if (adminRegistered) adminRegistered.textContent = totalRegistered;
        if (adminVotesFull) adminVotesFull.textContent = totalVotes;
        if (adminCandidates) adminCandidates.textContent = dbCandidates.length;

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
                await ensureFaceModelsLoaded();
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }
                this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                this.videoElement.srcObject = this.stream;
                this.wrapper.style.display = 'block';
                this.placeholder.style.display = 'none';
                return true;
            } catch (err) {
                console.error('Camera error:', err);
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
            const duplicateFace = findDuplicateFace(faceDescriptor, studentId);

            if (duplicateFace) {
                showMessage(
                    registerMessage,
                    `This face is already registered as ${duplicateFace.voter.name} (${duplicateFace.voter.reg_number}). Match score: ${duplicateFace.distance.toFixed(3)}.`,
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
                has_voted: false
            };

            let { data, error } = await supabase.from('voters').insert([voterRecord]).select();

            if (error && error.message && error.message.includes('face_descriptor')) {
                delete voterRecord.face_descriptor;
                ({ data, error } = await supabase.from('voters').insert([voterRecord]).select());
            }

            if (error) throw error;

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
        const studentId = verifyStudentId.value.trim();

        if (!studentId) {
            showMessage(voteMessage, 'Please enter your Registration Number', true);
            return;
        }

        const voter = voters.find(v => v.reg_number === studentId);

        if (!voter) {
            showMessage(voteMessage, 'Voter not found. Please register first.', true);
            return;
        }

        if (voter.has_voted) {
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
                                    <div class="candidate-name">${c.name}</div>
                                    <div class="candidate-slogan">"${c.motto || 'No slogan'}"</div>
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
        if (!verifiedVoterId) {
            showMessage(voteMessage, 'Authentication required.', true);
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

        try {
            const voteInserts = requiredPositions.map(pos => ({
                voter_id: verifiedVoterId,
                candidate_id: selectedCandidates[pos],
                position: pos
            }));

            const { error: voteErr } = await supabase.from('votes').insert(voteInserts);
            if (voteErr) throw voteErr;

            const { error: updateErr } = await supabase.from('voters')
                .update({ has_voted: true })
                .eq('id', verifiedVoterId);

            if (updateErr) throw updateErr;

            showMessage(voteMessage, `🎉 Ballot cast successfully!`);

            setTimeout(() => {
                verificationPanel.style.display = 'grid';
                ballotPanel.style.display = 'none';
                verifyStudentId.value = '';
                verifiedVoterId = null;
                selectedCandidates = {};
                authCamera.stop();
                showPage('home');
            }, 3000);

        } catch (err) {
            console.error('Voting error:', err);
            showMessage(voteMessage, `Voting failed: ${err.message || 'Check console'}`, true);
        } finally {
            submitVoteBtn.disabled = false;
            submitVoteBtn.textContent = 'Submit Ballot';
        }
    }

    // ---------- Results Page ----------
    function updateResultsDisplay() {
        const totalVotes = voters.filter(v => v.has_voted).length;
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
                                <span class="candidate-name">${c.name}</span>
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
                    <h3 class="position-title">${pos}</h3>
                    <div class="position-candidates">${posCandidatesHtml}</div>
                    <div class="position-status">${totalPosVotes === 0 ? 'No votes yet' : totalPosVotes + ' total votes cast'}</div>
                </div>`;
            }).join('');
        }
    }

    // ---------- Admin Page ----------
    function updateAdminDisplay() {
        updateAllStats();
        renderAdminVotersTable();
        renderAdminCandidates();
    }

    window.deleteVoter = async function (id) {
        if (!confirm('Are you sure you want to completely remove this voter?')) return;
        try {
            const { error } = await supabase.from('voters').delete().eq('id', id);
            if (error) throw error;
            await loadDataFromSupabase(); // Reload data
            updateAdminDisplay(); // Update UI
        } catch (err) {
            alert('Failed to remove voter: ' + err.message);
        }
    };

    window.deleteCandidate = async function (id) {
        if (!confirm('Are you sure you want to remove this candidate? This will also remove any votes cast for them.')) return;
        try {
            const { error } = await supabase.from('candidates').delete().eq('id', id);
            if (error) throw error;
            await loadDataFromSupabase(); // Reload data
            updateAdminDisplay(); // Update UI
        } catch (err) {
            alert('Failed to remove candidate: ' + err.message);
        }
    };

    function renderAdminVotersTable() {
        if (!adminVotersTable) return;
        if (voters.length === 0) {
            adminVotersTable.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:#adb5bd;">No registered voters</td></tr>';
            return;
        }

        adminVotersTable.innerHTML = voters.map(v => `
            <tr>
                <td>${v.name}</td>
                <td style="font-family:monospace;">${v.reg_number}</td>
                <td>${v.email || '-'}</td>
                <td>${v.phone || '-'}</td>
                <td><span class="${v.has_voted ? 'admin-badge-approved' : 'admin-badge-pending'}">${v.has_voted ? 'Voted' : 'Pending'}</span></td>
                <td style="text-align:right;">
                    <button onclick="window.deleteVoter('${v.id}')" style="background:#fee2e2; color:#ef4444; border:none; padding:0.4rem 0.8rem; border-radius:4px; font-weight:600; cursor:pointer; font-size:0.85rem; transition: background 0.2s;">Remove</button>
                </td>
            </tr>
        `).join('');
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
            <div style="margin-bottom:1.5rem;">
                <h4 style="color:#2b5cbe; font-weight:700; margin-bottom:0.75rem;">${pos}</h4>
                <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
                    ${cands.map(c => `
                    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem 1rem; border:1px solid hsl(var(--border)); border-radius:8px; background:#f8f9fa; min-width: 250px; flex: 1; justify-content: space-between;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:36px;height:36px;border-radius:50%;background:#e9ecef;display:flex;align-items:center;justify-content:center;color:#6c757d;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </div>
                            <div>
                                <div style="font-weight:600;font-size:0.9rem;">${c.name}</div>
                                <div style="font-size:0.75rem;color:#6c757d;font-style:italic;">"${c.motto || ''}"</div>
                            </div>
                        </div>
                        <button onclick="window.deleteCandidate('${c.id}')" style="background:#fee2e2; color:#ef4444; border:none; padding:0.4rem 0.8rem; border-radius:4px; font-weight:600; cursor:pointer; font-size:0.85rem; transition: background 0.2s;">Remove</button>
                    </div>
                    `).join('')}
                </div>
            </div>`;
        }).join('');
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

            try {
                const { error } = await supabase.from('candidates').insert([{ name, position: pos, motto }]);
                if (error) throw error;

                showMessage(addCandidateMessage, `✅ ${name} added successfully!`);
                addCandidateForm.reset();
            } catch (err) {
                console.error(err);
                showMessage(addCandidateMessage, 'Failed to add candidate.', true);
            }
        });
    }

    // ---------- Event Listeners Setup ----------
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(link.dataset.page);
            if (navMenu) navMenu.classList.remove('active');
        });
    });

    if (mobileToggle) mobileToggle.addEventListener('click', () => navMenu.classList.toggle('active'));

    if (homeRegisterBtn) homeRegisterBtn.addEventListener('click', () => showPage('register'));
    if (homeVoteBtn) homeVoteBtn.addEventListener('click', () => showPage('vote'));
    if (viewResultsBtn) viewResultsBtn.addEventListener('click', () => showPage('results'));

    if (backToHomeBtn) backToHomeBtn.addEventListener('click', () => showPage('home'));

    if (startRegisterCamera) startRegisterCamera.addEventListener('click', async () => {
        const success = await regCamera.start();
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
            authCamera.start().then(success => {
                if (success) {
                    verifyFaceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Verify Identity';
                    verifyFaceBtn.style.background = 'hsl(var(--success))';
                    setTimeout(verifyVoter, 350);
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
        adminLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            adminLoginGate.style.display = 'none';
            adminDashboard.style.display = 'block';
            updateAdminDisplay();
        });
    }

    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', () => {
            adminDashboard.style.display = 'none';
            adminLoginGate.style.display = 'flex';
        });
    }

    if (resetElectionBtn) {
        resetElectionBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to completely RESET ALL ELECTION DATA? This will delete all votes and reset all voter statuses.')) return;

            const originalText = resetElectionBtn.textContent;
            resetElectionBtn.disabled = true;
            resetElectionBtn.textContent = 'Resetting...';

            try {
                // Delete all votes
                const { error: votesErr } = await supabase.from('votes').delete().not('id', 'is', null);
                if (votesErr) throw votesErr;

                // Reset voter status
                const { error: votersErr } = await supabase.from('voters').update({ has_voted: false }).not('id', 'is', null);
                if (votersErr) throw votersErr;

                // Clear local votesCount state to fix local UI immediately
                Object.keys(votesCount).forEach(key => votesCount[key] = 0);

                alert('Election data has been successfully reset.');
                await loadDataFromSupabase(); // Reload data to sync state
                updateAdminDisplay();
            } catch (err) {
                console.error('Error resetting election:', err);
                alert('Failed to reset election data: ' + err.message);
            } finally {
                resetElectionBtn.disabled = false;
                resetElectionBtn.textContent = originalText;
            }
        });
    }

    document.querySelectorAll('[data-admin-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-admin-tab]').forEach(t => {
                t.style.background = 'transparent';
                t.style.boxShadow = 'none';
                t.style.fontWeight = '500';
                t.style.color = '#6c757d';
                t.classList.remove('active');
            });
            tab.style.background = 'white';
            tab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            tab.style.fontWeight = '600';
            tab.style.color = 'hsl(var(--foreground))';
            tab.classList.add('active');

            const tabName = tab.getAttribute('data-admin-tab');
            document.getElementById('adminTabVoters').style.display = tabName === 'voters' ? 'block' : 'none';
            document.getElementById('adminTabCandidates').style.display = tabName === 'candidates' ? 'block' : 'none';
            document.getElementById('adminTabAddCandidate').style.display = tabName === 'addCandidate' ? 'block' : 'none';
        });
    });

    // Initialize application
    function initialize() {
        populatePositionSelect();
        if (SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
            loadDataFromSupabase().then(() => {
                setupRealtimeSubscriptions();
            });
        } else {
            console.warn('Please replace YOUR_SUPABASE_ANON_KEY in bio.js to connect to the DB.');
        }
    }

    initialize();
})();
