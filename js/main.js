document.addEventListener('DOMContentLoaded', () => {
    checkServerStatus("https://api.mcsrvstat.us/3/mc-bovinos.friday.codes");
});

async function isServerOn(apiResponse) {
    const data = await apiResponse;
    return data.debug.ping;
}

async function checkServerStatus(url) {
    document.getElementById('spinnerLoading').style.display = 'block';

    try {
        const response = await fetch(url);
        const apiResponse = response.json();

        if (await isServerOn(apiResponse)) {
            const data = await apiResponse;
            const serverIp = data.ip;
            const serverPort = data.port;
            const dnsAddress = data.hostname;

            const dnsAddressElement = document.getElementById('dnsAddress');
            dnsAddressElement.textContent = dnsAddress;

            updatePageWithServerData(data);

            measurePing(serverIp, serverPort);

            document.getElementById("gridOnline").style.display = 'grid';
            document.getElementById("gridOffline").style.display = 'none';

        } else {
            throw new Error('Server is offline');
        }
    } catch (error) {
        console.error('Error fetching server data:', error);
        document.getElementById("gridOnline").style.display = 'none';
        document.getElementById("gridOffline").style.display = 'flex';
    } finally {
        document.getElementById('spinnerLoading').style.display = 'none';
    }
}

function updatePageWithServerData(data) {
    const versionElement = document.querySelector('.status .fa-tag + span');
    versionElement.textContent = data.version;

    const playersElement = document.querySelector('.status .fa-users + span');
    playersElement.textContent = `${data.players.online} Players`;

    const playersListSection = document.querySelector('.playersSection');
    playersListSection.innerHTML

    if (data.players.list !== undefined) {
        data.players.list.forEach(player => {
            const playerSpan = document.createElement('span');
            playerSpan.textContent = player.name;
            playersListSection.appendChild(playerSpan);
        });
    }

}

function measurePing(ip, port) {
    const start = performance.now();

    fetch(`${ip}:${port}`, { method: 'GET' })
        .then(response => {
            const end = performance.now();
            const pingTime = Math.round(end - start);

            const pingElement = document.querySelector('.status .fa-globe + span');
            pingElement.textContent = `${pingTime}ms`;
        })
        .catch(error => {
            console.error('Error measuring ping:', error);
            const pingElement = document.querySelector('.status .fa-globe + span');
            pingElement.textContent = 'N/A';
        });
}

async function startServer() {
    document.getElementById('spinnerLoading').style.display = 'block';
    document.getElementById("gridOffline").style.display = 'none';

    try {
        var response = await fetch('https://l5y1ma3oq2.execute-api.sa-east-1.amazonaws.com/start-server', { method: 'GET' });
        response = await response.json();
        if (response.online !== undefined) {
            document.getElementById("gridOnline").style.display = 'grid';
            document.getElementById("gridOffline").style.display = 'none';

            document.getElementById("playersList").style.display = 'none';
            document.getElementById("status").style.display = 'none';

        }


        //checkServerStatus("https://api.mcsrvstat.us/3/mc-bovinos.friday.codes");
    } catch (error) {
        console.error('Error starting server:', error);
    } finally {
        document.getElementById('spinnerLoading').style.display = 'none';
    }
}

function copyToClipboard() {
    var dnsAddress = document.getElementById('dnsAddress').innerText;
    var textarea = document.createElement('textarea');
    textarea.value = dnsAddress;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    var dnsSpan = document.getElementById('dnsAddress');
    dnsSpan.innerHTML = 'Copiado com sucesso! =)';
    dnsSpan.style.color = '#4CAF50';

    setTimeout(() => {
        dnsSpan.innerHTML = 'mc-bovinos.friday.codes';
        dnsSpan.style.color = '#ffffff';
    }, 3000);
}
