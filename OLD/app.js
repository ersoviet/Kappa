// ═══════════════════════════════════════════════════
// EFT TRACKER — app.js
// Kappa + Hideout tracker using tarkov.dev GraphQL API
// ═══════════════════════════════════════════════════

const API_URL = 'https://api.tarkov.dev/graphql';
const KAPPA_STORAGE = 'kappa_tracker_v2';
const HIDEOUT_STORAGE = 'hideout_tracker_v1';
const HIDEOUT_INVENTORY_STORAGE = 'hideout_inventory_v2';

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
          hideout_inventory: hideoutItemsInventory
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
        hideout_inventory: hideoutItemsInventory
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
    // Also update localStorage
    localStorage.setItem(KAPPA_STORAGE, JSON.stringify([...kappaFound]));
    localStorage.setItem(HIDEOUT_STORAGE, JSON.stringify([...hideoutBuilt]));
    localStorage.setItem(HIDEOUT_INVENTORY_STORAGE, JSON.stringify(hideoutItemsInventory));
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
  const header = document.getElementById('app-header');

  if (page === 'home') {
    document.getElementById('page-home').classList.add('active');
    header.classList.remove('visible');
    updateHomeMini();
    return;
  }

  header.classList.add('visible');
  document.getElementById('nav-kappa').className = 'nav-tab' + (page === 'kappa' ? ' active-kappa' : '');
  document.getElementById('nav-hideout').className = 'nav-tab' + (page === 'hideout' ? ' active-hideout' : '');

  if (page === 'kappa') {
    document.getElementById('page-kappa').classList.add('active');
    document.getElementById('header-logo').innerHTML = '<img src="images/kappa_icon.webp" width="24" height="24"  style="vertical-align: middle;">  KAPPA';
    document.getElementById('header-prog-label').textContent = 'PROGRESO KAPPA';
    document.getElementById('header-prog-val').className = '';
    document.getElementById('header-prog-fill').className = 'prog-bar-fill';
    if (!kappaItems.length) loadKappa(); else { updateKappaStats(); renderKappa(); }
  } else if (page === 'hideout') {
    document.getElementById('page-hideout').classList.add('active');
    document.getElementById('header-logo').innerHTML = '️<img src="images/hideout_icon.png" width="24" height="24" style="vertical-align: middle;"> REFUGIO';
    document.getElementById('header-prog-label').textContent = 'NIVELES CONSTRUIDOS';
    document.getElementById('header-prog-val').className = 'blue';
    document.getElementById('header-prog-fill').className = 'prog-bar-fill blue';
    if (!hideoutStations.length) loadHideout(); else {
      updateHideoutStats();
      if (hideoutCurrentView === 'stations') {
        renderStationsGrid();
      } else {
        renderHideoutItemsView();
      }
    }
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
  document.getElementById('k-loading').style.display = 'flex';
  document.getElementById('k-error').style.display = 'none';
  document.getElementById('k-content').style.display = 'none';
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
    document.getElementById('k-loading').style.display = 'none';
    document.getElementById('k-content').style.display = 'block';
    updateKappaStats();
    renderKappa();
    updateHomeMini();
  } catch (e) {
    document.getElementById('k-loading').style.display = 'none';
    document.getElementById('k-error').style.display = 'flex';
    document.getElementById('k-error-msg').textContent = `Error: ${e.message}`;
  }
}

function updateKappaStats() {
  const total = kappaItems.length;
  const found = [...kappaFound].filter(id => kappaItems.some(i => i.id === id)).length;
  const rem = total - found;
  document.getElementById('k-total').textContent = total;
  document.getElementById('k-found').textContent = found;
  document.getElementById('k-remaining').textContent = rem;
  document.getElementById('k-banner').style.display = (found === total && total > 0) ? 'flex' : 'none';
  const pct = total > 0 ? found / total * 100 : 0;
  document.getElementById('header-prog-val').textContent = `${found} / ${total}`;
  document.getElementById('header-prog-fill').style.width = pct + '%';
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
  document.getElementById('k-count').textContent = `${filtered.length} items`;
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
  document.getElementById('h-loading').style.display = 'flex';
  document.getElementById('h-error').style.display = 'none';
  document.getElementById('h-content').style.display = 'none';
  try {
    const data = await fetchWithCache(HIDEOUT_QUERY, 'eft_cache_hideout');
    hideoutStations = data.hideoutStations
      .filter(s => s.levels && s.levels.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Consolidar items únicos
    consolidateHideoutItems();

    document.getElementById('h-loading').style.display = 'none';
    document.getElementById('h-content').style.display = 'block';
    updateHideoutStats();

    if (hideoutCurrentView === 'stations') {
      renderStationsGrid();
    } else {
      renderHideoutItemsView();
    }
    updateHomeMini();
  } catch (e) {
    document.getElementById('h-loading').style.display = 'none';
    document.getElementById('h-error').style.display = 'flex';
    document.getElementById('h-error-msg').textContent = `Error: ${e.message}`;
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

  document.getElementById('hi-count').textContent = `${filtered.length} items`;

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

  document.getElementById('hi-total').textContent = total;
  document.getElementById('hi-found').textContent = complete;
  document.getElementById('hi-remaining').textContent = missing;
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
    s.levels.forEach(lv => {
      total++;
      if (isLevelBuilt(s.id, lv.level)) built++;
    });
  });
  const rem = total - built;
  document.getElementById('h-total').textContent = total;
  document.getElementById('h-built').textContent = built;
  document.getElementById('h-remaining').textContent = rem;
  const pct = total > 0 ? built / total * 100 : 0;
  if (currentPage === 'hideout') {
    document.getElementById('header-prog-val').textContent = `${built} / ${total}`;
    document.getElementById('header-prog-fill').style.width = pct + '%';
  }
}

function getStationBuiltCount(station) {
  return station.levels.filter(lv => isLevelBuilt(station.id, lv.level)).length;
}

function renderStationsGrid() {
  const grid = document.getElementById('h-stations-grid');
  document.getElementById('h-stations-count').textContent = `${hideoutStations.length} estaciones`;
  grid.innerHTML = hideoutStations.map(s => {
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
  document.getElementById('h-detail-view').style.display = 'block';
  document.getElementById('detail-icon').innerHTML = '<img src="images/' + stationIcon(selectedStation.name) + '">';
  document.getElementById('detail-name').textContent = selectedStation.name;
  const done = getStationBuiltCount(selectedStation);
  document.getElementById('detail-sub').textContent = `${done} de ${selectedStation.levels.length} niveles construidos`;
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

// ═══════ HOME MINI PROGRESS ═══════
function updateHomeMini() {
  // Kappa
  const kTotal = kappaItems.length;
  const kFound = kTotal > 0 ? [...kappaFound].filter(id => kappaItems.some(i => i.id === id)).length : 0;
  document.getElementById('home-kappa-label').textContent = kTotal ? `${kFound} / ${kTotal}` : '— / —';
  document.getElementById('home-kappa-fill').style.width = kTotal > 0 ? (kFound / kTotal * 100) + '%' : '0%';
  // Hideout
  let hTotal = 0, hBuilt = 0;
  hideoutStations.forEach(s => s.levels.forEach(lv => { hTotal++; if (isLevelBuilt(s.id, lv.level)) hBuilt++; }));
  document.getElementById('home-hideout-label').textContent = hTotal ? `${hBuilt} / ${hTotal}` : '— / —';
  document.getElementById('home-hideout-fill').style.width = hTotal > 0 ? (hBuilt / hTotal * 100) + '%' : '0%';
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

// ═══════ INIT ═══════
async function initApp() {
  // Load local data first
  loadKappa_storage();
  loadHideout_storage();
  loadHideoutInventory_storage();

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
}

initApp();