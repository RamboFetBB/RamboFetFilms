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

let myUserId = localStorage.getItem('gs_userid') || ('user_' + sessionKey);
localStorage.setItem('gs_userid', myUserId);
let myNickname = localStorage.getItem('gs_nickname') || null;

window.onload = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user; 
            isAdmin = (user.email === 'adm@hotmail.com');
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            myNickname = (snap.exists() && snap.val().username) ? snap.val().username : user.email.split('@')[0];
            unlockSite();
            syncUserData();
        } else if (myNickname) {
            unlockSite();
            loadLocalData();
        } else {
            document.getElementById('authModal').classList.remove('hidden');
        }
    });
    listenToChat();
};

function unlockSite() {
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('catalogContent').classList.remove('hidden');
    document.getElementById('userProfileBtn').classList.remove('hidden');
    document.getElementById('displayUserName').innerText = myNickname;
    registerOnline();
    fetchTrending();
}

// --- LOGICA DO PLAYER ---
window.loadPlayer = (id, type, title, poster, s=1, e=1) => { 
    currentMovieData = {id, type, title, poster}; currentS = s; currentE = e; 
    document.getElementById('catalogContent').classList.add('hidden'); 
    document.getElementById('playerSection').classList.remove('hidden'); 
    document.getElementById('videoTitle').innerText = title; 
    
    if (type === 'tv') { 
        document.getElementById('seriesNavigation').classList.remove('hidden'); 
        fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => { 
            document.getElementById('seasonSelect').innerHTML = d.seasons.filter(sea => sea.season_number > 0).map(sea => `<option value="${sea.season_number}" ${sea.season_number == s ? 'selected' : ''}>Temporada ${sea.season_number}</option>`).join(''); 
            window.loadEpisodes(s, e); 
        }); 
    } else { 
        document.getElementById('seriesNavigation').classList.add('hidden'); 
        document.getElementById('nextEpBtn').classList.add('hidden');
        window.reloadPlayerServer(); 
    } 
    updateFavBtnUI();
};

window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
        totalEpsInSeason = d.episodes.length;
        document.getElementById('episodeList').innerHTML = d.episodes.map(ep => {
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">EP ${ep.episode_number}</button>`;
        }).join('');
        window.playEpisode(sNum, eNum);
    });
};

window.playEpisode = (s, e) => { 
    currentS = s; currentE = e; 
    window.reloadPlayerServer(); 
    document.getElementById('nextEpBtn').classList.toggle('hidden', e >= totalEpsInSeason);
    saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e); 
};

window.playNextEpisode = () => { if (currentE < totalEpsInSeason) window.playEpisode(currentS, currentE + 1); };

window.reloadPlayerServer = () => { 
    const srv = document.getElementById('serverSelect').value; 
    let url = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${currentMovieData.id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${currentMovieData.id}`; 
    if (currentMovieData.type === 'tv') url += `/${currentS}/${currentE}`; 
    document.getElementById('mainPlayer').src = url; 
};

// --- FAVORITOS ---
function updateFavBtnUI() {
    const isFav = favorites.some(f => f.id === currentMovieData.id);
    const btn = document.getElementById('playerFavBtn');
    btn.innerText = isFav ? "SALVO ❤" : "FAVORITAR";
    btn.style.background = isFav ? "#2ecc71" : "#e50914";
}

window.toggleFavoriteCurrent = () => {
    const idx = favorites.findIndex(f => f.id === currentMovieData.id);
    if (idx > -1) favorites.splice(idx, 1); else favorites.unshift(currentMovieData);
    if(currentUser) db.ref(`users/${currentUser.uid}/favorites`).set(favorites);
    updateFavBtnUI();
};

// --- RESTO ---
async function fetchTrending() { 
    const q = document.getElementById('searchInput').value; 
    let url = `https://api.themoviedb.org/3/discover/${currentType.includes('movie')?'movie':'tv'}?api_key=${API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${currentPage}`; 
    if (!q && currentType === 'all') url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`; 
    if (q) url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${q}&language=pt-BR&page=${currentPage}`; 
    const res = await fetch(url); const data = await res.json(); 
    renderResults(data.results.filter(i => i.poster_path));
}

function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        card.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${item.poster_path}"><h3>${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, item.poster_path);
        grid.appendChild(card);
    });
}

window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('closed'); };
window.backToHome = () => { document.getElementById('playerSection').classList.add('hidden'); document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('mainPlayer').src = ""; };
window.accessAsGuest = () => { const n = document.getElementById('guestNickname').value; if(n.length >= 3) { myNickname = n; localStorage.setItem('gs_nickname', n); unlockSite(); } };
window.handleLogout = () => { localStorage.clear(); auth.signOut(); location.reload(); };
window.setSearchType = (t, el) => { currentType = t; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); fetchTrending(); };
window.mainSearch = () => { currentPage = 1; fetchTrending(); };

function registerOnline() { const ref = db.ref('online_users/' + (currentUser ? currentUser.uid : myUserId)); ref.set({name: myNickname}); ref.onDisconnect().remove(); db.ref('online_users').on('value', s => { document.getElementById('onlineList').innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join(''); }); }
function listenToChat() { db.ref('global_chat').limitToLast(30).on('value', s => { document.getElementById('chatMessages').innerHTML = Object.values(s.val() || {}).map(m => `<div class="msg"><b>${m.name}:</b> ${m.text}</div>`).join(''); }); }
window.sendChatMessage = () => { const i = document.getElementById('chatInput'); if(i.value) { db.ref('global_chat').push({name: myNickname, text: i.value}); i.value = ''; } };
window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
function syncUserData() { db.ref(`users/${currentUser.uid}/favorites`).on('value', s => { favorites = s.val() || []; }); }
function loadLocalData() { favorites = JSON.parse(localStorage.getItem('gs_favorites')) || []; }
function saveHistory(id, type, title, poster, s, e) { /* Lógica de histórico */ }