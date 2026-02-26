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
    // Monitor de autenticação persistente
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

            currentUser = user; 
            isAdmin = (user.email === 'adm@hotmail.com');
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');
            
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            myNickname = (snap.exists() && snap.val().username) ? snap.val().username : user.email.split('@')[0];
            
            unlockSite();
            syncUserData();
        } else if (myNickname) {
            // Se já tem apelido de convidado salvo
            unlockSite();
            loadLocalData();
        } else {
            // Só mostra o modal se realmente não houver nada salvo
            document.getElementById('authModal').classList.remove('hidden');
            document.getElementById('catalogContent').classList.add('hidden');
        }
    });

    listenToChat(); 
    listenToBroadcast();
};

function unlockSite() {
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('catalogContent').classList.remove('hidden');
    document.getElementById('userProfileBtn').classList.remove('hidden');
    document.getElementById('displayUserName').innerText = myNickname;
    registerOnline();
    fetchTrending();
}

window.accessAsGuest = () => {
    const nick = document.getElementById('guestNickname').value.trim();
    if (nick.length >= 3) {
        myNickname = nick;
        localStorage.setItem('gs_nickname', nick);
        unlockSite();
    } else {
        alert("Escolha um apelido com pelo menos 3 letras.");
    }
};

window.handleLogout = () => {
    localStorage.removeItem('gs_nickname');
    if (currentUser) {
        db.ref(`users/${currentUser.uid}/active_session`).remove().then(() => {
            auth.signOut().then(() => window.location.reload());
        });
    } else { window.location.reload(); }
};

function registerOnline() {
    const refPath = 'online_users/' + (currentUser ? currentUser.uid : myUserId);
    db.ref(refPath).set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    db.ref(refPath).onDisconnect().remove();

    db.ref('online_users').on('value', (s) => {
        const users = s.val() || {};
        const userArray = Object.entries(users).map(([uid, u]) => ({ uid, ...u }));
        
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = userArray.map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join('');
        
        const adminList = document.getElementById('adminUserFullList');
        if(adminList) {
            adminList.innerHTML = userArray.map(u => `
                <div class="admin-user-row" style="border-left:5px solid #3498db; background:#111; padding:15px; display:flex; justify-content:space-between;">
                    <b>${u.name}</b>
                    <button onclick="window.adminRenameUser('${u.uid}')" style="background:#3498db; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Renomear</button>
                </div>
            `).join('');
        }
    });
}

// --- FUNÇÕES DE API E PLAYER (TMDB) ---

window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => {
        totalEpsInSeason = d.episodes.length;
        document.getElementById('episodeList').innerHTML = d.episodes.map(ep => {
            let dateStr = ep.air_date ? ep.air_date.split('-').reverse().join('/') : 'Sem data';
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" id="ep-btn-${ep.episode_number}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">
                EP ${ep.episode_number} <br><small style="font-size:0.6rem; opacity:0.7;">${dateStr}</small>
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
        let info = item.last_ep ? `<div class="release-info">Último: EP ${item.last_ep.episode_number} (${item.last_ep.air_date.split('-').reverse().join('/')})</div>` : "";
        card.innerHTML = `<div class="type-badge">${label}</div>${seasons}<div class="poster-container"><img src="${poster}">${info}</div><h3>${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

async function fetchTrending() { 
    if (currentType === 'favorites' || currentType === 'admin') return; 
    const q = document.getElementById('searchInput').value; 
    let url = `https://api.themoviedb.org/3/discover/${currentType.includes('movie')?'movie':'tv'}?api_key=${API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${currentPage}`; 
    if (!q && currentType === 'all') url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`; 
    if (q) url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${q}&language=pt-BR&page=${currentPage}`; 
    
    const res = await fetch(url); 
    const data = await res.json(); 
    let detailed = await Promise.all(data.results.filter(i => i.media_type !== 'person').map(async (i) => { 
        try { 
            const d = await (await fetch(`https://api.themoviedb.org/3/tv/${i.id}?api_key=${API_KEY}&language=pt-BR`)).json(); 
            i.last_ep = d.last_episode_to_air; i.seasons_count = d.number_of_seasons; 
        } catch(e){} return i; 
    })); 
    renderResults(detailed); 
    renderPagination(data.total_pages); 
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
    } 
};

window.reloadPlayerServer = () => { 
    const srv = document.getElementById('serverSelect').value; 
    let url = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${currentMovieData.id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${currentMovieData.id}`; 
    if (currentMovieData.type === 'tv') url += `/${currentS}/${currentE}`; 
    document.getElementById('mainPlayer').src = url; 
};

// --- CHAT E ADMIN ---

window.adminRenameUser = (uid) => { const n = prompt("Novo nome:"); if(n) db.ref(`online_users/${uid}`).update({name: n}); };
window.adminClearChat = () => { if(confirm("Limpar chat?")) db.ref('global_chat').remove(); };
window.triggerBroadcastPrompt = () => { const m = prompt("Aviso (10s):"); if(m) db.ref('admin_broadcast').set({active: true, message: m}); };
window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('closed'); document.querySelector('main').classList.toggle('sidebar-closed'); };
window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; };
window.openAdminPanel = () => { if(!isAdmin) return; currentType = 'admin'; document.getElementById('adminSection').classList.remove('hidden'); document.getElementById('adminMainView').classList.remove('hidden'); };

window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
window.sendChatMessage = () => { const input = document.getElementById('chatInput'); if(input.value.trim()) { db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP }); input.value = ''; } };

function listenToChat() { db.ref('global_chat').limitToLast(40).on('value', s => { const box = document.getElementById('chatMessages'); if(box) box.innerHTML = Object.values(s.val() || {}).map(m => `<div class="msg"><b>${m.name}:</b> ${m.text}</div>`).join(''); if(box) box.scrollTop = box.scrollHeight; }); }
function listenToBroadcast() { db.ref('admin_broadcast').on('value', (s) => { const banner = document.getElementById('broadcastBanner'); if(s.exists() && s.val().active) { document.getElementById('broadcastText').innerText = "⚠️ " + s.val().message; banner.classList.remove('hidden'); setTimeout(() => { banner.classList.add('hidden'); if(isAdmin) db.ref('admin_broadcast').update({active: false}); }, 10000); } }); }

window.handleAuth = async () => { 
    const e = document.getElementById('authEmail').value, p = document.getElementById('authPassword').value; 
    if(!e || !p) return; 
    try { await auth.signInWithEmailAndPassword(e, p); } catch (err) { try { await auth.createUserWithEmailAndPassword(e, p); } catch (e2) { document.getElementById('authError').innerText = "Erro ao autenticar."; } } 
};

window.setSearchType = (t, el) => { currentType = t; currentPage = 1; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); document.getElementById('adminSection').classList.add('hidden'); fetchTrending(); };
window.mainSearch = () => { currentPage = 1; fetchTrending(); };
window.applyFilters = () => { currentPage = 1; fetchTrending(); };
window.changeSeason = () => { window.loadEpisodes(document.getElementById('seasonSelect').value, 1); };
window.changePage = (p) => { currentPage = p; window.scrollTo(0,0); fetchTrending(); };
function renderPagination(total) { const container = document.getElementById('pagination'); if (total <= 1) { container.innerHTML = ""; return; } let html = `<button class="page-btn" onclick="window.changePage(1)">«</button>`; for (let i = Math.max(1, currentPage-2); i <= Math.min(total, currentPage+2); i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`; container.innerHTML = html + `<button class="page-btn" onclick="window.changePage(${total})">»</button>`; }

function syncUserData() { if(currentUser) db.ref(`users/${currentUser.uid}/history`).on('value', s => { watchHistory = s.val() || []; }); }
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; }
function saveHistory(id, type, title, poster, s, e) { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); if(currentUser) db.ref(`users/${currentUser.uid}/history`).set(watchHistory.slice(0,8)); else localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); }