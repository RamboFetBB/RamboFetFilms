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
            document.getElementById('loginBtn').classList.add('hidden');
            document.getElementById('userProfileBtn').classList.remove('hidden');
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');

            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            if (snap.exists() && snap.val().username) {
                myNickname = snap.val().username;
                localStorage.setItem('gs_nickname', myNickname);
                document.getElementById('displayUserName').innerText = myNickname;
            } else { 
                document.getElementById('profileModal').classList.remove('hidden'); 
            }
            syncUserData();
        } else {
            currentUser = null; isAdmin = false;
            // Força a escolha de nome se for a primeira vez no dispositivo
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

window.saveProfile = async () => {
    const name = document.getElementById('newUsername').value.trim();
    if (name.length < 3) return alert("O nome deve ter pelo menos 3 letras.");
    
    myNickname = name;
    localStorage.setItem('gs_nickname', name);
    document.getElementById('displayUserName').innerText = name;

    if (currentUser) await db.ref(`users/${currentUser.uid}/profile`).set({ username: name });
    document.getElementById('profileModal').classList.add('hidden');
    registerOnline();
};

window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
        totalEpsInSeason = d.episodes.length;
        document.getElementById('episodeList').innerHTML = d.episodes.map(ep => {
            // FIX DATA: Corrige erro onde dia 25 aparecia como 24
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

function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750/111/fff?text=Sem+Capa';
        let label = item.origin_country?.includes('JP') ? 'ANIME' : (item.title ? 'FILME' : 'SÉRIE');
        const seasons = item.seasons_count ? `<div class="season-badge">${item.seasons_count} Temp.</div>` : '';
        card.innerHTML = `<div class="type-badge">${label}</div>${seasons}<div class="poster-container"><img src="${poster}"></div><h3>${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

function registerOnline() {
    if (!myNickname) return;
    const refPath = 'online_users/' + (currentUser ? currentUser.uid : myUserId);
    db.ref(refPath).set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    db.ref(refPath).onDisconnect().remove();
    db.ref('online_users').on('value', (s) => {
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join('');
    });
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

window.playEpisode = (s, e) => {
    currentS = s; currentE = e; window.reloadPlayerServer();
    document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active'));
    const target = document.getElementById(`ep-btn-${e}`);
    if (target) target.classList.add('active');
    saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e);
};

window.reloadPlayerServer = () => {
    const srv = document.getElementById('serverSelect').value;
    const id = currentMovieData.id;
    let url = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${id}`;
    if (currentMovieData.type === 'tv') url += `/${currentS}/${currentE}`;
    document.getElementById('mainPlayer').src = url;
};

window.backToHome = () => {
    document.getElementById('catalogContent').classList.remove('hidden');
    document.getElementById('playerSection').classList.add('hidden');
    document.getElementById('mainPlayer').src = "";
};

async function fetchTrending() {
    if (currentType === 'favorites' || currentType === 'admin') return;
    let url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType !== 'all') url = `https://api.themoviedb.org/3/discover/${currentType === 'movie' ? 'movie' : 'tv'}?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    
    const res = await fetch(url);
    const data = await res.json();
    renderResults(data.results);
}

function listenToChat() {
    db.ref('global_chat').limitToLast(40).on('value', s => {
        const box = document.getElementById('chatMessages');
        if(box) box.innerHTML = Object.values(s.val() || {}).map(m => `<div class="msg"><b>${m.name}:</b> ${m.text}</div>`).join('');
        if(box) box.scrollTop = box.scrollHeight;
    });
}

function listenToBroadcast() {
    db.ref('admin_broadcast').on('value', (s) => {
        const banner = document.getElementById('broadcastBanner');
        if(s.exists() && s.val().active) {
            document.getElementById('broadcastText').innerText = "⚠️ " + s.val().message;
            banner.classList.remove('hidden');
            setTimeout(() => banner.classList.add('hidden'), 10000);
        }
    });
}

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    if(input.value.trim()) {
        db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP });
        input.value = '';
    }
};

window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('closed'); document.querySelector('main').classList.toggle('sidebar-closed'); };
window.setSearchType = (t, el) => { currentType = t; currentPage = 1; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if(el) el.classList.add('active'); fetchTrending(); };
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; renderWatchHistory(); }
function saveHistory(id, type, title, poster, s, e) { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); renderWatchHistory(); }
function renderWatchHistory() { /* Lógica de renderização do histórico aqui */ }