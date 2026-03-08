window.__alertsQuickFilter = 'all';
const NEW_NOTIFICATION_WINDOW_HOURS = 24;

function isNotificationFresh(item){
  if(!item) return false;
  if(String(item.source || '').toLowerCase() !== 'notificacao') return false;
  const ts = new Date(item.timestamp || item.time || Date.now()).getTime();
  if(!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs <= (NEW_NOTIFICATION_WINDOW_HOURS * 60 * 60 * 1000);
}

function getFreshnessText(item){
  if(!isNotificationFresh(item)) return '';
  const ts = new Date(item.timestamp || item.time || Date.now()).getTime();
  const remaining = Math.max(0, NEW_NOTIFICATION_WINDOW_HOURS * 60 * 60 * 1000 - (Date.now() - ts));
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if(hours > 0) return `Novo por mais ${hours}h`;
  return `Novo por mais ${Math.max(1, mins)} min`;
}

// ====================== VARIÁVEIS GLOBAIS DE ESTADO ======================
let activityChart;
let currentPage = 1;
const itemsPerPage = 5; // Define quantos alertas serão exibidos por página
let filteredAlerts = [];

// Variáveis para os gráficos de estatísticas (para que possam ser atualizadas)
let alertsByHourChart, alertsByDayChart, alertsByTypeAndNeighborhoodChart, alertsStatusChart;

// Variável para a view de mensagens
let currentMessageId = null;

// Estado da Inbox (filtros e busca)
let currentInboxFilter = 'all'; // all | unread | urgent
let inboxSearchQuery = '';

// Variável com o nome do usuário logado (assumindo do HTML)
const loggedInUserName = "Jefferson Goulart";


// ====================== INBOX – ESTRELAS (persistência simples) ======================
function loadInboxStars(){
  try{
    const raw = localStorage.getItem('inboxStars');
    const ids = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.map(Number).filter(n=>Number.isFinite(n)));
  }catch(e){ return new Set(); }
}

function saveInboxStars(starsSet){
  try{
    const arr = Array.from(starsSet);
    localStorage.setItem('inboxStars', JSON.stringify(arr));
  }catch(e){ /* ignore */ }
}

let inboxStars = loadInboxStars();
let inboxPinned = (function(){
  try{ const raw = localStorage.getItem('inboxPinned'); const ids = raw?JSON.parse(raw):[]; return new Set(Array.isArray(ids)?ids.map(Number):[]);}catch(e){return new Set();}
})();
function saveInboxPinned(){ try{ localStorage.setItem('inboxPinned', JSON.stringify(Array.from(inboxPinned))); }catch(e){} }

let inboxStatus = (function(){
  try{ const raw = localStorage.getItem('inboxStatus'); const obj = raw?JSON.parse(raw):{}; return (obj && typeof obj==='object')?obj:{}; }catch(e){return {};}
})();
function saveInboxStatus(){ try{ localStorage.setItem('inboxStatus', JSON.stringify(inboxStatus)); }catch(e){} }

let inboxPriority = (function(){
  try{ const raw = localStorage.getItem('inboxPriority'); const obj = raw?JSON.parse(raw):{}; return (obj && typeof obj==='object')?obj:{}; }catch(e){return {};}
})();
function saveInboxPriority(){ try{ localStorage.setItem('inboxPriority', JSON.stringify(inboxPriority)); }catch(e){} }


let inboxSnoozed = (function(){
  try{ const raw = localStorage.getItem('inboxSnoozed'); const obj = raw?JSON.parse(raw):{}; return (obj && typeof obj==='object')?obj:{}; }catch(e){return {};}
})();
function saveInboxSnoozed(){ try{ localStorage.setItem('inboxSnoozed', JSON.stringify(inboxSnoozed)); }catch(e){} }


let inboxSelected = new Set();
let inboxTrash = (function(){
  try{ const raw = localStorage.getItem('inboxTrash'); const ids = raw?JSON.parse(raw):[]; return new Set(Array.isArray(ids)?ids.map(Number):[]);}catch(e){return new Set();}
})();
function saveInboxTrash(){ try{ localStorage.setItem('inboxTrash', JSON.stringify(Array.from(inboxTrash))); }catch(e){} }

let inboxArchived = (function(){
  try{ const raw = localStorage.getItem('inboxArchived'); const ids = raw?JSON.parse(raw):[]; return new Set(Array.isArray(ids)?ids.map(Number):[]);}catch(e){return new Set();}
})();
function saveInboxArchived(){ try{ localStorage.setItem('inboxArchived', JSON.stringify(Array.from(inboxArchived))); }catch(e){} }
let currentInboxTab = 'all';




// =================================================
// ALERTAS – SINCRONIZAR COM NOTIFICAÇÕES (EXEMPLO)
// =================================================
function ensureAlertsDataSeeded() {
  if (Array.isArray(alertsData) && alertsData.length) return;
  if (!Array.isArray(notificationsData) || !notificationsData.length) return;

  alertsData = notificationsData.map(n => ({
    id: n.id,
    type: n.type || 'info',
    title: n.title || 'Alerta',
    location: n.location || '',
    status: n.status || 'Info',
    description: n.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.',
    timestamp: n.timestamp || new Date(),
    read: n.read ?? false
  }));
}


document.addEventListener('DOMContentLoaded', function() {
  setupAlertsQuickFilters();
  normalizeDemoTimestamps();
  // 1. Toggle Sidebar
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('show');
    });
  }

  // 2. Setup Navigation
  setupNavigation();
  setupAlertItemClickListener();
  setupMessageViewListener(); 
  setupAllMessagesViewListener();
  setupInboxFiltersAndSearch();
  setupInboxTabs();
  setupSnoozeModal();
  setupPriorityThreshold();
  setupInboxBulkActions();
  setupAlertsListInteractions();
  setupMobileInboxControls(); // NOVO: Listener para o botão "Voltar" do inbox mobile

  // 3. Initialize All Charts
  initializeActivityChart();
  initializeAlertTypesChart();
  initializeCrimeTrendsChart();
  initializeNetworkEngagementChart();
  initializeStatisticsCharts(); 

  ensureAlertsDataSeeded();

  // 4. Render Dynamic Content
  renderRecentAlerts();
  renderSystemUpdates();
  renderNotifications(); 
  updateNotificationBadges(); 
  renderMessages(); 
  updateMessageBadge();
      syncInboxToNotifications(); 

  // 5. Setup UI Components
  setupMessagesDropdown();
  setupHeaderMessagesItemsRedirect();
  setupNotificationsDropdown();
  setupNotifsCenter();
  setupNotificationsItemsRedirect();
  setupThemeToggle();
  setupLogout();
  setupQuickActions(); 
  setupActivityPeriodSelector();
  setupAlertFilters();
  setupPagination();
  setupStatisticsFilters();
  setupSettingsPage();
  setupGlobalSearch(); // NOVO: Listener para a busca global
  initializeOnboardingTour(); // NOVO: Inicializa o tour para novos usuários

  // 6. INICIALIZAÇÃO DE TODOS OS TOOLTIPS NA PÁGINA
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

  // 7. Show initial view
  showView('dashboard');
  
  // 8. Iniciar atualizações dinâmicas
  setInterval(updateAlerts, 15000); 
  setInterval(updateNewMembers, 25000);
});

// ====================== NAVEGAÇÃO E CONTROLE DE VIEWS ======================
function showView(viewId) {
  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.add('d-none');
  });

  const targetView = document.getElementById(viewId + '-view');
  if (targetView) {
    targetView.classList.remove('d-none');
  }

  // Lógica para ativar o link correto na sidebar (incluindo submenus)
  document.querySelectorAll('.sidebar-nav li').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    if (link.dataset.view === viewId) {
      // Ativa o 'li' pai direto
      if (link.parentElement.tagName === 'LI') {
        link.parentElement.classList.add('active');
      }
      
      // Se for um item de submenu, expande o menu pai e o ativa também
      const submenu = link.closest('.collapse');
      if (submenu) {
        const submenuTrigger = document.querySelector(`[data-bs-target="#${submenu.id}"]`);
        if (submenuTrigger) {
          submenuTrigger.setAttribute('aria-expanded', 'true');
          submenu.classList.add('show');
          if (submenuTrigger.parentElement.tagName === 'LI') {
             submenuTrigger.parentElement.classList.add('active');
          }
        }
      }
    }
  });


  // Lógica específica para cada view
  if (viewId === 'alerts-list') {
    document.getElementById('alert-search-input').value = '';
    document.getElementById('alert-type-filter').value = 'all';
    document.getElementById('alert-status-filter').value = 'all';
    filteredAlerts = [...alertsData];
    if (typeof setupAlertsQuickFilters === 'function') setupAlertsQuickFilters();
    displayPage(1);
  } else if (viewId === 'community') {
    renderDistributionAndActivity();
  } else if (viewId === 'statistics') {
    document.getElementById('stats-period-filter').dispatchEvent(new Event('change'));
  } else if (viewId === 'messages') {
      // ALTERADO: Ao entrar na view, não entra direto na mensagem.
      currentMessageId = null; 
      clearSelection();
      renderAllMessagesList();
      syncInboxToNotifications();
      renderMessageDetail(currentMessageId); // Mostra o placeholder (painel vazio)
      // Reset a classe do mobile caso o usuário navegue para a view em desktop
      document.querySelector('.messages-layout-card').classList.remove('mobile-message-open');
  }
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const viewId = this.dataset.view;
      
      const openDropdowns = document.querySelectorAll('.notifications-list, .messages-list');
      openDropdowns.forEach(d => { d.classList.remove('is-open'); d.setAttribute('hidden',''); });
      const notifBtn = document.getElementById('notification-btn');
      const msgBtn = document.getElementById('message-btn');
      if (notifBtn) notifBtn.setAttribute('aria-expanded','false');
      if (msgBtn) msgBtn.setAttribute('aria-expanded','false');
      
      showView(viewId);
    });
  });
}

function setupAlertItemClickListener() {
    const container = document.getElementById('recent-alerts-container');
    if (!container) return;

    container.addEventListener('click', function(e) {
        const alertItem = e.target.closest('.alert-item-clickable');
        if (!alertItem) return;

        if (e.target.closest('button, a')) return;
        
        const alertId = Number(alertItem.dataset.alertId);
        const alertData = alertsData.find(a => a.id === alertId);
    });
}

// NOVO: Listener para a busca global
function setupGlobalSearch() {
    const searchInput = document.getElementById('search-input');
    if(!searchInput) return;

    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value;
        const alertListInput = document.getElementById('alert-search-input');
        
        // Se o usuário começar a digitar na busca global, a gente replica na busca da lista de alertas e muda para a view
        if(alertListInput) {
            alertListInput.value = searchTerm;
            // Dispara o evento de input na busca da lista para que ela filtre
            alertListInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Se o usuário não estiver na tela de alertas, leva ele para lá
        const alertsViewEl = document.getElementById('alerts-list-view');
        const isAlertsViewActive = alertsViewEl ? !alertsViewEl.classList.contains('d-none') : false;
        if (!isAlertsViewActive) {
            showView('alerts-list');
        }
    });
}


// ====================== AÇÕES RÁPIDAS E MODALS ======================

function showToast(message, title = 'Sucesso', type = 'success') {
  const toastEl = document.getElementById('actionToast');
  if (!toastEl) return;

  const toastHeader = toastEl.querySelector('.toast-header');
  const toastTitle = toastEl.querySelector('.me-auto');
  const toastIcon = toastEl.querySelector('.toast-header i');
  const toastBody = toastEl.querySelector('.toast-body');

  toastBody.textContent = message;
  toastTitle.textContent = title;

  const icons = {
    success: 'fa-check-circle text-success',
    info: 'fa-info-circle text-info',
    warning: 'fa-exclamation-triangle text-warning',
    danger: 'fa-exclamation-circle text-danger'
  };
  toastIcon.className = `fas ${icons[type] || icons['info']} me-2`;
  
  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

function setupQuickActions() {
    const handleFormSubmit = (form, submitButton) => {
        submitButton.classList.add('loading');
        submitButton.disabled = true;

        // Simula um delay de rede de 1.5 segundos
        setTimeout(() => {
            const modalEl = form.closest('.modal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            submitButton.classList.remove('loading');
            submitButton.disabled = false;
            
            // Lógica específica após o "sucesso"
            if (form.id === 'novoAlertaForm') {
                const tipo = document.getElementById('alertaTipo').value;
                const bairro = document.getElementById('alertaBairro').value;
                const endereco = document.getElementById('alertaEndereco').value;
                const descricao = document.getElementById('alertaDescricao').value;
                const alertDetailsMap = { crime: { title: 'Assalto reportado', type: 'danger', icon: 'fa-mask' }, arrastao: { title: 'Arrastão Reportado', type: 'danger', icon: 'fa-users' }, tiroteio: { title: 'Tiroteio Reportado', type: 'danger', icon: 'fa-bullseye' }, acidente: { title: 'Acidente de trânsito', type: 'warning', icon: 'fa-car-crash' }, suspeito: { title: 'Pessoa/Veículo Suspeito', type: 'info', icon: 'fa-eye' }, ordem: { title: 'Perturbação da Ordem', type: 'warning', icon: 'fa-volume-up' }, policial: { title: 'Ação Policial', type: 'info', icon: 'fa-shield-alt' } };
                const details = alertDetailsMap[tipo] || alertDetailsMap['crime'];
                const newAlert = { id: Date.now(), type: details.type, icon: details.icon, title: details.title, location: `${bairro} - ${endereco}`, time: new Date(), description: descricao, bo_number: '', status: 'novo', isLocked: false, read: false, coords: [-22.9845, -43.2206] }; // Coordenada padrão (Leblon)
                alertsData.unshift(newAlert);
                renderRecentAlerts();
                showToast('Novo alerta adicionado à lista!', 'Sucesso', 'success');
            } else if (form.id === 'emitirComunicadoForm') {
                showToast('Comunicado genérico emitido com sucesso!', 'Comunicado Enviado', 'success');
            } else if (form.id === 'convidarMembroForm') {
                showToast('Convite enviado com sucesso!', 'Sucesso', 'success');
            }
            
            form.reset();

        }, 1500);
    };

    document.querySelectorAll('.modal form').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                handleFormSubmit(form, submitButton);
            }
        });
    });

    // Lógica antiga do modal de comunicado (apenas o setup, sem o submit)
    const comunicadoModalEl = document.getElementById('emitirComunicadoModal');
    if (comunicadoModalEl) {
        comunicadoModalEl.addEventListener('show.bs.modal', function (event) {
            const triggerElement = event.relatedTarget;
            const modalTitle = document.getElementById('emitirComunicadoModalLabel');
            const submitButton = document.getElementById('submit-comunicado');
            const resumoContainer = document.getElementById('comunicadoResumoContainer');
            const formContainer = document.getElementById('comunicadoFormContainer');
            
            const chatContainer = document.getElementById('comunicado-chat-container');
            const chatDivider = document.getElementById('comunicado-chat-divider');
            const templateSelect = document.getElementById('comunicadoTemplate');

            if (triggerElement && triggerElement.hasAttribute('data-alert-id')) {
                modalTitle.textContent = 'Resumo e Ações do Alerta';
                resumoContainer.classList.remove('d-none');
                formContainer.classList.add('d-none');
                submitButton.style.display = 'none';
                chatContainer.classList.remove('d-none');
                chatDivider.classList.remove('d-none');

                const alertId = Number(triggerElement.dataset.alertId);
                const alertData = alertsData.find(a => a.id === alertId);

                if (alertData) {
                    resumoContainer.innerHTML = `
                        <h4 class="mb-3">${alertData.title}</h4>
                        <p><strong><i class="fas fa-map-marker-alt fa-fw me-2"></i>Local:</strong> ${alertData.location}</p>
                        <p><strong><i class="fas fa-clock fa-fw me-2"></i>Horário:</strong> ${formatFullDateTime(alertData.time)}</p>
                        <p><strong><i class="fas fa-info-circle fa-fw me-2"></i>Status:</strong> <span class="badge bg-${alertData.type}">${alertData.status.charAt(0).toUpperCase() + alertData.status.slice(1)}</span></p>
                        ${alertData.bo_number ? `<p><strong><i class="fas fa-file-alt fa-fw me-2"></i>B.O. Vinculado:</strong> ${alertData.bo_number}</p>` : ''}
                        <hr>
                        <h5><strong>Relato Detalhado</strong></h5>
                        <p class="fst-italic">${alertData.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.'}</p>
                        <hr>
                        <h5>Ações Rápidas</h5>
                        
                        
                        
                    `;
                }
            } else {
                modalTitle.textContent = 'Emitir Comunicado Genérico';
                formContainer.classList.remove('d-none');
                resumoContainer.classList.add('d-none');
                submitButton.style.display = 'block';
                chatContainer.classList.add('d-none');
                chatDivider.classList.add('d-none');
                if (document.getElementById('emitirComunicadoForm')) {
                    document.getElementById('emitirComunicadoForm').reset();
                }
            }

            templateSelect.addEventListener('change', function() {
                const templateText = { arrastao: "ATENÇÃO REDE! Relatos de arrastão em andamento na praia, na altura de [LOCAL]. Evitem a área e permaneçam em segurança. Autoridades já foram notificadas.", tiroteio_comunidade: "ALERTA! Relatos de disparos de arma de fogo na comunidade [NOME DA COMUNIDADE]. Moradores, procurem abrigo. Evitem janelas e áreas abertas.", transito_operacao: "AVISO DE TRÂNSITO: Via [NOME DA RUA/AVENIDA] se encontra interditada para operação policial. Busquem rotas alternativas.", };
                const mensagemTextarea = document.getElementById('comunicadoMensagem');
                if(this.value && templateText[this.value]) {
                    mensagemTextarea.value = templateText[this.value];
                }
            });
        });
    }
}


// ALTERADO: Lógica da página de configurações para incluir a confirmação de desativação
function setupSettingsPage() {
    const settingsView = document.getElementById('settings-view');
    if (!settingsView) return;

    // ... (código existente das abas e formulários) ...

    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Perfil atualizado com sucesso!', 'Sucesso', 'success');
        });
    }

    const notificationsForm = document.getElementById('notifications-form');
    if(notificationsForm) {
        notificationsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Preferências de notificação salvas!', 'Sucesso', 'success');
        });
    }

    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Senha alterada com sucesso!', 'Sucesso', 'success');
            passwordForm.reset();
        });
    }
    const themeRadios = document.querySelectorAll('input[name="themeSelection"]');
    const currentTheme = localStorage.getItem('theme') || 'system';
    const radioToCheck = document.querySelector(`input[name="themeSelection"][value="${currentTheme}"]`);
    if(radioToCheck) {
        radioToCheck.checked = true;
    }
    
    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            localStorage.setItem('theme', newTheme);
            setupThemeToggle();
            showToast('Tema atualizado!', 'Sucesso', 'success');
        });
    });

    // NOVO: Lógica para a Zona de Perigo (Desativar Conta)
    const deactivateInput = document.getElementById('deactivate-confirm');
    const deactivateBtn = document.getElementById('deactivate-btn');

    if (deactivateInput && deactivateBtn) {
        deactivateInput.addEventListener('input', () => {
            if (deactivateInput.value === 'DESATIVAR') {
                deactivateBtn.disabled = false;
            } else {
                deactivateBtn.disabled = true;
            }
        });

        deactivateBtn.addEventListener('click', () => {
            // Em uma aplicação real, aqui ocorreria a chamada para a API de desativação
            showToast('Conta desativada. Você será desconectado.', 'Ação Concluída', 'danger');
            // Simula o logout após a desativação
            setTimeout(() => {
                 document.querySelector('.logout-btn').click();
            }, 2000);
        });
    }
}


// ====================== DYNAMIC CONTENT FUNCTIONS ======================

// MODIFICADO: Lista de alertas vazia
let alertsData = [];

// =================================================
// NOTIFICAÇÕES (EXEMPLO) – ALERTAS DO SISTEMA
// =================================================
const notificationsData = [
  {
    id: 201,
    type: 'Segurança',
    title: 'Operação policial confirmada',
    location: 'Leblon • Av. Bartolomeu Mitre',
    status: 'Urgente',
    description: 'Interdição parcial e tráfego lento próximo ao túnel Zuzu Angel. Recomendamos rotas alternativas.',
    timestamp: new Date(Date.now() - 1000 * 60 * 12), // 12 min atrás
    read: false
  },
  {
    id: 202,
    type: 'Trânsito',
    title: 'Bloqueio viário em andamento',
    location: 'Ipanema • R. Barão da Torre',
    status: 'Atenção',
    description: 'Fluxo carregado e desvios recomendados no entorno da Praça N. Sra. da Paz.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 min atrás
    read: false
  },
  {
    id: 203,
    type: 'Sistema',
    title: 'Dashboard atualizado',
    location: 'Comunidade Alerta',
    status: 'Info',
    description: 'Mapa maior, prioridades e melhorias no mobile. Veja as novidades na Caixa de Entrada.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3h atrás
    read: true
  }
];


// MODIFICADO: Lista de membros vazia
let membersData = [];

// MODIFICAÇÃO SOLICITADA: Todas as 3 mensagens estão agora marcadas como NÃO LIDAS (read: false) e são recentes.
let messagesData = [
    { id: 1, senderName: 'Central de Alertas', senderAvatar: 'img/logo.svg', senderRole: 'Sistema', timestamp: Date.now(),    subject: 'ALERTA URGENTE: Operação policial e interdição parcial na Av. Bartolomeu Mitre', type: { text: 'Urgente', class: 'bg-danger' }, snippet: 'Operação confirmada na Bartolomeu Mitre: interdição parcial, tráfego lento e rotas alternativas.', fullText: `Olá, ${loggedInUserName},

📍 Local: Av. Bartolomeu Mitre (Leblon) — próximo ao túnel Zuzu Angel
🕒 Status: Operação policial confirmada • Interdição parcial • Trânsito lento

Identificamos um aumento súbito no volume de alertas de segurança e mobilidade na região. Relatos da comunidade indicam presença intensa de viaturas e pontos de bloqueio.

O que isso significa agora:
• Lentidão forte e possíveis desvios obrigatórios
• Risco elevado para deslocamentos próximos ao túnel

Ação recomendada (Admin da rede):
1) Envie um “Comunicado Genérico” orientando a evitar a área
2) Sugira rotas alternativas (Jardim Botânico / Lagoa / vias internas)
3) Monitore o alerta original em “Alertas” para decidir quando desativar

Observação adicional: o cenário pode evoluir rapidamente conforme novas confirmações oficiais.
Recomendamos manter notificações ativas para atualizações em tempo real.

Atualizado há poucos instantes pelo sistema de monitoramento.`, attachments: [], read: false },
    { id: 2, senderName: 'Central de Alertas', senderAvatar: 'img/logo.svg', senderRole: 'Sistema', timestamp: Date.now(),    subject: 'MUDANÇA DE ROTA: Bloqueio viário em Ipanema (R. Barão da Torre)', type: { text: 'Urgente', class: 'bg-danger' }, snippet: 'Bloqueio em Ipanema (Barão da Torre): trânsito carregado e desvios recomendados.', fullText: `Olá, ${loggedInUserName},

📍 Local: Ipanema — R. Barão da Torre (próx. Praça N. Sra. da Paz)
🕒 Status: Bloqueio viário em andamento • Trânsito carregado

Recebemos confirmação de bloqueio viário ligado a uma operação policial em curso. A área apresenta retenções e mudanças rápidas no fluxo de tráfego.

Impacto esperado:
• Redução de faixa / interdição parcial
• Aumento de tempo de deslocamento no entorno

Recomendação:
• Evite a R. Barão da Torre nas próximas horas
• Prefira rotas via Jardim Botânico / Lagoa, quando aplicável
• Acompanhe os alertas em tempo real na seção “Alertas”

Observação adicional: o cenário pode evoluir rapidamente conforme novas confirmações oficiais.
Recomendamos manter notificações ativas para atualizações em tempo real.

Atualizado há poucos instantes pelo sistema de monitoramento.`, attachments: [], read: false },
    { id: 3, senderName: 'Comunidade Alerta', senderAvatar: 'img/logo.svg', senderRole: 'Sistema', timestamp: Date.now(),    subject: 'Dashboard atualizado: mapa maior, prioridades e melhorias no mobile', type: { text: 'Anúncio', class: 'bg-success' }, snippet: 'Mapa maior, prioridades e melhorias no mobile — veja o que mudou.', fullText: `Olá, ${loggedInUserName},

Atualizamos o seu Dashboard para uma experiência mais rápida, clara e completa. ✅

Novidades desta versão:
• Mapa maior e com carregamento otimizado
• Resumo de incidentes por bairro e tendências
• Mensagens do sistema com prioridade (Normal / Urgente)
• Melhor leitura no mobile (Caixa de Entrada e Alertas)

Como tirar proveito agora:
• Use os filtros da Caixa de Entrada (Todas / Não lidas / Urgentes)
• Acompanhe ocorrências em “Alertas” para decisões rápidas

Observação adicional: o cenário pode evoluir rapidamente conforme novas confirmações oficiais.
Recomendamos manter notificações ativas para atualizações em tempo real.

Atualizado há poucos instantes pelo sistema de monitoramento.`, attachments: [], read: false }
];

// MODIFICADO: Lista de novos alertas vazia (já que não vamos ter alertas)
const potentialNewAlerts = [];

// MODIFICADO: Lista de novos membros vazia
const potentialNewMembers = [];

// ... (funções de formatação de data, renderização de alertas/membros, etc) ...
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return "há " + Math.floor(interval) + " anos";
    interval = seconds / 2592000;
    if (interval > 1) return "há " + Math.floor(interval) + " meses";
    interval = seconds / 86400;
    if (interval > 1) return "há " + Math.floor(interval) + " dias";
    interval = seconds / 3600;
    if (interval > 1) return "há " + Math.floor(interval) + " horas";
    interval = seconds / 60;
    if (interval > 1) return "há " + Math.floor(interval) + " minutos";
    return "agora mesmo";
}
function formatFullDateTime(date) {
    if (!date || !(date instanceof Date)) return 'Data inválida';
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// MODIFICADO: Agora mostra mensagem de "Nenhum alerta recente" com ícone
function renderRecentAlerts() {
  ensureAlertsDataSeeded();
  const container = document.getElementById('recent-alerts-container');
  if (!container) return;

  const items = Array.isArray(alertsData) ? alertsData.slice() : [];
  items.sort((a,b) => new Date(b.timestamp||0) - new Date(a.timestamp||0));
  const recent = items.slice(0, 2);

  if (recent.length === 0) {
    container.innerHTML = `
      <li class="p-3 text-center text-muted" style="list-style:none;">
        <i class="fas fa-bell-slash fa-2x mb-2"></i>
        <p class="mb-0">Nenhum alerta recente registrado.</p>
        <small class="text-muted">Os novos alertas aparecerão aqui quando forem criados.</small>
      </li>
    `;
    return;
  }

  const typeToIcon = (t) => {
    const s = String(t||'').toLowerCase();
    if (s.includes('seg') || s.includes('crime') || s.includes('pol')) return {bg:'bg-danger', icon:'fa-shield-halved'};
    if (s.includes('trân') || s.includes('trans') || s.includes('warning')) return {bg:'bg-warning', icon:'fa-road'};
    return {bg:'bg-info', icon:'fa-circle-info'};
  };

  let html = '';
  recent.forEach(a => {
    const meta = typeToIcon(a.type);
    const when = formatTimeAgo(new Date(a.timestamp||Date.now()));
    html += `
      <li>
        <a href="#" class="alert-item-clickable" data-view="alerts-list">
          <div class="alert-icon ${meta.bg}">
            <i class="fas ${meta.icon}" aria-hidden="true"></i>
          </div>
          <div class="alert-content">
            <h4 class="alert-title">${a.title || 'Alerta'}</h4>
            <p class="alert-description">${a.location || ''}</p>
            <small class="alert-time">${when}</small>
          </div>
        </a>
      </li>
    `;
  });
  container.innerHTML = html;
}


// MODIFICADO: Função renderSystemUpdates corrigida para combinar visualmente com Alertas Recentes
function renderSystemUpdates() {
  const container = document.getElementById('system-updates-container');
  if (!container) return;

  const updates = [
    {
      iconBg: 'bg-info',
      icon: 'fa-wand-magic-sparkles',
      title: 'Melhorias no Dark Mode (Clean)',
      desc: 'Ajustamos contraste, bordas e estados de hover para uma leitura mais confortável.',
      timestamp: new Date(Date.now() - 1000 * 60 * 35) // 35 min atrás
    },
    {
      iconBg: 'bg-primary',
      icon: 'fa-bell',
      title: 'Notificações sincronizadas com Alertas',
      desc: 'Os alertas do header agora aparecem em “Alertas Recentes” e na lista de Alertas.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4) // 4h atrás
    }
  ];

  let html = '';
  updates.forEach(u => {
    const when = typeof formatTimeAgo === 'function' ? formatTimeAgo(u.timestamp) : 'Agora';
    html += `
      <li>
        <a href="#" class="alert-item-clickable" data-view="messages">
          <div class="alert-icon ${u.iconBg}">
            <i class="fas ${u.icon}" aria-hidden="true"></i>
          </div>
          <div class="alert-content">
            <h4 class="alert-title">${u.title}</h4>
            <p class="alert-description">${u.desc}</p>
            <small class="alert-time">${when}</small>
          </div>
        </a>
      </li>
    `;
  });

  container.innerHTML = html;
}

// ... (código existente das views de mensagens, notificações, etc) ...
function markNotificationsAsRead() {
    // Pega apenas os 5 primeiros alertas, a mesma lógica da renderNotifications
    const alertsToMark = alertsData.slice(0, 5);
    alertsToMark.forEach(alert => {
        if (!alert.read) {
            alert.read = true;
        }
    });
    updateNotificationBadges(); // Atualiza o contador
}
function updateNotificationBadges() { 
    // Conta todas as mensagens não lidas
    const unreadMessagesCount = messagesData.filter(m => !m.read).length; 
    // Conta alertas não resolvidos e não lidos
    const unreadAlertsCount = alertsData.filter(a => a.status !== 'resolvido' && !a.read).length; 
    
    const sidebarAlertsBadge = document.getElementById('sidebar-alerts-badge'); 
    const headerAlertsBadge = document.getElementById('header-notifications-badge'); 
    const sidebarMessagesBadge = document.getElementById('sidebar-messages-badge');
    const headerMessagesBadge = document.getElementById('header-messages-badge');

    // Atualiza badges de alertas
    if (sidebarAlertsBadge && headerAlertsBadge) { 
        if (unreadAlertsCount > 0) { 
            sidebarAlertsBadge.textContent = unreadAlertsCount; 
            headerAlertsBadge.textContent = unreadAlertsCount; 
            sidebarAlertsBadge.style.display = ''; 
            headerAlertsBadge.style.display = ''; 
        } else { 
            sidebarAlertsBadge.style.display = 'none'; 
            headerAlertsBadge.style.display = 'none'; 
        } 
    } 
    
    // Atualiza badges de mensagens (Nova lógica para ser separada)
    if (sidebarMessagesBadge && headerMessagesBadge) { 
        if (unreadMessagesCount > 0) { 
            sidebarMessagesBadge.textContent = unreadMessagesCount; 
            headerMessagesBadge.textContent = unreadMessagesCount; 
            sidebarMessagesBadge.style.display = ''; 
            headerMessagesBadge.style.display = ''; 
        } else { 
            sidebarMessagesBadge.style.display = 'none'; 
            headerMessagesBadge.style.display = 'none'; 
        } 
    }
}

// MODIFICADO: Mostra mensagem de "Nenhuma notificação recente"
function renderNotifications() {
  ensureAlertsDataSeeded();
    const container = document.getElementById('notifications-ul');
    if (!container) return;
    
    // Mostra mensagem de não há notificações
    container.innerHTML = `
        <li>
            <div class="notification-item">
                <div class="alert-icon bg-secondary"><i class="fas fa-bell-slash"></i></div>
                <div class="notification-content">
                    <p class="mb-1 text-muted">Nenhuma notificação recente.</p>
                    <small class="text-muted">As notificações aparecerão aqui quando houver novas atividades.</small>
                </div>
            </div>
        </li>
    `;
}

// ATUALIZADO: Renderiza as mensagens (snippet/dropdown)
function renderMessages() {
    const container = document.getElementById('messages-ul');
    if (!container) return;
    let messagesHTML = '';
    if (messagesData.length === 0) {
        container.innerHTML = `<li><p class="p-3 text-center text-muted">Nenhuma mensagem.</p></li>`;
        return;
    }
    messagesData.forEach(message => {
        const unreadClass = !message.read ? 'unread' : '';
        const urgentClass = (message.type && String(message.type.text).toLowerCase() === 'urgente') ? 'urgent' : ''; 
        // Usando o senderName (Central de Alertas ou Comunidade Alerta)
        const senderDisplay = message.senderName; 

        messagesHTML += `
            <li>
                <a href="#" class="text-decoration-none message-item-link" data-message-id="${message.id}">
                    <div class="message-item ${unreadClass}">
                        <img src="${message.senderAvatar}" alt="Avatar de ${message.senderName}">
                        <div class="message-content">
                            <p class="mb-1" style="color: var(--dark-color);">${senderDisplay}: <span class="fw-normal">${message.snippet}</span></p>
                            <small class="text-muted">${formatTimeAgo(message.timestamp)}</small>
                        </div>
                    </div>
                </a>
            </li>
        `;
    });
    container.innerHTML = messagesHTML;

    updateInboxCounts();
}

// ATUALIZADO: Agora também controla o badge do menu lateral
function updateMessageBadge() { 
    const unreadCount = messagesData.filter(m => !m.read).length;
    const badges = [
        document.getElementById('header-messages-badge'),
        document.getElementById('sidebar-messages-badge') 
    ];

    badges.forEach(badge => {
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

// ATUALIZADO: Listener para a visualização da mensagem no Modal
function setupMessageViewListener() { 
    const viewMessageModal = document.getElementById('viewMessageModal'); 
    if (!viewMessageModal) return; 
    
    viewMessageModal.addEventListener('show.bs.modal', function(event) { 
        const triggerElement = event.relatedTarget; 
        const messageId = Number(triggerElement.getAttribute('data-message-id')); 
        const message = messagesData.find(m => m.id === messageId); 
        
        if (!message) return; 

        // Usando o senderName (Central de Alertas ou Comunidade Alerta)
        const senderDisplay = message.senderName;

        document.getElementById('viewMessageModalLabel').textContent = message.subject; 
        document.getElementById('message-sender-avatar').src = message.senderAvatar; 
        document.getElementById('message-sender-name-role').innerHTML = `${senderDisplay} <small class="text-muted fw-normal">(${message.senderRole})</small>`; 
        document.getElementById('message-timestamp').textContent = `Enviado em: ${formatFullDateTime(message.timestamp)}`; 
        document.getElementById('message-full-text').textContent = message.fullText; 
        
        const typeContainer = document.getElementById('message-type-badge-container'); 
        typeContainer.innerHTML = `<span class="badge ${message.type.class}">${message.type.text}</span>`; 
        
        const attachmentsContainer = document.getElementById('message-attachments-container'); 
        const attachmentsList = document.getElementById('message-attachments-list'); 
        attachmentsList.innerHTML = ''; 
        
        if (message.attachments && message.attachments.length > 0) { 
            let attachmentsHTML = ''; 
            message.attachments.forEach(file => { 
                attachmentsHTML += ` 
                    <li class="mb-1"> 
                        <a href="#" class="text-decoration-none"> 
                            <i class="fas fa-paperclip me-2 text-muted"></i> ${file.fileName} <span class="text-muted small">(${file.fileSize})</span> 
                        </a> 
                    </li> 
                `; 
            }); 
            attachmentsList.innerHTML = attachmentsHTML; 
            attachmentsContainer.style.display = 'block'; 
        } else { 
            attachmentsContainer.style.display = 'none'; 
        } 
        
        if (!message.read) { 
            message.read = true; 
            updateMessageBadge();
      syncInboxToNotifications(); 
            renderMessages(); // Atualiza a lista de snippets (dropdown)
            renderAllMessagesList(); // Atualiza a lista lateral completa
        } 
    }); 
}

// ATUALIZADO: Listener para a visualização da mensagem na lista completa


function setupMobileInboxControls() {
    const messageDetailContainer = document.getElementById('message-detail-view-container');
    if (!messageDetailContainer) return;

    // Listener para o botão "voltar"
    messageDetailContainer.addEventListener('click', function(e) {
        if (e.target.closest('#back-to-inbox-list-btn')) {
            document.querySelector('.messages-layout-card').classList.remove('mobile-message-open');
        }
        
        // NOVO: Adiciona listener para as novas ações do menu
        const actionButton = e.target.closest('[data-message-action]');
        if (actionButton) {
            const action = actionButton.dataset.messageAction;
            const messageId = currentMessageId; 
            if (messageId !== null) {
                handleMessageAction(messageId, action);
                // Fecha o dropdown após a ação
                const dropdown = actionButton.closest('.dropdown-menu');
                if (dropdown) {
                    new bootstrap.Dropdown(dropdown.previousElementSibling).hide();
                }
            }
        }
    });
}

// Retorna mensagens visíveis na caixa de entrada, aplicando busca e filtros
function getInboxVisibleMessages() {
    // Base: remove arquivadas/excluídas
    let list = messagesData.filter(m => !m.isArchived && !m.isDeleted);

    // Busca (por remetente, assunto e snippet)
    const q = (inboxSearchQuery || '').trim().toLowerCase();
    if (q) {
        list = list.filter(m => {
            const sender = (m.senderName || '').toLowerCase();
            const subject = (m.subject || '').toLowerCase();
            const snippet = (m.snippet || '').toLowerCase();
            return sender.includes(q) || subject.includes(q) || snippet.includes(q);
        });
    }

    // Filtros
    if (currentInboxFilter === 'unread') {
        list = list.filter(m => !m.read);
    } else if (currentInboxFilter === 'urgent') {
        list = list.filter(m => (m.type && String(m.type.text).toLowerCase() === 'urgente'));
    }

    // Ordenação: não lidas primeiro, depois mais recentes
    return [...list].sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        const at = new Date(a.timestamp).getTime();
        const bt = new Date(b.timestamp).getTime();
        return bt - at;
    });
}


// Ativa/desativa UI dos botões de filtro
function setInboxFilterUI(filterValue) {
    const buttons = document.querySelectorAll('.inbox-filter');
    buttons.forEach(btn => {
        const isActive = (btn.dataset.filter || '').toLowerCase() === filterValue;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

// Listeners para filtros e busca

// =================================================
// INBOX – CONTADORES (NÃO LIDAS / URGENTES / TOTAL)
// =================================================
function updateInboxCounts() {
  const baseList = messagesData.filter(m => !m.isArchived && !m.isDeleted);
  const unread = baseList.filter(m => !m.read).length;
  const urgent = baseList.filter(m => (m.type && String(m.type.text).toLowerCase() === 'urgente')).length;
  const all = baseList.length;

  // Counts nos botões (mostra apenas se > 0)
  document.querySelectorAll('.filter-count').forEach(span => {
    const k = (span.dataset.count || '').toLowerCase();
    let v = 0;
    if (k === 'unread') v = unread;
    else if (k === 'urgent') v = urgent;
    else if (k === 'all') v = all;
    span.textContent = v ? String(v) : '';
    span.style.display = v ? 'inline-flex' : 'none';
  });
}


function setupInboxFiltersAndSearch() {
    const searchInput = document.getElementById('inbox-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            inboxSearchQuery = searchInput.value || '';
            renderAllMessagesList();

            // Se a mensagem atual sumiu do filtro/busca, limpa o detalhe
            const visibleIds = new Set(getInboxVisibleMessages().map(m => m.id));
            if (currentMessageId !== null && !visibleIds.has(currentMessageId)) {
                currentMessageId = null;
                renderMessageDetail(null);
                const card = document.querySelector('.messages-layout-card');
                if (card) card.classList.remove('mobile-message-open');
            }
        });
    }

    document.querySelectorAll('.inbox-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = (btn.dataset.filter || 'all').toLowerCase();
            currentInboxFilter = filter;
            setInboxFilterUI(filter);
            renderAllMessagesList();

            // Se a mensagem atual sumiu do filtro, limpa o detalhe
            const visibleIds = new Set(getInboxVisibleMessages().map(m => m.id));
            if (currentMessageId !== null && !visibleIds.has(currentMessageId)) {
                currentMessageId = null;
                renderMessageDetail(null);
                const card = document.querySelector('.messages-layout-card');
                if (card) card.classList.remove('mobile-message-open');
            }
        });
    });

    // Garante que UI inicie consistente
    setInboxFilterUI(currentInboxFilter);
}

// ALTERADO: Renderiza a lista lateral completa (removendo avatar e ajustando foco no título)


// ATUALIZADO: Renderiza a mensagem detalhada SEM O BOTÃO DE APAGAR DIRETO
function renderMessageDetail(messageId) {
    const container = document.getElementById('message-detail-view-container');
    if (!container) return;
    
    // Se messageId for nulo, renderiza o placeholder
    if (messageId === null) {
         container.innerHTML = ` 
            <div class="message-content-placeholder text-center p-5"> 
                <i class="fas fa-envelope-open-text fa-3x text-muted mb-3"></i> 
                <h3 class="h5">Selecione uma mensagem</h3>
                <p class="text-muted">Clique em um item na lista lateral para ler os detalhes.</p> 
            </div> 
        `;
        // Atualiza a lista lateral para desmarcar qualquer item ativo
        renderAllMessagesList();
        return;
    }

    const message = messagesData.find(m => m.id === messageId);
    currentMessageId = messageId;
    
    if (!message) {
        container.innerHTML = ` 
            <div class="message-content-placeholder text-center p-5"> 
                <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i> 
                <h3 class="h5">Mensagem não encontrada</h3>
                <p class="text-muted">A mensagem solicitada não existe ou foi arquivada.</p> 
            </div> 
        `;
        // Garantir que a lista lateral seja re-renderizada para limpar o foco
        renderAllMessagesList();
        return;
    }
    
    let attachmentsHTML = '';
    if (message.attachments && message.attachments.length > 0) {
        const attachmentItems = message.attachments.map(file => ` 
            <a href="#" class="attachment-item"> 
                <i class="fas fa-paperclip"></i> 
                <span>${file.fileName} <small>(${file.fileSize})</small></span> 
            </a> 
        `).join('');
        
        attachmentsHTML = ` 
            <div class="message-detail-attachments"> 
                <h6>Anexos</h6> 
                ${attachmentItems} 
            </div> 
        `;
    }
    
    // Usando o senderName (Central de Alertas ou Comunidade Alerta)
    const senderDisplay = message.senderName;
    
    // Texto e ícone para marcar como lida/não lida (apenas para exibição)
    const markUnreadIcon = message.read ? 'fa-envelope-open' : 'fa-envelope';


    const detailHTML = `
        <div class="message-detail-header">
            <button class="btn btn-sm btn-outline-secondary d-md-none me-2" id="back-to-inbox-list-btn">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="message-detail-subject">
                <h2>${message.subject}</h2>
            </div>
            <div class="message-detail-actions">
                <button class="btn btn-sm btn-outline-secondary" title="Favoritar" data-message-action="toggle-star"><i class="fas fa-star"></i></button>
                <button class="btn btn-sm btn-outline-secondary" title="Responder"><i class="fas fa-reply"></i></button>
                
                <div class="dropdown d-inline-block">
                    <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Mais opções">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-lg">
                        <li>
                            <a class="dropdown-item" href="#" data-message-action="archive">
                                <i class="fas fa-box-archive fa-fw me-2"></i> Arquivar
                            </a>
                        </li>
                        <li>
                            <a class="dropdown-item" href="#" data-message-action="mark-read">
                                <i class="fas fa-envelope-open fa-fw me-2"></i> Marcar como Lida
                            </a>
                        </li>
                        <li>
                            <a class="dropdown-item" href="#" data-message-action="mark-unread">
                                <i class="fas ${markUnreadIcon} fa-fw me-2"></i> Marcar como Não Lida
                            </a>
                        </li>
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <a class="dropdown-item text-danger" href="#" data-message-action="delete">
                                <i class="fas fa-trash-alt fa-fw me-2"></i> Excluir Mensagem
                            </a>
                        </li>
                    </ul>
                </div>

            </div>
        </div>
        <div class="message-detail-sender-info">
            <img src="${message.senderAvatar}" alt="Avatar de ${message.senderName}">
            <div class="flex-grow-1">
                <strong class="d-block">${senderDisplay} <small class="text-muted">(${message.senderRole})</small></strong>
                <span class="text-muted small">Para: Você (${loggedInUserName})</span>
            </div>
            <div class="text-end">
                <span class="badge ${message.type.class} mb-1">${message.type.text}</span>
                <small class="d-block text-muted">${formatFullDateTime(message.timestamp)}</small>
            </div>
        </div>
        <div class="message-detail-body">
            <p>${message.fullText.replace(/\n/g, '<br>')}</p>
        </div>
        ${attachmentsHTML}
    `;
    
    container.innerHTML = detailHTML;
    
    if (!message.read) {
        message.read = true;
        updateMessageBadge();
      syncInboxToNotifications();
        renderMessages();
    }
    // Re-renderiza a lista lateral para marcar o item como ativo/lido
    renderAllMessagesList();
}


// ====================== CHART FUNCTIONS ======================

// ... (código existente para inicializar os gráficos, não precisa de grandes mudanças) ...
function initializeActivityChart() { const ctx = document.getElementById('activityChart'); if (!ctx) return; const initialData = { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [ { label: 'Alertas', data: [110, 125, 90, 95, 80, 88], backgroundColor: 'rgba(78, 115, 223, 0.05)', borderColor: 'rgba(78, 115, 223, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(78, 115, 223, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(78, 115, 223, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Resolvidos', data: [70, 85, 65, 75, 68, 78], backgroundColor: 'rgba(28, 200, 138, 0.05)', borderColor: 'rgba(28, 200, 138, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(28, 200, 138, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(28, 200, 138, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Interações', data: [220, 250, 190, 200, 180, 195], backgroundColor: 'rgba(255, 152, 0, 0.05)', borderColor: 'rgba(255, 152, 0, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(255, 152, 0, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(255, 152, 0, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Alertas Falsos', data: [8, 11, 7, 9, 6, 7], backgroundColor: 'rgba(121, 85, 72, 0.05)', borderColor: 'rgba(121, 85, 72, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(121, 85, 72, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(121, 85, 72, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true } ] }; activityChart = new Chart(ctx.getContext('2d'), { type: 'line', data: initialData, options: { maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 20, boxWidth: 12 } }, tooltip: { backgroundColor: "rgb(255,255,255)", bodyColor: "#858796", titleMarginBottom: 10, titleColor: '#6e707e', titleFontSize: 14, borderColor: '#dddfeb', borderWidth: 1, padding: 15, displayColors: false, intersect: false, mode: 'index', caretPadding: 10 } }, scales: { x: { grid: { display: false, drawBorder: false }, ticks: { color: '#858796' } }, y: { grid: { color: "rgb(234, 236, 244)", zeroLineColor: "rgb(234, 236, 244)", drawBorder: false, borderDash: [2], zeroLineBorderDash: [2] }, ticks: { color: '#858796', padding: 20, callback: function(value) { return Number.isInteger(value) ? value : ''; } } } }, interaction: { mode: 'nearest', axis: 'x', intersect: false } } }); }
function initializeAlertTypesChart() { const ctx = document.getElementById('alertTypesChart'); if (!ctx) return; new Chart(ctx.getContext('2d'), { type: 'doughnut', data: { labels: ['Crimes (roubos/furtos)', 'Atitudes Suspeitas', 'Acidentes e Trânsito', 'Problemas Urbanos'], datasets: [{ data: [45, 25, 20, 10], backgroundColor: [ 'rgba(231, 74, 59, 0.8)', 'rgba(246, 194, 62, 0.8)', 'rgba(54, 185, 204, 0.8)', 'rgba(133, 135, 150, 0.8)' ], hoverBackgroundColor: [ 'rgba(231, 74, 59, 1)', 'rgba(246, 194, 62, 1)', 'rgba(54, 185, 204, 1)', 'rgba(133, 135, 150, 1)' ], hoverBorderColor: "rgba(234, 236, 244, 1)", borderWidth: 2 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 20 } }, tooltip: { backgroundColor: "rgb(255,255,255)", bodyColor: "#858796", borderColor: '#dddfeb', borderWidth: 1, padding: 15, displayColors: false, caretPadding: 10, callbacks: { label: function(context) { const label = context.label || ''; const value = context.raw || 0; return `${label}: ${value}%`; } } } }, cutout: '70%' } }); }
function initializeCrimeTrendsChart() { const ctx = document.getElementById('crimeTrendsChart'); if (!ctx) return; const crimeTrendsChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [ { label: 'Furto', data: [45, 52, 38, 41, 35, 39], backgroundColor: 'rgba(255, 152, 0, 0.05)', borderColor: 'rgba(255, 152, 0, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(255, 152, 0, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(255, 152, 0, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Roubo a Transeunte', data: [28, 35, 22, 25, 20, 23], backgroundColor: 'rgba(231, 74, 59, 0.05)', borderColor: 'rgba(231, 74, 59, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(231, 74, 59, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(231, 74, 59, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Roubo de Celular', data: [22, 28, 18, 20, 15, 19], backgroundColor: 'rgba(78, 115, 223, 0.05)', borderColor: 'rgba(78, 115, 223, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(78, 115, 223, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(78, 115, 223, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true }, { label: 'Tentativas de Roubo', data: [8, 12, 7, 9, 6, 8], backgroundColor: 'rgba(75, 192, 192, 0.05)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(75, 192, 192, 1)', pointBorderColor: '#fff', pointHoverRadius: 5, pointHoverBackgroundColor: 'rgba(75, 192, 192, 1)', pointHoverBorderColor: '#fff', pointHitRadius: 10, pointBorderWidth: 2, tension: 0.3, fill: true } ] }, options: { maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 20, boxWidth: 12 } }, tooltip: { backgroundColor: "rgb(255,255,255)", bodyColor: "#858796", titleMarginBottom: 10, titleColor: '#6e707e', titleFontSize: 14, borderColor: '#dddfeb', borderWidth: 1, padding: 15, displayColors: false, intersect: false, mode: 'index', caretPadding: 10 } }, scales: { x: { grid: { display: false, drawBorder: false }, ticks: { color: '#858796' } }, y: { grid: { color: "rgb(234, 236, 244)", zeroLineColor: "rgb(234, 236, 244)", drawBorder: false, borderDash: [2], zeroLineBorderDash: [2] }, ticks: { color: '#858796', padding: 20, callback: function(value) { return Number.isInteger(value) ? value : ''; } } } }, interaction: { mode: 'nearest', axis: 'x', intersect: false } } }); const periodButtons = document.querySelectorAll('.crime-period-btn'); if (periodButtons) { periodButtons.forEach(button => { button.addEventListener('click', function() { periodButtons.forEach(btn => btn.classList.remove('active')); this.classList.add('active'); const period = this.dataset.period; let newLabels = []; let newData = []; switch(period) { case 'week': newLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']; newData = [ [10, 13, 11, 14, 12, 15, 13], [5, 8, 6, 9, 7, 10, 8], [3, 6, 4, 7, 5, 8, 6], [2, 4, 3, 5, 4, 3, 2] ]; break; case 'month': newLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun']; newData = [ [45, 52, 38, 41, 35, 39], [28, 35, 22, 25, 20, 23], [22, 28, 18, 20, 15, 19], [8, 12, 7, 9, 6, 8] ]; break; case 'year': newLabels = ['2021', '2022', '2023', '2024']; newData = [ [350, 380, 420, 250], [210, 230, 260, 153], [180, 200, 240, 122], [60, 75, 80, 40] ]; break; } const newLegends = ['Furto', 'Roubo a Transeunte', 'Roubo de Celular', 'Tentativas de Roubo']; crimeTrendsChart.data.labels = newLabels; crimeTrendsChart.data.datasets.forEach((dataset, index) => { dataset.label = newLegends[index]; dataset.data = newData[index]; }); crimeTrendsChart.update(); }); }); } }
function initializeNetworkEngagementChart() { const ctx = document.getElementById('networkEngagementChart'); if (!ctx) return; new Chart(ctx.getContext('2d'), { type: 'line', data: { labels: ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'], datasets: [{ label: 'Novos Cadastros', data: [45, 52, 68, 71, 55, 62], backgroundColor: 'rgba(10, 185, 129, 0.1)', borderColor: 'rgba(10, 185, 129, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(10, 185, 129, 1)', yAxisID: 'y', tension: 0.3, fill: true }, { label: 'Alertas Gerados', data: [125, 140, 110, 130, 95, 152], backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(245, 158, 11, 1)', yAxisID: 'y1', tension: 0.3, fill: true }] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'top' } }, scales: { x: { grid: { display: false } }, y: { type: 'linear', display: true, position: 'left', grid: { drawOnChartArea: false }, ticks: { color: '#10B981' } }, y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#F59E0B' } } } } }); }

// ... (código existente do painel de estatísticas, não precisa de grandes mudanças) ...
const doughnutTextPlugin = { id: 'doughnutText', afterDraw(chart, args, options) { if (!options.text) return; const { ctx, data } = chart; const meta = chart.getDatasetMeta(0); const text = options.text; const subtext = options.subtext || ''; const x = meta.data[0]?.x || chart.width / 2; const y = meta.data[0]?.y || chart.height / 2; ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 2rem Poppins'; ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dark-color').trim(); ctx.fillText(text, x, y - 10); ctx.font = '0.8rem Poppins'; ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim(); ctx.fillText(subtext, x, y + 20); ctx.restore(); } };
function initializeStatisticsCharts() { const emptyData = { labels: [], datasets: [] }; let ctxHour = document.getElementById('alertsByHourChart')?.getContext('2d'); if (ctxHour) { alertsByHourChart = new Chart(ctxHour, { type: 'line', data: emptyData, options: { plugins: { legend: { display: false } } } }); } let ctxDay = document.getElementById('alertsByDayChart')?.getContext('2d'); if (ctxDay) { alertsByDayChart = new Chart(ctxDay, { type: 'bar', data: emptyData, options: { indexAxis: 'y', plugins: { legend: { display: false } } } }); } let ctxStatus = document.getElementById('alertsStatusChart')?.getContext('2d'); if(ctxStatus) { alertsStatusChart = new Chart(ctxStatus, { type: 'doughnut', data: emptyData, plugins: [doughnutTextPlugin], options: { plugins: { legend: { position: 'bottom' } } } }); } let ctxTypeNeighborhood = document.getElementById('alertsByTypeAndNeighborhoodChart')?.getContext('2d'); if(ctxTypeNeighborhood) { alertsByTypeAndNeighborhoodChart = new Chart(ctxTypeNeighborhood, { type: 'bar', data: emptyData, options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'bottom' } } } }); } }
function setupStatisticsFilters() { const periodFilter = document.getElementById('stats-period-filter'); const neighborhoodFilter = document.getElementById('stats-neighborhood-filter'); const neighborhoods = [...new Set(alertsData.map(a => a.location.split(' - ')[0].trim()))]; neighborhoods.sort().forEach(n => { if (n && !n.includes(',')) { const option = document.createElement('option'); option.value = n; option.textContent = n; neighborhoodFilter.appendChild(option); } }); const updateAllStatistics = () => { const periodDays = parseInt(periodFilter.value); const neighborhood = neighborhoodFilter.value; const now = new Date(); const startDate = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000)); let filteredData = alertsData.filter(a => a.time >= startDate); if (neighborhood !== 'all') { filteredData = filteredData.filter(a => a.location.startsWith(neighborhood)); } updateStatsCards(filteredData, periodDays); updateAlertsByHourChart(filteredData); updateAlertsByDayChart(filteredData); updateAlertsStatusChart(filteredData); updateAlertsByTypeAndNeighborhoodChart(filteredData); }; periodFilter.addEventListener('change', updateAllStatistics); neighborhoodFilter.addEventListener('change', updateAllStatistics); }
function updateStatsCards(data, periodDays) { document.getElementById('stats-total-alerts').textContent = data.length; document.getElementById('stats-daily-average').textContent = (data.length / periodDays).toFixed(1); const hourCounts = data.reduce((acc, a) => { const hour = a.time.getHours(); acc[hour] = (acc[hour] || 0) + 1; return acc; }, {}); const peakHour = Object.keys(hourCounts).length ? Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b) : 'N/A'; document.getElementById('stats-peak-hour').textContent = peakHour !== 'N/A' ? `${peakHour}:00` : 'N/A'; const neighborhoodCounts = data.reduce((acc, a) => { const n = a.location.split(' - ')[0].trim(); acc[n] = (acc[n] || 0) + 1; return acc; }, {}); const topNeighborhood = Object.keys(neighborhoodCounts).length ? Object.keys(neighborhoodCounts).reduce((a, b) => neighborhoodCounts[a] > neighborhoodCounts[b] ? a : b) : 'N/A'; document.getElementById('stats-top-neighborhood').textContent = topNeighborhood; }
function updateAlertsByHourChart(data) { if (!alertsByHourChart) return; const hourCounts = Array(24).fill(0); data.forEach(a => hourCounts[a.time.getHours()]++); const ctx = alertsByHourChart.ctx; const gradient = ctx.createLinearGradient(0, 0, 0, alertsByHourChart.height); gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); gradient.addColorStop(1, 'rgba(99, 102, 241, 0)'); alertsByHourChart.data = { labels: Array.from({length: 24}, (_, i) => `${i}h`), datasets: [{ label: 'Nº de Alertas', data: hourCounts, backgroundColor: gradient, borderColor: 'rgba(99, 102, 241, 1)', fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: 'rgba(99, 102, 241, 1)' }] }; alertsByHourChart.update(); }
function updateAlertsByDayChart(data) { if (!alertsByDayChart) return; const dayCounts = Array(7).fill(0); const dayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']; data.forEach(a => dayCounts[a.time.getDay()]++); alertsByDayChart.data = { labels: dayLabels, datasets: [{ label: 'Nº de Alertas', data: dayCounts, backgroundColor: 'rgba(28, 200, 138, 0.7)', borderRadius: 4, barThickness: 20 }] }; alertsByDayChart.update(); }
function updateAlertsStatusChart(data) { if (!alertsStatusChart) return; const typeMap = { 'danger': 'Crime', 'warning': 'Acidente/Urbano', 'info': 'Suspeito', 'success': 'Resolvido' }; const statusMap = { 'novo': 'Novo', 'investigando': 'Em Investigação', 'resolvido': 'Resolvido' }; const statusData = {}; let readCount = 0; let totalCount = data.length; data.forEach(a => { const status = statusMap[a.status] || 'Outro'; const type = typeMap[a.type] || 'Outro'; if(a.status === 'resolvido') readCount++; if (!statusData[status]) { statusData[status] = { total: 0, types: {} }; } statusData[status].total++; statusData[status].types[type] = (statusData[status].types[type] || 0) + 1; }); const labels = Object.keys(statusData); const totals = labels.map(label => statusData[label].total); const resolutionRate = totalCount > 0 ? ((readCount / totalCount) * 100).toFixed(0) + '%' : '0%'; alertsStatusChart.data = { labels: labels, datasets: [{ data: totals, backgroundColor: ['#F59E0B', '#6366F1', '#10B981', '#6B7280'], borderWidth: 0, }] }; alertsStatusChart.options.plugins.tooltip = { callbacks: { afterBody: function(context) { const currentStatus = context[0].label; const typeDetails = statusData[currentStatus]?.types; if (!typeDetails) return ''; const details = Object.entries(typeDetails) .sort(([, a], [, b]) => b - a) .map(([type, count]) => `  • ${type}: ${count}`); return ['\nDetalhes:', ...details]; } } }; alertsStatusChart.options.plugins.doughnutText = { text: resolutionRate, subtext: 'Taxa de Resolução' }; alertsStatusChart.update(); }
function updateAlertsByTypeAndNeighborhoodChart(data) { if (!alertsByTypeAndNeighborhoodChart) return; const typeMap = { 'danger': 'Crime', 'warning': 'Acidente/Urbano', 'info': 'Suspeito', 'success': 'Resolvido' }; const colors = { 'Crime': '#EF4444', 'Acidente/Urbano': '#F59E0B', 'Suspeito': '#06B6D4', 'Resolvido': '#10B981', 'Outro': '#6B7280' }; const rawCounts = {}; const types = new Set(); const neighborhoods = new Set(); data.forEach(a => { const neighborhood = a.location.split(' - ')[0].trim(); const type = typeMap[a.type] || 'Outro'; if (!neighborhood || neighborhood.includes(',')) return; if (!rawCounts[neighborhood]) rawCounts[neighborhood] = {}; rawCounts[neighborhood][type] = (rawCounts[neighborhood][type] || 0) + 1; types.add(type); neighborhoods.add(neighborhood); }); const neighborhoodLabels = [...neighborhoods]; const typeLabels = [...types]; const totals = neighborhoodLabels.map(n => Object.values(rawCounts[n]).reduce((sum, count) => sum + count, 0)); alertsByTypeAndNeighborhoodChart.data = { labels: neighborhoodLabels, datasets: typeLabels.map(type => ({ label: type, data: neighborhoodLabels.map((n, i) => { const total = totals[i]; const count = rawCounts[n][type] || 0; return total > 0 ? (count / total) * 100 : 0; }), backgroundColor: colors[type] })) }; alertsByTypeAndNeighborhoodChart.options.plugins.tooltip = { callbacks: { label: function(context) { const neighborhood = context.label; const type = context.dataset.label; const percentage = context.raw.toFixed(1); const count = rawCounts[neighborhood][type] || 0; return `${type}: ${percentage}% (${count} ocorrência${count > 1 ? 's' : ''})`; } } }; alertsByTypeAndNeighborhoodChart.options.scales.y.ticks = { callback: function(value) { return value + '%'; } }; alertsByTypeAndNeighborhoodChart.update(); }

// ====================== UTILITY FUNCTIONS ======================
// ... (código existente das funções de dropdown, tema, logout, etc) ...
function setupMessagesDropdown() {
  const messageBtn = document.getElementById('message-btn') || document.querySelector('.message-btn');
  const messagesList = document.getElementById('messages-list') || document.querySelector('.messages-list');
  const notificationBtn = document.getElementById('notification-btn') || document.querySelector('.notification-btn');
  const notificationsList = document.getElementById('notifications-list') || document.querySelector('.notifications-list');

  if (!messageBtn || !messagesList) return;

  const closePanel = (btn, panel) => {
    btn?.setAttribute('aria-expanded', 'false');
    if (!panel) return;
    panel.classList.remove('is-open');
    window.setTimeout(() => panel.setAttribute('hidden', ''), 200);
  };

  const openPanel = (btn, panel) => {
    btn?.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');
    void panel.offsetWidth;
    panel.classList.add('is-open');
  };

  messageBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (notificationsList && notificationsList.classList.contains('is-open')) {
      closePanel(notificationBtn, notificationsList);
    }

    const isOpen = messagesList.classList.contains('is-open');
    if (isOpen) closePanel(messageBtn, messagesList);
    else openPanel(messageBtn, messagesList);
  });

  window.addEventListener('click', (event) => {
    if (!messagesList.classList.contains('is-open')) return;
    const clickedInside = messagesList.contains(event.target) || messageBtn.contains(event.target);
    if (!clickedInside) closePanel(messageBtn, messagesList);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (messagesList.classList.contains('is-open')) closePanel(messageBtn, messagesList);
  });
}

function setupNotificationsDropdown() {
  const notificationBtn = document.getElementById('notification-btn') || document.querySelector('.notification-btn');
  const notificationsList = document.getElementById('notifications-list') || document.querySelector('.notifications-list');
  const messageBtn = document.getElementById('message-btn') || document.querySelector('.message-btn');
  const messagesList = document.getElementById('messages-list') || document.querySelector('.messages-list');

  if (!notificationBtn || !notificationsList) return;

  const closePanel = (btn, panel) => {
    btn?.setAttribute('aria-expanded', 'false');
    if (!panel) return;
    panel.classList.remove('is-open');
    window.setTimeout(() => panel.setAttribute('hidden', ''), 200);
  };

  const openPanel = (btn, panel) => {
    btn?.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');
    void panel.offsetWidth;
    panel.classList.add('is-open');
  };

  notificationBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (messagesList && messagesList.classList.contains('is-open')) {
      closePanel(messageBtn, messagesList);
    }

    const isOpen = notificationsList.classList.contains('is-open');
    if (isOpen) {
      closePanel(notificationBtn, notificationsList);
    } else {
      openPanel(notificationBtn, notificationsList);
      if (typeof markNotificationsAsRead === 'function') markNotificationsAsRead();
    }
  });

  window.addEventListener('click', (event) => {
    if (!notificationsList.classList.contains('is-open')) return;
    const clickedInside = notificationsList.contains(event.target) || notificationBtn.contains(event.target);
    if (!clickedInside) closePanel(notificationBtn, notificationsList);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (notificationsList.classList.contains('is-open')) closePanel(notificationBtn, notificationsList);
  });
}

function setupThemeToggle() { const themeToggle = document.querySelector('.theme-toggle'); const html = document.documentElement; if (themeToggle) { const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`; const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; const applyTheme = () => { let theme = localStorage.getItem('theme') || 'system'; let isDark; if (theme === 'system') { isDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } else { isDark = theme === 'dark'; } if (isDark) { html.setAttribute('data-theme', 'dark'); } else { html.removeAttribute('data-theme'); } themeToggle.innerHTML = isDark ? sunIcon : moonIcon; themeToggle.setAttribute('aria-label', isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'); }; themeToggle.addEventListener('click', function() { const isDark = html.getAttribute('data-theme') === 'dark'; localStorage.setItem('theme', isDark ? 'light' : 'dark'); applyTheme(); }); window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); applyTheme(); } }
function setupLogout() { const logoutBtn = document.querySelector('.logout-btn'); if (logoutBtn) { logoutBtn.addEventListener('click', function(e) { e.preventDefault(); localStorage.removeItem('authToken'); localStorage.removeItem('userName'); window.location.href = 'login.html'; }); } }
function setupActivityPeriodSelector() { const periodSelector = document.getElementById('activity-period'); if (!periodSelector || !activityChart) return; const dataByPeriod = { 'Últimos 7 dias': { labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], datasets: [ [15, 18, 12, 20, 22, 17, 19], [10, 12, 9, 15, 18, 11, 14], [40, 45, 35, 50, 55, 42, 48], [1, 2, 1, 2, 3, 1, 2] ] }, 'Últimos 30 dias': { labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'], datasets: [ [90, 110, 95, 105], [70, 85, 75, 88], [200, 240, 210, 230], [7, 9, 8, 10] ] }, 'Este ano': { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [ [110, 125, 90, 95, 80, 88], [70, 85, 65, 75, 68, 78], [220, 250, 190, 200, 180, 195], [8, 11, 7, 9, 6, 7] ] } }; periodSelector.value = 'Este ano'; periodSelector.addEventListener('change', function() { const selectedPeriod = this.value; const newData = dataByPeriod[selectedPeriod]; if (newData) { activityChart.data.labels = newData.labels; activityChart.data.datasets.forEach((dataset, index) => { dataset.data = newData.datasets[index]; }); activityChart.update(); } }); }

// ====================== SIMULAÇÃO DE ATIVIDADE DINÂMICA ======================
// MODIFICADO: Agora não faz nada já que não há alertas
function updateAlerts() { 
    // Não faz nada, já que não há alertas para atualizar
    // A função pode ser chamada, mas não terá efeito
}

// MODIFICADO: Agora não faz nada já que não há novos membros
function updateNewMembers() { 
    // Não faz nada, já que não há novos membros para mostrar
    // A função pode ser chamada, mas não terá efeito
}

// ====================== ATUALIZADO: GUIA INTERATIVO (SHEPHERD.JS) ======================
function initializeOnboardingTour() {
    // Verifica se a biblioteca Shepherd está disponível
    if (typeof Shepherd === 'undefined') {
        console.error('Shepherd.js não foi carregado.');
        return;
    }

    const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
            classes: 'shadow-md bg-purple-dark',
            scrollTo: { behavior: 'smooth', block: 'center' },
            cancelIcon: {
                enabled: true,
                label: 'Fechar tour'
            }
        }
    });

    // Botões padrão para reutilização
    const defaultButtons = [
        {
            text: 'Voltar',
            action: tour.back,
            classes: 'shepherd-button-secondary'
        },
        {
            text: 'Próximo',
            action: tour.next
        }
    ];

    // Adiciona os passos do tour
    tour.addStep({
        id: 'welcome',
        title: 'Bem-vindo ao Comunidade Alerta!',
        text: 'Este é o seu painel de controle. Vamos fazer um tour rápido e interativo pelas principais funcionalidades.',
        buttons: [
            {
                text: 'Pular',
                action: tour.cancel,
                classes: 'shepherd-button-secondary'
            },
            {
                text: 'Vamos lá!',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'stats-cards',
        title: 'Visão Geral Rápida',
        text: 'Aqui você encontra os números mais importantes em tempo real, como novos cadastros, alertas no mês e incidentes que precisam de atenção.',
        attachTo: { element: '.stats-cards', on: 'bottom' },
        buttons: defaultButtons
    });

    tour.addStep({
        id: 'quick-actions',
        title: 'Ações Imediatas',
        text: 'Precisa agir rápido? Use estes botões para criar um novo alerta, emitir um comunicado para a rede ou convidar novos participantes.',
        attachTo: { element: '#tour-step-2', on: 'bottom' },
        buttons: defaultButtons
    });
    
    tour.addStep({
        id: 'header-actions',
        title: 'Suas Notificações e Preferências',
        text: 'Fique de olho nas suas notificações e mensagens. Você também pode clicar no ícone de lua/sol para alternar entre o tema claro e escuro!',
        attachTo: { element: '.header-actions', on: 'bottom' },
        buttons: defaultButtons
    });

    tour.addStep({
        id: 'search-box',
        title: 'Pesquisa Global',
        text: 'Use esta barra para pesquisar rapidamente por qualquer alerta. Comece a digitar e nós o levaremos diretamente aos resultados.',
        attachTo: { element: '.search-box', on: 'bottom' },
        buttons: defaultButtons
    });

    tour.addStep({
        id: 'navigation-intro',
        title: 'Explorando a Plataforma',
        text: 'Agora, vamos ver a lista completa de alertas. Clique em "Próximo" e nós o levaremos até lá.',
        buttons: defaultButtons,
        // Garante que o usuário volte para o dashboard se clicar em "Voltar"
        when: {
            'before-show': () => {
                showView('dashboard');
            }
        }
    });
    
    tour.addStep({
        id: 'alert-filters',
        title: 'Filtrando os Alertas',
        text: 'Você chegou à lista de alertas! Use estas opções para pesquisar, ou filtrar por tipo e status, encontrando exatamente o que precisa.',
        attachTo: { element: '.card-header .row', on: 'bottom' },
        // A mágica acontece aqui: antes de mostrar este passo, a view é alterada para 'alerts-list'
        beforeShowPromise: function() {
            return new Promise(function(resolve) {
                showView('alerts-list');
                resolve();
            });
        },
        buttons: defaultButtons
    });

    tour.addStep({
        id: 'sidebar-nav',
        title: 'Navegação Principal',
        text: 'Lembre-se: todo o poder do painel está a um clique de distância aqui na barra lateral. Explore as Estatísticas e suas Configurações.',
        attachTo: { element: '.sidebar-nav', on: 'right' },
        // Garante que o usuário volte para a lista de alertas se clicar em "Voltar"
        when: {
            'before-show': () => {
                showView('alerts-list');
            }
        } ,
        buttons: [
            {
                text: 'Voltar',
                action: tour.back,
                classes: 'shepherd-button-secondary'
            },
            {
                text: 'Concluir',
                action: tour.complete
            }
        ]
    });

    // Lógica para iniciar o tour apenas na primeira visita
    if (!localStorage.getItem('dashboard_tour_completed')) {
        // Um pequeno atraso para garantir que a página esteja totalmente renderizada
        setTimeout(() => {
            tour.start();
        }, 500);
    }

    // Função para garantir que a view correta seja exibida ao finalizar ou cancelar o tour
    const cleanupTour = () => {
        localStorage.setItem('dashboard_tour_completed', 'true');
        showView('dashboard'); // Volta para a view principal
    };

    tour.on('complete', cleanupTour);
    tour.on('cancel', cleanupTour);
}

// =================================================
// ITENS DE "NOVAS MENSAGENS" → IR PARA CAIXA DE ENTRADA (SEM ABRIR O MODAL)
// =================================================
function setupHeaderMessagesItemsRedirect() {
  const list = document.getElementById('messages-ul');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const link = e.target.closest('.message-item-link');
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();

    // Fecha o painel do header (se estiver aberto)
    const messageBtn = document.getElementById('message-btn') || document.querySelector('.message-btn');
    const messagesList = document.getElementById('messages-list') || document.querySelector('.messages-list');
    if (messageBtn) messageBtn.setAttribute('aria-expanded', 'false');
    if (messagesList) {
      messagesList.classList.remove('is-open');
      messagesList.setAttribute('hidden', '');
    }

    // Vai para a Caixa de Entrada
    showView('messages');

    // Garante que filtro/busca não atrapalhem o usuário a achar a mensagem
    try {
      currentInboxFilter = 'all';
      inboxSearchQuery = '';
      const searchInput = document.getElementById('inbox-search-input');
      if (searchInput) searchInput.value = '';
      if (typeof setInboxFilterUI === 'function') setInboxFilterUI('all');
    } catch (_) {}

    // Abre a mensagem selecionada direto na Caixa de Entrada (sem modal)
    const id = Number(link.getAttribute('data-message-id'));
    currentMessageId = id;

    renderAllMessagesList();
    renderMessageDetail(id);

    // No mobile, mostra o painel de leitura
    const card = document.querySelector('.messages-layout-card');
    if (card) card.classList.add('mobile-message-open');

    // Destaque/scroll até a mensagem na lista
    const item = document.querySelector(`.inbox-message-item[data-message-id="${id}"]`);
    if (item) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.classList.add('pulse-focus');
      window.setTimeout(() => item.classList.remove('pulse-focus'), 1200);
    }
  });
}


// Pequeno efeito visual ao localizar a mensagem na lista (sem depender do CSS)
(function injectPulseFocusStyle(){
  const id = 'pulse-focus-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .pulse-focus{
      outline: 2px solid rgba(99,102,241,.45);
      box-shadow: 0 0 0 6px rgba(99,102,241,.12);
      border-radius: 14px;
    }
  `;
  document.head.appendChild(style);
})();
// =================================================
// NOTIFICAÇÕES (HEADER) → IR PARA LISTA DE ALERTAS
// =================================================
function setupNotificationsItemsRedirect() {
  const list = document.getElementById('notifications-ul');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const link = e.target.closest('.notification-item-link,[data-view="alerts-list"]');
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();

    const btn = document.getElementById('notification-btn') || document.querySelector('.notification-btn');
    const panel = document.getElementById('notifications-list') || document.querySelector('.notifications-list');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (panel) {
      panel.classList.remove('is-open');
      window.setTimeout(() => panel.setAttribute('hidden', ''), 200);
    }

    showView('alerts-list');
  });
}

// ====================== INBOX V5: BULK BAR ======================
function updateBulkBar(){
  const bar = document.getElementById('inbox-bulkbar');
  const countEl = document.getElementById('bulk-count');
  if(!bar || !countEl) return;
  const n = inboxSelected.size;
  countEl.textContent = `${n} selecionada${n===1?'':'s'}`;
  if(n>0) bar.classList.add('is-open');
  else bar.classList.remove('is-open');
}

function clearSelection(){
  inboxSelected.clear();
  updateBulkBar();
}

function setupInboxTabs(){
  document.querySelectorAll('.inbox-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.inbox-tab').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      currentInboxTab = btn.dataset.tab || 'all';
      clearSelection();
      const sa = document.getElementById('bulk-selectall'); if(sa) sa.checked=false;
      renderAllMessagesList();
    });
  });
}



// ====================== INBOX V6: HELPERS (visíveis/contadores/atalhos) ======================


function isTypingContext(){
  const el = document.activeElement;
  if(!el) return false;
  const tag = (el.tagName||'').toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function focusSearch(){
  const el = document.getElementById('inbox-search-input') || document.getElementById('search-input');
  if(el) el.focus();
}






function setupInboxBulkActions(){
  const cancel = document.getElementById('bulk-cancel');
  const selectAll = document.getElementById('bulk-selectall');
  const markRead = document.getElementById('bulk-mark-read');
  const markUnread = document.getElementById('bulk-mark-unread');
  const star = document.getElementById('bulk-star');
  const archive = document.getElementById('bulk-archive');
  const del = document.getElementById('bulk-delete');

  if(cancel) cancel.addEventListener('click', ()=>{ clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList(); });

  if(selectAll) selectAll.addEventListener('change', ()=>{
    const visible = getVisibleInboxMessages();
    if(selectAll.checked){
      visible.forEach(m=> inboxSelected.add(m.id));
    }else{
      visible.forEach(m=> inboxSelected.delete(m.id));
    }
    updateBulkBar();
    renderAllMessagesList();
  });

  if(markRead) markRead.addEventListener('click', ()=>{
    inboxSelected.forEach(id=>{ const i=messagesData.findIndex(m=>m.id===id); if(i>-1) messagesData[i].read=true; });
    showToast('Mensagens marcadas como lidas.', 'Sucesso', 'success');
    clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList(); updateMessageBadge();
      syncInboxToNotifications();
  });

  if(markUnread) markUnread.addEventListener('click', ()=>{
    inboxSelected.forEach(id=>{ const i=messagesData.findIndex(m=>m.id===id); if(i>-1) messagesData[i].read=false; });
    showToast('Mensagens marcadas como não lidas.', 'Sucesso', 'success');
    clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList(); updateMessageBadge();
      syncInboxToNotifications();
  });

  if(star) star.addEventListener('click', ()=>{
    inboxSelected.forEach(id=>{ inboxStars.add(id); });
    saveInboxStars(inboxStars);
    showToast('Adicionadas aos favoritos ⭐', 'Favoritos', 'info');
    clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList();
  });

  if(archive) archive.addEventListener('click', ()=>{
    inboxSelected.forEach(id=>{ inboxTrash.delete(id); inboxArchived.add(id); });
    saveInboxTrash(); saveInboxArchived();
    showToast('Arquivadas com sucesso.', 'Arquivo', 'info');
    clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList();
  });

  if(del) del.addEventListener('click', ()=>{
    const inTrash = (currentInboxTab === 'trash');
    if(inTrash){
      if(!confirm('Excluir permanentemente as mensagens selecionadas?')) return;
      inboxSelected.forEach(id=>{
        inboxTrash.delete(id);
        inboxArchived.delete(id);
        inboxStars.delete(id);
        messagesData = messagesData.filter(m=>m.id!==id);
      });
      saveInboxTrash(); saveInboxArchived(); saveInboxStars(inboxStars);
      showToast('Mensagens excluídas permanentemente.', 'Excluído', 'danger');
    }else{
      if(!confirm('Mover as mensagens selecionadas para a lixeira?')) return;
      inboxSelected.forEach(id=> inboxTrash.add(id));
      saveInboxTrash();
      showToast('Mensagens movidas para a lixeira.', 'Lixeira', 'warning');
    }
    clearSelection(); if(selectAll) selectAll.checked=false; renderAllMessagesList(); updateMessageBadge();
      syncInboxToNotifications();
  });
}






// ====================== INBOX V7: SNOOZE (lembrar depois) ======================
let snoozeTargetMessageId = null;

function openSnoozeModal(messageId){
  snoozeTargetMessageId = messageId;
  const backdrop = document.getElementById('snooze-backdrop');
  const custom = document.getElementById('snooze-custom');
  if(custom) custom.style.display = 'none';
  if(backdrop) backdrop.classList.add('open');
}

function closeSnoozeModal(){
  const backdrop = document.getElementById('snooze-backdrop');
  if(backdrop) backdrop.classList.remove('open');
  snoozeTargetMessageId = null;
}

function getNextWeekMonday8(){
  const d = new Date();
  const day = d.getDay(); // 0 Sun
  const diff = (8 - day) % 7; // next Monday (1) - careful; we'll compute explicitly
}

function computeSnoozeUntil(preset){
  const now = new Date();
  const d = new Date(now);
  if(preset === '30m'){ d.setMinutes(d.getMinutes()+30); return d; }
  if(preset === '2h'){ d.setHours(d.getHours()+2); return d; }
  if(preset === 'tonight'){
    d.setHours(20,0,0,0);
    if(d <= now) d.setDate(d.getDate()+1);
    return d;
  }
  if(preset === 'tomorrow'){
    d.setDate(d.getDate()+1);
    d.setHours(8,0,0,0);
    return d;
  }
  if(preset === 'nextweek'){
    // próxima segunda 08:00
    const res = new Date(now);
    const wd = res.getDay(); // 0..6
    const daysUntilMon = ( (1 - wd + 7) % 7 ) || 7;
    res.setDate(res.getDate()+daysUntilMon);
    res.setHours(8,0,0,0);
    return res;
  }
  return null;
}

function formatSnoozeLabel(ts){
  try{
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return ''; }
}

function setupSnoozeModal(){
  const closeBtn = document.getElementById('snooze-close');
  const backdrop = document.getElementById('snooze-backdrop');
  const customWrap = document.getElementById('snooze-custom');
  const customInput = document.getElementById('snooze-datetime');
  const applyCustom = document.getElementById('snooze-apply-custom');

  if(closeBtn) closeBtn.addEventListener('click', closeSnoozeModal);
  if(backdrop) backdrop.addEventListener('click', (e)=>{ if(e.target === backdrop) closeSnoozeModal(); });

  document.querySelectorAll('.snooze-option').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const preset = btn.dataset.snooze;
      if(preset === 'custom'){
        if(customWrap) customWrap.style.display = 'block';
        if(customInput){
          const now = new Date();
          now.setMinutes(now.getMinutes()+30);
          customInput.value = now.toISOString().slice(0,16);
        }
        return;
      }
      const until = computeSnoozeUntil(preset);
      if(!until || !snoozeTargetMessageId) return;
      inboxSnoozed[String(snoozeTargetMessageId)] = until.toISOString();
      bumpPriority(snoozeTargetMessageId, -2, 'snooze');
      saveInboxSnoozed();
      showToast('Mensagem em "Lembrar depois".', 'Snooze', 'info');
      closeSnoozeModal();
      clearSelection();
      const sa = document.getElementById('bulk-selectall'); if(sa) sa.checked=false;
      renderAllMessagesList();
      updateInboxTabCounts();
    });
  });

  if(applyCustom) applyCustom.addEventListener('click', ()=>{
    if(!snoozeTargetMessageId || !customInput || !customInput.value) return;
    const until = new Date(customInput.value);
    if(!isFinite(until.getTime())) return;
    inboxSnoozed[String(snoozeTargetMessageId)] = until.toISOString();
      bumpPriority(snoozeTargetMessageId, -2, 'snooze');
    saveInboxSnoozed();
    showToast('Snooze aplicado.', 'Snooze', 'success');
    closeSnoozeModal();
    renderAllMessagesList();
    updateInboxTabCounts();
  });
}



function getVisibleInboxMessages(){
  const now = new Date();
  let list = Array.isArray(messagesData) ? messagesData.slice() : [];

  // limpa snoozes vencidos
  Object.keys(inboxSnoozed || {}).forEach(k=>{
    const ts = new Date(inboxSnoozed[k]);
    if(!isFinite(ts.getTime()) || ts <= now){
      delete inboxSnoozed[k];
    }
  });
  saveInboxSnoozed();

  // abas
  if (currentInboxTab === 'all' || currentInboxTab === 'starred'){
    list = list.filter(m => !inboxArchived.has(m.id) && !inboxTrash.has(m.id) && !inboxSnoozed[String(m.id)]);
  } else if (currentInboxTab === 'snoozed'){
    list = list.filter(m => !!inboxSnoozed[String(m.id)] && !inboxTrash.has(m.id));
  } else if (currentInboxTab === 'archived'){
    list = list.filter(m => inboxArchived.has(m.id) && !inboxTrash.has(m.id));
  } else if (currentInboxTab === 'trash'){
    list = list.filter(m => inboxTrash.has(m.id));
  }

  if (currentInboxTab === 'starred'){
    list = list.filter(m => inboxStars.has(m.id));
  }

  // filtros
  if (currentInboxFilter === 'unread') list = list.filter(m => !m.read);
  if (currentInboxFilter === 'urgent') list = list.filter(m => (m.type && String(m.type.text).toLowerCase() === 'urgente'));

  // busca
  if (inboxSearchQuery) {
    const q = inboxSearchQuery.toLowerCase();
    list = list.filter(m =>
      (m.subject||'').toLowerCase().includes(q) ||
      (m.snippet||'').toLowerCase().includes(q) ||
      (m.senderName||'').toLowerCase().includes(q)
    );
  }

  // ordena com pin em cima
  list.sort((a,b)=>{
    const ap = inboxPinned.has(a.id) ? 1 : 0;
    const bp = inboxPinned.has(b.id) ? 1 : 0;
    if(ap !== bp) return bp - ap;
    const as = computePriorityScore(a);
    const bs = computePriorityScore(b);
    if(as !== bs) return bs - as;
    return new Date(b.timestamp)-new Date(a.timestamp);
  });

  return list;
}



function updateInboxTabCounts(){
  const allEl = document.getElementById('tab-count-all');
  const stEl  = document.getElementById('tab-count-starred');
  const snEl  = document.getElementById('tab-count-snoozed');
  const arEl  = document.getElementById('tab-count-archived');
  const trEl  = document.getElementById('tab-count-trash');
  if(!allEl || !stEl || !snEl || !arEl || !trEl) return;

  const now = new Date();
  // limpa vencidos
  Object.keys(inboxSnoozed || {}).forEach(k=>{
    const ts = new Date(inboxSnoozed[k]);
    if(!isFinite(ts.getTime()) || ts <= now) delete inboxSnoozed[k];
  });
  saveInboxSnoozed();

  const base = Array.isArray(messagesData) ? messagesData : [];
  const inbox = base.filter(m=>!inboxArchived.has(m.id) && !inboxTrash.has(m.id) && !inboxSnoozed[String(m.id)]);
  const starred = inbox.filter(m=>inboxStars.has(m.id));
  const snoozed = base.filter(m=>!!inboxSnoozed[String(m.id)] && !inboxTrash.has(m.id));
  const archived = base.filter(m=>inboxArchived.has(m.id) && !inboxTrash.has(m.id));
  const trash = base.filter(m=>inboxTrash.has(m.id));

  allEl.textContent = inbox.length;
  stEl.textContent  = starred.length;
  snEl.textContent  = snoozed.length;
  arEl.textContent  = archived.length;
  trEl.textContent  = trash.length;
}






function setupAllMessagesViewListener() {
    const container = document.getElementById('all-messages-list-container');
    if (!container) return;

    const selectAll = document.getElementById('bulk-selectall');

    container.addEventListener('click', function(e) {
        const item = e.target.closest('.inbox-message-item');
        if (!item) return;

        const messageId = Number(item.dataset.messageId);

        // checkbox selection
        const cb = e.target.closest('input[type="checkbox"][data-select]');
        if (cb) {
            if (cb.checked) inboxSelected.add(messageId);
            else inboxSelected.delete(messageId);
            updateBulkBar();
            if(selectAll){
              const visible = getVisibleInboxMessages().map(m=>m.id);
              selectAll.checked = visible.length>0 && visible.every(id=>inboxSelected.has(id));
            }
            e.stopPropagation();
            return;
        }

        // quick actions
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();

            const action = actionBtn.dataset.action;

            if(action === 'pin'){
                if(inboxPinned.has(messageId)) inboxPinned.delete(messageId);
                else inboxPinned.add(messageId);
                saveInboxPinned();
                bumpPriority(messageId, inboxPinned.has(messageId)?3: -1, 'pin');
                showToast(inboxPinned.has(messageId)?'Fixada no topo.':'Desfixada.', 'Fixar', 'info');
                renderAllMessagesList();
                return;
            }

            if(action === 'snooze'){
                openSnoozeModal(messageId);
                return;
            }

            if(action === 'archive'){
                inboxTrash.delete(messageId);
                saveInboxTrash();
                inboxArchived.add(messageId);
                saveInboxArchived();
                inboxSelected.delete(messageId);
                showToast('Mensagem arquivada.', 'Arquivo', 'info');
                renderAllMessagesList();
                updateInboxTabCounts();
                return;
            }

            if(action === 'trash'){
                inboxTrash.add(messageId);
                saveInboxTrash();
                inboxSelected.delete(messageId);
                showToast('Mensagem movida para a lixeira.', 'Lixeira', 'warning');
                renderAllMessagesList();
                updateInboxTabCounts();
                updateMessageBadge();
      syncInboxToNotifications();
                return;
            }

            if(action === 'restore'){
                inboxTrash.delete(messageId);
                saveInboxTrash();
                inboxSelected.delete(messageId);
                showToast('Mensagem restaurada.', 'Lixeira', 'success');
                renderAllMessagesList();
                updateInboxTabCounts();
                return;
            }

            if(action === 'delete-forever'){
                const msg = messagesData.find(m=>m.id===messageId);
                if(!confirm(`Excluir para sempre: "${(msg && msg.subject) || 'mensagem'}"?`)) return;
                inboxTrash.delete(messageId);
                inboxArchived.delete(messageId);
                inboxStars.delete(messageId);
                inboxPinned.delete(messageId);
                delete inboxSnoozed[String(messageId)];
                delete inboxStatus[String(messageId)];
                saveInboxTrash(); saveInboxArchived(); saveInboxStars(inboxStars); saveInboxPinned(); saveInboxSnoozed(); saveInboxStatus();
                messagesData = messagesData.filter(m=>m.id!==messageId);
                inboxSelected.delete(messageId);
                showToast('Mensagem excluída permanentemente.', 'Excluído', 'danger');
                renderAllMessagesList();
                updateInboxTabCounts();
                updateMessageBadge();
      syncInboxToNotifications();
                return;
            }

            handleMessageAction(messageId, action);
            renderAllMessagesList();
            updateInboxTabCounts();
            updateMessageBadge();
      syncInboxToNotifications();
            return;
        }

        // open message
        renderMessageDetail(messageId);
        document.querySelector('.messages-layout-card').classList.add('mobile-message-open');
    });

    // Keyboard shortcuts (J/K etc) remain as in v6 – keep existing listener
    // (No-op here; we keep the existing global keydown in the file)
}



// ====================== INBOX V7: ATALHOS (global, mensagens view) ======================
document.addEventListener('keydown', function(e){
  const view = document.getElementById('messages-view');
  if(!view || view.classList.contains('d-none')) return;

  if(e.key === '/' && !isTypingContext()){
    e.preventDefault();
    focusSearch();
    return;
  }
  if(isTypingContext()) return;

  const container = document.getElementById('all-messages-list-container');
  if(!container) return;
  const items = Array.from(container.querySelectorAll('.inbox-message-item'));
  if(!items.length) return;

  const current = document.activeElement.closest('.inbox-message-item');
  const idx = current ? items.indexOf(current) : -1;

  const focusIdx = (i)=>{
    const el = items[Math.max(0, Math.min(items.length-1, i))];
    if(el) el.focus();
  };

  const key = e.key;

  if (key === 'ArrowDown' || key.toLowerCase() === 'j'){
    e.preventDefault(); focusIdx(idx < 0 ? 0 : idx+1);
  } else if (key === 'ArrowUp' || key.toLowerCase() === 'k'){
    e.preventDefault(); focusIdx(idx < 0 ? 0 : idx-1);
  } else if (key === 'Enter'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      renderMessageDetail(messageId);
      document.querySelector('.messages-layout-card').classList.add('mobile-message-open');
    }
  } else if (key.toLowerCase() === 'x'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      const cb = current.querySelector('input[type="checkbox"][data-select]');
      if(cb){
        cb.checked = !cb.checked;
        if(cb.checked) inboxSelected.add(messageId); else inboxSelected.delete(messageId);
        updateBulkBar();
      }
    }
  } else if (key.toLowerCase() === 'e'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      inboxTrash.delete(messageId); saveInboxTrash();
      inboxArchived.add(messageId); saveInboxArchived();
      showToast('Mensagem arquivada.', 'Arquivo', 'info');
      renderAllMessagesList(); updateInboxTabCounts();
    }
  } else if (key.toLowerCase() === 's'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      if(inboxStars.has(messageId)) inboxStars.delete(messageId); else inboxStars.add(messageId);
      saveInboxStars(inboxStars);
      showToast(inboxStars.has(messageId)?'Favoritada ⭐':'Removida dos favoritos', 'Favoritos', 'info');
      renderAllMessagesList(); updateInboxTabCounts();
    }
  } else if (key.toLowerCase() === 'u'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      const i = messagesData.findIndex(m=>m.id===messageId);
      if(i>-1){ messagesData[i].read = false; updateMessageBadge();
      syncInboxToNotifications(); }
      showToast('Marcada como não lida.', 'Sucesso', 'success');
      renderAllMessagesList();
    }
  } else if (key.toLowerCase() === 'r'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      const i = messagesData.findIndex(m=>m.id===messageId);
      if(i>-1){ messagesData[i].read = true; updateMessageBadge();
      syncInboxToNotifications(); }
      showToast('Marcada como lida.', 'Sucesso', 'success');
      renderAllMessagesList();
    }
  } else if (key === '#'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      inboxTrash.add(messageId); saveInboxTrash();
      showToast('Movida para a lixeira.', 'Lixeira', 'warning');
      renderAllMessagesList(); updateInboxTabCounts(); updateMessageBadge();
      syncInboxToNotifications();
    }
  } else if (key.toLowerCase() === 'p'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      if(inboxPinned.has(messageId)) inboxPinned.delete(messageId); else inboxPinned.add(messageId);
      saveInboxPinned();
      showToast(inboxPinned.has(messageId)?'Fixada no topo.':'Desfixada.', 'Fixar', 'info');
      renderAllMessagesList();
    }
  } else if (key.toLowerCase() === 'z'){
    if(current){
      const messageId = Number(current.dataset.messageId);
      openSnoozeModal(messageId);
    }
  }
});



// ====================== INBOX V7: AÇÕES NO DETALHE ======================
document.addEventListener('click', function(e){
  const a = e.target.closest('[data-detail-action]');
  if(!a) return;
  const action = a.dataset.detailAction;
  const wrap = document.getElementById('message-detail-container');
  if(!wrap) return;
  const idAttr = wrap.getAttribute('data-current-message-id');
  const messageId = idAttr ? Number(idAttr) : null;
  if(!messageId) return;

  if(action === 'pin'){
    if(inboxPinned.has(messageId)) inboxPinned.delete(messageId); else inboxPinned.add(messageId);
    saveInboxPinned();
    showToast(inboxPinned.has(messageId)?'Fixada no topo.':'Desfixada.', 'Fixar', 'info');
    renderAllMessagesList();
  } else if(action === 'snooze'){
    openSnoozeModal(messageId);
  } else if(action === 'set-status'){
    e.preventDefault();
    const st = a.dataset.status;
    if(!st) return;
    inboxStatus[String(messageId)] = st;
    saveInboxStatus();
    bumpPriority(messageId, st === 'read' ? 1 : 2, 'status');
    showToast('Status atualizado.', 'Status', 'success');
    renderAllMessagesList();
  }
});




// ====================== NOTIF MODEL: SEM DUPLICAR (v1) ======================
// Notificações aparecem 1 vez para cada mensagem nova. Ao clicar/abrir, a notificação sume,
// mas a mensagem continua na inbox (pode continuar não lida).
let notifiedMessageIds = (function(){
  try{
    const raw = localStorage.getItem('notifiedMessageIds');
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  }catch(e){ return new Set(); }
})();
function saveNotified(){
  try{ localStorage.setItem('notifiedMessageIds', JSON.stringify(Array.from(notifiedMessageIds))); }catch(e){}
}

// ====================== INBOX V8: SYNC MENSAGENS → NOTIFICAÇÕES ======================





// ====================== PRIORIDADE V1 (score automático) ======================
// Modelo simples (sem IA pesada):
// - usa sinais do usuário (abrir, favoritar, fixar, status) + sinais do conteúdo (urgente, não lida)
// - ordena automaticamente por score
// - mantém tudo em localStorage (inboxPriority)

function bumpPriority(messageId, delta, reason){
  const key = String(messageId);
  const now = Date.now();
  const entry = inboxPriority[key] || { score: 0, openCount: 0, lastOpened: 0, lastAction: 0 };
  entry.score = Math.max(0, Math.min(99, (entry.score || 0) + (delta || 0)));
  entry.lastAction = now;
  inboxPriority[key] = entry;
  saveInboxPriority();
}

function trackOpen(messageId){
  const key = String(messageId);
  const now = Date.now();
  const entry = inboxPriority[key] || { score: 0, openCount: 0, lastOpened: 0, lastAction: 0 };
  entry.openCount = (entry.openCount || 0) + 1;
  entry.lastOpened = now;
  entry.lastAction = now;
  // abrir é um forte sinal de interesse
  entry.score = Math.max(0, Math.min(99, (entry.score || 0) + 3));
  inboxPriority[key] = entry;
  saveInboxPriority();
}

function getPriorityBase(message){
  let base = 0;
  const urgent = (message.type && String(message.type.text).toLowerCase() === 'urgente');
  if (urgent) base += 4;
  if (!message.read) base += 1;
  if (inboxStars.has(message.id)) base += 2;
  if (inboxPinned.has(message.id)) base += 3;

  const st = inboxStatus[String(message.id)] || 'open';
  if (st === 'open') base += 1;
  if (st === 'analyzing') base += 2;
  if (st === 'read') base += 0;

  // Snoozed não entra na inbox normal, mas se estiver na aba snoozed, ainda pode ter prioridade
  return base;
}

function computePriorityScore(message){
  const key = String(message.id);
  const entry = inboxPriority[key] || { score: 0, openCount: 0, lastOpened: 0, lastAction: 0 };

  const base = getPriorityBase(message);
  const openCount = entry.openCount || 0;

  // recência: abriu recentemente => mais relevante
  const now = Date.now();
  const lastOpened = entry.lastOpened || 0;
  const hoursSinceOpen = lastOpened ? (now - lastOpened) / 36e5 : 999;

  let recencyBonus = 0;
  if (hoursSinceOpen <= 1) recencyBonus = 3;
  else if (hoursSinceOpen <= 24) recencyBonus = 1;

  // decay: se ficou muito tempo sem abrir, reduz um pouco
  let decay = 0;
  const daysSinceOpen = hoursSinceOpen / 24;
  if (daysSinceOpen >= 7) decay = 3;
  else if (daysSinceOpen >= 3) decay = 2;
  else if (daysSinceOpen >= 2) decay = 1;

  // score final
  const score = Math.max(0, Math.min(99,
    base +
    (entry.score || 0) +
    Math.min(8, Math.round(openCount * 1.5)) +
    recencyBonus - decay
  ));

  return score;
}

let priorityThreshold = (function(){
  try{ const v = localStorage.getItem('priorityThreshold'); const n = v?Number(v):8; return Number.isFinite(n)?n:8; }catch(e){ return 8; }
})();
function savePriorityThreshold(){ try{ localStorage.setItem('priorityThreshold', String(priorityThreshold)); }catch(e){} }

function isPriority(message){
  // threshold simples: >= 8 já aparece como “Prioritário”
  return computePriorityScore(message) >= priorityThreshold;
}



function getPriorityBreakdown(message){
  const key = String(message.id);
  const entry = inboxPriority[key] || { score: 0, openCount: 0, lastOpened: 0, lastAction: 0 };

  const parts = [];
  const urgent = (message.type && String(message.type.text).toLowerCase() === 'urgente');
  if (urgent) parts.push({label:'Urgente', value:+4});
  if (!message.read) parts.push({label:'Não lida', value:+1});
  if (inboxStars.has(message.id)) parts.push({label:'Favoritada', value:+2});
  if (inboxPinned.has(message.id)) parts.push({label:'Fixada', value:+3});

  const st = inboxStatus[String(message.id)] || 'open';
  if (st === 'open') parts.push({label:'Status: Aberto', value:+1});
  if (st === 'analyzing') parts.push({label:'Status: Em análise', value:+2});
  if (st === 'read') parts.push({label:'Status: Resolvido', value:+0});

  const openCount = entry.openCount || 0;
  if (openCount) parts.push({label:`Aberturas (${openCount})`, value: Math.min(8, Math.round(openCount*1.5))});

  const now = Date.now();
  const lastOpened = entry.lastOpened || 0;
  const hoursSinceOpen = lastOpened ? (now - lastOpened) / 36e5 : 999;
  let recencyBonus = 0;
  if (hoursSinceOpen <= 1) recencyBonus = 3;
  else if (hoursSinceOpen <= 24) recencyBonus = 1;
  if (recencyBonus) parts.push({label:'Recência', value: +recencyBonus});

  let decay = 0;
  const daysSinceOpen = hoursSinceOpen / 24;
  if (daysSinceOpen >= 7) decay = 3;
  else if (daysSinceOpen >= 3) decay = 2;
  else if (daysSinceOpen >= 2) decay = 1;
  if (decay) parts.push({label:'Decaimento', value: -decay});

  const raw = (entry.score || 0);
  if (raw) parts.push({label:'Ações acumuladas', value: +raw});

  const total = computePriorityScore(message);
  return { parts, total };
}

function isLowPriority(message){
  // baixa prioridade: score <= 2 (ajustável depois)
  return computePriorityScore(message) <= 2 && !inboxPinned.has(message.id);
}



// ====================== PRIORIDADE V2: POPOVER EXPLICAÇÃO ======================
function closeAllPriorityPops(){
  document.querySelectorAll('.priority-pop.open').forEach(p=>p.classList.remove('open'));
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-action="priority-info"]');
  if(!btn) {
    // clique fora fecha
    if(!e.target.closest('.priority-pop')) closeAllPriorityPops();
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  const item = btn.closest('.inbox-message-item');
  if(!item) return;
  const messageId = Number(item.dataset.messageId);
  const msg = messagesData.find(m=>m.id===messageId);
  if(!msg) return;

  // toggle pop
  closeAllPriorityPops();
  let pop = item.querySelector('.priority-pop');
  if(!pop){
    pop = document.createElement('div');
    pop.className = 'priority-pop';
    item.appendChild(pop);
  }

  const { parts, total } = getPriorityBreakdown(msg);
  const rows = parts.map(p=>`<div class="row"><span>${p.label}</span><b>${p.value>0?'+':''}${p.value}</b></div>`).join('');
  pop.innerHTML = `
    <h4>Prioridade: ${total}</h4>
    <div class="divider"></div>
    ${rows || '<div class="row"><span>Sem sinais ainda</span><b>0</b></div>'}
    <div class="divider"></div>
    <div class="row"><span>Limite “Prioritário”</span><b>${priorityThreshold}</b></div>
  `;
  pop.classList.add('open');
});


function setupPriorityThreshold(){
  const slider = document.getElementById('priority-threshold');
  const label = document.getElementById('priority-threshold-label');
  if(!slider || !label) return;
  slider.value = String(priorityThreshold);
  label.textContent = String(priorityThreshold);

  slider.addEventListener('input', ()=>{
    priorityThreshold = Number(slider.value);
    if(!Number.isFinite(priorityThreshold)) priorityThreshold = 8;
    label.textContent = String(priorityThreshold);
  });

  slider.addEventListener('change', ()=>{
    savePriorityThreshold();
    showToast('Limite de prioridade atualizado.', 'Prioridade', 'success');
    renderAllMessagesList();
  });
}


// ====================== NOTIFICAÇÕES V2 ======================








// ====================== NOTIFS V3: SILENCIAR (tipo/bairro) ======================
let mutedTypes = (function(){
  try{ const raw = localStorage.getItem('mutedTypes'); const arr = raw?JSON.parse(raw):[]; return new Set(Array.isArray(arr)?arr:[]);}catch(e){return new Set();}
})();
let mutedNeighborhoods = (function(){
  try{ const raw = localStorage.getItem('mutedNeighborhoods'); const arr = raw?JSON.parse(raw):[]; return new Set(Array.isArray(arr)?arr:[]);}catch(e){return new Set();}
})();
function saveMutes(){
  try{ localStorage.setItem('mutedTypes', JSON.stringify(Array.from(mutedTypes))); }catch(e){}
  try{ localStorage.setItem('mutedNeighborhoods', JSON.stringify(Array.from(mutedNeighborhoods))); }catch(e){}
}

function getMessageTypeKey(m){
  // usa type.text quando existe; fallback para "mensagem"
  if(m && m.type && m.type.text) return String(m.type.text).toLowerCase();
  return 'mensagem';
}

function getMessageNeighborhood(m){
  // tenta campos conhecidos, senão tenta extrair do assunto: " - Bairro" ou "[Bairro]"
  const cand = (m && (m.neighborhood || m.bairro || m.bairroNome)) ? (m.neighborhood || m.bairro || m.bairroNome) : '';
  if(cand) return String(cand);

  const s = String((m && m.subject) || '');
  const b1 = s.match(/\[(.+?)\]/);
  if(b1) return b1[1].trim();
  const b2 = s.match(/-\s*([A-Za-zÀ-ÿ\s]{3,})$/);
  if(b2) return b2[1].trim();
  return 'Geral';
}

function isMutedMessage(m){
  const t = getMessageTypeKey(m);
  const nb = getMessageNeighborhood(m);
  return mutedTypes.has(t) || mutedNeighborhoods.has(nb);
}



// ====================== NOTIFS V3: UNDO (desfazer) ======================
let __lastUndo = null;
function showUndoToast(message, title, type, undoLabel, undoFn){
  const toastEl = document.getElementById('actionToast');
  if (!toastEl) return;
  const toastTitle = toastEl.querySelector('.me-auto');
  const toastIcon = toastEl.querySelector('.toast-header i');
  const toastBody = toastEl.querySelector('.toast-body');

  toastTitle.textContent = title || 'Ação';
  const icons = {
    success: 'fa-check-circle text-success',
    info: 'fa-info-circle text-info',
    warning: 'fa-exclamation-triangle text-warning',
    danger: 'fa-exclamation-circle text-danger'
  };
  toastIcon.className = `fas ${icons[type] || icons['info']} me-2`;

  __lastUndo = typeof undoFn === 'function' ? undoFn : null;
  const lbl = undoLabel || 'Desfazer';
  toastBody.innerHTML = `
    <div class="d-flex align-items-center justify-content-between gap-2">
      <div>${message}</div>
      <button class="btn btn-sm btn-outline-secondary" id="toast-undo-btn" type="button">${lbl}</button>
    </div>
  `;
  const btn = toastBody.querySelector('#toast-undo-btn');
  if(btn){
    btn.addEventListener('click', ()=>{
      if(__lastUndo) __lastUndo();
      __lastUndo = null;
      const t = bootstrap.Toast.getOrCreateInstance(toastEl);
      t.hide();
    });
  }

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl);
  toast.show();
}



// ====================== NOTIFS V3: CENTRAL (ver todas) ======================
let notifsUnreadOnly = true;

function openNotifsCenter(){
  const backdrop = document.getElementById('notifs-center-backdrop');
  if(backdrop) backdrop.classList.add('open');
  renderNotifsCenter();
}
function closeNotifsCenter(){
  const backdrop = document.getElementById('notifs-center-backdrop');
  if(backdrop) backdrop.classList.remove('open');
}

function getNotifsSourceMessages(){
  // fonte: mensagens (mesma base) — inclui lidas se notifsUnreadOnly = false
  let list = Array.isArray(messagesData) ? messagesData.slice() : [];
  list = list.filter(m => !inboxTrash.has(m.id)).filter(m => !isMutedMessage(m)); // nunca mostrar lixeira aqui
  // aplica silêncios
  list = list.filter(m => !isMutedMessage(m));
  if(notifsUnreadOnly) list = list.filter(m => !m.read);
  return list;
}

function renderNotifsCenter(){
  const wrap = document.getElementById('notifs-center-list');
  const selType = document.getElementById('notifs-filter-type');
  const selNb = document.getElementById('notifs-filter-neighborhood');
  const hint = document.getElementById('notifs-mute-hint');
  if(!wrap || !selType || !selNb) return;

  const all = Array.isArray(messagesData) ? messagesData.slice() : [];
  const types = Array.from(new Set(all.map(getMessageTypeKey))).sort();
  const nbs = Array.from(new Set(all.map(getMessageNeighborhood))).sort();

  // preencher selects uma vez (preserva seleção)
  const curT = selType.value || 'all';
  const curN = selNb.value || 'all';

  selType.innerHTML = '<option value="all">Todos</option>' + types.map(t=>`<option value="${t}">${t}</option>`).join('');
  selNb.innerHTML = '<option value="all">Todos</option>' + nbs.map(n=>`<option value="${n}">${n}</option>`).join('');

  if(types.includes(curT)) selType.value = curT; else selType.value = 'all';
  if(nbs.includes(curN)) selNb.value = curN; else selNb.value = 'all';

  let list = getNotifsSourceMessages();

  if(selType.value !== 'all') list = list.filter(m => getMessageTypeKey(m) === selType.value);
  if(selNb.value !== 'all') list = list.filter(m => getMessageNeighborhood(m) === selNb.value);

  list.sort((a,b)=>{
    const as = computePriorityScore(a), bs = computePriorityScore(b);
    if(as !== bs) return bs - as;
    return new Date(b.timestamp)-new Date(a.timestamp);
  });

  const chips = [];
  if(mutedTypes.size) chips.push(`<span class="mute-chip"><i class="fas fa-bell-slash"></i>${mutedTypes.size} tipo(s) silenciado(s)</span>`);
  if(mutedNeighborhoods.size) chips.push(`<span class="mute-chip"><i class="fas fa-location-dot"></i>${mutedNeighborhoods.size} bairro(s) silenciado(s)</span>`);
  hint.innerHTML = chips.join(' ');

  if(!list.length){
    wrap.innerHTML = '<div class="p-3 text-center text-muted">Nada por aqui ainda.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="notifs-center-grid">
      ${list.map(m=>{
        const prio = computePriorityScore(m);
        const priorityBadge = prio >= priorityThreshold ? '<span class="priority-badge"><i class="fas fa-bolt"></i>Prioritário</span>' : '';
        const lowBadge = isLowPriority(m) ? '<span class="low-badge"><i class="fas fa-arrow-down"></i>Baixa</span>' : '';
        const status = inboxStatus[String(m.id)] || 'open';
        const statusLabel = status === 'read' ? 'Resolvido' : (status==='analyzing'?'Em análise':'Aberto');
        const statusClass = status === 'read' ? 'status-read' : (status==='analyzing'?'status-analyzing':'status-open');
        const snoozeTs = inboxSnoozed[String(m.id)];
        const snoozeChip = snoozeTs ? `<span class="snooze-chip"><i class="fas fa-clock"></i>${formatSnoozeLabel(snoozeTs)}</span>` : '';

        return `
          <div class="notifs-center-item ${m.read?'':'unread'}" data-message-id="${m.id}">
            <div>
              <div class="d-flex align-items-center justify-content-between gap-2">
                <div style="min-width:0">
                  <div class="fw-bold" style="letter-spacing:-0.02em">${m.senderName || "Usuário"}</div>
                  <div class="text-muted" style="font-size:.9rem">${m.subject}</div>
                </div>
                <div class="text-muted" style="font-size:.8rem; white-space:nowrap">${formatTimeAgo(m.timestamp)}</div>
              </div>
              <div class="text-muted mt-1" style="font-size:.9rem">${m.snippet}</div>
              <div class="d-flex flex-wrap gap-2 mt-2 align-items-center">
                ${priorityBadge}
                ${lowBadge}
                <span class="status-chip ${statusClass}"><span class="dot"></span>${statusLabel}</span>
                ${snoozeChip}
              </div>
            </div>
            <div class="d-flex gap-2">
              <button class="notif-action-btn" type="button" data-center-action="open" title="Abrir"><i class="fas fa-arrow-up-right-from-square"></i></button>
              <button class="notif-action-btn" type="button" data-center-action="${m.read?'mark-unread':'mark-read'}" title="${m.read?'Marcar como não lida':'Marcar como lida'}"><i class="fas ${m.read?'fa-envelope':'fa-envelope-open'}"></i></button>
              <button class="notif-action-btn" type="button" data-center-action="snooze" title="Lembrar depois"><i class="fas fa-clock"></i></button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-center-action]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const card = btn.closest('.notifs-center-item');
      const id = Number(card.dataset.messageId);
      const action = btn.dataset.centerAction;

      if(action === 'open'){
        closeNotifsCenter();
        showView('messages');
        setTimeout(()=> renderMessageDetail(id), 50);
        return;
      }

      const idx = messagesData.findIndex(m=>m.id===id);
      if(idx < 0) return;

      if(action === 'mark-read'){
        const prev = messagesData[idx].read;
        messagesData[idx].read = true;
        bumpPriority(id, 1, 'read');
        showUndoToast('Marcada como lida.', 'Notificações', 'success', 'Desfazer', ()=>{
          messagesData[idx].read = prev;
          updateMessageBadge();
          syncInboxToNotifications();
          renderNotifsCenter();
        });
        updateMessageBadge();
        syncInboxToNotifications();
        renderNotifsCenter();
        return;
      }

      if(action === 'mark-unread'){
        const prev = messagesData[idx].read;
        messagesData[idx].read = false;
        bumpPriority(id, 2, 'unread');
        showUndoToast('Marcada como não lida.', 'Notificações', 'info', 'Desfazer', ()=>{
          messagesData[idx].read = prev;
          updateMessageBadge();
          syncInboxToNotifications();
          renderNotifsCenter();
        });
        updateMessageBadge();
        syncInboxToNotifications();
        renderNotifsCenter();
        return;
      }

      if(action === 'snooze'){
        openSnoozeModal(id);
        return;
      }
    });
  });
}

function setupNotifsCenter(){
  const openLink = document.getElementById('open-notifs-center');
  if(openLink) openLink.addEventListener('click', (e)=>{
    e.preventDefault();
    const list = document.getElementById('notifications-list');
    const btn = document.getElementById('notification-btn');
    if(list){
      list.classList.remove('is-open');
      window.setTimeout(() => list.setAttribute('hidden', ''), 200);
    }
    if(btn) btn.setAttribute('aria-expanded', 'false');
    if(window.showView) window.showView('alerts-list');
  });
}








function syncInboxToNotifications() {
  // cria notificações apenas para mensagens ainda não notificadas
  const unreadMessages = messagesData.filter(m => !m.read);

  let notifications = [];
  try { notifications = JSON.parse(localStorage.getItem('notifications')) || []; }
  catch (e) { notifications = []; }

  let changed = false;

  unreadMessages.forEach(msg => {
    const key = String(msg.id);
    const alreadyNotified = notifiedMessageIds.has(key);
    const existsInList = notifications.some(n => n.messageId === msg.id);

    if(!alreadyNotified && !existsInList){
      notifications.unshift({
        id: `msg-${msg.id}`,
        messageId: msg.id,
        type: 'message',
        title: msg.subject,
        text: msg.snippet,
        time: (msg.timestamp || Date.now()),
        read: false
      });
      changed = true
    }
  });

  if(changed){
    try{ localStorage.setItem('notifications', JSON.stringify(notifications)); }catch(e){}
  }

  renderNotificationsV2();
}



function renderNotificationsV2(){
  let notifications = [];
  try{ notifications = JSON.parse(localStorage.getItem('notifications')) || []; }catch(e){ notifications = []; }

  const ul = document.getElementById('notifications-ul');
  const badge = document.getElementById('header-notifications-badge');
  if(!ul || !badge) return;

  // badge = notificações não lidas
  const unreadNotifs = notifications.filter(n => !n.read);
  badge.textContent = unreadNotifs.length ? String(unreadNotifs.length) : '';
  badge.style.display = unreadNotifs.length ? 'inline-flex' : 'none';

  if(!notifications.length){
    ul.innerHTML = `<li class="empty-state"><i class="fas fa-bell"></i><h4>Tudo em dia 🎉</h4><p>Você não tem notificações novas agora.</p></li>`;
    return;
  }

  // ordenar por prioridade da mensagem (se existir) e recência
  const mapped = notifications
    .map(n => ({ n, m: messagesData.find(x=>x.id===n.messageId) }))
    .filter(x => x.m) // só as que ainda têm mensagem
    .filter(x => !inboxTrash.has(x.m.id))
    .filter(x => !isMutedMessage(x.m));

  mapped.sort((a,b)=>{
    const as = computePriorityScore(a.m);
    const bs = computePriorityScore(b.m);
    if(as !== bs) return bs - as;
    return new Date(b.n.time)-new Date(a.n.time);
  });

  ul.innerHTML = mapped.slice(0,6).map(({n,m})=>{
    const unreadClass = !n.read ? 'unread' : '';
    const senderDisplay = m.senderName || 'Usuário';
    const avatar = m.senderAvatar || 'https://i.pravatar.cc/80?img=12';

    return `
      <li>
        <a href="#" class="text-decoration-none notification-link" data-notif-id="${n.id}" data-message-id="${m.id}">
          <div class="message-item ${unreadClass}">
            <img src="${avatar}" alt="" onerror="this.onerror=null;this.src='data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2764%27%20height%3D%2764%27%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%0A%3Cstop%20offset%3D%270%27%20stop-color%3D%27%236366f1%27/%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%238b5cf6%27/%3E%0A%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2732%27%20fill%3D%27url%28%23g%29%27/%3E%0A%3Ctext%20x%3D%2732%27%20y%3D%2740%27%20font-family%3D%27Arial%27%20font-size%3D%2728%27%20font-weight%3D%27700%27%20text-anchor%3D%27middle%27%20fill%3D%27white%27%3ECA%3C/text%3E%0A%3C/svg%3E';" />
            <div class="message-content">
              <p class="mb-1" style="color: var(--dark-color);">${senderDisplay}: <span class="fw-normal">${m.snippet}</span></p>
              <small class="text-muted">${formatTimeAgo(n.time || m.timestamp)}</small>
            </div>
          </div>
        </a>
      </li>
    `;
  }).join('');

  ul.querySelectorAll('.notification-link').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const notifId = a.dataset.notifId;
      const messageId = Number(a.dataset.messageId);

      // marca como "notificada" e remove da lista (não duplica novamente)
      notifiedMessageIds.add(String(messageId));
      saveNotified();

      let notifications = [];
      try{ notifications = JSON.parse(localStorage.getItem('notifications')) || []; }catch(e){ notifications = []; }
      notifications = notifications.filter(x => x.id !== notifId);
      try{ localStorage.setItem('notifications', JSON.stringify(notifications)); }catch(e){}

      renderNotificationsV2();

      // abre a mensagem
      showView('messages');
      setTimeout(()=> renderMessageDetail(messageId), 50);
    });
  });
}


// ====================== TICKER TEMPO (Mensagens + Notificações) ======================
function startRelativeTimeTicker(){
  // Re-render leve a cada minuto para atualizar "agora / min / h"
  setInterval(()=>{
    try{
      if(typeof renderAllMessagesList === 'function') renderAllMessagesList();
      if(typeof renderNotificationsV2 === 'function') renderNotificationsV2();
    }catch(e){}
  }, 60000);
}

function normalizeDemoTimestamps(){
  if(!Array.isArray(messagesData)) return;
  const now = Date.now();
  // se algum timestamp estiver muito antigo (>30 dias), traz para perto (demo realista)
  messagesData = messagesData.map((m, idx)=>{
    const ts = new Date(m.timestamp).getTime();
    if(!ts || (now - ts) > 1000*60*60*24*30){
      const offsets = [20, 3*60, 70*60, 6*60*60]; // 20s, 3min, 70min, 6h
      const off = offsets[idx % offsets.length] * 1000;
      return { ...m, timestamp: new Date(now - off).toISOString() };
    }
    return m;
  });
}







function bucketByRecency(ts){
  const t = new Date(ts).getTime();
  const now = Date.now();
  const dayMs = 24*60*60*1000;
  const diff = now - t;
  if(diff < dayMs) return 'Hoje';
  if(diff < 7*dayMs) return 'Esta semana';
  return 'Mais antigas';
}





function renderAllMessagesList(){
    const container = document.getElementById('all-messages-list-container');
    if (!container) return;

    const list = (typeof getInboxVisibleMessages === 'function') ? getInboxVisibleMessages() : (messagesData || []);
    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <h4>Caixa limpa</h4>
            <p>Quando chegar algo novo, aparece aqui.</p>
          </div>`;
        return;
    }

    // Ordenação limpa: não lidas primeiro, urgentes depois, e mais recentes
    const ordered = [...list].sort((a,b)=>{
      if(a.read !== b.read) return a.read ? 1 : -1;
      const au = a.type && String(a.type.text).toLowerCase()==='urgente';
      const bu = b.type && String(b.type.text).toLowerCase()==='urgente';
      if(au !== bu) return au ? -1 : 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const currentId = (typeof currentMessageId !== 'undefined') ? currentMessageId : null;

    container.innerHTML = ordered.map(m=>{
        const unreadClass = !m.read ? 'unread' : '';
        const activeClass = (currentId === m.id) ? 'active' : '';
        const sender = m.senderName || 'Usuário';
        const avatar = m.senderAvatar || 'https://i.pravatar.cc/80?img=12';
        const subject = getDisplaySubject(m);
        const snippet = getDisplaySnippet(m);
        const time = (typeof formatTimeAgo === 'function') ? formatTimeAgo(m.timestamp) : '';
        const isUrgent = m.type && String(m.type.text).toLowerCase() === 'urgente';
        const urgentBadge = isUrgent ? `<span class="inbox-urgent-inline">(Urgente)</span>` : ``;
        const unreadDot = !m.read ? `` : ``;

        return `
          <div class="inbox-message-item ${unreadClass} ${activeClass} ${isUrgent?'is-urgent':''}" data-message-id="${m.id}" tabindex="0" role="button" aria-label="Abrir mensagem: ${subject}">
            <div class="inbox-item-avatar">
              <img src="${avatar}" alt="" onerror="this.onerror=null;this.src='data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2764%27%20height%3D%2764%27%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%0A%3Cstop%20offset%3D%270%27%20stop-color%3D%27%236366f1%27/%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%238b5cf6%27/%3E%0A%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2732%27%20fill%3D%27url%28%23g%29%27/%3E%0A%3Ctext%20x%3D%2732%27%20y%3D%2740%27%20font-family%3D%27Arial%27%20font-size%3D%2728%27%20font-weight%3D%27700%27%20text-anchor%3D%27middle%27%20fill%3D%27white%27%3ECA%3C/text%3E%0A%3C/svg%3E';" />
            </div>

            <div class="inbox-item-content">
              <div class="inbox-item-top">
                <div class="inbox-item-senderwrap">
                  ${unreadDot}
                  <span class="inbox-item-sender">${sender}</span> ${urgentBadge}
                  </div>
                <span class="inbox-item-time" data-ts="${m.timestamp}">${time}</span>
              </div>

              <div class="inbox-item-subject">${subject}</div>
              <div class="inbox-item-snippet">${snippet}</div>
            </div>
          </div>
        `;
    }).join('');

    container.querySelectorAll('.inbox-message-item').forEach(item=>{
      item.addEventListener('click', ()=>{
        const id = Number(item.dataset.messageId);
        if(typeof renderMessageDetail === 'function') renderMessageDetail(id);
        startRelativeTimeTicker();
        setTimeout(()=>{ try{ renderAllMessagesList(); }catch(e){} }, 0);
      });
      item.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          item.click();
        }
      });
    });

    if (typeof updateInboxCounts === 'function') updateInboxCounts();
    if (typeof updateInboxTabCounts === 'function') updateInboxTabCounts();
}


function getDisplaySubject(m){
  const sender = (m.senderName || '').trim();
  let subject = (m.subject || '').trim();
  const snippet = (m.snippet || '').trim();
  const full = (m.fullText || '').trim();
  if(!subject || subject.length < 10 || subject.toLowerCase() === sender.toLowerCase()){
    const base = full || snippet || subject || 'Mensagem';
    subject = base.split('\n')[0].trim();
  }
  return subject || 'Mensagem';
}
function getDisplaySnippet(m){
  const snippet = (m.snippet || '').trim();
  const full = (m.fullText || '').trim();
  const base = snippet || full;
  if(!base) return '';
  const lines = base.split('\n').map(s=>s.trim()).filter(Boolean);
  if(lines.length) return lines[0].slice(0,160);
  return '';
}


/* ================================================= */
/* TIME (RELATIVO) – consistente e em "tempo real"   */
/* ================================================= */

/**
 * Converte uma data em tempo relativo curto e consistente:
 * agora mesmo | 3 min | 1 h | 2 d | 3 sem | 1 mês | 2 anos
 */
function formatTimeAgo(input){
  const date = (input instanceof Date) ? input : new Date(input);
  const now = new Date();
  const diffMs = now - date;

  // futuro (clock desajustado) -> "agora mesmo"
  if (isNaN(date.getTime()) || diffMs < 0) return "agora mesmo";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "agora mesmo";

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} d`;

  const week = Math.floor(day / 7);
  if (week < 4) return `${week} sem`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} mês${month>1?'es':''}`;

  const years = Math.floor(day / 365);
  return `${years} ano${years>1?'s':''}`;
}

/**
 * Atualiza, sem mexer no layout, só os textos de tempo (sidebar).
 * Roda a cada 30s para manter "agora mesmo" -> "1 min" etc.
 */
function refreshRelativeTimes(){
  const els = document.querySelectorAll('#messages-view .inbox-item-time[data-ts]');
  els.forEach(el=>{
    const ts = el.getAttribute('data-ts');
    if(!ts) return;
    el.textContent = formatTimeAgo(ts);
  });
}

let _relativeTimer = null;
function startRelativeTimeTicker(){
  // evita criar múltiplos intervals
  if (_relativeTimer) return;
  refreshRelativeTimes();
  _relativeTimer = setInterval(refreshRelativeTimes, 30000);
}



/* ================================================= */
/* ALERTAS – COMPORTAMENTO REAL (IGUAL INBOX)        */
/* ================================================= */

function normalizeAlertsData(){
  if(!Array.isArray(alertsData)) return;
  const now = Date.now();

  alertsData = alertsData.map((a, idx)=>{
    if(!a.timestamp){
      a.timestamp = new Date(now - (idx * 7 + 3) * 60000).toISOString();
    }
    if(!a.status) a.status = "ativo";
    return a;
  });
}

function refreshRelativeTimesAlerts(){
  document.querySelectorAll('#alerts-view .alert-time[data-ts]').forEach(el=>{
    el.textContent = formatTimeAgo(el.dataset.ts);
  });
}

function startAlertsTicker(){
  refreshRelativeTimesAlerts();
  setInterval(refreshRelativeTimesAlerts, 30000);
}


/* ================================================= */
/* ALERTAS + NOTIFICAÇÕES (VISÃO ÚNICA)              */
/* ================================================= */

function mergeAlertsAndNotifications(){
  if(!Array.isArray(alertsData)) alertsData = [];
  if(!Array.isArray(notificationsData)) return;

  const mapped = notificationsData.map((n)=>({
    id: 'notif-' + n.id,
    title: n.title || n.subject || 'Notificação',
    description: n.message || n.body || '',
    timestamp: n.timestamp,
    urgent: !!n.urgent,
    status: 'ativo',
    source: 'notificacao'
  }));

  alertsData = [...mapped, ...alertsData];
}



/* ================================================= */
/* LISTA DE ALERTAS – RENDER + FILTRO + PAGINAÇÃO     */
/* (inclui Novas Notificações na mesma lista)         */
/* ================================================= */

function _getAlertTypeLabel(t){
  const s = String(t||'').toLowerCase();
  if (s.includes('arrast')) return 'Arrastão';
  if (s.includes('tirot')) return 'Tiroteio';
  if (s.includes('pol')) return 'Ação Policial';
  if (s.includes('crime')) return 'Crime';
  if (s.includes('warning') || s.includes('acidente') || s.includes('trân')) return 'Trânsito';
  if (s.includes('info') || s.includes('suspe')) return 'Atitude Suspeita';
  if (s.includes('ordem')) return 'Ordem Pública';
  return t || 'Alerta';
}

function _getStatusLabel(s){
  const st = String(s||'').toLowerCase();
  if (st.includes('novo')) return {label:'Novo', cls:'bg-primary'};
  if (st.includes('resolv') || st.includes('final')) return {label:'Resolvido', cls:'bg-success'};
  if (st.includes('invest') || st.includes('anal')) return {label:'Em investigação', cls:'bg-warning text-dark'};
  if (st.includes('ativo') || st.includes('aberto') || st.includes('urgente') || st.includes('atenção')) return {label:'Ativo', cls:'bg-danger'};
  return {label:(s||'Ativo'), cls:'bg-secondary'};
}

function mergeAlertsAndNotificationsOnce(){
  // evita duplicar ao entrar/sair da view
  if (window.__mergedNotifsIntoAlerts) return;
  window.__mergedNotifsIntoAlerts = true;
  if(!Array.isArray(alertsData)) alertsData = [];
  if(!Array.isArray(notificationsData)) return;

  const mapped = notificationsData.map((n, idx)=>({
    id: Number.isFinite(Number(n.id)) ? (100000 + Number(n.id)) : (100000 + idx),
    title: n.title || n.subject || 'Notificação',
    description: n.description || n.message || n.body || '',
    timestamp: n.timestamp,
    urgent: !!n.urgent || String(n.status||'').toLowerCase() === 'urgente',
    status: n.status || 'ativo',
    type: n.type || 'info',
    neighborhood: n.neighborhood || n.bairro || '',
    location: n.location || n.local || '',
    read: n.read ?? false,
    source: 'notificacao'
  }));

  // prepend para aparecerem no topo (mais recentes)
  alertsData = [...mapped, ...alertsData];
}

function applyAlertsFilters(){
  const q = (document.getElementById('alert-search-input')?.value || '').trim().toLowerCase();
  const type = document.getElementById('alert-type-filter')?.value || 'all';
  const status = document.getElementById('alert-status-filter')?.value || 'all';
  const quick = (window.__alertsQuickFilter || 'all').toLowerCase();

  let items = Array.isArray(alertsData) ? alertsData.slice() : [];
  items = items.map(a => ({ ...(a || {}), source: (a?.source || 'alerta') }));

  items.sort((a,b)=> new Date(b.timestamp||b.time||0) - new Date(a.timestamp||a.time||0));

  if(q){
    items = items.filter(a=>{
      const hay = [a.title,a.description,a.location,a.neighborhood,a.type,a.source,a.status].map(v=>String(v||'').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }

  if(type !== 'all'){
    items = items.filter(a=> String(a.type||'').toLowerCase().includes(type));
  }

  if(status !== 'all'){
    items = items.filter(a=> String(a.status||'').toLowerCase().includes(status));
  }

  if(quick !== 'all'){
    items = items.filter(a => String(a.source || 'alerta').toLowerCase() === quick);
  }

  filteredAlerts = items;
}

function renderAlertsTablePage(page){
  const tbody = document.getElementById('full-alerts-table-body');
  if(!tbody) return;

  const total = filteredAlerts.length;
  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));
  currentPage = Math.min(Math.max(1, page), totalPages);

  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filteredAlerts.slice(start, start + itemsPerPage);

  if(pageItems.length === 0){
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="p-4 text-center text-muted">
          Nenhum alerta encontrado com os filtros atuais.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageItems.map(a=>{
    const when = formatTimeAgo(a.timestamp || new Date().toISOString());
    const typeLabel = _getAlertTypeLabel(a.type);
    const st = _getStatusLabel(a.status);
    const title = String(a.title || 'Alerta').trim();
    const place = String(a.location || a.neighborhood || '').trim();
    const source = a.source === 'notificacao' ? 'Notificação' : 'Alerta';

    const urgentBadge = a.urgent ? '<span class="badge bg-danger ms-2">Urgente</span>' : '';
    const newBadge = (a.source === 'notificacao' && a.read !== true && isNotificationFresh(a)) ? '<span class="badge badge-new-notif ms-2">Nova</span>' : '';
    const sourceBadge = a.source === 'notificacao'
      ? `<span class="badge badge-source-notif ms-2">Notificação</span>`
      : `<span class="badge badge-source-alert ms-2">Alerta</span>`;
    const freshness = (a.source === 'notificacao' && a.read !== true && isNotificationFresh(a))
      ? `<div class="alerts-freshness"><i class="fas fa-clock"></i>${getFreshnessText(a)}</div>`
      : '';

    return `
      <tr class="align-middle" data-id="${a.id}" data-source="${a.source}" data-read="${a.read === true}">
        <td class="ps-3">
          <div class="fw-bold">${title}${newBadge}${urgentBadge}${sourceBadge}</div>${freshness}
          <div class="text-muted small">${typeLabel}${place ? ' • ' + place : ''}</div>
        </td>
        <td class="text-muted">${when}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-action="view-alert" data-alert-id="${a.id}">Ver detalhes</button>
        </td>
      </tr>
    `;
  }).join('');

  // atualiza paginação básica (1..N)
  const pag = document.querySelector('#alerts-list-view .pagination');
  if(pag){
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    pag.innerHTML = `
      <li class="page-item ${prevDisabled}"><a class="page-link" href="#" data-page="${currentPage-1}">Anterior</a></li>
      ${Array.from({length: totalPages}).slice(0, 7).map((_,i)=>{
        const p = i+1;
        const active = p===currentPage ? 'active' : '';
        return `<li class="page-item ${active}"><a class="page-link" href="#" data-page="${p}">${p}</a></li>`;
      }).join('')}
      <li class="page-item ${nextDisabled}"><a class="page-link" href="#" data-page="${currentPage+1}">Próximo</a></li>
    `;
  }
}

function displayPage(page){
  mergeAlertsAndNotificationsOnce();
  normalizeAlertsData?.();
  applyAlertsFilters();
  renderAlertsTablePage(page);
  // mantém o tempo atualizado na tabela também
  refreshRelativeTimesAlerts?.();
}

function setupAlertsListInteractions(){
  const view = document.getElementById('alerts-list-view');
  if(!view) return;

  const search = document.getElementById('alert-search-input');
  const type = document.getElementById('alert-type-filter');
  const status = document.getElementById('alert-status-filter');
  const pag = view.querySelector('.pagination');
  const tbody = document.getElementById('full-alerts-table-body');

  const rerender = ()=> displayPage(1);

  if(search) search.addEventListener('input', rerender);
  if(type) type.addEventListener('change', rerender);
  if(status) status.addEventListener('change', rerender);

  if(pag){
    pag.addEventListener('click', (e)=>{
      const a = e.target.closest('a[data-page]');
      if(!a) return;
      e.preventDefault();
      const p = Number(a.dataset.page);
      if(!Number.isFinite(p)) return;
      displayPage(p);
    });
  }

  // botão "Ver" abre modal simples com texto (sem mudar layout do modal)
  if(tbody){
    tbody.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-action="view-alert"]');
      if(!btn) return;
      const id = Number(btn.dataset.alertId);
      const a = (Array.isArray(filteredAlerts)?filteredAlerts:[]).find(x=>x.id===id) || (Array.isArray(alertsData)?alertsData:[]).find(x=>x.id===id);
      if(!a) return;

      const modalEl = document.getElementById('viewAlertModal');
      if(modalEl && window.bootstrap){
        // preenche título do modal e um resumo
        const titleEl = modalEl.querySelector('#viewAlertModalLabel');
        if(titleEl) titleEl.textContent = a.source === 'notificacao' ? 'Detalhes da Notificação' : 'Detalhes do Alerta';

        const body = modalEl.querySelector('.modal-body');
        if(body){
          body.innerHTML = `
            <div class="d-flex align-items-start p-3 mb-3 bg-light rounded">
              <div class="alert-icon ${a.urgent ? 'bg-danger' : 'bg-info'} me-3">
                <i class="fas ${a.urgent ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
              </div>
              <div class="flex-grow-1">
                <div class="fw-bold fs-5">${String(a.title||'').trim()}</div>
                <small class="text-muted">
                  ${_getAlertTypeLabel(a.type)}${a.location ? ' • ' + a.location : ''}${a.neighborhood ? ' • ' + a.neighborhood : ''} • ${formatTimeAgo(a.timestamp||new Date().toISOString())}
                </small>
              </div>
              <div>
                ${a.urgent ? '<span class="badge bg-danger">Urgente</span>' : '<span class="badge bg-secondary">Normal</span>'}
              </div>
            </div>
            <div class="card">
              <div class="card-header bg-light"><h6 class="mb-0"><i class="fas fa-align-left me-2"></i>Descrição</h6></div>
              
<div class="card-body">
  <div class="notification-details">
    <p class="mb-2">${String(a.description||'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.').trim()}</p>
    <ul class="list-unstyled small text-muted mb-0">
      <li><strong>Origem:</strong> ${a.source === 'notificacao' ? 'Notificação do Sistema' : 'Alerta do Sistema'}</li>
      <li><strong>Tipo:</strong> ${a.type || 'Informativo'}</li>
      ${a.location ? `<li><strong>Local:</strong> ${a.location}</li>` : ``}
      ${a.neighborhood ? `<li><strong>Bairro:</strong> ${a.neighborhood}</li>` : ``}
      <li><strong>Horário:</strong> ${formatTimeAgo(a.timestamp)}</li>
    </ul>
  </div>
</div>

            </div>
          `;
        }

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
  try{ markNotificationAsSeenByEvent(ev); }catch(e){}
  try{ renderNotifications(); }catch(e){}
  try{ updateSidebarCounters(); }catch(e){}

      }
    });
  }
}


/* ================================================= */
/* ALERTAS = RESUMO DE EVENTOS (SEM DUPLICAÇÃO)      */
/* ================================================= */

function buildAlertsSummary(){
  normalizeAlertsSource();
  if(!Array.isArray(alertsData)) alertsData = [];
  if(!Array.isArray(notificationsData)) notificationsData = [];

  const map = new Map();

  // helper para chave única do evento
  const keyOf = (o)=> {
    const t = (o.title||o.subject||'').toLowerCase().slice(0,60);
    const d = new Date(o.timestamp||0).toISOString().slice(0,16);
    return t + '|' + d;
  };

  // Notificações viram eventos resumidos
  notificationsData.forEach(n=>{
    const k = keyOf(n);
    if(map.has(k)) return;
    map.set(k, {
      id: 'evt-n-'+(n.id||Math.random()),
      title: n.title || n.subject || 'Notificação',
      type: 'Notificação',
      timestamp: n.timestamp,
      urgent: !!n.urgent,
      status: 'ativo',
      source: 'notificacao',
      inboxId: n.inboxId || null
    });
  });

  // Alertas do sistema
  alertsData.forEach(a=>{
    const k = keyOf(a);
    if(map.has(k)) return;
    map.set(k, {
      id: 'evt-a-'+(a.id||Math.random()),
      title: a.title || 'Alerta',
      type: 'Alerta',
      timestamp: a.timestamp,
      urgent: !!a.urgent,
      status: a.status || 'ativo',
      source: 'alerta',
      inboxId: a.inboxId || null
    });
  });

  return Array.from(map.values()).sort((x,y)=> new Date(y.timestamp)-new Date(x.timestamp));
}


function renderAlertsSummary(){
  const tbody = document.getElementById('full-alerts-table-body');
  if(!tbody) return;

  const items = buildAlertsSummary();
  const qf = (window.__alertsQuickFilter || 'all');
  const itemsFiltered = (qf==='all') ? items : items.filter(x=>x.source===qf);

  if(itemsFiltered.length === 0){
    tbody.innerHTML = `
      <tr><td colspan="4" class="text-center text-muted p-4">
        Nenhum alerta ou notificação no momento.
      </td></tr>`;
    return;
  }

  updateSidebarCounters();

  tbody.innerHTML = itemsFiltered.map(a=>{
    const when = formatTimeAgo(a.timestamp);
    const urgent = a.urgent ? '<span class="badge bg-danger ms-2">Urgente</span>' : '';
    const src = a.source === 'notificacao' ? '🔔 Notificação' : '🚨 Alerta';

    return `
      <tr class="align-middle" data-id="${a.id}" data-source="${a.source}" data-read="${a.read === true}">
        <td class="ps-3">
          <div class="fw-bold">${src} ${urgent}</div>
          <div class="text-muted small">${a.type}</div>
        </td>
        <td class="text-muted">${when}</td>
        <td><span class="badge ${a.status==='ativo'?'bg-danger':'bg-success'}">${a.status}</span></td>
        <td>
          ${a.inboxId ? `<button class="btn btn-sm btn-outline-secondary" data-open-inbox="${a.inboxId}">Abrir</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
  updateSidebarCounters();
}


document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-open-inbox]');
  if(!btn) return;
  const id = btn.getAttribute('data-open-inbox');
  if(!id) return;

  // navega para inbox e abre a mensagem
  if(typeof showView === 'function'){
    showView('messages');
    if(typeof openMessageById === 'function'){
      setTimeout(()=>openMessageById(id), 50);
    }
  }
});

window.__alertsQuickFilter = 'all';


function setupAlertsQuickFilters(){
  const wrap = document.getElementById('alerts-quick-filters');
  if(!wrap) return;

  const setActive = (value)=>{
    wrap.querySelectorAll('button[data-aqf]').forEach(btn=>{
      btn.classList.toggle('is-active', btn.getAttribute('data-aqf') === value);
    });
  };

  wrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-aqf]');
    if(!btn) return;
    const kind = btn.getAttribute('data-aqf') || 'all';
    window.__alertsQuickFilter = kind;
    setActive(kind);
    if(typeof displayPage === 'function') displayPage(1);
  });

  setActive(window.__alertsQuickFilter || 'all');
}


/* ================================================= */
/* ALERTA LIDO – CONTROLE DE ACESSO AO DETALHE       */
/* ================================================= */

function markAlertAsRead(alertId){
  if(!Array.isArray(alertsData)) return;
  const a = alertsData.find(x => String(x.id) === String(alertId));
  if(a){
    a.read = true;
  }
}


document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-action="view-alert"]');
  if(!btn) return;

  const id = btn.dataset.alertId;
  if(!Array.isArray(alertsData)) return;
  const a = alertsData.find(x => String(x.id) === String(id));
  if(!a) return;

  if(a.source === "alerta" && a.read){
    e.preventDefault();
    return;
  }

  if(a.source === "alerta"){
    markAlertAsRead(id);
  }
});


function normalizeAlertsSource(){
  if(!Array.isArray(alertsData)) return;
  alertsData = alertsData.map(a=>{
    if(!a) return a;
    if(!a.source) a.source = 'alerta';
    return a;
  });
}


function getEventRecord(ev){
  // tenta encontrar registro original para pegar descrição/local/bairro etc.
  const ts = new Date(ev.timestamp||0).toISOString().slice(0,16);
  const keyMatch = (o)=>{
    const t = String(o.title||o.subject||'').toLowerCase().slice(0,60);
    const d = new Date(o.timestamp||0).toISOString().slice(0,16);
    return t === String(ev.title||'').toLowerCase().slice(0,60) && d === ts;
  };

  if(ev.source === 'notificacao' && Array.isArray(notificationsData)){
    return notificationsData.find(keyMatch) || null;
  }
  if(ev.source === 'alerta' && Array.isArray(alertsData)){
    return alertsData.find(keyMatch) || null;
  }
  return null;
}


function openEventDetails(eventId){
  const items = (typeof buildAlertsSummary === 'function') ? buildAlertsSummary() : [];
  const ev = items.find(x => String(x.id) === String(eventId));
  if(!ev) return;

  // Bloqueio: se for Alerta e estiver marcado como lido, não abre detalhes
  if(ev.source === 'alerta' && ev.read === true){
    return;
  }

  const rec = getEventRecord(ev) || {};
  const description = rec.message || rec.body || rec.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.';
  const location = rec.location || rec.local || '';
  const neighborhood = rec.neighborhood || rec.bairro || '';

  const modalEl = document.getElementById('viewAlertModal');
  if(!modalEl || !window.bootstrap) return;

  const titleEl = modalEl.querySelector('#viewAlertModalLabel');
  if(titleEl){
    titleEl.textContent = (ev.source === 'notificacao') ? 'Detalhes da Notificação' : 'Detalhes do Alerta';
  }

  const body = modalEl.querySelector('.modal-body');
  if(body){
    const badge = ev.urgent ? '<span class="badge bg-danger">Urgente</span>' : '<span class="badge bg-secondary">Normal</span>';
    body.innerHTML = `
      <div class="d-flex align-items-start p-3 mb-3 bg-light rounded">
        <div class="alert-icon ${ev.urgent ? 'bg-danger' : 'bg-info'} me-3">
          <i class="fas ${ev.urgent ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
        </div>
        <div class="flex-grow-1">
          <div class="fw-bold fs-5">${String(ev.title||'').trim()}</div>
          <small class="text-muted">
            ${(ev.source==='notificacao') ? '🔔 Notificação' : '🚨 Alerta'} • ${formatTimeAgo(ev.timestamp||new Date().toISOString())}
            ${location ? ' • ' + location : ''}${neighborhood ? ' • ' + neighborhood : ''}
          </small>
        </div>
        <div>${badge}</div>
      </div>

      <div class="card">
        <div class="card-header bg-light"><h6 class="mb-0"><i class="fas fa-align-left me-2"></i>Descrição</h6></div>
        <div class="card-body">
          <div class="notification-details">
            <p class="mb-2">${String(description).trim()}</p>
            <ul class="list-unstyled small text-muted mb-0">
              <li><strong>Origem:</strong> ${(ev.source==='notificacao') ? 'Notificação do Sistema' : 'Alerta do Sistema'}</li>
              ${location ? `<li><strong>Local:</strong> ${location}</li>` : ``}
              ${neighborhood ? `<li><strong>Bairro:</strong> ${neighborhood}</li>` : ``}
              <li><strong>Horário:</strong> ${formatTimeAgo(ev.timestamp||new Date().toISOString())}</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  // marcar alerta como lido ao abrir (e bloquear depois)
  if(ev.source === 'alerta' && Array.isArray(alertsData)){
    const rec2 = getEventRecord(ev);
    if(rec2) rec2.read = true;
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  try{ markNotificationAsSeenByEvent(ev); }catch(e){}
  try{ renderNotifications(); }catch(e){}
  try{ updateSidebarCounters(); }catch(e){}


  if(typeof renderAlertsSummary === 'function'){
    setTimeout(()=>{ try{ renderAlertsTimeline(); }catch(e){} }, 50);
  }
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-action="view-event"]');
  if(!btn) return;
  const id = btn.getAttribute('data-event-id');
  if(!id) return;
  openEventDetails(id);
});


/* ================================================= */
/* LISTA DE ALERTAS – RENDER TIMELINE                */
/* ================================================= */

function renderAlertsTimeline(){
  const container = document.getElementById('alerts-timeline');
  if(!container) return;

  const items = (typeof buildAlertsSummary === 'function')
    ? buildAlertsSummary()
    : [];

  if(items.length === 0){
    container.innerHTML = '<div class="text-muted text-center p-4">Nenhum alerta no momento.</div>';
    return;
  }

  updateSidebarCounters();

  container.innerHTML = items.map(a=>{
    const typeLabel = a.source === 'alerta' ? '🚨 Alerta' : '🔔 Notificação';
    const time = formatTimeAgo(a.timestamp);
    const urgent = a.urgent ? '<span class="badge bg-danger ms-2">Urgente</span>' : '';
    const canOpen = !(a.source === 'alerta' && a.read === true);

    return `
      <div class="alert-item ${a.source}">
        <div></div>
        <div>
          <div class="alert-item-header">
            <div class="alert-item-title">${typeLabel}${urgent}</div>
            <div class="alert-item-meta">${time}</div>
          </div>
          <div class="alert-item-body">
            ${a.title}
          </div>
          <div class="alert-item-actions">
            ${canOpen
              ? `<button class="btn btn-sm btn-outline-secondary" data-action="view-event" data-event-id="${a.id}">Ver detalhes</button>`
              : `<span class="text-muted small">Alerta já lido</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('');
  updateSidebarCounters();
}



/* ================================================= */
/* Counters dinâmicos no sidebar                     */
/* ================================================= */
function updateSidebarCounters(){
  function setCounter(el, next){
    if(!el) return;
    const prev = el.getAttribute('data-prev') || el.textContent || '0';
    el.textContent = String(next);
    el.setAttribute('data-prev', String(next));
    el.classList.toggle('is-zero', Number(next) === 0);
    if(String(prev) !== String(next)){
      el.classList.remove('badge-pop');
      // reflow
      void el.offsetWidth;
      el.classList.add('badge-pop');
    }
  }

  const notifEl = document.getElementById('nav-counter-notifications');
  const alertsEl = document.getElementById('nav-counter-alerts');

    const notifs = buildNotificationsFeed().filter(n=>!n.seen);
  const alerts = Array.isArray(alertsData) ? alertsData.filter(a=>{
    const src = a.source || 'alerta';
    const isAlert = src === 'alerta';
    const unread = a.read !== true;
    return isAlert && unread;
  }) : [];

  if(notifEl){ setCounter(notifEl, notifs.length); }
  if(alertsEl){ setCounter(alertsEl, alerts.length); }
}


function markNotificationAsSeenByEvent(ev){
  if(!ev || ev.source !== 'notificacao') return;
  if(!Array.isArray(notificationsData)) return;
  // match by title+timestamp
  const ts = new Date(ev.timestamp||0).toISOString().slice(0,16);
  const t = String(ev.title||'').toLowerCase().slice(0,60);
  const found = notificationsData.find(n=>{
    const nt = String(n.title||n.subject||'').toLowerCase().slice(0,60);
    const nts = new Date(n.timestamp||0).toISOString().slice(0,16);
    return nt === t && nts === ts;
  });
  if(found) found.seen = true;
}


document.addEventListener('click', (e)=>{
  const link = e.target.closest('[data-view]');
  if(!link) return;
  e.preventDefault();
  const view = link.getAttribute('data-view');
  if(view){ showView(view); try{ flashViewHeader(view);}catch(e){} }
});


function normalizeNavBadges(){
  document.querySelectorAll('.sidebar .nav-counter, .sidebar .badge, .sidebar .count').forEach(el=>{
    const n = Number((el.textContent||'').trim());
    if(Number.isFinite(n) && n === 0){
      el.classList.add('is-zero');
    }
  });
}
document.addEventListener('DOMContentLoaded', normalizeNavBadges);


document.addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if(!btn || !btn.textContent.toLowerCase().includes('detalhes')) return;
  const item = btn.closest('.alert-item');
  if(!item) return;
  item.classList.add('opening');
  setTimeout(()=>item.classList.remove('opening'), 400);
});


/* ================================================= */
/* REALTIME READY – Event Bus                        */
/* ================================================= */
const EventBus = {
  events: {},
  on(event, handler){
    (this.events[event] = this.events[event] || []).push(handler);
  },
  emit(event, payload){
    (this.events[event] || []).forEach(h => h(payload));
  }
};

function ingestEvent(ev){
  if(!ev || !ev.type) return;

  if(ev.type === 'notification' || ev.type === 'info' || ev.type === 'system'){
    notificationsData.unshift({
      id: ev.id || Date.now(),
      title: ev.title,
      kind: ev.type === 'system' ? 'system' : 'info',
      description: ev.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.',
      timestamp: ev.timestamp || new Date().toISOString(),
      seen: false
    });
    EventBus.emit('notifications:new', ev);
  }

  if(ev.type === 'message'){
    messagesData.unshift({
      id: ev.id || Date.now(),
      sender: ev.sender || 'Sistema',
      title: ev.title,
      kind: ev.type === 'system' ? 'system' : 'info',
      body: ev.body || '',
      timestamp: ev.timestamp || new Date().toISOString(),
      read: false
    });
    EventBus.emit('messages:new', ev);
  }

  if(ev.type === 'alert'){
    alertsData.unshift({
      id: ev.id || Date.now(),
      title: ev.title,
      kind: ev.type === 'system' ? 'system' : 'info',
      description: ev.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.',
      status: ev.status || 'Ativo',
      timestamp: ev.timestamp || new Date().toISOString(),
      read: false
    });
    EventBus.emit('alerts:new', ev);
  }

  if(typeof updateSidebarCounters === 'function') updateSidebarCounters();
}

function connectRealtime(){
  // WebSocket/SSE entra aqui no futuro
}

EventBus.on('notifications:new', ()=>{
  if(typeof renderNotifications === 'function') renderNotifications();
});
EventBus.on('messages:new', ()=>{
  if(typeof renderMessages === 'function') renderMessages();
});
EventBus.on('alerts:new', ()=>{
  if(typeof renderAlertsTimeline === 'function') renderAlertsTimeline();
});

document.addEventListener('DOMContentLoaded', connectRealtime);


/* ================================================= */
/* CAPTURE_VIEW_NAV: Sidebar data-view navigation             */
/* (capture phase to bypass stopPropagation)         */
/* ================================================= */
(function(){
  function handleViewNav(e){
    const link = e.target.closest('[data-view]');
    if(!link) return;
    const viewId = link.getAttribute('data-view');
    if(!viewId) return;

    // Only handle our internal views
    const target = document.getElementById(viewId + '-view');
    if(!target) return;

    e.preventDefault();
    try{ showView(viewId); }catch(err){}
  }

  // capture = true (runs before bubbling handlers)
  document.addEventListener('click', handleViewNav, true);
})();

// Expose for inline handlers
try{ window.showView = showView; }catch(e){}

function flashViewHeader(viewId){
  const v = document.getElementById(viewId + '-view');
  if(!v) return;
  const h = v.querySelector('.page-header, h1');
  if(!h) return;
  h.classList.add('opening');
  setTimeout(()=>h.classList.remove('opening'), 350);
}


/* ================================================= */
/* NOTIFICAÇÕES – tipos: alert | info | system       */
/* ================================================= */
function buildNotificationsFeed(){
  const feed = [];

  // Alerts as notifications
  if(Array.isArray(alertsData)){
    alertsData.forEach(a=>{
      feed.push({
        id: 'alert:' + a.id,
        kind: 'alert',
        title: a.title || 'Alerta',
        description: a.description || 'Esta notificação foi atualizada recentemente. Caso novas informações sejam adicionadas, você será avisado.',
        timestamp: a.timestamp,
        seen: a.read === true,
        urgent: (String(a.status||'').toLowerCase() === 'urgente')
      });
    });
  }

  // Info/System notifications stored in notificationsData
  if(Array.isArray(notificationsData)){
    notificationsData.forEach(n=>{
      feed.push({
        id: 'notif:' + (n.id ?? ''),
        kind: n.kind || n.type || 'info',
        title: n.title || n.subject || 'Notificação',
        description: n.description || n.body || '',
        timestamp: n.timestamp,
        seen: n.seen === true,
        urgent: !!n.urgent
      });
    });
  }

  feed.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
  return feed;
}

function markNotificationSeen(item){
  if(!item) return;

  if(item.kind === 'alert'){
    const rawId = String(item.id||'').replace('alert:','');
    const found = Array.isArray(alertsData) ? alertsData.find(a=>String(a.id)===rawId) : null;
    if(found) found.read = true;
    return;
  }

  const rawId = String(item.id||'').replace('notif:','');
  const foundN = Array.isArray(notificationsData) ? notificationsData.find(n=>String(n.id)===rawId) : null;
  if(foundN) foundN.seen = true;
}


document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-action="view-notif"]');
  if(!btn) return;
  e.preventDefault();

  const id = btn.getAttribute('data-notif-id');
  const feed = buildNotificationsFeed();
  const item = feed.find(n=>String(n.id)===String(id));
  if(!item) return;

  markNotificationSeen(item);

  const ev = {
    id: id,
    source: item.kind === 'alert' ? 'alerta' : 'notificacao',
    title: item.title,
    description: item.description,
    status: item.urgent ? 'Urgente' : 'Info',
    timestamp: item.timestamp,
    urgent: item.urgent
  };

  try{ if(typeof openEventDetails === 'function') openEventDetails(ev); }catch(err){}

  try{ renderNotifications(); }catch(err){}
  try{ if(typeof renderAlertsTimeline === 'function') renderAlertsTimeline(); }catch(err){}
  try{ if(typeof updateSidebarCounters === 'function') updateSidebarCounters(); }catch(err){}
});


let currentNotifFilter = 'all';

function applyNotifFilter(kind){
  currentNotifFilter = kind;
  document.querySelectorAll('.nf-btn').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-nf')===kind);
  });
  renderNotifications();
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.nf-btn');
  if(!btn) return;
  applyNotifFilter(btn.getAttribute('data-nf'));
});


/* ================================================= */
/* Lista de Alertas – filtros funcionais             */
/* ================================================= */
let currentAlertsFilter = 'all';

function applyAlertsFilter(kind){
  currentAlertsFilter = kind || 'all';
  document.querySelectorAll('[data-af]').forEach(btn=>{
    btn.classList.toggle('active', btn.getAttribute('data-af') === currentAlertsFilter);
  });
  try{ if(typeof renderAlertsTimeline === 'function') renderAlertsTimeline(); }catch(e){}
  try{ if(typeof renderAlertsList === 'function') renderAlertsList(); }catch(e){}
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-af]');
  if(!btn) return;
  e.preventDefault();
  applyAlertsFilter(btn.getAttribute('data-af'));
});

function getFilteredAlertsFeed(){
  let items = [];
  if(Array.isArray(alertsData)){
    items = items.concat(alertsData.map(a=>({...(a||{}), source: (a.source||'alerta')})));
  }
  const kind = currentAlertsFilter || 'all';
  if(kind === 'all') return items;
  return items.filter(it => String(it.source||'').toLowerCase() === String(kind).toLowerCase());
}

document.addEventListener('DOMContentLoaded', ()=> applyAlertsFilter('all'));

function setupAlertsListRowOpenBehavior(){
  const tbody = document.getElementById('full-alerts-table-body');
  if(!tbody) return;

  tbody.addEventListener('click', (e)=>{
    const row = e.target.closest('tr[data-source]');
    if(!row) return;
    const id = Number(row.getAttribute('data-id'));
    const source = String(row.getAttribute('data-source') || '').toLowerCase();

    if(source === 'notificacao' && Array.isArray(alertsData)){
      const item = alertsData.find(x => Number(x.id) === id);
      if(item){
        item.read = true;
        if(typeof updateNotificationBadges === 'function') updateNotificationBadges();
        if(typeof displayPage === 'function') displayPage(currentPage || 1);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ setupAlertsListRowOpenBehavior(); }catch(e){}
});
