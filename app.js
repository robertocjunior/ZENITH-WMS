// A constante PROXY_URL é lida do arquivo config.js
document.addEventListener('DOMContentLoaded', () => {
    // Listeners da página principal
    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
    document.getElementById('filtro-sequencia').addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleConsulta();
    });
    
    // Listener da página de detalhes
    document.getElementById('btn-voltar').addEventListener('click', showMainPage);
    
    // Listeners para os botões de ação (exemplo)
    document.querySelector('.btn-baixar').addEventListener('click', () => alert('Função "Baixar" não implementada.'));
    document.querySelector('.btn-transferir').addEventListener('click', () => alert('Função "Transferir" não implementada.'));
});

// --- FUNÇÕES DE CONTROLE DE PÁGINA ---

function showMainPage() {
    document.getElementById('main-page').classList.add('active');
    document.getElementById('details-page').classList.remove('active');
}

function showDetailsPage() {
    document.getElementById('main-page').classList.remove('active');
    document.getElementById('details-page').classList.add('active');
}


// --- FUNÇÕES DE API E RENDERIZAÇÃO ---

async function handleConsulta() {
    const loading = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');
    const emptyState = document.getElementById('empty-state');
    
    let bearerToken = null;
    resultsContainer.innerHTML = '';
    loading.classList.remove('hidden');
    emptyState.classList.add('hidden');

    try {
        const loginResponse = await fetch(`${PROXY_URL}/login`, { method: 'POST' });
        if (!loginResponse.ok) throw new Error(`Falha na autenticação: ${loginResponse.statusText}`);
        
        const loginData = await loginResponse.json();
        bearerToken = loginData.bearerToken;
        if (!bearerToken) throw new Error('Não foi possível obter o Bearer Token.');

        const sequencia = document.getElementById('filtro-sequencia').value;
        let sqlFinal = "SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = 1";
        if (sequencia) {
            sqlFinal += ` AND ENDE.SEQEND LIKE '${sequencia}%'`;
        }
        const requestBody = {
            "serviceName": "DbExplorerSP.executeQuery",
            "requestBody": { "sql": sqlFinal, "params": {} }
        };
        
        const queryResponse = await fetch(`${PROXY_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, requestBody })
        });
        if (!queryResponse.ok) throw new Error(`Falha na consulta: ${queryResponse.statusText}`);
        const queryData = await queryResponse.json();
        if (queryData.status === "1") {
            renderizarCards(queryData.responseBody.rows);
        } else {
            throw new Error(queryData.statusMessage);
        }
    } catch (error) {
        alert('Erro: ' + error.message);
        emptyState.classList.remove('hidden');
    } finally {
        if (bearerToken) {
            await logoutSankhya(bearerToken);
        }
        loading.classList.add('hidden');
    }
}

async function fetchAndShowDetails(sequencia) {
    const loading = document.getElementById('loading');
    const detailsContent = document.getElementById('details-content');

    loading.classList.remove('hidden');
    detailsContent.innerHTML = '';

    let bearerToken = null;
    try {
        const loginResponse = await fetch(`${PROXY_URL}/login`, { method: 'POST' });
        if (!loginResponse.ok) throw new Error('Falha na autenticação.');
        const loginData = await loginResponse.json();
        bearerToken = loginData.bearerToken;
        if (!bearerToken) throw new Error('Não foi possível obter o Bearer Token.');

        const sql = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = 1 AND ENDE.SEQEND = ${sequencia}`;
        const requestBody = {
            "serviceName": "DbExplorerSP.executeQuery",
            "requestBody": { "sql": sql, "params": {} }
        };

        const queryResponse = await fetch(`${PROXY_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, requestBody })
        });
        if (!queryResponse.ok) throw new Error('Falha na consulta de detalhes.');
        const queryData = await queryResponse.json();

        if (queryData.status === "1" && queryData.responseBody.rows.length > 0) {
            const itemDetails = queryData.responseBody.rows[0];
            populateDetails(itemDetails);
            showDetailsPage();
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }

    } catch (error) {
        alert('Erro ao buscar detalhes: ' + error.message);
        showMainPage();
    } finally {
        if (bearerToken) {
            await logoutSankhya(bearerToken);
        }
        loading.classList.add('hidden');
    }
}

function populateDetails(details) {
    const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval] = details;
    const detailsContent = document.getElementById('details-content');

    // --- ESTRUTURA HTML SIMPLIFICADA PARA OS DETALHES ---
    detailsContent.innerHTML = `
        <div class="detail-hero">
            <h3 class="product-desc">${descrprod || 'Produto sem descrição'}</h3>
            <div class="product-code">Cód. Prod.: ${codprod}</div>
        </div>

        <div class="details-section">
            <h4 class="details-section-title">Localização</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <div class="label">Rua</div>
                    <div class="value">${rua}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Prédio</div>
                    <div class="value">${predio}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Sequência</div>
                    <div class="value">${sequencia}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Apto</div>
                    <div class="value">${apto}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Marca</div>
                    <div class="value">${marca || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Validade</div>
                    <div class="value">${formatarData(datval)}</div>
                </div>
            </div>
        </div>
    `;
    feather.replace();
}

function renderizarCards(rows) {
    const resultsContainer = document.getElementById('results-container');
    const emptyState = document.getElementById('empty-state');
    resultsContainer.innerHTML = '';

    if (!rows || rows.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    rows.forEach(row => {
        const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval] = row;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="card-header">
                <p>Seq: <span>${sequencia}</span></p>
                <p>Rua: <span>${rua}</span></p>
                <p>Prédio: <span>${predio}</span></p>
                <p>Apto: <span>${apto}</span></p>
            </div>
            <div class="card-body">
                <p class="product-desc">${descrprod || 'Produto sem descrição'}</p>
                <p class="product-brand">${marca || 'Marca não informada'}</p>
            </div>
            <div class="card-footer">
                <span class="product-code">Cód: ${codprod}</span>
                <span class="product-validity">Val: ${formatarData(datval)}</span>
            </div>
        `;
        card.addEventListener('click', () => fetchAndShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
}

async function logoutSankhya(token) {
    console.log("Encerrando a sessão...");
    try {
        await fetch(`${PROXY_URL}/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken: token })
        });
    } catch (error) {
        console.error("Erro ao tentar fazer logout:", error.message);
    }
}

function formatarData(dataString) {
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    if (parteData.length !== 8) return dataString;
    const dia = parteData.substring(0, 2);
    const mes = parteData.substring(2, 4);
    const ano = parteData.substring(4, 8);
    return `${dia}/${mes}/${ano}`;
}