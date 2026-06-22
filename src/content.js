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

// Inicialización de la extensión al cargar la página
console.log("[THC Addon] Cargando content script...");
init();

function init() {
  console.log("[THC Addon] Inicializando listeners...");
  // Escuchar cambios de hash en la URL
  window.addEventListener('hashchange', handleUrlChange);
  
  // Comprobación periódica por si el routing de la SPA no dispara hashchange
  setInterval(handleUrlChange, 1000);
  
  // Comprobación inicial
  handleUrlChange();
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
  
  overlay.innerHTML = `
    <div class="thc-header">
      <div class="thc-header-container">
        <div class="thc-header-top">
          <div class="thc-title-area">
            <img src="${chrome.runtime.getURL('thc_comp_logo.png')}" class="thc-logo-img" alt="THC Logo">
            <h1>COMPETICIONES by Nefastix13</h1>
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
  
  // Agregar eventos a los elementos del DOM creados
  document.getElementById('thc-close-btn').addEventListener('click', closeOverlay);
  
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
}

function openOverlay() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Evitar scroll del fondo
    
    // Iniciar timer dinámico
    if (!timerInterval) {
      timerInterval = setInterval(updateTimers, 1000);
    }
  }
}

function closeOverlay() {
  const overlay = document.getElementById('thc-optimizer-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = ''; // Restaurar scroll del fondo
    
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
}

// Renderizar la UI con la lista filtrada (Formato Tabla Premium)
function renderCompetitions(competitions) {
  const container = document.getElementById('thc-comp-container');
  const statsBadge = document.getElementById('thc-stats');
  
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
                <h3>Detalles y Reglas Completas</h3>
                <div class="thc-rules-content">
                  <strong>Puntuación:</strong> ${comp.parsedRules.puntuacion}<br>
                  <strong>Requisitos Especiales:</strong> ${comp.parsedRules.requisitos}<br>
                  <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin: 12px 0;">
                  ${comp.rulesHtml}
                </div>
              </div>
              <div class="thc-details-prizes">
                <h3>Recompensas</h3>
                <div class="thc-prize-list">
                  ${renderPrizesFull(comp.prizes)}
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
    }
  }
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
