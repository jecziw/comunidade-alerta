/* ════════════════════════════════════════════════════════
   Comunidade Alerta — publico
   Landing, mapa publico, sessao e chamadas de API.

   GERADO A PARTIR DE comunidade-alerta.html
   Este arquivo passa a ser a fonte da verdade; o HTML so o referencia.
   ════════════════════════════════════════════════════════ */

// ── Demonstração ao vivo ──────────────────────────────────
function startDemo() {
  // Se já está logado → vai direto pro mapa real
  const sess = loadSession();
  if (sess && sess.authenticated && !sess.isDemo) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-dashboard')?.classList.add('active');
    window.scrollTo({ top:0 });
    initDashboard();
    // Abre direto na view do mapa
    setTimeout(() => {
      const mapaNav = document.querySelector('.nav-item[data-view="mapa"]');
      if (mapaNav) setNav(mapaNav);
    }, 400);
    return;
  }

  // Não logado → abre o MAPA PÚBLICO (sem timer, sem saída automática)
  showPage('publico');
}

let mapDemoInstance = null;
let demoTimerInterval = null;

function initDemoMap() {
  const el = document.getElementById('map-demo');
  if (!el) return;

  // Destroi instância anterior se existir
  if (mapDemoInstance) {
    mapDemoInstance.remove();
    mapDemoInstance = null;
  }

  mapDemoInstance = L.map('map-demo', { zoomControl:true, attributionControl:false })
    .setView([-27.5954,-48.5482], 11);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19
  }).addTo(mapDemoInstance);

  // Conta incidentes por tipo
  const counts = { crime:0, transito:0, furto:0, infra:0, total:0 };
  const COLORS = {
    crime:'#E53935', transito:'#F57C00', furto:'#3F51B5',
    infra:'#43A047', feminicidio:'#9C27B0', prf:'#FF8F00', inmet:'#0288D1', cemaden:'#6A1B9A'
  };

  (incidentGeoJSON?.features || []).forEach(f => {
    const p = f.properties;
    if (p.type === 'delegacia') return;
    const col = COLORS[p.type] || '#78909C';
    const marker = L.circleMarker(
      [f.geometry.coordinates[1], f.geometry.coordinates[0]],
      { radius:7, fillColor:col, color:'rgba(255,255,255,.25)', weight:1.5,
        fillOpacity:.88, interactive:true }
    ).addTo(mapDemoInstance);
    marker.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:200px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:${col};text-transform:uppercase;margin-bottom:4px">${p.label}</div>
        <div style="font-size:12px;color:#333;line-height:1.5;margin-bottom:6px">${p.desc}</div>
        <div style="font-size:11px;color:#888">📍 ${p.loc}</div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;text-align:center">
          <button onclick="showPage('register')" style="background:#C8201A;color:#fff;border:none;padding:6px 14px;font-size:11px;border-radius:2px;cursor:pointer;font-family:'DM Sans',sans-serif">Começar grátis por 14 dias →</button>
        </div>
      </div>
    `, { maxWidth:260 });

    if (p.type in counts) counts[p.type]++;
    counts.total++;
  });

  // Atualiza contadores
  const set = (id,val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
  set('dc-crime', counts.crime);
  set('dc-transito', counts.transito);
  set('dc-furto', counts.furto);
  set('dc-infra', counts.infra);
  set('dc-total', counts.total);

  // Invalida tamanho após render
  setTimeout(() => mapDemoInstance?.invalidateSize(), 300);
}

function startDemoTimer() {
  if (demoTimerInterval) clearInterval(demoTimerInterval);

  let seconds = 180; // 3 minutos
  const timerEl = document.getElementById('demo-timer');
  const expiredEl = document.getElementById('demo-expired');

  const update = () => {
    if (!timerEl) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    timerEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;

    if (seconds <= 30) timerEl.classList.add('ending');
    if (seconds <= 0) {
      clearInterval(demoTimerInterval);
      timerEl.textContent = '0:00';
      // Mostra a tela "demo encerrada" por 4s e volta automaticamente para a landing
      if (expiredEl) expiredEl.style.display = 'flex';
      showToast('Demonstração encerrada — voltando ao site...');
      setTimeout(() => { exitDemo(); }, 4000);
    }
    seconds--;
  };

  update();
  demoTimerInterval = setInterval(update, 1000);
}

function exitDemo() {
  // Para o timer
  if (demoTimerInterval) { clearInterval(demoTimerInterval); demoTimerInterval = null; }

  // Destrói o mapa
  if (mapDemoInstance) { mapDemoInstance.remove(); mapDemoInstance = null; }

  // Reseta estado
  window.__demoMode = false;
  const timerEl = document.getElementById('demo-timer');
  if (timerEl) { timerEl.textContent = '3:00'; timerEl.classList.remove('ending'); }
  const expiredEl = document.getElementById('demo-expired');
  if (expiredEl) expiredEl.style.display = 'none';

  // Volta para landing
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-landing')?.classList.add('active');
  window.scrollTo({ top:0 });
}



/* ═══════════════════════════════════════════
   PAGE ROUTER
═══════════════════════════════════════════ */
// ── Sessão persistente ───────────────────────────────────
const SESSION_KEY = 'ca_session';

/* ═══════════════════════════════════════════════════════════════
   API CONFIG — substituir URL quando backend estiver rodando
═══════════════════════════════════════════════════════════════ */
const API_BASE = '/api';

const API_ENABLED = true; // true quando backend estiver rodando

/**
 * Busca dados da API ou usa dados locais como fallback.
 * Quando API_ENABLED = true, faz fetch real.
 * Quando false, retorna dados locais com delay simulado.
 */
async function apiGet(endpoint, localFallback) {
  if (!API_ENABLED) {
    return new Promise(resolve => setTimeout(() => resolve(localFallback), 400));
  }
  const sess = loadSession();
  const headers = { 'Content-Type': 'application/json' };
  if (sess?.token) headers['Authorization'] = 'Bearer ' + sess.token;
  try {
    const res = await fetch(API_BASE + endpoint, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(err) {
    console.warn('[API] ' + endpoint + ' falhou, usando dados locais:', err.message);
    if (String(err.message).includes('401')) {
      // Sessao expirada: avisa e leva de volta ao login em vez de mostrar tudo zerado
      if (!window.__authWarned) {
        window.__authWarned = true;
        try { showToast('Sua sessão expirou. Faça login novamente.'); } catch(_) {}
        setTimeout(() => { try { logout(); } catch(_) { showPage('login'); } }, 2200);
      }
    }
    return localFallback;
  }
}

async function apiPost(endpoint, body) {
  if (!API_ENABLED) {
    return new Promise(resolve => setTimeout(() => resolve({ ok: true, id: Date.now() }), 600));
  }
  const sess = loadSession();
  const headers = { 'Content-Type': 'application/json' };
  if (sess?.token) headers['Authorization'] = 'Bearer ' + sess.token;
  try {
    const res = await fetch(API_BASE + endpoint, { method:'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(err) {
    console.warn('[API] POST ' + endpoint + ' falhou:', err.message);
    return { ok: false, error: err.message };
  }
}

async function apiPatch(endpoint, body) {
  if (!API_ENABLED) {
    return new Promise(resolve => setTimeout(() => resolve({ ok: true }), 400));
  }
  const sess = loadSession();
  const headers = { 'Content-Type': 'application/json' };
  if (sess?.token) headers['Authorization'] = 'Bearer ' + sess.token;
  try {
    const res = await fetch(API_BASE + endpoint, { method:'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(err) {
    console.warn('[API] PATCH ' + endpoint + ' falhou:', err.message);
    return { ok: false, error: err.message };
  }
}

// Alguns navegadores (Brave com Shields, modo restrito, iframe de terceiros)
// bloqueiam sessionStorage e o setItem lanca excecao. Antes isso era engolido
// por um catch vazio: o login "funcionava", mas o token sumia e TODA chamada
// autenticada voltava 401. Agora mantemos uma copia em memoria como reserva.
let _sessaoMemoria = null;

function storageDisponivel() {
  try {
    const k = '__ca_probe__';
    sessionStorage.setItem(k, '1');
    sessionStorage.removeItem(k);
    return true;
  } catch(_) { return false; }
}

function saveSession(data) {
  const obj = {...data, ts: Date.now()};

  // REDE DE SEGURANCA: saveSession SUBSTITUI o objeto inteiro. Se alguma chamada
  // esquecer de repassar o token, a sessao continua "logada" mas sem credencial —
  // e toda chamada autenticada volta 401 silenciosamente (bug real que ocorreu).
  // Aqui reaproveitamos o token anterior quando o novo objeto nao traz nenhum.
  if (!obj.token) {
    let anterior = _sessaoMemoria;
    if (!anterior) {
      try { anterior = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch(_) {}
    }
    if (anterior && anterior.token) {
      obj.token = anterior.token;
      if (!obj.tenantId && anterior.tenantId) obj.tenantId = anterior.tenantId;
    }
  }

  _sessaoMemoria = obj;                        // reserva: sempre funciona
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch(_) {
    // storage bloqueado — avisa uma unica vez, sem travar o uso
    if (!window.__avisouStorage) {
      window.__avisouStorage = true;
      try { showToast('Armazenamento bloqueado pelo navegador — a sessão vale só nesta aba.'); } catch(_) {}
    }
  }
}

function loadSession() {
  try {
    const sess = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (sess) return sess;
  } catch(_) {}
  return _sessaoMemoria;                       // cai na reserva
}

function clearSession() {
  _sessaoMemoria = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch(_) {}
  try { localStorage.removeItem(SESSION_KEY); } catch(_) {}
}

// (definicao duplicada de updateLandingTopbar removida — era identica a de baixo)


// NOTA: existia uma 2a definicao de logout() mais abaixo que sobrescrevia esta.
// Renomeada para deixar claro que esta versao NAO e a usada.
function logoutLegacy_naoUsado() {
  clearSession();
  try { sessionStorage.clear(); } catch(_) {}

  // 2. Limpa campos do formulário de cadastro (evita vazamento para próximo usuário)
  ['inp-name','inp-sobrenome','inp-email','inp-pass','inp-org',
   'inp-tipo','inp-size','inp-regiao','inp-phone','inp-cnpj',
   'cfg-name','cfg-sob','cfg-email','cfg-org-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // 3. Limpa UI do dashboard
  ['dash-username','dash-org'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const av = document.getElementById('dash-avatar');
  if (av) av.textContent = '?';

  // 4. Reseta variáveis globais
  if (typeof selectedBillingPlan !== 'undefined') selectedBillingPlan = 'pro';
  if (typeof selectedPlan        !== 'undefined') selectedPlan        = 'pro';
  window.__demoMode = false;

  // 5. Reseta wizard de cadastro para estado limpo
  if (typeof resetWizard === 'function') resetWizard();

  // 6. Reseta topbar da landing
  updateLandingTopbar();

  // 7. Navega para landing
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-landing')?.classList.add('active');
  window.scrollTo({ top:0, behavior:'smooth' });
  showToast('Você saiu da conta com segurança.');
}

// Validação REAL de CPF (dígitos verificadores)
function validarCPF(cpf) {
  cpf = String(cpf == null ? '' : cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (soma % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (soma % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

// Validação REAL de CNPJ (dígitos verificadores)
function validarCNPJ(cnpj) {
  cnpj = String(cnpj == null ? '' : cnpj).replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base, pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += parseInt(base[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const p2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  const d1 = calc(cnpj, p1);
  if (d1 !== parseInt(cnpj[12])) return false;
  const d2 = calc(cnpj, p2);
  return d2 === parseInt(cnpj[13]);
}

function validarDocVisual() {
  const el = document.getElementById('inp-doc');
  const check = document.getElementById('doc-check');
  const errEl = document.getElementById('doc-error');
  const field = document.getElementById('f-doc');
  if (!el) return true;
  const digits = el.value.replace(/\D/g, '');
  if (!digits) { // vazio: neutro
    if (check) check.style.display = 'none';
    field?.classList.remove('has-error');
    el.style.borderColor = '';
    return true;
  }
  const valido = digits.length === 11 ? validarCPF(digits)
               : digits.length === 14 ? validarCNPJ(digits) : false;
  if (valido) {
    if (check) { check.textContent = '✓'; check.style.color = 'var(--success)'; check.style.display = 'block'; }
    field?.classList.remove('has-error');
    el.style.borderColor = 'var(--success)';
  } else {
    if (check) { check.textContent = '✕'; check.style.color = 'var(--red)'; check.style.display = digits.length >= 11 ? 'block' : 'none'; }
    el.style.borderColor = digits.length >= 11 ? 'var(--red)' : '';
    if (digits.length >= 11) field?.classList.add('has-error');
  }
  return valido;
}

// Escapa HTML para evitar XSS ao inserir texto do usuário via innerHTML
function escapeHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Máscara dinâmica CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00)
function maskCnpjCpf(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 14);
  if (v.length <= 11) {
    // CPF
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    // CNPJ
    v = v.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
  el.value = v;
}

// ═══════════════ LOGIN ═══════════════
function showLoginMode(mode) {
  ['pass','forgot','code'].forEach(m => {
    const el = document.getElementById('login-form-'+m);
    if (el) el.style.display = m === mode ? 'block' : 'none';
  });
  const step2 = document.getElementById('code-step2');
  if (step2 && mode !== 'code') step2.style.display = 'none';
}

// Deriva um nome apresentável a partir do e-mail (joao.silva → "Joao Silva")
function nameFromEmail(email) {
  const local = String(email == null ? '' : email).split('@')[0] || '';
  const nome = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return nome || 'Usuário';
}

async function doLogin() {
  const email = (document.getElementById('login-email')?.value || '').trim();
  const pass  = (document.getElementById('login-pass')?.value || '').trim();
  if (!email || !pass) { showToast('Preencha e-mail e senha'); return; }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showToast('E-mail inválido'); return; }
  // Login real no backend (POST /api/auth/login). apiPost devolve {token,user} ou {ok:false,error}.
  const r = await apiPost('/auth/login', { email, password: pass });
  if (!r || !r.token) { showToast(r?.error === 'HTTP 401' ? 'Credenciais inválidas' : (r?.error || 'Falha no login')); return; }
  const u = r.user || {};
  const prev = (typeof loadSession === 'function' ? loadSession() : null) || {};
  saveSession({
    authenticated: true,
    token: r.token,
    name: u.name || prev.name || nameFromEmail(email),
    email: u.email || email,
    org: u.org || u.tenantName || u.organizacao || prev.org || 'Minha Organização',
    plan: u.plan || prev.plan || selectedBillingPlan || 'pro',
    role: u.role || 'admin',
    tenantId: u.tenantId || null,
    cnpjCpf: prev.cnpjCpf || null,
  });
  if (u.plan && typeof selectedBillingPlan !== 'undefined') selectedBillingPlan = u.plan;
  showPage('dashboard'); if (typeof initDashboard==='function') await initDashboard();
  showWelcomeBack();
}

// ── Boas-vindas personalizada após login ──────────────
function showWelcomeBack() {
  const sess = (typeof loadSession === 'function') ? loadSession() : {};
  // Nome e sobrenome (primeiras duas palavras), com fallback
  const partes = (sess.name || 'gestor').trim().split(/\s+/).filter(Boolean);
  const nome = partes.slice(0, 2).join(' ') || 'gestor';
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  const g = document.getElementById('wb-greeting');
  const gl = document.getElementById('wb-greeting-label');
  const orgEl = document.getElementById('wb-org-name');
  if (g) g.textContent = nome;
  if (gl) gl.textContent = saud;
  if (orgEl) orgEl.textContent = sess.org || 'Minha Organização';
  // Conta incidentes ativos (abertos) do dataset
  try {
    const ativos = (typeof dashAlerts !== 'undefined')
      ? dashAlerts.filter(a => a.status !== 'resolved').length
      : (typeof incidentGeoJSON !== 'undefined' ? incidentGeoJSON.features.filter(f => f.properties && f.properties.type !== 'delegacia' && f.properties.status === 'open').length : 0);
    // Em aberto e o que exige acao; total sozinho nao diz nada.
    const abertos = (typeof dashAlerts !== 'undefined' ? dashAlerts : [])
      .filter(a => a.status !== 'resolved' && a.status !== 'closed').length;
    const el = document.getElementById('wb-stat-active');
    if (el) el.textContent = abertos || '—';

    // Quantos entraram desde ontem: e o que muda entre uma visita e outra.
    const desde24h = Date.now() - 864e5;
    const novos = (typeof dashAlerts !== 'undefined' ? dashAlerts : [])
      .filter(a => { const d = new Date(a._created || a.created_at);
                     return !isNaN(d) && d.getTime() >= desde24h; }).length;
    const elN = document.getElementById('wb-stat-novos');
    if (elN) elN.textContent = novos;

    // Se nada foi resolvido, o gestor precisa saber — e o dado acionavel aqui.
    const resolvidos = (typeof dashAlerts !== 'undefined' ? dashAlerts : [])
      .filter(a => a.status === 'resolved' || a.status === 'closed').length;
    const elF = document.getElementById('wb-fontes');
    if (elF && abertos > 0 && resolvidos === 0)
      elF.textContent = abertos + ' ocorrência(s) aguardando análise da equipe';
  } catch(e) {}
  const ov = document.getElementById('wb-overlay');
  if (ov) ov.style.display = 'flex';
}
function closeWelcomeBack(ev, force) {
  if (ev && ev.target !== ev.currentTarget && !force) return;
  const ov = document.getElementById('wb-overlay');
  if (ov) ov.style.display = 'none';
}

function socialLogin(provider) {
  // Em produção: redireciona para o OAuth do provedor (Google/Apple/Facebook/X).
  showToast(`Login com ${provider} requer configuração do provedor — disponível no deploy`);
}

function sendResetLink() {
  const email = (document.getElementById('forgot-email')?.value || '').trim();
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showToast('Informe um e-mail válido'); return; }
  showToast(`Link de redefinição enviado para ${email}`);
  setTimeout(() => showLoginMode('pass'), 1200);
}

function sendLoginCode() {
  const email = (document.getElementById('code-email')?.value || '').trim();
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showToast('Informe um e-mail válido'); return; }
  // Demo: simula envio. Em produção, backend gera código e envia via Resend.
  window.__loginCode = String(Math.floor(100000 + Math.random()*900000));
  const step2 = document.getElementById('code-step2');
  if (step2) step2.style.display = 'block';
  document.getElementById('btn-send-code').textContent = 'Reenviar código';
  showToast(`Código enviado para ${email} (demo: ${window.__loginCode})`);
}

function verifyLoginCode() {
  const code = (document.getElementById('code-input')?.value || '').trim();
  if (code.length !== 6) { showToast('Digite os 6 dígitos'); return; }
  // Demo: aceita o código gerado. Em produção, valida no backend.
  if (window.__loginCode && code !== window.__loginCode) { showToast('Código incorreto'); return; }
  const email = (document.getElementById('code-email')?.value || '').trim();
  const prev = (typeof loadSession === 'function' ? loadSession() : null) || {};
  saveSession({ ...prev, authenticated:true, name: prev.name || nameFromEmail(email), email, org: prev.org || 'Minha Organização', plan: prev.plan || selectedBillingPlan||'pro' });
  showPage('dashboard'); if (typeof initDashboard==='function') initDashboard();
  showWelcomeBack();
}

function showPage(name) {
  // ── Auth gate ─────────────────────────────
  if (name === 'dashboard') {
    // Demo mode: sem sessão, só memória — deixa passar
    if (!window.__demoMode) {
      const sess = loadSession();
      if (!sess || !sess.authenticated) {
        showToast('Faça login ou crie uma conta para acessar o painel');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-register')?.classList.add('active');
        window.scrollTo({ top:0, behavior:'smooth' });
        return;
      }
    }
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'register') {
    // Só reseta se não há sessão ativa (usuário fez logout ou é novo)
    const sess = loadSession();
    if (!sess || !sess.authenticated) {
      resetWizard();
    }
    setTrialDate();
    updatePreview?.();
  }
  if (name === 'landing') {
    initLanding();
  }
  if (name === 'publico') {
    initPublicPage();
  }
}

// ═══════════════ PÁGINA PÚBLICA DO CIDADÃO ═══════════════
let mapPublico = null;
let pubFilterType = 'all';

// ── Dados públicos REAIS para o cidadão (GET http://18.229.131.113:3000/api/public/alerts) ──
let livePublicGeoJSON = { type:'FeatureCollection', features: [] };
let pubSocket = null;

async function refreshPublicData() {
  let data = null;
  try { data = await apiGet('/public/alerts', null); } catch(_) { data = null; }
  const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const alertsFiltered = (data && Array.isArray(data.alerts) ? data.alerts : []).filter(a => {
    if (a.source === 'delegacia' || a.source === 'inmet') return true;
    const d = new Date(a.created_at);
    return !isNaN(d) && d.getTime() >= cutoff90;
  });
  const feats = alertsFiltered.map(a => {
    const lat = a.latitude  != null ? parseFloat(a.latitude)  : NaN;
    const lng = a.longitude != null ? parseFloat(a.longitude) : NaN;
    if (isNaN(lat) || isNaN(lng)) return null;
    const labels = (typeof LIVE_TYPE_LABELS !== 'undefined') ? LIVE_TYPE_LABELS : {};
    // type controla a CATEGORIA (cor/filtro: crime, transito, infra...)
    const dt = a.type || a.source || 'outro';
    // label mostra a FONTE real no popup (PRF, INMET) quando disponível, senão a categoria
    const sourceLabels = { prf:'PRF', inmet:'INMET', cemaden:'CEMADEN' };
    const lbl = sourceLabels[a.source] || labels[dt] || dt;
    return { type:'Feature', geometry:{ type:'Point', coordinates:[lng, lat] },
      properties:{ type:dt, label: lbl, desc:a.description||'', loc:a.location||'',
        id:a.external_id||('AL-'+a.id), status:a.status||'open', source:a.source||'externo' } };
  }).filter(Boolean);
  livePublicGeoJSON = { type:'FeatureCollection', features: feats };
  return livePublicGeoJSON;
}

// Tempo real para o cidadão: conexão anônima → recebe só a sala 'public'.
function initRealtimePublic() {
  if (typeof io === 'undefined') return;
  if (pubSocket) { try { pubSocket.disconnect(); } catch(_) {} pubSocket = null; }
  pubSocket = io({ transports:['websocket','polling'], reconnection:true }); // sem token = só sala pública
  pubSocket.on('alert:new', a => {
    const labels = (typeof LIVE_TYPE_LABELS !== 'undefined') ? LIVE_TYPE_LABELS : {};
    const label = a.source_label || labels[a.source] || labels[a.type] || 'Alerta';
    try { showToast?.(`🔔 [${label}] ${(a.description||'').substring(0,80)}`); } catch(_) {}
    clearTimeout(window._pubRtTimer);
    window._pubRtTimer = setTimeout(async () => { await refreshPublicData(); filterPublicMap(); }, 500);
  });
}

// ── Web Push pro cidadão (botão flutuante na página pública) ──
function ensurePushButton() {
  if (document.getElementById('citizen-push-btn')) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; // navegador sem suporte
  const btn = document.createElement('button');
  btn.id = 'citizen-push-btn';
  btn.textContent = '🔔 Receber alertas no celular';
  btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;background:#C8201A;color:#fff;border:none;padding:12px 18px;border-radius:24px;font-weight:600;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28)';
  btn.onclick = subscribeCitizenPush;
  document.body.appendChild(btn);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribeCitizenPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Seu navegador não suporta notificações'); return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('Permissão de notificação negada'); return; }
    const keyRes = await apiGet('/public/vapid-key', null);
    if (!keyRes || !keyRes.key) { showToast('Notificações ainda não configuradas no servidor'); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.key),
    });
    const r = await apiPost('/public/subscribe', sub.toJSON());
    if (r && r.ok) {
      showToast('✅ Pronto! Você receberá os alertas públicos no celular');
      const b = document.getElementById('citizen-push-btn');
      if (b) { b.textContent = '🔔 Alertas ativados'; b.style.background = '#2e7d32'; }
    } else {
      showToast('Não foi possível ativar as notificações');
    }
  } catch (e) {
    console.warn('[push] subscribe falhou:', e);
    showToast('Erro ao ativar notificações');
  }
}

function initPublicPage() {
  refreshPublicData().then(() => setTimeout(() => {
    if (!mapPublico) {
      mapPublico = initLeafletMap('map-publico', 11, 'pro');
    } else {
      mapPublico.invalidateSize();
    }
    filterPublicMap(); // desenha os alertas públicos reais
  }, 120));
  initRealtimePublic(); // tempo real pro cidadão (sala pública)
  ensurePushButton();   // botão de notificação no celular
  // Modal de boas-vindas (uma vez por sessão)
  if (!window.__welcomeSeen) {
    setTimeout(openWelcome, 500);
    window.__welcomeSeen = true;
  }
}

function openWelcome() {
  const ov = document.getElementById('welcome-overlay');
  if (ov) { ov.style.display = 'flex'; ov.classList.add('open'); }
}
function closeWelcome(ev, force) {
  if (ev && ev.target !== ev.currentTarget && !force) return;
  const ov = document.getElementById('welcome-overlay');
  if (ov) { ov.style.display = 'none'; ov.classList.remove('open'); }
}

function setPubFilter(btn) {
  document.querySelectorAll('.pub-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pubFilterType = btn.dataset.type;
  filterPublicMap();
}

function _normalize(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function filterPublicMap() {
  const query = _normalize(document.getElementById('pub-search-input')?.value);

  // Opção A (serviço público): mostra os alertas públicos REAIS (INMET + ingeridos),
  // vindos de GET /api/public/alerts. Sem paywall e sem dado de demonstração.
  const src = (livePublicGeoJSON && Array.isArray(livePublicGeoJSON.features)) ? livePublicGeoJSON.features : [];
  const matched = src.filter(f => {
    const p = f.properties;
    if (!p) return false;
    if (pubFilterType !== 'all' && p.type !== pubFilterType) return false;
    if (query && !(_normalize(p.loc).includes(query) || _normalize(p.label).includes(query))) return false;
    return true;
  });
  const amostra = matched; // sem corte: o cidadão vê todos os alertas públicos

  updatePubCounter(amostra.length, matched.length);

  if (!mapPublico) return;
  if (window._pubCluster) { try { mapPublico.removeLayer(window._pubCluster); } catch(e){} }

  // Reposiciona o controle de zoom para não ser coberto pelos marcadores
  try { if (mapPublico.zoomControl) mapPublico.zoomControl.setPosition('bottomright'); } catch(e){}

  // Camada simples (sem agrupamento) — cada incidente individual
  const cluster = (typeof L.featureGroup !== 'undefined') ? L.featureGroup()
                : (typeof L.layerGroup !== 'undefined' ? L.layerGroup() : null);

  const latlngs = [];
  amostra.forEach(f => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    latlngs.push([lat, lng]);
    const cor = (typeof INCIDENT_COLORS !== 'undefined' && INCIDENT_COLORS[p.type]) || '#0288D1';
    const m = L.circleMarker([lat,lng], { radius:6, fillColor:cor, color:'#fff', weight:2, fillOpacity:.9 });
    m.bindPopup(`<div style="font-family:'DM Sans',sans-serif"><strong style="color:${cor}">${p.label||'Incidente'}</strong><br/><span style="font-size:11px;color:#888">📍 ${p.loc||''}</span><br/><a onclick="showPage('register')" style="font-size:11px;color:#C8201A;cursor:pointer;font-weight:600">Ver detalhes e horário →</a></div>`);
    if (cluster) cluster.addLayer(m); else m.addTo(mapPublico);
  });

  if (cluster) { cluster.addTo(mapPublico); window._pubCluster = cluster; }

  // Recentraliza o mapa nos resultados da busca (dá feedback visual de que buscou)
  if (query && latlngs.length) {
    try {
      if (latlngs.length === 1) mapPublico.setView(latlngs[0], 14, { animate: true });
      else mapPublico.fitBounds(latlngs, { padding: [50, 50], maxZoom: 14, animate: true });
    } catch(e){}
  } else if (!query) {
    try { mapPublico.setView([-27.595, -48.548], 11, { animate: true }); } catch(e){}
  }

  // Mensagem de "nenhum resultado" quando a busca não casa
  const noRes = document.getElementById('pub-no-results');
  if (noRes) noRes.style.display = (query && matched.length === 0) ? 'block' : 'none';
}

// Upsell ao clicar num filtro premium
function pubUpsell(recurso) {
  showToast(`🔒 ${recurso} faz parte do acesso completo`);
  setTimeout(() => showPage('register'), 900);
}

function updatePubCounter(count, total) {
  const el = document.getElementById('pub-c-total');
  if (!el) return;
  if (typeof count === 'number') { el.textContent = count; return; }
  const all = (livePublicGeoJSON && Array.isArray(livePublicGeoJSON.features))
    ? livePublicGeoJSON.features.length : 0;
  el.textContent = all;
}

// Modal de alertas do cidadão
function openPubAlertModal() {
  document.getElementById('pub-alert-overlay')?.classList.add('open');
  document.getElementById('pub-alert-form').style.display = 'block';
  document.getElementById('pub-alert-success').style.display = 'none';
}
function closePubAlertModal(e, force) {
  if (!force && e && e.target !== document.getElementById('pub-alert-overlay')) return;
  document.getElementById('pub-alert-overlay')?.classList.remove('open');
}
function submitPubAlert() {
  const email = document.getElementById('pub-alert-email').value.trim();
  const consent = document.getElementById('pub-alert-consent').checked;
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showToast('Digite um e-mail válido'); return; }
  if (!consent) { showToast('Aceite a política de privacidade para continuar'); return; }
  // Em produção: POST /api/public/subscribe { email, municipio }
  document.getElementById('pub-alert-form').style.display = 'none';
  document.getElementById('pub-alert-success').style.display = 'block';
}

// Verifica sessão ao carregar a página


// ── Polling indicator — PRF (15min) e INMET (10min) ───────
let prfSeconds  = 15 * 60;
let ascSeconds  = 10 * 60;
const PRF_TOTAL = 15 * 60;
const ASC_TOTAL = 10 * 60;

function formatPollingTime(secs) {
  if (secs >= 60) return Math.ceil(secs/60) + 'm';
  return secs + 's';
}

function updatePollingBars() {
  const prfBar   = document.getElementById('prf-bar');
  const ascBar   = document.getElementById('asc-bar');
  const prfTimer = document.getElementById('prf-timer');
  const ascTimer = document.getElementById('asc-timer');
  if (!prfBar || !ascBar) return;

  prfSeconds = Math.max(0, prfSeconds - 1);
  ascSeconds = Math.max(0, ascSeconds - 1);

  const prfPct = (prfSeconds / PRF_TOTAL) * 100;
  const ascPct = (ascSeconds / ASC_TOTAL) * 100;

  prfBar.style.width = prfPct + '%';
  ascBar.style.width = ascPct + '%';
  if (prfTimer) prfTimer.textContent = formatPollingTime(prfSeconds);
  if (ascTimer) ascTimer.textContent = formatPollingTime(ascSeconds);

  // Pisca quando vai buscar dados
  if (prfSeconds === 0) {
    prfSeconds = PRF_TOTAL;
    prfBar.style.width = '100%';
    showToast('PRF: dados atualizados');
  }
  if (ascSeconds === 0) {
    ascSeconds = ASC_TOTAL;
    ascBar.style.width = '100%';
    showToast('INMET: avisos atualizados');
  }
}

function startPollingIndicator() {
  if (window._pollingInterval) clearInterval(window._pollingInterval);
  prfSeconds = 15 * 60;
  ascSeconds  = 10 * 60;
  window._pollingInterval = setInterval(updatePollingBars, 1000);
}

function checkApiStatus() {
  const dot   = document.getElementById('api-status-dot');
  const label = document.getElementById('api-status-label');
  if (!dot || !label) return;
  if (!API_ENABLED) {
    dot.style.background   = 'var(--gold)';
    label.textContent      = 'Modo demo';
    label.title            = 'Backend desconectado. Dados são exemplos locais.';
    return;
  }
  fetch(API_BASE + '/health', { method:'GET', signal: AbortSignal.timeout(3000) })
    .then(r => {
      if (r.ok) {
        dot.style.background   = 'var(--success)';
        label.textContent      = 'Online';
        label.title            = 'Conectado ao servidor';
      } else throw new Error('not ok');
    })
    .catch(() => {
      dot.style.background   = 'var(--red)';
      label.textContent      = 'Offline';
      label.title            = 'Sem conexão com o servidor. Usando dados locais.';
    });
}

function checkAuthOnLoad() {
  // A sessão vive no sessionStorage: morre sozinha ao FECHAR a aba/navegador,
  // que e o comportamento desejado (sem "login automatico" em maquina compartilhada).
  // Recarregar a pagina (F5 / Ctrl+Shift+R) NAO pode derrubar o login — antes
  // isso apagava o token e o painel inteiro aparecia zerado (HTTP 401).
  const sess = loadSession();

  // Sessao antiga demais (mais de 12h) e descartada por seguranca.
  const MAX_IDADE = 12 * 60 * 60 * 1000;
  if (sess && sess.ts && (Date.now() - sess.ts) > MAX_IDADE) {
    clearSession();
    updateLandingTopbar();
    return;
  }

  // Sessao sem token nao serve para chamar a API — limpa para nao fingir que esta logado.
  if (sess && sess.authenticated && !sess.token && !sess.isDemo) {
    clearSession();
    updateLandingTopbar();
    return;
  }

  updateLandingTopbar();
}

/* ═══════════════════════════════════════════
   LANDING — LIVE FEED
═══════════════════════════════════════════ */
let incidents = [];
let feedIndex = 0;
let feedTimer = null;

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `há ${diff} min`;
  const h = Math.floor(diff / 60);
  return `há ${h}h`;
}

const SOURCE_LABEL = { prf: 'PRF', inmet: 'INMET', cemaden: 'CEMADEN', manual: 'Manual' };
const TYPE_LABEL   = { transito: 'Trânsito', infra: 'Infraestrutura', crime: 'Crime', furto: 'Furto', prf: 'PRF', inmet: 'INMET' };

// Intercala alertas de fontes diferentes (PRF, INMET, ...) em vez de
// simplesmente ordenar por data — assim a landing nunca fica dominada
// por uma única fonte só porque ela teve eventos mais recentes.
function interleaveBySource(list) {
  const groups = {};
  const order = [];
  for (const item of list) {
    const key = item.source || 'outro';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(item);
  }
  const result = [];
  let added = true;
  while (added) {
    added = false;
    for (const key of order) {
      if (groups[key].length) {
        result.push(groups[key].shift());
        added = true;
      }
    }
  }
  return result;
}

async function loadPublicAlerts() {
  try {
    const r = await fetch('/api/public/alerts');
    const data = await r.json();
    const rawAlerts = data.alerts || [];
    const mapped = rawAlerts.map(a => {
      const typeLabel = SOURCE_LABEL[a.source] || TYPE_LABEL[a.type] || 'Alerta';
      // Remove prefixo duplicado genérico (ex: "Tempestade — Tempestade — ...")
      let desc = a.description || '';
      const parts = desc.split(' — ');
      if (parts.length >= 2 && parts[0] === parts[1]) {
        desc = parts[0] + ' — ' + parts.slice(2).join(' — ');
      }
      return {
        type:      a.source || a.type || 'infra',
        source:    a.source || 'outro',
        typeLabel,
        desc,
        loc:       a.location || '',
        time:      timeAgo(a.created_at),
      };
    });
    incidents = interleaveBySource(mapped);
    // Atualiza ticker com dados reais
    const track = document.getElementById('ticker-track');
    if (track && incidents.length) {
      track.innerHTML = [...incidents, ...incidents].map(i => {
        const desc = i.desc || '';
        const loc = i.loc && !desc.includes(i.loc) ? ' · ' + i.loc : '';
        return `<span class="ticker-item">● [${escapeHtml(i.typeLabel)}] ${escapeHtml(desc)}${escapeHtml(loc)}</span>`;
      }).join('');
    }
  } catch(e) {
    console.warn('[feed] Erro ao carregar alertas públicos:', e.message);
  }
}

function feedItemHTML(item) {
  return `<div class="feed-item">
    <div class="feed-item-top"><span class="feed-type type-${item.type}">${item.typeLabel}</span><span class="feed-time">${item.time}</span></div>
    <div class="feed-desc">${item.desc}</div>
    <div class="feed-loc"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#666" stroke-width="1.5"><circle cx="5" cy="4" r="2"/><path d="M5 9C5 9 2 6.5 2 4a3 3 0 116 0c0 2.5-3 5-3 5z"/></svg>${item.loc}</div>
  </div>`;
}

function initFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;
  list.innerHTML = incidents.slice(0, 4).map(feedItemHTML).join('');
  feedIndex = 4;
}

function rotateFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;
  const next = incidents[feedIndex % incidents.length];
  const wrap = document.createElement('div');
  wrap.innerHTML = feedItemHTML(next);
  list.insertBefore(wrap.firstElementChild, list.firstChild);
  if (list.children.length > 4) list.removeChild(list.lastChild);
  feedIndex++;
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let n = 0;
  const step = Math.ceil(target / 40);
  const t = setInterval(() => {
    n = Math.min(n + step, target);
    el.textContent = n;
    if (n >= target) clearInterval(t);
  }, 30);
}

function initLanding() {
  updateLandingTopbar();
  loadPublicAlerts().then(() => {
    initFeed();
    if (feedTimer) clearInterval(feedTimer);
    feedTimer = setInterval(rotateFeed, 3800);
  });
  // Busca stats reais da API
  fetch('/api/public/alerts').then(r => r.json()).then(data => {
    const alerts = data.alerts || [];
    const hoje = data.total || alerts.length;
    const ativos = data.total_open || alerts.filter(a => a.status === 'open').length;
    const resolvidos = data.total_resolved || alerts.filter(a => a.status === 'resolved').length;
    const total = data.total || alerts.length;
    setTimeout(() => animateCount('stat-hoje', total), 300);
  }).catch(() => {
    setTimeout(() => animateCount('stat-hoje', 661), 300);
  });
  initReveal();
}

function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('#page-landing .reveal').forEach(el => obs.observe(el));
}

/* ═══════════════════════════════════════════
   REGISTER — WIZARD LOGIC
═══════════════════════════════════════════ */
const tipoMap    = { prefeitura:'Prefeitura / Governo', seguranca:'Empresa de Segurança', condominio:'Condomínio / Síndico', ong:'ONG / Associação', outro:'Outro' };
const regiaoMap  = { 'grande-flori':'Grande Florianópolis', norte:'Norte Catarinense', sul:'Sul Catarinense', oeste:'Oeste Catarinense', vale:'Vale do Itajaí', serra:'Serra Catarinense', outra:'Outra' };
const planNames  = { free:'Básico', pro:'Profissional', enterprise:'Corporativo' };
let selectedPlan = 'pro';

function resetWizard() {
  selectedPlan = 'pro';

  // ── Limpa todos os campos (evita dados do usuário anterior) ──
  ['inp-name','inp-sobrenome','inp-email','inp-pass',
   'inp-phone','inp-org','inp-cnpj'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['inp-tipo','inp-size','inp-regiao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });

  // ── Reseta barra de força da senha ──
  ['pb1','pb2','pb3','pb4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'pw-bar';
  });
  const hint = document.getElementById('pw-hint');
  if (hint) hint.textContent = 'Use letras, números e caracteres especiais.';

  // ── Reseta checkbox de termos ──
  const terms = document.getElementById('terms');
  if (terms) terms.checked = false;

  // ── Reseta erros de validação ──
  ['f-name','f-email','f-pass','f-org'].forEach(id => {
    document.getElementById(id)?.classList.remove('has-error');
  });

  // ── Reseta botão de criar conta ──
  const btn3 = document.getElementById('btn3');
  if (btn3) {
    btn3.disabled  = false;
    btn3.textContent = '';
    btn3.innerHTML = 'Criar minha conta <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  }

  // ── Reseta visual do wizard ──
  goToStep(1);
  const stepper = document.getElementById('stepper');
  if (stepper) stepper.style.display = 'flex';
  document.getElementById('reg-success')?.classList.remove('active');
  document.querySelectorAll('#page-register .form-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('fstep1')?.classList.add('active');
  ['ck1','ck2','ck3','ck4','ck5'].forEach(id => {
    document.getElementById(id)?.classList.remove('done');
  });
  const trialNote = document.getElementById('trial-note');
  if (trialNote) trialNote.style.display = 'flex';

  // ── Atualiza preview ──
  updatePreview?.();
}

function goToStep(n) {
  document.querySelectorAll('#page-register .form-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('fstep' + n);
  if (panel) panel.classList.add('active');
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('sdot-' + i);
    dot.classList.remove('active','done');
    if (i < n) dot.classList.add('done');
    else if (i === n) dot.classList.add('active');
  }
  document.getElementById('ck1').classList.toggle('done', n > 1);
  document.getElementById('ck2').classList.toggle('done', n > 2);
  updatePreview();
}

function suggestPlanFromSize() {
  const size = document.getElementById('inp-size')?.value || '6-20';
  // Mapeia faixa de usuários → plano sugerido
  const map = { '1':'free', '2-5':'pro', '6-20':'pro', '21+':'enterprise' };
  const planoSugerido = map[size] || 'pro';
  const card = document.querySelector(`.plan-card[data-plan="${planoSugerido}"]`);
  if (card) {
    selectPlan(card);
    // Destaque visual rápido para indicar a sugestão automática
    card.style.transition = 'box-shadow .3s';
    card.style.boxShadow = '0 0 0 3px rgba(200,32,26,.35)';
    setTimeout(() => { card.style.boxShadow = ''; }, 900);
    const lbl = { free:'Básico', pro:'Profissional', enterprise:'Corporativo' }[planoSugerido];
    if (typeof showToast === 'function') showToast(`Plano sugerido para o seu tamanho: ${lbl}`);
  }
}

function selectPlan(card) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedPlan = card.dataset.plan;
  const tn = document.getElementById('trial-note');
  if (tn) tn.style.display = selectedPlan === 'free' ? 'none' : 'flex';
  updatePreview();
}

function updatePreview() {
  const name      = (document.getElementById('inp-name')?.value || '').trim();
  const sob       = (document.getElementById('inp-sobrenome')?.value || '').trim();
  const email     = (document.getElementById('inp-email')?.value || '').trim();
  const org       = (document.getElementById('inp-org')?.value || '').trim();
  const tipo      = document.getElementById('inp-tipo')?.value || '';
  const regiao    = document.querySelector('[name="regiao"], #inp-regiao, select[placeholder*="egião"]')?.value || '';

  const full     = [name, sob].filter(Boolean).join(' ');
  const initials = [name[0], sob[0]].filter(Boolean).join('').toUpperCase() || '?';

  const setEl = (id, val, empty) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val || '—';
    el.classList.toggle('value-empty', !val);
  };

  document.getElementById('prev-avatar').textContent = initials;
  document.getElementById('prev-name').textContent   = full || 'Seu nome';
  document.getElementById('prev-email').textContent  = email || 'contato@comunidadealerta.com.br';
  setEl('prev-org',    org);
  setEl('prev-tipo',   tipo ? tipoMap[tipo] : '');
  setEl('prev-regiao', regiao ? regiaoMap[regiao] : '');
  document.getElementById('prev-plano').textContent = planNames[selectedPlan] || 'Profissional';
}

function setTrialDate() {
  const el = document.getElementById('prev-trial');
  if (!el) return;
  const d = new Date();
  d.setDate(d.getDate() + 14);
  el.textContent = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

// Password strength
document.addEventListener('input', e => {
  if (e.target.id !== 'inp-pass') return;
  const v = e.target.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  ['pb1','pb2','pb3','pb4'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'pw-bar';
    if (i < score) el.classList.add(['','weak','fair','good','strong'][score]);
  });
  document.getElementById('pw-hint').textContent = v.length ? ['','Muito fraca','Fraca','Boa','Forte 💪'][score] : 'Use letras, números e caracteres especiais.';
});

// Live preview on input
document.addEventListener('input',  e => { if (['inp-name','inp-sobrenome','inp-email','inp-org'].includes(e.target.id)) updatePreview(); });
document.addEventListener('change', e => { if (['inp-tipo','inp-regiao','inp-size'].includes(e.target.id)) updatePreview(); });

// Step navigation
document.getElementById('btn1').addEventListener('click', () => {
  const name  = document.getElementById('inp-name').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const pass  = document.getElementById('inp-pass').value;
  document.getElementById('f-name').classList.toggle('has-error', !name);
  document.getElementById('f-email').classList.toggle('has-error', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  document.getElementById('f-pass').classList.toggle('has-error', pass.length < 8);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pass.length < 8) return;
  goToStep(2);
});

document.getElementById('btn2').addEventListener('click', () => {
  const org = document.getElementById('inp-org').value.trim();
  document.getElementById('f-org').classList.toggle('has-error', !org);
  if (!org) return;
  setTrialDate();
  goToStep(3);
});

document.getElementById('back2').addEventListener('click', () => goToStep(1));
document.getElementById('back3').addEventListener('click', () => goToStep(2));

document.getElementById('btn3').addEventListener('click', async () => {
  if (!document.getElementById('terms').checked) { showToast('Aceite os Termos de Uso para criar sua conta'); return; }
  const btn = document.getElementById('btn3');
  btn.disabled = true; btn.textContent = 'Criando conta...';

  const name  = (document.getElementById('inp-name')?.value || '').trim();
  const sob   = (document.getElementById('inp-sobrenome')?.value || '').trim();
  const email = (document.getElementById('inp-email')?.value || '').trim();
  const pass  = (document.getElementById('inp-pass')?.value || '');
  const org   = (document.getElementById('inp-org')?.value || '').trim();
  const doc   = (document.getElementById('inp-doc')?.value || '').replace(/\D/g,'');
  const full  = [name, sob].filter(Boolean).join(' ');

  // ── Cria a conta de verdade no backend (POST /api/auth/register) ──
  const r = await apiPost('/auth/register', {
    name: full || name || 'Usuário',
    email,
    password: pass,
    orgName: org,
    cnpjCpf: doc || undefined,
  });
  if (!r || !r.token) {
    showToast(r?.error === 'HTTP 409' ? 'E-mail já cadastrado' : (r?.error || 'Não foi possível criar a conta'));
    btn.disabled = false; btn.textContent = 'Criar conta';
    return;
  }
  const u = r.user || {};
  const plan = u.plan || 'pro';

  saveSession({
    authenticated:  true,
    token:          r.token,
    name:           u.name || full || name || 'Usuário',
    email:          u.email || email,
    org:            org || 'Minha Organização',
    cnpjCpf:        doc || null,
    plan:           plan,
    role:           u.role || 'admin',
    tenantId:       u.tenantId || null,
    'inp-name':     name,
    'inp-sobrenome':sob,
    'inp-email':    email,
    'inp-org':      org,
  });
  if (typeof selectedBillingPlan !== 'undefined') selectedBillingPlan = plan;

  // ── Mostra tela de sucesso ───────────────────────────────
  document.querySelectorAll('#page-register .form-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('stepper').style.display = 'none';
  document.getElementById('reg-success').classList.add('active');
  ['ck1','ck2','ck3','ck4','ck5'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('done'); });
  document.getElementById('success-msg').innerHTML = `Bem-vindo, <strong>${name || 'operador'}</strong>! Seu ambiente está pronto.<br/>Entrando no painel...`;
  btn.disabled = false; btn.textContent = 'Criar conta';
  setTimeout(() => { showPage('dashboard'); if (typeof initDashboard === 'function') initDashboard(); }, 1500);
});

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
window.addEventListener('load', initLanding);
window.addEventListener('load', checkAuthOnLoad);
