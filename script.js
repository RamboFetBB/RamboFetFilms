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

let myNickname = localStorage.getItem('gs_nickname') || "";
let myUserId = localStorage.getItem('gs_userid') || 'user_' + sessionKey;
localStorage.setItem('gs_userid', myUserId);

window.onload = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user; isAdmin = (user.email === 'adm@hotmail.com');
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            if (snap.exists() && snap.val().username) {
                myNickname = snap.val().username;
                document.getElementById('displayUserName').innerText = myNickname;
            } else { document.getElementById('profileModal').classList.remove('hidden'); }
            document.getElementById('loginBtn').classList.add('hidden');
            document.getElementById('userProfileBtn').classList.remove('hidden');
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');
            syncUserData();
        } else {
            if (!myNickname) document.getElementById('profileModal').classList.remove('hidden');
            else document.getElementById('displayUserName').innerText = myNickname;
            loadLocalData();
        }
        registerOnline();
    });
    listenToChat(); listenToBroadcast(); fetchTrending();
};

// --- FUNÇÕES DE PERFIL E ONLINE ---
window.saveProfile = async () => {
    const name = document.getElementById('newUsername').value.trim();
    if (name.length < 3) return alert("Mínimo 3 letras.");
    myNickname = name;
    localStorage.setItem('gs_nickname', name);
    document.getElementById('displayUserName').innerText = name;
    if (currentUser) await db.ref(`users/${currentUser.uid}/profile`).set({ username: name });
    document.getElementById('profileModal').classList.add('hidden');
    registerOnline();
};

window.registerOnline = () => {
    if (!myNickname) return;
    const ref = db.ref('online_users/' + myUserId);
    ref.set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    ref.onDisconnect().remove();
    db.ref('online_users').on('value', s => {
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join('');
    });
};

// --- BUSCA E RENDERIZAÇÃO (DATA FIXA) ---
async function fetchTrending() {
    let url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType !== 'all') url = `https://api.themoviedb.org/3/discover/${currentType === 'movie' ? 'movie' : 'tv'}?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    const res = await fetch(url);
    const data = await res.json();
    renderResults(data.results);
}

function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750/111/fff?text=Sem+Capa';
        let label = item.origin_country?.includes('JP') ? 'ANIME' : (item.title ? 'FILME' : 'SÉRIE');
        card.innerHTML = `<div class="type-badge">${label}</div><div class="poster-container"><img src="${poster}"></div><h3>${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

// --- PLAYER E EPISÓDIOS ---
window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
        totalEpsInSeason = d.episodes.length;
        document.getElementById('episodeList').innerHTML = d.episodes.map(ep => {
            let date = 'Sem data';
            if (ep.air_date) {
                const parts = ep.air_date.split('-'); // Correção fuso horário
                date = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">EP ${ep.episode_number}<br><small>${date}</small></button>`;
        }).join('');
    });
};

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
    } else { window.reloadPlayerServer(); }
};

window.playEpisode = (s, e) => { currentS = s; currentE = e; window.reloadPlayerServer(); saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e); };

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
    document.getElementById('sidebarToggleBtn').innerText = sb.classList.contains('closed') ? "💬 Chat" : "💬 Ocultar Chat";
};

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    if(input.value.trim()) {
        db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP });
        input.value = '';
    }
};

window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };

function listenToChat() {
    db.ref('global_chat').limitToLast(40).on('value', s => {
        const box = document.getElementById('chatMessages');
        if(box) box.innerHTML = Object.values(s.val() || {}).map(m => `<div><b>${m.name}:</b> ${m.text}</div>`).join('');
        if(box) box.scrollTop = box.scrollHeight;
    });
}

// Funções de Back, Logout, Sync, History omitidas aqui para caber, mas você deve manter as suas originais que já funcionam
window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; };
window.handleLogout = () => { auth.signOut().then(() => window.location.reload()); };
window.setSearchType = (t, el) => { currentType = t; currentPage = 1; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if(el) el.classList.add('active'); fetchTrending(); };
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; renderWatchHistory(); }
function saveHistory(id, type, title, poster, s, e) { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); renderWatchHistory(); }
function renderWatchHistory() { /* Sua função original */ }
function listenToBroadcast() { /* Sua função original */ }