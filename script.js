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
let myNickname = localStorage.getItem('gs_nickname') || 'Convidado ' + Math.floor(Math.random() * 10000);

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
                document.getElementById('displayUserName').innerText = myNickname;
            } else { document.getElementById('profileModal').classList.remove('hidden'); }
            syncUserData();
        } else {
            currentUser = null; isAdmin = false; registerOnline(); loadLocalData();
        }
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
            let dateStr = 'Sem data';
            if (ep.air_date) {
                const [ano, mes, dia] = ep.air_date.split('-');
                dateStr = `${dia}/${mes}/${ano}`; // Formatação manual evita erro do dia 24/25
            }
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" id="ep-btn-${ep.episode_number}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">
                EP ${ep.episode_number} <br><small style="font-size:0.6rem; opacity:0.7; pointer-events:none;">${dateStr}</small>
            </button>`;
        }).join('');
        window.playEpisode(sNum, eNum);
    });
};

// --- RENDERIZAR CARDS COM NOME, TAGS E PROGRESSO ---
function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750/111/fff?text=Sem+Capa';
        
        let label = item.origin_country?.includes('JP') ? 'ANIME' : (item.title ? 'FILME' : 'SÉRIE');
        const seasons = item.seasons_count ? `<div class="season-badge">${item.seasons_count} Temp.</div>` : ''; // Mostra temporadas
        
        let info = ""; 
        if (item.last_ep) {
            const [y, m, d] = item.last_ep.air_date.split('-');
            const next = item.next_ep ? `<br>Próx: ${item.next_ep.air_date.split('-').reverse().join('/')}` : '<br>Finalizado';
            info = `<div class="release-info" style="pointer-events:none;">Último: EP ${item.last_ep.episode_number} (${d}/${m}/${y})${next}</div>`;
        }
        
        card.innerHTML = `<div class="type-badge">${label}</div>${seasons}<div class="poster-container"><img src="${poster}">${info}</div><h3 style="pointer-events:none;">${item.title || item.name}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

function renderWatchHistory() {
    const grid = document.getElementById('historyGrid');
    if (watchHistory.length > 0 && currentType !== 'favorites' && currentType !== 'admin') {
        document.getElementById('continueWatchingSection').classList.remove('hidden');
        grid.innerHTML = watchHistory.map(i => {
            const label = i.type === 'tv' ? `ESTOU NO: T${i.s}:E${i.e}` : 'FILME'; // Progresso TX:EX
            return `
            <div class="movie-card" onclick="window.loadPlayer(${i.id},'${i.type}','${i.title}','${i.poster}',${i.s},${i.e})">
                <button class="remove-history" onclick="window.removeFromHistory(event, ${i.id})">X</button>
                <div class="poster-container">
                    <img src="${i.poster}">
                    <div class="release-info" style="background: rgba(229,9,20,0.95); color: white; pointer-events: none; font-weight: bold;">${label}</div>
                </div>
                <h3 style="pointer-events: none;">${i.title}</h3>
            </div>`;
        }).join('');
    } else document.getElementById('continueWatchingSection').classList.add('hidden');
}

// --- ADMIN DEBTS E OUTROS HELPERS ---
window.renderDebts = () => {
    db.ref('admin_debts').on('value', s => {
        const list = document.getElementById('adminDebtList'), totalDisp = document.getElementById('totalDebtDisplay');
        let total = 0; list.innerHTML = '';
        if(s.exists()) {
            const arr = Object.entries(s.val()).map(([id, d]) => ({id, ...d})).sort((a,b) => (b.priority || 0) - (a.priority || 0));
            arr.forEach(d => {
                const val = parseFloat(String(d.value).replace(',','.')) || 0; total += val;
                let color = d.priority == 3 ? '#e50914' : (d.priority == 2 ? '#f1c40f' : '#3498db');
                list.innerHTML += `<div class="admin-user-row" style="border-left: 6px solid ${color}; background:#111; padding:20px; display:flex; justify-content:space-between; align-items:center;">
                    <div><b>${d.name}</b><br><span style="color:#2ecc71; font-weight:900">R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                    <button onclick="window.removeDebt('${d.id}')" style="background:#e74c3c; border:none; padding:8px; border-radius:4px; cursor:pointer;">DELETAR</button>
                </div>`;
            });
        }
        totalDisp.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`; // Soma total
    });
};

// Funções restantes omitidas por brevidade, mas devem ser mantidas conforme o script anterior
window.playEpisode = (s, e) => { currentS = s; currentE = e; window.reloadPlayerServer(); document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active')); const target = document.getElementById(`ep-btn-${e}`); if (target) target.classList.add('active'); saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e); };
async function fetchTrending() { if (currentType === 'favorites' || currentType === 'admin') return; const q = document.getElementById('searchInput').value; let url = `https://api.themoviedb.org/3/discover/${currentType.includes('movie')?'movie':'tv'}?api_key=${API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${currentPage}`; if (!q && currentType === 'all') url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`; if (q) url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${q}&language=pt-BR&page=${currentPage}`; if (currentType.includes('anime')) { url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=pt-BR&with_genres=16&with_origin_country=JP&page=${currentPage}`; if (currentType === 'anime_recent') { let lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7); url += `&air_date.gte=${lastWeek.toISOString().split('T')[0]}&air_date.lte=${new Date().toISOString().split('T')[0]}`; } } const res = await fetch(url); const data = await res.json(); let detailed = await Promise.all(data.results.filter(i => i.media_type !== 'person').map(async (i) => { try { const d = await (await fetch(`https://api.themoviedb.org/3/tv/${i.id}?api_key=${API_KEY}&language=pt-BR`)).json(); i.last_ep = d.last_episode_to_air; i.next_ep = d.next_episode_to_air; i.seasons_count = d.number_of_seasons; } catch(e){} return i; })); if (currentType === 'anime_recent') detailed = detailed.filter(i => i.last_ep).sort((a,b) => new Date(b.last_ep.air_date) - new Date(a.last_ep.air_date)); renderResults(detailed); renderPagination(data.total_pages); }
function registerOnline() { const refPath = 'online_users/' + (currentUser ? currentUser.uid : myUserId); db.ref(refPath).set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP }); db.ref(refPath).onDisconnect().remove(); db.ref('online_users').on('value', (s) => { const list = document.getElementById('onlineList'); if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${u.name}</div>`).join(''); }); }
window.loadPlayer = (id, type, title, poster, s=1, e=1) => { currentMovieData = {id, type, title, poster}; currentS = s; currentE = e; document.getElementById('catalogContent').classList.add('hidden'); document.getElementById('playerSection').classList.remove('hidden'); document.getElementById('videoTitle').innerText = title; if (type === 'tv') { document.getElementById('seriesNavigation').classList.remove('hidden'); document.getElementById('nextEpBtn').classList.remove('hidden'); fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => { document.getElementById('seasonSelect').innerHTML = d.seasons.filter(sea => sea.season_number > 0).map(sea => `<option value="${sea.season_number}" ${sea.season_number == s ? 'selected' : ''}>Temporada ${sea.season_number}</option>`).join(''); window.loadEpisodes(s, e); }); } else { document.getElementById('seriesNavigation').classList.add('hidden'); document.getElementById('nextEpBtn').classList.add('hidden'); window.reloadPlayerServer(); saveHistory(id, type, title, poster, 1, 1); } };
window.saveHistory = (id, type, title, poster, s, e) => { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); if(currentUser) db.ref(`users/${currentUser.uid}/history`).set(watchHistory.slice(0,8)); else localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); renderWatchHistory(); };
window.removeFromHistory = (e, id) => { e.stopPropagation(); watchHistory = watchHistory.filter(h => h.id !== id); if(currentUser) db.ref(`users/${currentUser.uid}/history`).set(watchHistory); else localStorage.setItem('gs_history', JSON.stringify(watchHistory)); renderWatchHistory(); };
window.sendChatMessage = () => { const input = document.getElementById('chatInput'); if(input.value.trim()) { db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP }); input.value = ''; } };
window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
window.openAuthModal = () => document.getElementById('authModal').classList.remove('hidden');
window.closeAuthModal = () => document.getElementById('authModal').classList.add('hidden');
window.handleAuth = async () => { const e = document.getElementById('authEmail').value, p = document.getElementById('authPassword').value; try { await auth.signInWithEmailAndPassword(e, p); window.closeAuthModal(); } catch (err) { try { await auth.createUserWithEmailAndPassword(e, p); window.closeAuthModal(); } catch (e2) { alert("Erro."); } } };
window.saveProfile = async () => { const n = document.getElementById('newUsername').value.trim(); if (n.length >= 3 && currentUser) { await db.ref(`users/${currentUser.uid}/profile`).set({ username: n }); location.reload(); } };
window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('closed'); document.querySelector('main').classList.toggle('sidebar-closed'); };
window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; renderWatchHistory(); };
window.setSearchType = (t, el) => { currentType = t; currentPage = 1; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if(el) el.classList.add('active'); document.getElementById('adminSection').classList.add('hidden'); document.getElementById('catalogContent').classList.remove('hidden'); fetchTrending(); };
window.openAdminPanel = () => { if(!isAdmin) return; currentType = 'admin'; document.getElementById('adminBtn').classList.add('active'); document.getElementById('adminSection').classList.remove('hidden'); document.getElementById('adminMainView').classList.remove('hidden'); document.getElementById('debtsPageView').classList.add('hidden'); document.getElementById('usersPageView').classList.add('hidden'); };
window.hideAdminSubpages = () => { document.getElementById('debtsPageView').classList.add('hidden'); document.getElementById('usersPageView').classList.add('hidden'); document.getElementById('adminMainView').classList.remove('hidden'); };
window.showDebtsPage = () => { document.getElementById('adminMainView').classList.add('hidden'); document.getElementById('debtsPageView').classList.remove('hidden'); window.renderDebts(); };
window.showUsersPage = () => { document.getElementById('adminMainView').classList.add('hidden'); document.getElementById('usersPageView').classList.remove('hidden'); renderAdminFullUserList(); };
window.adminRenameUser = (uid) => { const n = prompt("Novo nome:"); if(n) db.ref(`online_users/${uid}`).update({name: n}); };
window.adminClearChat = () => { if(confirm("Limpar chat?")) db.ref('global_chat').remove(); };
window.triggerBroadcastPrompt = () => { const m = prompt("Aviso (10s):"); if(m) db.ref('admin_broadcast').set({active: true, message: m}); };
window.addDebt = () => { const n = document.getElementById('debtName').value, v = document.getElementById('debtValue').value, p = document.getElementById('debtPriority').value; if(n && v) db.ref('admin_debts').push({name: n, value: v, priority: parseInt(p)}).then(() => { document.getElementById('debtName').value = ''; document.getElementById('debtValue').value = ''; window.showDebtsPage(); }); };
window.removeDebt = (id) => { if(confirm("Deletar conta?")) db.ref(`admin_debts/${id}`).remove(); };
window.reloadPlayerServer = () => { const srv = document.getElementById('serverSelect').value, id = currentMovieData.id; let url = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${id}`; if (currentMovieData.type === 'tv') url += `/${currentS}/${currentE}`; document.getElementById('mainPlayer').src = url; };
window.playNextEpisode = () => { if (currentE < totalEpsInSeason) window.playEpisode(currentS, currentE + 1); };
function listenToChat() { db.ref('global_chat').limitToLast(40).on('value', s => { const box = document.getElementById('chatMessages'); if(box) box.innerHTML = Object.values(s.val() || {}).map(m => `<div class="msg"><b>${m.name}:</b> ${m.text}</div>`).join(''); if(box) box.scrollTop = box.scrollHeight; }); }
function listenToBroadcast() { db.ref('admin_broadcast').on('value', (s) => { const banner = document.getElementById('broadcastBanner'); if(s.exists() && s.val().active) { document.getElementById('broadcastText').innerText = "⚠️ " + s.val().message; banner.classList.remove('hidden'); setTimeout(() => { banner.classList.add('hidden'); if(isAdmin) db.ref('admin_broadcast').update({active: false}); }, 10000); } else { banner.classList.add('hidden'); } }); }
function syncUserData() { db.ref(`users/${currentUser.uid}/history`).on('value', s => { watchHistory = s.val() || []; renderWatchHistory(); }); db.ref(`users/${currentUser.uid}/favorites`).on('value', s => { favorites = s.val() || []; if(currentType === 'favorites') renderFavorites(); }); }
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; favorites = JSON.parse(localStorage.getItem('gs_favorites')) || []; renderWatchHistory(); }
function renderFavorites() { const grid = document.getElementById('resultsGrid'); grid.innerHTML = favorites.length ? '' : '<p style="padding:20px">Vazio.</p>'; favorites.forEach(i => { const card = document.createElement('div'); card.className = 'movie-card'; card.innerHTML = `<img src="${i.poster}"><h3>${i.title}</h3>`; card.onclick = () => window.loadPlayer(i.id, i.type, i.title, i.poster); grid.appendChild(card); }); }
function updateFavBtnUI() { const btn = document.getElementById('playerFavBtn'); if(btn) btn.innerText = favorites.some(f => f.id === currentMovieData.id) ? "SALVO ❤" : "FAVORITAR"; }
window.toggleFavoriteCurrent = () => { const idx = favorites.findIndex(f => f.id === currentMovieData.id); if (idx > -1) favorites.splice(idx, 1); else favorites.unshift(currentMovieData); if(currentUser) db.ref(`users/${currentUser.uid}/favorites`).set(favorites); else localStorage.setItem('gs_favorites', JSON.stringify(favorites)); updateFavBtnUI(); };
window.checkAuthAction = (action, el) => { currentType = 'favorites'; document.querySelectorAll('.tab-btn').forEach(n => n.classList.remove('active')); el.classList.add('active'); document.getElementById('adminSection').classList.add('hidden'); window.backToHome(); renderFavorites(); };
function renderAdminFullUserList() { db.ref('online_users').on('value', snapshot => { const list = document.getElementById('adminUserFullList'); if(!list) return; list.innerHTML = ''; Object.entries(snapshot.val() || {}).forEach(([uid, u]) => { list.innerHTML += `<div class="admin-user-row" style="border-left:5px solid #3498db; background:#111; padding:15px; display:flex; justify-content:space-between;"><b>${u.name}</b><button onclick="window.adminRenameUser('${uid}')" style="background:#3498db; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Renomear</button></div>`; }); }); }
window.changePage = (p) => { currentPage = p; window.scrollTo(0,0); fetchTrending(); };
function renderPagination(total) { const container = document.getElementById('pagination'); if (currentType === 'favorites' || currentType === 'admin' || total <= 1) { container.innerHTML = ""; return; } let html = `<button class="page-btn" onclick="window.changePage(1)">«</button>`; for (let i = Math.max(1, currentPage-2); i <= Math.min(total, currentPage+2); i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`; container.innerHTML = html + `<button class="page-btn" onclick="window.changePage(${total})">»</button>`; }
window.mainSearch = () => { currentPage = 1; fetchTrending(); };
window.applyFilters = () => { currentPage = 1; fetchTrending(); };
window.changeSeason = () => { const s = document.getElementById('seasonSelect').value; window.loadEpisodes(s, 1); };