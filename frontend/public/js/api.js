/* ================================================= */
/*  api.js — Integração com a API real               */
/*  Carrega dados reais e injeta nas variáveis do    */
/*  dashboard.js sem alterar a lógica existente.     */
/* ================================================= */

const API_BASE = '/api';

const API_CONFIG = {
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 8000,
  pollInterval: 30000
};

/* ─── Estado da conexão ─────────────────────────── */
let _apiStatus = 'idle'; // idle | loading | ok | error

function setApiStatus(status) {
  _apiStatus = status;
  const indicator = document.getElementById('api-status-indicator');
  if (!indicator) return;
  const labels = { idle: '', loading: 'Atualizando…', ok: 'API conectada', error: 'Sem conexão com API' };
  const colors = { idle: '', loading: 'text-muted', ok: 'text-success', error: 'text-danger' };
  indicator.textContent = labels[status] || '';
  indicator.className = `api-status-indicator small ms-2 ${colors[status] || ''}`;
}

/* ─── Helpers ───────────────────────────────────── */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchWithRetry(url, options = {}, attempt = 1) {
  try {
    return await fetchWithTimeout(url, options);
  } catch (err) {
    if (attempt < API_CONFIG.retryAttempts) {
      await new Promise(r => setTimeout(r, API_CONFIG.retryDelay * attempt));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

/* ─── Mapeamento API → formato interno ─────────── */
function mapApiAlert(a) {
  const severityToType = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info',
    info: 'info'
  };
  const statusMap = {
    open: 'novo',
    investigating: 'investigando',
    resolved: 'resolvido'
  };

  return {
    id: a.id,
    title: a.title || 'Alerta',
    description: a.description || '',
    neighborhood: a.neighborhood || '',
    location: a.neighborhood || '',
    type: severityToType[String(a.severity || '').toLowerCase()] || 'info',
    status: statusMap[String(a.status || '').toLowerCase()] || a.status || 'novo',
    severity: a.severity,
    timestamp: a.created_at || new Date().toISOString(),
    read: false,
    source: 'alerta'
  };
}

/* ─── Chamadas à API ────────────────────────────── */
async function fetchAlerts() {
  const data = await fetchWithRetry(`${API_BASE}/alerts`);
  return (data.data || []).map(mapApiAlert);
}

async function fetchStats() {
  return fetchWithRetry(`${API_BASE}/stats`);
}

async function fetchHealth() {
  return fetchWithRetry(`${API_BASE}/health`);
}

async function postAlert(payload) {
  return fetchWithRetry(`${API_BASE}/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/* ─── Injeção nos cards de stats ────────────────── */
function updateStatCards(stats) {
  const map = {
    'stats-total-alerts': stats.totalAlerts,
    'stats-critical-alerts': stats.criticalAlerts,
    'stats-neighborhoods': stats.neighborhoods
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.textContent = val;
  });

  // cards de resumo no topo do dashboard (seleciona pelos data-stat ou pela posição)
  const cardValues = document.querySelectorAll('[data-stat]');
  cardValues.forEach(el => {
    const key = el.getAttribute('data-stat');
    if (key === 'total' && stats.totalAlerts !== undefined) el.textContent = stats.totalAlerts;
    if (key === 'critical' && stats.criticalAlerts !== undefined) el.textContent = stats.criticalAlerts;
    if (key === 'neighborhoods' && stats.neighborhoods !== undefined) el.textContent = stats.neighborhoods;
  });
}

/* ─── Injeção dos alertas no dashboard ─────────── */
function injectApiAlerts(apiAlerts) {
  if (!Array.isArray(apiAlerts) || apiAlerts.length === 0) return;

  // Remove alertas sintéticos anteriores da API (ids numéricos da API são números)
  // mantém apenas os dados demo locais de estatísticas (STAT-*)
  if (typeof alertsData !== 'undefined' && Array.isArray(alertsData)) {
    const demoAlerts = alertsData.filter(a => String(a.id || '').startsWith('STAT-'));
    // Coloca os alertas reais no topo, dados sintéticos atrás
    window.alertsData = [...apiAlerts, ...demoAlerts];
  } else {
    window.alertsData = apiAlerts;
  }

  // Re-renderiza os componentes que dependem de alertsData
  try { if (typeof renderRecentAlerts === 'function') renderRecentAlerts(); } catch (e) { /* */ }
  try { if (typeof renderNotifications === 'function') renderNotifications(); } catch (e) { /* */ }
  try { if (typeof updateNotificationBadges === 'function') updateNotificationBadges(); } catch (e) { /* */ }
  try { if (typeof updateSidebarCounters === 'function') updateSidebarCounters(); } catch (e) { /* */ }

  // Se a lista de alertas estiver visível, re-renderiza
  const alertsView = document.getElementById('alerts-list-view');
  if (alertsView && !alertsView.classList.contains('d-none')) {
    try { if (typeof displayPage === 'function') displayPage(1); } catch (e) { /* */ }
  }

  // Se o painel de estatísticas estiver visível, re-renderiza
  const statsView = document.getElementById('statistics-view');
  if (statsView && !statsView.classList.contains('d-none')) {
    try { if (typeof refreshStatisticsPanel === 'function') refreshStatisticsPanel(); } catch (e) { /* */ }
  }
}

/* ─── Integração com o formulário de novo alerta ── */
function hookAlertForm() {
  const form = document.getElementById('novoAlertaForm');
  if (!form || form.dataset.apiHooked) return;
  form.dataset.apiHooked = 'true';

  const originalSubmit = form.onsubmit;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    const tipo = document.getElementById('alertaTipo')?.value || 'crime';
    const bairro = document.getElementById('alertaBairro')?.value || '';
    const descricao = document.getElementById('alertaDescricao')?.value || '';

    const severityFromType = {
      crime: 'high',
      arrastao: 'critical',
      tiroteio: 'critical',
      acidente: 'medium',
      suspeito: 'low',
      ordem: 'medium',
      policial: 'medium'
    };

    const payload = {
      title: form.querySelector('#alertaTipo option:checked')?.text || tipo,
      description: descricao,
      neighborhood: bairro,
      severity: severityFromType[tipo] || 'medium',
      status: 'open'
    };

    try {
      const result = await postAlert(payload);
      const modalEl = form.closest('.modal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      form.reset();

      // Injeta imediatamente na lista local
      if (result.data) {
        const novo = mapApiAlert(result.data);
        if (typeof alertsData !== 'undefined') {
          window.alertsData = [novo, ...window.alertsData];
        }
        try { if (typeof renderRecentAlerts === 'function') renderRecentAlerts(); } catch (_) { /* */ }
        try { if (typeof displayPage === 'function') displayPage(1); } catch (_) { /* */ }
      }

      if (typeof showToast === 'function') {
        showToast('Alerta enviado para a API com sucesso!', 'Sucesso', 'success');
      }
    } catch (err) {
      console.warn('[api.js] Falha ao criar alerta via API:', err);
      if (typeof showToast === 'function') {
        showToast('Não foi possível enviar para a API. Tente novamente.', 'Erro', 'danger');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    }
  }, true); // capture para rodar antes do handler original
}

/* ─── Banner de status da API ───────────────────── */
function renderApiBanner(status, message) {
  const existing = document.getElementById('api-status-banner');
  if (existing) existing.remove();

  if (status === 'ok') return;

  const banner = document.createElement('div');
  banner.id = 'api-status-banner';
  banner.style.cssText = `
    position: fixed; bottom: 1rem; right: 1rem; z-index: 9999;
    background: var(--color-background-secondary, #fff);
    border: 1px solid var(--color-border-secondary, #ddd);
    border-radius: 8px; padding: .75rem 1rem;
    font-size: .85rem; color: var(--color-text-secondary, #555);
    box-shadow: 0 2px 8px rgba(0,0,0,.1); max-width: 280px;
  `;
  banner.innerHTML = `
    <span style="margin-right:.5rem">⚠️</span>${message}
    <button onclick="this.parentElement.remove()" style="
      background: none; border: none; cursor: pointer;
      margin-left:.5rem; color: inherit; font-size: 1rem; line-height:1;
    ">×</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner?.remove(), 6000);
}

/* ─── Carregamento inicial ──────────────────────── */
async function loadApiData() {
  setApiStatus('loading');
  try {
    await fetchHealth();
  } catch {
    setApiStatus('error');
    renderApiBanner('error', 'API não disponível. Usando dados locais.');
    return;
  }

  try {
    const [alerts, stats] = await Promise.all([fetchAlerts(), fetchStats()]);
    injectApiAlerts(alerts);
    updateStatCards(stats);
    setApiStatus('ok');
  } catch (err) {
    console.warn('[api.js] Falha ao carregar dados da API:', err);
    setApiStatus('error');
    renderApiBanner('error', 'Não foi possível carregar dados da API.');
  }
}

/* ─── Polling periódico ─────────────────────────── */
function startApiPolling() {
  setInterval(async () => {
    if (document.hidden) return; // não pollar com aba em background
    try {
      const alerts = await fetchAlerts();
      injectApiAlerts(alerts);
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    }
  }, API_CONFIG.pollInterval);
}

/* ─── Exposição global ──────────────────────────── */
window.ComunidadeAlertaAPI = {
  fetchAlerts,
  fetchStats,
  fetchHealth,
  postAlert,
  reload: loadApiData
};

/* ─── Bootstrap ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Aguarda o dashboard.js terminar de inicializar (ele também usa DOMContentLoaded)
  await new Promise(r => setTimeout(r, 200));

  hookAlertForm();
  await loadApiData();
  startApiPolling();
});
