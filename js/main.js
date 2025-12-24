document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
    DEFAULT_DNS: 'mc-bovinos.friday.codes', // DNS padrão caso o localStorage esteja vazio
    API_STATUS: 'https://api.mcsrvstat.us/3/',
    API_START: 'https://l5y1ma3oq2.execute-api.sa-east-1.amazonaws.com/start-server'
};

// Elementos do DOM (Cache para performance)
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

async function init() {
    // Recupera DNS salvo ou usa o padrão
    let currentDns = localStorage.getItem("dns");
    if (!currentDns || currentDns === "null") {
        currentDns = CONFIG.DEFAULT_DNS;
        localStorage.setItem("dns", currentDns);
    }
    
    DOM.info.dns.textContent = currentDns;
    
    // Configura eventos
    DOM.actions.copy.addEventListener('click', () => copyToClipboard(currentDns));
    DOM.actions.start.addEventListener('click', startServer);

    // Checagem inicial
    checkServerStatus(currentDns);
}

async function checkServerStatus(dns) {
    switchView('loading');
    updateStatusBadge('loading');

    try {
        const response = await fetch(CONFIG.API_STATUS + dns);
        const data = await response.json();

        if (data.online) {
            // Servidor Online
            renderOnlineData(data);
            switchView('online');
            updateStatusBadge('online');
            // Medir ping real do cliente (opcional, pois a API já traz info)
            measureClientPing(data.ip, data.port);
        } else {
            // Servidor Offline
            throw new Error('Offline');
        }
    } catch (error) {
        console.warn('Servidor offline ou erro:', error);
        switchView('offline');
        updateStatusBadge('offline');
    }
}

function renderOnlineData(data) {
    DOM.info.version.textContent = data.version || '?';
    DOM.info.players.textContent = data.players.online;
    DOM.info.dns.textContent = data.hostname || localStorage.getItem("dns");

    // Renderizar lista de jogadores
    DOM.info.list.innerHTML = '';
    if (data.players.list && data.players.list.length > 0) {
        data.players.list.forEach(player => {
            const span = document.createElement('span');
            span.className = 'player-tag';
            // Tenta pegar a cabeça do jogador (API externa comum de skins)
            span.innerHTML = `<img src="https://api.mineatar.io/head/${player.uuid}" alt=""> ${player.name}`;
            DOM.info.list.appendChild(span);
        });
    } else {
        DOM.info.list.innerHTML = '<span style="color:var(--text-muted); font-size: 0.9rem;">Ninguém online no momento.</span>';
    }
}

async function startServer() {
    const btn = DOM.actions.start;
    const log = DOM.actions.startLog;
    
    // UI Update para estado "Ligando"
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Solicitando AWS...';
    log.classList.remove('hidden');

    try {
        const rawResponse = await fetch(CONFIG.API_START);
        const response = await rawResponse.json();
        
        // AWS Lambda retorna body como string as vezes, parse necessário
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        const newDns = body.dns;

        if (newDns) {
            localStorage.setItem("dns", newDns);
            DOM.info.dns.textContent = newDns;
            
            btn.innerHTML = '<i class="fas fa-check"></i> Comando Enviado!';
            document.querySelector('#start-feedback p').textContent = "Servidor ligando! A página recarregará em breve.";
            
            // Polling para verificar quando ficar online
            setTimeout(() => {
                location.reload(); 
            }, 10000); // Recarrega em 10s para tentar checar o status novo
        } else {
            throw new Error("DNS não retornado pela API");
        }

    } catch (error) {
        console.error('Erro ao ligar:', error);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro ao Ligar';
        alert('Erro ao comunicar com a AWS. Tente novamente.');
    }
}

// Utilitários de UI
function switchView(viewName) {
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
    
    badge.className = 'status-badge'; // reset
    
    if (status === 'online') {
        badge.classList.add('online');
        text.textContent = 'Online';
    } else if (status === 'offline') {
        badge.classList.add('offline');
        text.textContent = 'Offline';
    } else {
        badge.classList.add('loading');
        text.textContent = 'Verificando';
    }
}

function measureClientPing(ip, port) {
    const start = performance.now();
    // O navegador bloqueia pings TCP reais, isso é apenas um fetch HTTP
    // Se o servidor MC não tiver um webserver na porta, vai falhar, 
    // mas serve para medir latência de rede aproximada se houver resposta (mesmo 404)
    fetch(`http://${ip}:${port}`, { mode: 'no-cors' })
        .then(() => {
            const ms = Math.round(performance.now() - start);
            DOM.info.ping.textContent = `${ms}ms`;
        })
        .catch(() => {
            // Fallback comum: se falhar (o que é normal pra MC server puro), 
            // deixamos um valor visual ou usamos o da API se disponível
            DOM.info.ping.textContent = "Ok"; 
        });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        DOM.actions.copyMsg.classList.add('visible');
        setTimeout(() => DOM.actions.copyMsg.classList.remove('visible'), 2000);
    }).catch(err => {
        console.error('Falha ao copiar', err);
        // Fallback antigo se necessário
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        DOM.actions.copyMsg.classList.add('visible');
    });
}