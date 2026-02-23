// ═══════════════════════════════════════════════════
// EFT TRACKER — app.js
// Kappa + Hideout tracker using tarkov.dev GraphQL API
// ═══════════════════════════════════════════════════

const API_URL = 'https://api.tarkov.dev/graphql';
const KAPPA_STORAGE = 'kappa_tracker_v2';
const HIDEOUT_STORAGE = 'hideout_tracker_v1';
const HIDEOUT_INVENTORY_STORAGE = 'hideout_inventory_v2';
const QUEST_STORAGE = 'quest_tracker_v1';

// DOM Helpers for robustness
const getEl = (id) => document.getElementById(id);
const setTxt = (id, txt) => { const el = getEl(id); if (el) el.textContent = txt; };
const setHtml = (id, html) => { const el = getEl(id); if (el) el.innerHTML = html; };
const setDisp = (id, s) => { const el = getEl(id); if (el) el.style.display = s; };

// ═══════ API CACHE ═══════
async function fetchWithCache(query, cacheKey, ttlHours = 24) {
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < ttlHours * 60 * 60 * 1000) {
        return parsed.data;
      }
    } catch (e) { }
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);

  localStorage.setItem(cacheKey, JSON.stringify({
    timestamp: Date.now(),
    data: data.data
  }));
  return data.data;
}

// SVG checkmark
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// Station icons map
const STATION_ICONS = {
  'Air Filtering Unit': 'Air_Filtering_Unit_Portrait.webp', 'Bitcoin Farm': 'Bitcoin_Farm_Portrait.webp', 'Booze Generator': 'Booze_Generator_Portrait.webp',
  'Generator': 'Generator_Portrait.webp', 'Gym': 'Gym_Portrait.webp', 'Heating': 'Heating_Portrait.webp', 'Illumination': 'Illumination_Portrait.webp',
  'Intelligence Center': 'Intelligence_Center_Portrait.webp', 'Lavatory': 'Lavatory_Portrait.webp', 'Library': 'Library_Portrait.webp',
  'Medstation': 'Medstation_Portrait.webp', 'Nutrition Unit': 'Nutrition_Unit_Portrait.webp', 'Rest Space': 'Rest_Space_Portrait.webp',
  'Scav Case': 'Scav_Case_Portrait.webp', 'Security': 'Security_Portrait.webp', 'Shooting Range': 'Shooting_Range_Portrait.webp',
  'Solar Power': 'Solar_power_Portrait.webp', 'Stash': 'Stash_Portrait.webp', 'Vents': 'Vents_Portrait.webp',
  'Water Collector': 'Water_Collector_Portrait.webp', 'Workbench': 'Workbench_Portrait.webp', 'Christmas Tree': 'Christmas_Tree_Portrait.webp',
  'Hall of Fame': 'Hall_of_Fame_Portrait.webp', 'Defective Wall': 'Defective_Wall_Portrait.webp', 'Cultist Circle': 'Cultist_Circle_Portrait.webp',
  'Gear Rack': 'Gear_Rack_Portrait.webp', 'Weapon Rack': 'Weapon_Rack_Portrait.webp',
};
function stationIcon(name) { return STATION_ICONS[name] || '🏗️'; }

// ═══════ STATE ═══════
let currentPage = 'home';
let kappaItems = [];
let kappaFound = new Set();
let kappaFilter = 'all';
let kappaSearch = '';
let hideoutStations = [];
let hideoutBuilt = new Set();
let hideoutItemsInventory = {};
let consolidatedHideoutItems = [];
let hideoutItemsFilter = 'all';
let hideoutItemsSearch = '';
let hideoutCurrentView = 'stations';
let selectedStation = null;

// Quest state
let quests = [];
let questsCompleted = new Set();
let playerLevel = 1;
let targetQuestId = null;

const TRADER_ORDER = [
  'Prapor', 'Therapist', 'Fence', 'Skier', 'Peacekeeper', 'Mechanic',
  'Ragman', 'Jaeger', 'Ref', 'Lightkeeper', 'BTR Driver'
];
let questFilter = 'all';
let questSearch = '';
let activeTraderFilter = 'all';
let selectedQuest = null;

// Modal state
let currentModalItem = null;

// ═══════ AUTH & PROFILE STATE ═══════
let authToken = localStorage.getItem('eft_auth_token') || null;
let currentUser = null; // { id, username }
let allProfiles = []; // Array of all user profiles from server
let viewingProfileId = null; // ID of profile currently being viewed
let isReadOnly = false; // true when viewing another user's profile

// ═══════ STORAGE ═══════
function saveKappa() {
  localStorage.setItem(KAPPA_STORAGE, JSON.stringify([...kappaFound]));
  syncProfileToServer();
}
function loadKappa_storage() { try { const s = localStorage.getItem(KAPPA_STORAGE); if (s) kappaFound = new Set(JSON.parse(s)); } catch { } }
function saveHideout() {
  localStorage.setItem(HIDEOUT_STORAGE, JSON.stringify([...hideoutBuilt]));
  syncProfileToServer();
}
function loadHideout_storage() { try { const s = localStorage.getItem(HIDEOUT_STORAGE); if (s) hideoutBuilt = new Set(JSON.parse(s)); } catch { } }
function saveHideoutInventory() {
  localStorage.setItem(HIDEOUT_INVENTORY_STORAGE, JSON.stringify(hideoutItemsInventory));
  syncProfileToServer();
}
function loadHideoutInventory_storage() {
  try {
    const s = localStorage.getItem(HIDEOUT_INVENTORY_STORAGE);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        hideoutItemsInventory = {};
        parsed.forEach(id => hideoutItemsInventory[id] = 1);
      } else {
        hideoutItemsInventory = parsed;
      }
    }
  } catch { }
}
function saveQuests() {
  localStorage.setItem(QUEST_STORAGE, JSON.stringify({
    completed: [...questsCompleted],
    level: playerLevel,
    target: targetQuestId
  }));
  syncProfileToServer();
}
function loadQuests_storage() {
  try {
    const s = localStorage.getItem(QUEST_STORAGE);
    if (s) {
      const data = JSON.parse(s);
      if (Array.isArray(data)) {
        questsCompleted = new Set(data);
      } else {
        questsCompleted = new Set(data.completed || []);
        playerLevel = data.level || 1;
        targetQuestId = data.target || null;
      }
    }
  } catch { }
}

// Sync current state to server (debounced)
let _syncTimeout = null;
function syncProfileToServer() {
  if (!authToken || isReadOnly) return;
  clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          kappa_found: [...kappaFound],
          hideout_built: [...hideoutBuilt],
          hideout_inventory: hideoutItemsInventory,
          quests_completed: [...questsCompleted],
          player_level: playerLevel,
          target_quest_id: targetQuestId
        })
      });
    } catch (e) {
      console.warn('Error syncing profile:', e);
    }
  }, 500);
}

// ═══════ AUTH FUNCTIONS ═══════
function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('active');
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';

  // Limpiar campos
  document.getElementById('login-password').value = '';
  document.getElementById('register-username').value = '';
  document.getElementById('register-password').value = '';
  document.getElementById('register-password2').value = '';

  updateLoginFieldVisibility();
  switchAuthTab('login');
}

function updateLoginFieldVisibility() {
  const userFieldContainer = document.getElementById('login-username').parentElement;
  const usernameInput = document.getElementById('login-username');
  const modalSub = document.getElementById('auth-modal').querySelector('.auth-modal-sub');

  // Intentar obtener el usuario del perfil seleccionado
  const selectedProfile = allProfiles.find(p => p.id == viewingProfileId);

  if (selectedProfile && !currentUser) {
    usernameInput.value = selectedProfile.username;
    userFieldContainer.style.display = 'none'; // ocultar campo de usuario
    modalSub.innerHTML = `Iniciando sesión como <strong>${selectedProfile.username}</strong> <br> <a href="#" onclick="showUsernameField(); return false;" style="color:var(--gold); font-size:0.8rem; text-decoration:underline; margin-top:5px; display:inline-block;">¿No eres tú? Cambiar usuario</a>`;
    setTimeout(() => document.getElementById('login-password').focus(), 50);
  } else {
    usernameInput.value = '';
    userFieldContainer.style.display = 'block'; // mostrar campo de usuario
    modalSub.textContent = 'Inicia sesión o crea una cuenta para guardar tu progreso';
    setTimeout(() => usernameInput.focus(), 50);
  }
}

function showUsernameField() {
  const userFieldContainer = document.getElementById('login-username').parentElement;
  const usernameInput = document.getElementById('login-username');
  const modalSub = document.getElementById('auth-modal').querySelector('.auth-modal-sub');

  usernameInput.value = '';
  userFieldContainer.style.display = 'block';
  modalSub.textContent = 'Inicia sesión con otra cuenta';
  usernameInput.focus();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
}

function switchAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('auth-form-register').style.display = tab === 'register' ? 'block' : 'none';

  if (tab === 'login') {
    updateLoginFieldVisibility();
  } else {
    document.getElementById('auth-modal').querySelector('.auth-modal-sub').textContent = 'Crea una cuenta nueva para guardar tu progreso';
  }
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  if (!username || !password) { document.getElementById('login-error').textContent = 'Completa todos los campos'; return; }
  document.getElementById('btn-login').disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
      throw e;
    }

    if (!res.ok) throw new Error(data.error || 'Error de login');
    authToken = data.token;
    currentUser = data.user;
    viewingProfileId = currentUser.id;  // ← fijar perfil propio
    isReadOnly = false;                  // ← nunca es solo lectura propio perfil
    localStorage.setItem('eft_auth_token', authToken);
    closeAuthModal();
    toast(`¡Bienvenido, ${currentUser.username}!`, 't-found');
    // Load own profile data from server
    await loadProfileFromServer(currentUser.id);
    await loadAllProfiles();
    updateAuthUI();
    updateHomeMini();
  } catch (e) {
    document.getElementById('login-error').textContent = e.message;
  } finally {
    document.getElementById('btn-login').disabled = false;
  }
}

async function doRegister() {
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const password2 = document.getElementById('register-password2').value;
  document.getElementById('register-error').textContent = '';
  if (!username || !password || !password2) { document.getElementById('register-error').textContent = 'Completa todos los campos'; return; }
  if (password !== password2) { document.getElementById('register-error').textContent = 'Las contraseñas no coinciden'; return; }
  document.getElementById('btn-register').disabled = true;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
      throw e;
    }

    if (!res.ok) throw new Error(data.error || 'Error de registro');
    authToken = data.token;
    currentUser = data.user;
    viewingProfileId = currentUser.id;  // ← fijar perfil propio
    isReadOnly = false;                  // ← nunca es solo lectura propio perfil
    localStorage.setItem('eft_auth_token', authToken);
    closeAuthModal();
    toast(`Cuenta creada. ¡Bienvenido, ${currentUser.username}!`, 't-found');
    // Sync current local data to the new account
    await syncProfileToServerImmediate();
    await loadAllProfiles();
    updateAuthUI();
  } catch (e) {
    document.getElementById('register-error').textContent = e.message;
  } finally {
    document.getElementById('btn-register').disabled = false;
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('eft_auth_token');
  // Switch back to own local data
  viewingProfileId = null;
  isReadOnly = false;
  loadKappa_storage();
  loadHideout_storage();
  loadHideoutInventory_storage();
  toast('Sesión cerrada', 't-unfound');
  updateAuthUI();
  updateHomeMini();
  refreshCurrentPage();
}

async function syncProfileToServerImmediate() {
  if (!authToken) return;
  try {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({
        kappa_found: [...kappaFound],
        hideout_built: [...hideoutBuilt],
        hideout_inventory: hideoutItemsInventory,
        quests_completed: [...questsCompleted],
        player_level: playerLevel,
        target_quest_id: targetQuestId
      })
    });
  } catch (e) {
    console.warn('Error syncing:', e);
  }
}

async function loadProfileFromServer(profileId) {
  try {
    const res = await fetch(`/api/profiles/${profileId}`);
    if (!res.ok) return;
    const profile = await res.json();
    kappaFound = new Set(profile.kappa_found || []);
    hideoutBuilt = new Set(profile.hideout_built || []);
    hideoutItemsInventory = profile.hideout_inventory || {};
    questsCompleted = new Set(profile.quests_completed || []);
    playerLevel = profile.player_level || 1;
    targetQuestId = profile.target_quest_id || null;
    // Also update localStorage
    localStorage.setItem(KAPPA_STORAGE, JSON.stringify([...kappaFound]));
    localStorage.setItem(HIDEOUT_STORAGE, JSON.stringify([...hideoutBuilt]));
    localStorage.setItem(HIDEOUT_INVENTORY_STORAGE, JSON.stringify(hideoutItemsInventory));
    localStorage.setItem(QUEST_STORAGE, JSON.stringify({
      completed: [...questsCompleted],
      level: playerLevel,
      target: targetQuestId
    }));

  } catch (e) {
    console.warn('Error loading profile:', e);
  }
}

async function loadAllProfiles() {
  try {
    const res = await fetch('/api/profiles');
    if (!res.ok) return;
    allProfiles = await res.json();
    updateProfileSelectors();
  } catch (e) {
    console.warn('Error loading profiles:', e);
    allProfiles = [];
  }
}

function updateProfileSelectors() {
  const selects = [document.getElementById('home-profile-select'), document.getElementById('header-profile-select')];
  const activeId = viewingProfileId || (currentUser ? currentUser.id : null);
  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    if (allProfiles.length === 0) {
      sel.innerHTML = '<option value="">\u2014 Sin perfiles \u2014</option>';
      return;
    }
    allProfiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.username + (currentUser && p.id === currentUser.id ? ' (Tú)' : '');
      if (activeId && p.id == activeId) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

async function switchProfile(profileId) {
  if (!profileId) return;
  profileId = parseInt(profileId, 10);
  viewingProfileId = profileId;

  // Determinar si es solo lectura comparando como números
  const myId = currentUser ? parseInt(currentUser.id, 10) : null;
  isReadOnly = !(myId !== null && myId === profileId);
  console.log('[switchProfile] profileId:', profileId, 'myId:', myId, 'isReadOnly:', isReadOnly);

  // Load that profile's data
  const profile = allProfiles.find(p => p.id === profileId);
  if (profile) {
    kappaFound = new Set(profile.kappa_found || []);
    hideoutBuilt = new Set(profile.hideout_built || []);
    hideoutItemsInventory = profile.hideout_inventory || {};
    questsCompleted = new Set(profile.quests_completed || []);
    playerLevel = profile.player_level || 1;
    targetQuestId = profile.target_quest_id || null;
    if (getEl('player-level-input')) getEl('player-level-input').value = playerLevel;
    renderQuestTarget();
  } else {
    await loadProfileFromServer(profileId);
  }

  updateProfileSelectors();
  updateAuthUI();
  updateHomeMini();
  refreshCurrentPage();
}

function refreshCurrentPage() {
  if (currentPage === 'kappa' && kappaItems.length) {
    updateKappaStats(); renderKappa();
  } else if (currentPage === 'hideout' && hideoutStations.length) {
    consolidateHideoutItems();
    updateHideoutStats();
    if (hideoutCurrentView === 'stations') {
      if (selectedStation) { renderLevels(); }
      else { renderStationsGrid(); }
    } else {
      renderHideoutItemsView();
    }
  } else if (currentPage === 'quests' && quests.length) {
    updateQuestStats();
    renderQuests();
  }
}

function updateAuthUI() {
  const btnAuth = document.getElementById('btn-auth-home');
  const btnLogout = document.getElementById('btn-logout-home');
  if (currentUser) {
    btnAuth.innerHTML = `👤 ${currentUser.username}`;
    btnAuth.classList.add('logged-in');
    btnAuth.onclick = null;
    btnAuth.style.cursor = 'default';
    btnLogout.style.display = 'inline-block';
  } else {
    btnAuth.innerHTML = '🔑 INICIAR SESIÓN';
    btnAuth.classList.remove('logged-in');
    btnAuth.onclick = openAuthModal;
    btnAuth.style.cursor = 'pointer';
    btnLogout.style.display = 'none';
  }
  // Update read-only state for visible elements
  updateReadOnlyUI();
}

function updateReadOnlyUI() {
  const viewingUser = allProfiles.find(p => p.id === viewingProfileId);
  const viewingName = viewingUser ? viewingUser.username : '';

  // Show/hide a read-only indicator on the page
  document.querySelectorAll('.btn-mark-built, .btn-reset, #btn-reset').forEach(el => {
    if (isReadOnly) {
      el.style.opacity = '0.4';
      el.style.pointerEvents = 'none';
    } else {
      el.style.opacity = '';
      el.style.pointerEvents = '';
    }
  });

  // Show read-only info in the header subtitle area  
  const headerLogo = document.getElementById('header-logo');
  if (isReadOnly && viewingName) {
    headerLogo.dataset.originalText = headerLogo.dataset.originalText || headerLogo.innerHTML;
    headerLogo.innerHTML = `👁️ ${viewingName}`;
  }
}

// Enter key support for auth forms
document.getElementById('login-password').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-username').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('register-password2').addEventListener('keypress', e => { if (e.key === 'Enter') doRegister(); });
// Click outside auth modal to close
document.getElementById('auth-modal').addEventListener('click', e => { if (e.target.id === 'auth-modal') closeAuthModal(); });

// ═══════ NAVIGATION ═══════
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const header = getEl('app-header');
  if (!header) return;

  if (page === 'home') {
    const pHome = getEl('page-home');
    if (pHome) pHome.classList.add('active');
    header.classList.remove('visible');
    updateHomeMini();
    return;
  }

  header.classList.add('visible');
  const nKappa = getEl('nav-kappa'); if (nKappa) nKappa.className = 'nav-tab' + (page === 'kappa' ? ' active-kappa' : '');
  const nHide = getEl('nav-hideout'); if (nHide) nHide.className = 'nav-tab' + (page === 'hideout' ? ' active-hideout' : '');
  const nQuest = getEl('nav-quests'); if (nQuest) nQuest.className = 'nav-tab' + (page === 'quests' ? ' active-quests' : '');

  if (page === 'kappa') {
    const pKappa = getEl('page-kappa'); if (pKappa) pKappa.classList.add('active');
    setHtml('header-logo', '<img src="images/kappa_icon.webp" width="24" height="24"  style="vertical-align: middle;">  KAPPA');
    setTxt('header-prog-label', 'PROGRESO KAPPA');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = '';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill';
    if (!kappaItems.length) loadKappa(); else { updateKappaStats(); renderKappa(); }
  } else if (page === 'hideout') {
    const pHide = getEl('page-hideout'); if (pHide) pHide.classList.add('active');
    setHtml('header-logo', '️<img src="images/hideout_icon.png" width="24" height="24" style="vertical-align: middle;"> REFUGIO');
    setTxt('header-prog-label', 'NIVELES CONSTRUIDOS');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = 'blue';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill blue';
    if (!hideoutStations.length) loadHideout(); else {
      updateHideoutStats();
      if (hideoutCurrentView === 'stations') renderStationsGrid(); else renderHideoutItemsView();
    }
  } else if (page === 'quests') {
    const pQuest = getEl('page-quests'); if (pQuest) pQuest.classList.add('active');
    setHtml('header-logo', '📜 MISIONES');
    setTxt('header-prog-label', 'MISIONES COMPLETADAS');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = 'yellow';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill yellow';
    if (!quests.length) loadQuests(); else { updateQuestStats(); renderQuests(); }
  }
}

// ═══════ TOAST ═══════
function toast(text, type = 't-found') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 't-found' ? '✓' : type === 't-built' ? '🔨' : '✗'}</span> ${text}`;
  c.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s,transform .4s'; t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 400); }, 2500);
}

// ═══════════════════════════════
// KAPPA MODULE
// ═══════════════════════════════
const KAPPA_QUERY = `{ tasks(lang: en) { id name objectives { ... on TaskObjectiveItem { type item { id name shortName iconLink wikiLink } count foundInRaid } } } }`;

async function loadKappa() {
  setDisp('k-loading', 'flex');
  setDisp('k-error', 'none');
  setDisp('k-content', 'none');
  try {
    const data = await fetchWithCache(KAPPA_QUERY, 'eft_cache_kappa');
    const tasks = data.tasks;
    let collector = tasks.find(t => t.name === 'The Collector');
    if (!collector) collector = [...tasks].sort((a, b) => b.objectives.filter(o => o.item).length - a.objectives.filter(o => o.item).length)[0];
    const seen = new Set();
    kappaItems = [];
    for (const obj of collector.objectives) {
      if (obj.item && !seen.has(obj.item.id)) {
        seen.add(obj.item.id);
        kappaItems.push({ id: obj.item.id, name: obj.item.name, shortName: obj.item.shortName, iconLink: obj.item.iconLink, count: obj.count || 1, foundInRaid: obj.foundInRaid });
      }
    }
    kappaItems.sort((a, b) => a.name.localeCompare(b.name));
    setDisp('k-loading', 'none');
    setDisp('k-content', 'block');
    updateKappaStats();
    renderKappa();
    updateHomeMini();
  } catch (e) {
    setDisp('k-loading', 'none');
    setDisp('k-error', 'flex');
    setTxt('k-error-msg', `Error: ${e.message}`);
  }
}

function updateHomeMini() {
  const kTotal = kappaItems.length || 0;
  const kFound = [...kappaFound].filter(id => kappaItems.some(i => i.id === id)).length || [...kappaFound].length;
  const kPct = kTotal > 0 ? Math.min(100, (kFound / kTotal) * 100) : 0;

  const hKappaLabel = document.getElementById('home-kappa-label');
  if (hKappaLabel) hKappaLabel.textContent = kTotal > 0 ? `${kFound} / ${kTotal}` : 'Cargando...';
  const hKappaFill = document.getElementById('home-kappa-fill');
  if (hKappaFill) hKappaFill.style.width = kPct + '%';

  const hTotal = hideoutStations.reduce((a, s) => a + s.levels.length, 0) || 0;
  const hBuilt = [...hideoutBuilt].filter(key => !key.startsWith('item_')).length; // Only levels, not items
  const hPct = hTotal > 0 ? Math.min(100, (hBuilt / hTotal) * 100) : 0;

  const hHideoutPct = document.getElementById('home-hideout-pct');
  if (hHideoutPct) hHideoutPct.textContent = Math.round(hPct) + '%';
  const hHideoutFill = document.getElementById('home-hideout-fill');
  if (hHideoutFill) hHideoutFill.style.width = hPct + '%';

  const qTotal = quests.length || 0;
  const qFound = questsCompleted.size;
  const qPct = qTotal > 0 ? Math.min(100, (qFound / qTotal) * 100) : 0;

  const hQuestsPct = document.getElementById('home-quests-pct');
  if (hQuestsPct) hQuestsPct.textContent = Math.round(qPct) + '%';
  const hQuestsFill = document.getElementById('home-quests-fill');
  if (hQuestsFill) hQuestsFill.style.width = qPct + '%';
}

function updateKappaStats() {
  const total = kappaItems.length;
  const found = [...kappaFound].filter(id => kappaItems.some(i => i.id === id)).length;
  const rem = total - found;

  const elTotal = document.getElementById('k-total');
  if (elTotal) elTotal.textContent = total;
  const elFound = document.getElementById('k-found');
  if (elFound) elFound.textContent = found;
  const elRem = document.getElementById('k-remaining');
  if (elRem) elRem.textContent = rem;

  const elBanner = document.getElementById('k-banner');
  if (elBanner) elBanner.style.display = (found === total && total > 0) ? 'flex' : 'none';

  const pct = total > 0 ? (found / total) * 100 : 0;
  const elProgVal = document.getElementById('header-prog-val');
  if (elProgVal) elProgVal.textContent = `${found} / ${total}`;
  const elProgFill = document.getElementById('header-prog-fill');
  if (elProgFill) elProgFill.style.width = pct + '%';
}

function renderKappa() {
  const grid = document.getElementById('k-grid');
  const q = kappaSearch.toLowerCase();
  const filtered = kappaItems.filter(item => {
    const ms = !q || item.name.toLowerCase().includes(q) || (item.shortName && item.shortName.toLowerCase().includes(q));
    const isF = kappaFound.has(item.id);
    const mf = kappaFilter === 'all' || (kappaFilter === 'found' && isF) || (kappaFilter === 'missing' && !isF);
    return ms && mf;
  });
  const elCount = document.getElementById('k-count');
  if (elCount) elCount.textContent = `${filtered.length} items`;
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${kappaFilter === 'found' ? '🎉' : '🔍'}</div><div class="empty-state-text">${kappaFilter === 'found' ? 'Aún no has marcado ningún item' : 'No se encontraron items'}</div></div>`;
    return;
  }
  grid.innerHTML = filtered.map(item => {
    const isF = kappaFound.has(item.id);
    return `<div class="item-card${isF ? ' is-found' : ''}" data-id="${item.id}" onclick="toggleKappa('${item.id}')">
      <div class="item-img-wrapper">
        ${item.count > 1 ? `<div class="count-badge">x${item.count}</div>` : ''}
        <div class="found-badge">${CHECK_SVG}</div>
        ${item.iconLink ? `<img class="item-img" src="${item.iconLink}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'"/>` :
        `<div style="font-size:2rem;opacity:.3">📦</div>`}
      </div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.shortName && item.shortName !== item.name ? `<div class="item-short">${item.shortName}</div>` : ''}
        ${item.foundInRaid ? '<div class="fir-tag">FIR</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function toggleKappa(id) {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  const wasFound = kappaFound.has(id);
  const item = kappaItems.find(i => i.id === id);
  if (!item) return;
  if (wasFound) { kappaFound.delete(id); toast(`${item.name} — pendiente`, 't-unfound'); }
  else { kappaFound.add(id); toast(`¡${item.shortName || item.name} encontrado!`, 't-found'); }
  saveKappa();
  updateKappaStats();
  const card = document.querySelector(`.item-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('is-found', !wasFound);
    if (!wasFound) { card.classList.add('pulse-found'); setTimeout(() => card.classList.remove('pulse-found'), 700); }
    if (kappaFilter !== 'all') setTimeout(renderKappa, 300);
  }
  updateHomeMini();
}

// Kappa event listeners
document.getElementById('k-search').addEventListener('input', e => { kappaSearch = e.target.value; renderKappa(); });
document.querySelectorAll('#page-kappa .filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    kappaFilter = tab.dataset.filter;
    document.querySelectorAll('#page-kappa .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderKappa();
  });
});

// ═══════════════════════════════
// HIDEOUT MODULE
// ═══════════════════════════════
const HIDEOUT_QUERY = `{ hideoutStations(lang: en) { id name levels { id level itemRequirements { item { id name shortName iconLink } count } } } }`;

async function loadHideout() {
  setDisp('h-loading', 'flex');
  setDisp('h-error', 'none');
  setDisp('h-content', 'none');
  try {
    const data = await fetchWithCache(HIDEOUT_QUERY, 'eft_cache_hideout');
    hideoutStations = data.hideoutStations
      .filter(s => s.levels && s.levels.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Consolidar items únicos
    consolidateHideoutItems();

    setDisp('h-loading', 'none');
    setDisp('h-content', 'block');
    updateHideoutStats();

    if (hideoutCurrentView === 'stations') {
      renderStationsGrid();
    } else {
      renderHideoutItemsView();
    }
    updateHomeMini();
  } catch (e) {
    setDisp('h-loading', 'none');
    setDisp('h-error', 'flex');
    setTxt('h-error-msg', `Error: ${e.message}`);
  }
}

// Consolidar todos los items únicos del refugio (solo niveles NO construidos)
function consolidateHideoutItems() {
  const itemsMap = new Map();

  hideoutStations.forEach(station => {
    station.levels.forEach(level => {
      // Saltar niveles ya construidos — ya no necesitan items
      if (isLevelBuilt(station.id, level.level)) return;
      if (level.itemRequirements) {
        level.itemRequirements.forEach(req => {
          if (req.item) {
            if (!itemsMap.has(req.item.id)) {
              itemsMap.set(req.item.id, {
                id: req.item.id,
                name: req.item.name,
                shortName: req.item.shortName,
                iconLink: req.item.iconLink,
                totalCount: 0
              });
            }
            const item = itemsMap.get(req.item.id);
            item.totalCount += req.count;
          }
        });
      }
    });
  });

  // Filtrar items que ya no se necesitan (todos sus niveles están construidos)
  consolidatedHideoutItems = Array.from(itemsMap.values())
    .filter(item => item.totalCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Switch entre vistas del refugio
function switchHideoutView(view) {
  hideoutCurrentView = view;

  // Actualizar tabs
  document.getElementById('tab-stations').classList.toggle('active', view === 'stations');
  document.getElementById('tab-items').classList.toggle('active', view === 'items');

  // Mostrar/ocultar vistas
  document.getElementById('h-stations-view').style.display = view === 'stations' ? 'block' : 'none';
  document.getElementById('h-items-view').style.display = view === 'items' ? 'block' : 'none';
  document.getElementById('h-detail-view').style.display = 'none';

  if (view === 'stations') {
    renderStationsGrid();
  } else {
    renderHideoutItemsView();
  }
}

// Get inventory quantity for an item
function getInventoryQty(itemId) {
  return hideoutItemsInventory[itemId] || 0;
}

// Get item status: 'complete', 'partial', or 'none'
function getItemStatus(item) {
  const qty = getInventoryQty(item.id);
  if (qty === 0) return 'none';
  if (qty >= item.totalCount) return 'complete';
  return 'partial';
}

// Renderizar vista de items del refugio
function renderHideoutItemsView() {
  updateHideoutItemsStats();

  const grid = document.getElementById('h-items-grid');
  const q = hideoutItemsSearch.toLowerCase();
  const filtered = consolidatedHideoutItems.filter(item => {
    const ms = !q || item.name.toLowerCase().includes(q) || (item.shortName && item.shortName.toLowerCase().includes(q));
    const status = getItemStatus(item);
    const mf = hideoutItemsFilter === 'all' ||
      (hideoutItemsFilter === 'found' && status === 'complete') ||
      (hideoutItemsFilter === 'missing' && status !== 'complete');
    return ms && mf;
  });

  const elCount = document.getElementById('hi-count');
  if (elCount) elCount.textContent = `${filtered.length} items`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${hideoutItemsFilter === 'found' ? '🎉' : '🔍'}</div><div class="empty-state-text">${hideoutItemsFilter === 'found' ? 'Aún no has completado ningún item' : 'No se encontraron items'}</div></div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const qty = getInventoryQty(item.id);
    const status = getItemStatus(item);
    const remaining = Math.max(0, item.totalCount - qty);

    let cardClass = 'item-card';
    if (status === 'complete') cardClass += ' is-found';
    else if (status === 'partial') cardClass += ' is-partial';

    return `<div class="${cardClass}" data-id="${item.id}" onclick="openQuantityModal('${item.id}')">
      <div class="item-img-wrapper">
        <div class="count-badge">x${item.totalCount}</div>
        ${status === 'complete' ? `<div class="found-badge">${CHECK_SVG}</div>` : ''}
        ${status === 'partial' ? `<div class="partial-badge">-${remaining}</div>` : ''}
        ${item.iconLink ? `<img class="item-img" src="${item.iconLink}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'"/>` :
        `<div style="font-size:2rem;opacity:.3">📦</div>`}
      </div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.shortName && item.shortName !== item.name ? `<div class="item-short">${item.shortName}</div>` : ''}
        ${qty > 0 ? `<div class="qty-progress">${qty} / ${item.totalCount}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Modal functions
function openQuantityModal(itemId) {
  const item = consolidatedHideoutItems.find(i => i.id === itemId);
  if (!item) return;

  currentModalItem = item;
  const currentQty = getInventoryQty(itemId);

  document.getElementById('modal-item-name').textContent = item.name;
  document.getElementById('modal-max-qty').textContent = item.totalCount;
  document.getElementById('modal-qty-input').value = currentQty;
  document.getElementById('modal-qty-input').max = item.totalCount;

  document.getElementById('qty-modal').classList.add('active');
  document.getElementById('modal-qty-input').focus();
  document.getElementById('modal-qty-input').select();
}

function closeQuantityModal() {
  document.getElementById('qty-modal').classList.remove('active');
  currentModalItem = null;
}

function setModalQuantity(value) {
  if (!currentModalItem) return;
  const input = document.getElementById('modal-qty-input');

  if (value === 'max') {
    input.value = currentModalItem.totalCount;
  } else if (value === 'half') {
    input.value = Math.floor(currentModalItem.totalCount / 2);
  } else {
    input.value = value;
  }
}

function confirmQuantityModal() {
  if (!currentModalItem) return;
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); closeQuantityModal(); return; }

  const input = document.getElementById('modal-qty-input');
  let qty = parseInt(input.value) || 0;
  qty = Math.max(0, Math.min(qty, currentModalItem.totalCount));

  const oldQty = getInventoryQty(currentModalItem.id);

  if (qty === 0) {
    delete hideoutItemsInventory[currentModalItem.id];
  } else {
    hideoutItemsInventory[currentModalItem.id] = qty;
  }

  saveHideoutInventory();
  updateHideoutItemsStats();
  renderHideoutItemsView();

  // Toast notification
  if (qty === 0 && oldQty > 0) {
    toast(`${currentModalItem.name} — eliminado del inventario`, 't-unfound');
  } else if (qty >= currentModalItem.totalCount) {
    toast(`¡${currentModalItem.shortName || currentModalItem.name} completado!`, 't-found');
  } else if (qty > oldQty) {
    toast(`${currentModalItem.name} — actualizado (${qty}/${currentModalItem.totalCount})`, 't-built');
  } else if (qty < oldQty) {
    toast(`${currentModalItem.name} — reducido (${qty}/${currentModalItem.totalCount})`, 't-built');
  }

  closeQuantityModal();
}

// Enter key support in modal
document.getElementById('modal-qty-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    confirmQuantityModal();
  }
});

// Click outside modal to close
document.getElementById('qty-modal').addEventListener('click', (e) => {
  if (e.target.id === 'qty-modal') {
    closeQuantityModal();
  }
});

// Actualizar estadísticas de items del refugio
function updateHideoutItemsStats() {
  const total = consolidatedHideoutItems.length;
  let complete = 0;
  let missing = 0;

  consolidatedHideoutItems.forEach(item => {
    const status = getItemStatus(item);
    if (status === 'complete') complete++;
    else if (status === 'none') missing++;
  });

  const elTotal = document.getElementById('hi-total');
  if (elTotal) elTotal.textContent = total;
  const elFound = document.getElementById('hi-found');
  if (elFound) elFound.textContent = complete;
  const elRem = document.getElementById('hi-remaining');
  if (elRem) elRem.textContent = missing;
}

// Event listeners para filtros de items del refugio
document.getElementById('hi-search').addEventListener('input', e => {
  hideoutItemsSearch = e.target.value;
  renderHideoutItemsView();
});

document.getElementById('hi-filter-all').addEventListener('click', () => {
  hideoutItemsFilter = 'all';
  document.querySelectorAll('#h-items-view .filter-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('hi-filter-all').classList.add('active');
  renderHideoutItemsView();
});

document.getElementById('hi-filter-found').addEventListener('click', () => {
  hideoutItemsFilter = 'found';
  document.querySelectorAll('#h-items-view .filter-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('hi-filter-found').classList.add('active');
  renderHideoutItemsView();
});

document.getElementById('hi-filter-missing').addEventListener('click', () => {
  hideoutItemsFilter = 'missing';
  document.querySelectorAll('#h-items-view .filter-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('hi-filter-missing').classList.add('active');
  renderHideoutItemsView();
});

function builtKey(stationId, level) { return `${stationId}_${level}`; }
function isLevelBuilt(stationId, level) { return hideoutBuilt.has(builtKey(stationId, level)); }

function updateHideoutStats() {
  let total = 0, built = 0;
  hideoutStations.forEach(s => {
    if (s.levels) {
      s.levels.forEach(lv => {
        total++;
        if (isLevelBuilt(s.id, lv.level)) built++;
      });
    }
  });
  const rem = total - built;

  const elTotal = document.getElementById('h-total');
  if (elTotal) elTotal.textContent = total;
  const elBuilt = document.getElementById('h-built');
  if (elBuilt) elBuilt.textContent = built;
  const elRem = document.getElementById('h-remaining');
  if (elRem) elRem.textContent = rem;

  const pct = total > 0 ? (built / total) * 100 : 0;
  if (currentPage === 'hideout') {
    const elProgVal = document.getElementById('header-prog-val');
    if (elProgVal) elProgVal.textContent = `${built} / ${total}`;
    const elProgFill = document.getElementById('header-prog-fill');
    if (elProgFill) elProgFill.style.width = pct + '%';
  }
}

function getStationBuiltCount(station) {
  return station.levels.filter(lv => isLevelBuilt(station.id, lv.level)).length;
}

function renderStationsGrid() {
  const elGrid = document.getElementById('h-stations-grid');
  if (!elGrid) return;
  const elCount = document.getElementById('h-stations-count');
  if (elCount) elCount.textContent = `${hideoutStations.length} estaciones`;
  elGrid.innerHTML = hideoutStations.map(s => {
    const max = s.levels.length;
    const done = getStationBuiltCount(s);
    const pct = max > 0 ? done / max * 100 : 0;
    const allBuilt = done === max;
    return `<div class="station-card${allBuilt ? ' all-built' : ''}" onclick="openStation('${s.id}')">
      <span class="st-icon"><img src="images/${stationIcon(s.name)}"</img></span>
      <div class="st-name">${s.name}</div>
      <div class="st-prog-label"><span>Nivel</span><span>${done}/${max}</span></div>
      <div class="st-prog-bar"><div class="st-prog-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function openStation(stationId) {
  selectedStation = hideoutStations.find(s => s.id === stationId);
  if (!selectedStation) return;
  document.getElementById('h-stations-view').style.display = 'none';
  document.getElementById('h-items-view').style.display = 'none';
  const elDisplay = document.getElementById('h-detail-view');
  if (elDisplay) elDisplay.style.display = 'block';
  const elIcon = document.getElementById('detail-icon');
  if (elIcon) elIcon.innerHTML = '<img src="images/' + stationIcon(selectedStation.name) + '">';
  const elName = document.getElementById('detail-name');
  if (elName) elName.textContent = selectedStation.name;
  const done = getStationBuiltCount(selectedStation);
  const elSub = document.getElementById('detail-sub');
  if (elSub) elSub.textContent = `${done} de ${selectedStation.levels.length} niveles construidos`;
  renderLevels();
}

function showStationsView() {
  selectedStation = null;
  document.getElementById('h-stations-view').style.display = 'block';
  document.getElementById('h-items-view').style.display = 'none';
  document.getElementById('h-detail-view').style.display = 'none';
  renderStationsGrid();
}

function renderLevels() {
  if (!selectedStation) return;
  const container = document.getElementById('h-levels-container');
  const maxBuilt = getStationBuiltCount(selectedStation);

  container.innerHTML = selectedStation.levels.map((lv, idx) => {
    const built = isLevelBuilt(selectedStation.id, lv.level);
    const locked = idx > 0 && !isLevelBuilt(selectedStation.id, selectedStation.levels[idx - 1].level);
    const items = lv.itemRequirements || [];
    const allItemsMarked = items.every(req => isReqMarked(selectedStation.id, lv.level, req.item.id));
    const markedCount = items.filter(req => isReqMarked(selectedStation.id, lv.level, req.item.id)).length;

    let statusHtml = '';
    if (built) statusHtml = `<span class="level-badge-built">✓ Construido</span>`;
    else if (allItemsMarked && items.length > 0) statusHtml = `<span class="level-badge-ready">Listo</span>`;
    else statusHtml = `<span class="level-progress-mini">${markedCount}/${items.length} items</span>`;

    return `<div class="level-section${built ? ' level-built' : ''}${locked ? ' level-locked' : ''}" id="level-sec-${lv.level}">
      <div class="level-header" onclick="toggleLevelBody(${lv.level})">
        <div class="level-label">
          <span class="level-num">NIVEL ${lv.level}</span>
          <span class="level-items-count">${items.length} items</span>
        </div>
        <div class="level-status">
          ${statusHtml}
          <span class="level-chevron" id="chev-${lv.level}">›</span>
        </div>
      </div>
      <div class="level-body" id="lvbody-${lv.level}">
        ${items.length === 0 ? '<div style="padding:.5rem 0;color:var(--text3);font-size:.85rem">Sin items requeridos</div>' :
        `<div class="level-items-grid">${items.map(req => renderLevelItem(selectedStation.id, lv.level, req)).join('')}</div>`}
        <div class="level-actions">
          ${built
        ? `<button class="btn-mark-built mark-undo" onclick="toggleLevelBuilt('${selectedStation.id}',${lv.level},false)">↩ Deshacer construcción</button>`
        : `<button class="btn-mark-built mark-done" onclick="toggleLevelBuilt('${selectedStation.id}',${lv.level},true)">🔨 Marcar como construido</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderLevelItem(stationId, level, req) {
  const key = reqItemKey(stationId, level, req.item.id);
  const marked = hideoutBuilt.has(key);
  return `<div class="litem-card${marked ? ' litem-found' : ''}" onclick="toggleReqItem('${stationId}',${level},'${req.item.id}','${req.item.name.replace(/'/g, "\\'")}')">
    <div class="litem-img-wrap">
      <div class="litem-check">${CHECK_SVG}</div>
      ${req.item.iconLink ? `<img class="litem-img" src="${req.item.iconLink}" alt="${req.item.name}" loading="lazy" onerror="this.style.display='none'"/>` :
      `<div style="font-size:1.8rem;opacity:.3">📦</div>`}
    </div>
    <div class="litem-info">
      <div class="litem-name">${req.item.name}</div>
      <div class="litem-qty">x${req.count}</div>
    </div>
  </div>`;
}

function reqItemKey(stationId, level, itemId) { return `item_${stationId}_${level}_${itemId}`; }
function isReqMarked(stationId, level, itemId) { return hideoutBuilt.has(reqItemKey(stationId, level, itemId)); }

function toggleReqItem(stationId, level, itemId, itemName) {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  const key = reqItemKey(stationId, level, itemId);
  if (hideoutBuilt.has(key)) hideoutBuilt.delete(key);
  else { hideoutBuilt.add(key); toast(`${itemName} — recopilado`, 't-built'); }
  saveHideout();
  updateHideoutStats();
  renderLevels();
  updateHomeMini();
}

function toggleLevelBuilt(stationId, level, markBuilt) {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  const key = builtKey(stationId, level);
  const station = hideoutStations.find(s => s.id === stationId);
  if (markBuilt) {
    hideoutBuilt.add(key);
    if (station) {
      const lv = station.levels.find(l => l.level === level);
      if (lv) lv.itemRequirements.forEach(req => hideoutBuilt.add(reqItemKey(stationId, level, req.item.id)));
    }
    toast(`Nivel ${level} de ${station?.name || ''} construido`, 't-built');
  } else {
    hideoutBuilt.delete(key);
    toast(`Nivel ${level} — en construcción`, 't-unfound');
  }
  saveHideout();
  // Recalcular items consolidados (excluye niveles construidos)
  consolidateHideoutItems();
  updateHideoutStats();
  renderLevels();
  const done = getStationBuiltCount(selectedStation);
  document.getElementById('detail-sub').textContent = `${done} de ${selectedStation.levels.length} niveles construidos`;
  updateHomeMini();
}

function toggleLevelBody(level) {
  const body = document.getElementById(`lvbody-${level}`);
  const chev = document.getElementById(`chev-${level}`);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  chev.classList.toggle('open', !isOpen);
}

// ═══════ GLOBAL BUTTONS ═══════
document.getElementById('btn-reload').addEventListener('click', () => {
  if (currentPage === 'kappa') { kappaItems = []; loadKappa(); }
  else if (currentPage === 'hideout') { hideoutStations = []; loadHideout(); }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  if (currentPage === 'kappa') {
    if (!confirm('¿Resetear progreso de Kappa?')) return;
    kappaFound.clear(); saveKappa(); updateKappaStats(); renderKappa(); toast('Progreso Kappa reseteado', 't-unfound');
  } else if (currentPage === 'hideout') {
    if (!confirm('¿Resetear progreso del Refugio (niveles construidos E inventario de items)?')) return;
    hideoutBuilt.clear();
    hideoutItemsInventory = {};
    saveHideout();
    saveHideoutInventory();
    consolidateHideoutItems();
    updateHideoutStats();

    if (hideoutCurrentView === 'items') {
      renderHideoutItemsView();
    } else if (selectedStation) {
      renderLevels();
    } else {
      renderStationsGrid();
    }
    toast('Progreso Refugio reseteado', 't-unfound');
  }
  updateHomeMini();
});

document.getElementById('btn-reset-quests')?.addEventListener('click', () => {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  if (!confirm('¿Estás seguro de que deseas borrar TODO el progreso de misiones? Esta acción no se puede deshacer.')) return;
  questsCompleted.clear();
  targetQuestId = null;
  saveQuests();
  updateQuestStats();
  renderQuests();
  renderQuestTarget();
  updateHomeMini();
  toast('Progreso de misiones borrado', 't-unfound');
});

// ═══════════════════════════════════════════════════
// OCR SCANNER MODULE
// ═══════════════════════════════════════════════════
let scannerActive = false;
let scannerMode = 'kappa'; // 'kappa' | 'hideout'
let scannerStream = null;
let tesseractWorker = null;
let scannerProcessing = false;
let scannerCooldown = 0;

async function initTesseract() {
  if (tesseractWorker) return;
  document.getElementById('scanner-status').textContent = 'Iniciando motor OCR...';
  tesseractWorker = await Tesseract.createWorker();
  await tesseractWorker.loadLanguage('eng');
  await tesseractWorker.initialize('eng');
  // Parametrizar para nombres de items (whitelist o similar si fuera necesario)
}

async function startScanner(mode) {
  if (isReadOnly) { toast('Solo lectura — cambia a tu perfil para escanear', 't-unfound'); return; }
  scannerMode = mode;
  scannerActive = true;
  document.getElementById('scanner-modal').classList.add('active');
  document.getElementById('scanner-type-label').textContent = `MODO: ${mode.toUpperCase()}`;
  document.getElementById('scanner-match-name').textContent = 'Enfoca el nombre del item';
  document.getElementById('scanner-status').textContent = 'Iniciando cámara...';

  try {
    const constraints = {
      video: {
        facingMode: 'environment', // Usar cámara trasera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    scannerStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('scanner-video');
    video.srcObject = scannerStream;

    await initTesseract();
    document.getElementById('scanner-status').textContent = 'Escaneando en tiempo real...';
    requestAnimationFrame(scannerLoop);
  } catch (err) {
    console.error('Error cámara:', err);
    document.getElementById('scanner-status').textContent = 'Error: No se pudo acceder a la cámara';
    toast('Error al abrir la cámara', 't-unfound');
  }
}

function stopScanner() {
  scannerActive = false;
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  document.getElementById('scanner-modal').classList.remove('active');
}

async function scannerLoop() {
  if (!scannerActive) return;

  if (scannerCooldown > 0) {
    scannerCooldown--;
    requestAnimationFrame(scannerLoop);
    return;
  }

  if (!scannerProcessing) {
    await processFrame();
  }

  requestAnimationFrame(scannerLoop);
}

async function processFrame() {
  const video = document.getElementById('scanner-video');
  const canvas = document.getElementById('scanner-canvas');
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

  scannerProcessing = true;

  // Configurar canvas para captura (recorte central)
  const ctx = canvas.getContext('2d');
  const dpr = 1.5; // Escalar un poco para mejor precisión

  // Definir área de interés (el frame visual)
  const frameWidth = video.videoWidth * 0.8;
  const frameHeight = 120 * (video.videoHeight / video.offsetHeight);
  const startX = (video.videoWidth - frameWidth) / 2;
  const startY = (video.videoHeight - frameHeight) / 2;

  canvas.width = frameWidth * dpr;
  canvas.height = frameHeight * dpr;

  ctx.drawImage(video, startX, startY, frameWidth, frameHeight, 0, 0, canvas.width, canvas.height);

  try {
    const { data: { text } } = await tesseractWorker.recognize(canvas);
    const cleanText = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');

    if (cleanText.length > 3) {
      matchAndMark(cleanText);
    }
  } catch (e) {
    console.warn('OCR Error:', e);
  }

  scannerProcessing = false;
}

function matchAndMark(text) {
  const candidates = scannerMode === 'kappa' ? kappaItems : consolidatedHideoutItems;
  let bestMatch = null;
  let bestScore = 0;

  candidates.forEach(item => {
    const itemName = (item.shortName || item.name).toLowerCase().replace(/[^a-z0-9\s]/g, '');

    // Búsqueda simple de subcadena o similitud
    if (text.includes(itemName) || itemName.includes(text)) {
      const score = Math.max(text.length / itemName.length, itemName.length / text.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
  });

  if (bestMatch && bestScore > 0.4) {
    const display = document.getElementById('scanner-match-name');
    display.textContent = `DETECTADO: ${bestMatch.name}`;

    // Si la coincidencia es muy alta, marcar automáticamente
    if (bestScore > 0.7) {
      if (scannerMode === 'kappa') {
        if (!kappaFound.has(bestMatch.id)) {
          toggleKappa(bestMatch.id);
          scannerCooldown = 60; // Pausa para feedback
          visualFeedback(true);
        }
      } else {
        const status = getItemStatus(bestMatch);
        if (status !== 'complete') {
          // Para el refugio, abrimos el modal de cantidad o incrementamos 1
          // Por simplicidad en móvil, incrementamos +1 o marcamos como completo
          markHideoutItemAuto(bestMatch);
          scannerCooldown = 60;
          visualFeedback(true);
        }
      }
    }
  }
}

function markHideoutItemAuto(item) {
  const current = getInventoryQty(item.id);
  const next = Math.min(item.totalCount, current + 1);
  hideoutItemsInventory[item.id] = next;
  saveHideoutInventory();
  renderHideoutItemsView();
  toast(`+1 ${item.shortName || item.name} (Escaneado)`, 't-built');
}

function visualFeedback(success) {
  const frame = document.querySelector('.scanner-frame');
  frame.style.borderColor = success ? 'var(--green)' : 'var(--red)';
  frame.style.boxShadow = success ? '0 0 30px var(--green)' : '0 0 30px var(--red)';
  setTimeout(() => {
    frame.style.borderColor = '';
    frame.style.boxShadow = '';
  }, 1000);
}

// ═══════════════════════════════
// QUEST MODULE
// ═══════════════════════════════
const QUESTS_QUERY = `{
  tasks(lang: en) {
    id name minPlayerLevel experience
    trader { id name imageLink }
    taskRequirements { task { id name } status }
    objectives { 
      id type description 
      ... on TaskObjectiveItem { item { id name shortName iconLink } count foundInRaid }
    }
    finishRewards {
      items { item { id name iconLink } count }
      traderStanding { trader { id name } standing }
    }
  }
}`;

async function loadQuests() {
  setDisp('q-loading', 'flex');
  setDisp('q-error', 'none');
  setDisp('q-content', 'none');
  try {
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: QUESTS_QUERY }) });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0].message);

    quests = data.data.tasks.sort((a, b) => (a.minPlayerLevel || 0) - (b.minPlayerLevel || 0));

    renderTraderFilters();
    updateQuestStats();
    renderQuests();
    updateHomeMini();

    setDisp('q-loading', 'none');
    setDisp('q-content', 'block');
  } catch (e) {
    setDisp('q-loading', 'none');
    setDisp('q-error', 'flex');
    setTxt('q-error-msg', `Error: ${e.message}`);
  }
}

function updateQuestStats() {
  const total = quests.length;
  const completed = questsCompleted.size;
  const remaining = total - completed;

  const elTotal = document.getElementById('q-total');
  if (elTotal) elTotal.textContent = total;
  const elComp = document.getElementById('q-completed');
  if (elComp) elComp.textContent = completed;
  const elRem = document.getElementById('q-remaining');
  if (elRem) elRem.textContent = remaining;

  const pct = total > 0 ? (completed / total) * 100 : 0;
  setTxt('q-pct-text', Math.round(pct) + '%');
  const elProgVal = getEl('header-prog-val');
  if (elProgVal) elProgVal.textContent = `${completed} / ${total}`;
  const elProgFill = getEl('header-prog-fill');
  if (elProgFill) elProgFill.style.width = pct + '%';
}

function getTraderWeight(name) {
  const index = TRADER_ORDER.findIndex(t => name.toLowerCase().includes(t.toLowerCase()));
  return index === -1 ? 99 : index;
}

function renderTraderFilters() {
  const container = getEl('trader-filters');
  if (!container) return;
  const tradersMap = {};
  quests.forEach(q => { if (q.trader) tradersMap[q.trader.id] = q.trader; });

  const sortedTraders = Object.values(tradersMap).sort((a, b) => {
    return getTraderWeight(a.name) - getTraderWeight(b.name);
  });

  let html = `<div class="trader-btn ${activeTraderFilter === 'all' ? 'active' : ''}" onclick="filterByTrader('all')">Todos</div>`;
  sortedTraders.forEach(t => {
    html += `<div class="trader-btn ${activeTraderFilter === t.id ? 'active' : ''}" onclick="filterByTrader('${t.id}')">
      <img src="${t.imageLink}" onerror="this.src='images/trader_placeholder.webp'">
      ${t.name}
    </div>`;
  });
  container.innerHTML = html;
}

function filterByTrader(traderId) {
  activeTraderFilter = traderId;
  renderTraderFilters();
  renderQuests();
}

function isQuestAvailable(quest) {
  if (questsCompleted.has(quest.id)) return true;
  if (quest.minPlayerLevel > playerLevel) return false;
  if (quest.taskRequirements) {
    for (const req of quest.taskRequirements) {
      if (req.task && !questsCompleted.has(req.task.id)) return false;
    }
  }
  return true;
}

function getQuestPath(questId, visited = new Set()) {
  if (visited.has(questId)) return [];
  visited.add(questId);
  const q = quests.find(i => i.id === questId);
  if (!q) return [];
  let path = [];
  if (q.taskRequirements) {
    q.taskRequirements.forEach(req => {
      if (req.task) {
        path = path.concat(getQuestPath(req.task.id, visited));
      }
    });
  }
  path.push(q);
  // Deduplicate by ID
  const seen = new Set();
  return path.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function renderQuests() {
  const list = document.getElementById('q-list');
  const q = questSearch.toLowerCase();

  const filtered = quests.filter(quest => {
    const ms = !q || quest.name.toLowerCase().includes(q);
    const mt = activeTraderFilter === 'all' || (quest.trader && quest.trader.id === activeTraderFilter);

    const isComp = questsCompleted.has(quest.id);
    const isAvail = isQuestAvailable(quest);

    let mf = true;
    if (questFilter === 'completed') mf = isComp;
    else if (questFilter === 'available') mf = !isComp && isAvail;
    else if (questFilter === 'locked') mf = !isComp && !isAvail;

    return ms && mt && mf;
  }).sort((a, b) => {
    const wa = a.trader ? getTraderWeight(a.trader.name) : 999;
    const wb = b.trader ? getTraderWeight(b.trader.name) : 999;
    if (wa !== wb) return wa - wb;
    return (a.minPlayerLevel || 0) - (b.minPlayerLevel || 0);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No se encontraron misiones</div>`;
    return;
  }

  list.innerHTML = filtered.map(quest => {
    const isComp = questsCompleted.has(quest.id);
    const isAvail = isQuestAvailable(quest);
    let statusClass = isComp ? 'is-completed' : (isAvail ? 'is-available' : 'is-locked');
    const isTarget = targetQuestId === quest.id;

    return `<div class="quest-item ${statusClass}" onclick="showQuestDetail('${quest.id}')">
      <div class="quest-status-icon">${isComp ? '✅' : (isAvail ? '🔓' : '🔒')}</div>
      <div class="quest-info">
        <div class="quest-item-name">${quest.name}</div>
        <div class="quest-item-trader">${quest.trader ? quest.trader.name : 'Unknown'}</div>
      </div>
      <div style="display:flex; align-items:center; gap:.5rem">
        <div class="quest-item-level">LVL ${quest.minPlayerLevel || 1}</div>
        <button class="btn-quest-target ${isTarget ? 'active' : ''}" 
                onclick="event.stopPropagation(); setQuestGoal('${quest.id}')" 
                title="${isTarget ? 'Objetivo actual' : 'Fijar como objetivo'}">
          🎯
        </button>
      </div>
    </div>`;
  }).join('');
}

function showQuestDetail(questId) {
  const quest = quests.find(q => q.id === questId);
  if (!quest) return;
  selectedQuest = quest;

  const isComp = questsCompleted.has(quest.id);
  const container = document.getElementById('quest-detail-body');

  let reqsHtml = '';
  if (quest.minPlayerLevel > 1) {
    reqsHtml += `<div class="q-req-item met">📊 Nivel del personaje: ${quest.minPlayerLevel}+</div>`;
  }
  if (quest.taskRequirements && quest.taskRequirements.length) {
    quest.taskRequirements.forEach(r => {
      if (!r.task) return;
      const met = questsCompleted.has(r.task.id);
      reqsHtml += `<div class="q-req-item ${met ? 'met' : 'not-met'}">
        ${met ? '✅' : '❌'} Misión: ${r.task.name}
      </div>`;
    });
  }

  let objHtml = '';
  if (quest.objectives && quest.objectives.length) {
    quest.objectives.forEach(o => {
      const isItem = o.item;
      objHtml += `<div class="q-obj-item">
        ${isItem ? `<img src="${o.item.iconLink}" class="q-obj-img">` : '<span style="font-size:1.5rem">🎯</span>'}
        <div>
          <div style="font-size:0.9rem">${o.description}</div>
          ${isItem ? `<div style="font-size:0.75rem; color:var(--text3)">Necesitas ${o.count}x ${o.item.name} ${o.foundInRaid ? '(FIR)' : ''}</div>` : ''}
        </div>
      </div>`;
    });
  }

  let rewardHtml = '';
  if (quest.experience) {
    rewardHtml += `<div class="q-reward-item">⭐ ${quest.experience} XP</div>`;
  }
  if (quest.finishRewards) {
    if (quest.finishRewards.traderStanding) {
      quest.finishRewards.traderStanding.forEach(r => {
        rewardHtml += `<div class="q-reward-item">🤝 +${r.standing} ${r.trader.name}</div>`;
      });
    }
    if (quest.finishRewards.items) {
      quest.finishRewards.items.forEach(i => {
        rewardHtml += `<div class="q-reward-item">
          <img src="${i.item.iconLink}" class="q-reward-img">
          <div>${i.count}x ${i.item.name}</div>
        </div>`;
      });
    }
  }

  container.innerHTML = `
    <div class="q-detail-header">
      <div>
        <div class="q-detail-title">${quest.name}</div>
        <div class="q-detail-trader">
          <img src="${quest.trader.imageLink}">
          <span>${quest.trader.name}</span>
        </div>
      </div>
      <div class="quest-item-level" style="font-size:1.2rem">NIVEL ${quest.minPlayerLevel || 1}</div>
    </div>
    
    <div class="q-req-box">
      <div class="q-req-title">Requisitos previos</div>
      <div class="q-req-list">
        ${reqsHtml || '<div class="q-req-item met">Sin requisitos previos</div>'}
      </div>
    </div>
    
    <div class="q-obj-section">
      <div class="q-obj-title">Objetivos</div>
      <div class="q-obj-list">${objHtml || 'No hay objetivos listados'}</div>
    </div>
    
    <div class="q-obj-section">
      <div class="q-obj-title">Recompensas</div>
      <div class="q-reward-grid">${rewardHtml || 'No hay recompensas listadas'}</div>
    </div>
    
    <div style="display:flex; gap:1rem; margin-top:2rem">
      <button class="btn-toggle-quest ${isComp ? 'pending' : 'complete'}" style="flex:1" onclick="toggleQuest('${quest.id}')">
        ${isComp ? 'Marcar como pendiente' : 'Marcar como completada'}
      </button>
      <button class="btn btn-ghost" style="border:1px solid var(--accent); color:var(--accent)" onclick="setQuestGoal('${quest.id}')">
        🎯 Fijar como objetivo
      </button>
    </div>
  `;

  document.getElementById('quest-modal').classList.add('active');
}

function closeQuestDetail() {
  document.getElementById('quest-modal').classList.remove('active');
  selectedQuest = null;
}

function toggleQuest(id) {
  if (isReadOnly) { toast('Solo lectura — este no es tu perfil', 't-unfound'); return; }
  const quest = quests.find(q => q.id === id);
  if (!quest) return;

  if (questsCompleted.has(id)) {
    // UNMARKING AS COMPLETED
    const dependents = findRecursiveDependents(id);
    if (dependents.length > 0) {
      const names = dependents.map(q => q.name).join('\n• ');
      if (!confirm(`Esta misión es requisito para las siguientes misiones ya completadas:\n\n• ${names}\n\n¿Quieres desmarcarlas todas como pendientes?`)) {
        return;
      }
      dependents.forEach(q => questsCompleted.delete(q.id));
    }
    questsCompleted.delete(id);
    toast(`${quest.name} — pendiente`, 't-unfound');
  } else {
    // MARKING AS COMPLETED
    const prerequisites = findRecursivePrerequisites(id);
    if (prerequisites.length > 0) {
      const names = prerequisites.map(q => q.name).join('\n• ');
      if (!confirm(`Para completar esta misión, necesitas las siguientes misiones previas:\n\n• ${names}\n\n¿Quieres marcarlas todas como completadas automáticamente?`)) {
        return;
      }
      prerequisites.forEach(q => questsCompleted.add(q.id));
    }
    questsCompleted.add(id);
    toast(`¡Misión completada: ${quest.name}!`, 't-found');
  }

  saveQuests();
  updateQuestStats();
  renderQuests();
  updateHomeMini();
  if (selectedQuest) {
    showQuestDetail(selectedQuest.id);
  }
}

function findRecursivePrerequisites(questId, list = []) {
  const quest = quests.find(q => q.id === questId);
  if (!quest || !quest.taskRequirements) return list;

  quest.taskRequirements.forEach(req => {
    if (req.task && !questsCompleted.has(req.task.id)) {
      if (!list.some(q => q.id === req.task.id)) {
        const reqQuest = quests.find(q => q.id === req.task.id);
        if (reqQuest) {
          findRecursivePrerequisites(req.task.id, list);
          list.push(reqQuest);
        }
      }
    }
  });
  return list;
}

function findRecursiveDependents(questId, list = []) {
  const directDependents = quests.filter(q =>
    questsCompleted.has(q.id) &&
    q.taskRequirements &&
    q.taskRequirements.some(req => req.task && req.task.id === questId)
  );

  directDependents.forEach(dep => {
    if (!list.some(q => q.id === dep.id)) {
      list.push(dep);
      findRecursiveDependents(dep.id, list);
    }
  });
  return list;
}

function setQuestGoal(id) {
  if (!id) {
    targetQuestId = null;
    renderQuestTarget();
    saveQuests();
    renderQuests();
    return;
  }

  if (targetQuestId && targetQuestId !== id) {
    const oldQuest = quests.find(q => q.id === targetQuestId);
    if (!confirm(`Ya tienes la misión "${oldQuest ? oldQuest.name : '???'}" fijada como objetivo. ¿Deseas reemplazarla por la nueva?`)) {
      return;
    }
  }

  targetQuestId = id;
  renderQuestTarget();
  saveQuests();
  renderQuests(); // Refresh icons in list
  toast('Objetivo fijado', 't-found');
  closeQuestDetail();
}

function renderQuestTarget() {
  const elArea = getEl('q-target-area');
  const elContent = getEl('q-target-content');
  if (!elArea || !elContent) return;

  if (!targetQuestId) {
    elArea.style.display = 'none';
    return;
  }

  elArea.style.display = 'block';
  const path = getQuestPath(targetQuestId);

  let html = '';
  path.forEach((q, idx) => {
    const isDone = questsCompleted.has(q.id);
    const isGoal = q.id === targetQuestId;

    html += `
      <div class="q-path-node ${isDone ? 'comp' : ''} ${isGoal ? 'goal' : ''}" onclick="showQuestDetail('${q.id}')" title="${q.name}">
        <div class="q-path-lvl">LVL ${q.minPlayerLevel || 1}</div>
        <div class="q-path-name">${q.name}</div>
        ${isDone ? '✅' : ''}
      </div>
    `;
    if (idx < path.length - 1) {
      html += `<div class="q-path-arrow">➜</div>`;
    }
  });

  elContent.innerHTML = html;
}

// Quest event listeners
document.getElementById('q-search').addEventListener('input', e => { questSearch = e.target.value; renderQuests(); });
document.querySelectorAll('#page-quests .filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    questFilter = tab.dataset.filter;
    document.querySelectorAll('#page-quests .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderQuests();
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // If we want to auto-load quests if navigating to it
});

// Click outside quest modal to close
document.getElementById('quest-modal').addEventListener('click', e => { if (e.target.id === 'quest-modal') closeQuestDetail(); });

// Add event listeners for level and search
document.addEventListener('DOMContentLoaded', () => {
  const lvlInput = getEl('player-level-input');
  if (lvlInput) {
    lvlInput.addEventListener('change', (e) => {
      playerLevel = parseInt(e.target.value) || 1;
      saveQuests();
      renderQuests();
      renderQuestTarget();
    });
  }
});
// ═══════ INIT ═══════
async function initApp() {
  // Load local data first
  loadKappa_storage();
  loadHideout_storage();
  loadHideoutInventory_storage();
  loadQuests_storage();

  // Try to restore auth session
  if (authToken) {
    try {
      const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (res.ok) {
        currentUser = await res.json();
        viewingProfileId = currentUser.id;
        // Load own profile from server (overrides local)
        await loadProfileFromServer(currentUser.id);
      } else {
        // Token expired/invalid
        authToken = null;
        localStorage.removeItem('eft_auth_token');
      }
    } catch (e) {
      console.warn('Could not verify token, using local data:', e);
    }
  }

  // Load all profiles
  try {
    await loadAllProfiles();
  } catch (e) {
    console.warn('Could not load profiles:', e);
    allProfiles = [];
  }

  updateAuthUI();
  updateHomeMini();

  const lvlInput = getEl('player-level-input');
  if (lvlInput) lvlInput.value = playerLevel;
  renderQuestTarget();
}

initApp();