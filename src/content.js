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
let competitionHistoryCache = {}; // Caché para almacenar el historial completo de las competiciones

let activeDesign = localStorage.getItem('thc-competition-design') || 'modern';
let classicSort = { key: 'name', direction: 'asc' };

const ANIMAL_ICON_FILES = {
  'ibice alpino': 'ibice-alpino.png', 'anade sombrio americano': 'anade-sombrio-americano.png',
  'zorro artico': 'arctic-fox-male-common.png', 'ciervo axis': 'axis-deer-male-common.png',
  'banteng': 'banteng-male-common.png', 'muflon canadiense': 'muflon-canadiense.png',
  'bisonte': 'bisonte.png', 'oso negro': 'oso-negro.png',
  'ciervo de cola negra': 'ciervo-de-cola-negra.png', 'lince rojo': 'bobcat-male-common.png',
  'oso pardo': 'brown-bear-male-common.png', 'ganso de canada': 'canada-goose-male-common.png',
  'conejo cola de algodon': 'conejo-cola-de-algodon.png', 'coyote': 'coyote-male-common.png',
  'carnero de dall': 'carnero-de-dall.png', 'lince boreal': 'eurasian-lynx-male-common.png',
  'conejo europeo': 'conejo-europeo.png', 'gamo': 'gamo.png', 'cabra salvaje': 'cabra-salvaje.png',
  'cerdo salvaje': 'feral-hog-male-common.png', 'anade friso': 'anade-friso.png',
  'lobo gris': 'grey-wolf-male-common.png', 'oso grizzly': 'oso-grizzly.png',
  'ganso urraco': 'ganso-urraco.png', 'anade real': 'anade-real.png', 'alce': 'moose-male-common.png',
  'ciervo mulo': 'ciervo-mulo.png', 'anade rabudo': 'anade-rabudo.png',
  'faisan': 'pheasant-male-common.png', 'oso polar': 'polar-bear-male-common.png',
  'puma': 'puma-male-common.png', 'ciervo rojo': 'red-deer-male-common.png',
  'zorro rojo': 'red-fox-male-common.png', 'canguro rojo': 'canguro-rojo.png',
  'reno': 'reindeer-male-common.png', 'perdiz nival': 'rock-ptarmigan-male-common.png',
  'wapiti de las rocosas': 'wapiti-de-las-rocosas.png', 'corzo': 'roe-deer-male-common.png',
  'wapiti de roosevelt': 'roosevelt-elk-male-common.png', 'ciervo de timor': 'rusa-deer-male-common.png',
  'ciervo sambar': 'sambar-deer-male-common.png', 'ciervo sitka': 'ciervo-sitka.png',
  'ganso nival': 'ganso-nival.png', 'liebre americana': 'liebre-americana.png',
  'pavo': 'turkey-male-common.png', 'bufalo de agua': 'water-buffalo-male-common.png',
  'ciervo de cola blanca': 'ciervo-de-cola-blanca.png', 'perdiz de cola blanca': 'perdiz-de-cola-blanca.png',
  'jabali': 'jabali.png', 'perdiz nival de la tundra': 'perdiz-nival-de-la-tundra.png',
  'urogallo comun': 'urogallo-comun.png'
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
      states.forEach(s => {
        userCompetitionStates[s.id] = s.state;
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
              <h1>&nbsp; &nbsp;THC-COMP+ Competiciones - UI Overlay</h1> 
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
          <div class="thc-select-wrapper">
            <select id="thc-filter-mapa" class="thc-filter-select">
              <option value="">Todas las Reservas</option>
            </select>
          </div>
          <div class="thc-select-wrapper">
            <select id="thc-filter-especie" class="thc-filter-select">
              <option value="">Todas las Especies</option>
            </select>
          </div>
          <div class="thc-select-wrapper">
            <select id="thc-filter-estado" class="thc-filter-select">
              <option value="all">Cualquier Estado</option>
              <option value="active">En curso</option>
              <option value="upcoming">Próximas</option>
            </select>
          </div>
          <div class="thc-select-wrapper">
            <select id="thc-filter-orden" class="thc-filter-select">
              <option value="time_asc">Tiempo restante (menor primero)</option>
              <option value="entrants_desc">Participantes (más popular)</option>
              <option value="name_asc">Nombre (A-Z)</option>
            </select>
          </div>
          <div class="thc-stats-badge" id="thc-stats">0 competiciones</div>
        </div>
        <div class="thc-quick-filters-container">
          <div class="thc-quick-filter-row">
            <span class="thc-quick-filter-label">Especies:</span>
            <div class="thc-quick-filter-icons" id="thc-quick-species-container"></div>
          </div>
          <div class="thc-quick-filter-row">
            <span class="thc-quick-filter-label">Reservas:</span>
            <div class="thc-quick-filter-icons" id="thc-quick-reserves-container"></div>
          </div>
        </div>
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
  
  // Evitar que clics, mousedown, mouseup, pointerdown o pointerup dentro del overlay se propaguen al sitio nativo (previene interferencias de Backbone)
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(eventName => {
    overlay.addEventListener(eventName, (e) => {
      e.stopPropagation();
    });
  });
  
  // Agregar eventos a los elementos del DOM creados
  document.getElementById('thc-close-btn').addEventListener('click', closeOverlay);

  overlay.querySelectorAll('.thc-design-switch button').forEach(button => {
    button.addEventListener('click', () => setActiveDesign(button.dataset.design));
  });
  syncDesignState();
  
  document.getElementById('thc-search').addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    applyFilters();
  });
  
  document.getElementById('thc-filter-mapa').addEventListener('change', (e) => {
    activeFilters.mapa = e.target.value;
    applyFilters();
  });
  
  document.getElementById('thc-filter-especie').addEventListener('change', (e) => {
    activeFilters.especie = e.target.value;
    applyFilters();
  });
  
  document.getElementById('thc-filter-estado').addEventListener('change', (e) => {
    activeFilters.estado = e.target.value;
    applyFilters();
  });
  document.getElementById('thc-filter-orden').addEventListener('change', (e) => {
    activeFilters.orden = e.target.value;
    applyFilters();
  });

  // Delegación de eventos en el contenedor de competiciones
  const compContainer = document.getElementById('thc-comp-container');
  if (compContainer) {
    compContainer.addEventListener('click', (e) => {
      // Delegación para colapsables clásicos (Clasificación/Historial)
      const classicDetailToggle = e.target.closest('.thc-classic-detail-toggle');
      if (classicDetailToggle) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const content = classicDetailToggle.nextElementSibling;
        const arrow = classicDetailToggle.querySelector('.thc-classic-detail-arrow');
        if (content && arrow) {
          const collapsed = content.style.display === 'none';
          content.style.display = collapsed ? 'block' : 'none';
          arrow.textContent = collapsed ? '▼' : '▶';
        }
        return;
      }

      // 1. Delegación para colapsar/desplegar el historial
      const toggle = e.target.closest('.thc-history-toggle');
      if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const section = toggle.closest('.thc-history-section');
        const container = section.querySelector('.thc-history-container');
        const arrow = toggle.querySelector('.thc-history-arrow');
        if (container && arrow) {
          const isCollapsed = container.style.display === 'none';
          if (isCollapsed) {
            container.style.display = 'block';
            arrow.textContent = '▼';
          } else {
            container.style.display = 'none';
            arrow.textContent = '▶';
          }
        }
        return;
      }

      // 2. Delegación para enlaces del historial (días)
      const dayLink = e.target.closest('.thc-history-day-link');
      if (dayLink) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const rowId = dayLink.getAttribute('data-row-id');
        const targetId = dayLink.getAttribute('data-target-id');
        console.log(`[THC Addon] Clic en día de historial detectado. Fila: ${rowId}, Destino: ${targetId}`);
        loadDetailsForId(rowId, targetId);
        return;
      }

      // 3. Delegación para botones de Unirse y Salir
      const btn = e.target.closest('button');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (btn.classList.contains('thc-btn-join')) {
          const compId = btn.getAttribute('data-id');
          joinCompetition(compId, btn);
        } else if (btn.classList.contains('thc-btn-leave')) {
          const compId = btn.getAttribute('data-id');
          leaveCompetition(compId, btn);
        }
        return;
      }
    });
  }
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
        finished: comp.finished,
        prizes: comp.type.prizes || [],
        parsedRules: parsedRules
      };
    });
    
    // Rellenar selectores de mapas y especies dinámicamente
    populateFiltersDropdowns();
    
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
    if (activeFilters.mapa && comp.parsedRules.reserva !== activeFilters.mapa) {
      return false;
    }
    
    // 3. Filtro de Especie
    if (activeFilters.especie && comp.parsedRules.especie !== activeFilters.especie) {
      return false;
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
  const container = document.getElementById('thc-comp-container');
  const statsBadge = document.getElementById('thc-stats');

  if (activeDesign === 'classic') {
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
    const isUpcoming = now < comp.start;
    const timeLeft = isUpcoming ? comp.start - now : comp.end - now;
    
    const timerClass = isUpcoming ? 'thc-timer-upcoming' : 'thc-timer-active';
    const timerLabel = isUpcoming ? 'Empieza en:' : 'Tiempo restante:';
    
    return `
      <tr class="thc-table-row" id="row-${comp.id}">
        <td class="thc-td-info">
          <div class="thc-table-comp-info">
            <img src="${comp.image}" alt="${comp.name}" class="thc-table-img" onerror="this.src='https://static.thehunter.com/static/img/competitions/compimages/comp_weight.png'">
            <div>
              <div class="thc-table-comp-name">${comp.name}</div>
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
          <button class="thc-btn thc-btn-details" data-target="${comp.id}">Reglas</button>
        </td>
      </tr>
      
      <!-- Fila de Detalles Desplegable -->
      <tr class="thc-comp-details-panel" id="details-${comp.id}">
        <td colspan="7">
          <div class="thc-details-wrapper">
            <div class="thc-details-grid">
              <div class="thc-details-rules">
                <div class="thc-details-header-actions">
                  <h3>Detalles y Reglas Completas</h3>
                  <div id="join-btn-container-${comp.id}">
                    ${renderJoinButton(comp)}
                  </div>
                </div>
                <div class="thc-rules-content" id="rules-content-${comp.id}">
                  <strong>Puntuación:</strong> ${comp.parsedRules.puntuacion}<br>
                  <strong>Requisitos Especiales:</strong> ${comp.parsedRules.requisitos}<br>
                  <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin: 12px 0;">
                  ${comp.rulesHtml}
                </div>
                
                <div class="thc-history-section" style="margin-top: 40px;">
                  <h3 class="thc-history-toggle" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; max-width: 280px; width: 100%; box-sizing: border-box;">
                    <span>Historial</span>
                    <span class="thc-history-arrow">▶</span>
                  </h3>
                  <div class="thc-history-container" id="history-${comp.id}" style="display: none;">
                    <!-- Se carga dinámicamente -->
                  </div>
                </div>
              </div>
              <div class="thc-details-prizes">
                <h3>Recompensas</h3>
                <div class="thc-prize-list" id="prizes-list-${comp.id}">
                  ${renderPrizesFull(comp.prizes)}
                </div>
                
                <div class="thc-leaderboard-section">
                  <h3>Clasificación</h3>
                  <div class="thc-leaderboard-container" id="leaderboard-${comp.id}">
                    <!-- Se carga dinámicamente -->
                  </div>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  tableHtml += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHtml;
  
  // Agregar eventos para desplegar reglas
  const detailButtons = container.querySelectorAll('.thc-btn-details');
  detailButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-target');
      toggleDetailsPanel(id);
    });
  });
}

// Alternar panel de detalles (Fila de tabla expandida)
function toggleDetailsPanel(id) {
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
      
      // Cargar clasificación e historial
      loadDetailsForId(id, id);
    }
  }
}

// Renderizar el botón de unirse/salir de la competición comprobando su estado y finalización
function renderJoinButton(comp) {
  const now = Date.now() / 1000;
  const isFinished = comp.finished === 1 || now > comp.end;
  
  // Si la competición ya ha finalizado, no mostramos el botón
  if (isFinished) {
    return '';
  }

  const state = userCompetitionStates[comp.id];
  if (state === 2) {
    return `<button class="thc-btn thc-btn-leave" data-id="${comp.id}"><span>✓ Inscrito</span></button>`;
  } else if (state === 1) {
    return `<button class="thc-btn thc-btn-join" data-id="${comp.id}">Unirse</button>`;
  } else {
    // Si el estado es 0 (no cualificado) o no está definido, no mostramos ningún botón
    return '';
  }
}

// Unirse a una competición llamando a la API oficial
async function joinCompetition(compId, btn) {
  if (!userAccessToken) {
    alert("Error: No se ha detectado el token de autenticación. Por favor, inicia sesión.");
    return;
  }
  
  btn.disabled = true;
  btn.textContent = "Uniéndose...";
  
  try {
    const response = await fetch('https://api.thehunter.com/v1/Competition/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `id=${compId}&oauth_access_token=${userAccessToken}`
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result === true) {
      // Éxito al unirse
      btn.className = "thc-btn thc-btn-leave";
      btn.innerHTML = "<span>✓ Inscrito</span>";
      btn.disabled = false;
      userCompetitionStates[compId] = 2; // Actualizar estado a JOINED
      
      // Incrementar el contador de inscritos en la tabla principal
      const row = document.getElementById(`row-${compId}`);
      if (row) {
        const entrantsSpan = row.querySelector('.thc-entrants-count');
        if (entrantsSpan) {
          const currentCount = parseInt(entrantsSpan.textContent) || 0;
          entrantsSpan.textContent = currentCount + 1;
        }
      }
      
      // Recargar el leaderboard de esta competición
      const container = document.getElementById(`leaderboard-${compId}`);
      if (container) {
        container.removeAttribute('data-loaded-id');
        loadDetailsForId(compId, compId);
      }
    } else {
      throw new Error("La API devolvió false");
    }
  } catch (error) {
    console.error('Error al unirse a la competición:', error);
    alert(`Error al inscribirse: ${error.message}`);
    btn.disabled = false;
    btn.className = "thc-btn thc-btn-join";
    btn.textContent = "Unirse";
  }
}

// Salir de una competición llamando a la API oficial
async function leaveCompetition(compId, btn) {
  if (!userAccessToken) {
    alert("Error: No se ha detectado el token de autenticación. Por favor, inicia sesión.");
    return;
  }
  
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.textContent = "Saliendo...";
  
  try {
    const response = await fetch('https://api.thehunter.com/v1/Competition/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `id=${compId}&oauth_access_token=${userAccessToken}`
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result === true) {
      // Éxito al salir
      btn.className = "thc-btn thc-btn-join";
      btn.textContent = "Unirse";
      btn.disabled = false;
      userCompetitionStates[compId] = 1; // Actualizar estado a JOINABLE
      
      // Decrementar el contador de inscritos en la tabla principal
      const row = document.getElementById(`row-${compId}`);
      if (row) {
        const entrantsSpan = row.querySelector('.thc-entrants-count');
        if (entrantsSpan) {
          const currentCount = parseInt(entrantsSpan.textContent) || 0;
          entrantsSpan.textContent = Math.max(0, currentCount - 1);
        }
      }
      
      // Recargar el leaderboard de esta competición
      const container = document.getElementById(`leaderboard-${compId}`);
      if (container) {
        container.removeAttribute('data-loaded-id');
        loadDetailsForId(compId, compId);
      }
    } else {
      throw new Error("La API devolvió false");
    }
  } catch (error) {
    console.error('Error al salir de la competición:', error);
    alert(`Error al darse de baja: ${error.message}`);
    btn.disabled = false;
    btn.className = "thc-btn thc-btn-leave";
    btn.innerHTML = originalHtml;
  }
}

// Cargar los detalles, clasificación e historial desde la API nativa
async function loadDetailsForId(rowId, targetId) {
  console.log(`[THC Addon] loadDetailsForId llamado. Fila: ${rowId}, Edición: ${targetId}`);
  const lbContainer = document.getElementById(`leaderboard-${rowId}`);
  const histContainer = document.getElementById(`history-${rowId}`);
  if (!lbContainer) {
    console.error(`[THC Addon] No se encontró el contenedor de clasificación para Fila: ${rowId}`);
    return;
  }
  
  if (lbContainer.getAttribute('data-loaded-id') === targetId) {
    console.log(`[THC Addon] Edición ${targetId} ya cargada para la Fila ${rowId}. Ignorando.`);
    return;
  }
  
  // Mostrar estados de carga
  lbContainer.innerHTML = `
    <div class="thc-leaderboard-loading">
      <div class="thc-loading-spinner thc-loading-spinner-small"></div>
      Cargando clasificación...
    </div>
  `;
  
  if (histContainer) {
    histContainer.innerHTML = `
      <div class="thc-leaderboard-loading">
        <div class="thc-loading-spinner thc-loading-spinner-small"></div>
        Cargando historial...
      </div>
    `;
  }
  
  try {
    console.log(`[THC Addon] Realizando fetch a competitions_new para id: ${targetId}`);
    const response = await fetch('https://api.thehunter.com/v1/Page_content/competitions_new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `id=${targetId}&lang=es_ES&entrants_limit=100`
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[THC Addon] Respuesta recibida de competitions_new. Info[0] exists: ${!!(data.info && data.info[0])}`);
    
    // 1. Actualizar el panel con la información específica de la edición seleccionada
    if (data.info && data.info[0]) {
      const activeComp = data.info[0];
      
      // Actualizar reglas completas
      const rulesContainer = document.getElementById(`rules-content-${rowId}`);
      if (rulesContainer) {
        console.log(`[THC Addon] Actualizando reglas para Fila: ${rowId}`);
        const parsed = parseRules(activeComp.type.rules);
        rulesContainer.innerHTML = `
          <strong>Puntuación:</strong> ${parsed.puntuacion}<br>
          <strong>Requisitos Especiales:</strong> ${parsed.requisitos}<br>
          <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin: 12px 0;">
          ${activeComp.type.rules}
        `;
      }
      
      // Actualizar recompensas
      const prizesContainer = document.getElementById(`prizes-list-${rowId}`);
      if (prizesContainer) {
        console.log(`[THC Addon] Actualizando recompensas para Fila: ${rowId}`);
        prizesContainer.innerHTML = renderPrizesFull(activeComp.type.prizes || []);
      }
      
      // Actualizar botón de inscripción
      const btnContainer = document.getElementById(`join-btn-container-${rowId}`);
      if (btnContainer) {
        console.log(`[THC Addon] Actualizando botón de inscripción para Fila: ${rowId}`);
        btnContainer.innerHTML = renderJoinButton(activeComp);
      }
    }
    
    // 2. Guardar en caché el historial completo (sólo la primera vez cuando no está en caché)
    if (!competitionHistoryCache[rowId]) {
      const allOccurrences = [];
      // Agregar la edición actualmente consultada
      if (data.info && data.info[0]) {
        allOccurrences.push({
          id: data.info[0].id,
          start: data.info[0].start,
          end: data.info[0].end,
          finished: data.info[0].finished
        });
      }
      
      // Agregar el historial previo sin duplicados
      if (data.competitions && data.competitions.length > 0) {
        data.competitions.forEach(c => {
          if (!allOccurrences.some(o => o.id === c.id)) {
            allOccurrences.push(c);
          }
        });
      }
      competitionHistoryCache[rowId] = allOccurrences;
      console.log(`[THC Addon] Historial completo guardado en caché para Fila: ${rowId}. Ocurrencias: ${allOccurrences.length}`);
    }
    
    // 3. Renderizar clasificación
    console.log(`[THC Addon] Renderizando clasificación para Fila: ${rowId}`);
    renderLeaderboardHtml(lbContainer, data, targetId);
    lbContainer.setAttribute('data-loaded-id', targetId);
    
    // 4. Renderizar historial utilizando el historial completo de la caché
    if (histContainer) {
      console.log(`[THC Addon] Renderizando historial para Fila: ${rowId} desde caché`);
      renderHistoryHtml(histContainer, competitionHistoryCache[rowId], rowId, targetId);
    }
  } catch (error) {
    console.error('[THC Addon] Error cargando detalles/leaderboard:', error);
    lbContainer.innerHTML = `<div style="color: #fc8181; font-size: 13px; margin-top: 10px;">⚠️ Error al cargar clasificación</div>`;
    if (histContainer) {
      histContainer.innerHTML = `<div style="color: #fc8181; font-size: 13px; margin-top: 10px;">⚠️ Error al cargar historial</div>`;
    }
  }
}

// Renderizar el historial de ediciones utilizando una lista precalculada de ocurrencias
function renderHistoryHtml(container, occurrences, rowId, targetId) {
  if (!occurrences || occurrences.length === 0) {
    container.innerHTML = '<div style="color: #718096; font-size: 13px;">Sin información de historial.</div>';
    return;
  }
  
  const monthsEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  const yearsMap = {};
  
  occurrences.forEach(t => {
    const date = new Date(t.end * 1000);
    const y = date.getFullYear().toString();
    const m = monthsEs[date.getMonth()];
    const d = date.getDate().toString();
    
    if (!yearsMap[y]) {
      yearsMap[y] = { year: y, monthsMap: {} };
    }
    
    if (!yearsMap[y].monthsMap[m]) {
      yearsMap[y].monthsMap[m] = { month: m, days: [] };
    }
    
    if (!yearsMap[y].monthsMap[m].days.some(dayObj => dayObj.id === t.id)) {
      yearsMap[y].monthsMap[m].days.push({
        day: d,
        id: t.id
      });
    }
  });
  
  // Ordenar años, meses y días de forma descendente
  const sortedYears = Object.keys(yearsMap)
    .sort((a, b) => b - a)
    .map(y => {
      const months = Object.keys(yearsMap[y].monthsMap)
        .sort((a, b) => {
          const aIndex = monthsEs.indexOf(a);
          const bIndex = monthsEs.indexOf(b);
          return bIndex - aIndex;
        })
        .map(m => {
          yearsMap[y].monthsMap[m].days.sort((a, b) => b.day - a.day);
          return yearsMap[y].monthsMap[m];
        });
      return {
        year: y,
        months: months
      };
    });
    
  let html = '<div class="thc-history-wrapper">';
  
  sortedYears.forEach(yearObj => {
    html += `
      <div class="thc-history-year-group">
        <div class="thc-history-year-title">${yearObj.year}</div>
        <div class="thc-history-months-list">
    `;
    
    yearObj.months.forEach(monthObj => {
      html += `
        <div class="thc-history-month-row">
          <span class="thc-history-month-name">${monthObj.month}</span>
          <span class="thc-history-days-list">
      `;
      
      monthObj.days.forEach(dayObj => {
        const isActive = parseInt(dayObj.id) === parseInt(targetId);
        const activeClass = isActive ? 'active' : '';
        html += `<a href="javascript:void(0)" class="thc-history-day-link ${activeClass}" data-row-id="${rowId}" data-target-id="${dayObj.id}">${dayObj.day}</a>`;
      });
      
      html += `
          </span>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// Renderizar la tabla de la clasificación en el DOM
function renderLeaderboardHtml(container, data, id) {
  const entrants = data.entrants || [];
  const entrantsTotal = data.entrants_total || 0;
  
  if (entrants.length === 0) {
    container.innerHTML = `<div style="color: #a0aec0; font-size: 13px; padding: 10px 0;">No hay participantes registrados con resultados aún.</div>`;
    return;
  }
  
  let html = `
    <table class="thc-leaderboard-table" style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); text-align: left; color: #718096;">
          <th style="padding: 6px 0;">Posición</th>
          <th style="padding: 6px 0;">Jugador</th>
          <th style="padding: 6px 0; text-align: right;">Resultado</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  html += entrants.map(entry => {
    const username = entry.user ? entry.user.handle : 'Desconocido';
    const profileUrl = `https://www.thehunter.com/#profile/${username}`;
    
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px 0; font-weight: 600; color: #a0aec0;">${entry.position}</td>
        <td style="padding: 8px 0;">
          <a href="${profileUrl}" target="_blank" style="color: #f9370d; text-decoration: none; font-weight: 500;">${username}</a>
        </td>
        <td style="padding: 8px 0; text-align: right; color: #ffffff; font-variant-numeric: tabular-nums;">${entry.points}</td>
      </tr>
    `;
  }).join('');
  
  html += `
      </tbody>
    </table>
    <div style="font-size: 11px; color: #718096; margin-top: 8px; text-align: right;">
      Total: ${entrantsTotal} participantes
    </div>
  `;
  
  container.innerHTML = html;
}

// Resumen rápido de premios para la tarjeta
function renderPrizesSummary(prizes) {
  if (!prizes || prizes.length === 0) return '';
  // Coger recompensas del 1er puesto
  const firstRank = prizes[0];
  if (!firstRank || !firstRank.rewards) return '';
  
  const goldReward = firstRank.rewards.find(r => r.type === 'GOLD');
  if (goldReward) {
    return `<span class="thc-reward-gold">🪙 ${goldReward.amount}</span>`;
  }
  return '';
}

// Listado de premios completo para el panel
function renderPrizesFull(prizes) {
  if (!prizes || prizes.length === 0) return '<div style="color: #718096; font-size: 13px;">Sin información de premios.</div>';
  
  return prizes.map((prize, index) => {
    const rewards = prize.rewards.map(r => {
      if (r.type === 'GOLD') {
        return `<span class="thc-reward-gold">🪙 ${r.amount} gm</span>`;
      }
      if (r.type === 'TROPHY') {
        // Formatear el identificador del trofeo de forma más legible (ej. ROE_DEER_01_GOLD -> Roe Deer Gold)
        const friendlyTrophy = r.define
          .toLowerCase()
          .replace(/_01|_02/g, '')
          .replace(/_/g, ' ');
        return `<span class="thc-reward-trophy">🏆 ${friendlyTrophy}</span>`;
      }
      return `<span>${r.type} (${r.define || r.amount})</span>`;
    }).join(' ');
    
    return `
      <div class="thc-prize-item">
        <span class="thc-prize-rank">${index + 1}º Puesto</span>
        <div class="thc-prize-rewards">${rewards}</div>
      </div>
    `;
  }).join('');
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

function compactRulesHtml(rulesHtml) {
  return String(rulesHtml || '')
    .replace(/(?:<br\s*\/?\s*>\s*){2,}/gi, '<br>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/>\s+</g, '><')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function renderClassicCompetitions(competitions, container) {
  const now = Date.now() / 1000;
  const sortedCompetitions = sortClassicCompetitions(competitions, now);
  const groups = [
    { id: 'available', title: 'Competiciones disponibles', items: sortedCompetitions },
    { id: 'joined', title: 'Competiciones inscritas', items: sortedCompetitions.filter(comp => userCompetitionStates[comp.id] === 2) },
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
  return `
    <tbody class="thc-classic-group collapsed" id="classic-group-${group.id}">
      <tr class="thc-classic-group-heading"><th colspan="6">
        <button type="button" class="thc-classic-section-title" data-group="${group.id}" aria-expanded="false">
          <span>${group.title} (${group.items.length})</span><span class="thc-classic-section-arrow">▶</span>
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

  return `
    <tr class="thc-classic-item" id="row-${instanceId}" data-comp-id="${comp.id}">
      <td><span class="thc-classic-count">${comp.entrants}</span></td>
      <td><button type="button" class="thc-classic-row-toggle" data-instance="${instanceId}" data-competition="${comp.id}" aria-label="Desplegar ${comp.name}">▶</button></td>
      <td><span class="thc-classic-icons">${animalIcons || `<img src="${comp.image}" alt="" class="thc-classic-animal-icon">`}</span></td>
      <td class="thc-classic-name">${comp.name}</td>
      <td><span class="thc-classic-reserve">${reserveIcons}<span>${comp.parsedRules.reserva}</span></span></td>
      <td><span class="thc-timer-value" data-end="${comp.end}" data-start="${comp.start}" data-id="${comp.id}">${formatTimeRemaining(timeLeft)}</span></td>
    </tr>
    <tr class="thc-classic-details-row" id="details-${instanceId}"><td colspan="6">
      <div class="thc-classic-details">
        <div class="thc-classic-detail-actions" id="join-btn-container-${instanceId}">${renderJoinButton(comp, true)}</div>
        <div class="thc-rules-content" id="rules-content-${instanceId}">${compactRulesHtml(comp.rulesHtml)}</div>
        <div class="thc-classic-columns">
          <section class="thc-details-prizes"><h3>Recompensas</h3><div class="thc-prize-list" id="prizes-list-${instanceId}">${renderPrizesFull(comp.prizes, true)}</div></section>
          <section class="thc-classic-collapsible">
            <button type="button" class="thc-classic-detail-toggle"><span>Clasificación</span><span class="thc-classic-detail-arrow">▶</span></button>
            <div class="thc-classic-collapsible-content thc-leaderboard-container" id="leaderboard-${instanceId}" style="display:none"></div>
          </section>
          <section class="thc-classic-collapsible">
            <button type="button" class="thc-classic-detail-toggle"><span>Historial</span><span class="thc-classic-detail-arrow">▶</span></button>
            <div class="thc-classic-collapsible-content thc-history-container" id="history-${instanceId}" style="display:none"></div>
          </section>
        </div>
      </div>
    </td></tr>`;
}

function toggleClassicGroup(groupId) {
  const group = document.getElementById(`classic-group-${groupId}`);
  const button = group ? group.querySelector('.thc-classic-section-title') : null;
  if (!group || !button) return;

  const isOpening = group.classList.contains('collapsed');
  if (isOpening) {
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
    loadDetailsForId(instanceId, competitionId);
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
        const selectEspecie = document.getElementById('thc-filter-especie');
        let matchedValue = speciesKey;
        if (selectEspecie) {
          for (const option of selectEspecie.options) {
            if (option.value && normalizeIconName(option.value).includes(speciesKey)) {
              matchedValue = option.value;
              break;
            }
          }
        }
        activeFilters.especie = matchedValue;
      }

      const selectEspecie = document.getElementById('thc-filter-especie');
      if (selectEspecie) {
        selectEspecie.value = activeFilters.especie;
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
        const selectMapa = document.getElementById('thc-filter-mapa');
        let matchedValue = reserveKey;
        if (selectMapa) {
          for (const option of selectMapa.options) {
            if (option.value && normalizeIconName(option.value).includes(reserveKey)) {
              matchedValue = option.value;
              break;
            }
          }
        }
        activeFilters.mapa = matchedValue;
      }

      const selectMapa = document.getElementById('thc-filter-mapa');
      if (selectMapa) {
        selectMapa.value = activeFilters.mapa;
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
      if (currentSpeciesNorm && currentSpeciesNorm.includes(key)) {
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
      if (currentReserveNorm && currentReserveNorm.includes(key)) {
        icon.classList.add('active');
      } else {
        icon.classList.remove('active');
      }
    });
  }
}
