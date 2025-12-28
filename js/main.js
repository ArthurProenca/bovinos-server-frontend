document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
    // API Principal (com cache)
    API_STATUS: 'https://api.mcsrvstat.us/3/',
    // API Backup (Fallback rápido)
    API_BACKUP: 'https://mcapi.us/server/status?ip=', 
    // Sua URL da Lambda
    API_START: 'https://l5y1ma3oq2.execute-api.sa-east-1.amazonaws.com/start-server'
};

const DOM = {
    views: {
        loading: document.getElementById('view-loading'),
        online: document.getElementById('view-online'),
        offline: document.getElementById('view-offline')
    },
    status: {
        badge: document.getElementById('status-indicator'),
        text: document.getElementById('status-text')
    },
    info: {
        ping: document.getElementById('ping-value'),
        version: document.getElementById('version-value'),
        players: document.getElementById('players-count'),
        list: document.getElementById('players-list'),
        dns: document.getElementById('dns-address')
    },
    actions: {
        copy: document.getElementById('btn-copy'),
        copyMsg: document.getElementById('copy-feedback'),
        start: document.getElementById('btn-start'),
        startLog: document.getElementById('start-feedback')
    },
    // Referência para o texto de loading
    loadingText: document.querySelector('#view-loading p')
};

// Flag para saber se estamos no processo de ligar
let isBooting = false;

async function init() {
    DOM.actions.copy.addEventListener('click', () => {
        const text = DOM.info.dns.textContent;
        if (text && text !== '...') copyToClipboard(text);
    });

    DOM.actions.start.addEventListener('click', startServer);

    const currentDns = localStorage.getItem("dns");
    
    if (currentDns && currentDns !== "null") {
        DOM.info.dns.textContent = currentDns;
        checkServerStatus(currentDns);
    } else {
        switchView('offline');
        updateStatusBadge('offline');
    }
}

async function startServer() {
    // 1. FEEDBACK IMEDIATO (Antes de chamar a AWS)
    // Oculta a tela offline e mostra o spinner geral
    switchView('loading');
    updateStatusBadge('loading');
    if(DOM.loadingText) DOM.loadingText.textContent = "Contatando satélite AWS...";
    
    // Reseta logs de erro antigos
    DOM.actions.start.disabled = true;

    try {
        // 2. Chama a Lambda (Isso pode demorar 5-10s)
        const rawResponse = await fetch(CONFIG.API_START);
        
        if (!rawResponse.ok) {
            throw new Error(`Erro HTTP: ${rawResponse.status}`);
        }

        const response = await rawResponse.json();
        
        // Parse seguro do body da AWS (às vezes vem stringificado)
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        const newDns = body.dns;

        if (newDns) {
            // 3. SUCESSO DA LAMBDA
            localStorage.setItem("dns", newDns);
            DOM.info.dns.textContent = newDns;
            
            // Atualiza status para modo "Booting"
            isBooting = true;
            updateStatusBadge('booting');

            // Prepara a interface "Online Provisória"
            // Assim o usuário já vê o IP para copiar enquanto o server carrega
            setupProvisoryOnlineView();
            
            // Inicia o polling para saber quando o Minecraft realmente subiu
            startPolling(newDns);

        } else {
            throw new Error("A AWS respondeu, mas sem DNS.");
        }

    } catch (error) {
        console.error('Falha ao iniciar:', error);
        
        // Se der erro, volta para a tela Offline para tentar de novo
        isBooting = false;
        switchView('offline');
        updateStatusBadge('offline');
        
        // Reabilita o botão
        DOM.actions.start.disabled = false;
        alert(`Não foi possível ligar o servidor.\nDetalhe: ${error.message || 'Erro desconhecido'}`);
    }
}

function setupProvisoryOnlineView() {
    DOM.info.version.textContent = "Iniciando...";
    DOM.info.players.textContent = "--";
    DOM.info.ping.textContent = "--";
    
    // Feedback visual na lista de players
    DOM.info.list.innerHTML = `
        <div style="text-align:center; width:100%; color: var(--primary); margin-top: 10px;">
            <i class="fas fa-satellite-dish fa-spin"></i> Servidor ligando...<br>
            <small style="color:var(--text-muted)">Copie o IP acima. Conexão liberada em ~2 min.</small>
        </div>
    `;
    
    // Mostra a tela Online (mesmo que os dados ainda sejam falsos/loading)
    switchView('online');
}

async function checkServerStatus(dns, isRetryLoop = false) {
    if (!isRetryLoop && !isBooting) {
        switchView('loading');
        updateStatusBadge('loading');
        if(DOM.loadingText) DOM.loadingText.textContent = "Verificando status...";
    }

    try {
        const response = await fetch(CONFIG.API_STATUS + dns);
        const data = await response.json();

        if (data.online) {
            renderRealData(data);
            return true;
        } else {
            // Fallback para API secundária
            const backupResponse = await fetch(CONFIG.API_BACKUP + dns);
            const backupData = await backupResponse.json();

            if (backupData.online) {
                renderRealData({
                    version: backupData.server.name,
                    players: { online: backupData.players.now, list: [] },
                    hostname: dns,
                    ip: dns,
                    port: 25565
                });
                return true;
            } else {
                throw new Error('Offline');
            }
        }
    } catch (error) {
        // Se estiver bootando, ignoramos erros de conexão (o servidor ainda tá subindo)
        if (isBooting) return false;

        console.warn('Check failed:', error);
        switchView('offline');
        updateStatusBadge('offline');
        DOM.actions.start.disabled = false; // Garante que o botão destrave
        return false;
    }
}

function renderRealData(data) {
    isBooting = false; // Sai do modo boot, dados agora são reais
    
    DOM.info.version.textContent = data.version || '?';
    DOM.info.players.textContent = data.players.online;
    DOM.info.dns.textContent = localStorage.getItem("dns") || data.hostname;

    DOM.info.list.innerHTML = '';
    if (data.players.list && data.players.list.length > 0) {
        data.players.list.forEach(player => {
            const span = document.createElement('span');
            span.className = 'player-tag';
            const imgUrl = player.uuid 
                ? `https://api.mineatar.io/head/${player.uuid}` 
                : `https://api.mineatar.io/head/Steve`; 
            span.innerHTML = `<img src="${imgUrl}" alt=""> ${player.name}`;
            DOM.info.list.appendChild(span);
        });
    } else {
        DOM.info.list.innerHTML = '<span style="color:var(--text-muted); font-size: 0.9rem;">Ninguém online.</span>';
    }

    switchView('online');
    updateStatusBadge('online');
    measureClientPing(data.ip || data.hostname, 25565);
}

function startPolling(dns) {
    let attempts = 0;
    const maxAttempts = 60; // Tenta por 5 minutos (60 * 5s)

    const interval = setInterval(async () => {
        attempts++;
        const isOnline = await checkServerStatus(dns, true);
        
        if (isOnline) {
            clearInterval(interval);
            resetStartButton();
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            isBooting = false;
            // Timeout visual (mas não muda a tela pra não atrapalhar quem tá copiando IP)
            DOM.info.list.innerHTML = '<span style="color:var(--danger)">Demorou muito para responder. Tente atualizar a página.</span>';
            resetStartButton();
        }
    }, 5000); 
}

function resetStartButton() {
    DOM.actions.start.disabled = false;
}

// Utilitários UI
function switchView(viewName) {
    if (isBooting && viewName === 'offline') return;

    Object.values(DOM.views).forEach(el => el.classList.remove('active'));
    Object.values(DOM.views).forEach(el => el.classList.add('hidden'));
    
    if(DOM.views[viewName]) {
        DOM.views[viewName].classList.remove('hidden');
        DOM.views[viewName].classList.add('active');
    }
}

function updateStatusBadge(status) {
    const badge = DOM.status.badge;
    const text = DOM.status.text;
    
    badge.className = 'status-badge'; 
    
    if (status === 'online') {
        badge.classList.add('online');
        text.textContent = 'Online';
    } else if (status === 'offline') {
        badge.classList.add('offline');
        text.textContent = 'Offline';
    } else if (status === 'booting') {
        badge.classList.add('loading');
        text.textContent = 'Iniciando...';
    } else {
        badge.classList.add('loading');
        text.textContent = 'Carregando...';
    }
}

function measureClientPing(ip, port) {
    const start = performance.now();
    fetch(`http://${ip}:${port}`, { mode: 'no-cors' })
        .then(() => DOM.info.ping.textContent = `${Math.round(performance.now() - start)}ms`)
        .catch(() => DOM.info.ping.textContent = "--");
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        DOM.actions.copyMsg.classList.add('visible');
        setTimeout(() => DOM.actions.copyMsg.classList.remove('visible'), 2000);
    }).catch(console.error);
}