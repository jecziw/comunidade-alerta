/* ════════════════════════════════════════════════════════
   Comunidade Alerta — painel
   Dashboard: mapa, alertas, relatorios, faturamento, cameras.

   GERADO A PARTIR DE comunidade-alerta.html
   Este arquivo passa a ser a fonte da verdade; o HTML so o referencia.
   ════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   DASHBOARD LOGIC
═══════════════════════════════════════════ */

// ── MUNICÍPIOS DE COBERTURA ─────────────────
const MUNIS_SC = [
  'Florianópolis','São José','Palhoça','Biguaçu','Garopaba',
  'Tijucas','Gov. Celso Ramos','Santo Amaro da Imperatriz',
  'São Pedro de Alcântara','Antônio Carlos','Águas Mornas',
  'Paulo Lopes','Rancho Queimado','Canelinha','São João Batista',
  'Nova Trento','Angelina','Major Gercino','Alfredo Wagner',
  'Leoberto Leal','Anitápolis','São Bonifácio',
];
let selectedMunis = ['Florianópolis'];

function renderMuniList(filter) {
  const list  = document.getElementById('muni-list');
  if (!list) return;
  const plan  = document.querySelector('.plan-card.selected')?.dataset?.plan || 'free';
  const limit = plan === 'free' ? 3 : 99;
  list.innerHTML = MUNIS_SC
    .filter(m => !filter || m.toLowerCase().includes(filter.toLowerCase()))
    .map(m => {
      const checked  = selectedMunis.includes(m);
      const disabled = !checked && selectedMunis.length >= limit;
      const isCapital = m === 'Florianópolis';
      return `<div class="muni-chip${checked?' selected':''}${disabled?' disabled':''}" onclick="toggleMuni('${m}', ${!checked})">
        <div class="muni-check"></div>
        <span style="flex:1">${m}</span>
        ${isCapital ? '<span style="font-size:9px;background:rgba(200,32,26,.12);color:var(--red);padding:1px 6px;border-radius:2px;font-weight:600;letter-spacing:.04em">Capital</span>' : ''}
      </div>`;
    }).join('');
}

function toggleMuni(name, on) {
  const plan  = document.querySelector('.plan-card.selected')?.dataset?.plan || 'free';
  const limit = plan === 'free' ? 3 : 99;
  if (on) {
    if (selectedMunis.length >= limit) { renderMuniList(); return; }
    if (!selectedMunis.includes(name)) selectedMunis.push(name);
  } else {
    if (selectedMunis.length <= 1) { renderMuniList(); return; } // mínimo 1
    selectedMunis = selectedMunis.filter(m => m !== name);
  }
  renderMuniList();
  updateMuniLabel();
}

function filterMunis(val) { renderMuniList(val); }

function updateMuniLabel() {
  const plan  = document.querySelector('.plan-card.selected')?.dataset?.plan || 'free';
  const limit = plan === 'free' ? 3 : 22;
  const label = document.getElementById('muni-count-label');
  const hint  = document.getElementById('muni-hint');
  if (label) label.textContent = `— ${selectedMunis.length} de ${limit} selecionados`;
  if (hint)  hint.textContent  = plan === 'free'
    ? 'Plano Básico ativo: monitorando Florianópolis'
    : `Plano Profissional: todos os ${MUNIS_SC.length} municípios disponíveis`;
}

// Atualiza limite quando o plano muda
// ═══════════════════════════════════════════════════════════════
// PLANOS — Municípios por plano
// ═══════════════════════════════════════════════════════════════
const PLAN_MUNIS = {
  free:       ['Florianópolis', 'São José', 'Palhoça'], // Básico: só 3 cidades
  pro:        null, // 22 municípios
  enterprise: null, // cobertura negociável
};

// Gate por FUNCIONALIDADE (não por cidade)
const PLAN_FEATURES = {
  free:       { maxAlerts: 50,   reports: false, webhooks: false, users: 1,  api: false },
  pro:        { maxAlerts: null, reports: true,  webhooks: true,  users: 20, api: true  },
  enterprise: { maxAlerts: null, reports: true,  webhooks: true,  users: 999,api: true  },
};

const PLAN_LABELS = {
  free:       'Básico — Florianópolis, São José e Palhoça',
  pro:        'Profissional — 22 municípios',
  enterprise: 'Corporativo — cobertura customizada',
};

/**
 * Retorna true se o loc do alerta/feature está dentro do plano do usuário.
 * Verifica se algum município do plano aparece no campo `loc`.
 */
function isInPlan(loc, plan) {
  const p = plan || selectedBillingPlan || 'pro';
  const allowed = PLAN_MUNIS[p];
  if (!allowed) return true; // enterprise: tudo liberado
  const locLower = (loc || '').toLowerCase();
  return allowed.some(m => locLower.includes(m.toLowerCase()));
}

function promptUpgradeIfNeeded() {
  if ((selectedBillingPlan || 'pro') === 'free') {
    showToast('⬆️  Faça upgrade para Profissional e monitore todos os 22 municípios');
  }
}

/**
 * Filtra array de alertas pelo plano atual.
 */
function filterAlertsByPlan(alerts, plan) {
  const p = plan || selectedBillingPlan || 'pro';
  const features = PLAN_FEATURES[p] || PLAN_FEATURES.pro;
  let list = alerts;
  // Básico: só alertas das cidades permitidas
  const allowed = PLAN_MUNIS[p];
  if (allowed) list = list.filter(a => isInPlan(a.loc, p));
  if (features.maxAlerts) list = list.slice(0, features.maxAlerts);
  return list;
}

function canUseFeature(plan, feature) {
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.pro;
  return !!features[feature];
}

/**
 * Filtra features GeoJSON pelo plano atual (Básico: só as 3 cidades).
 */
function filterGeoByPlan(features, plan) {
  const p = plan || selectedBillingPlan || 'pro';
  const allowed = PLAN_MUNIS[p];
  if (!allowed) return features; // pro/enterprise: todos os municípios
  // Básico: mantém só incidentes/delegacias das cidades permitidas
  return features.filter(f => isInPlan(f.properties && f.properties.loc, p));
}

/**
 * Atualiza o badge de cobertura no topbar.
 */
function updatePlanBadge(plan) {
  const badgeEl = document.getElementById('plan-coverage-badge');
  if (!badgeEl) return;
  const labels = {
    free:       '22 municípios · mapa público (visualização)',
    pro:        '22 municípios · Alertas ilimitados',
    enterprise: 'SC inteiro · Ilimitado',
  };
  badgeEl.textContent = labels[plan] || labels.pro;
}

async function initDashboard() {
  // GUARDA: sem token nao ha como chamar a API. Mostrar o painel zerado engana
  // o usuario (parece "sem dados" quando na verdade e "sem sessao").
  const _s = loadSession();
  if (!_s || !_s.token) {
    try { showToast('Faça login para acessar o painel.'); } catch(_) {}
    showPage('login');
    return;
  }
  syncUserToDash();
  // Carrega os alertas reais do tenant ANTES de renderizar (degrada para demo se a API falhar)
  await refreshLiveData();
  // Liga o tempo real (Socket.io) — atualiza mapa/feed/tabela sem reload
  initRealtime();
  // Atualiza stats com dados reais agora que dashAlerts está populado
  try { animateDashStats(); } catch(_) {}
  try { renderInsights(); } catch(_) {}
  try { renderDashFeed(); } catch(_) {}
  try { updateSidebarBadge(); } catch(_) {}
  try { montarNotificacoes(); updateNotifBadge(); } catch(_) {}
  const plan = selectedBillingPlan || 'pro';

  // ── Atualiza badge de cobertura ──────────────
  updatePlanBadge(plan);
  checkApiStatus();
  setInterval(checkApiStatus, 30000);
  startPollingIndicator();
  aplicarPeriodo();
  renderSparklines();
  updateMapCounters();
  updateSidebarBadge();
  renderInsights();
  renderDashFeed();
  setTimeout(startOnboarding, 1200); // verifica a cada 30s

  // ── Aviso de plano básico ──────────────────
  if (plan === 'free' && !sessionStorage.getItem('plan_banner_dismissed')) {
    const existing = document.getElementById('plan-upgrade-tip');
    if (!existing) {
      const tip = document.createElement('div');
      tip.id = 'plan-upgrade-tip';
      tip.style.cssText = 'background:rgba(27,45,82,.06);border:1px solid rgba(27,45,82,.15);border-left:3px solid var(--navy);padding:10px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:0';
      tip.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--navy)" stroke-width="1.5"><path d="M7 1C3.7 1 1 3.7 1 7s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z"/><path d="M7 6v3M7 4.5v.5"/></svg><span style="font-size:12px;color:var(--navy);font-weight:500">Plano Básico: <strong>1 usuário</strong> e sem relatórios. Faça upgrade para adicionar sua equipe, exportar PDFs e conectar integrações.</span></div><div style="display:flex;gap:8px;flex-shrink:0"><button onclick="setNav(document.querySelector('.nav-item[data-view=faturamento]'))" style="font-size:11px;padding:4px 12px;background:var(--navy);color:#fff;border:none;border-radius:2px;cursor:pointer;font-family:'DM Sans',sans-serif">Ver upgrade</button><button aria-label="Dispensar sugestão de plano" title="Dispensar sugestão de plano" onclick="document.getElementById('plan-upgrade-tip').remove();sessionStorage.setItem('plan_banner_dismissed','1')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px">×</button></div>`;
      const urgency = document.getElementById('urgency-banner');
      if (urgency && urgency.parentNode) urgency.parentNode.insertBefore(tip, urgency);
    }
  }

  // ── Urgency banner ─────────────────────────
  const banner = document.getElementById('urgency-banner');
  const urgencyText = document.getElementById('urgency-text');
  if (banner && urgencyText) {
    const openAlerts = filterAlertsByPlan(allAlerts, plan).filter(a => a.status === 'open');
    const criticals = openAlerts.filter(a => ['crime','feminicidio'].includes(a.type));
    const prfAlerts = openAlerts.filter(a => a.type === 'prf');
    const inmet  = openAlerts.filter(a => a.type === 'inmet');

    if (criticals.length >= 2) {
      urgencyText.textContent = `⚠ ${criticals.length} ocorrências de crime e violência abertas — requerem atenção imediata`;
      banner.style.display = 'flex';
    } else if (inmet.length >= 2) {
      urgencyText.textContent = `🌧 ${inmet.length} alertas da Defesa Civil ativos na sua região`;
      banner.style.display = 'flex';
    } else if (prfAlerts.length >= 1 && openAlerts.length >= 5) {
      urgencyText.textContent = `${openAlerts.length} ocorrências em aberto — incluindo ${prfAlerts.length} da PRF na BR-101`;
      banner.style.display = 'flex';
    } else if (openAlerts.length > 0) {
      banner.style.display = 'none';
    }
  }

  // ── Última atualização no mapa ──────────────
  const mapUpdate = document.getElementById('map-last-update');
  if (mapUpdate) {
    const now = new Date();
    mapUpdate.textContent = `Atualizado às ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    setInterval(() => {
      const d = new Date();
      mapUpdate.textContent = `Atualizado às ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }, 60000);
  }

  // ── Cobertura ativa dinâmica ────────────────
  const muniEl    = document.getElementById('ds-municipios');
  const muniLabel = document.getElementById('ds-municipios-label');
  // Todos os planos cobrem 22 municípios
  if (muniEl) muniEl.textContent = '22';
  if (muniLabel) muniLabel.textContent = 'Municípios monitorados';

  // ── Sumário na view de alertas ──────────────
  const planAl = filterAlertsByPlan(allAlerts, plan);
  const elOpen = document.getElementById('alt-count-open');
  const elProg = document.getElementById('alt-count-progress');
  const elRes  = document.getElementById('alt-count-resolved');
  if (elOpen) elOpen.textContent = planAl.filter(a=>a.status==='open').length;
  if (elProg) elProg.textContent = planAl.filter(a=>a.status==='progress').length;
  if (elRes)  elRes.textContent  = planAl.filter(a=>a.status==='resolved').length;

  // ── Stats filtrados pelo plano ────────────────
  const planAlerts = filterAlertsByPlan(allAlerts, plan);
  const openCount  = planAlerts.filter(a => a.status === 'open').length;
  const resolvedCount = planAlerts.filter(a => a.status === 'resolved').length;
  const totalCount = planAlerts.length;

  // Escala para simular dia completo (allAlerts = amostra recente)
  const scale = plan === 'free' ? 1.8 : plan === 'pro' ? 6.2 : 6.2;
  const targets = {
    'ds-hoje':      Math.round(totalCount * scale),
    'ds-abertos':   Math.round(openCount * scale * 0.3),
    'ds-resolvidos':Math.round(resolvedCount * scale * 0.85),
  };
  Object.entries(targets).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    let n = 0;
    const step = Math.ceil(val / 40);
    const t = setInterval(() => { n = Math.min(n + step, val); el.textContent = n; if (n >= val) clearInterval(t); }, 24);
  });

  // ── Feed — só municípios do plano ────────────
  renderDashFeed();

  // ── Insights acionáveis ───────────────────────
  renderInsights();

  // ── Gráfico ───────────────────────────────────
  renderChart();

  // ── Tabela recentes — filtrada ─────────────────
  renderActivityTable();

  // ── Sidebar badge ─────────────────────────────
  updateSidebarBadge();

  // ── Trial ─────────────────────────────────────
  calcTrialDays();

  // ── Notificações ──────────────────────────────
  renderNotifList();

  // ── Mapa — markers filtrados pelo plano ───────
  if (!mapDash) {
    let mapTries = 0;
    const tryInitMap = () => {
      mapTries++;
      // Leaflet ainda não carregou? Tenta de novo (até 20x = 5s)
      if (typeof L === 'undefined' || typeof L.map === 'undefined') {
        if (mapTries < 20) { setTimeout(tryInitMap, 250); return; }
        // Desistiu — esconde spinner pra não ficar girando pra sempre
        const sp = document.getElementById('map-dash-loading');
        if (sp) {
          sp.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.6);font-size:12px;padding:20px">Mapa indisponível.<br/>Verifique sua conexão e recarregue a página.</div>';
        }
        return;
      }
      try {
        initLeafletMap('map-dash', 11, plan);
      } catch(err) {
        console.warn('Erro ao iniciar mapa:', err);
        const sp = document.getElementById('map-dash-loading');
        if (sp) { sp.style.opacity = '0'; setTimeout(() => sp.style.display = 'none', 400); }
      }
      // invalidateSize agressivo — resolve mapa que não renderiza
      [100, 300, 600, 1000, 1600].forEach(t => setTimeout(() => { try { mapDash?.invalidateSize(); } catch(e){} }, t));
    };
    setTimeout(tryInitMap, 200);
  } else {
    applyPlanFilterToMap(mapDash, 'dash', plan);
    [100, 400].forEach(t => setTimeout(() => mapDash.invalidateSize(), t));
  }
}

function updateSidebarBadge() {
  const nb = document.getElementById('nb-alertas');
  if (nb) nb.textContent = allAlerts.filter(a => a.status === 'open').length;
}

function syncUserToDash() {
  // Prioridade: campos do cadastro → nome já salvo na sessão (login) → derivado do e-mail
  const sess  = loadSession() || {};
  const name  = (sess['inp-name']      || document.getElementById('inp-name')?.value      || '').trim();
  const sob   = (sess['inp-sobrenome'] || document.getElementById('inp-sobrenome')?.value || '').trim();
  const email = (sess.email            || document.getElementById('inp-email')?.value     || '').trim();
  const org   = (sess.org              || document.getElementById('inp-org')?.value       || '').trim();
  const full  = [name, sob].filter(Boolean).join(' ')
                || sess.name
                || (typeof nameFromEmail === 'function' ? nameFromEmail(email) : '')
                || 'Usuário';
  const initials = (full.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0,2).join('') || 'CA').toUpperCase();

  // Salva sessao preservando o que ja existia.
  // ATENCAO: saveSession SUBSTITUI o objeto inteiro. Sem o "...sess" abaixo,
  // o token do login era apagado aqui — e toda chamada autenticada virava 401.
  saveSession({
    ...sess,
    authenticated: true,
    name: full,
    email, org: org || 'Minha Organização',
    plan: sess.plan || selectedBillingPlan || 'pro',
    'inp-name': name,
    'inp-sobrenome': sob,
    'inp-email': email,
    'inp-org': org,
  });

  const unEl = document.getElementById('dash-username');
  const ogEl = document.getElementById('dash-org');
  const avEl = document.getElementById('dash-avatar');
  if (unEl) unEl.textContent = full || 'Usuário';
  if (ogEl) ogEl.textContent = org;
  if (avEl) avEl.textContent = initials;

  // Saudação no topbar baseada na hora
  const greetEl = document.getElementById('topbar-greeting');
  if (greetEl) {
    const hr = new Date().getHours();
    const period = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    const firstName = name.split(' ')[0];
    greetEl.textContent = `${period}, ${firstName}. Aqui está o resumo de hoje.`;
  }
}

function calcPeriodStats(days) {
  const alerts = typeof dashAlerts !== 'undefined' ? dashAlerts : [];
  // days === null/0  -> sem recorte (todo o historico)
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  let filtered = cutoff ? alerts.filter(a => {
    const d = new Date(a._created || a.created_at);
    return !isNaN(d) && d.getTime() >= cutoff;
  }) : alerts;
  // NAO usar fallback aqui: exibir a base inteira sob o rotulo "hoje" seria
  // apresentar dado historico como se fosse do dia. Se o periodo nao tem
  // registros, o numero correto e zero — a interface explica o motivo.
  return {
    hoje: filtered.length,
    abertos: filtered.filter(a => a.status !== 'resolved' && a.status !== 'closed').length,
    resolvidos: filtered.filter(a => a.status === 'resolved' || a.status === 'closed').length,
  };
}

function animateDashStats() {
  const _dias = (typeof PERIODO_DIAS !== 'undefined' && typeof periodoAtual !== 'undefined')
    ? PERIODO_DIAS[periodoAtual] : null;
  const s = typeof calcPeriodStats === 'function' ? calcPeriodStats(_dias) : { hoje: 0, abertos: 0, resolvidos: 0 };
  const targets = { 'ds-hoje': s.hoje, 'ds-abertos': s.abertos, 'ds-resolvidos': s.resolvidos };
  Object.entries(targets).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    let n = 0;
    const step = Math.max(1, Math.ceil(val / 40));
    const t = setInterval(() => {
      n = Math.min(n + step, val);
      el.textContent = n;
      if (n >= val) clearInterval(t);
    }, 28);
  });
  // Update resolve rate
  const rate = s.hoje > 0 ? Math.round(s.resolvidos / s.hoje * 100) : 0;
  const rateEl = document.getElementById('ds-resolvidos-delta');
  if (rateEl) rateEl.textContent = 'Taxa de resolução: ' + rate + '%';
  // Update sources label
  const alerts = typeof dashAlerts !== 'undefined' ? dashAlerts : [];
  const prf = alerts.filter(a => a.source === 'prf').length;
  const inmet = alerts.filter(a => a.source === 'inmet').length;
  const del = alerts.filter(a => a.source === 'delegacia').length;
  const srcEl = document.getElementById('ds-sources-label');
  if (srcEl) srcEl.textContent = 'PRF ' + prf + ' · INMET ' + inmet + ' · Del. ' + del;
}


function calcTrialDays() {
  const el = document.getElementById('trial-days');
  if (!el) return;
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const diff = Math.round((d - new Date()) / 86400000);
  el.textContent = diff + ' dias';
}

// Sidebar navigation + view router
function setNav(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  // Atualiza aria-current para acessibilidade
  document.querySelectorAll('.nav-item').forEach(n => n.removeAttribute('aria-current'));
  el.setAttribute('aria-current', 'page');
  const view  = el.dataset.view  || 'dashboard';
  const label = el.dataset.label || 'Dashboard';
  const sub   = el.dataset.sub   || '';
  // Switch view
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);

  // ── Feature gate para plano gratuito ──────────────
  const planFeats = PLAN_FEATURES[selectedBillingPlan || 'pro'] || PLAN_FEATURES.pro;
  if (view === 'relatorios' && !planFeats.reports) {
    showUpgradePrompt('Relatórios PDF e exportação CSV');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-view="dashboard"]')?.classList.add('active');
    document.getElementById('view-dashboard')?.classList.add('active');
    return;
  }
  if (view === 'webhooks' && !planFeats.webhooks) {
    showUpgradePrompt('Integrações automáticas e webhooks');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-view="dashboard"]')?.classList.add('active');
    document.getElementById('view-dashboard')?.classList.add('active');
    return;
  }
  if (target) target.classList.add('active');
  // Footer aparece apenas no Dashboard
  const dashFooter = document.querySelector('.df');
  const dashFooterBottom = document.querySelector('.df-bottom');
  const showFooter = (view === 'dashboard');
  if (dashFooter) dashFooter.style.display = showFooter ? 'grid' : 'none';
  if (dashFooterBottom) dashFooterBottom.style.display = showFooter ? 'flex' : 'none';
  // Update breadcrumb (new elements)
  const secEl = document.getElementById('topbar-section-label');
  const subEl = document.getElementById('topbar-sub-label');
  if (secEl) secEl.textContent = label.toUpperCase();
  if (subEl) subEl.textContent = sub;
  // Also legacy fallback
  const bc = document.querySelector('.dash-breadcrumb');
  if (bc && !secEl) {
    // textContent em vez de innerHTML: nao ha razao para interpretar HTML aqui,
    // e assim o caminho fica seguro por construcao, nao por confiar na origem.
    bc.textContent = label + ' / ' + sub;
  }
  // Scroll top
  const scroll = document.getElementById('dash-main-scroll');
  if (scroll) scroll.scrollTop = 0;
  // Section-specific init
  if (view === 'alertas')     renderAlertasTable('all');
  if (view === 'delegacias')  renderDelegaciasTable();
  if (view === 'cameras')   { try { initCamerasView(); } catch(_) {}
                              try { renderCamerasView(); } catch(_) {} }  // trava de plano + lista
  if (view === 'webhooks')    renderWebhooksTable();
  if (view === 'config')    { syncCfgFields(); try { verificarStatusExclusao(); } catch(_) {} }
  if (view === 'faturamento'){ try { syncFaturamento(); } catch(_) {}
                              try { renderFaturamentoView(); } catch(_) {} }  // desenha o QR do PIX
  if (view === 'dashboard')   { if (mapDash) setTimeout(() => mapDash.invalidateSize(), 100); }
  if (view === 'relatorios') {
    try { renderRelatorios(); } catch(_) {}
    try { renderRelatoriosView(); } catch(_) {}   // gerador real (contagens + CSV)
  }
  if (view === 'mapa') {
    setTimeout(() => {
      if (!mapFull) initLeafletMap('map-full', 11.5);
      else mapFull.invalidateSize();
      initMapView();
    }, 150);
  }
}

// ── MAPA AO VIVO — KPIs e feed ────────────────────────────
async function initMapView() {
  // idem: sem dados, os KPIs e o feed aparecem vazios
  if ((typeof dashAlerts === 'undefined' || !dashAlerts.length) && typeof refreshLiveData === 'function') {
    try { await refreshLiveData(); } catch(_) {}
  }
  // Popula KPIs com dados reais de dashAlerts
  const alerts = typeof dashAlerts !== 'undefined' ? dashAlerts : [];
  const s = typeof calcPeriodStats === 'function' ? calcPeriodStats(1) : { hoje: alerts.length, abertos: 0, resolvidos: 0 };

  const hoje     = document.getElementById('mv-hoje');
  const abertos  = document.getElementById('mv-abertos');
  const resolv   = document.getElementById('mv-resolvidos');
  if (hoje)    animateCount('mv-hoje',     s.hoje);
  if (abertos) animateCount('mv-abertos',  s.abertos);
  if (resolv)  animateCount('mv-resolvidos', s.resolvidos);

  // Mini stats por tipo
  const crime   = alerts.filter(a => a.type === 'crime' || a.type === 'furto').length;
  const transit = alerts.filter(a => a.type === 'transito' || a.source === 'prf').length;
  const infra   = alerts.filter(a => a.source === 'inmet' || a.type === 'infra').length;
  const mpCrime   = document.getElementById('mv-mp-crime');
  const mpTransit = document.getElementById('mv-mp-transito');
  const mpInfra   = document.getElementById('mv-mp-infra');
  if (mpCrime)   mpCrime.textContent   = crime;
  if (mpTransit) mpTransit.textContent = transit;
  if (mpInfra)   mpInfra.textContent   = infra;

  // Feed lateral — mostra os 20 mais recentes
  const feedEl = document.getElementById('mv-feed-list');
  if (!feedEl) return;
  // Ordenar so por data faz o INMET (sempre recente) ocupar todas as vagas e
  // esconder os acidentes da PRF. Intercalamos por fonte para o feed refletir
  // o que existe de fato: 58 de transito e 117 de infraestrutura.
  const porFonte = {};
  [...alerts]
    .sort((a, b) => new Date(b._created || b.created_at) - new Date(a._created || a.created_at))
    .forEach(a => {
      const f = a.source || 'outro';
      (porFonte[f] = porFonte[f] || []).push(a);
    });
  const ordemFontes = Object.keys(porFonte);
  const recent = [];
  let aindaTem = true;
  while (aindaTem && recent.length < 24) {
    aindaTem = false;
    for (const f of ordemFontes) {
      if (porFonte[f].length && recent.length < 24) { recent.push(porFonte[f].shift()); aindaTem = true; }
    }
  }
  if (!recent.length) return;

  const typeColors = { crime:'#E53935', transito:'#F57C00', furto:'#EF5350', infra:'#43A047', prf:'#FF8F00', inmet:'#0288D1', delegacia:'#7986CB' };
  const typeLabels = { crime:'Crime', transito:'Trânsito', furto:'Furto', infra:'Infra', prf:'PRF', inmet:'INMET', delegacia:'Delegacia' };

  feedEl.innerHTML = recent.map(a => {
    const type  = a.source === 'prf' ? 'prf' : (a.source === 'inmet' ? 'inmet' : (a.type || 'outro'));
    const color = typeColors[type] || '#888';
    const label = typeLabels[type] || type;
    // A descricao vem como "Tipo — Causa/Risco · Local".
    // Antes o feed descartava a causa, que e a informacao mais acionavel:
    // saber que houve colisao importa menos que saber POR QUE houve.
    const bruto  = (a.description || '');
    const partes = bruto.split(' — ');
    const tipoTxt = (partes[0] || '').trim();
    const causa   = partes.length > 1
      ? partes.slice(1).join(' — ').split(' · ')[0].trim()
      : '';
    const desc  = (tipoTxt || bruto).substring(0, 70);
    const motivo = causa && causa.toLowerCase() !== tipoTxt.toLowerCase()
      ? causa.substring(0, 90) : '';
    const loc   = a.location || '';
    const time  = typeof fmtRelative === 'function' ? fmtRelative(a._created || a.created_at) : '';
    return `<div style="padding:12px 16px;border-bottom:1px solid rgba(20,18,14,.05);transition:background .15s;cursor:default" onmouseover="this.style.background='#F9F8F6'" onmouseout="this.style.background='none'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <span style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:6px;background:${color}18;color:${color}">${escapeHtml(label)}</span>
        <span style="margin-left:auto;font-size:10.5px;color:#bbb">${escapeHtml(time)}</span>
      </div>
      <div style="font-size:12.5px;color:#333;line-height:1.4;margin-bottom:3px">${escapeHtml(desc)}</div>
      ${motivo ? `<div style="display:flex;align-items:flex-start;gap:5px;font-size:11px;color:#8a6d3b;background:#FFF8EE;border-radius:6px;padding:5px 8px;margin:4px 0 5px;line-height:1.45">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C89B3C" stroke-width="2.5" style="flex-shrink:0;margin-top:2px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>${escapeHtml(motivo)}</span></div>` : ''}
      ${loc ? `<div style="font-size:11px;color:#aaa;display:flex;align-items:center;gap:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>${escapeHtml(loc)}</div>` : ''}
    </div>`;
  }).join('');

  // Invalidate map after render
  setTimeout(() => { if (typeof mapFull !== 'undefined' && mapFull) mapFull.invalidateSize(); }, 200);
}


// ── RELATORIOS: numeros e historico a partir dos dados reais ──
function renderRelatorios() {
  const alerts = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);

  // Cards
  const agora = new Date();
  const mesNome = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const doMes = alerts.filter(a => {
    const d = new Date(a._created || a.created_at);
    return !isNaN(d) && d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const elMes  = document.getElementById('rel-mes');
  const elQtd  = document.getElementById('rel-mes-qtd');
  const elCsv  = document.getElementById('rel-csv-qtd');
  if (elMes) elMes.textContent = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
  if (elQtd) elQtd.textContent = doMes.length;
  if (elCsv) elCsv.textContent = alerts.length;

  // Historico agrupado por mes (dados reais)
  const tb = document.getElementById('rel-historico');
  if (!tb) return;

  const porMes = {};
  alerts.forEach(a => {
    const d = new Date(a._created || a.created_at);
    if (isNaN(d)) return;
    const chave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!porMes[chave]) porMes[chave] = { data: d, total: 0 };
    porMes[chave].total++;
  });

  const meses = Object.entries(porMes).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  if (!meses.length) {
    tb.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--muted);font-size:12px">' +
      'Nenhum alerta registrado ainda — os relatórios aparecem aqui conforme os dados chegam.</td></tr>';
    return;
  }

  tb.innerHTML = meses.map(function (par) {
    const chave = par[0], info = par[1];
    const nome = info.data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const ini = new Date(info.data.getFullYear(), info.data.getMonth(), 1);
    const fim = new Date(info.data.getFullYear(), info.data.getMonth() + 1, 0);
    const fmt = function (x) { return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
    return '<tr>' +
      '<td>Mensal — ' + nome.charAt(0).toUpperCase() + nome.slice(1) + '</td>' +
      '<td style="color:var(--muted)">' + fmt(ini) + ' – ' + fmt(fim) + '</td>' +
      '<td>' + info.total + '</td>' +
      '<td style="color:var(--muted)">sob demanda</td>' +
      '<td><span class="status-pill" style="background:rgba(200,32,26,.1);color:var(--red)">PDF</span></td>' +
      '<td><button style="font-size:11px;color:var(--red);background:none;border:none;cursor:pointer;font-weight:500" onclick="exportDashboardPDF()">Baixar PDF</button></td>' +
      '</tr>';
  }).join('');
}


// ── RELATORIOS — geracao real a partir de dashAlerts ──────────
function relFiltrar() {
  const dias  = parseInt(document.getElementById('rel-periodo')?.value || '30', 10);
  const fonte = document.getElementById('rel-fonte')?.value || '';
  const base  = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);
  const corte = dias > 0 ? Date.now() - dias * 864e5 : null;
  return base.filter(a => {
    if (fonte && a.source !== fonte) return false;
    if (!corte) return true;
    const d = new Date(a._created || a.created_at);
    return !isNaN(d) && d.getTime() >= corte;
  });
}

function relAtualizarPreview() {
  const linhas = relFiltrar();
  const elC = document.getElementById('rel-count');
  if (elC) elC.textContent = linhas.length;
  const cont = {};
  linhas.forEach(a => { const s = a.source || 'outro'; cont[s] = (cont[s] || 0) + 1; });
  const rotulo = { prf:'PRF', inmet:'INMET', delegacia:'Delegacias', manual:'Equipe' };
  const elQ = document.getElementById('rel-quebra');
  if (elQ) {
    const partes = Object.entries(cont).map(([k, v]) => (rotulo[k] || k) + ': ' + v);
    elQ.textContent = partes.length ? partes.join('  ·  ') : 'Nenhum registro neste filtro';
  }
}

function relAtualizarResumo() {
  const base = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('rel-tot',   base.length);
  set('rel-prf',   base.filter(a => a.source === 'prf').length);
  set('rel-inmet', base.filter(a => a.source === 'inmet').length);
  set('rel-del',   base.filter(a => a.source === 'delegacia').length);
}

function gerarRelatorio() {
  const linhas = relFiltrar();
  if (!linhas.length) { showToast('Nenhum registro no filtro selecionado'); return; }
  const formato = document.getElementById('rel-formato')?.value || 'csv';

  if (formato === 'pdf') {
    if (typeof exportDashboardPDF === 'function') exportDashboardPDF();
    else window.print();
    return;
  }

  const cab = ['id','fonte','tipo','descricao','local','severidade','status','data'];
  const esc = v => {
    let s = (v == null ? '' : String(v));
    // Protecao contra CSV injection: campo comecando com = + - @ e interpretado
    // como FORMULA pelo Excel/LibreOffice. Um alerta com =HYPERLINK(...) ou
    // =cmd|... executaria na maquina de quem abrisse a planilha.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    s = s.replace(/"/g, '""');
    return '"' + s + '"';
  };
  const corpo = linhas.map(a => [
    a.external_id || a.id || '',
    a.source || '',
    a.type || '',
    a.description || '',
    a.location || a.loc || '',
    a.severity || '',
    a.status || '',
    a._created || a.created_at || ''
  ].map(esc).join(','));

  // BOM para o Excel abrir acentos corretamente
  const csv  = '\ufeff' + cab.join(',') + '\n' + corpo.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'comunidade-alerta-' + hoje + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(linhas.length + ' registros exportados');
}

async function renderRelatoriosView() {
  // Se os alertas ainda nao chegaram, os cards mostram "—" e parecem quebrados.
  // Buscamos primeiro e so entao desenhamos.
  const semDados = (typeof dashAlerts === 'undefined') || !dashAlerts.length;
  if (semDados && typeof refreshLiveData === 'function') {
    try { await refreshLiveData(); } catch(_) {}
  }
  relAtualizarResumo();
  relAtualizarPreview();
  exigirPlanoPago('rel-form-box', 'Disponível no plano Profissional',
    'A exportação de relatórios em PDF e CSV faz parte dos planos pagos, como indicado na página de preços.');
  ['rel-periodo','rel-fonte'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('change', relAtualizarPreview);
    }
  });
}


function renderFaturamentoView() { try { desenharQRPix(); } catch(_) {} }

// ── PAGAMENTO — troca de metodo ───────────────────────────
function selecionarPagamento(el) {
  document.querySelectorAll('.pay-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  const alvo = el.dataset.pay;
  document.querySelectorAll('.pay-painel').forEach(pnl => pnl.style.display = 'none');
  const pnl = document.getElementById('pay-' + alvo);
  if (pnl) pnl.style.display = 'block';
  if (alvo === 'pix') desenharQRPix();
}

function copiarPix() {
  const el = document.getElementById('pix-codigo');
  if (!el) return;
  el.select();
  navigator.clipboard.writeText(el.value)
    .then(() => showToast('Código PIX copiado'))
    .catch(() => { try { document.execCommand('copy'); showToast('Código PIX copiado'); } catch(_) {} });
}

// QR meramente ilustrativo: em producao o payload vem do backend (Stripe/PSP).
function desenharQRPix() {
  const box = document.getElementById('pix-qr');
  if (!box || box.dataset.pronto) return;
  const N = 25, cel = 6.4;
  let r = 7;
  const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
  let svg = '<svg viewBox="0 0 160 160" width="100%" height="100%">';
  svg += '<rect width="160" height="160" fill="#fff"/>';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cantoFixo = (x < 7 && y < 7) || (x > N - 8 && y < 7) || (x < 7 && y > N - 8);
      if (cantoFixo) continue;
      if (rnd() > 0.52) svg += '<rect x="' + (x * cel) + '" y="' + (y * cel) + '" width="' + cel + '" height="' + cel + '" fill="#0C1F3E"/>';
    }
  }
  // marcadores de posicao
  [[0,0],[N-7,0],[0,N-7]].forEach(([mx,my]) => {
    const px = mx * cel, py = my * cel, t = 7 * cel;
    svg += '<rect x="' + px + '" y="' + py + '" width="' + t + '" height="' + t + '" fill="#0C1F3E"/>';
    svg += '<rect x="' + (px+cel) + '" y="' + (py+cel) + '" width="' + (t-2*cel) + '" height="' + (t-2*cel) + '" fill="#fff"/>';
    svg += '<rect x="' + (px+2*cel) + '" y="' + (py+2*cel) + '" width="' + (t-4*cel) + '" height="' + (t-4*cel) + '" fill="#0C1F3E"/>';
  });
  svg += '</svg>';
  box.innerHTML = svg;
  box.dataset.pronto = '1';
}

// ── CARTAO — preenchimento em tempo real ──────────────────
function ccVirar(v) {
  const cc = document.getElementById('cc-flip');
  if (cc) cc.classList.toggle('virado', !!v);
}

function ccDigitou() {
  const num = document.getElementById('in-cc-num');
  if (num) {
    let d = num.value.replace(/\D/g, '').slice(0, 16);
    num.value = (d.match(/.{1,4}/g) || []).join(' ');
    const alvo = document.getElementById('cc-num');
    if (alvo) {
      const mostra = (d + '••••••••••••••••'.slice(d.length)).slice(0, 16);
      alvo.textContent = (mostra.match(/.{1,4}/g) || []).join(' ');
    }
    const b = document.getElementById('cc-bandeira');
    if (b) {
      b.textContent = d.startsWith('4') ? 'VISA'
        : /^5[1-5]/.test(d) ? 'MASTERCARD'
        : /^3[47]/.test(d) ? 'AMEX'
        : /^(36|38|30)/.test(d) ? 'DINERS'
        : d.length >= 2 ? 'CARTÃO' : '';
    }
  }

  const nome = document.getElementById('in-cc-nome');
  const cn = document.getElementById('cc-nome');
  if (nome && cn) cn.textContent = nome.value.trim() ? nome.value.toUpperCase() : 'NOME NO CARTÃO';

  const val = document.getElementById('in-cc-val');
  if (val) {
    let d = val.value.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) d = d.slice(0, 2) + '/' + d.slice(2);
    val.value = d;
    const cv = document.getElementById('cc-val');
    if (cv) cv.textContent = d || 'MM/AA';
  }

  const cvv = document.getElementById('in-cc-cvv');
  if (cvv) {
    cvv.value = cvv.value.replace(/\D/g, '').slice(0, 4);
    const cc = document.getElementById('cc-cvv');
    if (cc) cc.textContent = cvv.value ? '•'.repeat(cvv.value.length) : '•••';
  }
}


// ── Indicador de tempo real: so diz "LIVE" se o socket estiver mesmo conectado.
// Antes o rotulo era fixo e prometia atualizacao automatica que nao acontecia.
function marcarTempoReal(conectado) {
  document.querySelectorAll('.live-dot, [data-live-label]').forEach(el => {
    el.style.opacity = conectado ? '1' : '.45';
  });
  document.querySelectorAll('[data-live-label]').forEach(el => {
    el.textContent = conectado ? 'AO VIVO' : 'ATUALIZA AO RECARREGAR';
    el.title = conectado
      ? 'Conectado — novos alertas chegam sozinhos'
      : 'Tempo real indisponível no momento; os dados vêm do último carregamento';
  });
}

window.addEventListener('load', () => {
  if (window.__socketIndisponivel || typeof io === 'undefined') {
    marcarTempoReal(false);
  }
});


// ── CAMERAS PARCEIRAS ─────────────────────────────────────
// Indicacoes ficam na sessao atual. A persistencia definitiva depende de um
// endpoint no backend (POST /api/cameras) — por isso a pagina avisa que a
// indicacao passa por revisao, em vez de fingir que ja esta cadastrada.
let _camerasIndicadas = [];

function indicarCamera() {
  const end  = (document.getElementById('cmp-end')?.value  || '').trim();
  const muni = document.getElementById('cmp-muni')?.value  || '';
  const dir  = document.getElementById('cmp-dir')?.value   || '';
  const resp = (document.getElementById('cmp-resp')?.value || '').trim();

  const tipo = document.getElementById('cmp-tipo')?.value || '';
  const lgpd = document.getElementById('cmp-lgpd')?.checked;

  if (!end)  { showToast('Informe o endereço do ponto'); document.getElementById('cmp-end')?.focus();  return; }
  if (!resp) { showToast('Informe um responsável para contato'); document.getElementById('cmp-resp')?.focus(); return; }
  if (!lgpd) { showToast('É necessário autorizar o cadastro (LGPD)'); document.getElementById('cmp-lgpd')?.focus(); return; }

  _camerasIndicadas.unshift({
    end, muni, dir, resp, tipo,
    quando: new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  });

  document.getElementById('cmp-end').value  = '';
  document.getElementById('cmp-resp').value = '';
  const _chk = document.getElementById('cmp-lgpd'); if (_chk) _chk.checked = false;
  renderCamerasIndicadas();
  showToast('Indicação registrada — nossa equipe entrará em contato');
}

function renderCamerasIndicadas() {
  const box   = document.getElementById('cmp-lista-box');
  const lista = document.getElementById('cmp-lista');
  if (!box || !lista) return;
  if (!_camerasIndicadas.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  lista.innerHTML = _camerasIndicadas.map(cam => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:13px 0;border-bottom:1px solid rgba(20,18,14,.06)">
      <div style="width:32px;height:32px;border-radius:9px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3949AB" stroke-width="2"><path d="M2 6h3l1.5-2h5L13 6h9v12H2z"/><circle cx="12" cy="12" r="3.2"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1A1814;margin-bottom:2px">${escapeHtml(cam.end)}</div>
        <div style="font-size:11.5px;color:#999">${escapeHtml(cam.muni)} · ${escapeHtml(cam.tipo || '')} · ${escapeHtml(cam.dir)}</div>
        <div style="font-size:11.5px;color:#bbb;margin-top:2px">Contato: ${escapeHtml(cam.resp)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <span style="font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(230,81,0,.08);color:#E65100;padding:3px 9px;border-radius:20px">Em revisão</span>
        <div style="font-size:10.5px;color:#bbb;margin-top:5px">${cam.quando}</div>
      </div>
    </div>`).join('');
}

function renderCamerasView() {
  renderCamerasIndicadas();
  exigirPlanoPago('cmp-form-box', 'Disponível no plano Profissional',
    'O cadastro de câmeras parceiras envolve curadoria da equipe e contato com cada proprietário. Por isso está nos planos pagos.');
}



// ── FILTRO DE PERIODO — fonte unica da verdade ────────────
// Antes, so os cards do topo respeitavam o periodo escolhido; mapa, feed,
// grafico e tabela continuavam mostrando a base inteira. Resultado: escolher
// "Hoje" e ver 3 nos cards e 116 no feed, o que confunde.
// Agora todo componente le daqui.
function dentroDoPeriodo(a) {
  return dataNoPeriodo(a._created || a.created_at || a.properties?.created);
}

// Alertas ja filtrados pelo periodo ativo
function alertasDoPeriodo() {
  const base = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);
  return base.filter(dentroDoPeriodo);
}

// Features do mapa filtradas pelo periodo ativo (delegacias sempre visiveis:
// sao pontos de referencia fixos, nao ocorrencias datadas)
function featuresDoPeriodo(feats) {
  return (feats || []).filter(f => {
    const p = f.properties || {};
    if (p.type === 'delegacia' || p.source === 'delegacia') return true;
    return dataNoPeriodo(p.created || p.created_at);
  });
}


// ── MENU LATERAL — controlado por clique, nao por hover ───
// O hover fazia o menu abrir/fechar sozinho ao passar o mouse. Agora o
// usuario decide, e a preferencia vale para a sessao inteira.
function alternarMenu() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const aberto = sb.classList.toggle('expandida');
  try { sessionStorage.setItem('ca_menu', aberto ? '1' : '0'); } catch(_) {}
  // O mapa precisa recalcular o tamanho quando a largura muda
  setTimeout(() => {
    try { if (typeof mapDash !== 'undefined' && mapDash) mapDash.invalidateSize(); } catch(_) {}
    try { if (typeof mapFull !== 'undefined' && mapFull) mapFull.invalidateSize(); } catch(_) {}
  }, 280);
}

function restaurarMenu() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  let pref = '1';                                  // padrao: aberto
  try { pref = sessionStorage.getItem('ca_menu') ?? '1'; } catch(_) {}
  sb.classList.toggle('expandida', pref === '1');
}
window.addEventListener('load', restaurarMenu);


// ── CAMERAS PROXIMAS A UMA OCORRENCIA ─────────────────────
// E isto que da utilidade pratica ao cadastro: diante de um incidente,
// saber quais cameras podem ter registrado a cena.
// Distancia por Haversine (km).
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Retorna as cameras num raio (padrao 300 m), da mais perto para a mais longe
function camerasProximas(lat, lng, raioKm = 0.3) {
  const fonte = (typeof dashAlerts !== 'undefined' ? dashAlerts : [])
    .filter(a => a.source === 'camera' || a.type === 'camera');
  return fonte
    .map(cam => {
      const cl = parseFloat(cam.latitude), cg = parseFloat(cam.longitude);
      if (isNaN(cl) || isNaN(cg)) return null;
      return { ...cam, distancia: distanciaKm(lat, lng, cl, cg) };
    })
    .filter(x => x && x.distancia <= raioKm)
    .sort((a, b) => a.distancia - b.distancia);
}

// Bloco HTML para exibir dentro do detalhe de uma ocorrencia
function blocoCamerasProximas(lat, lng) {
  const lista = camerasProximas(lat, lng);
  if (!lista.length) return '';
  const itens = lista.slice(0, 5).map(cam => {
    const metros = Math.round(cam.distancia * 1000);
    return `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid rgba(20,18,14,.05)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3949AB" stroke-width="2" style="flex-shrink:0"><path d="M2 6h3l1.5-2h5L13 6h9v12H2z"/><circle cx="12" cy="12" r="3.2"/></svg>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;color:#1A1814">${escapeHtml(cam.description || cam.location || 'Câmera cadastrada')}</div>
      </div>
      <span style="font-size:11px;color:#3949AB;font-weight:600;white-space:nowrap">${metros} m</span>
    </div>`;
  }).join('');

  return `<div style="margin-top:14px;padding:14px 16px;background:#EEF2FF;border:1px solid rgba(57,73,171,.15);border-radius:12px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3949AB;margin-bottom:10px">
      ${lista.length} câmera${lista.length > 1 ? 's' : ''} pode${lista.length > 1 ? 'm' : ''} ter registrado
    </div>
    ${itens}
    <div style="font-size:11px;color:#5C6BC0;margin-top:10px;line-height:1.5">
      A imagem deve ser solicitada ao proprietário pelo canal formal — nada é acessado automaticamente.
    </div>
  </div>`;
}


// ── BLOQUEIO POR PLANO — unico para todas as areas pagas ───
// Antes cada tela resolvia isso do seu jeito (ou nao resolvia: Relatorios
// prometia bloqueio na pagina de precos, mas liberava para todo mundo).
function planoAtualEhPago() {
  const p = (loadSession()?.plan || selectedBillingPlan || 'free').toLowerCase();
  return p !== 'free' && p !== 'basico' && p !== 'basic';
}

function exigirPlanoPago(idCaixa, titulo, motivo) {
  const caixa = document.getElementById(idCaixa);
  if (!caixa) return;
  const idAviso = idCaixa + '-upsell';
  let aviso = document.getElementById(idAviso);

  if (planoAtualEhPago()) {
    caixa.style.opacity = '';
    caixa.style.pointerEvents = '';
    if (aviso) aviso.remove();
    return;
  }

  caixa.style.opacity = '.45';
  caixa.style.pointerEvents = 'none';
  if (aviso) return;

  aviso = document.createElement('div');
  aviso.id = idAviso;
  aviso.style.cssText = 'background:#fff;border:1.5px solid rgba(200,32,26,.2);border-radius:16px;' +
    'padding:24px;margin-bottom:16px;display:flex;gap:16px;align-items:flex-start;' +
    'box-shadow:0 2px 12px rgba(200,32,26,.06)';
  aviso.innerHTML =
    '<div style="width:38px;height:38px;border-radius:10px;background:rgba(200,32,26,.08);' +
    'display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8201A" stroke-width="2">' +
    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>' +
    '<div style="flex:1">' +
    '<div style="font-size:14px;font-weight:700;color:#1A1814;margin-bottom:5px">' + escapeHtml(titulo) + '</div>' +
    '<p style="font-size:12.5px;color:#777;line-height:1.6;margin-bottom:14px">' + escapeHtml(motivo) + '</p>' +
    '<button onclick="openBillingModal()" style="padding:10px 18px;background:#C8201A;border:none;' +
    'border-radius:10px;color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;' +
    'font-family:\'DM Sans\',sans-serif">Ver planos</button></div>';
  caixa.parentNode.insertBefore(aviso, caixa);
}

// ── ALERTAS VIEW ──

// ── População dos municípios (IBGE — Estimativas 2024) ──────
// Em produção, atualizado automaticamente via ibgeService.js (API SIDRA tabela 6579)
const POPULACAO_GF = {
  'Florianópolis': 537213, 'São José': 250181, 'Palhoça': 175122, 'Biguaçu': 75890,
  'Tijucas': 43797, 'Garopaba': 25774, 'Santo Amaro da Imperatriz': 24293,
  'Governador Celso Ramos': 14619, 'São João Batista': 28869, 'Canelinha': 12722,
  'Imbituba': 43844, 'Antônio Carlos': 8696, 'Águas Mornas': 6056,
  'Alfredo Wagner': 9410, 'São Pedro de Alcântara': 5499, 'Angelina': 4854,
  'Major Gercino': 3279, 'Rancho Queimado': 3637, 'Anitápolis': 3122,
  'São Bonifácio': 2912, 'Paulo Lopes': 7916, 'Imaruí': 10103,
};
const POPULACAO_TOTAL_GF = Object.values(POPULACAO_GF).reduce((a,b)=>a+b,0);

// Taxa de incidentes por 100 mil habitantes — métrica justa entre cidades
function taxaPor100k(incidentes, municipio) {
  const pop = POPULACAO_GF[municipio];
  if (!pop) return null;
  return +((incidentes / pop) * 100000).toFixed(1);
}


let allAlerts = [];

async function loadAllAlerts() {
  try {
    const r = await fetch('/api/public/alerts');
    const data = await r.json();
    allAlerts = (data.alerts || []).map((a, i) => ({
      id:     a.id || `ALT-${String(i+1).padStart(3,'0')}`,
      type:   a.source || a.type || 'infra',
      label:  SOURCE_LABEL[a.source] || TYPE_LABEL[a.type] || 'Alerta',
      source: a.source || 'manual',
      desc:   a.description,
      loc:    a.location || '',
      time:   timeAgo(a.created_at),
      status: a.status || 'open',
    }));
    filterAlerts();
  } catch(e) {
    console.warn('[allAlerts] Erro ao carregar:', e.message);
  }
}let activeFilter = 'all';

function filterAlerts(btn) {
  if (btn && btn.dataset && btn.dataset.filter) {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
  }
  renderAlertasTable(activeFilter);
}

function renderAlertasTable(filter) {
  const tbody = document.getElementById('alertas-tbody');
  if (!tbody) return;
  // Update alert view counters
  const planAl = filterAlertsByPlan(allAlerts, selectedBillingPlan || 'pro');
  const elO = document.getElementById('alt-count-open');
  const elP = document.getElementById('alt-count-progress');
  const elR = document.getElementById('alt-count-resolved');
  if (elO) elO.textContent = planAl.filter(a=>a.status==='open').length;
  if (elP) elP.textContent = planAl.filter(a=>a.status==='progress').length;
  if (elR) elR.textContent  = planAl.filter(a=>a.status==='resolved').length;
  const search = (document.getElementById('alert-search')?.value || '').toLowerCase();
  const tipo   = document.getElementById('alert-tipo-filter')?.value || '';
  const sLabels = { open:'Em aberto', progress:'Em andamento', resolved:'Resolvido' };
  const sClass  = { open:'pill-open', progress:'pill-progress', resolved:'pill-resolved' };
  const filtered = allAlerts.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (tipo && a.type !== tipo) return false;
    if (search && !a.desc.toLowerCase().includes(search) && !a.loc.toLowerCase().includes(search)) return false;
    return true;
  });
  // Update tab counts
  ['all','open','progress','resolved'].forEach(f => {
    const tab = document.querySelector(`.atab[data-filter="${f}"] .atab-count`);
    if (tab) tab.textContent = f === 'all' ? allAlerts.length : allAlerts.filter(a => a.status === f).length;
  });
  // Update sidebar badge
  const nb = document.getElementById('nb-alertas');
  if (nb) nb.textContent = allAlerts.filter(a => a.status === 'open').length;
  tbody.innerHTML = filtered.length ? filtered.map(a => `
    <tr>
      <td style="font-family:monospace;font-size:11px;color:var(--muted)">${escapeHtml(a.id)}</td>
      <td><span class="alert-type-tag tag-${a.type}">${escapeHtml(a.label)}</span></td>
      <td>${escapeHtml(a.desc)}</td>
      <td style="color:var(--muted)">${escapeHtml(a.loc)}</td>
      <td style="color:var(--muted);font-size:11px">${escapeHtml(a.time)}</td>
      <td><span class="status-pill ${sClass[a.status]}">${sLabels[a.status]}</span></td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="var(--muted)" stroke-width="1.5"><circle cx="18" cy="18" r="13"/><path d="M28 28l8 8"/><path d="M13 18h10M18 13v10" opacity=".4"/></svg>
    <div class="empty-state-title">Nenhuma ocorrência encontrada</div>
    <div class="empty-state-desc">Tente ajustar os filtros ou o termo de busca para ver mais resultados.</div>
    <button onclick="clearAlertFilters()" style="margin-top:14px;background:none;border:1px solid var(--border-strong);color:var(--ink);padding:7px 16px;border-radius:3px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif">Limpar filtros</button>
  </div></td></tr>`;
}

// ── DELEGACIAS VIEW ──
const delegacias = [
  // Florianópolis — 4 DPs
  { cod:'FLN-01', nome:'1ª DP Central',        bairro:'Centro',             regiao:'Florianópolis',             tel:'(48) 3665-2600', endereco:'R. Conselheiro Mafra, 456',      status:'24h'  }, { cod:'FLN-02', nome:'DP Canasvieiras',       bairro:'Canasvieiras',       regiao:'Florianópolis',             tel:'(48) 3369-7000', endereco:'Av. das Nações, 1500',           status:'24h'  }, { cod:'FLN-03', nome:'DP Lagoa da Conceição', bairro:'Lagoa da Conceição', regiao:'Florianópolis',             tel:'(48) 3234-0500', endereco:'R. Manuel Severino Gomes, 100',  status:'24h'  }, { cod:'FLN-04', nome:'7ª DP Trindade',        bairro:'Trindade',           regiao:'Florianópolis',             tel:'(48) 3665-2700', endereco:'R. Dep. Antônio Edu Vieira, 500', status:'24h'  }, // São José — 1 DP
  { cod:'SJE-01', nome:'DP Kobrasol',           bairro:'Kobrasol',           regiao:'São José',                  tel:'(48) 3381-3500', endereco:'R. Koesa, 250',                  status:'24h'  }, // Palhoça — 1 DP
  { cod:'PAL-01', nome:'DP Central Palhoça',    bairro:'Centro',             regiao:'Palhoça',                   tel:'(48) 3279-8000', endereco:'R. Cel. Moreira, 120',            status:'24h'  }, // Biguaçu — 1 DP
  { cod:'BIG-01', nome:'DP Biguaçu',            bairro:'Centro',             regiao:'Biguaçu',                   tel:'(48) 3279-3000', endereco:'R. Dom Pedro II, 400',            status:'08-18'}, // Garopaba — 1 DP
  { cod:'GAR-01', nome:'DP Garopaba',           bairro:'Centro',             regiao:'Garopaba',                  tel:'(48) 3254-0200', endereco:'R. Cel. Antônio Fernandes, 200',  status:'08-18'}, // Tijucas — 1 DP
  { cod:'TIJ-01', nome:'DP Tijucas',            bairro:'Centro',             regiao:'Tijucas',                   tel:'(47) 3263-0500', endereco:'Av. João Pessoa, 800',            status:'08-18'}, // Gov. Celso Ramos — 1 DP
  { cod:'GCR-01', nome:'DP Gov. Celso Ramos',   bairro:'Centro',             regiao:'Gov. Celso Ramos',          tel:'(48) 3253-8000', endereco:'R. João Dias, 50',               status:'08-18'}, // Santo Amaro da Imperatriz — 1 DP
  { cod:'SAI-01', nome:'DP Santo Amaro',        bairro:'Centro',             regiao:'Santo Amaro da Imperatriz', tel:'(48) 3279-6000', endereco:'R. das Palmeiras, 100',          status:'08-18'}, // Paulo Lopes — 1 DP
  { cod:'PLP-01', nome:'DP Paulo Lopes',        bairro:'Centro',             regiao:'Paulo Lopes',               tel:'(48) 3254-5000', endereco:'R. Principal, 200',              status:'08-18'}, // Canelinha — 1 DP
  { cod:'CAN-01', nome:'DP Canelinha',          bairro:'Centro',             regiao:'Canelinha',                 tel:'(47) 3263-7000', endereco:'R. Felipe Neri, 150',            status:'08-18'}, // São João Batista — 1 DP
  { cod:'SJB-01', nome:'DP São João Batista',   bairro:'Centro',             regiao:'São João Batista',          tel:'(47) 3263-9000', endereco:'Av. Santa Catarina, 300',        status:'08-18'}, // Nova Trento — 1 DP
  { cod:'NTR-01', nome:'DP Nova Trento',        bairro:'Centro',             regiao:'Nova Trento',               tel:'(47) 3293-0100', endereco:'R. XV de Novembro, 500',         status:'08-18'}, // Antônio Carlos — 1 DP
  { cod:'ANC-01', nome:'DP Antônio Carlos',     bairro:'Centro',             regiao:'Antônio Carlos',            tel:'(48) 3279-4000', endereco:'R. Duque de Caxias, 200',        status:'08-18'}, // Rancho Queimado — 1 DP
  { cod:'RQM-01', nome:'DP Rancho Queimado',    bairro:'Centro',             regiao:'Rancho Queimado',           tel:'(48) 3279-2000', endereco:'R. Recanto, 120',                status:'08-18'}, // Águas Mornas — 1 DP
  { cod:'AGM-01', nome:'DP Águas Mornas',       bairro:'Centro',             regiao:'Águas Mornas',              tel:'(48) 3279-5000', endereco:'R. Principal, 300',              status:'08-18'}, // Angelina — 1 DP
  { cod:'ANG-01', nome:'DP Angelina',           bairro:'Centro',             regiao:'Angelina',                  tel:'(48) 3279-7000', endereco:'R. Cristóbal Kolumb, 100',       status:'08-18'}, // São Pedro de Alcântara — 1 DP
  { cod:'SPA-01', nome:'DP São Pedro de Alcântara',bairro:'Centro',          regiao:'São Pedro de Alcântara',    tel:'(48) 3279-9000', endereco:'R. Tiradentes, 80',              status:'08-18'}, // Major Gercino — 1 DP
  { cod:'MJG-01', nome:'DP Major Gercino',      bairro:'Centro',             regiao:'Major Gercino',             tel:'(47) 3293-2000', endereco:'R. Central, 50',                 status:'08-18'}, // Leoberto Leal — 1 DP
  { cod:'LBL-01', nome:'DP Leoberto Leal',      bairro:'Centro',             regiao:'Leoberto Leal',             tel:'(49) 3533-0100', endereco:'R. Getúlio Vargas, 200',         status:'08-18'}, // Alfredo Wagner — 1 DP
  { cod:'ALW-01', nome:'DP Alfredo Wagner',     bairro:'Centro',             regiao:'Alfredo Wagner',            tel:'(49) 3543-0100', endereco:'Av. Cel. Marcos Rovaris, 300',   status:'08-18'}, // Anitápolis — 1 DP
  { cod:'ANT-01', nome:'DP Anitápolis',         bairro:'Centro',             regiao:'Anitápolis',                tel:'(49) 3545-0100', endereco:'R. Marechal Deodoro, 150',       status:'08-18'}, // São Bonifácio — 1 DP
  { cod:'BCS-01', nome:'DP São Bonifácio',     bairro:'Centro',             regiao:'São Bonifácio',            tel:'(49) 3256-0100', endereco:'R. Vidal Ramos, 100',            status:'08-18'},
];
function renderDelegaciasTable() {
  const tbody = document.getElementById('delegacias-tbody');
  if (!tbody) return;
  const planDelegs = PLAN_MUNIS[selectedBillingPlan || 'pro']
      ? delegacias.filter(d => (PLAN_MUNIS[selectedBillingPlan || 'pro']).some(m => d.regiao.includes(m)))
      : delegacias;
  if (!planDelegs.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center">
      <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:4px">Nenhuma delegacia encontrada</div>
      <div style="font-size:12px;color:var(--muted)">Tente outros termos de busca</div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = planDelegs.map(d => `
    <tr>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${d.cod || '—'}</td>
      <td style="font-weight:500">${d.nome}</td>
      <td style="color:var(--muted)">${d.bairro}</td>
      <td><span class="alert-type-tag" style="background:rgba(27,45,82,.08);color:var(--navy)">${d.regiao}</span></td>
      <td style="color:var(--muted);font-size:12px">${d.tel}</td>
      <td><span class="status-pill pill-resolved">Ativa</span></td>
    </tr>`).join('');
}

// ── WEBHOOKS VIEW ──
let webhooks = [
  { url:'https://hooks.zapier.com/hooks/catch/abc123', events:'alert.created, alert.resolved', created:'10/05/2026', last:'há 2 min',   active:true  },
  { url:'https://api.minhaempresa.com/alertas',        events:'alert.created',                 created:'22/04/2026', last:'há 1 hora',  active:true  },
  { url:'https://slack.minhaorg.com/webhook/xyz',      events:'alert.resolved',                created:'01/03/2026', last:'há 3 dias',  active:false },
];
function renderWebhooksTable() {
  const tbody = document.getElementById('webhooks-tbody');
  if (!tbody) return;
  // Simula ausência de webhooks configurados para novos usuários
  const hasWebhooks = webhooks && webhooks.length > 0;
  if (!hasWebhooks) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:48px;text-align:center">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="rgba(20,18,14,.2)" stroke-width="1.5" style="margin:0 auto 12px;display:block"><circle cx="18" cy="18" r="14"/><path d="M12 18h12M18 12v12"/></svg>
      <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:5px">Nenhuma integração configurada</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Configure uma integração para enviar alertas automaticamente para WhatsApp, Slack ou qualquer outro sistema</div>
      <button onclick="showToast('Configure uma URL de destino para começar')" class="btn-primary" style="padding:8px 20px;font-size:12px">+ Criar primeira integração</button>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = webhooks.map((w, i) => `
    <tr>
      <td style="font-size:11px;font-family:monospace;color:var(--navy);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.url}</td>
      <td style="font-size:11px;color:var(--muted)">${w.events}</td>
      <td style="color:var(--muted);font-size:11px">${w.created}</td>
      <td style="color:var(--muted);font-size:11px">${w.last}</td>
      <td><span class="status-pill ${w.active ? 'pill-resolved' : 'pill-open'}">${w.active ? 'Ativo' : 'Inativo'}</span></td>
      <td style="display:flex;gap:8px">
        <button style="font-size:11px;color:var(--red);background:none;border:none;cursor:pointer;font-weight:500" onclick="toggleWebhook(${i})">Testar</button>
        <button style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer" onclick="deleteWebhook(${i})">Remover</button>
      </td>
    </tr>`).join('');
}
function addWebhook() {
  const url = prompt('URL do webhook:');
  if (!url) return;
  webhooks.unshift({ url, events:'alert.created', created: new Date().toLocaleDateString('pt-BR'), last:'Nunca', active:true });
  renderWebhooksTable();
  showToast('Webhook adicionado com sucesso');
}
function toggleWebhook(i) { showToast('Enviando payload de teste para ' + webhooks[i].url.substring(0, 30) + '…'); }
function deleteWebhook(i) {
  if (!confirm('Remover este webhook?')) return;
  webhooks.splice(i, 1);
  renderWebhooksTable();
  showToast('Webhook removido');
}

// ── FATURAMENTO VIEW ──
// ── FATURAMENTO ──
const invoices = [
  { id:'INV-2026-006', period:'Mai 2026', value:'R$ 297,00', due:'05/06/2026', method:'—',          status:'pending' },
  { id:'INV-2026-005', period:'Abr 2026', value:'R$ 297,00', due:'05/05/2026', method:'Visa ••7823', status:'paid'    },
  { id:'INV-2026-004', period:'Mar 2026', value:'R$ 297,00', due:'05/04/2026', method:'Visa ••7823', status:'paid'    },
  { id:'INV-2026-003', period:'Fev 2026', value:'R$ 297,00', due:'05/03/2026', method:'Visa ••7823', status:'paid'    },
  { id:'INV-2026-002', period:'Jan 2026', value:'R$ 297,00', due:'05/02/2026', method:'Visa ••7823', status:'paid'    },
];
let hasCard = false;
let billingState = 'trial';

function setFatTab(btn) {
  document.querySelectorAll('[data-fat],.fat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.fat-panel').forEach(p => { p.style.display='none'; p.classList.remove('active'); });
  const panel = document.getElementById('fat-' + btn.dataset.fat);
  if (panel) { panel.style.display='block'; panel.classList.add('active'); }
  if (btn.dataset.fat === 'faturas') renderInvoices();
  if (btn.dataset.fat === 'metodo')  renderPaymentMethod();
}

function renderInvoices() {
  const tbody = document.getElementById('fat-invoice-tbody');
  if (!tbody) return;
  const sClass = { pending:'pill-progress', paid:'pill-resolved', failed:'pill-open' };
  const sLabel = { pending:'Pendente', paid:'Pago', failed:'Falhou' };
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td style="font-family:monospace;font-size:11px;color:var(--muted)">#${inv.id}</td>
      <td>${inv.period}</td><td style="font-weight:500">${inv.value}</td>
      <td style="color:var(--muted)">${inv.due}</td>
      <td style="color:var(--muted);font-size:11px">${inv.method}</td>
      <td><span class="status-pill ${sClass[inv.status]}">${sLabel[inv.status]}</span></td>
      <td><button style="font-size:11px;color:var(--red);background:none;border:none;cursor:pointer;font-weight:500;font-family:'DM Sans',sans-serif" onclick="showToast('Abrindo PDF ${inv.id}…')">PDF ↓</button></td>
    </tr>`).join('');
}

function renderPaymentMethod() {
  const noCard = document.getElementById('fat-no-card');
  const hasCardEl = document.getElementById('fat-has-card');
  if (noCard)  noCard.style.display  = hasCard ? 'none'  : 'block';
  if (hasCardEl) hasCardEl.style.display = hasCard ? 'block' : 'none';
}

function syncFaturamento() {
  const planName  = document.getElementById('fat-plan-name');
  const plan      = selectedBillingPlan || 'pro';
  const names     = { free:'Básico', pro:'Profissional', enterprise:'Corporativo' };
  const prices    = { free:'R$0',    pro:'R$297',        enterprise:'Custom'      };
  if (planName) planName.textContent = names[plan] || 'Profissional';
  const priceEl = document.getElementById('fat-plan-price');
  if (priceEl) priceEl.innerHTML = (prices[plan]||'R$297') + (plan!=='enterprise'?'<span style="font-family:\'DM Sans\',sans-serif;font-size:16px;font-weight:300;color:rgba(255,255,255,.4)">/mês</span>':'');
  const trialEl = document.getElementById('fat-trial-end');
  if (trialEl) { const d=new Date(); d.setDate(d.getDate()+14); trialEl.textContent='expira em '+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}); }
  const bar = document.getElementById('fat-trial-bar');
  if (bar) setTimeout(() => bar.style.width = '5%', 300);
  renderInvoices();
  renderPaymentMethod();
}

function startStripeCheckout() {
  document.getElementById('stripe-checkout-overlay').classList.add('open');
}
function closeStripeCheckout(e, force) {
  if (!force && e && e.target !== document.getElementById('stripe-checkout-overlay')) return;
  document.getElementById('stripe-checkout-overlay').classList.remove('open');
}
function simulateStripeSuccess() {
  hasCard = true; billingState = 'active';
  closeStripeCheckout(null, true);
  const banner = document.getElementById('fat-trial-banner');
  if (banner) {
    banner.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#43A047" stroke-width="2"><path d="M2 6l3 3 5-5"/></svg><span style="font-size:11px;color:#43A047;font-weight:600">CARTÃO CADASTRADO — plano ativo após o trial</span></div>`;
    banner.style.background='rgba(67,160,71,.1)'; banner.style.borderColor='rgba(67,160,71,.25)';
  }
  renderPaymentMethod();
  showToast('✓ Cartão cadastrado — você receberá confirmação por e-mail');
}
function openStripePortal() {
  showToast('Produção: redirect para billing.stripe.com com session key da Stripe');
}
function confirmCancelPlan() {
  if (!confirm('Tem certeza? Seu acesso permanece ativo até o fim do período pago.')) return;
  billingState = 'cancelled';
  const banner = document.getElementById('fat-trial-banner');
  if (banner) { banner.innerHTML=`<span style="font-size:11px;color:#F07070;font-weight:600">Assinatura cancelada — acesso ativo até o fim do período pago</span>`; banner.style.background='rgba(200,32,26,.08)'; banner.style.borderColor='rgba(200,32,26,.3)'; }
  showToast('Assinatura cancelada. Acesso ativo até o fim do período pago.');
}

// ── CONFIG VIEW ──
function setCfgTab(btn) {
  document.querySelectorAll('.cfg-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.cfg-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('cfg-' + btn.dataset.cfg);
  if (target) target.classList.add('active');
}
function syncCfgFields() {
  // Prioriza sessão salva, depois campos do formulário de cadastro
  const sess  = loadSession() || {};
  const name  = sess['inp-name']      || document.getElementById('inp-name')?.value        || '';
  const sob   = sess['inp-sobrenome'] || document.getElementById('inp-sobrenome')?.value   || '';
  const email = sess.email            || document.getElementById('inp-email')?.value       || '';
  const org   = sess.org              || document.getElementById('inp-org')?.value         || '';
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  setVal('cfg-name', name);
  setVal('cfg-sob',  sob);
  setVal('cfg-email', email);
  setVal('cfg-org-name', org);
}
function deleteMyAccount() {
  // Abre o modal moderno de confirmação
  const ov = document.getElementById('del-overlay');
  const inp = document.getElementById('del-confirm-input');
  const btn = document.getElementById('del-confirm-btn');
  if (inp) inp.value = '';
  if (btn) btn.disabled = true;
  if (ov) ov.style.display = 'flex';
}
function closeDeleteModal(ev, force) {
  if (ev && ev.target !== ev.currentTarget && !force) return;
  const ov = document.getElementById('del-overlay');
  if (ov) ov.style.display = 'none';
}
function checkDeleteConfirm() {
  const v = (document.getElementById('del-confirm-input')?.value || '').trim().toUpperCase();
  const btn = document.getElementById('del-confirm-btn');
  if (btn) btn.disabled = (v !== 'EXCLUIR');
}
function confirmDeleteAccount() {
  // Em produção: chama DELETE /api/account (apaga tenant + usuários).
  try {
    if (typeof clearSession === 'function') clearSession();
    sessionStorage.clear();
  } catch(e) {}
  closeDeleteModal(null, true);
  if (typeof showToast === 'function') showToast('Conta excluída. Seus dados foram removidos com segurança.');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-landing')?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof updateLandingTopbar === 'function') updateLandingTopbar();
}

function exportMyData() {
  const s = (typeof loadSession === 'function' ? loadSession() : null) || {};
  const dados = {
    exportadoEm: new Date().toISOString(),
    plataforma: 'Comunidade Alerta',
    titular: {
      nome: s.name || null,
      email: s.email || null,
      organizacao: s.org || null,
      documento: s.cnpjCpf || null,
      plano: s.plan || null,
    },
    trial: {
      ativo: !!s.trialGranted,
      expiraEm: s.trialEndsAt ? new Date(s.trialEndsAt).toISOString() : null,
    },
    observacao: 'Cópia dos dados pessoais associados à sua conta, conforme o direito de portabilidade (art. 18, V, LGPD).'
  };
  try {
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comunidade-alerta-meus-dados-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('✅ Seus dados foram exportados (JSON)');
  } catch(e) {
    if (typeof showToast === 'function') showToast('Não foi possível exportar agora');
  }
}

function saveCfg() {
  const name  = document.getElementById('cfg-name')?.value  || '';
  const sob   = document.getElementById('cfg-sob')?.value   || '';
  const email = document.getElementById('cfg-email')?.value || '';
  const org   = document.getElementById('cfg-org-name')?.value || '';
  if (name && document.getElementById('inp-name'))  document.getElementById('inp-name').value  = name;
  if (sob  && document.getElementById('inp-sobrenome')) document.getElementById('inp-sobrenome').value = sob;
  if (email && document.getElementById('inp-email')) document.getElementById('inp-email').value = email;
  if (org  && document.getElementById('inp-org'))   document.getElementById('inp-org').value   = org;
  syncUserToDash();
  // Persiste na sessão
  const currentSess = loadSession() || {};
  if (Object.keys(currentSess).length) {
    saveSession({ ...currentSess, 'inp-name':name, 'inp-sobrenome':sob, email, org, name:[name,sob].filter(Boolean).join(' ') });
  }
  showToast('✓ Configurações salvas com sucesso');
}

// showToast (update to accept message)

function showUpgradePrompt(feature) {
  const overlay = document.getElementById('gmodal-overlay');
  const titleEl = document.getElementById('gmodal-title');
  const bodyEl  = document.getElementById('gmodal-body');
  if (!overlay) { showToast('Faça upgrade para acessar ' + feature); return; }
  titleEl.textContent = 'Recurso exclusivo do plano Profissional';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🔒</div>
      <p style="font-size:14px;color:var(--ink);font-weight:600;margin-bottom:8px">${feature}</p>
      <p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:24px">
        Este recurso está disponível no plano <strong>Profissional</strong> (R$297/mês).<br/>
        Você continua monitorando os 22 municípios — o upgrade desbloqueia relatórios, integrações e alertas ilimitados.
      </p>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn-primary" style="padding:10px 24px" onclick="setNav(document.querySelector('.nav-item[data-view=faturamento]'));closeModal(null,true)">Ver planos → Fazer upgrade</button>
        <button onclick="closeModal(null,true)" style="padding:10px 20px;background:none;border:1px solid var(--border);cursor:pointer;font-family:'DM Sans',sans-serif;border-radius:2px">Agora não</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}


// ── Autenticação em Dois Fatores (2FA) ───────────────────────
let twoFAEnabled = false;

async function setup2FA() {
  document.getElementById('twofa-disabled').style.display = 'none';
  document.getElementById('twofa-setup').style.display = 'flex';
  const secretEl = document.getElementById('twofa-secret');
  const qrEl = document.getElementById('twofa-qr');
  secretEl.textContent = 'Gerando...';
  qrEl.innerHTML = '';
  try {
    // PRODUÇÃO: o segredo é gerado no backend (nunca no navegador)
    const r = await apiPost('/auth/2fa/setup', {});
    if (!r || !r.secret) throw new Error('sem backend');
    secretEl.textContent = r.secret.match(/.{1,4}/g).join(' ');
    qrEl.innerHTML = r.qr
      ? `<img src="${r.qr}" alt="QR Code 2FA" style="width:140px;height:140px"/>`
      : '<div style="font-size:9px;color:var(--muted)">Use o código manual acima</div>';
  } catch (e) {
    // DEMO (sem backend rodando): mostra orientação, sem segredo real
    secretEl.textContent = '—— modo demo ——';
    qrEl.innerHTML = '<div style="font-size:10px;color:var(--muted);max-width:160px;text-align:center;line-height:1.5">No deploy com backend ativo, aqui aparece o QR Code real gerado pelo servidor.</div>';
  }
  document.getElementById('twofa-code').focus();
}

async function verify2FA() {
  const code = document.getElementById('twofa-code').value.replace(/\s/g,'');
  if (code.length !== 6 || !/^\d+$/.test(code)) {
    showToast('Digite o código de 6 dígitos do app'); return;
  }
  let ok = false;
  try {
    const r = await apiPost('/auth/2fa/verify', { code });
    if (r && r.error) { showToast(r.error); return; }
    ok = !!(r && (r.enabled || (r.ok && !API_ENABLED)));
  } catch (e) {
    ok = !API_ENABLED; // modo demo (sem backend): aceita para demonstração da UI
  }
  if (!ok) { showToast('Código inválido. Tente novamente.'); return; }
  twoFAEnabled = true;
  document.getElementById('twofa-setup').style.display = 'none';
  document.getElementById('twofa-active').style.display = 'flex';
  const badge = document.getElementById('twofa-badge');
  if (badge) { badge.textContent = 'ATIVO'; badge.style.background = 'rgba(46,125,50,.1)'; badge.style.color = 'var(--success)'; }
  showToast('✓ 2FA ativado com sucesso — sua conta está protegida');
}

function cancel2FA() {
  document.getElementById('twofa-setup').style.display = 'none';
  document.getElementById('twofa-disabled').style.display = 'flex';
  document.getElementById('twofa-code').value = '';
}

async function disable2FA() {
  if (!confirm('Desativar o 2FA reduz a segurança da sua conta. Confirma?')) return;
  try { await apiPost('/auth/2fa/disable', {}); } catch (e) {}
  twoFAEnabled = false;
  document.getElementById('twofa-active').style.display = 'none';
  document.getElementById('twofa-disabled').style.display = 'flex';
  document.getElementById('twofa-badge').textContent = 'INATIVO';
  document.getElementById('twofa-badge').style.background = 'rgba(200,32,26,.08)';
  document.getElementById('twofa-badge').style.color = 'var(--red)';
  showToast('2FA desativado');
}

function changePassword() {
  const atual = document.getElementById('cfg-pass-atual')?.value || '';
  const nova  = document.getElementById('cfg-pass-nova')?.value  || '';
  const conf  = document.getElementById('cfg-pass-conf')?.value  || '';
  if (!atual) { showToast('Digite sua senha atual'); return; }
  if (nova.length < 8) { showToast('A nova senha deve ter no mínimo 8 caracteres'); return; }
  if (nova !== conf)   { showToast('As senhas não conferem'); return; }
  showToast('✓ Senha alterada com sucesso');
  ['cfg-pass-atual','cfg-pass-nova','cfg-pass-conf'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}


// ── Toggle Dev/Prod — atalho oculto ──────────────────────────
// Console: comunidadeAlerta.toggleAPI()
// Teclado: Ctrl+Shift+D (admin only)
let _apiEnabled = API_ENABLED;

window.comunidadeAlerta = {
  toggleAPI() {
    _apiEnabled = !_apiEnabled;
    const badge = document.getElementById('api-status-label');
    const dot   = document.getElementById('api-status-dot');
    if (_apiEnabled) {
      showToast('🟢 Modo API ativado — usando backend real');
      if (dot)   dot.style.background = 'var(--success)';
      if (badge) badge.textContent = 'Online';
      checkApiStatus();
    } else {
      showToast('🟡 Modo Demo ativado — usando dados locais');
      if (dot)   dot.style.background = 'var(--gold)';
      if (badge) badge.textContent = 'Modo demo';
    }
    console.info(`[ComunidadeAlerta] API_ENABLED = ${_apiEnabled}`);
    return `API_ENABLED agora é ${_apiEnabled}`;
  },
  status() {
    return { apiEnabled: _apiEnabled, plan: selectedBillingPlan, demo: window.__demoMode };
  }
};

// Ctrl+Shift+D → toggle (só em dashboard)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D' && document.getElementById('page-dashboard')?.classList.contains('active')) {
    e.preventDefault();
    window.comunidadeAlerta.toggleAPI();
  }
});

// Banner de modo dev — desativado a pedido (mantido para debug via console)
function showDevBanner() {
  // Desativado: não exibe mais o banner "MODO DEV" na topbar.
  // Para alternar API dev/prod use Ctrl+Shift+D ou comunidadeAlerta.toggleAPI()
  return;
}

// Banner de modo dev removido da inicialização
document.addEventListener('DOMContentLoaded', () => {
  // (banner desativado)
});


// ═══════════════════════════════════════════════════════════
//  MELHORIAS DE PRODUTO
// ═══════════════════════════════════════════════════════════

// ── FEATURE 1: Onboarding guiado ────────────────────────────
const ONBOARD_STEPS = [
  { sel: '.nav-item[data-view="dashboard"]', title: 'Painel inicial', text: 'Seu centro de operações: indicadores, insights acionáveis e o resumo da região em tempo real.' },
  { sel: '.insights-strip', title: 'Insights acionáveis', text: 'A plataforma analisa os dados e sugere ações — onde concentrar patrulhamento, riscos ativos e desempenho da equipe.' },
  { sel: '.nav-item[data-view="mapa"]', title: 'Mapa ao vivo', text: 'Todos os incidentes da Grande Florianópolis em tempo real, com lista sincronizada, filtros por tipo, fonte e período.' },
  { sel: '.nav-item[data-view="alertas"]', title: 'Alertas e ocorrências', text: 'Gerencie ocorrências, filtre por status e resolva diretamente da lista, com trilha de auditoria.' },
  { sel: '.nav-item[data-view="cameras"]', title: 'Rede de câmeras', text: 'Condomínios e empresas registram suas câmeras. Em uma ocorrência, a equipe sabe quais câmeras podem ter imagens.' },
];
let onboardIdx = 0;
function startOnboarding() {
  if (sessionStorage.getItem('ca_onboarded')) return;
  onboardIdx = 0;
  showOnboardStep();
}
function showOnboardStep() {
  document.getElementById('onboard-pop')?.remove();
  if (onboardIdx >= ONBOARD_STEPS.length) { sessionStorage.setItem('ca_onboarded','1'); return; }
  const step = ONBOARD_STEPS[onboardIdx];
  const target = document.querySelector(step.sel);
  if (!target) { onboardIdx++; showOnboardStep(); return; }
  const r = target.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'onboard-pop';
  pop.style.cssText = `position:fixed;z-index:9500;background:var(--ink);color:var(--paper);padding:16px 18px;border-radius:6px;max-width:260px;box-shadow:0 8px 28px rgba(0,0,0,.4);font-family:'DM Sans',sans-serif`;
  pop.innerHTML = `
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);font-weight:700;margin-bottom:6px">Passo ${onboardIdx+1} de ${ONBOARD_STEPS.length}</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:5px">${step.title}</div>
    <div style="font-size:12px;line-height:1.5;color:rgba(244,239,228,.75);margin-bottom:14px">${step.text}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="skipOnboarding()" style="background:none;border:none;color:rgba(244,239,228,.5);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif">Pular</button>
      <button onclick="nextOnboard()" style="background:var(--red);color:#fff;border:none;padding:6px 16px;border-radius:3px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">${onboardIdx === ONBOARD_STEPS.length-1 ? 'Concluir' : 'Próximo →'}</button>
    </div>`;
  document.body.appendChild(pop);
  let top = r.bottom + 10, left = r.left;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 272;
  if (top + 130 > window.innerHeight) top = r.top - 140;
  pop.style.top = Math.max(10,top) + 'px';
  pop.style.left = Math.max(10,left) + 'px';
  target.style.outline = '2px solid var(--red)';
  target.style.outlineOffset = '2px';
  pop._target = target;
}
function nextOnboard() {
  const pop = document.getElementById('onboard-pop');
  if (pop?._target) pop._target.style.outline = '';
  onboardIdx++; showOnboardStep();
}
function skipOnboarding() {
  const pop = document.getElementById('onboard-pop');
  if (pop?._target) pop._target.style.outline = '';
  pop?.remove();
  sessionStorage.setItem('ca_onboarded','1');
}

// ── FEATURE 3: Modo TV / Apresentação ───────────────────────
let tvClockInterval = null, tvMapInstance = null;



// ── FEATURE 4: Filtro de período ────────────────────────────
const PERIODO_DIAS   = { hoje: 1, '7d': 7, '30d': 30, mes2: 'calendario', tudo: null };

function inicioMesAnterior() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
}

function dataNoPeriodo(valor) {
  const modo = PERIODO_DIAS[periodoAtual];
  if (modo === null || modo === undefined) return true;
  const d = new Date(valor);
  if (isNaN(d)) return false;
  if (modo === 'calendario') return d.getTime() >= inicioMesAnterior();
  return d.getTime() >= Date.now() - modo * 864e5;
}
const PERIODO_ROTULO = { hoje: 'último dia', '7d': 'últimos 7 dias',
                         '30d': 'últimos 30 dias', mes2: 'mês atual e anterior', tudo: 'todo o histórico' };
const PERIODO_TITULO = { hoje: 'Incidentes hoje', '7d': 'Incidentes (7 dias)',
                         '30d': 'Incidentes (30 dias)', mes2: 'Incidentes (2 meses)', tudo: 'Incidentes' };
let periodoAtual = 'tudo';

function setPeriod(btn) {
  document.querySelectorAll('.period-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  periodoAtual = btn.dataset.period || 'tudo';
  aplicarPeriodo();
  showToast('Período: ' + (PERIODO_ROTULO[periodoAtual] || periodoAtual));
}

function aplicarPeriodo() {
  const d = calcPeriodStats(PERIODO_DIAS[periodoAtual]);
  animateCount('ds-hoje', d.hoje);
  animateCount('ds-abertos', d.abertos);
  animateCount('ds-resolvidos', d.resolvidos);

  // O titulo acompanha o periodo — nunca dizer "hoje" mostrando historico.
  const t = document.getElementById('ds-hoje-label');
  if (t) t.textContent = PERIODO_TITULO[periodoAtual] || 'Incidentes';

  const dl = document.getElementById('ds-hoje-delta');
  if (dl) {
    const base = (typeof dashAlerts !== 'undefined' ? dashAlerts : []).length;
    dl.textContent = (d.hoje === 0 && base > 0)
      ? 'nenhum registro neste período'
      : (PERIODO_ROTULO[periodoAtual] || '');
  }
  renderSparklines();

  // Redesenha todos os componentes para o mesmo recorte de tempo.
  try { chartData = buildChartData(alertasDoPeriodo()); } catch(_) {}
  try { renderChart?.(); }        catch(_) {}
  try { renderDashFeed?.(); }     catch(_) {}
  try { renderMapPanel?.(); }     catch(_) {}
  try { updateMapCounters?.(); }  catch(_) {}
  try { renderInsights?.(); }     catch(_) {}
  try { renderRecentes?.(); }     catch(_) {}
  try { drawMarkers?.(); }        catch(_) {}
  try { renderAlertasTable?.(typeof activeFilter !== 'undefined' ? activeFilter : 'all'); } catch(_) {}
}

// ── FEATURE 5: Ranking de municípios ────────────────────────
function renderRanking() {
  const el = document.getElementById('ranking-list');
  if (!el) return;
  const counts = {};
  const src = (typeof allAlerts !== 'undefined' ? allAlerts : []);
  src.forEach(a => {
    const city = (a.loc || '').split('·').pop().trim() || 'Outros';
    counts[city] = (counts[city]||0) + 1;
  });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const total = src.length || 1;
  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state-desc" style="padding:20px;text-align:center">Sem dados no período</div>';
    return;
  }
  const max = sorted[0][1];
  const medals = ['#C8201A','#E0651A','#B8890A']; // 1º,2º,3º
  el.innerHTML = sorted.map(([city,count],i) => {
    const pct = Math.round(count/total*100);
    const barPct = Math.round(count/max*100);
    const medalColor = i < 3 ? medals[i] : 'var(--muted)';
    return `
      <div class="rank-row2">
        <div class="rank-medal" style="background:${i<3?medalColor:'transparent'};color:${i<3?'#fff':'var(--muted)'};border:${i<3?'none':'1px solid var(--border)'}">${i+1}</div>
        <div class="rank-info">
          <div class="rank-top">
            <span class="rank-city2">${city}</span>
            <span class="rank-vals"><strong>${count}</strong> <span style="color:var(--muted)">· ${pct}%</span></span>
          </div>
          <div class="rank-bar-track2"><div class="rank-bar-fill2" style="width:${barPct}%;background:${medalColor}"></div></div>
        </div>
      </div>`;
  }).join('');
}


// ── FEATURE 6: Heatmap de horários ──────────────────────────
function renderHeatmapHours() {
  const el = document.getElementById('heatmap-hours');
  if (!el) return;
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const data = dias.map((d,di) => Array.from({length:24}, (_,h) => {
    let base = 2;
    if (h>=18 || h<=2) base += 5;
    if (h>=7 && h<=9) base += 3;
    if (di===5 || di===6 || di===0) base += 3;
    return Math.max(0, Math.round(base + (Math.sin(di*h)*2)));
  }));
  const max = Math.max(...data.flat());
  const totalInc = data.flat().reduce((a,b)=>a+b,0);
  // Encontra o pico
  let peakVal=0, peakDia='', peakH=0;
  data.forEach((row,di)=>row.forEach((v,h)=>{ if(v>peakVal){peakVal=v;peakDia=dias[di];peakH=h;} }));

  const color = v => {
    if (v===0) return 'var(--paper-dark)';
    const t = v/max;
    if (t<.25) return 'rgba(200,32,26,.18)';
    if (t<.5)  return 'rgba(200,32,26,.42)';
    if (t<.75) return 'rgba(200,32,26,.68)';
    return 'rgba(200,32,26,.92)';
  };

  let html = '<div class="hm2">';
  // Linha de horas (cabeçalho)
  html += '<div class="hm2-corner"></div>';
  for (let h=0; h<24; h++) {
    html += `<div class="hm2-hour">${h%6===0?h+'h':''}</div>`;
  }
  // Linhas de dias
  dias.forEach((d,di) => {
    html += `<div class="hm2-day">${d}</div>`;
    data[di].forEach((v,h) => {
      html += `<div class="hm2-cell" style="background:${color(v)}" title="${d} ${h}h — ${v} incidentes"></div>`;
    });
  });
  html += '</div>';

  // Rodapé: insight + legenda
  html += `<div class="hm2-footer">
    <div class="hm2-insight">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--red)" stroke-width="1.5"><path d="M6.5 1v11M1 6.5h11" opacity=".3"/><circle cx="6.5" cy="6.5" r="2.5"/></svg>
      Pico: <strong>${peakDia} ${peakH}h</strong>
    </div>
    <div class="hm2-legend">
      <span>Menos</span>
      <div class="hm2-lg" style="background:rgba(200,32,26,.18)"></div>
      <div class="hm2-lg" style="background:rgba(200,32,26,.42)"></div>
      <div class="hm2-lg" style="background:rgba(200,32,26,.68)"></div>
      <div class="hm2-lg" style="background:rgba(200,32,26,.92)"></div>
      <span>Mais</span>
    </div>
  </div>`;
  el.innerHTML = html;
}


// ── FEATURE 9: Exportar CSV ─────────────────────────────────

function clearAlertFilters() {
  const search = document.getElementById('alert-search');
  const tipo   = document.getElementById('alert-tipo-filter');
  if (search) search.value = '';
  if (tipo)   tipo.value = '';
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
  const allTab = document.querySelector('.atab[data-filter="all"]');
  if (allTab) allTab.classList.add('active');
  renderAlertasTable('all');
}

function exportAlertsCSV() {
  const plan = typeof selectedBillingPlan !== 'undefined' ? selectedBillingPlan : 'pro';
  if (typeof canUseFeature === 'function' && !canUseFeature(plan,'reports')) {
    showUpgradePrompt('Exportação CSV'); return;
  }
  const src = (typeof allAlerts !== 'undefined' ? allAlerts : []);
  const head = ['ID','Tipo','Descrição','Local','Horário','Status','Fonte'];
  const rows = src.map(a => [a.id||'', a.label||'', '"'+(a.desc||'').replace(/"/g,'""')+'"', '"'+(a.loc||'')+'"', a.time||'', a.status||'', a.source||'']);
  const csv = [head.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `alertas-comunidade-alerta-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✓ CSV exportado com ' + src.length + ' alertas');
}

// ── FEATURE 8: Atalhos de teclado ───────────────────────────
document.addEventListener('keydown', e => {
  if (!document.getElementById('page-dashboard')?.classList.contains('active')) return;
  const tag = (e.target.tagName||'').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  // Esc sai do modo TV
  // "/" abre busca
  if (e.key === '/') { e.preventDefault(); if (typeof openSearchOverlay==='function') openSearchOverlay(); return; }
  // 1-8 troca de view
  const viewMap = {'1':'dashboard','2':'mapa','3':'alertas','4':'delegacias','5':'relatorios','6':'analises','7':'webhooks','8':'faturamento','9':'equipe','0':'config'};
  if (viewMap[e.key]) {
    const nav = document.querySelector(`.nav-item[data-view="${viewMap[e.key]}"]`);
    if (nav) setNav(nav);
  }
});

// ── FEATURE 10/11: Som + toast de novo alerta ───────────────
let soundEnabled = false;
function toggleAlertSound() {
  soundEnabled = !soundEnabled;
  showToast(soundEnabled ? '🔔 Som de alertas ativado' : '🔕 Som de alertas desativado');
}
function playAlertBeep() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3);
    osc.start(); osc.stop(ctx.currentTime + .3);
  } catch(e){}
}
function notifyNewAlert(alert) {
  playAlertBeep();
  const t = document.getElementById('new-alert-toast');
  if (t) t.remove();
  const toast = document.createElement('div');
  toast.id = 'new-alert-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:8000;background:var(--ink);color:var(--paper);padding:14px 18px;border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.35);max-width:320px;font-family:\'DM Sans\',sans-serif;border-left:3px solid var(--red);animation:slideInRight .3s ease';
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span class="feed-pulse" style="margin-top:4px"></span>
      <div style="flex:1">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--red);font-weight:700;margin-bottom:3px">Novo alerta</div>
        <div style="font-size:13px;line-height:1.4;margin-bottom:8px">${alert.desc}</div>
        <div style="display:flex;gap:10px">
          <button onclick="setNav(document.querySelector('.nav-item[data-view=mapa]'));document.getElementById('new-alert-toast').remove()" style="background:var(--red);color:#fff;border:none;padding:5px 12px;border-radius:3px;font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Ver no mapa</button>
          <button onclick="document.getElementById('new-alert-toast').remove()" style="background:none;border:none;color:rgba(244,239,228,.5);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif">Dispensar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(() => document.getElementById('new-alert-toast')?.remove(), 8000);
}


function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = msg || 'Ação realizada com sucesso';
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════ */
const notifData = [];

// Monta as notificacoes a partir dos alertas REAIS dos ultimos 7 dias.
// Antes notifData era uma lista fixa de exemplos; depois de limpa, ficou vazia
// e o sino nunca mostrava nada.
function montarNotificacoes() {
  const alerts = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);
  const corte  = Date.now() - 7 * 864e5;
  const cores  = { crime:'#E53935', transito:'#F57C00', furto:'#EF5350',
                   infra:'#43A047', prf:'#FF8F00', inmet:'#0288D1', delegacia:'#7986CB' };
  const nomes  = { crime:'Crime', transito:'Trânsito', furto:'Furto',
                   infra:'Infraestrutura', prf:'PRF', inmet:'INMET', delegacia:'Delegacia' };

  const recentes = alerts
    .filter(a => {
      if (a.source === 'delegacia') return false;      // ponto fixo, nao e novidade
      const d = new Date(a._created || a.created_at);
      return !isNaN(d) && d.getTime() >= corte;
    })
    .sort((a, b) => new Date(b._created || b.created_at) - new Date(a._created || a.created_at))
    .slice(0, 15);

  notifData.length = 0;
  recentes.forEach(a => {
    const tipo  = a.source === 'prf' ? 'prf' : (a.source === 'inmet' ? 'inmet' : (a.type || 'outro'));
    const desc  = (a.description || '').split(' — ')[0];
    const local = a.location || a.loc || '';
    notifData.push({
      type:  tipo,
      color: cores[tipo] || '#888',
      title: (nomes[tipo] || tipo) + (local ? ' · ' + local : ''),
      body:  desc.substring(0, 90),
      time:  fmtRelative(a._created || a.created_at),
      unread: (Date.now() - new Date(a._created || a.created_at).getTime()) < 864e5  // ultimas 24h
    });
  });
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  try { montarNotificacoes(); } catch(_) {}

  if (!notifData.length) {
    list.innerHTML = '<div style="padding:34px 20px;text-align:center;color:#bbb">' +
      '<div style="font-size:13px;color:#999;margin-bottom:4px">Nenhuma novidade</div>' +
      '<div style="font-size:11.5px">Sem alertas novos nos últimos 7 dias</div></div>';
    updateNotifBadge();
    return;
  }

  list.innerHTML = notifData.map((n,i) => `
    <div class="notif-entry ${n.unread?'unread':''}" onclick="readNotif(${i})">
      <div class="notif-entry-dot" style="background:${n.color}"></div>
      <div class="notif-entry-body">
        <strong>${escapeHtml(n.title)}</strong>
        <span>${escapeHtml(n.body)}</span>
      </div>
      <div class="notif-entry-time">${n.time}</div>
    </div>`).join('');
  updateNotifBadge();
}

function updateNotifBadge() {
  const count = notifData.filter(n => n.unread).length;
  const badge = document.getElementById('notif-count');
  if (badge) { badge.textContent = count; badge.style.display = count ? 'flex' : 'none'; }
}

function readNotif(i) {
  notifData[i].unread = false;
  renderNotifList();
  // Navega para a view de alertas e filtra pelo tipo
  const type = notifData[i].type;
  closeNotifPanel();
  const alertNav = document.querySelector('.nav-item[data-view=alertas]');
  if (alertNav) setNav(alertNav);
  setTimeout(() => {
    // Seleciona o filtro do tipo correspondente
    const tipoSel = document.getElementById('alert-tipo-filter');
    if (tipoSel) { tipoSel.value = type; filterAlerts(); }
  }, 150);
}

function markAllRead() {
  notifData.forEach(n => n.unread = false);
  renderNotifList();
}

function toggleNotifPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const isOpen = panel.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) { panel.classList.add('open'); renderNotifList(); }
}

function closeNotifPanel() {
  document.getElementById('notif-panel')?.classList.remove('open');
}

function closeAllDropdowns() {
  document.getElementById('notif-panel')?.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.icon-btn-wrap')) closeAllDropdowns();
});

/* ═══════════════════════════════════════════
   SEARCH OVERLAY
═══════════════════════════════════════════ */
function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('search-input')?.focus(), 50);
}

function closeSearchOverlay(e) {
  if (!e || e.target === document.getElementById('search-overlay')) {
    document.getElementById('search-overlay').classList.remove('open');
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = getDefaultSearchHTML();
  }
}

// Verifica sessão ao carregar
document.addEventListener('DOMContentLoaded', checkAuthOnLoad);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSearchOverlay(null);
    closeBillingModal(null, true);
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openSearchOverlay();
  }
});

function getDefaultSearchHTML() {
  return `<div class="search-section-label">Sugestões rápidas</div>
    <div class="search-result-item" onclick="searchGoto('alertas','crime')"><div class="search-result-icon" style="background:rgba(229,57,53,.1)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#E53935" stroke-width="1.5"><path d="M7 1l1.5 3 3.5.5-2.5 2.5.5 3.5L7 9l-3 1.5.5-3.5L2 4.5l3.5-.5z"/></svg></div><div class="search-result-body"><strong>Crimes recentes</strong><span>Ver alertas do tipo Crime</span></div></div>
    <div class="search-result-item" onclick="searchGoto('alertas','feminicidio')"><div class="search-result-icon" style="background:rgba(156,39,176,.12)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9C27B0" stroke-width="1.5"><circle cx="7" cy="5" r="3"/><path d="M7 8v4M5 10h4"/></svg></div><div class="search-result-body"><strong>Feminicídios</strong><span>Alertas de violência contra a mulher</span></div></div>
    <div class="search-result-item" onclick="searchGoto('mapa',null)"><div class="search-result-icon" style="background:rgba(27,45,82,.12)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1B2D52" stroke-width="1.5"><path d="M7 1C4.2 1 2 3.2 2 6c0 4 5 8 5 8s5-4 5-8c0-2.8-2.2-5-5-5z"/><circle cx="7" cy="6" r="2"/></svg></div><div class="search-result-body"><strong>Abrir mapa ao vivo</strong><span>Grande Florianópolis</span></div></div>
    <div class="search-result-item" onclick="searchGoto('delegacias',null)"><div class="search-result-icon" style="background:rgba(121,134,203,.12)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7986CB" stroke-width="1.5"><rect x="2" y="4" width="10" height="8" rx="1"/><path d="M5 4V3a2 2 0 014 0v1"/></svg></div><div class="search-result-body"><strong>Delegacias</strong><span>25 delegacias cadastradas</span></div></div>`;
}

function runSearch(q) {
  const results = document.getElementById('search-results');
  if (!q.trim()) { results.innerHTML = getDefaultSearchHTML(); return; }
  const q2 = q.toLowerCase();
  // Search allAlerts + delegacias
  const alertMatches = allAlerts.filter(a =>
    a.desc.toLowerCase().includes(q2) || a.loc.toLowerCase().includes(q2) || a.label.toLowerCase().includes(q2)
  ).slice(0, 5);
  const delMatches = delegacias.filter(d =>
    d.nome.toLowerCase().includes(q2) || d.bairro.toLowerCase().includes(q2) || d.regiao.toLowerCase().includes(q2)
  ).slice(0, 3);

  let html = '';
  if (alertMatches.length) {
    html += `<div class="search-section-label">Alertas</div>`;
    html += alertMatches.map(a => {
      const color = INCIDENT_COLORS[a.type] || '#888';
      return `<div class="search-result-item" onclick="searchGoto('alertas','${a.type}');closeSearchOverlay(null)">
        <div class="search-result-icon" style="background:${color}22">
          <div style="width:8px;height:8px;border-radius:50%;background:${color}"></div>
        </div>
        <div class="search-result-body"><strong>${a.desc}</strong><span>${a.loc} · ${a.time}</span></div>
        <span class="alert-type-tag tag-${a.type}" style="flex-shrink:0">${a.label}</span>
      </div>`;
    }).join('');
  }
  if (delMatches.length) {
    html += `<div class="search-section-label">Delegacias</div>`;
    html += delMatches.map(d => `
      <div class="search-result-item" onclick="searchGoto('delegacias',null);closeSearchOverlay(null)">
        <div class="search-result-icon" style="background:rgba(121,134,203,.12)">
          <div style="width:8px;height:8px;border-radius:50%;background:#7986CB"></div>
        </div>
        <div class="search-result-body"><strong>${d.nome}</strong><span>${d.bairro} · ${d.regiao}</span></div>
      </div>`).join('');
  }
  if (!html) html = `<div class="search-empty">Nenhum resultado para "<strong>${q}</strong>"</div>`;
  results.innerHTML = html;
}

function searchGoto(view, filter) {
  closeSearchOverlay(null);
  const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navEl) setNav(navEl);
  if (filter && view === 'alertas') {
    setTimeout(() => {
      const tab = document.querySelector(`.atab[data-filter="all"]`);
      if (tab) filterAlerts('all');
      document.getElementById('alert-tipo-filter') && (document.getElementById('alert-tipo-filter').value = filter);
      filterAlerts('all');
    }, 100);
  }
}

/* ═══════════════════════════════════════════
   BILLING MODAL
═══════════════════════════════════════════ */
let selectedBillingPlan = 'pro';

let _pendingPlan = null;
const PLAN_NAMES  = { free:'Básico', pro:'Profissional', enterprise:'Corporativo' };
const PLAN_PRICES = { free:'R$0/mês', pro:'R$297/mês', enterprise:'sob consulta' };

function openBillingModal() {
  // Marca o plano atual como selecionado ao abrir
  const current = (typeof selectedBillingPlan !== 'undefined' ? selectedBillingPlan : 'pro');
  _pendingPlan = current;
  document.querySelectorAll('.bp-card').forEach(card => {
    card.classList.toggle('current', card.dataset.plan === current);
  });
  const summary = document.getElementById('bp-change-summary');
  if (summary) summary.style.display = 'none';
  const btn = document.getElementById('billing-confirm-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 7l4 4 6-6"/></svg> Selecione um plano diferente'; }
  document.getElementById('billing-modal-overlay').classList.add('open');
}

function closeBillingModal(e, force) {
  if (!force && e && e.target !== document.getElementById('billing-modal-overlay')) return;
  document.getElementById('billing-modal-overlay').classList.remove('open');
}

function selectBillingPlan(card, plan) {
  document.querySelectorAll('.bp-card').forEach(c => c.classList.remove('current'));
  card.classList.add('current');
  _pendingPlan = plan;
  const current = (typeof selectedBillingPlan !== 'undefined' ? selectedBillingPlan : 'pro');
  const btn = document.getElementById('billing-confirm-btn');
  const summary = document.getElementById('bp-change-summary');

  if (plan === current) {
    // É o plano atual — nada a confirmar
    if (summary) summary.style.display = 'none';
    btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 7l4 4 6-6"/></svg> Este já é o seu plano atual';
    return;
  }

  // Monta o resumo do que vai acontecer
  const order = { free:0, pro:1, enterprise:2 };
  const isUpgrade = order[plan] > order[current];
  if (summary) {
    summary.style.display = 'block';
    if (plan === 'enterprise') {
      summary.innerHTML = `
        <div class="bp-summary">
          <div class="bp-summary-icon" style="background:rgba(27,45,82,.1);color:var(--navy)">↗</div>
          <div><strong>Falar com vendas</strong><span>O plano Corporativo é personalizado. Ao confirmar, nossa equipe entra em contato em até 1 dia útil para montar sua proposta.</span></div>
        </div>`;
    } else if (isUpgrade) {
      summary.innerHTML = `
        <div class="bp-summary">
          <div class="bp-summary-icon" style="background:rgba(46,125,50,.12);color:var(--success)">↑</div>
          <div><strong>Upgrade para ${PLAN_NAMES[plan]} (${PLAN_PRICES[plan]})</strong><span>Acesso imediato aos novos recursos. A cobrança é proporcional aos dias restantes do ciclo atual. Você pode cancelar quando quiser.</span></div>
        </div>`;
    } else {
      summary.innerHTML = `
        <div class="bp-summary">
          <div class="bp-summary-icon" style="background:rgba(245,124,0,.12);color:#E65100">↓</div>
          <div><strong>Downgrade para ${PLAN_NAMES[plan]} (${PLAN_PRICES[plan]})</strong><span>Você mantém os recursos atuais até o fim do ciclo. Depois, recursos como relatórios, webhooks e API serão desativados. Nenhum dado é apagado.</span></div>
        </div>`;
    }
  }
  btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 7l4 4 6-6"/></svg> ${plan==='enterprise' ? 'Solicitar contato' : `Confirmar mudança para ${PLAN_NAMES[plan]}`}`;
}

function confirmBillingChange() {
  const plan = _pendingPlan;
  const current = (typeof selectedBillingPlan !== 'undefined' ? selectedBillingPlan : 'pro');
  if (!plan || plan === current) return;

  closeBillingModal(null, true);

  if (plan === 'enterprise') {
    showToast('✓ Solicitação enviada — nossa equipe entrará em contato em até 1 dia útil');
    return;
  }

  // Aplica a troca de plano de verdade
  selectedBillingPlan = plan;
  if (typeof saveSession === 'function') {
    const sess = (typeof loadSession === 'function' ? loadSession() : null) || {};
    sess.plan = plan; saveSession(sess);
  }

  // Atualiza a UI do faturamento
  const setTxt = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  setTxt('fat-plan-name', PLAN_NAMES[plan]);
  setTxt('fat-plan-price', plan==='free' ? 'R$0/mês' : plan==='pro' ? 'R$297/mês' : 'Sob consulta');

  // Reaplica os gates de funcionalidade e atualiza o badge do plano
  if (typeof updatePlanBadge === 'function') updatePlanBadge();
  if (typeof applyPlanFilterToMap === 'function' && typeof mapDash !== 'undefined' && mapDash) {
    applyPlanFilterToMap(mapDash, 'dash', plan);
  }

  const order = { free:0, pro:1, enterprise:2 };
  const isUpgrade = order[plan] > order[current];
  showToast(`✓ Plano alterado para ${PLAN_NAMES[plan]} — ${isUpgrade ? 'recursos liberados!' : 'mudança agendada para o próximo ciclo'}`);
}

const MAP_CENTER = [-48.548, -27.595]; // Centro de Florianópolis/SC
const MAP_ZOOM   = 11;

/* GeoJSON com todos os incidentes + delegacias */
const incidentGeoJSON = { type:'FeatureCollection', features: [] }; // dados de demonstração removidos — apenas dado real no site // dados de demonstração removidos — só dado real no site

// Delegacias da Grande Florianópolis — DADO REAL (Google Places: coordenadas e telefones verificados)
const DELEGACIAS_GF = { type:'FeatureCollection', features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.5514063,-27.5931397]},properties:{type:'delegacia',label:'1ª DP Civil da Capital',loc:'Centro, Florianópolis',desc:'Av. Pref. Osmar Cunha, 263 · (48) 3665-4453',id:'DP-FLN-1'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.52473,-27.5847062]},properties:{type:'delegacia',label:'5ª DP Civil da Capital',loc:'Trindade, Florianópolis',desc:'R. Lauro Linhares, 605 · (48) 3665-6444',id:'DP-FLN-5'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.5449281,-27.6629474]},properties:{type:'delegacia',label:'2ª DP da Capital',loc:'Carianos, Florianópolis',desc:'Av. Dep. Diomício Freitas, 3393 · (48) 3665-5883',id:'DP-FLN-2'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.5267825,-27.5809704]},properties:{type:'delegacia',label:'Central de Plantão Policial (Capital)',loc:'Trindade, Florianópolis',desc:'R. Lauro Linhares, 208 · 24h · (48) 3665-6455',id:'DP-FLN-CPP'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.4705914,-27.6024671]},properties:{type:'delegacia',label:'Delegacia (Lagoa da Conceição)',loc:'Lagoa da Conceição, Florianópolis',desc:'R. Crisógono Viêira da Cruz · (48) 3665-4960',id:'DP-FLN-LAG'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6105023,-27.5723358]},properties:{type:'delegacia',label:'Central de Plantão Policial (São José)',loc:'Barreiros, São José',desc:'R. Fúlvio Viêira da Rosa · 24h · (48) 3665-6471',id:'DP-SJ-CPP'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6106875,-27.5720858]},properties:{type:'delegacia',label:'2ª DP de São José',loc:'Barreiros, São José',desc:'R. Fúlvio Viêira da Rosa, 458 · (48) 3665-6473',id:'DP-SJ-2'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6103576,-27.5969036]},properties:{type:'delegacia',label:'3ª DP de São José',loc:'Campinas, São José',desc:'R. Altamiro Di Bernardi · (48) 3665-6651',id:'DP-SJ-3'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6741187,-27.6559344]},properties:{type:'delegacia',label:'DP da Comarca de Palhoça',loc:'Centro, Palhoça',desc:'Av. Pref. Nelson Martins · 24h · (48) 3665-5841',id:'DP-PAL'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6459858,-27.5156326]},properties:{type:'delegacia',label:'DP da Comarca de Biguaçu',loc:'Rio Caveiras, Biguaçu',desc:'Av. Patrício Antônio Teixeira, 317 · (48) 3665-6487',id:'DP-BIG'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6260649,-28.0254264]},properties:{type:'delegacia',label:'DP Civil de Garopaba',loc:'Garopaba',desc:'R. Rozalina Águiar Lentze, 500 · (48) 3254-3190',id:'DP-GAR'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.7797033,-27.6856612]},properties:{type:'delegacia',label:'DP Civil (Santo Amaro da Imperatriz)',loc:'Centro, Santo Amaro da Imperatriz',desc:'R. Sd. José Krauss, 50',id:'DP-SAI'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-48.6219381,-27.2412185]},properties:{type:'delegacia',label:'DP da Comarca de Tijucas',loc:'Tijucas',desc:'R. São Sebastião, 32 · (48) 3665-6560',id:'DP-TIJ'}},
]};


// ═══════════════════════════════════════════════════════════
//  CAMADA DE DADOS AO VIVO — vem do backend (GET /api/alerts)
//  Preenchida por refreshLiveData() ao entrar no dashboard.
//  Se a API falhar / vier vazia / não autenticada → mantém o
//  dataset demo (incidentGeoJSON/allAlerts/dashAlerts) intacto.
// ═══════════════════════════════════════════════════════════
let liveIncidentGeoJSON = null;   // FeatureCollection ao vivo, ou null (=usar demo)
let liveDataLoaded = false;

const LIVE_TYPE_LABELS = { crime:'Crime', furto:'Furto', transito:'Trânsito', infra:'Infraestrutura', feminicidio:'Feminicídio', prf:'PRF', inmet:'INMET', cemaden:'CEMADEN', outro:'Outro' };

// Externos: a categoria visual segue a FONTE (prf/inmet/cemaden). Internos: o tipo.
function liveDisplayType(a) {
  if (a.source && a.source !== 'interno' && a.source !== 'manual' && LIVE_TYPE_LABELS[a.source]) return a.source;
  return a.type || 'outro';
}
function fmtClock(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtRelative(ts) {
  if (!ts) return 'agora';
  const min = Math.floor(Math.max(0, Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  if (h < 24) { const m = min % 60; return m ? `${h}h ${m}min` : `${h}h`; }

  // Acima de 24h, contar hora nao ajuda ninguem: "83h 55 min" vira "3d 12h"
  const d = Math.floor(h / 24), hr = h % 24;
  if (d < 7)  return hr ? `${d}d ${hr}h` : `${d}d`;
  if (d < 30) { const sem = Math.floor(d / 7); return `${sem} sem`; }

  // Meses atras: data absoluta e mais util que contagem
  const dt = new Date(ts);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Linha do backend → formato usado por allAlerts/dashAlerts
function liveToRow(a) {
  const dt = liveDisplayType(a);
  return {
    id:       a.external_id || ('AL-' + a.id),
    dbId:     a.id,
    type:     dt,
    label:    LIVE_TYPE_LABELS[dt] || dt,
    source:   (a.source === 'interno' ? 'manual' : (a.source || 'manual')),
    desc:     a.description || '',
    loc:      a.location || '',
    status:   a.status || 'open',
    severity: a.severity || 'medium',
    lat:      a.latitude  != null ? parseFloat(a.latitude)  : null,
    lng:      a.longitude != null ? parseFloat(a.longitude) : null,
    time:     fmtClock(a.created_at),
    _created: a.created_at || null,
  };
}
// Linha do backend → feature GeoJSON (null se sem coordenadas)
function liveToFeature(a) {
  const lat = a.latitude  != null ? parseFloat(a.latitude)  : NaN;
  const lng = a.longitude != null ? parseFloat(a.longitude) : NaN;
  if (isNaN(lat) || isNaN(lng)) return null;
  const dt = liveDisplayType(a);
  return {
    type:'Feature',
    geometry:{ type:'Point', coordinates:[lng, lat] },
    properties:{
      type: dt, label: LIVE_TYPE_LABELS[dt] || dt,
      desc: a.description || '', loc: a.location || '',
      id: a.external_id || ('AL-' + a.id),
      status: a.status || 'open',
      source: (a.source === 'interno' ? 'manual' : (a.source || 'manual')),
      // O popup mostra o campo "Registro" a partir daqui. Sem isto, a data
      // ficava vazia (era o que sustentava o horario ficticio antigo).
      created: a.created_at || a._created || null,
      severity: a.severity || 'medium',
    }
  };
}

// Fonte de features para os mapas DO DASHBOARD (delegacias sempre do dataset de
// referência; incidentes vêm da API quando carregados).
function mapSource() {
  const base = (liveIncidentGeoJSON && Array.isArray(liveIncidentGeoJSON.features))
    ? liveIncidentGeoJSON : incidentGeoJSON;
  // Aplica o periodo escolhido para o mapa nao contradizer os cards do topo.
  if (typeof featuresDoPeriodo === 'function' && base && Array.isArray(base.features)) {
    return { type: 'FeatureCollection', features: featuresDoPeriodo(base.features) };
  }
  return base;
}

// Busca os alertas reais do tenant e repopula os datasets do dashboard IN PLACE.
// Mantém as 22 delegacias (dados de referência, sem tabela no backend).
async function refreshLiveData() {
  let data = null;
  try { data = await apiGet('/alerts?limit=1000', null); } catch(_) { data = null; }
  if (!data || !Array.isArray(data.alerts)) return false; // mantém demo
  const rows  = data.alerts.map(liveToRow);
  const feats = data.alerts.map(liveToFeature).filter(Boolean);
  const delegacias = (typeof DELEGACIAS_GF !== 'undefined' ? DELEGACIAS_GF.features : []);
  liveIncidentGeoJSON = { type:'FeatureCollection', features: [...delegacias, ...feats] };
  liveDataLoaded = true;
  try {
    allAlerts.length  = 0; rows.forEach(r => allAlerts.push(r));
    dashAlerts.length = 0; rows.forEach(r => dashAlerts.push({ ...r, time: fmtRelative(r._created) }));
    // Rebuild chart with real data
    if (typeof buildChartData === 'function') chartData = buildChartData(rows);
    if (typeof periodoAtual !== 'undefined') { /* grafico e recalculado em aplicarPeriodo() */ }
  } catch(_) {}
  return true;
}

// Re-renderiza os painéis após carregar/atualizar os dados ao vivo.
function rerenderDashboard() {
  try { updateMapCounters?.(); } catch(_) {}
  try { renderDashFeed?.(); } catch(_) {}
  try { renderAlertasTable?.(typeof activeFilter !== 'undefined' ? activeFilter : 'all'); } catch(_) {}
  try { renderMapPanel?.(); } catch(_) {}
  try { renderInsights?.(); } catch(_) {}
  try { renderSparklines?.(); } catch(_) {}
  try { animateDashStats?.(); } catch(_) {}
  try { updateSidebarBadge?.(); } catch(_) {}
}

// ═══════════════════════════════════════════════════════════
//  TEMPO REAL — cliente Socket.io
//  Escuta alert:new / alert:updated / alert:assigned do backend
//  e atualiza mapa + feed + tabela + contadores sem reload.
// ═══════════════════════════════════════════════════════════
let caSocket = null;
let _rtTimer = null;

// Recria os mapas do dashboard a partir do mapSource() atualizado (delegacias + alertas ao vivo).
function liveRefreshMaps() {
  [['map-dash','dash'], ['map-full','full']].forEach(([id, key]) => {
    const el   = document.getElementById(id);
    const inst = (id === 'map-dash') ? mapDash : mapFull;
    if (!el || !inst) return;
    const visible = el.offsetParent !== null;   // só re-desenha o que está visível
    let zoom = 11; try { zoom = inst.getZoom() || 11; } catch(_) {}
    try { inst.remove(); } catch(_) {}
    if (id === 'map-dash') mapDash = null; else mapFull = null;
    if (window._mapMarkersById) window._mapMarkersById[key] = {};
    if (key === 'full') window._mapFullInstance = null;
    if (visible) { try { initLeafletMap(id, zoom, selectedBillingPlan || 'pro'); } catch(_) {} }
  });
}

// Recebe um evento de alerta em tempo real. Toast/beep imediatos; refresh coalescido (debounce).
function onRealtimeEvent(kind, payload) {
  if (kind === 'new' && payload) {
    const label = payload.source_label || LIVE_TYPE_LABELS[payload.source] || LIVE_TYPE_LABELS[payload.type] || 'Alerta';
    const desc  = (payload.description || payload.desc || '').substring(0, 80);
    try { showToast?.(`🔔 [${label}] ${desc}`); } catch(_) {}
    try { playAlertBeep?.(); } catch(_) {}
  }
  clearTimeout(_rtTimer);
  _rtTimer = setTimeout(async () => {
    const changed = await refreshLiveData();
    if (changed) { rerenderDashboard(); liveRefreshMaps(); }
  }, 500);
}

// Conecta ao Socket.io autenticando pelo JWT da sessão. Reconecta sozinho.
function initRealtime() {
  const sess = loadSession();
  if (!sess?.token || typeof io === 'undefined') return; // sem token/lib → sem tempo real (degrada pro load único)
  if (caSocket) { try { caSocket.disconnect(); } catch(_) {} caSocket = null; }
  caSocket = io({ auth: { token: sess.token }, transports: ['websocket','polling'], reconnection: true });
  caSocket.on('connect',       () => console.info('[rt] tempo real conectado'));
  caSocket.on('connect_error', e => console.warn('[rt] conexão falhou:', e?.message || e));
  caSocket.on('disconnect',    r => console.info('[rt] desconectado:', r));
  caSocket.on('alert:new',      a => onRealtimeEvent('new', a));
  caSocket.on('alert:updated',  a => onRealtimeEvent('updated', a));
  caSocket.on('alert:assigned', a => onRealtimeEvent('assigned', a));
}

const INCIDENT_COLORS = { crime:'#E53935', transito:'#F57C00', furto:'#EF5350', infra:'#43A047', delegacia:'#7986CB', feminicidio:'#9C27B0', prf:'#FF8F00', inmet:'#0288D1', cemaden:'#6A1B9A' };
const mapFilters = { crime:true, transito:true, infra:true, furto:true, heatmap:true, feminicidio:true, prf:true, inmet:true };
let mapDash = null;
let mapFull = null;
let mapHeatDash = null;
let mapHeatFull = null;

function buildMapFilter(inclDelegacias) {
  const types = Object.entries(mapFilters).filter(([k,v]) => v && k !== 'heatmap').map(([k]) => k);
  if (inclDelegacias) types.push('delegacia');
  return ['in', ['get','type'], ['literal', types]];
}

// Armazena markers Leaflet por tipo para filtragem
const leafletMarkers = { dash: {}, full: {} };

function applyFiltersToMap(map) {
  if (!map) return;
  const key = (map === mapDash) ? 'dash' : 'full';
  const groups = leafletMarkers[key];
  if (!groups || !Object.keys(groups).length) return;

  const cluster = key === 'dash' ? window._clusterDash : window._clusterFull;

  Object.entries(groups).forEach(([type, markers]) => {
    const visible = type === 'delegacia'
      ? true                          // delegacias sempre visíveis
      : (mapFilters[type] !== false); // usa o filtro do tipo
    markers.forEach(m => {
      const isDelg = type === 'delegacia';
      // Delegacias ficam direto no mapa; incidentes ficam no cluster
      if (cluster && !isDelg) {
        if (visible) {
          if (!cluster.hasLayer(m)) cluster.addLayer(m);
        } else {
          if (cluster.hasLayer(m)) cluster.removeLayer(m);
        }
      } else {
        if (visible) {
          if (!map.hasLayer(m)) m.addTo(map);
        } else {
          if (map.hasLayer(m)) map.removeLayer(m);
        }
      }
    });
  });
}

function applyPlanFilterToMap(map, key, plan) {
  if (!map || !leafletMarkers[key]) return;
  const allowed = PLAN_MUNIS[plan || selectedBillingPlan || 'pro'];
  if (!allowed) return; // enterprise: tudo visível

  Object.entries(leafletMarkers[key]).forEach(([type, markers]) => {
    // Precisamos re-filtrar por municipality
    // Como os markers não têm loc diretamente, vamos usar o incidentGeoJSON
    // para saber quais markers são de qual município
    markers.forEach((m, idx) => {
      // find matching feature
      const features = filterGeoByPlan(incidentGeoJSON.features, plan);
      const inPlan = features.some(f => {
        const [lng, lat] = f.geometry.coordinates;
        const mLatLng = m.getLatLng();
        return Math.abs(mLatLng.lat - lat) < 0.001 && Math.abs(mLatLng.lng - lng) < 0.001;
      });
      if (inPlan) { if (!map.hasLayer(m)) m.addTo(map); }
      else        { if ( map.hasLayer(m)) map.removeLayer(m); }
    });
  });
}

function toggleFilter(btn, layer) {
  btn.classList.toggle('on');
  mapFilters[layer] = btn.classList.contains('on');
  if (layer === 'heatmap') {
    [mapHeatDash, mapHeatFull].forEach((hl, i) => {
      if (!hl) return;
      const map = i === 0 ? mapDash : mapFull;
      mapFilters.heatmap ? hl.addTo(map) : map.removeLayer(hl);
    });
  } else {
    applyFiltersToMap(mapDash);
    applyFiltersToMap(mapFull);
  }
}

function buildPopupHTML(p) {
  const statusLabels = { open:'Em aberto', progress:'Em andamento', resolved:'Resolvido', active:'Ativa' };
  const statusColors = { open:'#E53935',   progress:'#F57C00',      resolved:'#43A047',   active:'#7986CB' };
  const color = INCIDENT_COLORS[p.type] || '#888';
  const sourceBadge = p.source && p.source !== 'interno'
    ? `<span style="font-size:9px;font-weight:700;letter-spacing:.1em;padding:2px 7px;border-radius:2px;margin-left:6px;background:${p.source==='prf'?'rgba(255,143,0,.15)':'rgba(2,136,209,.15)'};color:${p.source==='prf'?'#FF8F00':'#0288D1'}">${p.source.toUpperCase()}</span>`
    : '';
  const updatedLine = p.updated ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">🔄 Atualizado ${p.updated}</div>` : '';
  return `<div style="font-family:'DM Sans',sans-serif;padding:2px">
    <div style="display:flex;align-items:center;margin-bottom:5px">
      <span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${color};font-weight:600">${p.label}</span>${sourceBadge}
    </div>
    <div style="font-size:13px;color:#14120E;line-height:1.4;margin-bottom:5px">${p.desc}</div>
    <div style="font-size:11px;color:#6B6558;margin-bottom:4px">📍 ${p.loc}</div>
    ${updatedLine}
    <div style="margin-top:6px"><span style="font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:2px;background:${statusColors[p.status]||'#ccc'}22;color:${statusColors[p.status]||'#888'}">${statusLabels[p.status]||p.status}</span></div>
  </div>`;
}

// Mapbox foi substituído pelo Leaflet — sem token nem SDK externos.

function initLeafletMap(containerId, zoom, plan) {
  const el = document.getElementById(containerId);
  if (!el || typeof L === 'undefined') return null;

  // Leaflet lanca "Map container is already initialized" se o mesmo elemento
  // for inicializado duas vezes (acontecia ao alternar de aba e voltar).
  // Descarta a instancia anterior antes de criar a nova.
  if (el._leaflet_id) {
    try {
      if (containerId === 'map-full' && typeof mapFull !== 'undefined' && mapFull) { mapFull.remove(); mapFull = null; }
      else if (typeof mapDash !== 'undefined' && mapDash) { mapDash.remove(); mapDash = null; }
      else { el._leaflet_id = null; el.innerHTML = ''; }
    } catch(_) { el._leaflet_id = null; el.innerHTML = ''; }
  }

  const activePlan = plan || selectedBillingPlan || 'pro';

  // ── 1. MaxBounds: trava navegação na Grande Florianópolis ──
  // Norte: Tijucas/Gov. Celso Ramos | Sul: Garopaba | Oeste: Alfredo Wagner | Leste: oceano
  const GF_BOUNDS = L.latLngBounds(
    L.latLng(-28.20, -50.10),  // sudoeste (Garopaba sul + Bocaina oeste)
    L.latLng(-27.10, -48.25)   // nordeste (Tijucas norte + oceano leste)
  );

  const map = L.map(containerId, {
    center: [-27.595, -48.548],
    zoom: zoom || 11,
    zoomControl: true,
    attributionControl: true,
    maxBounds: GF_BOUNDS,
    maxBoundsViscosity: 0.5,   // "resistência" ao arrastar para fora
    minZoom: 9,
    maxZoom: 18,
  });

  const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 18,
  });
  tileLayer.addTo(map);

  // Esconde spinner assim que o primeiro tile carregar (robusto)
  const _hideSpinnerNow = () => {
    const sp = document.getElementById(containerId === 'map-dash' ? 'map-dash-loading' : 'map-full-loading');
    if (sp) { sp.style.opacity = '0'; setTimeout(() => { sp.style.display = 'none'; }, 350); }
  };
  tileLayer.on('load', _hideSpinnerNow);
  tileLayer.once('tileload', _hideSpinnerNow);
  setTimeout(_hideSpinnerNow, 2000); // fallback garantido

  // Força recálculo de tamanho (resolve mapa que não renderiza em file://)
  [50, 200, 500, 1000].forEach(t => setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, t));

  const COLORS = {
    crime:'#D32F2F', transito:'#E65100', furto:'#C62828',
    infra:'#2E7D32', feminicidio:'#6A1B9A', prf:'#E65100',
    inmet:'#0277BD', cemaden:'#6A1B9A', delegacia:'#3949AB',
  };
  const STATUS_LABEL = { open:'Em aberto', progress:'Em andamento', resolved:'Resolvido', active:'Ativa' };
  const STATUS_COLOR = { open:'#D32F2F', progress:'#E65100', resolved:'#2E7D32', active:'#3949AB' };

  const key = containerId === 'map-dash' ? 'dash' : 'full';
  leafletMarkers[key] = {};

  // ── 3. Camada simples (SEM agrupamento) — cada incidente individual ──
  const clusterGroup = (typeof L.featureGroup !== 'undefined') ? L.featureGroup()
                     : (typeof L.layerGroup !== 'undefined' ? L.layerGroup() : null);

  // ── 5. Ícone SVG customizado por fonte ──
  function buildIcon(p, cor, isDelg) {
    if (isDelg) {
      // Delegacia: marcador em formato de CASA/prédio (pino arredondado com casa dentro)
      const dcor = '#2D3F6B';
      const size = 32;
      return L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;position:relative">
          <svg width="${size}" height="${size}" viewBox="0 0 32 36" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
            <path d="M16 1C8.8 1 3 6.6 3 13.6 3 22 16 34 16 34s13-12 13-20.4C29 6.6 23.2 1 16 1z" fill="${dcor}" stroke="#fff" stroke-width="1.5"/>
            <path d="M16 6.5l6.5 5.2v7.3h-4.2v-4.2h-4.6v4.2H9.5v-7.3z" fill="#fff"/>
            <rect x="14.7" y="15.2" width="2.6" height="3.8" fill="${dcor}"/>
          </svg>
        </div>`,
        className: 'ca-marker-delg',
        iconSize: L.point(size, size),
        iconAnchor: L.point(size/2, size),   // ponta do pino na base
      });
    }
    // Incidentes: CÍRCULO simples (estilo limpo, igual ao modo apresentação)
    const size = 22;
    const r = 8;
    // Pulso sutil para incidentes EM ABERTO
    const pulse = (p.status === 'open')
      ? `<span style="position:absolute;inset:0;border-radius:50%;background:${cor};opacity:.35;animation:ca-mk-pulse 2s ease-out infinite"></span>`
      : '';
    return L.divIcon({
      html: `<div style="width:${size}px;height:${size}px;position:relative;display:flex;align-items:center;justify-content:center">
        ${pulse}
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));position:relative">
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${cor}" stroke="#fff" stroke-width="2"/>
        </svg>
      </div>`,
      className: 'ca-marker-icon',
      iconSize: L.point(size, size),
      iconAnchor: L.point(size/2, size/2),
    });
  }

  const _srcGeo = (containerId === 'map-dash' || containerId === 'map-full') ? mapSource()
                : (containerId === 'map-publico') ? { type:'FeatureCollection', features: [] }
                : incidentGeoJSON;
  const featuresForPlan = filterGeoByPlan(_srcGeo.features, activePlan);

  try {
  featuresForPlan.forEach(f => {
    const p   = f.properties;
    const lng = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    const cor = COLORS[p.type] || '#546E7A';
    const isDelg = p.type === 'delegacia';

    // ── 5. Marcador com ícone SVG por fonte ──
    const marker = L.marker([lat, lng], {
      icon: buildIcon(p, cor, isDelg),
      zIndexOffset: isDelg ? 1000 : 0,   // delegacias sempre por cima dos incidentes
      riseOnHover: true,
    });
    marker.caType = p.type;        // para composição do cluster
    marker.caSource = p.source || 'manual';
    marker.caId = p.id;            // para sincronizar lista ↔ mapa

    // Registro por ID (sincronização com a lista lateral)
    if (!window._mapMarkersById) window._mapMarkersById = {};
    if (!window._mapMarkersById[key]) window._mapMarkersById[key] = {};
    if (p.id) window._mapMarkersById[key][p.id] = marker;
    if (key === 'full') window._mapFullInstance = map;

    if (!leafletMarkers[key][p.type]) leafletMarkers[key][p.type] = [];
    leafletMarkers[key][p.type].push(marker);

    // ── Popup dedicado para DELEGACIAS (info: nome, endereço, contato) ──
    if (isDelg) {
      const dcor = '#3949AB';
      // Busca dados completos da delegacia pelo nome/id
      let dInfo = null;
      try {
        if (typeof delegacias !== 'undefined') {
          dInfo = delegacias.find(d => d.nome === p.label || d.nome === p.desc || (p.loc||'').includes(d.bairro));
        }
      } catch(e) {}
      const nome = (dInfo && dInfo.nome) || p.label || 'Delegacia';
      const ende = (dInfo && dInfo.endereco) || p.loc || '';
      const tel  = (dInfo && dInfo.tel) || '';
      const reg  = (dInfo && dInfo.regiao) || '';
      const cod  = (dInfo && dInfo.cod) || '';
      const st   = (dInfo && dInfo.status) || 'ativo';
      const stOn = st === 'ativo' || st === 'active';

      marker.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;min-width:230px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #eee">
            <div style="width:26px;height:26px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${dcor};border-radius:6px">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2l8 2.6v5.4c0 4.9-3.4 8.5-8 10.3-4.6-1.8-8-5.4-8-10.3V4.6L12 2z" fill="#fff"/></svg>
            </div>
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:700;color:#1a1a1a;line-height:1.2">${nome}</div>
              ${cod?`<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#888">${cod}${reg?' · '+reg:''}</div>`:''}
            </div>
          </div>
          ${ende?`<div style="font-size:11.5px;color:#444;margin-bottom:8px;display:flex;gap:5px;align-items:flex-start"><svg width="12" height="12" viewBox="0 0 12 12" fill="${dcor}" opacity=".6" style="margin-top:1px;flex-shrink:0"><path d="M6 0C4 0 2.5 1.6 2.5 3.5 2.5 6.5 6 11 6 11s3.5-4.5 3.5-7.5C9.5 1.6 8 0 6 0z"/></svg>${ende}</div>`:''}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="display:inline-flex;align-items:center;gap:5px;background:${stOn?'rgba(46,125,50,.12)':'rgba(107,101,88,.12)'};padding:3px 9px;border-radius:20px">
              <div style="width:6px;height:6px;border-radius:50%;background:${stOn?'#2E7D32':'#6B6558'}"></div>
              <span style="font-size:10px;font-weight:600;color:${stOn?'#2E7D32':'#6B6558'};text-transform:uppercase;letter-spacing:.04em">${stOn?'24 horas':'Plantão'}</span>
            </div>
          </div>
        </div>`, { maxWidth: 280, closeButton: true, className: 'ca-popup' });

      marker.addTo(map);
      return; // não cai no popup genérico de incidente
    }

    const srcBadge = p.source && p.source !== 'interno' && p.source !== 'manual'
      ? `<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:2px;margin-left:5px;background:${p.source==='prf'?'rgba(230,81,0,.12)':'rgba(2,119,189,.12)'};color:${p.source==='prf'?'#E65100':'#0277BD'}">${p.source.toUpperCase()}</span>`
      : '';

    const statusClr = STATUS_COLOR[p.status] || '#666';

    // ── Dados estruturados (estilo registro oficial) ──
    const ORGAO = {
      prf: 'Polícia Rodoviária Federal', inmet: 'Instituto Nacional de Meteorologia',
      cemaden: 'Centro Nacional de Monitoramento de Desastres',
    };
    const orgaoPorTipo = { crime:'Polícia Militar / PCSC', furto:'Polícia Militar', feminicidio:'Polícia Civil — DEAM', transito:'Guarda de Trânsito', infra:'Defesa Civil Municipal' };
    const orgao = ORGAO[p.source] || orgaoPorTipo[p.type] || 'Equipe Comunidade Alerta';
    // Protocolo determinístico a partir do id
    const protocolo = (p.id || 'CA-000').toUpperCase().replace(/[^A-Z0-9-]/g,'');
    // Data e hora REAIS do registro. Antes um hash do id gerava um horario
    // ficticio ("00:48") que parecia oficial mas era inventado.
    let quando = '—';
    const _dt = new Date(p.created || p.created_at || p._created);
    if (!isNaN(_dt)) {
      const dataFmt = _dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
      const horaFmt = _dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
      const rel = (typeof fmtRelative === 'function') ? fmtRelative(_dt) : '';
      quando = `${dataFmt} às ${horaFmt}` + (rel ? ` · há ${rel}` : '');
    } else if (p.time) { quando = p.time; }

    marker.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:230px">
        <div style="display:flex;align-items:center;margin-bottom:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${cor};margin-right:7px;flex-shrink:0"></div>
          <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${cor};font-weight:600">${escapeHtml(p.label||'')}</span>${srcBadge}
          <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:9px;color:#999">${protocolo}</span>
        </div>
        <div style="font-size:13px;color:#1a1a1a;line-height:1.45;margin-bottom:8px">${escapeHtml(p.desc||'')}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px;color:#555;margin-bottom:9px">
          <span style="color:#999">📍 Local</span><span>${escapeHtml(p.loc||'')}</span>
          <span style="color:#999">🏛 Órgão</span><span>${orgao}</span>
          <span style="color:#999">🕑 Registro</span><span>${quando}${p.updated?' · '+p.updated:''}</span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;background:${statusClr}14;padding:3px 9px;border-radius:2px">
          <div style="width:6px;height:6px;border-radius:50%;background:${statusClr}"></div>
          <span style="font-size:10px;font-weight:600;color:${statusClr};letter-spacing:.06em;text-transform:uppercase">${STATUS_LABEL[p.status]||p.status}</span>
        </div>
      </div>`, { maxWidth: 280, closeButton: true, className: 'ca-popup' });

    // Adiciona ao grupo (sem cluster) ou direto ao mapa
    if (clusterGroup && !isDelg) {
      clusterGroup.addLayer(marker);
    } else {
      marker.addTo(map);
    }
  });

  } catch(err) { console.warn('[mapa] erro ao criar marcadores:', err); }

  if (clusterGroup) map.addLayer(clusterGroup);
  if (key === 'dash') window._clusterDash = clusterGroup;
  if (key === 'full') window._clusterFull = clusterGroup;

  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 400);

  const isDash = containerId === 'map-dash';
  // Legenda so com o que existe de fato no mapa. Feminicidio e CEMADEN saem:
  // nao ha fonte automatica alimentando esses tipos, e legenda que promete
  // categoria sem dado passa a impressao de cobertura que nao temos.
  const legendItems = [
    ['#D32F2F','Crime'], ['#E65100','Trânsito'], ['#C62828','Furto'],
    ['#2E7D32','Infraestrutura'], ['#FF8F00','PRF'], ['#0288D1','INMET'],
    ['#7986CB','Delegacia']
  ];

  const heatPoints = incidentGeoJSON.features
    .filter(f => ['crime','furto','feminicidio','transito'].includes(f.properties.type))
    .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], 0.8]);

  const heatLayer = typeof L.heatLayer !== 'undefined'
    ? L.heatLayer(heatPoints, { radius:28, blur:18, maxZoom:14, gradient:{0.2:'#1a237e',0.5:'#e53935',1:'#ff6f00'} })
    : null;
  // Heatmap começa desligado quando há cluster (evita poluição visual)

  if (containerId==='map-dash') mapHeatDash = heatLayer;
  if (containerId==='map-full') mapHeatFull = heatLayer;

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = '<div class="map-legend-title">Legenda</div>'
      + legendItems.map(([color, label]) =>
          `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div><span style="color:rgba(255,255,255,.75);font-size:11px">${label}</span></div>`
        ).join('');
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);

  if (containerId === 'map-dash') mapDash = map;
  if (containerId === 'map-full') mapFull = map;
  map.whenReady(_hideSpinnerNow);
  setTimeout(_hideSpinnerNow, 1500);  // garantia extra: esconde spinner em 1.5s
  setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 300);

  // ResizeObserver: recalcula o mapa quando o container muda de tamanho
  // (resolve o caso clássico de mapa que não renderiza ao trocar de view)
  try {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => { try { map.invalidateSize(); } catch(e){} });
      ro.observe(el);
    }
  } catch(e) {}

  return map;
}

// ── 4. Abrir painel de resolução a partir do popup do mapa ──
// Alias para compatibilidade com chamadas existentes
function initMapbox(containerId, zoom) {
  return initLeafletMap(containerId, zoom);
}

// Popup legacy stub (não usado com Mapbox GL)
let popupTimer;
function showMapPopup(){}
document.addEventListener('click',()=>{});

// Dash alert feed — carregado via API
let dashAlerts = [];

function showDashSkeleton() {
  const feed = document.getElementById('dash-feed');
  const tbody = document.getElementById('activity-tbody');
  const skeleton = '<div style="height:56px;background:linear-gradient(90deg,rgba(20,18,14,.04) 25%,rgba(20,18,14,.08) 50%,rgba(20,18,14,.04) 75%);background-size:200% 100%;animation:shimmer 1.2s ease-in-out infinite;border-radius:2px;margin-bottom:6px"></div>';
  if (feed)  feed.innerHTML  = skeleton.repeat(4);
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted);font-size:12px"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle"><path d="M8 2a6 6 0 110 12A6 6 0 018 2z" stroke-opacity=".2"/><path d="M8 2a6 6 0 016 6" stroke-linecap="round"/></svg>Carregando ocorrências...</td></tr>`;
}
function hideDashSkeleton() {}

// ── Mapa ao Vivo — painel lateral ─────────────────────────
// Clica num item da lista → centraliza no mapa e abre o popup
function focusIncident(id) {
  const map = window._mapFullInstance;
  const reg = window._mapMarkersById && window._mapMarkersById['full'];
  if (!map || !reg || !reg[id]) return;
  const marker = reg[id];
  try {
    const ll = marker.getLatLng();
    map.setView(ll, Math.max(map.getZoom(), 14), { animate: true });
    setTimeout(() => marker.openPopup && marker.openPopup(), 300);
  } catch(e) {}
  // Destaca o item na lista
  document.querySelectorAll('#map-panel-list .map-list-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));
}

// ═══════════════ REGISTRO DE CÂMERAS ═══════════════
let _cameras = [
  { name:'Portaria — Bloco A', addr:'Av. Pequeno Príncipe, 1200 · Campeche', type:'Dome', dir:'Entrada/Portaria', contact:'Síndico — (48) 99000-0001', status:'online' },
  { name:'Estacionamento térreo', addr:'Rua Lauro Linhares, 850 · Trindade', type:'Fixa externa', dir:'Estacionamento', contact:'Zelador — (48) 99000-0002', status:'online' },
  { name:'Fachada — via pública', addr:'Av. Central, 45 · Kobrasol · São José', type:'LPR (placas)', dir:'Via pública', contact:'Segurança — (48) 99000-0003', status:'offline' },
];

function initCamerasView() { renderCameras(); }

function renderCameras() {
  const list = document.getElementById('cam-list');
  if (!list) return;
  const q = (document.getElementById('cam-search')?.value || '').toLowerCase().trim();
  const filtered = _cameras.filter(c => !q || (c.addr+c.name).toLowerCase().includes(q));
  // stats
  const tot = document.getElementById('cam-total'); if (tot) tot.textContent = _cameras.length;
  const onl = document.getElementById('cam-online'); if (onl) onl.textContent = _cameras.filter(c=>c.status==='online').length;
  const cov = document.getElementById('cam-coverage');
  if (cov) cov.textContent = new Set(_cameras.map(c => (c.addr.split('·')[1]||'').trim()).filter(Boolean)).size;

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted);font-size:13px">${q?'Nenhuma câmera encontrada':'Nenhuma câmera registrada ainda. Clique em "Registrar câmera".'}</div>`;
    return;
  }
  list.innerHTML = filtered.map(c => {
    const on = c.status === 'online';
    return `<div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px">
      <div style="width:38px;height:38px;border-radius:8px;background:var(--paper-dark);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--navy)" stroke-width="1.6"><path d="M2 5h2l1-1.5h4L10 5h4v8H2z"/><circle cx="8" cy="9" r="2.5"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${escapeHtml(c.name)}</div>
        <div style="font-size:11px;color:var(--muted)">📍 ${escapeHtml(c.addr)} · ${escapeHtml(c.type)} · ${escapeHtml(c.dir)}</div>
      </div>
      <div style="display:inline-flex;align-items:center;gap:5px;flex-shrink:0">
        <span style="width:7px;height:7px;border-radius:50%;background:${on?'var(--success)':'var(--muted)'}"></span>
        <span style="font-size:10px;font-weight:600;color:${on?'var(--success)':'var(--muted)'};text-transform:uppercase;letter-spacing:.04em">${on?'Ativa':'Offline'}</span>
      </div>
    </div>`;
  }).join('');
}





function renderMapPanel() {
  const listEl    = document.getElementById('map-panel-list');
  const countEl   = document.getElementById('map-panel-count');
  const crimeEl   = document.getElementById('mp-crime');
  const transitoEl= document.getElementById('mp-transito');
  const infraEl   = document.getElementById('mp-infra');
  if (!listEl) return;

  const plan = selectedBillingPlan || 'pro';
  let feats = filterGeoByPlan(incidentGeoJSON.features, plan)
    .filter(f => f.properties.type !== 'delegacia');

  // Aplica filtro de período/dia da semana (se ativo)
  feats = applyPeriodFilter(feats);

  // Busca textual (local, tipo, descrição)
  const q = (document.getElementById('map-list-search')?.value || '').toLowerCase().trim();
  if (q) feats = feats.filter(f => {
    const p = f.properties;
    return (p.loc||'').toLowerCase().includes(q) || (p.label||'').toLowerCase().includes(q) || (p.desc||'').toLowerCase().includes(q);
  });

  // Ordenação escolhida
  const sortBy = document.getElementById('map-list-sort')?.value || 'status';
  const order = {open:0, progress:1, resolved:2};
  feats = feats.sort((a,b) => {
    const pa = a.properties, pb = b.properties;
    if (sortBy === 'tipo')  return (pa.type||'').localeCompare(pb.type||'');
    if (sortBy === 'local') return (pa.loc||'').localeCompare(pb.loc||'');
    return (order[pa.status]||0) - (order[pb.status]||0);
  });

  const open = feats.filter(f => f.properties.status === 'open').length;
  if (countEl) countEl.textContent = `${feats.length} incidentes · ${open} em aberto`;
  if (crimeEl)    crimeEl.textContent    = feats.filter(f=>f.properties.type==='crime').length;
  if (transitoEl) transitoEl.textContent = feats.filter(f=>f.properties.type==='transito').length;
  if (infraEl)    infraEl.textContent    = feats.filter(f=>['infra','inmet'].includes(f.properties.type)).length;

  const COLORS = {crime:'#E53935',transito:'#F57C00',furto:'#EF5350',infra:'#43A047',
                  feminicidio:'#9C27B0',prf:'#FF8F00',inmet:'#0288D1',cemaden:'#6A1B9A'};
  const statusLabel = {open:'Em aberto',progress:'Em andamento',resolved:'Resolvido'};
  const srcLabel = {prf:'PRF',inmet:'INMET',cemaden:'CEMADEN',manual:'Equipe'};
  // tempo pseudo-determinístico por id (estável entre renders)
  const tempoDe = (id) => { const h=(id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0); const m=h%180; return m<60?`há ${m||1} min`:`há ${Math.floor(m/60)}h${m%60?' '+(m%60)+'min':''}`; };

  if (!feats.length) {
    listEl.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--muted)">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin:0 auto 10px;display:block"><path d="M16 4C9 4 4 9 4 16s5 12 12 12 12-5 12-12S23 4 16 4z"/><path d="M16 12v4l3 3"/></svg>
      <div style="font-size:13px;font-weight:500;margin-bottom:4px">${q?'Nada encontrado':'Nenhum incidente no filtro'}</div>
      <div style="font-size:11px">${q?'Tente outro termo de busca':'Ajuste o período ou as categorias'}</div>
    </div>`;
    return;
  }

  listEl.innerHTML = feats.slice(0,30).map(f => {
    const p = f.properties;
    const col = COLORS[p.type] || '#546E7A';
    const src = srcLabel[p.source] || 'Equipe';
    const dotStyle = p.status === 'open'
      ? `width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;box-shadow:0 0 0 3px ${col}33`
      : `width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;opacity:${p.status==='resolved'?'.4':'.7'}`;
    return `<div class="map-list-item" data-id="${p.id}" style="padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--paper-dark)'" onmouseout="if(!this.classList.contains('active'))this.style.background=''" onclick="focusIncident('${p.id}')">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
        <span style="${dotStyle}"></span>
        <span style="font-size:10px;font-weight:700;color:${col};letter-spacing:.05em;text-transform:uppercase">${p.label}</span>
        <span style="font-size:8px;font-weight:600;padding:1px 5px;border-radius:10px;background:var(--paper-dark);color:var(--muted);letter-spacing:.04em">${src}</span>
        <span style="margin-left:auto;font-size:9px;color:var(--muted)">${tempoDe(p.id)}</span>
      </div>
      <div style="font-size:12px;color:var(--ink);line-height:1.4;margin-bottom:4px">${p.desc.substring(0,64)}${p.desc.length>64?'…':''}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div style="font-size:10px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📍 ${p.loc}</div>
        <span style="font-size:8px;font-weight:600;padding:1px 6px;border-radius:2px;background:${col}15;color:${col};flex-shrink:0">${statusLabel[p.status]||p.status}</span>
      </div>
    </div>`;
  }).join('') + (feats.length > 30 ? `<div style="padding:12px;text-align:center;font-size:11px;color:var(--muted)">+ ${feats.length-30} mais incidentes</div>` : '');
}

// ── Filtro de período/dia da semana (estilo CityProtect) ──
let mapPeriodFilter = { range: 'all', weekdays: [0,1,2,3,4,5,6] };

function applyPeriodFilter(feats) {
  // Dados são simulados; o filtro demonstra o comportamento de forma determinística
  const f = mapPeriodFilter;
  if (f.range === 'all' && f.weekdays.length === 7) return feats;
  // Atribui um "dia da semana" e "idade" determinísticos por id, para filtrar de forma estável
  return feats.filter(ft => {
    const h = (ft.properties.id || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const wd = h % 7;               // dia da semana pseudo-determinístico
    const ageDays = h % 30;         // "idade" em dias
    if (!f.weekdays.includes(wd)) return false;
    if (f.range === 'week' && ageDays > 7) return false;
    if (f.range === 'today' && ageDays > 1) return false;
    return true;
  });
}

function setMapPeriod(range, btn) {
  mapPeriodFilter.range = range;
  document.querySelectorAll('.mp-period-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderMapPanel();
}

function toggleWeekday(wd, btn) {
  const i = mapPeriodFilter.weekdays.indexOf(wd);
  if (i >= 0) { if (mapPeriodFilter.weekdays.length > 1) mapPeriodFilter.weekdays.splice(i,1); }
  else mapPeriodFilter.weekdays.push(wd);
  btn.classList.toggle('active', mapPeriodFilter.weekdays.includes(wd));
  renderMapPanel();
}

// ── Delegacias — busca por texto ───────────────────────────
function filterDelegacias(query) {
  const tbody = document.querySelector('#view-delegacias table tbody');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  let visible = 0;
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const show = !query || text.includes(query.toLowerCase());
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const countEl = document.getElementById('deleg-count-label');
  if (countEl) countEl.textContent = `${visible} delegacia${visible !== 1 ? 's' : ''}`;
}

function renderActivityTable() {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;
  const TYPE_COLORS = {
    crime:'#C8201A', transito:'#F57C00', furto:'#C62828', infra:'#2E7D32',
    feminicidio:'#6A1B9A', prf:'#E65100', inmet:'#0277BD', cemaden:'#6A1B9A'
  };
  const STATUS = {
    open:     { label:'Em aberto',     color:'#C8201A', bg:'rgba(200,32,26,.1)' },
    progress: { label:'Em andamento',  color:'#F57C00', bg:'rgba(245,124,0,.1)' },
    resolved: { label:'Resolvido',     color:'#2E7D32', bg:'rgba(46,125,50,.1)' },
  };
  const recent = (typeof dashAlerts !== 'undefined' ? dashAlerts : []).slice(0, 6);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--muted);font-size:12px">Nenhuma ocorrência registrada</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map((a, i) => {
    const cor = TYPE_COLORS[a.type] || '#546E7A';
    const st  = STATUS[a.status] || STATUS.open;
    const srcBadge = (a.source === 'prf' || a.source === 'inmet')
      ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;margin-left:6px;background:${a.source==='prf'?'rgba(230,81,0,.12)':'rgba(2,119,189,.12)'};color:${a.source==='prf'?'#E65100':'#0277BD'}">${a.source.toUpperCase()}</span>`
      : '';
    return `
      <tr>
        <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></span><span style="font-weight:600;color:var(--ink)">${escapeHtml(a.label)}</span></span></td>
        <td style="max-width:280px"><span style="color:var(--ink)">${escapeHtml(a.desc)}</span>${srcBadge}</td>
        <td style="color:var(--muted)">${escapeHtml(a.loc)}</td>
        <td><span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:2px;background:${st.bg};color:${st.color};letter-spacing:.04em;white-space:nowrap">${st.label}</span></td>
      </tr>`;
  }).join('');
}



function renderEquipe() {
  const team = [
    { nome:'Jeferson Goulart',    role:'Administrador', turno:'Integral',    status:'online',  resolvidos:142, email:'jeferson@prefeitura.sc.gov.br' },
    { nome:'Central de Operações', role:'Operador',      turno:'06h – 18h',   status:'online',  resolvidos:89,  email:'central@prefeitura.sc.gov.br' },
    { nome:'Plantão Noturno',     role:'Operador',      turno:'18h – 06h',   status:'online',  resolvidos:67,  email:'noturno@prefeitura.sc.gov.br' },
    { nome:'Defesa Civil SC',     role:'Visualizador',  turno:'Sob demanda', status:'offline', resolvidos:0,   email:'integração@defesacivil.sc.gov.br' },
  ];

  const ROLE_STYLE = {
    'Administrador': { bg:'rgba(200,32,26,.1)',  color:'#C8201A', icon:'M7 1l1.8 3.6L13 5.2l-3 2.9.7 4.1L7 10.3 3.3 12.2l.7-4.1-3-2.9 4.2-.6z' },
    'Operador':      { bg:'rgba(27,45,82,.1)',   color:'#1B2D52', icon:'M7 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 13c0-2.5 2.2-4 5-4s5 1.5 5 4' },
    'Visualizador':  { bg:'rgba(107,101,88,.12)',color:'#6B6558', icon:'M7 3.5C4 3.5 1.8 5.5 1 7c.8 1.5 3 3.5 6 3.5s5.2-2 6-3.5c-.8-1.5-3-3.5-6-3.5zM7 9a2 2 0 100-4 2 2 0 000 4z' },
  };

  // Stats
  const online = team.filter(m=>m.status==='online').length;
  const totalResolvidos = team.reduce((a,m)=>a+m.resolvidos,0);
  const statsEl = document.getElementById('equipe-stats');
  if (statsEl) {
    const stats = [
      { val: team.length, lbl:'Operadores', color:'var(--ink)' },
      { val: online, lbl:'Online agora', color:'var(--success)' },
      { val: '24/7', lbl:'Cobertura', color:'var(--navy)' },
      { val: totalResolvidos, lbl:'Resolvidos no mês', color:'var(--red)' },
    ];
    statsEl.innerHTML = stats.map(s => `
      <div class="equipe-stat">
        <div class="equipe-stat-val" style="color:${s.color}">${s.val}</div>
        <div class="equipe-stat-lbl">${s.lbl}</div>
      </div>`).join('');
  }

  const cntEl = document.getElementById('equipe-count');
  if (cntEl) cntEl.textContent = `${team.length} membros · ${online} online`;

  const cards = document.getElementById('equipe-cards');
  if (!cards) return;
  cards.innerHTML = team.map(m => {
    const rs = ROLE_STYLE[m.role] || ROLE_STYLE['Operador'];
    const initials = m.nome.split(' ').map(w=>w[0]).slice(0,2).join('');
    const isOn = m.status==='online';
    return `
      <div class="equipe-card">
        <div class="equipe-avatar" style="background:${rs.color}">
          ${initials}
          <span class="equipe-presence" style="background:${isOn?'var(--success)':'var(--muted)'}"></span>
        </div>
        <div class="equipe-main">
          <div class="equipe-name">${m.nome}</div>
          <div class="equipe-email">${m.email}</div>
        </div>
        <div class="equipe-role">
          <span class="equipe-role-badge" style="background:${rs.bg};color:${rs.color}">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="${rs.icon}"/></svg>
            ${m.role}
          </span>
        </div>
        <div class="equipe-turno">
          <div class="equipe-turno-lbl">Turno</div>
          <div class="equipe-turno-val">${m.turno}</div>
        </div>
        <div class="equipe-resolv">
          <div class="equipe-resolv-val">${m.resolvidos || '—'}</div>
          <div class="equipe-turno-lbl">resolvidos</div>
        </div>
        <div class="equipe-status ${isOn?'on':''}">
          <span class="equipe-status-dot"></span>${isOn?'Online':'Offline'}
        </div>
      </div>`;
  }).join('');
}


function updateMapCounters() {
  const feats = (typeof mapSource === 'function' ? mapSource().features : (typeof incidentGeoJSON !== 'undefined' ? incidentGeoJSON.features : []));
  const incidents = feats.filter(f => f.properties.type !== 'delegacia');
  const delegacias = feats.filter(f => f.properties.type === 'delegacia');
  const abertos = incidents.filter(f => f.properties.status === 'open').length;
  const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('mc-total', incidents.length);
  set('mc-abertos', abertos);
  set('mc-delegacias', delegacias.length);
  // Feed pending count
  const pending = (typeof dashAlerts !== 'undefined' ? dashAlerts.filter(a=>a.status!=='resolved').length : 0);
  set('feed-pending-count', pending);
}

let feedGroupMode = 'tipo'; // 'tipo' | 'fonte' | 'none'

function setFeedGroup(mode) {
  feedGroupMode = mode;
  document.querySelectorAll('.feed-group-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.group === mode));
  renderDashFeed();
}

// Metadados de cada categoria de tipo/fonte (rótulo, cor, ícone)
const FEED_TYPE_META = {
  crime:       { label:'Crime',          color:'#E53935' },
  transito:    { label:'Trânsito',       color:'#F57C00' },
  furto:       { label:'Furto',          color:'#EF5350' },
  infra:       { label:'Infraestrutura', color:'#43A047' },
  feminicidio: { label:'Feminicídio',    color:'#9C27B0' },
  prf:         { label:'PRF',            color:'#FF8F00' },
  inmet:       { label:'INMET',          color:'#0288D1' },
  cemaden:     { label:'CEMADEN',        color:'#8E24AA' },
};
const FEED_SOURCE_META = {
  prf:     { label:'PRF — Polícia Rodoviária Federal', color:'#FF8F00' },
  inmet:   { label:'INMET — Meteorologia',             color:'#0288D1' },
  cemaden: { label:'CEMADEN — Desastres naturais',     color:'#8E24AA' },
  manual:  { label:'Registros da equipe',              color:'#6B6558' },
};

function renderInsights() {
  const strip = document.getElementById('insights-strip');
  if (!strip) return;

  // ── Calcula insights reais a partir dos dados ──
  const feats = (typeof mapSource === 'function' ? mapSource().features : (typeof incidentGeoJSON !== 'undefined' ? incidentGeoJSON.features : []))
    .filter(f => f.properties && f.properties.type !== 'delegacia');

  // 1) Município/região com mais incidentes + comparação
  const porLocal = {};
  feats.forEach(f => {
    const loc = (f.properties.loc || '').split('·').pop().trim() || f.properties.loc || '—';
    porLocal[loc] = (porLocal[loc] || 0) + 1;
  });
  const ranking = Object.entries(porLocal).sort((a,b) => b[1]-a[1]);
  const topLocal = ranking[0] || ['—', 0];
  const media = ranking.length ? (feats.length / ranking.length) : 0;
  const pctAcima = media > 0 ? Math.round(((topLocal[1] - media) / media) * 100) : 0;

  // 2) Tipo predominante
  const porTipo = {};
  feats.forEach(f => { const t = f.properties.type; porTipo[t] = (porTipo[t]||0)+1; });
  const TIPO_LBL = { crime:'crimes', transito:'ocorrências de trânsito', furto:'furtos', infra:'alertas de infraestrutura', cemaden:'alertas de risco', inmet:'avisos meteorológicos', prf:'acidentes PRF', delegacia:'delegacias monitoradas' };
  const topTipo = Object.entries(porTipo).sort((a,b)=>b[1]-a[1])[0] || ['crime',0];
  const pctTipo = feats.length ? Math.round((topTipo[1]/feats.length)*100) : 0;

  // 3) Taxa de resolução (dos alertas do feed)
  const alerts = (typeof dashAlerts !== 'undefined' ? dashAlerts : []);
  const resolvidos = alerts.filter(a => a.status === 'resolved').length;
  const taxaResol = alerts.length ? Math.round((resolvidos/alerts.length)*100) : 0;

  // 4) Risco CEMADEN ativo?
  const riscoCemaden = feats.filter(f => f.properties.source === 'cemaden' && f.properties.status === 'open').length;

  const insights = [];

  // Insight 1 — concentração geográfica (sempre)
  if (topLocal[1] > 0) {
    insights.push({
      cor: 'var(--red)', icon: 'M8 1l2 5 5 .4-3.8 3.3 1.2 5L8 12l-4.6 2.7 1.2-5L1 6.4 6 6z',
      titulo: `${topLocal[0]} concentra mais incidentes`,
      texto: pctAcima > 0
        ? `${topLocal[1]} ocorrências — ${pctAcima}% acima da média da região. Priorize patrulhamento nesta área.`
        : `${topLocal[1]} ocorrências registradas. Área de maior atenção no momento.`,
      cta: 'Ver no mapa', action: "setNav(document.querySelector('.nav-item[data-view=mapa]'))"
    });
  }

  // Insight 2 — risco CEMADEN (se houver) OU tipo predominante
  if (riscoCemaden > 0) {
    insights.push({
      cor: '#8E24AA', icon: 'M8 1.5L14.5 13H1.5L8 1.5z M8 6v3.5 M8 11v.5',
      titulo: `${riscoCemaden} alerta(s) de risco do CEMADEN`,
      texto: `Risco de deslizamento/hidrológico ativo na serra. Acione a Defesa Civil preventivamente.`,
      cta: 'Ver alertas', action: "setNav(document.querySelector('.nav-item[data-view=alertas]'))"
    });
  } else {
    insights.push({
      cor: 'var(--gold)', icon: 'M2 13V3 M2 13h11 M5 10l3-3 2 2 3-4',
      titulo: `${(TIPO_LBL[topTipo[0]]||topTipo[0])} são ${pctTipo}% do total`,
      texto: topTipo[0] === 'prf' || topTipo[0] === 'transito'
        ? `${topTipo[1]} acidentes na BR-101 e rodovias da Grande Florianópolis. Dados históricos importados da PRF.`
        : topTipo[0] === 'inmet'
        ? `${topTipo[1]} aviso${topTipo[1]>1?'s':''} meteorológico${topTipo[1]>1?'s':''} ativo${topTipo[1]>1?'s':''} do INMET para a região.`
        : `Tipo predominante. Considere ação direcionada para reduzir a recorrência.`,
      cta: 'Ver detalhes', action: "setNav(document.querySelector('.nav-item[data-view=alertas]'))"
    });
  }

  // Insight 3 — desempenho de resolução
  insights.push({
    cor: 'var(--success)', icon: 'M3 8l3.5 3.5L13 4',
    titulo: `Taxa de resolução em ${taxaResol || 0}%`,
    texto: taxaResol >= 70
      ? `Bom desempenho da equipe. Continue acompanhando o fluxo de atendimento.`
      : taxaResol > 0
      ? `Abaixo da meta de 70%. Vale revisar o fluxo de atendimento da equipe.`
      : `Nenhum alerta resolvido no período. Registre ocorrências para acompanhar a taxa.`,
    cta: 'Ver relatório', action: "setNav(document.querySelector('.nav-item[data-view=relatorios]'))"
  });

  strip.innerHTML = insights.map(ins => `
    <div class="insight-card" style="border-left:3px solid ${ins.cor}">
      <div class="insight-icon" style="color:${ins.cor};background:${ins.cor}1a">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ins.icon}"/></svg>
      </div>
      <div class="insight-body">
        <div class="insight-title">${ins.titulo}</div>
        <div class="insight-text">${ins.texto}</div>
        <button class="insight-cta" onclick="${ins.action}">${ins.cta} →</button>
      </div>
    </div>`).join('');
}

function renderDashFeed() {
  const list = document.getElementById('dash-feed');
  if (!list) return;

  const srcBadge = (src) => {
    if (src === 'prf')      return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;background:rgba(255,143,0,.15);color:#FF8F00;letter-spacing:.06em">PRF</span>`;
    if (src === 'inmet')    return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;background:rgba(2,136,209,.15);color:#0288D1;letter-spacing:.06em">INMET</span>`;
    if (src === 'cemaden')  return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;background:rgba(106,27,154,.15);color:#8E24AA;letter-spacing:.06em">CEMADEN</span>`;
    return `<span style="font-size:9px;color:var(--muted);letter-spacing:.04em">Manual</span>`;
  };

  const statusDot = (s, src) => {
    const colors = { open:'var(--red)', progress:'var(--gold)', resolved:'var(--success)' };
    if (s === 'open' && (src === 'prf' || src === 'inmet' || src === 'cemaden')) {
      return `<span class="feed-pulse${src === 'inmet' ? ' inmet' : src === 'cemaden' ? ' cemaden' : ''}"></span>`;
    }
    return `<span style="width:5px;height:5px;border-radius:50%;background:${colors[s]||'var(--muted)'};display:inline-block;flex-shrink:0"></span>`;
  };

  const planAlerts = filterAlertsByPlan(alertasDoPeriodo(), selectedBillingPlan || 'pro');
  if (!planAlerts.length) {
    list.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--muted)">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin:0 auto 10px;display:block"><path d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4z"/><path d="M16 12v4l3 3"/></svg>
      <div style="font-size:13px;font-weight:500;margin-bottom:4px">Sem ocorrências recentes</div>
      <div style="font-size:11px">Sua região está tranquila por enquanto</div>
    </div>`;
    return;
  }

  // Renderiza um único item (índice original preservado para Resolver)
  const renderItem = (a) => {
    const i = dashAlerts.indexOf(a);
    return `
    <div class="alert-item" style="cursor:default">
      <div class="alert-dot dot-${a.type}"></div>
      <div class="alert-body" style="flex:1;min-width:0">
        <div class="alert-type-row">
          <span class="alert-type-tag tag-${a.type}">${escapeHtml(a.label)}</span>
          ${srcBadge(a.source)}
          <span style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted)">
            ${statusDot(a.status, a.source)}há ${escapeHtml(a.time)}
          </span>
        </div>
        <div class="alert-desc">${escapeHtml(a.desc)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px">
          <div class="alert-loc">📍 ${escapeHtml(a.loc)}</div>
          ${a.status === 'resolved' ? `<span style="font-size:10px;color:var(--success);font-weight:500">✓ Resolvido</span>` : ''}
        </div>
      </div>
    </div>`;
  };

  // Sem agrupamento: lista simples
  if (feedGroupMode === 'none') {
    list.innerHTML = planAlerts.map(renderItem).join('');
    return;
  }

  // Agrupa por tipo ou fonte
  const keyOf  = (a) => feedGroupMode === 'fonte' ? (a.source || 'manual') : a.type;
  const meta   = feedGroupMode === 'fonte' ? FEED_SOURCE_META : FEED_TYPE_META;
  const groups = {};
  planAlerts.forEach(a => { const k = keyOf(a); (groups[k] = groups[k] || []).push(a); });

  // Ordena grupos: mais itens primeiro
  const ordered = Object.entries(groups).sort((a,b) => b[1].length - a[1].length);

  list.innerHTML = ordered.map(([key, items]) => {
    const m = meta[key] || { label: key, color: '#6B6558' };
    const abertos = items.filter(x => x.status !== 'resolved').length;
    return `
      <div class="feed-group">
        <div class="feed-group-head" style="border-left:3px solid ${m.color}">
          <span class="feed-group-dot" style="background:${m.color}"></span>
          <span class="feed-group-name">${m.label}</span>
          <span class="feed-group-count">${items.length}</span>
          ${abertos ? `<span class="feed-group-open">${abertos} em aberto</span>` : ''}
        </div>
        ${items.map(renderItem).join('')}
      </div>`;
  }).join('');
}

// Chart — tendência 7 dias (dados realistas Grande Florianópolis)
let chartData = [
  { day:'Seg', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Ter', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Qua', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Qui', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Sex', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Sáb', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
  { day:'Dom', crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0 },
];
function buildChartData(alerts) {
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const map = {};
  days.forEach(d => { map[d] = { day:d, crime:0, transito:0, furto:0, infra:0, prf:0, inmet:0, total:0 }; });
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  alerts.forEach(a => {
    const d = new Date(a._created || a.created_at);
    if (isNaN(d) || d.getTime() < cutoff) return;
    const dayName = days[d.getDay()];
    if (!map[dayName]) return;
    const type = a.source === 'prf' ? 'prf' : (a.source === 'inmet' ? 'inmet' : (a.type || 'outro'));
    if (map[dayName][type] !== undefined) map[dayName][type]++;
    map[dayName].total++;
  });
  return ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => map[d]);
}

// ── Sparklines nos cards de métricas ─────────────────────────
function makeSparkline(data, color) {
  const w = 200, h = 38;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = 'M' + pts.join(' L');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = 'sg' + Math.random().toString(36).slice(2,7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderSparklines() {
  function hoursData(filterFn) {
    const buckets = new Array(12).fill(0);
    const now = Date.now();
    const alerts = typeof dashAlerts !== 'undefined' ? dashAlerts : [];
    alerts.forEach(a => {
      if (!filterFn(a)) return;
      const d = new Date(a._created || a.created_at);
      if (isNaN(d)) return;
      const hoursAgo = Math.floor((now - d.getTime()) / 3600000);
      if (hoursAgo >= 0 && hoursAgo < 12) buckets[11 - hoursAgo]++;
    });
    if (buckets.every(v => v === 0)) {
      const total = alerts.filter(filterFn).length;
      return buckets.map((_, i) => Math.round((total / 12) * (0.5 + i / 12)));
    }
    return buckets;
  }
  const sparks = {
    'spark-hoje':       { data: hoursData(() => true), color: '#C8201A' },
    'spark-abertos':    { data: hoursData(a => a.status !== 'resolved'), color: '#F57C00' },
    'spark-resolvidos': { data: hoursData(a => a.status === 'resolved'), color: '#2E7D32' },
  };
  Object.entries(sparks).forEach(([id, cfg]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = makeSparkline(cfg.data, cfg.color);
  });
}

function renderChart() {
  const wrap = document.getElementById('chart-wrap');
  if (!wrap) return;

  const today  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date().getDay()];
  const totals = chartData.map(d => (d.crime||0) + (d.transito||0) + (d.furto||0) + (d.infra||0) + (d.prf||0) + (d.inmet||0));
  const rawMax = Math.max(...totals);
  const maxVal = Math.ceil(rawMax / 20) * 20;
  const media  = Math.round(totals.reduce((a,b)=>a+b,0) / totals.length);
  const peak   = Math.max(...totals);
  const peakDay = chartData[totals.indexOf(peak)].day;
  const low    = Math.min(...totals);
  const lowDay = chartData[totals.indexOf(low)].day;
  // Variação: último dia vs primeiro
  const variation = totals[0] ? Math.round((totals[totals.length-1] - totals[0]) / totals[0] * 100) : 0;

  // Dimensões SVG — mais alto para preencher o card
  const W = 580, H = 230, PAD_L = 34, PAD_R = 16, PAD_T = 22, PAD_B = 30;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = totals.length;
  const x = i => PAD_L + (i / (n - 1)) * plotW;
  const y = v => PAD_T + plotH - (v / maxVal) * plotH;

  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i===0?0:i-1], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2<pts.length?i+2:i+1];
      const cp1x = p1[0]+(p2[0]-p0[0])/6, cp1y = p1[1]+(p2[1]-p0[1])/6;
      const cp2x = p2[0]-(p3[0]-p1[0])/6, cp2y = p2[1]-(p3[1]-p1[1])/6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  const pts = totals.map((v,i) => [x(i), y(v)]);
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L${x(n-1)},${PAD_T+plotH} L${x(0)},${PAD_T+plotH} Z`;

  const gridLines = [0,0.25,0.5,0.75,1].map(s => {
    const gy = PAD_T + plotH - s*plotH;
    return `<line x1="${PAD_L}" y1="${gy}" x2="${W-PAD_R}" y2="${gy}" stroke="var(--border)" stroke-width="1" ${s===0?'':'stroke-dasharray="2 5"'} opacity=".7"/>`;
  }).join('');
  const yLabels = [0,0.5,1].map(s => {
    const gy = PAD_T + plotH - s*plotH;
    return `<text x="${PAD_L-9}" y="${gy+3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="JetBrains Mono, monospace">${Math.round(maxVal*s)}</text>`;
  }).join('');

  const mediaY = y(media);
  const mediaLine = `<line x1="${PAD_L}" y1="${mediaY}" x2="${W-PAD_R}" y2="${mediaY}" stroke="var(--navy)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".5"/>`;

  const dots = totals.map((v,i) => {
    const isToday = chartData[i].day === today;
    const isPeak  = v === peak;
    return `<circle cx="${x(i)}" cy="${y(v)}" r="${isToday?5.5:4}" fill="${isToday?'var(--red)':'var(--paper)'}" stroke="var(--red)" stroke-width="${isToday?2.5:2}"/>` +
           (isPeak && !isToday ? `<circle cx="${x(i)}" cy="${y(v)}" r="9" fill="none" stroke="var(--red)" stroke-width="1" opacity=".3"/>` : '');
  }).join('');
  const xLabels = chartData.map((d,i) => {
    const isToday = d.day === today;
    return `<text x="${x(i)}" y="${H-9}" text-anchor="middle" font-size="11" fill="${isToday?'var(--red)':'var(--muted)'}" font-weight="${isToday?'700':'500'}" font-family="DM Sans, sans-serif">${d.day}</text>`;
  }).join('');
  const valLabels = totals.map((v,i) => {
    const isToday = chartData[i].day === today;
    return `<text x="${x(i)}" y="${y(v)-12}" text-anchor="middle" font-size="11" fill="${isToday?'var(--red)':'var(--ink)'}" font-weight="700" font-family="JetBrains Mono, monospace">${v}</text>`;
  }).join('');

  const arrow = variation >= 0 ? '↑' : '↓';
  const varColor = variation >= 0 ? 'var(--red)' : 'var(--success)';

  wrap.innerHTML = `
    <div class="trend-stats">
      <div class="trend-stat"><div class="trend-stat-val" style="color:var(--red)">${peak}</div><div class="trend-stat-lbl">Pico · ${peakDay}</div></div>
      <div class="trend-stat"><div class="trend-stat-val" style="color:var(--navy)">${media}</div><div class="trend-stat-lbl">Média/dia</div></div>
      <div class="trend-stat"><div class="trend-stat-val" style="color:var(--muted)">${low}</div><div class="trend-stat-lbl">Mínimo · ${lowDay}</div></div>
      <div class="trend-stat"><div class="trend-stat-val" style="color:${varColor}">${arrow} ${Math.abs(variation)}%</div><div class="trend-stat-lbl">Semana</div></div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible" class="trend-svg">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--red)" stop-opacity=".25"/>
          <stop offset="100%" stop-color="var(--red)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}${yLabels}
      <path d="${areaPath}" fill="url(#trendGrad)" class="trend-area"/>
      ${mediaLine}
      <text x="${W-PAD_R}" y="${mediaY-5}" text-anchor="end" font-size="9" fill="var(--navy)" font-weight="700" font-family="JetBrains Mono, monospace">média ${media}</text>
      <path d="${linePath}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="trend-line"/>
      ${valLabels}${dots}${xLabels}
    </svg>`;
}

let resolveTargetIdx = null;

function toggleIntegration(service, on) {
  if (service === 'whatsapp') {
    const cfg = document.getElementById('whatsapp-config');
    if (cfg) cfg.style.display = on ? 'grid' : 'none';
    showToast(on ? 'WhatsApp ativado — configure abaixo' : 'WhatsApp desativado');
  } else {
    showToast(on ? '✓ ' + service.charAt(0).toUpperCase() + service.slice(1) + ' conectado' : service + ' desconectado');
  }
}

// ── Algoritmo de Luhn — valida número de cartão ────────────
function luhnCheck(num) {
  const digits = num.replace(/\D/g,'');
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateCardForm() {
  const num    = document.getElementById('sc-number')?.value?.replace(/\s/g,'') || '';
  const expiry = document.getElementById('sc-expiry')?.value || '';
  const cvv    = document.getElementById('sc-cvv')?.value    || '';
  const name   = document.getElementById('sc-name')?.value?.trim() || '';

  if (num.length < 13) { showToast('Número do cartão inválido'); return false; }
  if (!luhnCheck(num))  { showToast('Número do cartão inválido — verifique os dígitos'); return false; }

  const [mm, yy] = expiry.split('/').map(Number);
  if (!mm || !yy || mm < 1 || mm > 12) { showToast('Data de vencimento inválida'); return false; }
  const expDate = new Date(2000 + yy, mm - 1, 1);
  if (expDate < new Date()) { showToast('Cartão vencido — use um cartão válido'); return false; }

  if (cvv.length < 3) { showToast('CVV inválido'); return false; }
  if (name.length < 3) { showToast('Digite o nome como está no cartão'); return false; }

  return true;
}

function openStripeCheckout(plan) {
  const prices = { free: 0, pro: 297, enterprise: null };
  const names  = { free: 'Básico', pro: 'Profissional', enterprise: 'Corporativo' };
  const price  = prices[plan];

  if (plan === 'enterprise') {
    openModal('vendas');
    return;
  }
  if (price === 0) {
    showToast('✓ Plano Básico ativado — sem cobrança');
    document.getElementById('fat-plan-name').textContent = 'Básico';
    document.getElementById('fat-plan-price').innerHTML = 'R$0<span style="font-family:\'DM Sans\',sans-serif;font-size:16px;font-weight:300;color:rgba(255,255,255,.4)">/mês</span>';
    return;
  }

  // Simulate Stripe Checkout redirect
  showToast('Redirecionando para o checkout seguro…');
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;width:460px;border-radius:4px;overflow:hidden;font-family:sans-serif">
      <div style="background:#635BFF;padding:20px 24px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:18px;font-weight:700;color:#fff;letter-spacing:.01em">stripe checkout</div>
        <button aria-label="Fechar" title="Fechar" onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:18px">✕</button>
      </div>
      <div style="padding:28px">
        <div style="font-size:13px;color:#6B7280;margin-bottom:16px">Comunidade Alerta — Plano ${names[plan]}</div>
        <div style="font-size:32px;font-weight:700;color:#111;margin-bottom:24px">R$ ${price}<span style="font-size:16px;font-weight:400;color:#6B7280">/mês</span></div>
        <div style="display:grid;gap:12px;margin-bottom:20px">
          <div>
            <div style="font-size:11px;color:#6B7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Número do cartão</div>
            <input style="width:100%;border:1px solid #D1D5DB;border-radius:4px;padding:10px 12px;font-size:14px;box-sizing:border-box" placeholder="1234 1234 1234 1234" type="text" maxlength="19" oninput="this.value=this.value.replace(/[^0-9 ]/g,'')"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <div style="font-size:11px;color:#6B7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Vencimento</div>
              <input type="text" style="width:100%;border:1px solid #D1D5DB;border-radius:4px;padding:10px 12px;font-size:14px;box-sizing:border-box" placeholder="MM/AA"/>
            </div>
            <div>
              <div style="font-size:11px;color:#6B7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">CVC</div>
              <input type="text" style="width:100%;border:1px solid #D1D5DB;border-radius:4px;padding:10px 12px;font-size:14px;box-sizing:border-box" placeholder="123" maxlength="3"/>
            </div>
          </div>
        </div>
        <button onclick="if(validateCardForm()){completeCheckout('${plan}','${names[plan]}',${price},this.closest('[style*=fixed]'))}"
          style="width:100%;background:#635BFF;color:#fff;border:none;padding:14px;font-size:14px;font-weight:600;border-radius:4px;cursor:pointer">
          Pagar R$ ${price}/mês
        </button>
        <div style="text-align:center;margin-top:12px;font-size:11px;color:#9CA3AF">🔒 Pagamento seguro via Stripe · Cancele quando quiser</div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function completeCheckout(plan, name, price, modalEl) {
  // Processing state
  const btn = modalEl?.querySelector('button[onclick*="completeCheckout"]');
  if (btn) { btn.textContent = 'Processando...'; btn.disabled = true; btn.style.opacity = '.7'; }

  setTimeout(() => {
    if (modalEl) modalEl.remove();
    showToast('✓ Pagamento confirmado — Plano ' + name + ' ativo!');
  const planName  = document.getElementById('fat-plan-name');
  const planPrice = document.getElementById('fat-plan-price');
  if (planName)  planName.textContent  = name;
  if (planPrice) planPrice.innerHTML   = 'R$' + price + '<span style="font-family:\'DM Sans\',sans-serif;font-size:16px;font-weight:300;color:rgba(255,255,255,.4)">/mês</span>';
  const trialBanner = document.getElementById('fat-trial-banner');
  if (trialBanner) trialBanner.remove();
  }, 1800); // simula 1.8s de processamento
}

function openResolvePanel(idx) {
  resolveTargetIdx = (idx !== undefined && idx !== null) ? idx : null;
  const panel     = document.getElementById('resolve-panel');
  const titleEl   = document.getElementById('resolve-panel-title');
  const subEl     = document.getElementById('resolve-panel-sub');
  const idRow     = document.getElementById('resolve-id-row');
  const submitBtn = document.getElementById('resolve-submit-btn');

  // Clear form
  ['resolve-desc','resolve-loc','resolve-lat','resolve-lng','resolve-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  if (resolveTargetIdx !== null && allAlerts[resolveTargetIdx]) {
    // Edit existing alert
    const a = allAlerts[resolveTargetIdx];
    if (titleEl)   titleEl.textContent  = 'ATUALIZAR OCORRÊNCIA';
    if (subEl)     subEl.textContent    = `Alerta ${a.id || '#' + (resolveTargetIdx+1)} · ${a.label}`;
    if (idRow)   { idRow.style.display  = 'block'; document.getElementById('resolve-alert-id').textContent = a.id || resolveTargetIdx+1; }
    if (submitBtn) submitBtn.innerHTML  = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><path d="M2 6.5l3 3 6-6"/></svg>Salvar alterações';
    // Pre-fill fields
    const descEl = document.getElementById('resolve-desc');
    const locEl  = document.getElementById('resolve-loc');
    const stEl   = document.getElementById('resolve-status');
    const typEl  = document.getElementById('resolve-type');
    if (descEl) descEl.value = a.desc  || '';
    if (locEl)  locEl.value  = a.loc   || '';
    if (stEl)   stEl.value   = a.status || 'open';
    if (typEl) {
      const map = { crime:'crime', transito:'transito', furto:'furto', infra:'infra', feminicidio:'feminicidio', inmet:'inmet' };
      typEl.value = map[a.type] || 'crime';
    }
  } else {
    // New report
    if (titleEl)   titleEl.textContent  = 'REPORTAR OCORRÊNCIA';
    if (subEl)     subEl.textContent    = 'Novo registro manual de incidente';
    if (idRow)     idRow.style.display  = 'none';
    if (submitBtn) submitBtn.innerHTML  = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><path d="M2 6.5l3 3 6-6"/></svg>Registrar ocorrência';
    const stEl = document.getElementById('resolve-status');
    if (stEl) stEl.value = 'open';
  }

  panel.classList.add('open');
}

function closeResolvePanel(e, force) {
  if (!force && e && e.target !== document.getElementById('resolve-panel')) return;
  document.getElementById('resolve-panel').classList.remove('open');
}

function submitResolve() {
  const desc   = document.getElementById('resolve-desc')?.value.trim();
  const loc    = document.getElementById('resolve-loc')?.value.trim();
  const status = document.getElementById('resolve-status')?.value || 'open';
  const type   = document.getElementById('resolve-type')?.value   || 'crime';
  const notes  = document.getElementById('resolve-notes')?.value.trim();
  const prio   = document.getElementById('resolve-priority')?.value || 'normal';
  const src    = document.getElementById('resolve-source')?.value   || 'field';

  if (!desc) { showToast('Preencha a descrição da ocorrência'); return; }
  if (!loc)  { showToast('Informe o bairro / local da ocorrência'); return; }

  const typeLabels = { crime:'Crime', transito:'Trânsito', furto:'Furto', infra:'Infraestrutura', feminicidio:'Feminicídio', inmet:'INMET' };

  if (resolveTargetIdx !== null && allAlerts[resolveTargetIdx]) {
    // Update existing
    allAlerts[resolveTargetIdx].status = status;
    allAlerts[resolveTargetIdx].desc   = desc;
    allAlerts[resolveTargetIdx].loc    = loc;
    allAlerts[resolveTargetIdx].type   = type;
    allAlerts[resolveTargetIdx].label  = typeLabels[type] || type;
    showToast(status === 'resolved' ? '✓ Ocorrência marcada como resolvida' : '✓ Ocorrência atualizada com sucesso');
  } else {
    // Create new
    const newAlert = {
      id:     'MAN-' + String(allAlerts.length + 1).padStart(3,'0'),
      type, label: typeLabels[type] || type,
      source: 'manual', status,
      desc, loc, notes,
      time:   'agora',
      priority: prio,
      reporter: src,
    };
    allAlerts.unshift(newAlert);
    dashAlerts.unshift({ ...newAlert, time: 'agora' });
    showToast('✓ Ocorrência registrada com ID ' + newAlert.id);
  }

  document.getElementById('resolve-panel').classList.remove('open');

  // ── Persiste no backend ────────────────────────────────────
  // Mapeia prioridade do formulário → severity aceita pelo backend
  const sev = /crit/i.test(prio) ? 'critical' : /alta|high/i.test(prio) ? 'high' : /baixa|low/i.test(prio) ? 'low' : 'medium';
  (async () => {
    if (resolveTargetIdx !== null && allAlerts[resolveTargetIdx]) {
      // Edição: o backend só expõe alteração de STATUS (PATCH /alerts/:id/status)
      const dbId = allAlerts[resolveTargetIdx].dbId;
      if (dbId) {
        const r = await apiPatch('/alerts/' + dbId + '/status', { status });
        if (r && r.error) console.warn('[API] status não atualizado:', r.error);
      }
    } else {
      // Criação: POST /api/alerts (campos do backend: type, description, location, severity)
      const r = await apiPost('/alerts', { type, description: desc, location: loc, severity: sev });
      if (!r || (!r.alert && !r.id)) {
        showToast('Salvo localmente, mas não foi possível gravar no servidor' + (r?.error ? ' (' + r.error + ')' : ''));
      }
    }
    // Recarrega do servidor para refletir id/coords reais e re-renderiza
    if (typeof refreshLiveData === 'function') {
      const ok = await refreshLiveData();
      if (ok && typeof rerenderDashboard === 'function') rerenderDashboard();
    }
  })();

  renderAlertasTable(activeFilter);
  renderActivityTable();
  renderDashFeed();
  updateSidebarBadge();
}

// ── Formatadores do cartão ─────────────────────────────────────
function fmtCard(el) {
  let v = el.value.replace(/\D/g,'').substring(0,16);
  el.value = v.replace(/(.{4})/g,'$1 ').trim();
  // Detect brand
  const brand = document.getElementById('sc-brand');
  if (!brand) return;
  if (/^4/.test(v))              { brand.textContent='VISA';  brand.style.background='#1A1F71'; }
  else if (/^5[1-5]/.test(v))   { brand.textContent='MC';    brand.style.background='#EB001B'; }
  else if (/^3[47]/.test(v))    { brand.textContent='AMEX';  brand.style.background='#2E77BC'; }
  else if (/^6/.test(v))        { brand.textContent='ELO';   brand.style.background='#00A4E0'; }
  else                           { brand.textContent='CARD';  brand.style.background='#9B9189'; }
}

function fmtExpiry(el) {
  let v = el.value.replace(/\D/g,'').substring(0,4);
  if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  el.value = v;
}

/* ─ smooth scroll helper ─ */
function smoothScroll(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior:'smooth' });
}

// ══════════════════════════════════════════════════════════
// FUNÇÕES RESTAURADAS
// ══════════════════════════════════════════════════════════

function updateLandingTopbar() {
  const sess     = loadSession();
  const loginBtn = document.getElementById('landing-login-btn');
  const ctaBtn   = document.getElementById('landing-cta-btn');
  const sessionBar = document.getElementById('landing-session-bar');
  const demoBtn  = document.getElementById('hero-demo-btn');
  const demoBtnCta = document.getElementById('cta-demo-btn');

  if (sess && sess.authenticated && !sess.isDemo) {
    // ── Usuário logado ────────────────────────────
    const name = sess.name || sess['inp-name'] || 'Usuário';
    if (sessionBar) {
      sessionBar.style.display = 'flex';
      const nameEl = document.getElementById('session-bar-name');
      if (nameEl) nameEl.textContent = name.split(' ')[0];
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (ctaBtn)   ctaBtn.textContent = 'Continuar no painel →';
    // Botão demo vira "Abrir mapa ao vivo"
    if (demoBtn) {
      demoBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M8 1C4.7 1 2 3.7 2 7s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z"/><circle cx="8" cy="7" r="1.5" fill="currentColor"/><path d="M8 4v2M8 8.5V10"/></svg> Abrir mapa ao vivo';
      demoBtn.title = 'Ir para o mapa de incidentes do seu painel';
    }
    if (demoBtnCta) demoBtnCta.textContent = 'Abrir mapa ao vivo →';
  } else {
    // ── Não logado ───────────────────────────────
    if (sessionBar) sessionBar.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
    if (ctaBtn)   ctaBtn.textContent = 'Começar agora →';
    if (demoBtn) {
      demoBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><circle cx="8" cy="8" r="6"/><path d="M6 5.5l5 2.5-5 2.5V5.5z" fill="currentColor" stroke="none"/></svg> Ver mapa público ao vivo';
      demoBtn.title = '';
    }
    if (demoBtnCta) demoBtnCta.textContent = 'Ver mapa público ao vivo →';
  }
}

function logout() {
  // Limpa a sessão no lugar certo (sessionStorage via clearSession)
  try { if (typeof clearSession === 'function') clearSession(); } catch(e) {}
  try {
    sessionStorage.removeItem('ca_session');
    sessionStorage.removeItem('ca_session_demo');
    sessionStorage.removeItem('plan_banner_dismissed');
    sessionStorage.clear();
  } catch(e) {}
  // Reseta variáveis de estado
  if (typeof mapDash !== 'undefined') mapDash = null;
  if (typeof mapFull !== 'undefined') mapFull = null;
  if (typeof selectedBillingPlan !== 'undefined') selectedBillingPlan = 'pro';
  // Limpa campos do formulário de cadastro
  ['inp-name','inp-sobrenome','inp-email','inp-pass','inp-org','inp-tipo','inp-size','inp-doc',
   'cfg-name','cfg-sob','cfg-email'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  // Remove banners
  document.getElementById('demo-mode-banner')?.remove();
  document.getElementById('plan-upgrade-tip')?.remove();
  // Volta para a landing
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-landing')?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof updateLandingTopbar === 'function') updateLandingTopbar();
  if (typeof showToast === 'function') showToast('Você saiu da sua conta com segurança');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ca_theme', next); } catch(e) {}
  const moonSVG = '<path d="M11 2.5A6.5 6.5 0 012.5 11 7 7 0 1011 2.5z"/>';
  const sunSVG  = '<circle cx="7" cy="7" r="3"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M3 3l1 1M10 10l1 1M3 11l1-1M10 4l1-1"/>';
  ['theme-icon','theme-icon-landing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = next === 'dark' ? moonSVG : sunSVG;
  });
}

const MODAL_CONTENT = {
  vendas: {
    title: 'Falar com Vendas',
    body: '<div style="padding:8px 0"><p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px">Nossa equipe está pronta para apresentar o Comunidade Alerta, montar uma demonstração personalizada e discutir condições especiais para prefeituras e órgãos públicos.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><a href="mailto:vendas@comunidadealerta.com.br" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--paper-dark);border:1px solid var(--border);text-decoration:none;color:var(--ink)"><div><div style="font-size:12px;font-weight:600">E-mail</div><div style="font-size:10px;color:var(--muted)">vendas@comunidadealerta.com.br</div></div></a><a href="tel:+554830000000" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--paper-dark);border:1px solid var(--border);text-decoration:none;color:var(--ink)"><div><div style="font-size:12px;font-weight:600">Telefone</div><div style="font-size:10px;color:var(--muted)">(48) 3000-0000</div></div></a></div><p style="font-size:11px;color:var(--muted);text-align:center;margin-top:12px">Atendimento seg–sex das 8h às 18h</p></div>'
  },
  'api-docs': {
    title: 'Documentação da API',
    body: '<div style="padding:8px 0"><p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px">Nossa API REST permite integrar o Comunidade Alerta com qualquer sistema externo. Autenticação via token seguro, respostas em JSON.</p><div style="background:var(--ink);color:#98B4A6;font-family:monospace;font-size:12px;padding:16px;line-height:1.8">GET /api/alertas?municipio=florianopolis<br>POST /api/alertas<br>GET /api/delegacias<br>POST /api/integracoes<br>GET /api/relatorios/mensal</div><p style="font-size:11px;color:var(--muted);margin-top:12px">Fontes integradas: PRF, INMET e CEMADEN. Documentação completa disponível após cadastro.</p></div>'
  },
  changelog: {
    title: 'Histórico de Versões',
    body: '<div style="padding:8px 0;display:flex;flex-direction:column;gap:14px"><div><span style="font-size:9px;padding:2px 8px;background:rgba(200,32,26,.1);color:var(--red);font-weight:700;border-radius:2px">v2.5 — Mai 2026</span><ul style="font-size:12px;color:var(--muted);line-height:1.8;padding-left:16px;margin-top:8px"><li>Integração CEMADEN — alertas de deslizamento e risco hidrológico</li><li>Agrupamento de incidentes no feed (por tipo e fonte)</li><li>Cluster do mapa com composição visual por tipo</li></ul></div><div><span style="font-size:9px;padding:2px 8px;background:var(--paper-dark);color:var(--muted);font-weight:700;border-radius:2px">v2.4 — Abr 2026</span><ul style="font-size:12px;color:var(--muted);line-height:1.8;padding-left:16px;margin-top:8px"><li>Painel lateral ao vivo no Mapa</li><li>Filtros por fonte (PRF / INMET / Manual)</li><li>25 delegacias com busca em tempo real</li></ul></div><div><span style="font-size:9px;padding:2px 8px;background:var(--paper-dark);color:var(--muted);font-weight:700;border-radius:2px">v2.3 — Abr 2026</span><ul style="font-size:12px;color:var(--muted);line-height:1.8;padding-left:16px;margin-top:8px"><li>22 municípios da Grande Florianópolis</li><li>Push Notifications</li><li>Fluxo de resolução com audit trail</li></ul></div></div>'
  },
  suporte: {
    title: 'Central de Suporte',
    body: '<div style="display:flex;flex-direction:column;gap:12px;padding:8px 0"><p style="font-size:13px;color:var(--muted);line-height:1.6">Precisa de ajuda? Nossa equipe responde em até 2 horas úteis.</p><div style="border:1px solid var(--border);padding:16px;display:flex;gap:12px;align-items:center;justify-content:space-between"><div><div style="font-size:12px;font-weight:600;color:var(--ink)">Chat ao vivo</div><div style="font-size:11px;color:var(--muted)">Seg–Sex 8h–18h · Resposta em ~8 min</div></div><button class="btn-primary" style="padding:6px 14px;font-size:11px" onclick="showToast(\'Chat em breve disponível\');closeModal(null,true)">Abrir chat</button></div><div style="border:1px solid var(--border);padding:16px"><div style="font-size:12px;font-weight:600;color:var(--ink)">suporte@comunidadealerta.com.br</div><div style="font-size:11px;color:var(--muted)">Resposta em até 2h úteis</div></div></div>'
  },
  status: {
    title: 'Status dos Serviços',
    body: '<div style="display:flex;flex-direction:column;gap:8px;padding:8px 0"><div style="font-size:11px;color:var(--success);font-weight:600;padding:8px 12px;background:rgba(67,160,71,.08);border:1px solid rgba(67,160,71,.2)">● Todos os sistemas operando normalmente</div>' +
      ['Dashboard','API REST','Integração PRF','Integração INMET','Integração CEMADEN','Push Notifications','Banco de Dados'].map(s =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:10px 12px;border:1px solid var(--border)"><span style="color:var(--ink)">${s}</span><span style="color:var(--success);font-weight:600">Operacional</span></div>`
      ).join('') + '</div>'
  },
};

function openModal(key) {
  const content = MODAL_CONTENT[key];
  const overlay = document.getElementById('gmodal-overlay');
  const titleEl = document.getElementById('gmodal-title');
  const bodyEl  = document.getElementById('gmodal-body');
  if (!overlay || !content) { showToast('Em breve disponível'); return; }
  titleEl.textContent  = content.title;
  bodyEl.innerHTML     = content.body;
  overlay.style.display = 'flex';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(e, force) {
  if (!force && e && e.target !== document.getElementById('gmodal-overlay')) return;
  const overlay = document.getElementById('gmodal-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('open'); }
  document.body.style.overflow = '';
}

function requestPushPermission() {
  if (!('Notification' in window)) { showToast('Seu navegador não suporta notificações push'); return; }
  if (Notification.permission === 'granted') {
    showToast('✓ Notificações já estão ativas neste dispositivo');
    return;
  }
  Notification.requestPermission().then(p => {
    if (p === 'granted') showToast('✓ Notificações ativadas! Você receberá alertas em tempo real.');
    else showToast('Notificações bloqueadas. Ative nas configurações do navegador.');
  });
}

function exportDashboardPDF() {
  showToast('Gerando relatório PDF…');
  setTimeout(() => {
    const org   = document.getElementById('dash-org')?.textContent  || 'Organização';
    const user  = document.getElementById('dash-username')?.textContent || 'Operador';
    const now   = new Date();
    const month = now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    const dateStr = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
    const plan  = typeof selectedBillingPlan !== 'undefined' ? selectedBillingPlan : 'pro';
    const planAlerts = typeof filterAlertsByPlan === 'function' ? filterAlertsByPlan(allAlerts, plan) : allAlerts;
    const typeCount  = {};
    planAlerts.forEach(a => { typeCount[a.label] = (typeCount[a.label]||0)+1; });
    const top3 = Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const open = planAlerts.filter(a=>a.status==='open').length;
    const resolved = planAlerts.filter(a=>a.status==='resolved').length;
    const rate = planAlerts.length ? Math.round(resolved/planAlerts.length*100) : 0;
    const rows = planAlerts.slice(0,20).map((a,i) =>
      `<tr style="${i%2===0?'background:#F9F7F2':''}">
        <td>${(i+1).toString().padStart(3,'0')}</td>
        <td style="color:#C8201A;font-weight:700;font-size:9px;letter-spacing:.06em;text-transform:uppercase">${a.label}</td>
        <td>${a.desc.substring(0,60)}${a.desc.length>60?'…':''}</td>
        <td>${a.loc}</td>
        <td>${a.time}</td>
        <td><span style="font-size:9px;font-weight:700;padding:2px 6px">${a.status==='open'?'Em aberto':a.status==='resolved'?'Resolvido':'Em andamento'}</span></td>
      </tr>`
    ).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório ${month}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#14120E}.page{max-width:900px;margin:0 auto;padding:40px}.hdr{border-bottom:3px solid #C8201A;padding-bottom:20px;margin-bottom:28px;display:flex;align-items:flex-end;justify-content:space-between}.kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}.kpi{border:1px solid #E8E0D0;padding:16px}.kn{font-size:32px;font-weight:700;line-height:1;margin-bottom:4px}.kl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#9B9189}.top3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}.t3i{background:#F4EFE4;padding:14px}.t3l{font-size:15px;font-weight:600;margin:3px 0}.t3n{font-size:24px;font-weight:700;color:#C8201A}table{width:100%;border-collapse:collapse}th{background:#F4EFE4;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;text-align:left;border-bottom:2px solid #C8201A;color:#6B6558}td{padding:7px 10px;border-bottom:1px solid #F0EBE0;font-size:10px}.footer{margin-top:28px;padding-top:14px;border-top:1px solid #E8E0D0;display:flex;justify-content:space-between;color:#9B9189;font-size:9px}</style>
      </head><body>
<a href="#dash-main-region" style="position:absolute;left:-9999px;top:0;z-index:9999;padding:8px 16px;background:var(--red);color:#fff;font-size:13px;font-weight:600;text-decoration:none" onfocus="this.style.left='0'" onblur="this.style.left='-9999px'">Pular para o conteúdo</a>
<div class="page">
      <div class="hdr"><div><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#9B9189;margin-bottom:5px">● Comunidade Alerta · Grande Florianópolis</div><h1 style="font-size:28px;letter-spacing:.04em">RELATÓRIO <span style="color:#C8201A">MENSAL</span></h1><div style="font-size:12px;color:#6B6558;margin-top:6px">${month}</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:600">${org}</div><div style="font-size:11px;color:#6B6558;margin-top:2px">Gerado em ${dateStr}</div><div style="font-size:10px;color:#9B9189;margin-top:2px">por ${user}</div></div></div>
      <div class="kgrid"><div class="kpi"><div class="kn" style="color:#C8201A">${planAlerts.length}</div><div class="kl">Total de alertas</div></div><div class="kpi"><div class="kn" style="color:#E65100">${open}</div><div class="kl">Em aberto</div></div><div class="kpi"><div class="kn" style="color:#2E7D32">${resolved}</div><div class="kl">Resolvidos</div></div><div class="kpi"><div class="kn">${rate}%</div><div class="kl">Taxa de resolução</div></div></div>
      <div style="background:#F4EFE4;border-left:3px solid #C8201A;padding:14px 18px;margin-bottom:24px;font-size:11px;line-height:1.7;color:#3A352E">
        <strong style="display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#C8201A;margin-bottom:6px">Resumo executivo</strong>
        No período analisado foram registradas <strong>${planAlerts.length} ocorrências</strong> na Grande Florianópolis, sendo <strong>${open} em aberto</strong> e <strong>${resolved} resolvidas</strong> (taxa de ${rate}%). O tipo mais frequente foi <strong>${top3[0]?top3[0][0]:'—'}</strong> com ${top3[0]?top3[0][1]:0} registros. ${rate>=70?'A equipe manteve um bom ritmo de resolução.':'Recomenda-se reforço da equipe para elevar a taxa de resolução.'}
      </div>
      <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#9B9189;font-weight:600;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #E8E0D0">Top 3 tipos de incidentes</div>
      <div class="top3">${top3.map(([l,n],i)=>`<div class="t3i"><div style="font-size:9px;color:#9B9189">#${i+1}</div><div class="t3l">${l}</div><div class="t3n">${n}</div></div>`).join('')}</div>
      <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#9B9189;font-weight:600;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #E8E0D0">Distribuição por tipo</div>
      <div style="margin-bottom:28px">${Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([l,n])=>{const pct=Math.round(n/planAlerts.length*100);return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px"><div style="width:90px;font-size:10px;color:#3A352E">${l}</div><div style="flex:1;background:#F0EBE0;height:16px;border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#C8201A;border-radius:2px"></div></div><div style="width:54px;font-size:10px;color:#6B6558;text-align:right">${n} (${pct}%)</div></div>`;}).join('')}</div>
      <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#9B9189;font-weight:600;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E8E0D0">Ocorrências registradas</div>
      <table><thead><tr><th>#</th><th>Tipo</th><th>Descrição</th><th>Local</th><th>Horário</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer"><span>Comunidade Alerta · SC</span><span>comunidadealerta.com.br</span><span>Gerado automaticamente</span></div>
      </div><script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open('','_blank','width=960,height=700');
    if (w) { w.document.write(html); w.document.close(); }
    else showToast('Permita pop-ups para gerar o PDF');
  }, 300);
}

// ── LGPD — direitos do titular ────────────────────────────
// Art. 18: V (acesso/portabilidade) e VI (eliminacao).

async function exportarMeusDados() {
  showToast('Preparando seus dados...');
  try {
    const sess = loadSession();
    const r = await fetch(API_BASE + '/account/export', {
      headers: { 'Authorization': 'Bearer ' + (sess?.token || '') }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'meus-dados-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Arquivo gerado');
  } catch (e) {
    showToast('Não foi possível gerar o arquivo agora');
    console.warn('[LGPD] export:', e.message);
  }
}

async function confirmarExclusaoConta() {
  const senha  = document.getElementById('lgpd-senha')?.value;
  const ciente = document.getElementById('lgpd-ciente')?.checked;

  if (!senha)  { showToast('Confirme sua senha'); document.getElementById('lgpd-senha')?.focus(); return; }
  if (!ciente) { showToast('Marque a confirmação para prosseguir'); return; }

  try {
    const sess = loadSession();
    const r = await fetch(API_BASE + '/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + (sess?.token || '') },
      body: JSON.stringify({ senha })
    });
    const d = await r.json();

    if (!r.ok) {
      // Caso legitimo: unico admin da organizacao
      if (d.code === 'ULTIMO_ADMIN') {
        alert(d.error + '\n\n' + (d.orientacao || ''));
      } else {
        showToast(d.error || 'Não foi possível processar');
      }
      return;
    }

    const quando = new Date(d.eliminacao_em).toLocaleDateString('pt-BR');
    alert('Sua conta foi desativada.\n\n' +
          'Os dados pessoais serão eliminados definitivamente em ' + quando + '.\n' +
          'Até lá, você pode desistir entrando em contato com o suporte.\n\n' +
          'As ocorrências que você registrou permanecem na plataforma, ' +
          'desvinculadas da sua identidade.');

    clearSession();
    showPage('landing');
  } catch (e) {
    showToast('Erro de conexão');
    console.warn('[LGPD] exclusao:', e.message);
  }
}

// Se ja existe pedido em andamento, mostra o prazo em vez do botao
async function verificarStatusExclusao() {
  try {
    const sess = loadSession();
    if (!sess?.token) return;
    const r = await fetch(API_BASE + '/account/deletion-status', {
      headers: { 'Authorization': 'Bearer ' + sess.token }
    });
    if (!r.ok) return;
    const d = await r.json();
    if (!d.pendente) return;

    const box = document.getElementById('lgpd-status');
    const btn = document.getElementById('lgpd-btn');
    if (box) {
      const quando = new Date(d.eliminacao_em).toLocaleDateString('pt-BR');
      box.textContent = 'Exclusão solicitada. Seus dados serão eliminados em ' + quando +
                        '. Para desistir, fale com o suporte.';
      box.style.display = 'block';
    }
    if (btn) btn.style.display = 'none';
  } catch(_) {}
}


// Atalhos de data em Gerenciar Ocorrencias
function atalhoData(qual) {
  const de  = document.getElementById('alert-data-de');
  const ate = document.getElementById('alert-data-ate');
  if (!de || !ate) return;
  const hoje = new Date();
  const iso  = d => d.toISOString().slice(0, 10);

  if (qual === 'tudo') { de.value = ''; ate.value = ''; }
  else if (qual === 'mes') {
    de.value  = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    ate.value = iso(hoje);
  } else if (qual === '90d') {
    de.value  = iso(new Date(Date.now() - 90 * 864e5));
    ate.value = iso(hoje);
  } else if (qual === 'ano') {
    de.value  = iso(new Date(hoje.getFullYear(), 0, 1));
    ate.value = iso(hoje);
  }
  if (typeof filterAlerts === 'function') filterAlerts();
  else renderAlertasTable('all');
}
