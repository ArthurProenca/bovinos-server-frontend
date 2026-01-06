document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
    SERVER_DNS: 'minecraft.reminis.link', // Seu DNS fixo
    API_STATUS: 'https://api.mcsrvstat.us/3/',
    API_BACKUP: 'https://mcapi.us/server/status?ip=', 
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
    loadingText: document.querySelector('#view-loading p')
};

let isBooting = false;

async function init() {
    // Configura botões
    DOM.actions.copy.addEventListener('click', () => {
        copyToClipboard(CONFIG.SERVER_DNS);
    });

    DOM.actions.start.addEventListener('click', startServer);

    // Seta o DNS na tela inicial imediatamente
    DOM.info.dns.textContent = CONFIG.SERVER_DNS;

    // Começa verificando se já está ON
    checkServerStatus();
}

async function startServer() {
    // 1. UI Imediata: Mostra carregamento
    isBooting = true;
    DOM.actions.start.disabled = true;
    DOM.actions.startLog.classList.remove('hidden'); // Mostra a barra de progresso
    
    try {
        // Chama a Lambda para ligar a máquina
        const rawResponse = await fetch(CONFIG.API_START);
        // Não precisamos ler o JSON da resposta se o DNS é fixo, 
        // apenas saber que a requisição foi feita com sucesso.
        
        console.log("Comando de start enviado.");

        updateStatusBadge('booting');

        // Muda para a visualização "Online" mas com estado de carregamento
        DOM.info.version.textContent = "Iniciando...";
        DOM.info.players.textContent = "--";
        DOM.info.ping.textContent = "--";
        DOM.info.list.innerHTML = `
            <div style="text-align:center; width:100%; color: var(--primary); margin-top: 10px;">
                <i class="fas fa-satellite-dish fa-spin"></i> Servidor ligando...<br>
                <small style="color:var(--text-muted)">Aguarde ~2 minutos. A página atualizará sozinha.</small>
            </div>
        `;
        
        switchView('online');
        
        // Começa a verificar repetidamente até o server responder no DNS
        startPolling();

    } catch (error) {
        console.error('Falha crítica ao iniciar:', error);
        isBooting = false;
        alert(`Erro ao contatar a AWS: ${error.message}`);
        DOM.actions.start.disabled = false;
        DOM.actions.startLog.classList.add('hidden');
    }
}

async function checkServerStatus(isRetryLoop = false) {
    if (!isRetryLoop && !isBooting) {
        switchView('loading');
        updateStatusBadge('loading');
        if(DOM.loadingText) DOM.loadingText.textContent = "Verificando status...";
    }

    try {
        // Tenta API primária
        const response = await fetch(CONFIG.API_STATUS + CONFIG.SERVER_DNS);
        const data = await response.json();

        if (data.online) {
            renderRealData(data);
            return true;
        } else {
            // Tenta API secundária (backup)
            const backupResponse = await fetch(CONFIG.API_BACKUP + CONFIG.SERVER_DNS);
            const backupData = await backupResponse.json();

            if (backupData.online) {
                renderRealData({
                    version: backupData.server.name,
                    players: { online: backupData.players.now, list: [] },
                    hostname: CONFIG.SERVER_DNS,
                    ip: CONFIG.SERVER_DNS,
                    port: 25565
                });
                return true;
            } else {
                throw new Error('Offline');
            }
        }
    } catch (error) {
        // Se estiver no processo de boot (polling), não joga para a tela de offline ainda
        if (isBooting) return false;

        console.log('Servidor offline:', error);
        switchView('offline');
        updateStatusBadge('offline');
        DOM.actions.start.disabled = false;
        DOM.actions.startLog.classList.add('hidden'); // Esconde barra de progresso se voltar pra offline
        return false;
    }
}

function renderRealData(data) {
    isBooting = false; // Se renderizou dados reais, não está mais "booting"
    
    DOM.info.version.textContent = data.version || 'Paper/Spigot';
    DOM.info.players.textContent = data.players.online;
    
    // Renderiza lista de jogadores
    DOM.info.list.innerHTML = '';
    if (data.players.list && data.players.list.length > 0) {
        data.players.list.forEach(player => {
            const span = document.createElement('span');
            span.className = 'player-tag';
            // Tenta pegar a cabeça do player, se não der usa o Steve
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
    
    // Mede ping do cliente (browser) até o servidor (http check fake ou real)
    measureClientPing(CONFIG.SERVER_DNS, 25565);
}

function startPolling() {
    let attempts = 0;
    const maxAttempts = 40; // Tenta por uns 3-4 minutos (40 * 5s = 200s)

    const interval = setInterval(async () => {
        attempts++;
        // Chama checkServerStatus passando true para não resetar a view de loading
        const isOnline = await checkServerStatus(true);
        
        if (isOnline) {
            clearInterval(interval);
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            isBooting = false;
            
            // Feedback visual de timeout
            const statusDiv = DOM.info.list.querySelector('div');
            if(statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> O servidor demorou para responder.<br>Tente recarregar a página.`;
            }
            DOM.actions.start.disabled = false;
        }
    }, 5000); // Checa a cada 5 segundos
}

function switchView(viewName) {
    // Se está bootando, não deixa voltar pra view offline automaticamente
    if (isBooting && viewName === 'offline') return;

    Object.values(DOM.views).forEach(el => {
        if(el) {
            el.classList.remove('active');
            el.classList.add('hidden');
        }
    });
    
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
        text.textContent = 'Verificando...';
    }
}

function measureClientPing(ip, port) {
    const start = performance.now();
    // Tenta um fetch simples. Vai dar erro de CORS provavelmente, 
    // mas o tempo de erro serve como estimativa de latência
    fetch(`http://${ip}:${port}`, { mode: 'no-cors' })
        .then(() => DOM.info.ping.textContent = `${Math.round(performance.now() - start)}ms`)
        .catch(() => DOM.info.ping.textContent = "On");
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        DOM.actions.copyMsg.classList.add('visible');
        setTimeout(() => DOM.actions.copyMsg.classList.remove('visible'), 2000);
    }).catch(console.error);
}