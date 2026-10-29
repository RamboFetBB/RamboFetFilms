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
const ADMIN_EMAIL = 'rambofet@hotmail.com'; // Novo e-mail de administrador atualizado

let currentUser = null, isAdmin = false, sessionKey = Math.random().toString(36).substr(2, 9);
let currentType = 'all', currentPage = 1, totalEpsInSeason = 0;
let currentMovieData = { id: null, type: null, title: null, poster: null };
let currentS = 1, currentE = 1, watchHistory = [], favorites = [];
let currentAdjustTargetId = null;

let myUserId = localStorage.getItem('gs_userid') || ('user_' + sessionKey);
localStorage.setItem('gs_userid', myUserId);
let myNickname = localStorage.getItem('gs_nickname') || 'Convidado ' + Math.floor(Math.random() * 10000);

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

window.onload = () => {
    if (window.innerWidth <= 900) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar')?.classList.add('closed');
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const sessionRef = db.ref(`users/${user.uid}/active_session`);
            const snapshot = await sessionRef.once('value');
            if (snapshot.exists() && snapshot.val() !== sessionKey) {
                alert("Sessão encerrada: Sessão iniciada noutro dispositivo.");
                auth.signOut(); return;
            }
            sessionRef.set(sessionKey);
            sessionRef.onDisconnect().remove();

            currentUser = user; 
            isAdmin = (user.email === ADMIN_EMAIL); // Verificação com o novo e-mail adm
            document.getElementById('loginBtn')?.classList.add('hidden');
            document.getElementById('userProfileBtn')?.classList.remove('hidden');
            if (isAdmin) document.getElementById('adminBtn')?.classList.remove('hidden');
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            if (snap.exists() && snap.val().username) {
                myNickname = snap.val().username;
                const displayElem = document.getElementById('displayUserName');
                if (displayElem) displayElem.innerText = myNickname;
            } else { 
                document.getElementById('profileModal')?.classList.remove('hidden'); 
            }
            syncUserData();
        } else {
            currentUser = null; isAdmin = false; registerOnline(); loadLocalData();
        }
    });
    listenToChat(); listenToBroadcast(); fetchTrending(); fetchLastUpdate();
    loadCustomLayouts();
};

async function fetchLastUpdate() {
    const badge = document.getElementById('lastUpdateBadge');
    if (!badge) return;
    try {
        const response = await fetch('https://api.github.com/repos/RamboFetBB/RamboFetBB.github.io/commits?per_page=1');
        const data = await response.json();
        if (data && data[0] && data[0].commit) {
            const commitDate = new Date(data[0].commit.committer.date);
            const dia = String(commitDate.getDate()).padStart(2, '0');
            const mes = String(commitDate.getMonth() + 1).padStart(2, '0');
            const ano = commitDate.getFullYear();
            const horas = String(commitDate.getHours()).padStart(2, '0');
            const minutos = String(commitDate.getMinutes()).padStart(2, '0');
            badge.innerText = `v: ${dia}/${mes}/${ano} ${horas}:${minutos}`;
        } else {
            badge.innerText = '';
        }
    } catch (e) {
        badge.innerText = '';
    }
}

// Funções globais das engrenagens garantidas no objeto window
window.openLayoutAdjust = (targetId, name) => {
    currentAdjustTargetId = targetId;
    const elem = document.getElementById(targetId);
    if (!elem) return;

    const titleElem = document.getElementById('adjustTargetName');
    if (titleElem) titleElem.innerText = `Ajustar: ${name}`;
    
    const saved = JSON.parse(localStorage.getItem(`gs_layout_${targetId}`)) || {};
    
    let targetElem = elem;
    if (targetId === 'block-player') {
        targetElem = document.getElementById('playerBox') || elem;
    }

    document.getElementById('inputHeight').value = saved.height || targetElem.offsetHeight || 200;
    document.getElementById('inputPadding').value = saved.padding || 10;
    document.getElementById('inputFont').value = saved.font || 100;

    window.previewLayoutChange();
    document.getElementById('layoutAdjustModal')?.classList.remove('hidden');
};

window.closeLayoutAdjust = () => {
    document.getElementById('layoutAdjustModal')?.classList.add('hidden');
};

window.previewLayoutChange = () => {
    if (!currentAdjustTargetId) return;
    const elem = document.getElementById(currentAdjustTargetId);
    if (!elem) return;

    const h = document.getElementById('inputHeight').value;
    const p = document.getElementById('inputPadding').value;
    const f = document.getElementById('inputFont').value;

    document.getElementById('valHeight').innerText = `${h}px`;
    document.getElementById('valPadding').innerText = `${p}px`;
    document.getElementById('valFont').innerText = `${f}%`;

    if (currentAdjustTargetId === 'block-player') {
        const box = document.getElementById('playerBox');
        if (box) box.style.height = `${h}px`;
    } else {
        elem.style.height = `${h}px`;
    }
    elem.style.padding = `${p}px`;
    elem.style.fontSize = `${f}%`;
};

window.saveLayoutAdjust = () => {
    if (!currentAdjustTargetId) return;
    const h = document.getElementById('inputHeight').value;
    const p = document.getElementById('inputPadding').value;
    const f = document.getElementById('inputFont').value;

    const config = { height: h, padding: p, font: f };
    localStorage.setItem(`gs_layout_${currentAdjustTargetId}`, JSON.stringify(config));
    window.closeLayoutAdjust();
};

window.resetLayoutAdjust = () => {
    if (!currentAdjustTargetId) return;
    localStorage.removeItem(`gs_layout_${currentAdjustTargetId}`);
    const elem = document.getElementById(currentAdjustTargetId);
    if (elem) {
        elem.style.height = '';
        elem.style.padding = '';
        elem.style.fontSize = '';
        const box = document.getElementById('playerBox');
        if (box && currentAdjustTargetId === 'block-player') box.style.height = '';
    }
    window.closeLayoutAdjust();
};

function loadCustomLayouts() {
    ['block-controls', 'block-player', 'block-server', 'block-episodes'].forEach(id => {
        const saved = JSON.parse(localStorage.getItem(`gs_layout_${id}`));
        if (saved) {
            const elem = document.getElementById(id);
            if (elem) {
                if (id === 'block-player') {
                    const box = document.getElementById('playerBox');
                    if (box && saved.height) box.style.height = `${saved.height}px`;
                } else if (saved.height) {
                    elem.style.height = `${saved.height}px`;
                }
                if (saved.padding) elem.style.padding = `${saved.padding}px`;
                if (saved.font) elem.style.fontSize = `${saved.font}%`;
            }
        }
    });
}

function autoCloseSidebarOnMobile() {
    if (window.innerWidth <= 900) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
            sidebar.classList.add('closed');
        }
        document.querySelector('main')?.classList.remove('sidebar-closed');
    }
}

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (window.innerWidth <= 900) {
        sidebar.classList.toggle('open');
        sidebar.classList.toggle('closed');
    } else {
        sidebar.classList.toggle('closed');
        document.querySelector('main')?.classList.toggle('sidebar-closed');
    }
};

window.handleLogout = () => {
    if (currentUser) {
        db.ref(`users/${currentUser.uid}/active_session`).remove().then(() => {
            auth.signOut().then(() => window.location.reload());
        });
    } else { auth.signOut().then(() => window.location.reload()); }
};

window.loadEpisodes = (sNum, eNum = 1) => {
    fetch(`https://api.themoviedb.org/3/tv/${currentMovieData.id}/season/${sNum}?api_key=${API_KEY}&language=pt-BR`)
    .then(r => r.json())
    .then(d => {
        if (!d.episodes) return;
        totalEpsInSeason = d.episodes.length;
        const listElem = document.getElementById('episodeList');
        if (!listElem) return;
        listElem.innerHTML = d.episodes.map(ep => {
            let dateStr = '';
            if (ep.air_date) {
                const [ano, mes, dia] = ep.air_date.split('-');
                dateStr = `${dia}/${mes}`; 
            }
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" id="ep-btn-${ep.episode_number}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">
                EP ${ep.episode_number} <br><small style="font-size:0.6rem; opacity:0.7; pointer-events:none;">${dateStr}</small>
            </button>`;
        }).join('');
        window.playEpisode(sNum, eNum);
    });
};

function renderResults(res) {
    const grid = document.getElementById('resultsGrid'); 
    if (!grid) return; 
    grid.innerHTML = '';
    res.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-card';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750/111/fff?text=Sem+Capa';
        
        let label = item.origin_country?.includes('JP') ? 'ANIME' : (item.title ? 'FILME' : 'SÉRIE');
        const seasons = item.seasons_count ? `<div class="season-badge">${item.seasons_count} Temp.</div>` : ''; 
        
        let info = ""; 
        if (item.last_ep) {
            const [y, m, d] = item.last_ep.air_date.split('-');
            const next = item.next_ep ? `<br>Próx: ${item.next_ep.air_date.split('-').reverse().join('/')}` : '<br>Finalizado';
            info = `<div class="release-info" style="pointer-events:none;">Último: EP ${item.last_ep.episode_number} (${d}/${m}/${y})${next}</div>`;
        }
        
        const titleSafe = escapeHtml(item.title || item.name);
        card.innerHTML = `<div class="type-badge">${label}</div>${seasons}<div class="poster-container"><img src="${poster}">${info}</div><h3 style="pointer-events:none;">${titleSafe}</h3>`;
        card.onclick = () => window.loadPlayer(item.id, item.title ? 'movie' : 'tv', item.title || item.name, poster);
        grid.appendChild(card);
    });
}

function renderWatchHistory() {
    const grid = document.getElementById('historyGrid');
    if (!grid) return;
    if (watchHistory.length > 0 && currentType !== 'favorites' && currentType !== 'admin') {
        document.getElementById('continueWatchingSection')?.classList.remove('hidden');
        grid.innerHTML = watchHistory.map(i => {
            const label = i.type === 'tv' ? `ESTOU NO: T${i.s}:E${i.e}` : 'FILME'; 
            const titleSafe = escapeHtml(i.title);
            return `
            <div class="movie-card" onclick="window.loadPlayer(${i.id},'${i.type}','${i.title}','${i.poster}',${i.s},${i.e})">
                <button class="remove-history" onclick="window.removeFromHistory(event, ${i.id})">X</button>
                <div class="poster-container">
                    <img src="${i.poster}">
                    <div class="release-info" style="background: rgba(229,9,20,0.95); color: white; pointer-events: none; font-weight: bold;">${label}</div>
                </div>
                <h3 style="pointer-events: none;">${titleSafe}</h3>
            </div>`;
        }).join('');
    } else document.getElementById('continueWatchingSection')?.classList.add('hidden');
}

window.renderDebts = () => {
    db.ref('admin_debts').on('value', s => {
        const list = document.getElementById('adminDebtList'), totalDisp = document.getElementById('totalDebtDisplay');
        if (!list || !totalDisp) return;
        let total = 0; list.innerHTML = '';
        if(s.exists()) {
            const arr = Object.entries(s.val()).map(([id, d]) => ({id, ...d})).sort((a,b) => (b.priority || 0) - (a.priority || 0));
            arr.forEach(d => {
                const val = parseFloat(String(d.value).replace(',','.')) || 0; total += val;
                let color = d.priority == 3 ? '#e50914' : (d.priority == 2 ? '#f1c40f' : '#3498db');
                const nameSafe = escapeHtml(d.name);
                list.innerHTML += `<div class="admin-user-row" style="border-left: 6px solid ${color};">
                    <div><b>${nameSafe}</b><br><span style="color:#2ecc71; font-weight:900">R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                    <button onclick="window.removeDebt('${d.id}')" style="background:#e74c3c; border:none; padding:8px; border-radius:4px; cursor:pointer; color:white;">APAGAR</button>
                </div>`;
            });
        }
        totalDisp.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`; 
    });
};

window.openTicketModal = () => document.getElementById('ticketModal')?.classList.remove('hidden');
window.closeTicketModal = () => document.getElementById('ticketModal')?.classList.add('hidden');
window.submitTicket = () => {
    const msg = document.getElementById('ticketMessage')?.value.trim();
    if (!msg) return alert('Por favor, descreve o problema antes de enviar.');
    db.ref('tickets').push({
        user: myNickname,
        uid: currentUser ? currentUser.uid : myUserId,
        message: msg,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        alert('O teu ticket foi enviado para a administração com sucesso!');
        const inputElem = document.getElementById('ticketMessage');
        if (inputElem) inputElem.value = '';
        window.closeTicketModal();
    });
};

window.showTicketsPage = () => {
    document.getElementById('adminMainView')?.classList.add('hidden');
    document.getElementById('ticketsPageView')?.classList.remove('hidden');
    window.renderTickets();
};

window.renderTickets = () => {
    db.ref('tickets').on('value', s => {
        const list = document.getElementById('adminTicketList');
        if (!list) return;
        list.innerHTML = '';
        if(s.exists()) {
            const arr = Object.entries(s.val()).map(([id, d]) => ({id, ...d})).sort((a,b) => b.timestamp - a.timestamp);
            arr.forEach(t => {
                const date = new Date(t.timestamp).toLocaleString('pt-BR');
                const userSafe = escapeHtml(t.user);
                const msgSafe = escapeHtml(t.message);
                list.innerHTML += `<div class="admin-user-row" style="border-left: 6px solid #9b59b6; flex-direction:column; gap:10px; align-items:flex-start;">
                    <div style="width:100%; display:flex; justify-content:space-between; border-bottom:1px solid #333; padding-bottom:10px;">
                        <b>${userSafe}</b> <span style="font-size:0.7rem; color:#888;">${date}</span>
                    </div>
                    <p style="font-size:0.9rem; color:#ccc; word-break:break-word; width: 100%;">${msgSafe}</p>
                    <button onclick="window.resolveTicket('${t.id}')" style="background:#27ae60; border:none; padding:8px; border-radius:4px; cursor:pointer; color:white; width:100%; font-weight:bold;">MARCAR COMO RESOLVIDO</button>
                </div>`;
            });
        } else {
            list.innerHTML = '<p style="color:#aaa;">Nenhum ticket aberto no momento.</p>';
        }
    });
};

window.resolveTicket = (id) => {
    if(confirm("Marcar este ticket como resolvido e apagar?")) db.ref(`tickets/${id}`).remove();
};

window.playEpisode = (s, e) => { 
    currentS = s; currentE = e; 
    window.reloadPlayerServer(); 
    document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active')); 
    const target = document.getElementById(`ep-btn-${e}`); 
    if (target) target.classList.add('active'); 
    saveHistory(currentMovieData.id, 'tv', currentMovieData.title, currentMovieData.poster, s, e); 
};

async function fetchTrending() { 
    if (currentType === 'favorites' || currentType === 'admin') return; 
    const q = document.getElementById('searchInput')?.value || ''; 
    let url = `https://api.themoviedb.org/3/discover/${currentType.includes('movie')?'movie':'tv'}?api_key=${API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${currentPage}`; 
    if (!q && currentType === 'all') url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`; 
    if (q) url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${q}&language=pt-BR&page=${currentPage}`; 
    if (currentType.includes('anime')) { 
        url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=pt-BR&with_genres=16&with_origin_country=JP&page=${currentPage}`; 
        if (currentType === 'anime_recent') { 
            let lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7); 
            url += `&air_date.gte=${lastWeek.toISOString().split('T')[0]}&air_date.lte=${new Date().toISOString().split('T')[0]}`; 
        } 
    } 
    const res = await fetch(url); const data = await res.json(); 
    let detailed = await Promise.all((data.results || []).filter(i => i.media_type !== 'person').map(async (i) => { 
        try { 
            const d = await (await fetch(`https://api.themoviedb.org/3/tv/${i.id}?api_key=${API_KEY}&language=pt-BR`)).json(); 
            i.last_ep = d.last_episode_to_air; i.next_ep = d.next_episode_to_air; i.seasons_count = d.number_of_seasons; 
        } catch(e){} 
        return i; 
    })); 
    if (currentType === 'anime_recent') detailed = detailed.filter(i => i.last_ep).sort((a,b) => new Date(b.last_ep.air_date) - new Date(a.last_ep.air_date)); 
    renderResults(detailed); renderPagination(data.total_pages || 1); 
}

function registerOnline() { 
    const refPath = 'online_users/' + (currentUser ? currentUser.uid : myUserId); 
    db.ref(refPath).set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP }); 
    db.ref(refPath).onDisconnect().remove(); 
    db.ref('online_users').on('value', (s) => { 
        const list = document.getElementById('onlineList'); 
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div class="online-user"><span class="online-dot"></span> ${escapeHtml(u.name)}</div>`).join(''); 
    }); 
}

window.loadPlayer = (id, type, title, poster, s=1, e=1) => { 
    autoCloseSidebarOnMobile();
    currentMovieData = {id, type, title, poster}; currentS = s; currentE = e; 
    document.getElementById('catalogContent')?.classList.add('hidden'); 
    document.getElementById('playerSection')?.classList.remove('hidden'); 
    
    const titleElem = document.getElementById('videoTitle');
    if (titleElem) titleElem.innerText = title; 
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (type === 'tv') { 
        document.getElementById('seriesNavigation')?.classList.remove('hidden'); 
        document.getElementById('nextEpBtn')?.classList.remove('hidden'); 
        fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=pt-BR`).then(r => r.json()).then(d => { 
            if (!d.seasons) return;
            const selectElem = document.getElementById('seasonSelect');
            if (selectElem) selectElem.innerHTML = d.seasons.filter(sea => sea.season_number > 0).map(sea => `<option value="${sea.season_number}" ${sea.season_number == s ? 'selected' : ''}>Temporada ${sea.season_number}</option>`).join(''); 
            window.loadEpisodes(s, e); 
        }); 
    } else { 
        document.getElementById('seriesNavigation')?.classList.add('hidden'); 
        document.getElementById('nextEpBtn')?.classList.add('hidden'); 
        window.reloadPlayerServer(); saveHistory(id, type, title, poster, 1, 1); 
    } 
};

window.saveHistory = (id, type, title, poster, s, e) => { watchHistory = watchHistory.filter(h => h.id !== id); watchHistory.unshift({id, type, title, poster, s, e}); if(currentUser) db.ref(`users/${currentUser.uid}/history`).set(watchHistory.slice(0,8)); else localStorage.setItem('gs_history', JSON.stringify(watchHistory.slice(0,8))); renderWatchHistory(); };
window.removeFromHistory = (e, id) => { e.stopPropagation(); watchHistory = watchHistory.filter(h => h.id !== id); if(currentUser) db.ref(`users/${currentUser.uid}/history`).set(watchHistory); else localStorage.setItem('gs_history', JSON.stringify(watchHistory)); renderWatchHistory(); };

window.sendChatMessage = () => { 
    const input = document.getElementById('chatInput'); 
    if(input && input.value.trim()) { 
        db.ref('global_chat').push({ name: myNickname, text: input.value.trim(), timestamp: firebase.database.ServerValue.TIMESTAMP }); 
        input.value = ''; 
    } 
};

window.handleChatKey = (e) => { if(e.key === 'Enter') window.sendChatMessage(); };
window.openAuthModal = () => document.getElementById('authModal')?.classList.remove('hidden');
window.closeAuthModal = () => document.getElementById('authModal')?.classList.add('hidden');

window.handleAuth = async () => { 
    const e = document.getElementById('authEmail')?.value.trim();
    const p = document.getElementById('authPassword')?.value.trim(); 

    if (!e || !p) {
        alert("Preenche o e-mail e a palavra-passe!");
        return;
    }

    try { 
        await auth.signInWithEmailAndPassword(e, p); 
        window.closeAuthModal(); 
    } catch (err) { 
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            try {
                await auth.createUserWithEmailAndPassword(e, p);
                window.closeAuthModal();
                alert("Nova conta criada com sucesso!");
            } catch (createErr) {
                alert("Erro ao criar conta: " + createErr.message);
            }
        } else {
            alert("Erro no login: " + err.message);
        }
    } 
};

window.forgotPassword = async () => {
    const e = document.getElementById('authEmail')?.value.trim();
    if (!e) {
        alert("Insere primeiro o teu e-mail no campo acima!");
        return;
    }
    try {
        await auth.sendPasswordResetEmail(e);
        alert("E-mail de recuperação enviado com sucesso! Verifica a tua caixa de entrada.");
    } catch (err) {
        alert("Erro ao enviar e-mail de recuperação: " + err.message);
    }
};

window.saveProfile = async () => { const n = document.getElementById('newUsername')?.value.trim(); if (n && n.length >= 3 && currentUser) { await db.ref(`users/${currentUser.uid}/profile`).set({ username: n }); location.reload(); } };
window.backToHome = () => { document.getElementById('catalogContent')?.classList.remove('hidden'); document.getElementById('playerSection')?.classList.add('hidden'); const player = document.getElementById('mainPlayer'); if(player) player.src = ""; renderWatchHistory(); };

window.setSearchType = (t, el) => { 
    currentType = t; currentPage = 1; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    if(el) el.classList.add('active'); 
    document.getElementById('adminSection')?.classList.add('hidden'); 
    document.getElementById('catalogContent')?.classList.remove('hidden'); 
    autoCloseSidebarOnMobile();
    fetchTrending(); 
};

window.openAdminPanel = () => { if(!isAdmin) return; currentType = 'admin'; document.getElementById('adminBtn')?.classList.add('active'); document.getElementById('adminSection')?.classList.remove('hidden'); document.getElementById('adminMainView')?.classList.remove('hidden'); document.getElementById('debtsPageView')?.classList.add('hidden'); document.getElementById('usersPageView')?.classList.add('hidden'); document.getElementById('ticketsPageView')?.classList.add('hidden'); autoCloseSidebarOnMobile(); };
window.hideAdminSubpages = () => { document.getElementById('debtsPageView')?.classList.add('hidden'); document.getElementById('usersPageView')?.classList.add('hidden'); document.getElementById('ticketsPageView')?.classList.add('hidden'); document.getElementById('adminMainView')?.classList.remove('hidden'); };
window.showDebtsPage = () => { document.getElementById('adminMainView')?.classList.add('hidden'); document.getElementById('debtsPageView')?.classList.remove('hidden'); window.renderDebts(); };
window.showUsersPage = () => { document.getElementById('adminMainView')?.classList.add('hidden'); document.getElementById('usersPageView')?.classList.remove('hidden'); renderAdminFullUserList(); };
window.adminRenameUser = (uid) => { const n = prompt("Novo nome:"); if(n) db.ref(`online_users/${uid}`).update({name: n}); };
window.adminClearChat = () => { if(confirm("Limpar chat?")) db.ref('global_chat').remove(); };
window.triggerBroadcastPrompt = () => { const m = prompt("Aviso (10s):"); if(m) db.ref('admin_broadcast').set({active: true, message: m}); };
window.addDebt = () => { const n = document.getElementById('debtName')?.value, v = document.getElementById('debtValue')?.value, p = document.getElementById('debtPriority')?.value; if(n && v) db.ref('admin_debts').push({name: n, value: v, priority: parseInt(p)}).then(() => { if(document.getElementById('debtName')) document.getElementById('debtName').value = ''; if(document.getElementById('debtValue')) document.getElementById('debtValue').value = ''; window.showDebtsPage(); }); };
window.removeDebt = (id) => { if(confirm("Apagar conta?")) db.ref(`admin_debts/${id}`).remove(); };

window.reloadPlayerServer = () => { 
    const srvElem = document.getElementById('serverSelect');
    if (!srvElem) return;
    const srv = srvElem.value;
    const id = currentMovieData.id; 
    let targetUrl = srv === 'superflix' ? `https://superflixapi.help/${currentMovieData.type === 'movie' ? 'filme' : 'serie'}/${id}` : `https://embed.su/embed/${currentMovieData.type === 'movie' ? 'movie' : 'tv'}/${id}`; 
    if (currentMovieData.type === 'tv') targetUrl += `/${currentS}/${currentE}`; 

    const blobHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="referrer" content="no-referrer">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
                * { box-sizing: border-box; }
                html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; }
                iframe { width:100%; height:100%; border:0; display:block; }
            </style>
        </head>
        <body>
            <iframe src="${targetUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
        </body>
        </html>
    `;

    const blob = new Blob([blobHtml], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const playerElem = document.getElementById('mainPlayer');
    if (playerElem) playerElem.src = blobUrl;
};

window.playNextEpisode = () => { if (currentE < totalEpsInSeason) window.playEpisode(currentS, currentE + 1); };

function listenToChat() { 
    db.ref('global_chat').limitToLast(40).on('value', s => { 
        const box = document.getElementById('chatMessages'); 
        if(!box) return;
        box.innerHTML = Object.values(s.val() || {}).map(m => {
            const safeName = escapeHtml(m.name || 'Anónimo');
            const safeText = escapeHtml(m.text || '');
            return `<div class="msg"><b>${safeName}:</b> ${safeText}</div>`;
        }).join(''); 
        box.scrollTop = box.scrollHeight; 
    }); 
}

function listenToBroadcast() { db.ref('admin_broadcast').on('value', (s) => { const banner = document.getElementById('broadcastBanner'); if (!banner) return; if(s.exists() && s.val().active) { const txtElem = document.getElementById('broadcastText'); if (txtElem) txtElem.innerText = "⚠️ " + s.val().message; banner.classList.remove('hidden'); setTimeout(() => { banner.classList.add('hidden'); if(isAdmin) db.ref('admin_broadcast').update({active: false}); }, 10000); } else { banner.classList.add('hidden'); } }); }
function syncUserData() { db.ref(`users/${currentUser.uid}/history`).on('value', s => { watchHistory = s.val() || []; renderWatchHistory(); }); db.ref(`users/${currentUser.uid}/favorites`).on('value', s => { favorites = s.val() || []; if(currentType === 'favorites') renderFavorites(); }); }
function loadLocalData() { watchHistory = JSON.parse(localStorage.getItem('gs_history')) || []; favorites = JSON.parse(localStorage.getItem('gs_favorites')) || []; renderWatchHistory(); }

function renderFavorites() { 
    const grid = document.getElementById('resultsGrid'); 
    if(!grid) return; 
    grid.innerHTML = favorites.length ? '' : '<p style="padding:20px">Vazio.</p>'; 
    favorites.forEach(i => { 
        const card = document.createElement('div'); 
        card.className = 'movie-card'; 
        const titleSafe = escapeHtml(i.title);
        card.innerHTML = `<img src="${i.poster}"><h3>${titleSafe}</h3>`; 
        card.onclick = () => window.loadPlayer(i.id, i.type, i.title, i.poster); 
        grid.appendChild(card); 
    }); 
}

function updateFavBtnUI() { const btn = document.getElementById('playerFavBtn'); if(btn) btn.innerText = favorites.some(f => f.id === currentMovieData.id) ? "SALVO ❤" : "FAVORITAR"; }
window.toggleFavoriteCurrent = () => { const idx = favorites.findIndex(f => f.id === currentMovieData.id); if (idx > -1) favorites.splice(idx, 1); else favorites.unshift(currentMovieData); if(currentUser) db.ref(`users/${currentUser.uid}/favorites`).set(favorites); else localStorage.setItem('gs_favorites', JSON.stringify(favorites)); updateFavBtnUI(); };
window.checkAuthAction = (action, el) => { currentType = 'favorites'; document.querySelectorAll('.tab-btn').forEach(n => n.classList.remove('active')); if(el) el.classList.add('active'); document.getElementById('adminSection')?.classList.add('hidden'); window.backToHome(); renderFavorites(); autoCloseSidebarOnMobile();};

function renderAdminFullUserList() { db.ref('online_users').on('value', snapshot => { const list = document.getElementById('adminUserFullList'); if(!list) return; list.innerHTML = ''; Object.entries(snapshot.val() || {}).forEach(([uid, u]) => { const nameSafe = escapeHtml(u.name); list.innerHTML += `<div class="admin-user-row" style="border-left:5px solid #3498db;"><b>${nameSafe}</b><button onclick="window.adminRenameUser('${uid}')" style="background:#3498db; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; color:white;">Renomear</button></div>`; }); }); }
window.changePage = (p) => { currentPage = p; window.scrollTo(0,0); fetchTrending(); };

function renderPagination(total) { 
    const container = document.getElementById('pagination'); 
    if (!container || currentType === 'favorites' || currentType === 'admin' || total <= 1) { 
        if(container) container.innerHTML = ""; 
        return; 
    } 
    let html = `<button class="page-btn" onclick="window.changePage(1)">«</button>`; 
    for (let i = Math.max(1, currentPage-2); i <= Math.min(total, currentPage+2); i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`; 
    }
    container.innerHTML = html + `<button class="page-btn" onclick="window.changePage(${total})">»</button>`; 
}

window.mainSearch = () => { currentPage = 1; fetchTrending(); };
window.applyFilters = () => { currentPage = 1; fetchTrending(); };
window.changeSeason = () => { const s = document.getElementById('seasonSelect')?.value; if(s) window.loadEpisodes(s, 1); };
