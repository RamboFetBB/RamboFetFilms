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
            currentUser = user;
            isAdmin = (user.email === 'adm@hotmail.com');
            const snap = await db.ref(`users/${user.uid}/profile`).once('value');
            if (snap.exists() && snap.val().username) {
                myNickname = snap.val().username;
            }
            document.getElementById('loginBtn').classList.add('hidden');
            document.getElementById('userProfileBtn').classList.remove('hidden');
            document.getElementById('displayUserName').innerText = myNickname;
            if (isAdmin) document.getElementById('adminBtn').classList.remove('hidden');
            syncUserData();
        } else {
            currentUser = null;
            document.getElementById('displayUserName').innerText = myNickname;
            loadLocalData();
        }
        registerOnline();
    });
    listenToChat(); fetchTrending();
};

// NOVA FUNÇÃO: SALVAR APELIDO RÁPIDO
window.saveQuickProfile = () => {
    const nick = document.getElementById('quickNickname').value.trim();
    if (nick.length < 3) return alert("Escolha um apelido com 3 letras ou mais.");
    myNickname = nick;
    localStorage.setItem('gs_nickname', nick);
    document.getElementById('displayUserName').innerText = nick;
    window.closeAuthModal();
    registerOnline();
};

window.handleAuth = async () => {
    const e = document.getElementById('authEmail').value, p = document.getElementById('authPassword').value;
    if(!e || !p) return alert("Preencha e-mail e senha para criar conta.");
    try {
        await auth.signInWithEmailAndPassword(e, p);
        window.closeAuthModal();
    } catch (err) {
        try {
            await auth.createUserWithEmailAndPassword(e, p);
            window.closeAuthModal();
        } catch (e2) { alert("Erro ao criar conta: " + e2.message); }
    }
};

window.setSearchType = (t, el) => {
    currentType = t; currentPage = 1;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(el) el.classList.add('active');
    fetchTrending();
};

async function fetchTrending() {
    let url = `https://api.themoviedb.org/3/trending/all/week?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType === 'movie') url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType === 'tv') url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=pt-BR&page=${currentPage}`;
    if (currentType === 'anime') url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=pt-BR&with_genres=16&with_origin_country=JP&page=${currentPage}`;

    const res = await fetch(url);
    const data = await res.json();
    renderResults(data.results);
}

// Funções de Registro Online e Chat mantidas...
window.registerOnline = () => {
    const ref = db.ref('online_users/' + myUserId);
    ref.set({ name: myNickname, timestamp: firebase.database.ServerValue.TIMESTAMP });
    ref.onDisconnect().remove();
    db.ref('online_users').on('value', s => {
        const list = document.getElementById('onlineList');
        if(list) list.innerHTML = Object.values(s.val() || {}).map(u => `<div>● ${u.name}</div>`).join('');
    });
};

window.toggleSidebar = () => { 
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('closed');
    document.getElementById('sidebarToggleBtn').innerText = sb.classList.contains('closed') ? "💬 CHAT" : "💬 OCULTAR";
};

// (...restante das funções preservadas conforme seu script anterior...)
window.openAuthModal = () => document.getElementById('authModal').classList.remove('hidden');
window.closeAuthModal = () => document.getElementById('authModal').classList.add('hidden');
window.handleLogout = () => { auth.signOut().then(() => window.location.reload()); };
function renderResults(res) { const grid = document.getElementById('resultsGrid'); grid.innerHTML = res.map(item => `<div class="movie-card" onclick="window.loadPlayer(${item.id}, '${item.title ? 'movie' : 'tv'}', '${item.title || item.name}')"><img src="https://image.tmdb.org/t/p/w500${item.poster_path}"><h3>${item.title || item.name}</h3></div>`).join(''); }
window.loadPlayer = (id, type, title) => { document.getElementById('catalogContent').classList.add('hidden'); document.getElementById('playerSection').classList.remove('hidden'); document.getElementById('videoTitle').innerText = title; document.getElementById('mainPlayer').src = `https://superflixapi.help/${type === 'movie' ? 'filme' : 'serie'}/${id}`; };
window.backToHome = () => { document.getElementById('catalogContent').classList.remove('hidden'); document.getElementById('playerSection').classList.add('hidden'); document.getElementById('mainPlayer').src = ""; };