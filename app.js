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
async function fetchWithCache(query, cacheKey, variables = {}, ttlHours = 24) {
  const fullCacheKey = `${cacheKey}_${currentLang}_${gameMode}`;
  const cached = localStorage.getItem(fullCacheKey);
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
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);

  localStorage.setItem(fullCacheKey, JSON.stringify({
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
let gameMode = localStorage.getItem('eft_game_mode') || 'regular'; // 'regular' (PvP) or 'pve'
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
let questsActive = new Set();
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

// Valuation state
let valuationSearchResults = [];
let selectedValuationItem = null;

// Modal state
let currentModalItem = null;

// ═══════ AUTH & PROFILE STATE ═══════
let authToken = localStorage.getItem('eft_auth_token') || null;
let currentUser = null; // { id, username }
let allProfiles = []; // Array of all user profiles from server
let viewingProfileId = null;
let isReadOnly = false; // true when viewing another user's profile

// ═══════ I18N SYSTEM ═══════
let currentLang = localStorage.getItem('eft_tracker_lang') || 'es';

const i18n = {
  es: {
    nav_kappa: "KAPPA", nav_hideout: "REFUGIO", nav_quests: "MISIONES", nav_prices: "PRECIOS",
    home_kappa_title: "KAPPA", home_kappa_desc: "Seguimiento de objetos necesarios para el contenedor Kappa.",
    home_hideout_title: "REFUGIO", home_hideout_desc: "Mejoras de estaciones, materiales requeridos y gestión de inventario.",
    home_quests_title: "MISIONES", home_quests_desc: "Línea de misiones, requisitos de nivel y dependencias entre traders.",
    home_valuation_title: "EVALUACIÓN", home_valuation_desc: "Consulta precios en tiempo real del Flea Market y mejores ventas a comerciantes.",
    home_valuation_tag: "PRECIOS FLEA LIVE",
    home_stats_found: "ENCONTRADOS", home_stats_built: "CONSTRUIDO", home_stats_completed: "COMPLETADAS",
    msg_readonly: "Solo lectura — este no es tu perfil",
    confirm_reset_quests: "¿Estás seguro de que deseas borrar TODO el progreso de misiones?",
    confirm_reset_kappa: "¿Resetear progreso de Kappa?",
    confirm_reset_hideout: "¿Resetear progreso del Refugio (niveles construidos E inventario de items)?",
    toast_quest_completed: "¡Misión completada!",
    toast_quest_pending: "Misión pendiente",
    toast_profile_loaded: "Perfil cargado",
    toast_error_api: "Error al conectar con la API",
    header_prog_kappa: "PROGRESO KAPPA",
    header_prog_hideout: "NIVELES CONSTRUIDOS",
    header_prog_quests: "MISIONES COMPLETADAS",
    header_prog_valuation: "VALORACIÓN DE MERCADO",
    ui_level: "NIVEL", ui_requirements: "Requisitos previos", ui_objectives: "Objetivos", ui_rewards: "Recompensas",
    ui_none: "Ninguno", ui_no_results: "No se encontraron misiones",
    ui_mark_pending: "Marcar como pendiente", ui_mark_complete: "Marcar como completada", ui_mark_active: "Marcar Activa",
    ui_set_goal: "Fijar como objetivo", ui_back_search: "Volver a la búsqueda",
    ui_flea_market: "Flea Market (Avg 24h)", ui_per_slot: "Precio por Slot", ui_best_trader: "Mejor Comerciante",
    ui_direct_sell: "Precio de venta directo", ui_add_info: "Información Adicional", ui_base_price: "BASE PRICE",
    ui_banned_flea: "Baneado del Flea", ui_no_flea: "Sin precio de Flea",
    ui_detected: "DETECTADO", ui_scanner_focus: "Enfoca el nombre del item", ui_scanner_init: "Iniciando cámara...",
    ui_scanner_ocr: "Iniciando motor OCR...", ui_scanner_realtime: "Escaneando en tiempo real...",
    ui_all: "Todos", ui_loading: "Cargando...",
    stat_total_items: "Total Items", stat_found: "Encontrados",
    stat_total_levels: "Total Niveles", stat_built: "Construidos", stat_pending: "Pendientes",
    stat_complete: "Completos", stat_missing: "Faltantes", stat_total_quests: "Total Misiones",
    ui_back_to_stations: "Volver a Estaciones", ui_kappa_needed_title: "Items Necesarios",
    ui_search_quest: "Buscar misión por nombre...", ui_my_level: "MI NIVEL:", ui_delete: "BORRAR",
    ui_filter_all_f: "Todas", ui_filter_locked: "Bloqueadas", ui_filter_available: "Disponibles", ui_filter_completed: "Hechas", ui_filter_kappa: "Kappa",
    ui_map: "MAPA", ui_view_map: "VER MAPA",
    ui_current_goal: "OBJETIVO ACTUAL", ui_clear_goal: "Quitar objetivo",
    ui_valuation_title: "VALORACIÓN DE ITEMS", ui_valuation_desc: "Consulta el Flea Market y mejores ofertas de comerciantes",
    ui_valuation_search: "Nombre del item (ej: Graphics Card, Tetriz...)",
    ui_valuation_init_p: "Busca un ítem o usa la cámara para ver su valor actual",
    ui_qty_subtitle: "¿Cuántas unidades tienes en tu inventario?", ui_qty_label: "Cantidad (de {0})",
    ui_half: "Mitad", ui_all_f: "Todas", ui_cancel: "Cancelar", ui_save: "Guardar", ui_confirm: "Confirmar",
    ui_login: "INICIAR SESIÓN", ui_logout: "CERRAR SESIÓN",
    ui_profile: "PERFIL:",
    ui_auth_sub: "Inicia sesión o crea una cuenta para guardar tu progreso",
    ui_tab_login: "Iniciar Sesión", ui_tab_register: "Registrarse",
    ui_username: "Usuario", ui_password: "Contraseña", ui_confirm_password: "Confirmar Contraseña",
    ui_login_placeholder: "Tu nombre de usuario", ui_pass_placeholder: "Tu contraseña",
    ui_reg_user_placeholder: "Elige un nombre", ui_reg_pass_placeholder: "Mínimo 4 caracteres",
    ui_reg_pass2_placeholder: "Repite la contraseña",
    ui_btn_enter: "ENTRAR", ui_btn_create: "CREAR CUENTA", ui_close: "CERRAR",
    ui_wiki_link: "Ver Wiki ↗",
    toast_inventory_removed: "{0} — eliminado del inventario",
    toast_inventory_completed: "¡{0} completado!",
    toast_inventory_updated: "{0} — actualizado ({1}/{2})",
    toast_inventory_reduced: "{0} — reducido ({1}/{2})",
    ui_no_items: "No se encontraron items",
    ui_no_items_marked: "Aún no has marcado ningún objeto",
    ui_kappa_banner_title: "¡KAPPA COMPLETADO!",
    ui_kappa_banner_sub: "Has encontrado todos los items. ¡El Kappa es tuyo!",
    ui_reload_data: "Recargar datos",
    ui_reset_progress: "Resetear progreso",
    ui_no_quests: "No se encontraron misiones",
    ui_no_quests_trader: "No hay misiones para este comerciante con los filtros actuales",
    ui_items_count: "{0} items", ui_stations_count: "{0} estaciones",
    ui_welcome: "¡Bienvenido, {0}!",
    ui_login_as: "Iniciando sesión como <strong>{0}</strong>",
    ui_not_you: "¿No eres tú? Cambiar usuario",
    ui_login_another: "Inicia sesión con otra cuenta",
    ui_create_account_p: "Crea una cuenta nueva para guardar tu progreso",
    ui_complete_fields: "Completa todos los campos",
    ui_quest_lvl: "📊 Nivel: {0}+",
    ui_quest_req: "Misión: {0}",
    ui_quest_need: "Necesitas {0}x {1} {2}",
    confirm_unmark_dep: "Esta misión es requisito para las siguientes misiones ya completadas:\n\n• {0}\n\n¿Quieres desmarcarlas todas como pendientes?",
    confirm_mark_pre: "Para completar esta misión, necesitas las siguientes misiones previas:\n\n• {0}\n\n¿Quieres marcarlas todas como completadas automáticamente?",
    toast_quest_completed_title: "¡Misión completada: {0}!",
    ui_goal_active: "Objetivo actual",
    ui_built_status: "✓ Construido",
    ui_ready: "Listo",
    ui_no_req_items: "Sin items requeridos",
    ui_undo_built: "↩ Deshacer construcción",
    ui_mark_built_action: "🔨 Marcar como construido",
    ui_slots: "SLOTS",
    ui_vendor: "VENDEDOR",
    ui_no_flea_price: "Sin precio de Flea",
    toast_goal_set: "Objetivo fijado",
    confirm_replace_goal: "Ya tienes la misión \"{0}\" fijada como objetivo. ¿Deseas reemplazarla por la nueva?",
    ui_not_available: "N/A",
    home_subtitle: "Selecciona un módulo para continuar",
    ui_menu: "MENÚ",
    ui_scanner_title: "Escanear con cámara",
    ui_scanner_close: "CERRAR ESCÁNER",
    ui_scanner_mode: "MODO: {0}",
    ui_mode_kappa: "KAPPA",
    ui_mode_hideout: "REFUGIO",
    ui_mode_valuation: "EVALUACIÓN",
    toast_camera_error: "Error al abrir la cámara",
    ui_camera_error: "Error: No se pudo acceder a la cámara",
    ui_pass_mismatch: "Las contraseñas no coinciden",
    toast_logout: "Sesión cerrada",
    ui_you: " (Tú)",
    toast_account_created: "Cuenta creada. ¡Bienvenido, {0}!",
    toast_lvl_undo: "Nivel {0} — pendiente",
    ui_no_profiles: "— Sin perfiles —",
    toast_items_collected: "{0} — recopilado",
    ui_error_server: "Error del servidor ({0})",
    ui_error_login: "Error de inicio de sesión",
    ui_error_register: "Error de registro",
    toast_kappa_reset: "Progreso de Kappa borrado",
    toast_hideout_reset: "Progreso de Refugio borrado",
    toast_quests_reset: "Progreso de misiones borrado",
    toast_scanned: "+1 {0} (Escaneado)",
    ui_gamemode: "MODO DE JUEGO:",
    ui_pvp: "PvP (Regular)",
    ui_pve: "PvE"
  },
  en: {
    nav_kappa: "KAPPA", nav_hideout: "HIDEOUT", nav_quests: "QUESTS", nav_prices: "PRICES",
    home_kappa_title: "KAPPA", home_kappa_desc: "Track items required for the 'The Collector' quest and Kappa container.",
    home_hideout_title: "HIDEOUT", home_hideout_desc: "Station upgrades, required materials, and inventory management.",
    home_quests_title: "QUESTS", home_quests_desc: "Quest lines, level requirements, and trader dependencies.",
    home_valuation_title: "VALUATION", home_valuation_desc: "Check real-time Flea Market prices and best trader sell values.",
    home_valuation_tag: "LIVE FLEA PRICES",
    home_stats_found: "FOUND", home_stats_built: "BUILT", home_stats_completed: "COMPLETED",
    msg_readonly: "Read-only — this is not your profile",
    confirm_reset_quests: "Are you sure you want to clear ALL quest progress?",
    confirm_reset_kappa: "Reset Kappa progress?",
    confirm_reset_hideout: "Reset Hideout progress (built levels AND item inventory)?",
    toast_quest_completed: "Quest completed!",
    toast_quest_pending: "Quest pending",
    toast_profile_loaded: "Profile loaded",
    toast_error_api: "Error connecting to API",
    header_prog_kappa: "KAPPA PROGRESS",
    header_prog_hideout: "STATIONS BUILT",
    header_prog_quests: "QUESTS COMPLETED",
    header_prog_valuation: "MARKET VALUATION",
    ui_level: "LEVEL", ui_requirements: "Requirements", ui_objectives: "Objectives", ui_rewards: "Rewards",
    ui_none: "None", ui_no_results: "No missions found",
    ui_mark_pending: "Mark as pending", ui_mark_complete: "Mark as completed", ui_mark_active: "Mark Active",
    ui_set_goal: "Set as goal", ui_back_search: "Back to search",
    ui_flea_market: "Flea Market (Avg 24h)", ui_per_slot: "Price per Slot", ui_best_trader: "Best Trader",
    ui_direct_sell: "Direct sell price", ui_add_info: "Additional Information", ui_base_price: "BASE PRICE",
    ui_banned_flea: "Banned from Flea", ui_no_flea: "No Flea price",
    ui_detected: "DETECTED", ui_scanner_focus: "Focus on item name", ui_scanner_init: "Starting camera...",
    ui_scanner_ocr: "Starting OCR engine...", ui_scanner_realtime: "Scanning in real-time...",
    ui_all: "All", ui_loading: "Loading...",
    stat_total_items: "Total Items", stat_found: "Found",
    stat_total_levels: "Total Levels", stat_built: "Built", stat_pending: "Pending",
    stat_complete: "Complete", stat_missing: "Missing", stat_total_quests: "Total Quests",
    stat_completed: "Completed", stat_unique_items: "Unique Items", ui_search_item: "Search item...",
    ui_loading_kappa: "Loading Kappa...", ui_loading_hideout: "Loading Hideout...", ui_loading_quests: "Loading Quests...",
    ui_retry: "Retry", ui_stations: "Stations", ui_items_list: "Items List",
    ui_stations_title: "Hideout Stations", ui_hideout_items_title: "Hideout Items",
    ui_back_to_stations: "Back to Stations", ui_kappa_needed_title: "Required Items",
    ui_search_quest: "Search quest by name...", ui_my_level: "MY LEVEL:", ui_delete: "DELETE",
    ui_filter_all_f: "All", ui_filter_locked: "Locked", ui_filter_available: "Available", ui_filter_completed: "Done", ui_filter_kappa: "Kappa",
    ui_map: "MAP", ui_view_map: "VIEW MAP",
    ui_current_goal: "CURRENT GOAL", ui_clear_goal: "Clear goal",
    ui_valuation_title: "ITEM VALUATION", ui_valuation_desc: "Check Flea Market and best trader offers",
    ui_valuation_search: "Item name (e.g. Graphics Card, Tetriz...)",
    ui_valuation_init_p: "Search for an item or use the camera to see its current value",
    ui_qty_subtitle: "How many units do you have in your inventory?", ui_qty_label: "Quantity (of {0})",
    ui_half: "Half", ui_all_f: "All", ui_cancel: "Cancel", ui_save: "Save", ui_confirm: "Confirm",
    ui_login: "LOGIN", ui_logout: "LOGOUT",
    ui_profile: "PROFILE:",
    ui_auth_sub: "Login or create an account to save your progress",
    ui_tab_login: "Login", ui_tab_register: "Register",
    ui_username: "Username", ui_password: "Password", ui_confirm_password: "Confirm Password",
    ui_login_placeholder: "Your username", ui_pass_placeholder: "Your password",
    ui_reg_user_placeholder: "Choose a name", ui_reg_pass_placeholder: "Min 4 characters",
    ui_reg_pass2_placeholder: "Repeat password",
    ui_btn_enter: "ENTER", ui_btn_create: "CREATE ACCOUNT", ui_close: "CLOSE",
    ui_wiki_link: "View Wiki ↗",
    toast_inventory_removed: "{0} — removed from inventory",
    toast_inventory_completed: "{0} completed!",
    toast_inventory_updated: "{0} — updated ({1}/{2})",
    toast_inventory_reduced: "{0} — reduced ({1}/{2})",
    ui_no_items: "No items found",
    ui_no_items_marked: "You haven't marked any items yet",
    ui_kappa_banner_title: "KAPPA COMPLETED!",
    ui_kappa_banner_sub: "You have found all items. The Kappa is yours!",
    ui_reload_data: "Reload data",
    ui_reset_progress: "Reset progress",
    ui_no_quests: "No missions found",
    ui_no_quests_trader: "No missions for this trader with current filters",
    ui_items_count: "{0} items", ui_stations_count: "{0} stations",
    ui_welcome: "Welcome, {0}!",
    ui_login_as: "Logging in as <strong>{0}</strong>",
    ui_not_you: "Not you? Change user",
    ui_login_another: "Login with another account",
    ui_create_account_p: "Create a new account to save your progress",
    ui_complete_fields: "Fill in all fields",
    ui_quest_lvl: "📊 Level: {0}+",
    ui_quest_req: "Quest: {0}",
    ui_quest_need: "Need {0}x {1} {2}",
    confirm_unmark_dep: "This quest is a requirement for the following completed quests:\n\n• {0}\n\nDo you want to unmark them all as pending?",
    confirm_mark_pre: "To complete this quest, you need the following prerequisite quests:\n\n• {0}\n\nDo you want to mark them all as completed automatically?",
    toast_quest_completed_title: "Quest completed: {0}!",
    ui_goal_active: "Current goal",
    ui_built_status: "✓ Built",
    ui_ready: "Ready",
    ui_no_req_items: "No required items",
    ui_undo_built: "↩ Undo construction",
    ui_mark_built_action: "🔨 Mark as built",
    ui_slots: "SLOTS",
    ui_vendor: "VENDOR",
    ui_no_flea_price: "No Flea Price",
    toast_goal_set: "Goal set",
    confirm_replace_goal: "You already have \"{0}\" set as a goal. Do you want to replace it?",
    ui_not_available: "N/A",
    home_subtitle: "Select a module to continue",
    ui_menu: "MENU",
    ui_scanner_title: "Scan with camera",
    ui_scanner_close: "CLOSE SCANNER",
    ui_scanner_mode: "MODE: {0}",
    ui_mode_kappa: "KAPPA",
    ui_mode_hideout: "HIDEOUT",
    ui_mode_valuation: "VALUATION",
    toast_camera_error: "Error opening camera",
    ui_camera_error: "Error: Could not access camera",
    ui_pass_mismatch: "Passwords do not match",
    toast_logout: "Logged out",
    ui_you: " (You)",
    toast_account_created: "Account created. Welcome, {0}!",
    toast_lvl_undo: "Level {0} — pending",
    ui_no_profiles: "— No profiles —",
    toast_items_collected: "{0} — collected",
    ui_error_server: "Server error ({0})",
    ui_error_login: "Login error",
    ui_error_register: "Registration error",
    toast_kappa_reset: "Kappa progress reset",
    toast_hideout_reset: "Hideout progress reset",
    toast_quests_reset: "Quest progress reset",
    toast_scanned: "+1 {0} (Scanned)",
    ui_gamemode: "GAME MODE:",
    ui_pvp: "PvP (Regular)",
    ui_pve: "PvE"
  }
};

function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('eft_tracker_lang', lang);
  updateUI();

  // Refresh data if on a page that needs API translation
  if (currentPage === 'kappa') { kappaItems = []; loadKappa(); }
  else if (currentPage === 'hideout') { hideoutStations = []; loadHideout(); }
  else if (currentPage === 'quests') { quests = []; loadQuests(); }
  else if (currentPage === 'valuation' && selectedValuationItem) { closeValuationDetail(); }
}

function switchGameMode(mode) {
  gameMode = mode;
  localStorage.setItem('eft_game_mode', mode);

  // Refresh UI and Data
  updateUI();

  // Clear caches for current lang across all modes so fresh data is fetched for the new mode if needed
  // Note: fetchWithCache uses a key that includes currentLang but NOT gameMode currently.
  // To avoid mixing PvP/PvE in the same cache key, we should ideally include gameMode in the cache key.

  if (currentPage === 'kappa') { kappaItems = []; loadKappa(); }
  else if (currentPage === 'hideout') { hideoutStations = []; loadHideout(); }
  else if (currentPage === 'quests') { quests = []; loadQuests(); }
  else if (currentPage === 'valuation') {
    if (selectedValuationItem) {
      // Refresh detail for current item if open
      const currentId = selectedValuationItem.id;
      const currentSearch = document.getElementById('v-search').value;
      searchValuationItems(currentSearch).then(() => {
        if (valuationSearchResults.find(i => i.id === currentId)) {
          showValuationDetail(currentId);
        }
      });
    }
  }

  // Update header buttons
  document.getElementById('btn-mode-pvp')?.classList.toggle('active', gameMode === 'regular');
  document.getElementById('btn-mode-pve')?.classList.toggle('active', gameMode === 'pve');
}

function updateUI() {
  // Update static elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[currentLang][key]) {
      // If it's an input, update placeholder
      if (el.tagName === 'INPUT') {
        el.placeholder = i18n[currentLang][key];
      } else {
        el.textContent = i18n[currentLang][key];
      }
    }
  });

  // Update elements with data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (i18n[currentLang][key]) {
      el.title = i18n[currentLang][key];
    }
  });

  // Refresh current page dynamic headers
  updateHeader();

  // Update language buttons active state
  document.getElementById('btn-lang-es')?.classList.toggle('active', currentLang === 'es');
  document.getElementById('btn-lang-en')?.classList.toggle('active', currentLang === 'en');

  // Update game mode buttons active state
  document.getElementById('btn-mode-pvp')?.classList.toggle('active', gameMode === 'regular');
  document.getElementById('btn-mode-pve')?.classList.toggle('active', gameMode === 'pve');

  // Refresh existing dynamic UI components
  if (currentPage === 'home') updateHomeMini();
}

function updateHeader() {
  if (currentPage === 'home') return;
  const logo = document.getElementById('header-logo');
  const progLabel = document.getElementById('header-prog-label');
  if (!logo || !progLabel) return;

  if (currentPage === 'kappa') {
    logo.innerHTML = `<img src="images/kappa_icon.webp" width="24" height="24"  style="vertical-align: middle;"> ${i18n[currentLang].nav_kappa}`;
    progLabel.textContent = i18n[currentLang].header_prog_kappa;
  } else if (currentPage === 'hideout') {
    logo.innerHTML = `️<img src="images/hideout_icon.png" width="24" height="24" style="vertical-align: middle;"> ${i18n[currentLang].nav_hideout}`;
    progLabel.textContent = i18n[currentLang].header_prog_hideout;
  } else if (currentPage === 'quests') {
    logo.innerHTML = `📜 ${i18n[currentLang].nav_quests}`;
    progLabel.textContent = i18n[currentLang].header_prog_quests;
  } else if (currentPage === 'valuation') {
    logo.innerHTML = `<span style="color:#a855f7">⚖️ ${i18n[currentLang].nav_prices}</span>`;
    progLabel.textContent = i18n[currentLang].header_prog_valuation;
  }
}

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
    active: [...questsActive],
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
        questsActive = new Set(data.active || []);
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
          quests_active: [...questsActive],
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
    modalSub.innerHTML = i18n[currentLang].ui_login_as.replace('{0}', selectedProfile.username) +
      ` <br> <a href="#" onclick="showUsernameField(); return false;" style="color:var(--gold); font-size:0.8rem; text-decoration:underline; margin-top:5px; display:inline-block;">${i18n[currentLang].ui_not_you}</a>`;
    setTimeout(() => document.getElementById('login-password').focus(), 50);
  } else {
    usernameInput.value = '';
    userFieldContainer.style.display = 'block'; // mostrar campo de usuario
    modalSub.textContent = i18n[currentLang].ui_auth_sub;
    setTimeout(() => usernameInput.focus(), 50);
  }
}

function showUsernameField() {
  const userFieldContainer = document.getElementById('login-username').parentElement;
  const usernameInput = document.getElementById('login-username');
  const modalSub = document.getElementById('auth-modal').querySelector('.auth-modal-sub');

  usernameInput.value = '';
  userFieldContainer.style.display = 'block';
  modalSub.textContent = i18n[currentLang].ui_login_another;
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
    document.getElementById('auth-modal').querySelector('.auth-modal-sub').textContent = i18n[currentLang].ui_create_account_p;
  }
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  if (!username || !password) { document.getElementById('login-error').textContent = i18n[currentLang].ui_complete_fields; return; }
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
      if (!res.ok) throw new Error(i18n[currentLang].ui_error_server.replace('{0}', res.status));
      throw e;
    }

    if (!res.ok) throw new Error(data.error || i18n[currentLang].ui_error_login);
    authToken = data.token;
    currentUser = data.user;
    viewingProfileId = currentUser.id;  // ← fijar perfil propio
    isReadOnly = false;                  // ← nunca es solo lectura propio perfil
    localStorage.setItem('eft_auth_token', authToken);
    closeAuthModal();
    toast(i18n[currentLang].ui_welcome.replace('{0}', currentUser.username), 't-found');
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
  if (!username || !password || !password2) { document.getElementById('register-error').textContent = i18n[currentLang].ui_complete_fields; return; }
  if (password !== password2) { document.getElementById('register-error').textContent = i18n[currentLang].ui_pass_mismatch; return; }
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
      if (!res.ok) throw new Error(i18n[currentLang].ui_error_server.replace('{0}', res.status));
      throw e;
    }

    if (!res.ok) throw new Error(data.error || i18n[currentLang].ui_error_register);
    authToken = data.token;
    currentUser = data.user;
    viewingProfileId = currentUser.id;  // ← fijar perfil propio
    isReadOnly = false;                  // ← nunca es solo lectura propio perfil
    localStorage.setItem('eft_auth_token', authToken);
    closeAuthModal();
    toast(i18n[currentLang].toast_account_created.replace('{0}', currentUser.username), 't-found');
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
  toast(i18n[currentLang].toast_logout, 't-unfound');
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
        quests_active: [...questsActive],
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
    questsActive = new Set(profile.quests_active || []);
    playerLevel = profile.player_level || 1;
    targetQuestId = profile.target_quest_id || null;
    // Also update localStorage
    localStorage.setItem(KAPPA_STORAGE, JSON.stringify([...kappaFound]));
    localStorage.setItem(HIDEOUT_STORAGE, JSON.stringify([...hideoutBuilt]));
    localStorage.setItem(HIDEOUT_INVENTORY_STORAGE, JSON.stringify(hideoutItemsInventory));
    localStorage.setItem(QUEST_STORAGE, JSON.stringify({
      completed: [...questsCompleted],
      active: [...questsActive],
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
      sel.innerHTML = `<option value="">${i18n[currentLang].ui_no_profiles}</option>`;
      return;
    }
    allProfiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.username + (currentUser && p.id === currentUser.id ? i18n[currentLang].ui_you : '');
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
    questsActive = new Set(profile.quests_active || []);
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
    btnAuth.textContent = '🔑 ' + i18n[currentLang].ui_login;
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

  updateHeader();

  if (page === 'kappa') {
    const pKappa = getEl('page-kappa'); if (pKappa) pKappa.classList.add('active');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = '';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill';
    if (!kappaItems.length) loadKappa(); else { updateKappaStats(); renderKappa(); }
  } else if (page === 'hideout') {
    const pHide = getEl('page-hideout'); if (pHide) pHide.classList.add('active');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = 'blue';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill blue';
    if (!hideoutStations.length) loadHideout(); else {
      updateHideoutStats();
      if (hideoutCurrentView === 'stations') renderStationsGrid(); else renderHideoutItemsView();
    }
  } else if (page === 'quests') {
    const pQuest = getEl('page-quests'); if (pQuest) pQuest.classList.add('active');
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = 'yellow';
    const hFill = getEl('header-prog-fill'); if (hFill) hFill.className = 'prog-bar-fill yellow';
    if (!quests.length) loadQuests(); else { updateQuestStats(); renderQuests(); }
  } else if (page === 'valuation') {
    const pValuation = getEl('page-valuation'); if (pValuation) pValuation.classList.add('active');
    const nVal = getEl('nav-valuation'); if (nVal) nVal.className = 'nav-tab active-valuation';
    const hVal = getEl('header-prog-val'); if (hVal) hVal.className = 'valuation';
    const hFill = getEl('header-prog-fill'); if (hFill) { hFill.className = 'prog-bar-fill valuation'; hFill.style.background = '#a855f7'; hFill.style.width = '100%'; }
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
const KAPPA_QUERY = `query GetKappa($lang: LanguageCode, $gameMode: GameMode) { tasks(lang: $lang, gameMode: $gameMode) { id name objectives { ... on TaskObjectiveItem { type item { id name shortName iconLink wikiLink } count foundInRaid } } } }`;

async function loadKappa() {
  setDisp('k-loading', 'flex');
  setDisp('k-error', 'none');
  setDisp('k-content', 'none');
  try {
    const data = await fetchWithCache(KAPPA_QUERY, 'eft_cache_kappa', { lang: currentLang, gameMode });
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
  let statsCache = null;
  try {
    const cached = localStorage.getItem('eft_home_stats_cache');
    if (cached) statsCache = JSON.parse(cached);
  } catch (e) { }

  const kTotal = kappaItems.length || (statsCache ? statsCache.kTotal : 0);
  const kFound = kappaItems.length > 0
    ? [...kappaFound].filter(id => kappaItems.some(i => i.id === id)).length
    : [...kappaFound].length;
  const kPct = kTotal > 0 ? Math.min(100, (kFound / kTotal) * 100) : 0;

  const hKappaPct = document.getElementById('home-kappa-pct');
  if (hKappaPct) hKappaPct.textContent = kTotal > 0 ? Math.round(kPct) + '%' : i18n[currentLang].ui_loading;
  const hKappaFill = document.getElementById('home-kappa-fill');
  if (hKappaFill) hKappaFill.style.width = kPct + '%';

  const hTotal = hideoutStations.length > 0 ? hideoutStations.reduce((a, s) => a + s.levels.length, 0) : (statsCache ? statsCache.hTotal : 0);
  const hBuilt = [...hideoutBuilt].filter(key => !key.startsWith('item_')).length; // Only levels, not items
  const hPct = hTotal > 0 ? Math.min(100, (hBuilt / hTotal) * 100) : 0;

  const hHideoutPct = document.getElementById('home-hideout-pct');
  if (hHideoutPct) hHideoutPct.textContent = Math.round(hPct) + '%';
  const hHideoutFill = document.getElementById('home-hideout-fill');
  if (hHideoutFill) hHideoutFill.style.width = hPct + '%';

  const qTotal = quests.length || (statsCache ? statsCache.qTotal : 0);
  const qFound = questsCompleted.size;
  const qPct = qTotal > 0 ? Math.min(100, (qFound / qTotal) * 100) : 0;

  const hQuestsPct = document.getElementById('home-quests-pct');
  if (hQuestsPct) hQuestsPct.textContent = Math.round(qPct) + '%';
  const hQuestsFill = document.getElementById('home-quests-fill');
  if (hQuestsFill) hQuestsFill.style.width = qPct + '%';

  // Save to cache if we have actual loaded arrays
  if (kappaItems.length > 0 || hideoutStations.length > 0 || quests.length > 0) {
    localStorage.setItem('eft_home_stats_cache', JSON.stringify({
      kTotal: kappaItems.length > 0 ? kTotal : (statsCache ? statsCache.kTotal : 0),
      hTotal: hideoutStations.length > 0 ? hTotal : (statsCache ? statsCache.hTotal : 0),
      qTotal: quests.length > 0 ? qTotal : (statsCache ? statsCache.qTotal : 0)
    }));
  }
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
  if (elCount) elCount.textContent = i18n[currentLang].ui_items_count.replace('{0}', filtered.length);
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${kappaFilter === 'found' ? '🎉' : '🔍'}</div><div class="empty-state-text">${kappaFilter === 'found' ? i18n[currentLang].ui_no_items_marked : i18n[currentLang].ui_no_items}</div></div>`;
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
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  const wasFound = kappaFound.has(id);
  const item = kappaItems.find(i => i.id === id);
  if (!item) return;
  if (wasFound) { kappaFound.delete(id); toast(i18n[currentLang].toast_quest_pending.replace('{0}', item.name), 't-unfound'); }
  else { kappaFound.add(id); toast(i18n[currentLang].toast_quest_completed.replace('{0}', item.shortName || item.name), 't-found'); }
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
const HIDEOUT_QUERY = `query GetHideout($lang: LanguageCode, $gameMode: GameMode) { hideoutStations(lang: $lang, gameMode: $gameMode) { id name levels { id level itemRequirements { item { id name shortName iconLink } count } } } }`;

async function loadHideout() {
  setDisp('h-loading', 'flex');
  setDisp('h-error', 'none');
  setDisp('h-content', 'none');
  try {
    const data = await fetchWithCache(HIDEOUT_QUERY, 'eft_cache_hideout', { lang: currentLang, gameMode });
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
  if (elCount) elCount.textContent = i18n[currentLang].ui_items_count.replace('{0}', filtered.length);

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${hideoutItemsFilter === 'found' ? '🎉' : '🔍'}</div><div class="empty-state-text">${hideoutItemsFilter === 'found' ? i18n[currentLang].ui_no_items_marked : i18n[currentLang].ui_no_items}</div></div>`;
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
  document.getElementById('modal-qty-label-raw').textContent = i18n[currentLang].ui_qty_label.replace('{0}', item.totalCount);
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
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); closeQuantityModal(); return; }

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
    toast(i18n[currentLang].toast_inventory_removed.replace('{0}', currentModalItem.name), 't-unfound');
  } else if (qty >= currentModalItem.totalCount) {
    toast(i18n[currentLang].toast_inventory_completed.replace('{0}', currentModalItem.shortName || currentModalItem.name), 't-found');
  } else if (qty > oldQty) {
    toast(i18n[currentLang].toast_inventory_updated.replace('{0}', currentModalItem.name).replace('{1}', qty).replace('{2}', currentModalItem.totalCount), 't-built');
  } else if (qty < oldQty) {
    toast(i18n[currentLang].toast_inventory_reduced.replace('{0}', currentModalItem.name).replace('{1}', qty).replace('{2}', currentModalItem.totalCount), 't-built');
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
  if (elCount) elCount.textContent = i18n[currentLang].ui_stations_count.replace('{0}', hideoutStations.length);
  elGrid.innerHTML = hideoutStations.map(s => {
    const max = s.levels.length;
    const done = getStationBuiltCount(s);
    const pct = max > 0 ? done / max * 100 : 0;
    const allBuilt = done === max;
    return `<div class="station-card${allBuilt ? ' all-built' : ''}" onclick="openStation('${s.id}')">
      <span class="st-icon"><img src="images/${stationIcon(s.name)}"</img></span>
      <div class="st-name">${s.name}</div>
      <div class="st-prog-label"><span>${i18n[currentLang].ui_level}</span><span>${done}/${max}</span></div>
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
  if (elSub) elSub.textContent = `${done} / ${selectedStation.levels.length} ${i18n[currentLang].header_prog_hideout.toLowerCase()}`;
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
    if (built) statusHtml = `<span class="level-badge-built">${i18n[currentLang].ui_built_status}</span>`;
    else if (allItemsMarked && items.length > 0) statusHtml = `<span class="level-badge-ready">${i18n[currentLang].ui_ready}</span>`;
    else statusHtml = `<span class="level-progress-mini">${i18n[currentLang].ui_items_count.replace('{0}', markedCount + '/' + items.length)}</span>`;

    return `<div class="level-section${built ? ' level-built' : ''}${locked ? ' level-locked' : ''}" id="level-sec-${lv.level}">
      <div class="level-header" onclick="toggleLevelBody(${lv.level})">
        <div class="level-label">
          <span class="level-num">${i18n[currentLang].ui_level} ${lv.level}</span>
          <span class="level-items-count">${i18n[currentLang].ui_items_count.replace('{0}', items.length)}</span>
        </div>
        <div class="level-status">
          ${statusHtml}
          <span class="level-chevron" id="chev-${lv.level}">›</span>
        </div>
      </div>
      <div class="level-body" id="lvbody-${lv.level}">
        ${items.length === 0 ? `<div style="padding:.5rem 0;color:var(--text3);font-size:.85rem">${i18n[currentLang].ui_no_req_items}</div>` :
        `<div class="level-items-grid">${items.map(req => renderLevelItem(selectedStation.id, lv.level, req)).join('')}</div>`}
        <div class="level-actions">
          ${built
        ? `<button class="btn-mark-built mark-undo" onclick="toggleLevelBuilt('${selectedStation.id}',${lv.level},false)">${i18n[currentLang].ui_undo_built}</button>`
        : `<button class="btn-mark-built mark-done" onclick="toggleLevelBuilt('${selectedStation.id}',${lv.level},true)">${i18n[currentLang].ui_mark_built_action}</button>`}
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
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  const key = reqItemKey(stationId, level, itemId);
  if (hideoutBuilt.has(key)) hideoutBuilt.delete(key);
  else { hideoutBuilt.add(key); toast(i18n[currentLang].toast_items_collected.replace('{0}', itemName), 't-built'); }
  saveHideout();
  updateHideoutStats();
  renderLevels();
  updateHomeMini();
}

function toggleLevelBuilt(stationId, level, markBuilt) {
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  const key = builtKey(stationId, level);
  const station = hideoutStations.find(s => s.id === stationId);
  if (markBuilt) {
    hideoutBuilt.add(key);
    if (station) {
      const lv = station.levels.find(l => l.level === level);
      if (lv) lv.itemRequirements.forEach(req => hideoutBuilt.add(reqItemKey(stationId, level, req.item.id)));
    }
    toast(`${i18n[currentLang].ui_level} ${level} — ${station?.name || ''} ${i18n[currentLang].stat_built.toLowerCase()}`, 't-built');
  } else {
    hideoutBuilt.delete(key);
    toast(i18n[currentLang].toast_lvl_undo.replace('{0}', level), 't-unfound');
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
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  if (currentPage === 'kappa') {
    if (!confirm(i18n[currentLang].confirm_reset_kappa)) return;
    kappaFound.clear(); saveKappa(); updateKappaStats(); renderKappa(); toast(i18n[currentLang].toast_kappa_reset, 't-unfound');
  } else if (currentPage === 'hideout') {
    if (!confirm(i18n[currentLang].confirm_reset_hideout)) return;
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
    toast(i18n[currentLang].toast_hideout_reset, 't-unfound');
  }
  updateHomeMini();
});

document.getElementById('btn-reset-quests')?.addEventListener('click', () => {
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  if (!confirm(i18n[currentLang].confirm_reset_quests)) return;
  questsCompleted.clear();
  questsActive.clear();
  targetQuestId = null;
  saveQuests();
  updateQuestStats();
  renderQuests();
  renderQuestTarget();
  updateHomeMini();
  toast(i18n[currentLang].toast_quests_reset, 't-unfound');
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
  document.getElementById('scanner-status').textContent = i18n[currentLang].ui_scanner_ocr;
  tesseractWorker = await Tesseract.createWorker();
  await tesseractWorker.loadLanguage('eng');
  await tesseractWorker.initialize('eng');
  // Parametrizar para nombres de items (whitelist o similar si fuera necesario)
}

async function startScanner(mode) {
  if (isReadOnly && mode !== 'valuation') { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  scannerMode = mode;
  scannerActive = true;
  document.getElementById('scanner-modal').classList.add('active');

  const modeName = i18n[currentLang][`ui_mode_${mode}`] || mode.toUpperCase();
  document.getElementById('scanner-type-label').textContent = i18n[currentLang].ui_scanner_mode.replace('{0}', modeName);

  document.getElementById('scanner-match-name').textContent = i18n[currentLang].ui_scanner_focus;
  document.getElementById('scanner-status').textContent = i18n[currentLang].ui_scanner_init;

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
    document.getElementById('scanner-status').textContent = i18n[currentLang].ui_scanner_realtime;
    requestAnimationFrame(scannerLoop);
  } catch (err) {
    console.error('Error cámara:', err);
    document.getElementById('scanner-status').textContent = i18n[currentLang].ui_camera_error;
    toast(i18n[currentLang].toast_camera_error, 't-unfound');
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
  let candidates = [];
  if (scannerMode === 'kappa') candidates = kappaItems;
  else if (scannerMode === 'hideout') candidates = consolidatedHideoutItems;
  else if (scannerMode === 'quests_active') candidates = quests;
  else if (scannerMode === 'valuation') {
    // For valuation, we might need a broader list, but let's use kappaItems + consolidated
    // or better, if we have a full item list cached somewhere.
    // For now, let's merge the ones we have.
    candidates = [...kappaItems, ...consolidatedHideoutItems];
  }
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
    display.textContent = `${i18n[currentLang].ui_detected}: ${bestMatch.name}`;

    // Si la coincidencia es muy alta, marcar automáticamente
    if (bestScore > 0.7) {
      if (scannerMode === 'kappa') {
        if (!kappaFound.has(bestMatch.id)) {
          toggleKappa(bestMatch.id);
          scannerCooldown = 60; // Pausa para feedback
          visualFeedback(true);
        }
      } else if (scannerMode === 'hideout') {
        const status = getItemStatus(bestMatch);
        if (status !== 'complete') {
          markHideoutItemAuto(bestMatch);
          scannerCooldown = 60;
          visualFeedback(true);
        }
      } else if (scannerMode === 'valuation') {
        // In valuation mode, we search and show the detail
        stopScanner();
        getEl('v-search').value = bestMatch.name;
        searchValuationItems(bestMatch.name).then(() => {
          showValuationDetail(bestMatch.id);
        });
        visualFeedback(true);
      } else if (scannerMode === 'quests_active') {
        if (!questsActive.has(bestMatch.id) && !questsCompleted.has(bestMatch.id)) {
          toggleActiveQuest(bestMatch.id);
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
  toast(i18n[currentLang].toast_scanned.replace('{0}', item.shortName || item.name), 't-built');
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
const QUESTS_QUERY = `query GetQuests($lang: LanguageCode, $gameMode: GameMode) {
  tasks(lang: $lang, gameMode: $gameMode) {
    id name minPlayerLevel experience kappaRequired
    trader { id name imageLink }
    map { id name normalizedName }
    taskRequirements { task { id name } status }
    objectives { 
      id type description 
      maps { id name normalizedName }
      ... on TaskObjectiveItem { item { id name shortName iconLink } count foundInRaid }
    }
    finishRewards {
      items { item { id name iconLink } count }
      traderStanding { trader { id name } standing }
    }
    wikiLink
  }
}`;

async function loadQuests() {
  setDisp('q-loading', 'flex');
  setDisp('q-error', 'none');
  setDisp('q-content', 'none');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUESTS_QUERY,
        variables: { lang: currentLang, gameMode }
      })
    });
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

  let html = `<div class="trader-btn ${activeTraderFilter === 'all' ? 'active' : ''}" onclick="filterByTrader('all')">${i18n[currentLang].ui_all}</div>`;
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
  const flowContainer = document.getElementById('q-flow-container');
  const q = questSearch.toLowerCase();

  if (questFilter === 'kappa') {
    list.style.display = 'none';
    flowContainer.style.display = 'block';
    renderKappaFlowchart();
    return;
  }

  list.style.display = 'flex';
  flowContainer.style.display = 'none';

  const filtered = quests.filter(quest => {
    const ms = !q || quest.name.toLowerCase().includes(q);
    const mt = activeTraderFilter === 'all' || (quest.trader && quest.trader.id === activeTraderFilter);

    const isComp = questsCompleted.has(quest.id);
    const isAvail = isQuestAvailable(quest);
    const isActive = questsActive.has(quest.id);

    let mf = true;
    if (questFilter === 'completed') mf = isComp;
    else if (questFilter === 'active') mf = isActive || (!isComp && !isAvail);
    else if (questFilter === 'locked') mf = !isComp && !isAvail;

    return ms && mt && mf;
  }).sort((a, b) => {
    if (questFilter === 'active') {
      const aAct = questsActive.has(a.id) ? 1 : 0;
      const bAct = questsActive.has(b.id) ? 1 : 0;
      if (aAct !== bAct) return bAct - aAct;
      return (a.minPlayerLevel || 0) - (b.minPlayerLevel || 0);
    }
    const wa = a.trader ? getTraderWeight(a.trader.name) : 999;
    const wb = b.trader ? getTraderWeight(b.trader.name) : 999;
    if (wa !== wb) return wa - wb;
    return (a.minPlayerLevel || 0) - (b.minPlayerLevel || 0);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${i18n[currentLang].ui_no_results}</div>`;
    return;
  }

  list.innerHTML = filtered.map(quest => {
    const isComp = questsCompleted.has(quest.id);
    const isActive = questsActive.has(quest.id);
    const isAvail = isQuestAvailable(quest);
    let statusClass = isComp ? 'is-completed' : (isActive ? 'is-active' : (isAvail ? 'is-available' : 'is-locked'));
    const isTarget = targetQuestId === quest.id;

    return `<div class="quest-item ${statusClass}" onclick="showQuestDetail('${quest.id}')">
      <div class="quest-status-icon">${isComp ? '✅' : (isActive ? '🔥' : (isAvail ? '🔓' : '🔒'))}</div>
      <div class="quest-info">
        <div class="quest-item-name">${quest.name}</div>
        <div class="quest-item-trader">${quest.trader ? quest.trader.name : 'Unknown'}</div>
      </div>
      <div style="display:flex; align-items:center; gap:.5rem">
        <div class="quest-item-level">LVL ${quest.minPlayerLevel || 1}</div>
        <button class="btn-quest-target ${isTarget ? 'active' : ''}" 
                onclick="event.stopPropagation(); setQuestGoal('${quest.id}')" 
                title="${isTarget ? i18n[currentLang].ui_goal_active : i18n[currentLang].ui_set_goal}">
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
  const isActive = questsActive.has(quest.id);
  const container = document.getElementById('quest-detail-body');

  let reqsHtml = '';
  if (quest.minPlayerLevel > 1) {
    reqsHtml += `<div class="q-req-item met">${i18n[currentLang].ui_quest_lvl.replace('{0}', quest.minPlayerLevel)}</div>`;
  }
  if (quest.taskRequirements && quest.taskRequirements.length) {
    quest.taskRequirements.forEach(r => {
      if (!r.task) return;
      const met = questsCompleted.has(r.task.id);
      reqsHtml += `<div class="q-req-item ${met ? 'met' : 'not-met'}">
        ${met ? '✅' : '❌'} ${i18n[currentLang].ui_quest_req.replace('{0}', r.task.name)}
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
          ${isItem ? `<div style="font-size:0.75rem; color:var(--text3)">${i18n[currentLang].ui_quest_need.replace('{0}', o.count).replace('{1}', o.item.name).replace('{2}', o.foundInRaid ? '(FIR)' : '')}</div>` : ''}
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
          ${quest.map ? `<a href="https://tarkov.dev/map/${quest.map.normalizedName}" target="_blank" class="quest-map-link" onclick="event.stopPropagation()">📍 ${i18n[currentLang].ui_map}: ${quest.map.name}</a>` : ''}
          ${quest.wikiLink ? `<a href="${quest.wikiLink}" target="_blank" class="quest-wiki-link" onclick="event.stopPropagation()">📖 Wiki</a>` : ''}
        </div>
      </div>
      <div class="quest-item-level" style="font-size:1.2rem">${i18n[currentLang].ui_level} ${quest.minPlayerLevel || 1}</div>
    </div>
    
    <div class="q-req-box">
      <div class="q-req-title">${i18n[currentLang].ui_requirements}</div>
      <div class="q-req-list">
        ${reqsHtml || `<div class="q-req-item met">${i18n[currentLang].ui_none}</div>`}
      </div>
    </div>
    
    <div class="q-obj-section">
      <div class="q-obj-title">${i18n[currentLang].ui_objectives}</div>
      <div class="q-obj-list">${objHtml || i18n[currentLang].ui_none}</div>
    </div>
    
    <div class="q-obj-section">
      <div class="q-obj-title">${i18n[currentLang].ui_rewards}</div>
      <div class="q-reward-grid">${rewardHtml || i18n[currentLang].ui_none}</div>
    </div>
    
    <div style="display:flex; gap:1rem; margin-top:2rem; flex-wrap:wrap;">
      <button class="btn-toggle-quest ${isComp ? 'pending' : 'complete'}" style="flex:1" onclick="toggleQuest('${quest.id}')">
        ${isComp ? i18n[currentLang].ui_mark_pending : i18n[currentLang].ui_mark_complete}
      </button>
      ${!isComp ? `<button class="btn-toggle-quest ${isActive ? 'pending' : ''}" style="flex:1; border-color:var(--blue); color:var(--blue); background:${isActive ? 'rgba(96,165,250,0.1)' : 'transparent'};" onclick="toggleActiveQuest('${quest.id}')">
        ${isActive ? i18n[currentLang].ui_mark_pending : (i18n[currentLang].ui_mark_active || 'Marcar Activa')}
      </button>` : ''}
      <button class="btn btn-ghost" style="border:1px solid var(--accent); color:var(--accent); flex:1" onclick="setQuestGoal('${quest.id}')">
        🎯 ${i18n[currentLang].ui_set_goal}
      </button>
    </div>
  `;

  document.getElementById('quest-modal').classList.add('active');
}

function closeQuestDetail() {
  document.getElementById('quest-modal').classList.remove('active');
  selectedQuest = null;
}

function renderKappaFlowchart() {
  const container = document.getElementById('q-flow-tree');
  if (!container) return;

  const kappaQuests = quests.filter(q => q.kappaRequired);
  if (!kappaQuests.length) {
    container.innerHTML = '<div class="empty-state">No se encontraron misiones de Kappa</div>';
    return;
  }

  // Build dependency map
  const questMap = new Map();
  kappaQuests.forEach(q => questMap.set(q.id, q));

  // Determine tiers (depth)
  const tiersMap = new Map();
  const questToTier = new Map();

  function getTier(qId, visited = new Set()) {
    if (questToTier.has(qId)) return questToTier.get(qId);
    if (visited.has(qId)) return 0; // Prevent infinite loops
    visited.add(qId);

    const q = questMap.get(qId);
    if (!q || !q.taskRequirements || q.taskRequirements.length === 0) {
      questToTier.set(qId, 0);
      return 0;
    }

    let maxTier = -1;
    q.taskRequirements.forEach(req => {
      // Only care about requirements that are also Kappa quests
      if (req.task && questMap.has(req.task.id)) {
        maxTier = Math.max(maxTier, getTier(req.task.id, visited));
      }
    });

    const tier = maxTier + 1;
    questToTier.set(qId, tier);
    return tier;
  }

  kappaQuests.forEach(q => getTier(q.id));

  // Group by tier
  const tierGroups = [];
  questToTier.forEach((tier, qId) => {
    if (!tierGroups[tier]) tierGroups[tier] = [];
    tierGroups[tier].push(questMap.get(qId));
  });

  // Render
  container.innerHTML = tierGroups.map((group, tIdx) => `
    <div class="flow-level" data-tier="${tIdx}">
      ${group.sort((a, b) => (a.trader?.name || '').localeCompare(b.trader?.name || '')).map(q => {
    const isComp = questsCompleted.has(q.id);
    const isAvail = isQuestAvailable(q);
    const isActive = questsActive.has(q.id);
    const status = isComp ? 'is-completed' : (isActive ? 'is-active' : (isAvail ? 'is-available' : 'is-locked'));

    return `
          <div class="flow-node ${status}" onclick="showQuestDetail('${q.id}')">
            <div class="flow-node-trader">${q.trader ? q.trader.name : ''}</div>
            <div class="flow-node-title" title="${q.name}">${q.name}</div>
            <div style="font-size: 0.6rem; margin-top: 4px; opacity: 0.8;">
              ${isComp ? '✅' : (isActive ? '🔥' : (isAvail ? '🔓' : '🔒'))} 
              LVL ${q.minPlayerLevel || 1}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `).join('<div style="height: 30px; border-left: 2px dashed var(--border); margin: -10px 0;"></div>');
}

function toggleQuest(id) {
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  const quest = quests.find(q => q.id === id);
  if (!quest) return;

  if (questsCompleted.has(id)) {
    // UNMARKING AS COMPLETED
    const dependents = findRecursiveDependents(id);
    if (dependents.length > 0) {
      const names = dependents.map(q => q.name).join('\n• ');
      if (!confirm(i18n[currentLang].confirm_unmark_dep.replace('{0}', names))) {
        return;
      }
      dependents.forEach(q => questsCompleted.delete(q.id));
    }
    questsCompleted.delete(id);
    toast(i18n[currentLang].toast_quest_pending.replace('{0}', quest.name), 't-unfound');
  } else {
    // MARKING AS COMPLETED
    const prerequisites = findRecursivePrerequisites(id);
    if (prerequisites.length > 0) {
      const names = prerequisites.map(q => q.name).join('\n• ');
      if (!confirm(i18n[currentLang].confirm_mark_pre.replace('{0}', names))) {
        return;
      }
      prerequisites.forEach(q => questsCompleted.add(q.id));
    }
    questsCompleted.add(id);
    questsActive.delete(id);
    toast(i18n[currentLang].toast_quest_completed_title.replace('{0}', quest.name), 't-found');
  }

  saveQuests();
  updateQuestStats();
  renderQuests();
  updateHomeMini();
  if (selectedQuest) {
    showQuestDetail(selectedQuest.id);
  }
}

function toggleActiveQuest(id) {
  if (isReadOnly) { toast(i18n[currentLang].msg_readonly, 't-unfound'); return; }
  const quest = quests.find(q => q.id === id);
  if (!quest) return;

  if (questsActive.has(id)) {
    questsActive.delete(id);
    toast(i18n[currentLang].toast_quest_pending.replace('{0}', quest.name), 't-unfound');
  } else {
    questsActive.add(id);
    questsCompleted.delete(id);

    // Automatically flag recursively all prerequisites to completed
    const prerequisites = findRecursivePrerequisites(id);
    if (prerequisites.length > 0) {
      prerequisites.forEach(q => {
        questsCompleted.add(q.id);
        questsActive.delete(q.id);
      });
      toast(`Misión activa y requisitos completados`, 't-found');
    } else {
      toast(`Misión activa: ${quest.name}`, 't-found');
    }
  }

  saveQuests();
  updateQuestStats();
  renderQuests();
  updateHomeMini();
  if (selectedQuest) showQuestDetail(selectedQuest.id);
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
    if (!confirm(i18n[currentLang].confirm_replace_goal.replace('{0}', oldQuest ? oldQuest.name : '???'))) {
      return;
    }
  }

  targetQuestId = id;
  renderQuestTarget();
  saveQuests();
  renderQuests(); // Refresh icons in list
  toast(i18n[currentLang].toast_goal_set, 't-found');
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

// ═══════════════════════════════
// VALUATION MODULE
// ═══════════════════════════════
const VALUATION_QUERY = `query GetItems($name: String, $lang: LanguageCode, $gameMode: GameMode) {
  items(name: $name, lang: $lang, gameMode: $gameMode) {
    id name shortName iconLink basePrice avg24hPrice width height
    sellFor { price currency source }
  }
}`;

async function searchValuationItems(query) {
  const resultsDiv = getEl('v-search-results');
  const initState = getEl('v-initial-state');
  const detailView = getEl('v-item-detail');

  if (!query || query.length < 2) {
    resultsDiv.innerHTML = '';
    initState.style.display = 'block';
    detailView.style.display = 'none';
    resultsDiv.style.display = 'grid'; // Ensure results grid is visible for next search
    return;
  }

  initState.style.display = 'none';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: VALUATION_QUERY,
        variables: { name: query, lang: currentLang, gameMode }
      })
    });
    const data = await res.json();
    valuationSearchResults = data.data.items || [];
    renderValuationResults();
  } catch (e) {
    console.error('Valuation search error:', e);
  }
}

function renderValuationResults() {
  const container = getEl('v-search-results');
  container.style.display = 'grid';
  getEl('v-item-detail').style.display = 'none';

  if (valuationSearchResults.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:2rem; color:var(--text3);">${i18n[currentLang].ui_none}</div>`;
    return;
  }

  container.innerHTML = valuationSearchResults.map(item => `
    <div class="v-search-item" onclick="showValuationDetail('${item.id}')">
      <img src="${item.iconLink}" class="v-item-icon" onerror="this.src='images/item_placeholder.webp'">
      <div style="flex:1">
        <div class="item-name" style="font-size:0.9rem">${item.name}</div>
        <div style="font-size:0.75rem; color:var(--text2)">${item.avg24hPrice ? formatRoubles(item.avg24hPrice) : i18n[currentLang].ui_no_flea_price}</div>
      </div>
    </div>
  `).join('');
}

function showValuationDetail(itemId) {
  const item = valuationSearchResults.find(i => i.id === itemId);
  if (!item) return;

  selectedValuationItem = item;
  getEl('v-search-results').style.display = 'none';
  const detail = getEl('v-item-detail');
  detail.style.display = 'block';

  const bestTrader = [...item.sellFor]
    .filter(s => s.source !== 'fleaMarket')
    .sort((a, b) => b.price - a.price)[0];

  const fleaPrice = item.avg24hPrice;

  detail.innerHTML = `
    <button class="detail-back" onclick="closeValuationDetail()" style="color:#a855f7">← ${i18n[currentLang].ui_back_search}</button>
    <div style="display:flex; align-items:center; gap:1.5rem; margin-bottom:2rem;">
      <img src="${item.iconLink}" style="width:80px; height:80px; background:#000; padding:10px; border-radius:12px; border:1px solid var(--border);">
    <div>
        <h2 style="font-family:'Rajdhani'; color:var(--text);">${item.name}</h2>
        <div style="display:flex; gap:10px; align-items:center;">
          <div style="color:var(--text3); font-size:0.8rem; text-transform:uppercase;">${item.width}x${item.height} ${i18n[currentLang].ui_slots}</div>
          <div style="font-size:0.7rem; color:var(--gold); background:rgba(201,168,76,0.1); padding:2px 6px; border-radius:4px; font-weight:bold; border:1px solid var(--border);">${gameMode === 'pve' ? 'PVE' : 'PVP'}</div>
        </div>
      </div>
    </div>

    <div class="v-price-card">
      <div>
        <div class="v-price-label">${i18n[currentLang].ui_flea_market}</div>
        <div class="v-price-value v-flea">${fleaPrice ? formatRoubles(fleaPrice) : `<span class="v-banned">${i18n[currentLang].ui_banned_flea}</span>`}</div>
      </div>
      <div style="text-align:right">
        <div class="v-price-label">${i18n[currentLang].ui_per_slot}</div>
        <div class="v-price-value" style="font-size:1.2rem; opacity:0.7;">${fleaPrice ? formatRoubles(Math.round(fleaPrice / (item.width * item.height))) : '-'}</div>
      </div>
    </div>

    <div class="v-price-card" style="margin-top:1rem;">
      <div>
        <div class="v-price-label">${i18n[currentLang].ui_best_trader}</div>
        <div class="v-price-value v-trader">${bestTrader ? formatRoubles(bestTrader.price) : i18n[currentLang].ui_not_available}</div>
      </div>
      <div style="text-align:right">
        <div class="v-price-label">${bestTrader ? bestTrader.source.toUpperCase() : i18n[currentLang].ui_vendor}</div>
        <div style="font-size:0.8rem; color:var(--text3);">${i18n[currentLang].ui_direct_sell}</div>
      </div>
    </div>

    <div style="margin-top:2rem; padding:1rem; background:rgba(255,255,255,0.02); border-radius:10px; border:1px solid var(--border);">
       <div class="v-price-label" style="text-align:center;">${i18n[currentLang].ui_add_info}</div>
       <div style="display:flex; justify-content:space-around; margin-top:10px;">
          <div style="text-align:center"><div style="color:var(--text3); font-size:0.7rem;">${i18n[currentLang].ui_base_price}</div><div style="font-weight:600;">${formatRoubles(item.basePrice)}</div></div>
          <div style="text-align:center"><div style="color:var(--text3); font-size:0.7rem;">WIKI</div><div><a href="https://escapefromtarkov.fandom.com/wiki/${item.name.replace(/ /g, '_')}" target="_blank" style="color:#a855f7; font-size:0.8rem;">${i18n[currentLang].ui_wiki_link}</a></div></div>
       </div>
    </div>
  `;
}

function closeValuationDetail() {
  selectedValuationItem = null;
  getEl('v-item-detail').style.display = 'none';
  getEl('v-search-results').style.display = 'grid';
  getEl('v-initial-state').style.display = 'none';
}

function formatRoubles(val) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);
}

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
  updateUI();
  updateHomeMini();

  const lvlInput = getEl('player-level-input');
  if (lvlInput) lvlInput.value = playerLevel;
  renderQuestTarget();
}

initApp();