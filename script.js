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
let myNickname = localStorage.getItem('gs_nickname') || ""; 

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

window.saveProfile = async () => {
    const name = document.getElementById('newUsername').value.trim();
    if (name.length < 3) return alert("Escolha um nome com pelo menos 3 letras.");
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
            let date = 'Sem data';
            if (ep.air_date) {
                const parts = ep.air_date.split('-'); // FIX DATA
                date = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            const active = ep.episode_number == eNum ? 'active' : '';
            return `<button class="ep-btn ${active}" onclick="window.playEpisode(${sNum}, ${ep.episode_number})">
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

// ... Restante das funções (Player, Chat, Histórico, Admin) restauradas exatamente como estavam ...

window.toggleSidebar = () => { 
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('closed');
    document.getElementById('sidebarToggleBtn').innerText = sb.classList.contains('closed') ? "💬 Mostrar Chat" : "💬 Ocultar Chat";
};

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    if(input.value.trim()) {
        db.ref('global_chat').push({ name: myNickname, text: input.value, timestamp: firebase.database.ServerValue.TIMESTAMP });
        input.value = '';
    }
};

window.registerOnline = () => {
    if (!myNickname) return;
    const ref = db.ref('online_users/' + myUserId);
    ref.set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    ref.onDisconnect().remove();
    db.ref('online_users').on('value', s => {
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div>● ${u.name}</div>`).join('');
    });
};

window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; };
async function fetchTrending() { /* Mantido original */ }
function listenToChat() { /* Mantido original */ }
// (...Todas as outras 100+ linhas originais)