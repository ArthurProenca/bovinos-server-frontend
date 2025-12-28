document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
    // API Principal (com cache, mas rica em dados)
    API_STATUS: 'https://api.mcsrvstat.us/3/',
    // API Secundária (Fallback, geralmente mais rápida para detectar mudanças)
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
    }
};

// Variável para controlar se estamos num loop de inicialização
let isBooting = false;

async function init() {
    // 1. Configura eventos globais
    // O copy agora lê o conteúdo atual do elemento, pois o DNS pode mudar sem reload
    DOM.actions.copy.addEventListener('click', () => {
        const textToCopy = DOM.info.dns.textContent;
        if (textToCopy && textToCopy !== '...') copyToClipboard(textToCopy);
    });
    
    DOM.actions.start.addEventListener('click', startServer);

    // 2. Tenta recuperar DNS salvo
    const currentDns = localStorage.getItem("dns");
    
    if (currentDns && currentDns !== "null") {
        // Se já temos um DNS, mostramos na tela e checamos o status
        DOM.info.dns.textContent = currentDns;
        checkServerStatus(currentDns);
    } else {
        // Sem DNS = Servidor nunca foi ligado ou cache limpo. 
        // Assume estado Offline direto para permitir ligar.
        console.log("Nenhum DNS salvo. Aguardando inicialização.");
        switchView('offline');
        updateStatusBadge('offline');
    }
}

async function checkServerStatus(dns, isRetryLoop = false) {
    if (!isRetryLoop) {
        switchView('loading');
        updateStatusBadge('loading');
    }

    try {
        // Tenta API Principal
        const response = await fetch(CONFIG.API_STATUS + dns);
        const data = await response.json();

        if (data.online) {
            handleOnline(data);
            return true;
        } else {
            // Se principal deu offline, tenta a secundária (Fallback)
            console.log("API Principal offline, tentando backup...");
            const backupResponse = await fetch(CONFIG.API_BACKUP + dns);
            const backupData = await backupResponse.json();

            if (backupData.online) {
                handleOnline({
                    version: backupData.server.name,
                    players: { online: backupData.players.now, list: [] },
                    hostname: dns,
                    ip: dns,
                    port: 25565
                });
                return true;
            } else {
                throw new Error('Offline em ambas APIs');
            }
        }
    } catch (error) {
        if (isBooting) {
            console.log('Servidor ainda iniciando...');
            return false;
        }
        
        console.warn('Servidor offline:', error);
        switchView('offline');
        updateStatusBadge('offline');
        return false;
    }
}

function handleOnline(data) {
    isBooting = false;
    
    DOM.info.version.textContent = data.version || '?';
    DOM.info.players.textContent = data.players.online;
    // Garante que mostramos o DNS que funcionou (ou o salvo)
    DOM.info.dns.textContent = localStorage.getItem("dns") || data.hostname || data.ip;

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
    measureClientPing(data.ip || data.hostname, data.port || 25565);
}

async function startServer() {
    const btn = DOM.actions.start;
    const log = DOM.actions.startLog;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Solicitando AWS...';
    log.classList.remove('hidden');

    try {
        const rawResponse = await fetch(CONFIG.API_START);
        const response = await rawResponse.json();
        
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        const newDns = body.dns;

        if (newDns) {
            // Salva DNS novo
            localStorage.setItem("dns", newDns);
            DOM.info.dns.textContent = newDns;
            
            btn.innerHTML = '<i class="fas fa-check"></i> Iniciando!';
            
            // Entra em modo de boot
            isBooting = true;
            switchView('loading');
            updateStatusBadge('loading');
            
            const loadingText = document.querySelector('#view-loading p');
            if(loadingText) loadingText.innerHTML = `Servidor iniciando em: <br><code style="color:var(--primary)">${newDns}</code><br>Aguardando resposta...`;

            // Começa a checar se ficou online
            startPolling(newDns);

        } else {
            throw new Error("DNS não retornado");
        }

    } catch (error) {
        console.error('Erro ao ligar:', error);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro ao Ligar';
        alert('Erro ao comunicar com a AWS. Tente novamente.');
        isBooting = false;
    }
}

function startPolling(dns) {
    let attempts = 0;
    const maxAttempts = 40; // Aumentei um pouco (40 * 5s = ~3 minutos e meio)

    const interval = setInterval(async () => {
        attempts++;
        const isOnline = await checkServerStatus(dns, true);
        
        if (isOnline) {
            clearInterval(interval);
            // Reseta botão para uso futuro
            DOM.actions.start.disabled = false;
            DOM.actions.start.innerHTML = '<i class="fas fa-bolt"></i> Ligar Servidor';
            DOM.actions.startLog.classList.add('hidden');
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            isBooting = false;
            switchView('offline');
            alert("O servidor demorou muito para responder. Tente recarregar a página manualmente.");
        }
    }, 5000); 
}

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
    } else {
        badge.classList.add('loading');
        text.textContent = isBooting ? 'Iniciando...' : 'Verificando';
    }
}

function measureClientPing(ip, port) {
    const start = performance.now();
    fetch(`http://${ip}:${port}`, { mode: 'no-cors' })
        .then(() => {
            const ms = Math.round(performance.now() - start);
            DOM.info.ping.textContent = `${ms}ms`;
        })
        .catch(() => {
            DOM.info.ping.textContent = "--"; 
        });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        DOM.actions.copyMsg.classList.add('visible');
        setTimeout(() => DOM.actions.copyMsg.classList.remove('visible'), 2000);
    }).catch(err => console.error('Falha ao copiar', err));
}