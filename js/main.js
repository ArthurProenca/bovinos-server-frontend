document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
    // API Principal
    API_STATUS: 'https://api.mcsrvstat.us/3/',
    // API Backup
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

let isBooting = false;

async function init() {
    // Configura Botão Copiar
    DOM.actions.copy.addEventListener('click', () => {
        const text = DOM.info.dns.textContent;
        if (text && text !== '...') copyToClipboard(text);
    });

    DOM.actions.start.addEventListener('click', startServer);

    // Recupera DNS
    const currentDns = localStorage.getItem("dns");
    
    if (currentDns && currentDns !== "null") {
        DOM.info.dns.textContent = currentDns;
        checkServerStatus(currentDns);
    } else {
        // Sem DNS salvo = Estado Offline
        switchView('offline');
        updateStatusBadge('offline');
    }
}

async function startServer() {
    const btn = DOM.actions.start;
    const log = DOM.actions.startLog;
    
    // Feedback visual imediato no botão
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Chamando AWS...';
    log.classList.remove('hidden');

    try {
        const rawResponse = await fetch(CONFIG.API_START);
        const response = await rawResponse.json();
        
        // Parse do body da AWS
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        const newDns = body.dns;

        if (newDns) {
            localStorage.setItem("dns", newDns);
            
            // --- AQUI ESTÁ A MUDANÇA ---
            // 1. Mostra o DNS imediatamente
            DOM.info.dns.textContent = newDns;
            
            // 2. Prepara a tela de "Online" com dados provisórios
            DOM.info.version.textContent = "Carregando...";
            DOM.info.players.textContent = "--";
            DOM.info.ping.textContent = "--";
            DOM.info.list.innerHTML = `
                <div style="text-align:center; width:100%; color: var(--primary);">
                    <i class="fas fa-cog fa-spin"></i> O servidor está subindo...<br>
                    <small style="color:var(--text-muted)">Pode copiar o IP e tentar conectar em ~2 min.</small>
                </div>
            `;

            // 3. Muda a view para Online AGORA (não espera a API)
            isBooting = true;
            switchView('online');
            
            // 4. Badge fica "Amarelo/Iniciando"
            updateStatusBadge('booting');

            // 5. Inicia checagem em background para atualizar players quando estiver pronto
            startPolling(newDns);

        } else {
            throw new Error("DNS não veio na resposta");
        }

    } catch (error) {
        console.error('Erro ao ligar:', error);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro ao Ligar';
        alert('Erro ao comunicar com a AWS. Tente novamente.');
        isBooting = false;
    }
}

async function checkServerStatus(dns, isRetryLoop = false) {
    // Se não é loop de retry e não estamos bootando agora, mostra loading normal
    if (!isRetryLoop && !isBooting) {
        switchView('loading');
        updateStatusBadge('loading');
    }

    try {
        const response = await fetch(CONFIG.API_STATUS + dns);
        const data = await response.json();

        if (data.online) {
            renderRealData(data);
            return true;
        } else {
            // Tenta Backup API
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
        // Se estamos no processo de boot (Start clicado recentemente),
        // IGNORA o erro offline. Mantém a tela "Online Provisória" pro usuário ver o IP.
        if (isBooting) {
            return false;
        }
        
        console.warn('Offline:', error);
        switchView('offline');
        updateStatusBadge('offline');
        return false;
    }
}

function renderRealData(data) {
    // O servidor respondeu de verdade!
    isBooting = false; // Sai do modo boot
    
    DOM.info.version.textContent = data.version || '?';
    DOM.info.players.textContent = data.players.online;
    // Garante que o DNS na tela bate com o do storage/api
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
    updateStatusBadge('online'); // Fica verde
    measureClientPing(data.ip || data.hostname, 25565);
}

function startPolling(dns) {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutos tentando

    const interval = setInterval(async () => {
        attempts++;
        const isOnline = await checkServerStatus(dns, true);
        
        if (isOnline) {
            clearInterval(interval);
            resetStartButton();
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            isBooting = false;
            // Se falhou muito tempo, aí sim avisa que caiu
            switchView('offline');
            alert("Timeout: O servidor demorou demais para responder.");
            resetStartButton();
        }
    }, 5000); 
}

function resetStartButton() {
    DOM.actions.start.disabled = false;
    DOM.actions.start.innerHTML = '<i class="fas fa-bolt"></i> Ligar Servidor';
    DOM.actions.startLog.classList.add('hidden');
}

// Utilitários de UI
function switchView(viewName) {
    // Se estiver bootando, proíbe voltar pra offline automaticamente
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
        // Reutiliza estilo de loading (amarelo) mas com texto diferente
        badge.classList.add('loading');
        text.textContent = 'Iniciando...';
    } else {
        badge.classList.add('loading');
        text.textContent = 'Verificando';
    }
}

function measureClientPing(ip, port) {
    const start = performance.now();
    fetch(`http://${ip}:${port}`, { mode: 'no-cors' })
        .then(() => {
            const ms = Math.round(performance.now() - start);
            DOM.info.ping.textContent = `${ms}ms`;
        })
        .catch(() => DOM.info.ping.textContent = "--");
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        DOM.actions.copyMsg.classList.add('visible');
        setTimeout(() => DOM.actions.copyMsg.classList.remove('visible'), 2000);
    }).catch(console.error);
}