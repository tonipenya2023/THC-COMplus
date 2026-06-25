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

let activeDesign = localStorage.getItem('thc-competition-design') || 'modern';
let classicSort = { key: 'name', direction: 'asc' };

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
  
  lastHash = currentHash;
  const isCompetitionsPage = currentHash === '#competitions';
  console.log("[THC Addon] Cambio de URL procesado. Nuevo hash:", currentHash, "| ¿Es competiciones?:", isCompetitionsPage);
  
  // Gestionar visibilidad del botón flotante
  let toggleBtn = document.getElementById('thc-toggle-view-btn');
  if (isCompetitionsPage) {
    if (!toggleBtn) {
      createToggleBtn();
    } else {
      toggleBtn.style.display = 'flex';
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
  } else {
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    closeOverlay();
  }
}

// Crear botón flotante de activación
function createToggleBtn() {
  const btn = document.createElement('button');
  btn.id = 'thc-toggle-view-btn';
  btn.className = 'thc-toggle-btn';
  btn.innerHTML = '🏆 Vista Optimizada';
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

// Crear el overlay HTML principal
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'thc-optimizer-overlay';
  
  const logoUrl = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
    ? chrome.runtime.getURL('thc_comp_logo.png')
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
