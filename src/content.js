// Content script para la extensión de competiciones de theHunter

let competitionsData = []; // Guardará las competiciones cargadas de la API
let activeFilters = {
  search: '',
  mapa: '',
  especie: '',
  estado: 'all', // 'all', 'active', 'upcoming'
  orden: 'time_asc' // 'time_asc', 'entrants_desc', 'name_asc'
};
let timerInterval = null;
let lastHash = null; // Evitar llamadas duplicadas

let userAccessToken = '';
let userCompetitionStates = {}; // key: id, value: state (0=not joinable, 1=joinable, 2=joined)
let currentUserId = null;
let favoriteCompetitionIds = new Set();
let joinedCompetitionMetrics = {};
let openClassicGroupId = null;
let officialDetailFrame = null;
let officialDetailLoadToken = 0;
let profileDashboardUsername = null;
let profileDashboardMountTimer = null;
let profileAchievementsDomObserver = null;

let activeDesign = localStorage.getItem('thc-competition-design') || 'modern';
let classicSort = { key: 'name', direction: 'asc' };

const PROFILE_HASH_PATTERN = /^#profile\/([^/]+)(?:(?:\/ranks(?:\/([^/]+))?)|(?:\/achievements(?:\/([^/]+))?)|(?:\/skills(?:\/([^/]+))?)|(?:\/statistics(?:\/([^/]+))?))?\/?$/;
const GRAFANA_PROFILE_DASHBOARD_URL = 'https://thc-addon.duckdns.org/public-dashboards/cb2e199e2d374da2a4bb2d20b4e01025';
const GRAFANA_PROFILE_ANIMALS_DASHBOARD_URL = 'https://thc-addon.duckdns.org/public-dashboards/fff95e6762304a2399395d7337a2c526';
const GRAFANA_PROFILE_WEAPONS_DASHBOARD_URL = 'https://thc-addon.duckdns.org/public-dashboards/a073af32d3ea42fd9e42d8190c489310';
const GRAFANA_PROFILE_COLLECTABLES_DASHBOARD_URL = 'https://thc-addon.duckdns.org/public-dashboards/60fa840e5d9245d2aeb26ab587918b68';
const GRAFANA_PROFILE_ACHIEVEMENTS_DASHBOARD_URLS = {
  animals: 'https://thc-addon.duckdns.org/public-dashboards/e321fbfcfa1c4376b35ac8951cd231a0',
  weapons: 'https://thc-addon.duckdns.org/public-dashboards/ae150c3a762c47ce93032dd0a3d5f079',
  exploration: 'https://thc-addon.duckdns.org/public-dashboards/46daaa63fdb34032b2227156f808f6d7',
  day_mission: 'https://thc-addon.duckdns.org/public-dashboards/61baa7ca8c2d4a5fb28bfecae244acf0',
  challenges: 'https://thc-addon.duckdns.org/public-dashboards/52df2309318e4d0a98ec707e703c30d6',
  summary: 'https://thc-addon.duckdns.org/public-dashboards/66acc2f7d1fc4cadb575a813cf3cfb77'
};
const GRAFANA_PROFILE_SKILLS_DASHBOARD_URLS = {};
const GRAFANA_PROFILE_STATISTICS_DASHBOARD_URLS = {};
const PROFILE_VISION_API_URL = 'http://127.0.0.1:8080/api/profile-vision-gral';
const PROFILE_ANIMALS_API_URL = PROFILE_VISION_API_URL;
const PROFILE_ACHIEVEMENT_SECTIONS = new Set(['animals', 'weapons', 'exploration', 'day_mission', 'challenges', 'summary']);
const PROFILE_SKILL_SECTIONS = new Set(['species', 'weapons']);
const PROFILE_STATISTICS_SECTIONS = new Set(['lifetime', 'history', 'best']);

const ANIMAL_ICON_FILES = {
  'alce': 'moose-male-common.png', 'banteng': 'banteng-male-common.png', 'bisonte': 'bisonte.png',
  'bufalo de agua': 'water-buffalo-male-common.png', 'cabra salvaje': 'cabra-salvaje.png', 'canguro rojo': 'canguro-rojo.png',
  'carnero de dall': 'carnero-de-dall.png', 'cerdo salvaje': 'feral-hog-male-common.png', 'ciervo axis': 'axis-deer-male-common.png',
  'ciervo mulo': 'ciervo-mulo.png', 'ciervo rojo': 'red-deer-male-common.png', 'ciervo sambar': 'sambar-deer-male-common.png',
  'ciervo sitka': 'ciervo-sitka.png', 'ciervo de cola blanca': 'ciervo-de-cola-blanca.png', 'ciervo de cola negra': 'ciervo-de-cola-negra.png',
  'ciervo de timor': 'rusa-deer-male-common.png', 'conejo europeo': 'conejo-europeo.png', 'conejo cola de algodon': 'conejo-cola-de-algodon.png',
  'corzo': 'roe-deer-male-common.png', 'corzonejo': 'roe-bit-male-common.png', 'coyote': 'coyote-male-common.png',
  'faisan': 'pheasant-male-common.png', 'gamo': 'gamo.png', 'ganso nival': 'ganso-nival.png',
  'ganso urraco': 'ganso-urraco.png', 'ganso de canada': 'canada-goose-male-common.png', 'hombre lobo': 'werewolf-male-common.png',
  'jabali': 'jabali.png', 'liebre americana': 'liebre-americana.png', 'lince rojo': 'bobcat-male-common.png',
  'lince boreal': 'eurasian-lynx-male-common.png', 'lobo gris': 'grey-wolf-male-common.png', 'muflon canadiense': 'muflon-canadiense.png',
  'oso grizzly': 'oso-grizzly.png', 'oso negro': 'oso-negro.png', 'oso pardo': 'brown-bear-male-common.png',
  'oso polar': 'polar-bear-male-common.png', 'pavo': 'turkey-male-common.png', 'perdiz nival': 'rock-ptarmigan-male-common.png',
  'perdiz nival de la tundra': 'perdiz-nival-de-la-tundra.png', 'perdiz de cola blanca': 'perdiz-de-cola-blanca.png', 'puma': 'puma-male-common.png',
  'reno': 'reindeer-male-common.png', 'wapiti de roosevelt': 'roosevelt-elk-male-common.png', 'wapiti de las rocosas': 'wapiti-de-las-rocosas.png',
  'urogallo comun': 'urogallo-comun.png', 'zorro rojo': 'red-fox-male-common.png',
  'zorro artico': 'arctic-fox-male-common.png', 'anade friso': 'anade-friso.png', 'anade rabudo': 'anade-rabudo.png',
  'anade real': 'anade-real.png', 'anade sombrio americano': 'anade-sombrio-americano.png', 'ibice alpino': 'ibice-alpino.png'
};

const RESERVE_ICON_FILES = {
  'whitehart island': 'whitehart-island.png', "logger's point": 'logger-s-point.png',
  'settler creeks': 'settler-creeks.png', 'redfeather falls': 'redfeather-falls.png',
  'hirschfelden': 'hirschfelden.png', 'hemmeldal': 'hemmeldal.png',
  'rougarou bayou': 'rougarou-bayou.png', 'val-des-bois': 'val-des-bois.png',
  'bushrangers run': 'bushrangers-run.png', 'whiterime ridge': 'whiterime-ridge.png',
  'timbergold trails': 'timbergold-trails.png', 'piccabeen bay': 'piccabeen-bay.png'
};

// Inicialización de la extensión al cargar la página
console.log("[THC Addon] Cargando content script...");
init();

async function init() {
  console.log("[THC Addon] Inicializando listeners...");
  userAccessToken = await retrieveAccessToken();
  console.log("[THC Addon] Token de acceso obtenido:", userAccessToken ? "SÍ" : "NO");
  
  if (userAccessToken) {
    await loadCurrentUser();
    await loadUserCompetitionStates();
  }
  
  // Escuchar cambios de hash en la URL
  window.addEventListener('hashchange', handleUrlChange);
  
  // Comprobación periódica por si el routing de la SPA no dispara hashchange
  setInterval(handleUrlChange, 1000);
  observeProfileAchievementsDom();
  
  // Comprobación inicial
  handleUrlChange();
}

// Obtener el token de acceso de la página comunicándose con el script de la MAIN world
function retrieveAccessToken() {
  return new Promise((resolve) => {
    let resolved = false;

    const handler = (e) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('THC_ACCESS_TOKEN_RESPONSE', handler);
      resolve(e.detail);
    };
    document.addEventListener('THC_ACCESS_TOKEN_RESPONSE', handler);

    // Solicitar el token al script de la MAIN world (inject.js)
    document.dispatchEvent(new CustomEvent('THC_ACCESS_TOKEN_REQUEST'));

    // Tiempo límite de espera (1.5s) antes de resolver como vacío por seguridad
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        document.removeEventListener('THC_ACCESS_TOKEN_RESPONSE', handler);
        resolve('');
      }
    }, 1500);
  });
}

function normalizeIconName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function extensionAssetUrl(path) {
  return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL(path)
    : path;
}

function renderMatchingIcons(value, catalog, folder, className) {
  const normalized = normalizeIconName(value);
  return Object.entries(catalog)
    .filter(([name]) => normalized.includes(name))
    .map(([name, file]) => '<img class="' + className + '" src="' + extensionAssetUrl('assets/' + folder + '/' + file) + '" alt="' + name + '">')
    .join('');
}

async function loadCurrentUser() {
  if (!userAccessToken) return;
  try {
    const response = await fetch('https://api.thehunter.com/v1/Me/me', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `oauth_access_token=${encodeURIComponent(userAccessToken)}`
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const user = await response.json();
    currentUserId = Number(user.id) || null;
    const stored = JSON.parse(localStorage.getItem(favoritesStorageKey()) || '[]');
    favoriteCompetitionIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch (error) {
    console.error('[THC Addon] Error al cargar el usuario:', error);
  }
}

function favoritesStorageKey() {
  return currentUserId ? `thc-competition-favorites:${currentUserId}` : '';
}

function toggleFavoriteCompetition(competitionId) {
  const key = favoritesStorageKey();
  if (!key) return;
  const id = String(competitionId);
  favoriteCompetitionIds.has(id) ? favoriteCompetitionIds.delete(id) : favoriteCompetitionIds.add(id);
  localStorage.setItem(key, JSON.stringify([...favoriteCompetitionIds]));
  applyFilters();
}

function renderFavoriteButton(comp) {
  const active = favoriteCompetitionIds.has(String(comp.id));
  const label = active ? 'Quitar de favoritas' : 'Marcar como favorita';
  return `<button type="button" class="thc-favorite-btn${active ? ' active' : ''}" data-favorite-id="${comp.id}" aria-pressed="${active}" aria-label="${label}" title="${label}">★</button>`;
}

// Obtener los estados de inscripción del usuario
async function loadUserCompetitionStates() {
  if (!userAccessToken) return;
  try {
    const response = await fetch('https://api.thehunter.com/v1/Page_content/competition_states', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `oauth_access_token=${userAccessToken}`
    });
    if (response.ok) {
      const states = await response.json();
      userCompetitionStates = {};
      joinedCompetitionMetrics = {};
      states.forEach(s => {
        userCompetitionStates[s.id] = Number(s.state);
        joinedCompetitionMetrics[s.id] = {
          attempts: Number(s.attempts) || 0,
          position: s.position == null ? null : Number(s.position)
        };
      });
      console.log("[THC Addon] Estados de competición cargados:", Object.keys(userCompetitionStates).length);
    }
  } catch (error) {
    console.error('Error al cargar estados de competiciones:', error);
  }
}

function handleUrlChange() {
  const currentHash = window.location.hash;
  
  // Si el hash no ha cambiado, no hacer nada
  if (currentHash === lastHash) {
    return;
  }
  
  const profileMatch = currentHash.match(PROFILE_HASH_PATTERN);
  const isCompetitionsPage = currentHash === '#competitions';
  const profileUsername = profileMatch ? decodeURIComponent(profileMatch[1]) : '';
  const profileRanksSection = profileMatch ? String(profileMatch[2] || '') : '';
  const profileAchievementsSection = profileMatch && currentHash.includes('/achievements')
    ? String(profileMatch[3] || 'summary')
    : '';
  const profileSkillsSection = profileMatch && currentHash.includes('/skills')
    ? String(profileMatch[4] || 'species')
    : '';
  const profileStatisticsSection = profileMatch && currentHash.includes('/statistics')
    ? String(profileMatch[5] || 'lifetime')
    : '';
  console.log("[THC Addon] Cambio de URL procesado. Nuevo hash:", currentHash, "| ¿Es competiciones?:", isCompetitionsPage);
  
  // Gestionar visibilidad del botón flotante
  let toggleBtn = document.getElementById('thc-toggle-view-btn');
  const profileDashboardLoader = profileUsername ? renderProfileDashboardLoading() : '';
  if (isCompetitionsPage) {
    closeProfileDashboard();
    if (!toggleBtn) {
      createToggleBtn();
    } else {
      toggleBtn.style.display = 'flex';
      configureCompetitionToggleButton(toggleBtn);
    }
    
    // Si no se ha inyectado el overlay, inyectarlo
    let overlay = document.getElementById('thc-optimizer-overlay');
    if (!overlay) {
      createOverlay();
      loadCompetitions();
    } else {
      // Si ya está inyectado y no está activo, activarlo por defecto
      if (!overlay.classList.contains('active')) {
        openOverlay();
      }
    }
    lastHash = currentHash;
  } else if (profileUsername && profileRanksSection === 'animals') {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileAnimals(profileUsername, profileDashboardLoader);
  } else if (profileUsername && profileRanksSection === 'weapons') {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileWeapons(profileUsername, profileDashboardLoader);
  } else if (profileUsername && profileRanksSection === 'collectables') {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileCollectables(profileUsername, profileDashboardLoader);
  } else if (profileUsername && PROFILE_ACHIEVEMENT_SECTIONS.has(profileAchievementsSection)) {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileAchievements(profileUsername, profileAchievementsSection, profileDashboardLoader);
  } else if (profileUsername && PROFILE_SKILL_SECTIONS.has(profileSkillsSection)) {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileGenericRows(profileUsername, 'skills', profileSkillsSection, profileDashboardLoader);
  } else if (profileUsername && PROFILE_STATISTICS_SECTIONS.has(profileStatisticsSection)) {
    lastHash = currentHash;
    closeOverlay();
    closeProfileDashboard();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileGenericRows(profileUsername, 'statistics', profileStatisticsSection, profileDashboardLoader);
  } else if (profileUsername && !profileRanksSection) {
    lastHash = currentHash;
    closeOverlay();
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    mountProfileDashboard(profileUsername, profileDashboardLoader);
  } else {
    lastHash = currentHash;
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    closeOverlay();
    closeProfileDashboard();
  }
}

// Crear botón flotante de activación
function observeProfileAchievementsDom() {
  if (profileAchievementsDomObserver || !document.body) return;
  profileAchievementsDomObserver = new MutationObserver(() => {
    if (!window.location.hash.includes('/achievements')) return;
    if (document.querySelector('.thc-profile-dashboard-inline[data-thc-profile-dashboard="vision-general"]')) return;
    lastHash = '';
    handleUrlChange();
  });
  profileAchievementsDomObserver.observe(document.body, { childList: true, subtree: true });
}

function createToggleBtn() {
  const btn = document.createElement('button');
  btn.id = 'thc-toggle-view-btn';
  btn.className = 'thc-toggle-btn';
  btn.textContent = 'Vista Optimizada';
  btn.addEventListener('click', () => {
    const overlay = document.getElementById('thc-optimizer-overlay');
    if (overlay) {
      if (overlay.classList.contains('active')) {
        closeOverlay();
      } else {
        openOverlay();
      }
    } else {
      createOverlay();
      loadCompetitions();
    }
  });
  document.body.appendChild(btn);
}

function configureCompetitionToggleButton(btn) {
  btn.textContent = 'Vista Optimizada';
  btn.onclick = () => {
    const overlay = document.getElementById('thc-optimizer-overlay');
    if (overlay) {
      if (overlay.classList.contains('active')) {
        closeOverlay();
      } else {
        openOverlay();
      }
    } else {
      createOverlay();
      loadCompetitions();
    }
  };
}

function mountProfileDashboard(username, loaderHtml) {
  profileDashboardUsername = username;
  closeProfileDashboard();
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileVisionGeneralContainer();
    if (!target) {
      if (attempts >= 80) clearProfileDashboardMountTimer();
      return;
    }

    clearProfileDashboardMountTimer();
    const payload = buildProfileVisionPayload(username, target);
    showProfileDashboardLoading(target, loaderHtml, 'vision-general');
    saveProfileVisionGeneral(payload).finally(() => {
      target.innerHTML = renderProfileDashboardFrame(username);
    });
  }, 100);
}

function mountProfileAnimals(username, loaderHtml) {
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileAnimalsContainer();
    if (!target) {
      if (attempts >= 80) clearProfileDashboardMountTimer();
      return;
    }

    clearProfileDashboardMountTimer();
    const dashboardHost = findProfileDashboardHost(target);
    showProfileDashboardLoading(dashboardHost, loaderHtml, 'vision-general');
    saveProfileAnimals(username, target).catch(error => {
      console.error('[THC Addon] Error al guardar especies del perfil:', error);
    }).finally(() => {
      dashboardHost.innerHTML = renderProfileAnimalsDashboardFrame(username);
    });
  }, 100);
}

function mountProfileWeapons(username, loaderHtml) {
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileRanksContainer();
    if (!target) {
      if (attempts >= 80) clearProfileDashboardMountTimer();
      return;
    }

    clearProfileDashboardMountTimer();
    const dashboardHost = findProfileDashboardHost(target);
    showProfileDashboardLoading(dashboardHost, loaderHtml, 'vision-general');
    saveProfileWeapons(username, target).catch(error => {
      console.error('[THC Addon] Error al guardar armas del perfil:', error);
    }).finally(() => {
      dashboardHost.innerHTML = renderProfileWeaponsDashboardFrame(username);
    });
  }, 100);
}

function mountProfileCollectables(username, loaderHtml) {
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileRanksContainer();
    if (!target) {
      if (attempts >= 80) clearProfileDashboardMountTimer();
      return;
    }

    clearProfileDashboardMountTimer();
    const dashboardHost = findProfileDashboardHost(target);
    showProfileDashboardLoading(dashboardHost, loaderHtml, 'vision-general');
    saveProfileCollectables(username, target).catch(error => {
      console.error('[THC Addon] Error al guardar coleccionables del perfil:', error);
    }).finally(() => {
      dashboardHost.innerHTML = renderProfileCollectablesDashboardFrame(username);
    });
  }, 100);
}

function mountProfileAchievements(username, section, loaderHtml) {
  clearProfileDashboardMountTimer();
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileAchievementsContainer(section);
    if (!target) {
      if (attempts >= 80) {
        clearProfileDashboardMountTimer();
        lastHash = '';
      }
      return;
    }

    clearProfileDashboardMountTimer();
    const dashboardHost = findProfileDashboardHost(target);
    const payload = buildProfileAchievementsPayload(username, section, target);
    showProfileDashboardLoading(dashboardHost, loaderHtml, 'vision-general');
    saveProfileAchievements(payload).catch(error => {
      console.error('[THC Addon] Error al guardar logros del perfil:', error);
    }).finally(() => {
      dashboardHost.innerHTML = renderProfileAchievementsDashboardFrame(username, section);
    });
  }, 100);
}

function mountProfileGenericRows(username, kind, section, loaderHtml) {
  let attempts = 0;
  profileDashboardMountTimer = setInterval(() => {
    attempts++;
    const target = findProfileGenericRowsContainer(kind);
    if (!target) {
      if (attempts >= 80) clearProfileDashboardMountTimer();
      return;
    }

    clearProfileDashboardMountTimer();
    const dashboardHost = findProfileDashboardHost(target);
    const payload = buildProfileGenericRowsPayload(username, kind, section, target);
    showProfileDashboardLoading(dashboardHost, loaderHtml, 'vision-general');
    saveProfileGenericRows(payload).catch(error => {
      console.error('[THC Addon] Error al guardar datos del perfil:', error);
    }).finally(() => {
      dashboardHost.innerHTML = renderProfileGenericRowsDashboardFrame(username, kind, section);
    });
  }, 100);
}

async function saveProfileVisionGeneral(payload) {
  if (!payload) return;
  const response = await fetch(PROFILE_VISION_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile vision save failed: ${response.status}`);
  }
}

async function saveProfileAnimals(username, target) {
  const payload = buildProfileAnimalsPayload(username, target);
  if (!payload) return;
  const response = await fetch(PROFILE_ANIMALS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile animals save failed: ${response.status}`);
  }
}

async function saveProfileWeapons(username, target) {
  const payload = buildProfileWeaponsPayload(username, target);
  if (!payload) return;
  const response = await fetch(PROFILE_VISION_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile weapons save failed: ${response.status}`);
  }
}

async function saveProfileCollectables(username, target) {
  const payload = buildProfileCollectablesPayload(username, target);
  if (!payload) return;
  const response = await fetch(PROFILE_VISION_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile collectables save failed: ${response.status}`);
  }
}

async function saveProfileAchievements(payload) {
  if (!payload) return;
  const response = await fetch(PROFILE_VISION_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile achievements save failed: ${response.status}`);
  }
}

async function saveProfileGenericRows(payload) {
  if (!payload) return;
  const response = await fetch(PROFILE_VISION_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`profile ${(payload && payload.kind) || 'generic'} save failed: ${response.status}`);
  }
}

function buildProfileVisionPayload(username, target) {
  const userId = currentUserId || readProfileUserId();
  if (!userId) {
    console.log('[THC Addon] No se envía visión general: falta user_id.', {
      username,
      currentUserId,
      pageUrl: window.location.href
    });
    return null;
  }
  const categories = readProfileVisionCategories(target);
  if (!categories.length) {
    console.log('[THC Addon] No se envía visión general: no se encontraron categorías.', {
      username,
      userId,
      pageUrl: window.location.href
    });
    return null;
  }
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    rank_image_url: readProfileRankImageUrl(target),
    categories
  };
}

function buildProfileAnimalsPayload(username, target) {
  const userId = currentUserId || readProfileUserId();
  if (!userId) return null;
  const species = readProfileAnimalRanks(target);
  if (!species.length) return null;
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    page_url: window.location.href,
    species
  };
}

function buildProfileWeaponsPayload(username, target) {
  const userId = currentUserId || readProfileUserId();
  if (!userId) return null;
  const weapons = readProfileWeaponRanks(target);
  if (!weapons.length) return null;
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    page_url: window.location.href,
    weapons
  };
}

function buildProfileCollectablesPayload(username, target) {
  const userId = currentUserId || readProfileUserId();
  if (!userId) return null;
  const collectables = readProfileCollectableRanks(target);
  if (!collectables.length) return null;
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    page_url: window.location.href,
    collectables
  };
}

function buildProfileAchievementsPayload(username, section, target) {
  const userId = currentUserId || readProfileUserId();
  if (!userId || !PROFILE_ACHIEVEMENT_SECTIONS.has(section)) return null;
  
  let rows;
  if (section === 'summary') {
    rows = readProfileAchievementsSummary(target);
  } else if (section === 'challenges') {
    rows = readProfileChallengeRows(target);
    console.log('[THC Addon] Datos obtenidos de logros desafíos:', {
      user_id: userId,
      profile_username: username,
      page_url: window.location.href,
      section,
      rows
    });
  } else {
    rows = readProfileAchievementRows(target);
  }
  
  if (!rows.length) return null;
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    page_url: window.location.href,
    section,
    rows
  };
}

function buildProfileGenericRowsPayload(username, kind, section, target) {
  const userId = currentUserId || readProfileUserId();
  const allowedSections = kind === 'skills' ? PROFILE_SKILL_SECTIONS : PROFILE_STATISTICS_SECTIONS;
  if (!userId || !allowedSections.has(section)) return null;
  const rows = readProfileGenericRows(target);
  if (!rows.length) return null;
  return {
    user_id: userId,
    profile_username: username,
    oauth_access_token: userAccessToken,
    page_url: window.location.href,
    kind,
    section,
    rows
  };
}

function readProfileUserId() {
  const match = document.documentElement.innerHTML.match(/"id"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function readProfileVisionCategories(target) {
  const result = [];
  const hunterScoreSource = target.querySelector('.hunterscore-bar');
  const hunterScore = readHunterScoreCategory(target, hunterScoreSource);
  if (hunterScore) result.push(hunterScore);
  const categoryNames = {
    animals: 'Animales',
    weapons: 'Armas',
    collectables: 'Coleccionables'
  };
  target.querySelectorAll('.rank-holder .rank-container').forEach(source => {
    const progressText = collectElementOwnDataText(source) || source.textContent || '';
    const title = progressText.match(/^\s*(Animals|Animales|Weapons|Armas|Collectables|Coleccionables)\b/i);
    if (!title) return;
    const categoria = categoryNames[normalizeProfileVisionCategoryKey(title[1])];
    result.push(readProgressCategory(categoria, source, source.previousElementSibling));
  });
  return result.filter(Boolean);
}

function normalizeProfileVisionCategoryKey(value) {
  const text = normalizeIconName(value);
  if (text === 'animales') return 'animals';
  if (text === 'armas') return 'weapons';
  if (text === 'coleccionables') return 'collectables';
  return text;
}

function readProfileAnimalRanks(target) {
  return Array.from(target.querySelectorAll('.rank-container'))
    .map((container, index) => readProfileAnimalRank(container, index + 1))
    .filter(Boolean);
}

function readProfileAnimalRank(container, rankOrder) {
  const title = container.querySelector('h4');
  const especie = title ? title.textContent.trim() : '';
  if (!especie) return null;
  const row = container.closest('tr') || container.parentElement || container;
  const progress = container.querySelector('.rank-progress');
  const rawPercentage = progress ? progress.getAttribute('data-percentage') : '';
  const valueElement = Array.from(container.querySelectorAll('.rank-bar-holder div'))
    .map(element => element.textContent.trim())
    .filter(Boolean)
    .find(text => /^\d+$/.test(text));
  const image = row.querySelector('img');
  return {
    orden: rankOrder,
    especie,
    valor_actual: valueElement ? Number(valueElement) : null,
    porcentaje_actual: rawPercentage ? Number(rawPercentage.replace('%', '').replace(',', '.')) : null,
    icon_url: image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null,
    texto: row.textContent.replace(/\s+/g, ' ').trim()
  };
}

function readProfileWeaponRanks(target) {
  return Array.from(target.querySelectorAll('.rank-container'))
    .map((container, index) => readProfileWeaponRank(container, index + 1))
    .filter(Boolean);
}

function readProfileWeaponRank(container, rankOrder) {
  const item = readProfileAnimalRank(container, rankOrder);
  if (!item) return null;
  return {
    orden: item.orden,
    arma: item.especie,
    valor_actual: item.valor_actual,
    porcentaje_actual: item.porcentaje_actual,
    icon_url: item.icon_url,
    texto: item.texto
  };
}

function readProfileCollectableRanks(target) {
  return Array.from(target.querySelectorAll('.rank-container'))
    .map((container, index) => readProfileCollectableRank(container, index + 1))
    .filter(Boolean);
}

function readProfileCollectableRank(container, rankOrder) {
  const item = readProfileAnimalRank(container, rankOrder);
  if (!item) return null;
  return {
    orden: item.orden,
    coleccionable: item.especie,
    valor_actual: item.valor_actual,
    porcentaje_actual: item.porcentaje_actual,
    icon_url: item.icon_url,
    texto: item.texto
  };
}

function readProfileAchievementRows(target) {
  const levelRows = readProfileAchievementLevelRows(target);
  if (levelRows.length) return levelRows;

  const candidates = Array.from(target.querySelectorAll('li, tr, .achievement, .achievement-row, .achievement-item, .media, .row'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .filter(element => normalizeWhitespace(element.textContent).length >= 3);
  const sourceRows = candidates.length ? candidates : Array.from(target.children);
  return sourceRows
    .map((element, index) => readProfileAchievementRow(element, index + 1))
    .filter(Boolean);
}

function readProfileAchievementRow(element, order) {
  const text = normalizeWhitespace(element.textContent);
  if (!text) return null;
  if (/^Cargando panel/i.test(text)) return null;
  const image = element.querySelector('img');
  const titleElement = element.querySelector('h1,h2,h3,h4,h5,.title,.name,strong,b') || image;
  const achievementTitle = normalizeWhitespace(titleElement ? (titleElement.getAttribute('alt') || titleElement.getAttribute('title') || titleElement.textContent) : '');
  const progress = parseProgressText(text);
  return {
    row_type: 'achievement',
    orden: order,
    achievement_title: achievementTitle || text.slice(0, 120),
    achievement_icon_url: image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null,
    completed: /completed|complete|unlocked|desbloqueado|completado/i.test(text),
    completed_count: progress ? progress.current : null,
    total_count: progress ? progress.total : null,
    progress_pct: progress ? progress.percent : null,
    raw_text: text
  };
}

const OFFICIAL_CHALLENGES = {
  'Assassin': { id: 15, desc: 'Kill three animals within 5 minutes', img: 'https://photo.thehunter.com/challenges/Assassin_150.png' },
  'Truffle Pig': { id: 17, desc: 'Find five mushrooms in one hunt', img: 'https://photo.thehunter.com/challenges/Truffle_Pig_150.png' },
  'Raining Ducks': { id: 19, desc: 'Kill three ducks with the same shot', img: 'https://photo.thehunter.com/challenges/Raining_Ducks_150.png' },
  'Far and Away': { id: 20, desc: 'Harvest a European Rabbit shot from over 250m', img: 'https://photo.thehunter.com/challenges/Far_and_Away_150.png' },
  'Far & Away': { id: 20, desc: 'Harvest a European Rabbit shot from over 250m', img: 'https://photo.thehunter.com/challenges/Far_and_Away_150.png' },
  'Fast Food': { id: 21, desc: 'Harvest 10 Roosevelt Elk within 5 minutes', img: 'https://photo.thehunter.com/challenges/Fast_Food_150.png' },
  'Triple Score': { id: 22, desc: 'Kill three land animals with the same shot', img: 'https://photo.thehunter.com/challenges/Triple_Score_150.png' },
  'Pincushion': { id: 23, desc: 'Hit the same animal five or more times with arrows', img: 'https://photo.thehunter.com/challenges/Pincushion_150.png' },
  'When Good Aim Goes Bad': { id: 24, desc: 'Read 20 blood tracks from the same animal', img: 'https://photo.thehunter.com/challenges/When_Good_Aim_Goes_Bad_150.png' },
  'Lucky Luke': { id: 25, desc: 'Kill an albino', img: 'https://photo.thehunter.com/challenges/Lucky Luke_150.png' },
  "Grandpa's Way": { id: 28, desc: 'Harvest a Brown Bear from over 150m with a classic rifle and no sight', img: "https://photo.thehunter.com/challenges/Grandpa's Way_150.png" },
  'Silent Sniper': { id: 29, desc: 'Harvest a Turkey that was shot from over 88m with a crossbow pistol with a heart shot.', img: 'https://photo.thehunter.com/challenges/Silent Sniper_150.png' }
};

function readProfileChallengeRows(target) {
  const candidates = Array.from(target.querySelectorAll('table.challenges tbody tr'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .filter(element => normalizeWhitespace(element.textContent).length >= 3);
  const sourceRows = candidates.length ? candidates : Array.from(target.children);
  return sourceRows
    .map((element, index) => readProfileChallengeRow(element, index + 1))
    .filter(Boolean);
}

function readProfileChallengeRow(element, order) {
  const text = normalizeWhitespace(element.textContent);
  if (!text) return null;
  if (/^Cargando panel/i.test(text)) return null;
  
  const image = element.querySelector('img');
  const titleElement = element.querySelector('h1,h2,h3,h4,h5,.title,.name,strong,b') || image;
  const achievementTitle = normalizeWhitespace(titleElement ? (titleElement.getAttribute('alt') || titleElement.getAttribute('title') || titleElement.textContent) : '');
  
  // Buscar coincidencia en el diccionario oficial
  let matchedKey = Object.keys(OFFICIAL_CHALLENGES).find(key => 
    achievementTitle.toLowerCase().includes(key.toLowerCase()) || 
    key.toLowerCase().includes(achievementTitle.toLowerCase())
  );
  
  let challengeId = 0;
  let description = '';
  let title = achievementTitle;

  if (matchedKey) {
    const official = OFFICIAL_CHALLENGES[matchedKey];
    challengeId = official.id;
    description = official.desc;
    // Si la coincidencia tiene '&', usamos el título oficial con 'and'
    title = matchedKey === 'Far & Away' ? 'Far and Away' : matchedKey;
  } else {
    // Fallback si no está mapeado estáticamente
    let cleanText = text;
    if (achievementTitle) {
      cleanText = cleanText.replace(achievementTitle, '');
    }
    cleanText = cleanText.replace(/\d+\s*\/\s*\d+\s*\(?\d*(?:[.,]\d+)?%?\)?/g, '');
    cleanText = cleanText.replace(/completed|complete|unlocked|desbloqueado|completado/i, '');
    description = normalizeWhitespace(cleanText);
  }
  
  // Buscar fecha en el texto (formato AAAA-MM-DD)
  const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  let completed = false;
  let challengeDate = null;
  
  if (dateMatch) {
    completed = true;
    challengeDate = dateMatch[0];
  } else {
    // Fallback: verificar si el icono está atenuado
    if (image) {
      const computedStyle = window.getComputedStyle(image);
      const hasGrayscaleFilter = computedStyle.filter?.includes('grayscale') || 
                                 computedStyle.webkitFilter?.includes('grayscale') ||
                                 image.classList.contains('attenuated') ||
                                 image.classList.contains('grayscale');
      const opacityValue = parseFloat(computedStyle.opacity || '1');
      const isAttenuated = hasGrayscaleFilter || opacityValue < 0.9;
      completed = !isAttenuated;
    }
  }

  // Obtener la URL de la imagen del DOM o del mapeo oficial
  let imageUrl = image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null;
  if (!imageUrl && matchedKey) {
    imageUrl = OFFICIAL_CHALLENGES[matchedKey].img;
  }
  
  if (imageUrl) {
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    // Si no está completado, aplicamos el filtro de escala de grises usando la CDN weserv.nl
    if (!completed) {
      const cleanUrl = imageUrl.replace(/^https?:\/\//i, '');
      imageUrl = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&filt=greyscale`;
    }
  }
  
  return {
    challenge_id: challengeId,
    title: title || text.slice(0, 120),
    description: description || null,
    image_url: imageUrl,
    completed: completed,
    in_progress: false,
    completed_count: null,
    total_count: null,
    progress_pct: null,
    challenge_date: challengeDate,
    orden: order,
    raw_text: text
  };
}


function readProfileAchievementsSummary(target) {
  const rows = [];
  target.querySelectorAll('.achievement-holder .achievement-container').forEach((container, index) => {
    const indicator = container.querySelector('.achievement-progress-indicator');
    const indicatorText = normalizeWhitespace(indicator ? indicator.textContent : '');
    const match = indicatorText.match(/^(.+?)\s+[^:]+:\s*(\d+)\s*\/\s*(\d+)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*%?\)?/);
    const progress = container.querySelector('.achievement-progress');
    let iconUrl = readCategoryIconUrl(container.previousElementSibling || container);
    const categoryTitle = match ? match[1].trim() : indicatorText;
    if (iconUrl && iconUrl.includes('achievement-progress-icons.png')) {
      const normTitle = categoryTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      let cacheKey = normTitle;
      if (normTitle.includes('explor')) {
        cacheKey = 'coleccionables';
      }
      const cachedUrl = localStorage.getItem(`thc-icon-${cacheKey}`);
      if (cachedUrl) {
        iconUrl = cachedUrl;
      } else {
        if (normTitle.includes('animal')) {
          iconUrl = 'https://static.thehunter.com/static/img/ranks/rank_animals.png';
        } else if (normTitle.includes('arma') || normTitle.includes('weapon')) {
          iconUrl = 'https://static.thehunter.com/static/img/ranks/rank_weapons.png';
        } else if (normTitle.includes('explor') || normTitle.includes('collect')) {
          iconUrl = 'https://static.thehunter.com/static/img/ranks/rank_collectables.png';
        }
      }
    }
    console.log(`[Logros Resumen] Categoría: "${categoryTitle}" -> URL Icono: ${iconUrl}`);
    rows.push({
      orden: index + 1,
      row_type: 'category_progress',
      category_title: categoryTitle,
      achievement_icon_url: iconUrl,
      completed_count: match ? Number(match[2]) : null,
      total_count: match ? Number(match[3]) : null,
      progress_pct: match ? Number(match[4].replace(',', '.')) : readPercentageAttribute(progress),
      raw_text: normalizeWhitespace(container.textContent)
    });
  });
  target.querySelectorAll('table.achievement-latest tbody tr').forEach((row, index) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) return;
    const image = cells[0].querySelector('img');
    const iconUrl = image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null;
    const title = normalizeWhitespace(cells[1].querySelector('b')?.textContent || '') || null;
    console.log(`[Logros Resumen] Reciente: "${title}" -> URL Icono: ${iconUrl}`);
    rows.push({
      orden: index + 1,
      row_type: 'latest',
      achievement_title: title,
      achievement_description: Array.from(cells[1].childNodes)
        .map(node => node.nodeType === Node.TEXT_NODE ? node.textContent : '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || null,
      achievement_icon_url: iconUrl,
      achievement_date: normalizeWhitespace(cells[2].textContent) || null,
      value: normalizeWhitespace(cells[3].textContent) || null,
      raw_text: normalizeWhitespace(row.textContent)
    });
  });
  const foundMatch = target.textContent.match(/(?:Achievements found|Logros encontrados)[^\d]*(\d+)/i);
  if (foundMatch) {
    rows.push({
      orden: rows.length + 1,
      row_type: 'statistic',
      metric_name: 'achievements_found',
      value: foundMatch[1]
    });
  }
  return rows;
}

function readProfileAchievementLevelRows(target) {
  const rows = [];
  target.querySelectorAll('.achievement-info').forEach((container, index) => {
    const titleText = normalizeWhitespace(container.querySelector('.title')?.textContent || '');
    const groupMatch = titleText.match(/^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)/);
    const image = container.closest('tr')?.querySelector('img[src*="/static/img/achievements/"]');
    const levelCells = container.querySelectorAll('.achievement-info-holder td');
    if (!levelCells.length && titleText) {
      rows.push({
        orden: index + 1,
        row_type: 'achievement',
        group_title: groupMatch ? groupMatch[1].trim() : titleText,
        completed_count: groupMatch ? Number(groupMatch[2]) : null,
        total_count: groupMatch ? Number(groupMatch[3]) : null,
        achievement_icon_url: image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null,
        raw_text: normalizeWhitespace(container.textContent)
      });
      return;
    }
    levelCells.forEach((cell, levelIndex) => {
      const progress = parseAchievementLevelProgress(cell);
      rows.push({
        orden: index + 1,
        level_order: levelIndex + 1,
        row_type: 'achievement_level',
        group_title: groupMatch ? groupMatch[1].trim() : titleText,
        completed_count: groupMatch ? Number(groupMatch[2]) : null,
        total_count: groupMatch ? Number(groupMatch[3]) : null,
        achievement_icon_url: image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null,
        level_value: readOwnText(cell.querySelector('.inner-content > .progress-text')) || null,
        level_title: normalizeWhitespace(cell.querySelector('.achievement-tooltip .title')?.textContent || '') || null,
        level_description: readAchievementTooltipDescription(cell),
        completed: cell.classList.contains('completed'),
        in_progress: cell.classList.contains('in-progress'),
        progress_value: progress.current,
        progress_target: progress.total,
        progress_pct: progress.percent,
        unlock_date: readAchievementUnlockDate(cell),
        raw_text: normalizeWhitespace(cell.textContent)
      });
    });
  });
  return rows;
}

function parseAchievementLevelProgress(cell) {
  const text = normalizeWhitespace(cell.textContent);
  const match = text.match(/(?:Progress|Progreso):\s*(\d+)\s*\/\s*(\d+)(?:\s*\((\d+(?:[.,]\d+)?)%\))?/i);
  if (!match) return { current: null, total: null, percent: null };
  const current = Number(match[1]);
  const total = Number(match[2]);
  return {
    current,
    total,
    percent: match[3] ? Number(match[3].replace(',', '.')) : Number(((current / total) * 100).toFixed(3))
  };
}

function readAchievementTooltipDescription(cell) {
  const tooltip = cell.querySelector('.achievement-tooltip');
  if (!tooltip) return null;
  const title = normalizeWhitespace(tooltip.querySelector('.title')?.textContent || '');
  const descriptions = Array.from(tooltip.querySelectorAll('.odd span'))
    .map(element => normalizeWhitespace(element.textContent))
    .filter(Boolean)
    .filter(text => !title || text !== title);
  return descriptions[0] || null;
}

function readAchievementUnlockDate(cell) {
  const match = cell.textContent.match(/(?:Unlock date|Fecha de desbloqueo):\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return match ? match[1] : null;
}

function readOwnText(element) {
  if (!element) return '';
  return Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readPercentageAttribute(element) {
  if (!element) return null;
  const value = element.getAttribute('data-percentage') || '';
  return value ? Number(value.replace('%', '').replace(',', '.')) : null;
}

function readProfileGenericRows(target) {
  const candidates = Array.from(target.querySelectorAll('li, tr, .row, .media, .skill, .skill-row, .stat, .stat-row'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .filter(element => normalizeWhitespace(element.textContent).length >= 2);
  const sourceRows = candidates.length ? candidates : Array.from(target.children);
  return sourceRows
    .map((element, index) => readProfileGenericRow(element, index + 1))
    .filter(Boolean);
}

function readProfileGenericRow(element, order) {
  const text = normalizeWhitespace(element.textContent);
  if (!text) return null;
  const image = element.querySelector('img');
  const titleElement = element.querySelector('h1,h2,h3,h4,h5,.title,.name,strong,b,dt') || image;
  const title = normalizeWhitespace(titleElement ? (titleElement.getAttribute('alt') || titleElement.getAttribute('title') || titleElement.textContent) : '');
  const progress = parseProgressText(text);
  const valueMatch = text.match(/[-+]?\d+(?:[.,]\d+)?/);
  return {
    row_type: 'row',
    orden: order,
    title: title || text.slice(0, 120),
    icon_url: image ? normalizeTheHunterAssetUrl(image.currentSrc || image.src) : null,
    value: text,
    value_num: valueMatch ? Number(valueMatch[0].replace(',', '.')) : null,
    progress_value: progress ? progress.current : null,
    progress_target: progress ? progress.total : null,
    progress_pct: progress ? progress.percent : null,
    raw_text: text
  };
}

function findProgressDataElements(target) {
  const seen = new Set();
  const candidates = Array.from(target.querySelectorAll('div, span, a, li'))
    .map(element => {
      const rect = element.getBoundingClientRect();
      const text = collectElementOwnDataText(element);
      return { element, rect, text };
    })
    .filter(item => /desbloqueado|unlocked|\d+\s*\/\s*\d+/i.test(item.text))
    .filter(item => item.rect.width >= 20 && item.rect.height >= 8)
    .filter(item => {
      const key = item.text.replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.rect.top - right.rect.top);
  return candidates.map(item => item.element);
}

function readHunterScoreCategory(target, source) {
  const parsed = source ? parseProgressText(collectElementOwnDataText(source) || source.textContent) : null;
  const current = parsed ? parsed.current : null;
  const total = parsed && parsed.total ? parsed.total : 115000;
  if (!current) return null;
  return {
    categoria: 'Puntuación del cazador',
    valor_actual: current,
    valor_total: total,
    porcentaje_actual: parsed && parsed.percent != null ? parsed.percent : Number(((current / total) * 100).toFixed(3)),
    icon_url: readCategoryIconUrl(source || target)
  };
}

function readProgressCategory(categoria, source, iconElement) {
  const text = source ? (collectElementOwnDataText(source) || source.textContent) : '';
  const parsed = parseProgressText(text);
  const iconUrl = readCategoryIconUrl(iconElement || source || document);
  if (iconUrl) {
    try {
      localStorage.setItem(`thc-icon-${normalizeIconName(categoria)}`, iconUrl);
    } catch (e) {}
  }
  return {
    categoria,
    valor_actual: parsed ? parsed.current : null,
    valor_total: parsed ? parsed.total : null,
    porcentaje_actual: parsed ? parsed.percent : null,
    icon_url: iconUrl
  };
}

function collectElementOwnDataText(element) {
  if (!element) return '';
  const values = [
    element.getAttribute('title'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-original-title'),
    element.getAttribute('data-tooltip'),
    element.getAttribute('data-content'),
    element.getAttribute('rel')
  ];
  Array.from(element.attributes || []).forEach(attribute => {
    if (/tooltip|title|progress|percent|unlocked|desbloqueado/i.test(attribute.name + attribute.value)) {
      values.push(attribute.value);
    }
  });
  return values.filter(Boolean).join(' ');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseProgressText(text) {
  const valueText = String(text || '');
  const unlocked = valueText.match(/(?:desbloqueado|unlocked)[^\d]*(\d+)\s*\/\s*(\d+)(?:[^\d]+(\d+(?:[.,]\d+)?)\s*%)?/i);
  if (unlocked) {
    const current = Number(unlocked[1]);
    const total = Number(unlocked[2]);
    return {
      current,
      total,
      percent: unlocked[3] ? Number(unlocked[3].replace(',', '.')) : Number(((current / total) * 100).toFixed(3))
    };
  }
  const ratio = valueText.match(/(\d+)\s*\/\s*(\d+)/);
  if (ratio) {
    const current = Number(ratio[1]);
    const total = Number(ratio[2]);
    return { current, total, percent: Number(((current / total) * 100).toFixed(3)) };
  }
  return null;
}

function readCategoryIconUrl(root) {
  if (!root) return null;
  const image = root.matches?.('img.rank-progress-icon')
    ? root
    : root.querySelector?.('img.rank-progress-icon');
  if (image) {
    return normalizeTheHunterAssetUrl(image.currentSrc || image.src);
  }
  try {
    const bg = window.getComputedStyle(root).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\((['"]?)(.*?)\1\)/);
      if (match) {
        return normalizeTheHunterAssetUrl(match[2]);
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function normalizeTheHunterAssetUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (url.startsWith('////')) return `https://${url.slice(4)}`;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function readProfileRankImageUrl(target) {
  const root = target || document;
  const ribbon = root.querySelector('img[src*="/static/img/profile/ribbons/"]')
    || document.querySelector('#profile img[src*="/static/img/profile/ribbons/"]');
  if (ribbon) return ribbon.currentSrc || ribbon.src;
  const images = Array.from(root.querySelectorAll('img'));
  const ranked = images
    .map(img => ({ img, rect: img.getBoundingClientRect() }))
    .filter(item => item.rect.height > item.rect.width && item.rect.height > 120)
    .sort((left, right) => right.rect.height - left.rect.height);
  return ranked[0] ? (ranked[0].img.currentSrc || ranked[0].img.src) : null;
}

function findProfileVisionGeneralContainer() {
  const ranksContent = document.querySelector('#profile_content .ranks-content');
  if (ranksContent) {
    const text = ranksContent.textContent || '';
    const rect = ranksContent.getBoundingClientRect();
    if (text.includes('Progreso') && /Categor/i.test(text) && rect.width >= 500 && rect.height >= 250) {
      return ranksContent;
    }
  }

  const profileContent = document.getElementById('profile_content');
  if (profileContent) {
    const text = profileContent.textContent || '';
    const rect = profileContent.getBoundingClientRect();
    if (text.includes('Progreso')
      && text.includes('PuntuaciÃ³n del Cazador')
      && text.includes('CategorÃ­as')
      && rect.width >= 500
      && rect.height >= 250) {
      return profileContent;
    }
  }

  const candidates = Array.from(document.querySelectorAll('div, section, article'))
    .filter(element => !element.closest('#thc-optimizer-overlay'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .filter(element => {
      const text = element.textContent || '';
      return text.includes('Progreso')
        && text.includes('Puntuación del Cazador')
        && text.includes('Categorías');
    })
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(item => item.rect.width >= 500 && item.rect.height >= 250)
    .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));

  return candidates.length ? candidates[0].element : null;
}

function findProfileDashboardHost(target) {
  return target.closest('.ranks-content, .achievements-content, .skills-content, .statistics-content') || target;
}

function findProfileAnimalsContainer() {
  return findProfileRanksContainer();
}

function findProfileRanksContainer() {
  const candidates = Array.from(document.querySelectorAll('div, section, article, table, tbody'))
    .filter(element => !element.closest('#thc-optimizer-overlay'))
    .filter(element => {
      const ranks = element.querySelectorAll('.rank-container h4');
      const icons = element.querySelectorAll('img[src*="/static/img/ranks/"]');
      return ranks.length >= 3 && icons.length >= 3;
    })
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(item => item.rect.width >= 300 && item.rect.height >= 150)
    .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));

  return candidates.length ? candidates[0].element : null;
}

function hasProfileAchievementsSectionContent(section, element) {
  if (!element) return false;
  if (section === 'summary') {
    const text = normalizeWhitespace(element.textContent);
    return Boolean(
      element.querySelector('.achievement-holder .achievement-container') ||
      element.querySelector('table.achievement-latest tbody tr') ||
      /Achievements found|Logros encontrados|Logros Recientes|Logros Desbloqueados/i.test(text)
    );
  }
  if (section === 'challenges') {
    return Boolean(element.querySelector('table.challenges tbody tr'));
  }
  return true;
}

function findProfileAchievementsContainer(section) {
  const achievementsContent = document.querySelector('#profile_content .achievements-content');
  if (achievementsContent) {
    const rect = achievementsContent.getBoundingClientRect();
    if (rect.width >= 300 && rect.height >= 120 && hasProfileAchievementsSectionContent(section, achievementsContent)) {
      return achievementsContent;
    }
  }

  const navigationText = /Ranks|Habilidades|Estadísticas|Galería|Trofeos|Perros|Amigos|Visión general|Animales|Armas|Exploración|Misiones Diarias|Challenges|Desaf/i;
  const sectionText = {
    summary: /Progreso|Logros Recientes|Logros Desbloqueados|Assassin|Truffle Pig/i,
    animals: /Animales|Animal|Animals|Capturas|Caza/i,
    weapons: /Armas|Weapon|Weapons|Rifle|Pistola|Escopeta|Bow/i,
    exploration: /Exploraci|Exploration|Reserva|Reserve/i,
    day_mission: /Misi|Misiones Diarias|Daily Mission|Dailies/i,
    challenges: /Challenges|Challenge|Desaf|Assassin|Truffle Pig|Raining Ducks|Far and Away|Fast Food|Triple Score|Pincushion|Lucky Luke/i
  };
  const contentPattern = sectionText[section] || /achievement|achievements|logro|logros/i;
  const candidates = Array.from(document.querySelectorAll('div, section, article, table, tbody, ul'))
    .filter(element => !element.closest('#thc-optimizer-overlay'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .map(element => {
      const text = normalizeWhitespace(element.textContent);
      const images = element.querySelectorAll('img');
      const rows = element.querySelectorAll('li, tr, .row, .media');
      const navigationItems = Array.from(element.querySelectorAll('a, button'))
        .filter(item => navigationText.test(normalizeWhitespace(item.textContent))).length;
      return {
        element,
        images: images.length,
        rows: rows.length,
        hasNavigation: navigationItems > 0,
        matchesSection: contentPattern.test(text),
        matchesGeneric: /achievement|achievements|logro|logros|unlocked|desbloqueado/i.test(text)
      };
    })
    .filter(item => (item.matchesSection || item.images >= 2 || item.rows >= 2 || item.matchesGeneric) && hasProfileAchievementsSectionContent(section, item.element))
    .map(item => ({ ...item, rect: item.element.getBoundingClientRect() }))
    .filter(item => item.rect.width >= 300 && item.rect.height >= 120)
    .sort((left, right) => {
      if (left.matchesSection !== right.matchesSection) return left.matchesSection ? -1 : 1;
      if (left.hasNavigation !== right.hasNavigation) return left.hasNavigation ? 1 : -1;
      return (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height);
    });

  return candidates.length ? candidates[0].element : null;
}

function findProfileGenericRowsContainer(kind) {
  const contentClass = kind === 'skills' ? 'skills-content' : 'statistics-content';
  const sectionContent = document.querySelector(`#profile_content .${contentClass}`);
  if (sectionContent) {
    const rect = sectionContent.getBoundingClientRect();
    if (rect.width >= 300 && rect.height >= 120) {
      return sectionContent;
    }
  }

  const profileContent = document.getElementById('profile_content');
  if (profileContent) {
    const text = normalizeWhitespace(profileContent.textContent);
    const rect = profileContent.getBoundingClientRect();
    const pattern = kind === 'skills'
      ? /skill|skills|habilidad|habilidades|weapon|weapons|arma|armas/i
      : /statistic|statistics|estad/i;
    if (pattern.test(text) && rect.width >= 300 && rect.height >= 120) {
      return profileContent;
    }
  }

  const pattern = kind === 'skills'
    ? /skill|skills|habilidad|habilidades|weapon|weapons|arma|armas/i
    : /statistic|statistics|estad/i;
  const candidates = Array.from(document.querySelectorAll('div, section, article, table, tbody, ul, dl'))
    .filter(element => !element.closest('#thc-optimizer-overlay'))
    .filter(element => !element.closest('.thc-profile-dashboard-inline'))
    .filter(element => {
      const text = normalizeWhitespace(element.textContent);
      const rows = element.querySelectorAll('li, tr, .row, .media, dt, dd');
      return rows.length >= 2 || pattern.test(text);
    })
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(item => item.rect.width >= 300 && item.rect.height >= 120)
    .sort((left, right) => (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));

  return candidates.length ? candidates[0].element : null;
}

function clearProfileDashboardMountTimer() {
  if (profileDashboardMountTimer) {
    clearInterval(profileDashboardMountTimer);
    profileDashboardMountTimer = null;
  }
}

// Crear el overlay HTML principal
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'thc-optimizer-overlay';
  
  const logoUrl = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
    ? chrome.runtime.getURL('thc-uicom+.png')
    : '';
  
  overlay.innerHTML = `
    <div class="thc-header">
      <div class="thc-header-container">
        <div class="thc-header-top">
          <div class="thc-title-area" style="display: flex; justify-content: space-between; align-items: center; width: 100%;"> 
            <div style="display: flex; align-items: center;">
              ${logoUrl ? `<img src="${logoUrl}" class="thc-logo-img" alt="THC Logo">` : ''} 
              <h1>&nbsp; &nbsp;THC-uiCOM+ | Competiciones | UI Overlay v1.23.06 |</h1> 
            </div>
            <span class="thc-subtitle" style="font-size: 0.75rem; opacity: 0.8; font-weight: normal; margin-left: auto; margin-right: 10px;">From THC-SUITE by Nefastix13</span>
          </div> 

          <div class="thc-design-switch" aria-label="Diseño de competiciones">
            <button type="button" data-design="modern">Actual</button>
            <button type="button" data-design="classic">Clásico</button>
          </div>
          <button class="thc-close-overlay" id="thc-close-btn" title="Cerrar vista optimizada">✕</button>
        </div>
        <div class="thc-filters-bar">
          <div class="thc-search-wrapper">
            <span class="thc-search-icon">🔍</span>
            <input type="text" id="thc-search" class="thc-search-input" placeholder="Buscar por nombre, animal, mapa...">
          </div>
          <div class="thc-stats-badge" id="thc-stats">0 competiciones</div>
        </div>
        <section class="thc-quick-filters-section" id="thc-quick-filters-section">
          <button type="button" class="thc-quick-filters-toggle" id="thc-quick-filters-toggle" aria-expanded="true" aria-controls="thc-quick-filters-content">
            <span>Filtros por especies y reservas</span><span class="thc-quick-filters-arrow">▼</span>
          </button>
          <div class="thc-quick-filters-container" id="thc-quick-filters-content">
          <div class="thc-quick-filter-row">
            <span class="thc-quick-filter-label">Especies:</span>
            <div class="thc-quick-filter-icons" id="thc-quick-species-container"></div>
          </div>
          <div class="thc-quick-filter-row">
            <span class="thc-quick-filter-label">Reservas:</span>
            <div class="thc-quick-filter-icons" id="thc-quick-reserves-container"></div>
          </div>
          </div>
        </section>
      </div>
    </div>
    <div class="thc-content-area">
      <div id="thc-comp-container" class="thc-comp-grid">
        <div class="thc-loading">
          <div class="thc-loading-spinner"></div>
          Cargando competiciones...
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  initializeOfficialDetailFrame();
  
  // Evitar que clics, mousedown, mouseup, pointerdown o pointerup dentro del overlay se propaguen al sitio nativo (previene interferencias de Backbone)
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(eventName => {
    overlay.addEventListener(eventName, (e) => {
      e.stopPropagation();
    });
  });
  
  // Agregar eventos a los elementos del DOM creados
  document.getElementById('thc-close-btn').addEventListener('click', closeOverlay);
  document.getElementById('thc-quick-filters-toggle').addEventListener('click', toggleQuickFilters);

  overlay.querySelectorAll('.thc-design-switch button').forEach(button => {
    button.addEventListener('click', () => setActiveDesign(button.dataset.design));
  });
  syncDesignState();
  
  document.getElementById('thc-search').addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    applyFilters();
  });
  

}

function toggleQuickFilters() {
  const section = document.getElementById('thc-quick-filters-section');
  const button = document.getElementById('thc-quick-filters-toggle');
  if (!section || !button) return;
  const collapsed = section.classList.toggle('collapsed');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.querySelector('.thc-quick-filters-arrow').textContent = collapsed ? '▶' : '▼';
}

function closeQuickFilters() {
  const section = document.getElementById('thc-quick-filters-section');
  const button = document.getElementById('thc-quick-filters-toggle');
  if (!section || !button) return;
  section.classList.add('collapsed');
  button.setAttribute('aria-expanded', 'false');
  button.querySelector('.thc-quick-filters-arrow').textContent = '▶';
}

function openOverlay() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (overlay) {
    // Obtener la altura de la cabecera oficial (statusbar) y asignarla a una variable CSS
    const statusbar = document.getElementById('statusbar-container');
    if (statusbar) {
      const menuHeight = statusbar.offsetHeight;
      document.documentElement.style.setProperty('--thc-menu-height', `${menuHeight}px`);
      statusbar.classList.add('thc-official-header-active');
    }
    
    overlay.classList.add('active');
    document.documentElement.classList.add('thc-overlay-active');
    document.body.classList.add('thc-overlay-active');
    
    // Iniciar timer dinámico
    if (!timerInterval) {
      timerInterval = setInterval(updateTimers, 1000);
    }
  }
}

function closeOverlay() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (overlay) {
    const statusbar = document.getElementById('statusbar-container');
    if (statusbar) {
      statusbar.classList.remove('thc-official-header-active');
    }
    document.documentElement.style.removeProperty('--thc-menu-height');
    
    overlay.classList.remove('active');
    document.documentElement.classList.remove('thc-overlay-active');
    document.body.classList.remove('thc-overlay-active');
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function closeProfileDashboard() {
  clearProfileDashboardMountTimer();
  document.querySelectorAll('.thc-profile-dashboard-inline').forEach(element => {
    const original = element.getAttribute('data-thc-profile-vision-original');
    if (original != null) element.innerHTML = original;
    element.classList.remove('thc-profile-dashboard-inline');
    element.removeAttribute('data-thc-profile-vision-original');
    element.removeAttribute('data-thc-profile-dashboard');
    element.style.removeProperty('--thc-profile-dashboard-height');
    element.style.removeProperty('--thc-profile-dashboard-offset-left');
  });
  const profile = document.getElementById('profile');
  profile?.classList.remove('thc-profile-dashboard-active');
}

function showProfileDashboardLoading(target, loaderHtml, variant) {
  if (!target) return;
  if (variant === 'vision-general') {
    const profile = document.getElementById('profile');
    if (profile) {
      profile.classList.add('thc-profile-dashboard-active');
      const profileRect = profile.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      target.style.setProperty('--thc-profile-dashboard-offset-left', `${Math.max(0, Math.ceil(targetRect.left - profileRect.left))}px`);
    }
  }
  if (variant === 'achievements') {
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--thc-profile-dashboard-height', `${Math.max(360, Math.ceil(rect.height))}px`);
  }
  target.setAttribute('data-thc-profile-vision-original', target.innerHTML);
  target.classList.add('thc-profile-dashboard-inline');
  if (variant) target.setAttribute('data-thc-profile-dashboard', variant);
  target.innerHTML = loaderHtml;
}

function renderProfileDashboardLoading() {
  return '<div class="thc-profile-dashboard-loading"><div class="thc-profile-dashboard-loading-box"><div class="thc-profile-dashboard-loading-spinner"></div><div>Cargando panel...</div></div></div>';
}

function renderProfileDashboardFrame(username) {
  const dashboardUrl = buildProfileDashboardUrl(username);
  return renderProfileDashboardLayout(dashboardUrl, 'Dashboard Grafana');
}

function renderProfileDashboardLayout(dashboardUrl, title) {
  if (!dashboardUrl) {
    return '<div class="thc-profile-dashboard-layout"><div class="thc-profile-dashboard-empty">Dashboard pendiente de configurar.</div></div>';
  }
  return `<div class="thc-profile-dashboard-layout"><iframe class="thc-profile-dashboard-frame" title="${escapeHtml(title)}" src="${dashboardUrl}"></iframe></div>`;
}

function renderProfileAnimalsDashboardFrame(username) {
  const dashboardUrl = buildProfileAnimalsDashboardUrl(username);
  return renderProfileDashboardLayout(dashboardUrl, 'Dashboard Grafana especies');
}

function renderProfileWeaponsDashboardFrame(username) {
  const dashboardUrl = buildProfileWeaponsDashboardUrl(username);
  return renderProfileDashboardLayout(dashboardUrl, 'Dashboard Grafana armas');
}

function renderProfileCollectablesDashboardFrame(username) {
  const dashboardUrl = buildProfileCollectablesDashboardUrl(username);
  return renderProfileDashboardLayout(dashboardUrl, 'Dashboard Grafana coleccionables');
}

function renderProfileAchievementsDashboardFrame(username, section) {
  const dashboardUrl = buildProfileAchievementsDashboardUrl(username, section);
  return renderProfileDashboardLayout(dashboardUrl, 'Dashboard Grafana logros');
}

function renderProfileGenericRowsDashboardFrame(username, kind, section) {
  const dashboardUrl = kind === 'skills'
    ? buildProfileSkillsDashboardUrl(username, section)
    : buildProfileStatisticsDashboardUrl(username, section);
  const title = kind === 'skills'
    ? 'Dashboard Grafana habilidades'
    : 'Dashboard Grafana estadisticas';
  return renderProfileDashboardLayout(dashboardUrl, title);
}

function buildProfileDashboardUrl(username) {
  if (!GRAFANA_PROFILE_DASHBOARD_URL) return '';
  const url = new URL(GRAFANA_PROFILE_DASHBOARD_URL);
  url.searchParams.set('var-profile_username', username);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileAnimalsDashboardUrl(username) {
  if (!GRAFANA_PROFILE_ANIMALS_DASHBOARD_URL) return '';
  const url = new URL(GRAFANA_PROFILE_ANIMALS_DASHBOARD_URL);
  url.searchParams.set('var-profile_username', username);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileWeaponsDashboardUrl(username) {
  if (!GRAFANA_PROFILE_WEAPONS_DASHBOARD_URL) return '';
  const url = new URL(GRAFANA_PROFILE_WEAPONS_DASHBOARD_URL);
  url.searchParams.set('var-profile_username', username);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileCollectablesDashboardUrl(username) {
  if (!GRAFANA_PROFILE_COLLECTABLES_DASHBOARD_URL) return '';
  const url = new URL(GRAFANA_PROFILE_COLLECTABLES_DASHBOARD_URL);
  url.searchParams.set('var-profile_username', username);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileAchievementsDashboardUrl(username, section) {
  const dashboardUrl = GRAFANA_PROFILE_ACHIEVEMENTS_DASHBOARD_URLS[section] || '';
  if (!dashboardUrl) return '';
  const url = new URL(dashboardUrl);
  url.searchParams.set('var-profile_username', username);
  url.searchParams.set('var-section', section);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileSkillsDashboardUrl(username, section) {
  const dashboardUrl = GRAFANA_PROFILE_SKILLS_DASHBOARD_URLS[section] || '';
  if (!dashboardUrl) return '';
  const url = new URL(dashboardUrl);
  url.searchParams.set('var-profile_username', username);
  url.searchParams.set('var-section', section);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

function buildProfileStatisticsDashboardUrl(username, section) {
  const dashboardUrl = GRAFANA_PROFILE_STATISTICS_DASHBOARD_URLS[section] || '';
  if (!dashboardUrl) return '';
  const url = new URL(dashboardUrl);
  url.searchParams.set('var-profile_username', username);
  url.searchParams.set('var-section', section);
  if (currentUserId) url.searchParams.set('var-user_id', String(currentUserId));
  return url.toString();
}

// Cargar las competiciones desde la API nativa
async function loadCompetitions() {
  const container = document.getElementById('thc-comp-container');
  try {
    const response = await fetch('https://api.thehunter.com/v1/Page_content/list_competitions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'lang=es_ES'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const rawData = await response.json();
    
    // Procesar y parsear cada competición
    competitionsData = rawData.map(comp => {
      const parsedRules = parseRules(comp.type.rules);
      return {
        id: comp.id,
        name: comp.type.name,
        descShort: comp.type.descriptionShort,
        rulesHtml: comp.type.rules,
        image: comp.type.image.full,
        start: comp.start,
        end: comp.end,
        entrants: comp.entrants,
        attempts: comp.type.attempts,
        finished: comp.finished,
        prizes: comp.type.prizes || [],
        parsedRules: parsedRules
      };
    });
    
    // Rellenar selectores de mapas y especies dinámicamente
    renderQuickFilters(); 
    
    // Cargar estados del usuario
    await loadUserCompetitionStates();
    
    // Renderizar
    applyFilters();
    openOverlay();
    
  } catch (error) {
    console.error('Error cargando competiciones:', error);
    container.innerHTML = `
      <div class="thc-no-results" style="color: #fc8181;">
        ⚠️ Error al conectar con la API de theHunter. Asegúrate de estar logueado en la sesión oficial.<br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

// Rellenar los filtros con valores únicos
function populateFiltersDropdowns() {
  const mapas = new Set();
  const especies = new Set();
  
  competitionsData.forEach(comp => {
    if (comp.parsedRules.reserva && comp.parsedRules.reserva !== 'Desconocida') {
      mapas.add(comp.parsedRules.reserva);
    }
    if (comp.parsedRules.especie && comp.parsedRules.especie !== 'Desconocida') {
      especies.add(comp.parsedRules.especie);
    }
  });
  
  const selectMapa = document.getElementById('thc-filter-mapa');
  const selectEspecie = document.getElementById('thc-filter-especie');
  
  // Limpiar y dejar la opción por defecto
  selectMapa.innerHTML = '<option value="">Todas las Reservas</option>';
  selectEspecie.innerHTML = '<option value="">Todas las Especies</option>';
  
  // Ordenar alfabéticamente e insertar
  Array.from(mapas).sort().forEach(mapa => {
    selectMapa.innerHTML += `<option value="${mapa}">${mapa}</option>`;
  });
  
  Array.from(especies).sort().forEach(especie => {
    selectEspecie.innerHTML += `<option value="${especie}">${especie}</option>`;
  });
}

// Parsear las reglas en formato HTML para extraer información estructurada
function parseRules(rulesHtml) {
  const result = {
    especie: 'Desconocida',
    reserva: 'Desconocida',
    armas: 'Cualquiera',
    puntuacion: 'Puntuación más alta',
    requisitos: 'Ninguno'
  };

  if (!rulesHtml) return result;

  // Extraer Especies
  const especieMatch = rulesHtml.match(/Especies?:\s*([^<]+)/i);
  if (especieMatch) result.especie = especieMatch[1].trim();

  // Extraer Reservas
  const reservaMatch = rulesHtml.match(/Reservas?:\s*([^<]+)/i);
  if (reservaMatch) result.reserva = reservaMatch[1].trim();

  // Extraer Armas (buscando tras la cabecera <h4>Armas</h4> o <h4>Weapons</h4>)
  const armasMatch = rulesHtml.match(/<h4[^>]*>(?:Armas|Weapons)<\/h4>([^<]+)/i);
  if (armasMatch) result.armas = armasMatch[1].trim();

  // Extraer Puntuación
  const puntuacionMatch = rulesHtml.match(/<h4[^>]*>(?:puntuaci\u00f3n|scoring)<\/h4>([^<]+)/i);
  if (puntuacionMatch) result.puntuacion = puntuacionMatch[1].trim();

  // Extraer Requisitos especiales
  const requisitosMatch = rulesHtml.match(/<h4[^>]*>(?:Requisitos especiales|Special Requirements)<\/h4>([^<]+)/i);
  if (requisitosMatch) result.requisitos = requisitosMatch[1].trim();

  return result;
}

// Aplicar filtros y ordenación a las competiciones guardadas
function applyFilters() {
  const now = Date.now() / 1000;
  
  let filtered = competitionsData.filter(comp => {
    // 1. Filtro de búsqueda textual (nombre, descripción, mapa, especie)
    if (activeFilters.search) {
      const searchLower = activeFilters.search.toLowerCase();
      const matchName = comp.name.toLowerCase().includes(searchLower);
      const matchDesc = comp.descShort.toLowerCase().includes(searchLower);
      const matchMapa = comp.parsedRules.reserva.toLowerCase().includes(searchLower);
      const matchEspecie = comp.parsedRules.especie.toLowerCase().includes(searchLower);
      if (!matchName && !matchDesc && !matchMapa && !matchEspecie) return false;
    }
    
    // 2. Filtro de Reserva
    if (activeFilters.mapa) {
      const filterNorm = normalizeIconName(activeFilters.mapa);
      const compNorm = normalizeIconName(comp.parsedRules.reserva);
      if (!compNorm.includes(filterNorm)) {
        return false;
      }
    }
    
    // 3. Filtro de Especie
    if (activeFilters.especie) {
      const filterNorm = normalizeIconName(activeFilters.especie);
      const compNorm = normalizeIconName(comp.parsedRules.especie);
      if (!compNorm.includes(filterNorm)) {
        return false;
      }
    }
    
    // 4. Filtro de Estado
    if (activeFilters.estado !== 'all') {
      const isActive = now >= comp.start && now <= comp.end;
      const isUpcoming = now < comp.start;
      
      if (activeFilters.estado === 'active' && !isActive) return false;
      if (activeFilters.estado === 'upcoming' && !isUpcoming) return false;
    }
    
    return true;
  });
  
  // 5. Ordenar
  filtered.sort((a, b) => {
    if (activeFilters.orden === 'time_asc') {
      // Si no ha empezado, ordenar por tiempo para empezar. Si está activa, ordenar por tiempo para terminar.
      const timeA = now < a.start ? a.start - now : a.end - now;
      const timeB = now < b.start ? b.start - now : b.end - now;
      return timeA - timeB;
    } else if (activeFilters.orden === 'entrants_desc') {
      return b.entrants - a.entrants;
    } else if (activeFilters.orden === 'name_asc') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });
  
  // Renderizar la lista filtrada
  renderCompetitions(filtered);
  syncQuickFiltersUI();
}

// Renderizar la UI con la lista filtrada (Formato Tabla Premium)
function renderCompetitions(competitions) {
  parkOfficialDetailFrame();
  const container = document.getElementById('thc-comp-container');
  const statsBadge = document.getElementById('thc-stats');

  if (activeDesign === 'classic') {
    statsBadge.textContent = `${competitions.length} competición${competitions.length !== 1 ? 'es' : ''}`;
    renderClassicCompetitions(competitions, container);
    return;
  }

  statsBadge.textContent = `${competitions.length} competición${competitions.length !== 1 ? 'es' : ''}`;
  
  if (competitions.length === 0) {
    container.innerHTML = `
      <div class="thc-no-results">
        🔍 No se encontraron competiciones con los filtros seleccionados.
      </div>
    `;
    return;
  }
  
  const now = Date.now() / 1000;
  
  let tableHtml = `
    ${renderModernFavoritesGroup(competitions, now)}
    <table class="thc-table">
      <thead>
        <tr>
          <th>Competición</th>
          <th>Reserva</th>
          <th>Especie</th>
          <th>Armas</th>
          <th style="text-align: center;">Inscritos</th>
          <th style="text-align: center;">Estado / Tiempo</th>
          <th style="text-align: center;">Acción</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  tableHtml += competitions.map(comp => {
    const instanceId = comp.id;
    const isUpcoming = now < comp.start;
    const timeLeft = isUpcoming ? comp.start - now : comp.end - now;
    
    const timerClass = isUpcoming ? 'thc-timer-upcoming' : 'thc-timer-active';
    const timerLabel = isUpcoming ? 'Empieza en:' : 'Tiempo restante:';
    
    return `
      <tr class="thc-table-row" id="row-${instanceId}" data-comp-id="${comp.id}">
        <td class="thc-td-info">
          <div class="thc-table-comp-info">
            <img src="${comp.image}" alt="${comp.name}" class="thc-table-img" onerror="this.src='https://static.thehunter.com/static/img/competitions/compimages/comp_weight.png'">
            <div>
              <div class="thc-table-comp-title">${renderFavoriteButton(comp)}<div class="thc-table-comp-name">${comp.name}</div></div>
              <div class="thc-table-comp-desc">${comp.descShort}</div>
            </div>
          </div>
        </td>
        <td><span class="thc-badge thc-badge-reserva">📍 ${comp.parsedRules.reserva}</span></td>
        <td><span class="thc-badge thc-badge-especie">🦌 ${comp.parsedRules.especie}</span></td>
        <td><span class="thc-badge thc-badge-arma">🎯 ${comp.parsedRules.armas}</span></td>
        <td style="text-align: center;"><span class="thc-entrants-count">${comp.entrants}</span></td>
        <td style="text-align: center;">
          <div class="thc-table-timer">
            <span class="thc-timer-label-small">${timerLabel}</span>
            <div class="thc-timer-value ${timerClass}" data-end="${comp.end}" data-start="${comp.start}" data-id="${comp.id}">
              ${formatTimeRemaining(timeLeft)}
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <button class="thc-btn thc-btn-details" data-target="${instanceId}" data-competition="${comp.id}">Reglas</button>
        </td>
      </tr>
      
      <!-- Detalle oficial desplegable -->
      <tr class="thc-comp-details-panel" id="details-${instanceId}">
        <td colspan="7"><div class="thc-official-detail-host"></div></td>
      </tr>
    `;
  }).join('');
  
  tableHtml += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHtml;

  container.querySelectorAll('.thc-favorite-btn').forEach(button => {
    button.addEventListener('click', () => toggleFavoriteCompetition(button.dataset.favoriteId));
  });
  
  // Agregar eventos para desplegar reglas
  const detailButtons = container.querySelectorAll('.thc-btn-details');
  detailButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-target');
      const competitionId = e.target.getAttribute('data-competition');
      toggleDetailsPanel(id, competitionId);
    });
  });
}

function renderModernFavoritesGroup(competitions, now) {
  const favorites = competitions.filter(comp => favoriteCompetitionIds.has(String(comp.id)));
  return `
    <section class="thc-modern-favorites-group">
      <div class="thc-modern-favorites-title"><span>★ Competiciones favoritas (${favorites.length})</span></div>
      ${favorites.length ? `<div class="thc-modern-favorites-list">${favorites.map(comp => `
        <div class="thc-modern-favorite-item">
          ${renderFavoriteButton(comp)}
          <img src="${comp.image}" alt="" class="thc-modern-favorite-img">
          <span class="thc-modern-favorite-name">${comp.name}</span>
          <span class="thc-modern-favorite-reserve">${comp.parsedRules.reserva}</span>
          <span class="thc-timer-value" data-end="${comp.end}" data-start="${comp.start}" data-id="${comp.id}">${formatTimeRemaining((now < comp.start ? comp.start : comp.end) - now)}</span>
        </div>`).join('')}</div>` : '<div class="thc-modern-favorites-empty">No hay competiciones favoritas.</div>'}
    </section>`;
}

// Alternar panel de detalles (Fila de tabla expandida)
function toggleDetailsPanel(id, competitionId = id) {
  const panel = document.getElementById(`details-${id}`);
  const row = document.getElementById(`row-${id}`);
  if (panel) {
    const isActive = panel.classList.contains('active');
    
    // Opcional: Cerrar otros paneles abiertos
    document.querySelectorAll('.thc-comp-details-panel').forEach(p => {
      p.classList.remove('active');
    });
    document.querySelectorAll('.thc-table-row').forEach(r => {
      r.classList.remove('expanded');
    });
    
    if (!isActive) {
      panel.classList.add('active');
      if (row) row.classList.add('expanded');
      
      loadOfficialCompetitionDetails(panel, competitionId);
    }
  }
}

function initializeOfficialDetailFrame() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (!overlay) return null;
  let pool = document.getElementById('thc-official-detail-pool');
  if (!pool) {
    pool = document.createElement('div');
    pool.id = 'thc-official-detail-pool';
    overlay.appendChild(pool);
  }
  if (!officialDetailFrame || !document.contains(officialDetailFrame)) {
    officialDetailFrame = document.createElement('iframe');
    officialDetailFrame.className = 'thc-official-detail-frame';
    officialDetailFrame.title = 'Detalle oficial de la competición';
    officialDetailFrame.src = `${window.location.origin}/#competitions`;
    pool.appendChild(officialDetailFrame);
  }
  return officialDetailFrame;
}

function parkOfficialDetailFrame() {
  officialDetailLoadToken++;
  const pool = document.getElementById('thc-official-detail-pool');
  if (officialDetailFrame && pool && officialDetailFrame.parentElement !== pool) {
    const previousHost = officialDetailFrame.closest('.thc-official-detail-host');
    if (previousHost) {
      previousHost.removeAttribute('data-competition-id');
      previousHost.closest('.thc-official-detail-loaded')?.classList.remove('thc-official-detail-loaded');
    }
    pool.appendChild(officialDetailFrame);
  }
}

function loadOfficialCompetitionDetails(panel, competitionId) {
  if (!panel) return;
  const host = panel.querySelector('.thc-official-detail-host');
  const iframe = initializeOfficialDetailFrame();
  if (!host || !iframe) return;
  if (iframe.parentElement === host && host.getAttribute('data-competition-id') === String(competitionId)) return;

  parkOfficialDetailFrame();
  const loadToken = ++officialDetailLoadToken;
  panel.classList.remove('thc-official-detail-loaded');
  host.setAttribute('data-competition-id', competitionId);
  host.innerHTML = '<div class="thc-leaderboard-loading"><div class="thc-loading-spinner thc-loading-spinner-small"></div>Cargando detalle oficial...</div>';
  host.appendChild(iframe);

  const targetHash = `#competitions/details/${competitionId}`;
  try {
    if (iframe.contentWindow && iframe.contentWindow.location.origin === window.location.origin) {
      iframe.contentWindow.location.hash = targetHash;
    } else {
      iframe.src = `${window.location.origin}/${targetHash}`;
    }
  } catch (error) {
    iframe.src = `${window.location.origin}/${targetHash}`;
  }

  let attempts = 0;
  const waitForDetail = setInterval(() => {
    if (loadToken !== officialDetailLoadToken) {
      clearInterval(waitForDetail);
      return;
    }
    attempts++;
    try {
      const frameDocument = iframe.contentDocument;
      const officialDetail = frameDocument && frameDocument.getElementById('CompetitionDetails');
      const targetLink = officialDetail && officialDetail.querySelector(`a[href="${targetHash}"]`);
      if (!officialDetail || !targetLink) {
        if (attempts >= 200) {
          clearInterval(waitForDetail);
          host.removeAttribute('data-competition-id');
          host.innerHTML = '<div class="thc-official-detail-error">No se pudo cargar el detalle oficial.</div>';
          parkOfficialDetailFrame();
        }
        return;
      }

      clearInterval(waitForDetail);
      let current = officialDetail;
      while (current.parentElement && current.parentElement !== frameDocument.body) {
        Array.from(current.parentElement.children).forEach(sibling => {
          if (sibling !== current) sibling.style.display = 'none';
        });
        current.parentElement.style.width = '100%';
        current.parentElement.style.maxWidth = 'none';
        current.parentElement.style.margin = '0';
        current.parentElement.style.padding = '0';
        current = current.parentElement;
      }
      Array.from(frameDocument.body.children).forEach(sibling => {
        if (sibling !== current) sibling.style.display = 'none';
      });
      frameDocument.documentElement.style.background = '#111';
      frameDocument.documentElement.style.overflow = 'hidden';
      frameDocument.body.style.background = '#111';
      frameDocument.body.style.margin = '0';
      frameDocument.body.style.overflow = 'hidden';
      officialDetail.style.width = '100%';
      officialDetail.style.maxWidth = 'none';

      const updateHeight = () => {
        iframe.style.height = `${Math.ceil(officialDetail.getBoundingClientRect().height) + 4}px`;
      };
      updateHeight();
      const FrameResizeObserver = iframe.contentWindow.ResizeObserver;
      if (FrameResizeObserver) new FrameResizeObserver(updateHeight).observe(officialDetail);
      host.querySelector('.thc-leaderboard-loading')?.remove();
      panel.classList.add('thc-official-detail-loaded');
    } catch (error) {
      clearInterval(waitForDetail);
      host.removeAttribute('data-competition-id');
      host.innerHTML = '<div class="thc-official-detail-error">No se pudo cargar el detalle oficial.</div>';
      parkOfficialDetailFrame();
      console.error('[THC Addon] No se pudo cargar el detalle oficial:', error);
    }
  }, 50);
}
// Bucle para actualizar todas las cuentas atrás del renderizado
function updateTimers() {
  const now = Date.now() / 1000;
  const timers = document.querySelectorAll('.thc-timer-value');
  
  timers.forEach(timer => {
    const start = parseFloat(timer.getAttribute('data-start'));
    const end = parseFloat(timer.getAttribute('data-end'));
    const isUpcoming = now < start;
    const timeLeft = isUpcoming ? start - now : end - now;
    
    if (timeLeft <= 0) {
      timer.textContent = 'Finalizada';
      timer.className = 'thc-timer-value'; // Remover clases de colores activos
    } else {
      timer.textContent = formatTimeRemaining(timeLeft);
      
      // Actualizar etiqueta del temporizador y clase por si pasa de "Upcoming" a "Active"
      const label = timer.previousElementSibling;
      if (isUpcoming) {
        if (label && label.textContent !== 'Empieza en:') label.textContent = 'Empieza en:';
        if (!timer.classList.contains('thc-timer-upcoming')) {
          timer.classList.remove('thc-timer-active');
          timer.classList.add('thc-timer-upcoming');
        }
      } else {
        if (label && label.textContent !== 'Tiempo restante:') label.textContent = 'Tiempo restante:';
        if (!timer.classList.contains('thc-timer-active')) {
          timer.classList.remove('thc-timer-upcoming');
          timer.classList.add('thc-timer-active');
        }
      }
    }
  });
}

// Formatear los segundos restantes en un formato legible
function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Finalizada';
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

// --- FUNCIONES DE SOPORTE DE DISEÑO ---

function setActiveDesign(design) {
  activeDesign = design;
  localStorage.setItem('thc-competition-design', design);
  syncDesignState();
  applyFilters();
}

function syncDesignState() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (overlay) {
    overlay.setAttribute('data-design', activeDesign);
  }
  
  document.querySelectorAll('.thc-design-switch button').forEach(button => {
    if (button.dataset.design === activeDesign) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  if (activeDesign === 'classic') {
    document.body.classList.add('thc-classic-design-active');
  } else {
    document.body.classList.remove('thc-classic-design-active');
  }
}

// --- RENDERIZADO CLÁSICO ---

function renderClassicCompetitions(competitions, container) {
  const now = Date.now() / 1000;
  const sortedCompetitions = sortClassicCompetitions(competitions, now);
  const joinedCompetitions = sortedCompetitions
    .filter(comp => Number(userCompetitionStates[comp.id]) === 2)
    .sort((left, right) => {
      const leftPosition = joinedCompetitionMetrics[left.id] && joinedCompetitionMetrics[left.id].position;
      const rightPosition = joinedCompetitionMetrics[right.id] && joinedCompetitionMetrics[right.id].position;
      if (leftPosition == null && rightPosition == null) return 0;
      if (leftPosition == null) return 1;
      if (rightPosition == null) return -1;
      return leftPosition - rightPosition;
    });
  const groups = [
    { id: 'favorites', title: 'Competiciones favoritas', items: sortedCompetitions.filter(comp => favoriteCompetitionIds.has(String(comp.id))) },
    { id: 'available', title: 'Competiciones disponibles', items: sortedCompetitions },
    { id: 'joined', title: 'Competiciones inscritas', items: joinedCompetitions },
    { id: 'active', title: 'Competiciones activas', items: sortedCompetitions.filter(comp => now >= comp.start && now <= comp.end) }
  ];

  container.innerHTML = `
    <table class="thc-classic-table">
      <colgroup>
        <col class="thc-col-count"><col class="thc-col-toggle"><col class="thc-col-species">
        <col class="thc-col-competition"><col class="thc-col-reserves"><col class="thc-col-time">
      </colgroup>
      <thead><tr>
        <th><button type="button" class="thc-classic-sort" data-sort="entrants">Inscritos<span></span></button></th>
        <th aria-label="Desplegar"></th>
        <th><button type="button" class="thc-classic-sort" data-sort="species">Especies<span></span></button></th>
        <th><button type="button" class="thc-classic-sort" data-sort="name">Competición<span></span></button></th>
        <th><button type="button" class="thc-classic-sort" data-sort="reserves">Reservas<span></span></button></th>
        <th><button type="button" class="thc-classic-sort" data-sort="time">Tiempo<span></span></button></th>
      </tr></thead>
      ${groups.map(group => renderClassicGroup(group, now)).join('')}
    </table>`;

  updateClassicSortIndicators(container);
  container.querySelectorAll('.thc-classic-sort').forEach(button => {
    button.addEventListener('click', () => setClassicSort(button.dataset.sort));
  });
  container.querySelectorAll('.thc-classic-section-title').forEach(button => {
    button.addEventListener('click', () => toggleClassicGroup(button.dataset.group));
  });
  container.querySelectorAll('.thc-classic-row-toggle').forEach(button => {
    button.addEventListener('click', () => toggleClassicDetails(button.dataset.instance, button.dataset.competition));
  });
  container.querySelectorAll('.thc-favorite-btn').forEach(button => {
    button.addEventListener('click', () => toggleFavoriteCompetition(button.dataset.favoriteId));
  });
}

function sortClassicCompetitions(competitions, now) {
  const direction = classicSort.direction === 'asc' ? 1 : -1;
  const getters = {
    entrants: comp => Number(comp.entrants) || 0,
    species: comp => comp.parsedRules.especie || '',
    name: comp => comp.name || '',
    reserves: comp => comp.parsedRules.reserva || '',
    time: comp => now < comp.start ? comp.start : comp.end
  };
  const getValue = getters[classicSort.key] || getters.name;
  return [...competitions].sort((left, right) => {
    const a = getValue(left);
    const b = getValue(right);
    const comparison = typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'es');
    return comparison * direction;
  });
}

function setClassicSort(key) {
  classicSort = classicSort.key === key
    ? { key, direction: classicSort.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };
  applyFilters();
}

function updateClassicSortIndicators(container) {
  container.querySelectorAll('.thc-classic-sort').forEach(button => {
    const indicator = button.querySelector('span');
    indicator.textContent = button.dataset.sort === classicSort.key
      ? (classicSort.direction === 'asc' ? '▲' : '▼')
      : '';
  });
}

function renderClassicGroup(group, now) {
  const isOpen = group.id === openClassicGroupId;
  return `
    <tbody class="thc-classic-group${isOpen ? '' : ' collapsed'}" id="classic-group-${group.id}">
      <tr class="thc-classic-group-heading"><th colspan="6">
        <button type="button" class="thc-classic-section-title" data-group="${group.id}" aria-expanded="${isOpen}">
          <span>${group.title} (${group.items.length})</span><span class="thc-classic-section-arrow">${isOpen ? '▼' : '▶'}</span>
        </button>
      </th></tr>
      ${group.items.length ? group.items.map(comp => renderClassicCompetition(comp, group.id, now)).join('') : '<tr class="thc-classic-empty-row"><td colspan="6">Sin competiciones</td></tr>'}
    </tbody>`;
}

function renderClassicCompetition(comp, groupId, now) {
  const instanceId = `${groupId}-${comp.id}`;
  const isUpcoming = now < comp.start;
  const timeLeft = isUpcoming ? comp.start - now : comp.end - now;
  const reserveIcons = renderMatchingIcons(comp.parsedRules.reserva, RESERVE_ICON_FILES, 'reserves', 'thc-classic-reserve-icon');
  const animalIcons = renderMatchingIcons(comp.parsedRules.especie, ANIMAL_ICON_FILES, 'animals', 'thc-classic-animal-icon');
  const metrics = joinedCompetitionMetrics[comp.id] || {};
  const attemptsTotal = Number(comp.attempts) || 0;
  const attemptsRemaining = Math.max(0, attemptsTotal - (Number(metrics.attempts) || 0));
  const positionHtml = metrics.position == null
    ? '<span><b>Posición</b> Sin resultado</span>'
    : `<span><b>Posición</b> <strong class="thc-joined-position">${metrics.position}</strong></span>`;
  const joinedMeta = groupId === 'joined' ? `
    <div class="thc-joined-meta">
      <span><b>Intentos</b> ${attemptsRemaining}/${attemptsTotal}</span>
      ${positionHtml}
      <span><b>Inicio</b> ${formatCompetitionDate(comp.start)}</span>
      <span><b>Fin</b> ${formatCompetitionDate(comp.end)}</span>
    </div>` : '';

  return `
    <tr class="thc-classic-item" id="row-${instanceId}" data-comp-id="${comp.id}">
      <td><span class="thc-classic-count">${comp.entrants}</span></td>
      <td><button type="button" class="thc-classic-row-toggle" data-instance="${instanceId}" data-competition="${comp.id}" aria-label="Desplegar ${comp.name}">▶</button></td>
      <td><span class="thc-classic-icons">${animalIcons || `<img src="${comp.image}" alt="" class="thc-classic-animal-icon">`}</span></td>
      <td class="thc-classic-name"><div class="thc-classic-title">${renderFavoriteButton(comp)}<span>${comp.name}</span></div>${joinedMeta}</td>
      <td><span class="thc-classic-reserve">${reserveIcons}<span>${comp.parsedRules.reserva}</span></span></td>
      <td><span class="thc-timer-value" data-end="${comp.end}" data-start="${comp.start}" data-id="${comp.id}">${formatTimeRemaining(timeLeft)}</span></td>
    </tr>
    <tr class="thc-classic-details-row" id="details-${instanceId}"><td colspan="6">
      <div class="thc-official-detail-host"></div>
    </td></tr>`;
}

function formatCompetitionDate(timestamp) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(Number(timestamp) * 1000));
}

function toggleClassicGroup(groupId) {
  const group = document.getElementById(`classic-group-${groupId}`);
  const button = group ? group.querySelector('.thc-classic-section-title') : null;
  if (!group || !button) return;

  const isOpening = group.classList.contains('collapsed');
  if (isOpening) {
    closeQuickFilters();
    document.querySelectorAll('.thc-classic-group').forEach(otherGroup => {
      if (otherGroup !== group) {
        otherGroup.classList.add('collapsed');
        const otherBtn = otherGroup.querySelector('.thc-classic-section-title');
        if (otherBtn) {
          otherBtn.setAttribute('aria-expanded', 'false');
          const arrow = otherBtn.querySelector('.thc-classic-section-arrow');
          if (arrow) arrow.textContent = '▶';
        }
      }
    });
  }

  const collapsed = group.classList.toggle('collapsed');
  openClassicGroupId = collapsed ? null : groupId;
  button.setAttribute('aria-expanded', String(!collapsed));
  button.querySelector('.thc-classic-section-arrow').textContent = collapsed ? '▶' : '▼';
}

function toggleClassicDetails(instanceId, competitionId) {
  const panel = document.getElementById(`details-${instanceId}`);
  const row = document.getElementById(`row-${instanceId}`);
  if (!panel || !row) return;
  const willOpen = !panel.classList.contains('active');
  document.querySelectorAll('.thc-classic-details-row.active').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.thc-classic-item.expanded').forEach(item => {
    item.classList.remove('expanded');
    const toggle = item.querySelector('.thc-classic-row-toggle');
    if (toggle) toggle.textContent = '▶';
  });
  if (willOpen) {
    panel.classList.add('active');
    row.classList.add('expanded');
    row.querySelector('.thc-classic-row-toggle').textContent = '▼';
    loadOfficialCompetitionDetails(panel, competitionId);
  }
}

// --- FILTROS DE ICONOS RÁPIDOS ---

function renderQuickFilters() {
  const speciesContainer = document.getElementById('thc-quick-species-container');
  const reservesContainer = document.getElementById('thc-quick-reserves-container');
  if (!speciesContainer || !reservesContainer) return;

  // Renderizar Especies
  speciesContainer.innerHTML = Object.entries(ANIMAL_ICON_FILES)
    .map(([key, filename]) => {
      const tooltipName = key.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      return `<img src="${extensionAssetUrl('assets/animals/' + filename)}" 
                   class="thc-quick-filter-icon" 
                   data-species="${key}" 
                   title="${tooltipName}" 
                   alt="${key}">`;
    })
    .join('');

  // Renderizar Reservas
  reservesContainer.innerHTML = Object.entries(RESERVE_ICON_FILES)
    .map(([key, filename]) => {
      const tooltipName = key.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      return `<img src="${extensionAssetUrl('assets/reserves/' + filename)}" 
                   class="thc-quick-filter-icon" 
                   data-reserve="${key}" 
                   title="${tooltipName}" 
                   alt="${key}">`;
    })
    .join('');

  // Asignar listeners a especies
  speciesContainer.querySelectorAll('.thc-quick-filter-icon').forEach(icon => {
    icon.addEventListener('click', () => {
      const speciesKey = icon.dataset.species;
      const isAlreadyActive = icon.classList.contains('active');

      if (isAlreadyActive) {
        activeFilters.especie = '';
      } else {
        activeFilters.especie = speciesKey;
      }

      activeFilters.mapa = '';
      const selectMapa = document.getElementById('thc-filter-mapa');
      if (selectMapa) selectMapa.value = '';

      // Sincronizar select tradicional
      const selectEspecie = document.getElementById('thc-filter-especie');
      if (selectEspecie) {
        if (activeFilters.especie === '') {
          selectEspecie.value = '';
        } else {
          let matchedOptionValue = '';
          for (const option of selectEspecie.options) {
            if (option.value && normalizeIconName(option.value).includes(speciesKey)) {
              matchedOptionValue = option.value;
              break;
            }
          }
          selectEspecie.value = matchedOptionValue;
        }
      }

      applyFilters();
    });
  });

  // Asignar listeners a reservas
  reservesContainer.querySelectorAll('.thc-quick-filter-icon').forEach(icon => {
    icon.addEventListener('click', () => {
      const reserveKey = icon.dataset.reserve;
      const isAlreadyActive = icon.classList.contains('active');

      if (isAlreadyActive) {
        activeFilters.mapa = '';
      } else {
        activeFilters.mapa = reserveKey;
      }

      activeFilters.especie = '';
      const selectEspecie = document.getElementById('thc-filter-especie');
      if (selectEspecie) selectEspecie.value = '';

      // Sincronizar select tradicional
      const selectMapa = document.getElementById('thc-filter-mapa');
      if (selectMapa) {
        if (activeFilters.mapa === '') {
          selectMapa.value = '';
        } else {
          let matchedOptionValue = '';
          for (const option of selectMapa.options) {
            if (option.value && normalizeIconName(option.value).includes(reserveKey)) {
              matchedOptionValue = option.value;
              break;
            }
          }
          selectMapa.value = matchedOptionValue;
        }
      }

      applyFilters();
    });
  });
}

function syncQuickFiltersUI() {
  const speciesContainer = document.getElementById('thc-quick-species-container');
  const reservesContainer = document.getElementById('thc-quick-reserves-container');
  
  if (speciesContainer) {
    const currentSpeciesNorm = normalizeIconName(activeFilters.especie);
    speciesContainer.querySelectorAll('.thc-quick-filter-icon').forEach(icon => {
      const key = icon.dataset.species;
      if (currentSpeciesNorm && (currentSpeciesNorm === key || (currentSpeciesNorm.length > key.length && currentSpeciesNorm.includes(key)))) {
        icon.classList.add('active');
      } else {
        icon.classList.remove('active');
      }
    });
  }

  if (reservesContainer) {
    const currentReserveNorm = normalizeIconName(activeFilters.mapa);
    reservesContainer.querySelectorAll('.thc-quick-filter-icon').forEach(icon => {
      const key = icon.dataset.reserve;
      if (currentReserveNorm && (currentReserveNorm === key || (currentReserveNorm.length > key.length && currentReserveNorm.includes(key)))) {
        icon.classList.add('active');
      } else {
        icon.classList.remove('active');
      }
    });
  }
}
