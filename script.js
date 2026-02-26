const firebaseConfig = {
    apiKey: "AIzaSyDAxrnM2jXCJ5A0nh3o7i_cgfooeGxO1Bo",
    authDomain: "cassi-8787c.firebaseapp.com",
    databaseURL: "https://cassi-8787c-default-rtdb.firebaseio.com",
    projectId: "cassi-8787c"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const API_KEY = '673e9c9f4b85ae41be022ec08483d650';

let currentUser = null, isAdmin = false, sessionKey = Math.random().toString(36).substr(2, 9);
let currentType = 'all', currentPage = 1, totalEpsInSeason = 0;
let currentMovieData = { id: null, type: null, title: null, poster: null };
let currentS = 1, currentE = 1, watchHistory = [], favorites = [];

// Identificação persistente por dispositivo
let myUserId = localStorage.getItem('gs_userid') || ('user_' + sessionKey);
localStorage.setItem('gs_userid', myUserId);
let myNickname = localStorage.getItem('gs_nickname') || ""; 

window.onload = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const sessionRef = db.ref(`users/${user.uid}/active_session`);
            const snapshot = await sessionRef.once('value');
            if (snapshot.exists() && snapshot.val() !== sessionKey) {
                alert("Sessão encerrada: Logado em outro dispositivo.");
                auth.signOut(); return;
            }
            sessionRef.set(sessionKey);
            sessionRef.onDisconnect().remove();

            currentUser = user; isAdmin = (user.email === 'adm@hotmail.com');
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            if (snap.exists() && snap.val().username) {
                myNickname = snap.val().username;
                localStorage.setItem('gs_nickname', myNickname);
                document.getElementById('displayUserName').innerText = myNickname;
            } else { 
                document.getElementById('profileModal').classList.remove('hidden'); 
            }
            document.getElementById('loginBtn').classList.add('hidden');
            document.getElementById('userProfileBtn').classList.remove('hidden');
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');
            syncUserData();
        } else {
            currentUser = null; isAdmin = false;
            if (!myNickname) {
                document.getElementById('profileModal').classList.remove('hidden');
            } else {
                document.getElementById('displayUserName').innerText = myNickname;
            }
            loadLocalData();
        }
        registerOnline();
    });
    listenToChat(); listenToBroadcast(); fetchTrending();
};

window.handleLogout = () => {
    if (currentUser) {
        db.ref(`users/${currentUser.uid}/active_session`).remove().then(() => {
            auth.signOut().then(() => window.location.reload());
        });
    } else { auth.signOut().then(() => window.location.reload()); }
};

// --- FIX DATA LANÇAMENTO (FUSO HORÁRIO) ---
window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
        totalEpsInSeason = d.episodes.length;
        document.getElementById('episodeList').innerHTML = d.episodes.map(ep => {
            let date = 'Sem data';
            if (ep.air_date) {
                const parts = ep.air_date.split('-');
                date = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" id="ep-btn-${ep.episode_number}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">
                EP ${ep.episode_number} <br><small style="font-size:0.6rem; opacity:0.7;">${date}</small>
            </button>`;
        }).join('');
        window.playEpisode(sNum, eNum);
    });
};

window.playEpisode = (s, e) => {
    currentS = s; currentE = e; window.reloadPlayerServer();
    document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active'));
    const target = document.getElementById(`ep-btn-${e}`);
    if (target) target.classList.add('active');
    saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e);
};

function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750/111/fff?text=Sem+Capa';
        let label = item.origin_country?.includes('JP') ? 'ANIME' : (item.title ? 'FILME' : 'SÉRIE');
        const seasons = item.seasons_count ? `<div class="season-badge">${item.seasons_count} Temp.</div>` : '';
        
        let info = ""; 
        if (item.last_ep) {
            const [y, m, d] = item.last_ep.air_date.split('-');
            info = `<div class="release-info">Último: EP ${item.last_ep.episode_number} (${d}/${m}/${y})</div>`;
        }
        
        card.innerHTML = `<div class="type-badge">${label}</div>${seasons}<div class="poster-container"><img src="${poster}">${info}</div><h3>${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

function renderWatchHistory() {
    const grid = document.getElementById('historyGrid');
    if (watchHistory.length > 0 && currentType !== 'favorites' && currentType !== 'admin') {
        document.getElementById('continueWatchingSection').classList.remove('hidden');
        grid.innerHTML = watchHistory.map(i => {
            const label = i.type === 'tv' ? `T${i.s}:E${i.e}` : 'FILME';
            return `
            <div class="movie-card" onclick="window.loadPlayer(${i.id},'${i.type}','${i.title}','${i.poster}',${i.s},${i.e})">
                <button class="remove-history" onclick="window.removeFromHistory(event, ${i.id})">X</button>
                <div class="poster-container">
                    <img src="${i.poster}">
                    <div class="release-info" style="background:var(--primary)">${label}</div>
                </div>
                <h3>${i.title}</h3>
            </div>`;
        }).join('');
    } else document.getElementById('continueWatchingSection').classList.add('hidden');
}

window.loadPlayer = (id, type, title, poster, s=1, e=1) => {
    currentMovieData = {id, type, title, poster}; currentS = s; currentE = e;
    document.getElementById('catalogContent').classList.add('hidden');
    document.getElementById('playerSection').classList.remove('hidden');
    document.getElementById('videoTitle').innerText = title;
    if (type === 'tv') {
        document.getElementById('seriesNavigation').classList.remove('hidden');
        document.getElementById('nextEpBtn').classList.remove('hidden');
        fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
            document.getElementById('seasonSelect').innerHTML = d.seasons.filter(sea => sea.season_number > 0).map(sea => `<option value="${sea.season_number}" ${sea.season_number == s ? 'selected' : ''}>Temporada ${sea.season_number}</option>`).join('');
            window.loadEpisodes(s, e);
        });
    } else { 
        document.getElementById('seriesNavigation').classList.add('hidden'); 
        document.getElementById('nextEpBtn').classList.add('hidden'); 
        window.reloadPlayerServer(); 
        saveHistory(id, type, title, poster, 1, 1); 
    }
};

window.reloadPlayerServer = () => {
    const srv = document.getElementById('serverSelect').value;
    let url = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${currentMovieData.id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${currentMovieData.id}`;
    if (currentMovieData.type === 'tv') url += `/${currentS}/${currentE}`;
    document.getElementById('mainPlayer').src = url;
};

// --- CHAT E SIDEBAR ---
window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('closed');
    document.getElementById('sidebarToggleBtn').innerText = sb.classList.contains('closed') ? "💬 Mostrar Chat" : "💬 Ocultar Chat";
};

window.registerOnline = () => {
    if (!myNickname) return;
    const ref = db.ref('online_users/' + (currentUser ? currentUser.uid : myUserId));
    ref.set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    ref.onDisconnect().remove();
    db.ref('online_users').on('value', s => {
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join('');
    });
};

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    if(input.value.trim()) {
        db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP });
        input.value = '';
    }
};

function listenToChat() {
    db.ref('global_chat').limitToLast(40).on('value', s => {
        const box = document.getElementById('chatMessages');
        if(box) box.innerHTML = Object.values(s.val() || {}).map(m => `<div class="msg"><b>${m.name}:</b> ${m.text}</div>`).join('');
        if(box) box.scrollTop = box.scrollHeight;
    });
}

// --- OUTRAS FUNÇÕES ---
window.saveProfile = async () => {
    const n = document.getElementById('newUsername').value.trim();
    if (n.length < 3) return alert("Mínimo 3 letras.");
    myNickname = n; localStorage.setItem('gs_nickname', n);
    document.getElementById('displayUserName').innerText = n;
    if (currentUser) await db.ref(`users/${currentUser.uid}/profile`).set({ username: n });
    document.getElementById('profileModal').classList.add('hidden');
    registerOnline();
};

async function fetchTrending() {
    if (currentType === 'favorites' || currentType === 'admin') return;
    let url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType !== 'all') url = `https://api.themoviedb.org/3/discover/${currentType === 'movie' ? 'movie' : 'tv'}?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    const res = await fetch(url);
    const data = await res.json();
    let detailed = await Promise.all(data.results.map(async (i) => {
        try {
            const d = await (await fetch(`https://api.themoviedb.org/3/tv/${i.id}?api_key=${API_KEY}&language=pt-BR`)).json();
            i.last_ep = d.last_episode_to_air; i.seasons_count = d.number_of_seasons;
        } catch(e){}
        return i;
    }));
    renderResults(detailed); renderPagination(data.total_pages);
}

window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; };
window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
window.setSearchType = (t, el) => { currentType = t; currentPage = 1; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if(el) el.classList.add('active'); fetchTrending(); };
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; favorites = JSON.parse(localStorage.getItem('gs_favorites')) || []; renderWatchHistory(); }
function saveHistory(id, type, title, poster, s, e) { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); renderWatchHistory(); }
window.removeFromHistory = (e, id) => { e.stopPropagation(); watchHistory = watchHistory.filter(h => h.id !== id); localStorage.setItem('gs_history', JSON.stringify(watchHistory)); renderWatchHistory(); };
function syncUserData() { db.ref(`users/${currentUser.uid}/history`).on('value', s => { watchHistory = s.val() || []; renderWatchHistory(); }); }
function listenToBroadcast() { db.ref('admin_broadcast').on('value', (s) => { const banner = document.getElementById('broadcastBanner'); if(s.exists() && s.val().active) { document.getElementById('broadcastText').innerText = "⚠️ " + s.val().message; banner.classList.remove('hidden'); } }); }
function renderPagination(total) { const container = document.getElementById('pagination'); if (total <= 1) return; let html = ""; for (let i = Math.max(1, currentPage-2); i <= Math.min(total, currentPage+2); i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`; container.innerHTML = html; }
window.changePage = (p) => { currentPage = p; window.scrollTo(0,0); fetchTrending(); };
window.changeSeason = () => { const s = document.getElementById('seasonSelect').value; window.loadEpisodes(s, 1); };
window.openAuthModal = () => document.getElementById('authModal').classList.remove('hidden');
window.closeAuthModal = () => document.getElementById('authModal').classList.add('hidden');
window.handleAuth = async () => { const e = document.getElementById('authEmail').value, p = document.getElementById('authPassword').value; try { await auth.signInWithEmailAndPassword(e, p); window.closeAuthModal(); } catch (err) { try { await auth.createUserWithEmailAndPassword(e, p); window.closeAuthModal(); } catch (e2) { alert("Erro."); } } };