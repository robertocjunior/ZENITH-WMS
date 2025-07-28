let currentItemDetails = null;

/**
 * REVISADO: Processa a string de erro HTML do Sankhya para extrair uma mensagem amigável.
 * @param {string} rawMessage - A mensagem de erro bruta, que pode conter HTML.
 * @returns {string} - Uma string HTML formatada e limpa para exibição.
 */
function parseSankhyaError(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.includes('<')) {
        return rawMessage || 'Ocorreu um erro desconhecido.';
    }

    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawMessage;
        const textContent = tempDiv.textContent || tempDiv.innerText;

        // Expressão regular mais robusta para capturar o conteúdo
        const motivoMatch = textContent.match(/Motivo:\s*([\s\S]+?)(?=Solução:|Informações para o Implantador|$)/);
        const solucaoMatch = textContent.match(/Solução:\s*([\s\S]+?)(?=Informações para o Implantador|$)/);

        const motivo = motivoMatch ? motivoMatch[1].trim() : '';
        const solucao = solucaoMatch ? solucaoMatch[1].trim() : '';
        
        if (motivo || solucao) {
            let formattedMessage = '';
            if (motivo) {
                formattedMessage += `<p style="margin-bottom:10px;"><strong>Motivo:</strong> ${motivo}</p>`;
            }
            if (solucao) {
                formattedMessage += `<p><strong>Solução:</strong> ${solucao}</p>`;
            }
            return formattedMessage;
        }

        // Fallback: se não encontrar os padrões, limpa o texto o melhor possível
        const cleanedText = textContent.replace(/ORA-\d+.*|Regra Personalizada:/g, '').trim();
        return cleanedText || "Ocorreu um erro na operação.";

    } catch (e) {
        // Em caso de erro no parsing, apenas remove as tags e retorna.
        return rawMessage.replace(/<[^>]*>/g, ' ');
    }
}


// --- Funções dos Modais ---
function openConfirmModal(message, title = 'Aviso') {
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').innerHTML = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

function openBaixaModal() {
    if (!currentItemDetails) {
        openConfirmModal("Erro: Nenhum item selecionado.");
        return;
    }
    const maxQtd = currentItemDetails.quantidade;
    document.getElementById('modal-qtd-disponivel').textContent = maxQtd;
    const qtdInput = document.getElementById('modal-qtd-baixa');
    qtdInput.value = '';
    qtdInput.max = maxQtd;
    document.getElementById('baixa-modal').classList.remove('hidden');
}

function closeBaixaModal() {
    document.getElementById('baixa-modal').classList.add('hidden');
}

function openTransferModal() {
    if (!currentItemDetails) {
        openConfirmModal("Erro: Nenhum item selecionado.");
        return;
    }
    const maxQtd = currentItemDetails.quantidade;
    document.getElementById('modal-qtd-disponivel-transfer').textContent = maxQtd;
    const qtdInput = document.getElementById('modal-qtd-transfer');
    qtdInput.value = '';
    qtdInput.max = maxQtd;
    document.getElementById('modal-enddes-transfer').value = '';
    document.getElementById('transfer-modal').classList.remove('hidden');
}

function closeTransferModal() {
    document.getElementById('transfer-modal').classList.add('hidden');
}


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
    document.getElementById('filtro-sequencia').addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleConsulta();
    });
    document.getElementById('btn-voltar').addEventListener('click', showMainPage);
    document.querySelector('.btn-baixar').addEventListener('click', openBaixaModal);
    document.querySelector('.btn-transferir').addEventListener('click', openTransferModal);
    document.getElementById('btn-cancelar-baixa').addEventListener('click', closeBaixaModal);
    document.getElementById('btn-confirmar-baixa').addEventListener('click', handleBaixa);
    document.getElementById('btn-cancelar-transfer').addEventListener('click', closeTransferModal);
    document.getElementById('btn-confirmar-transfer').addEventListener('click', handleTransfer);
    document.getElementById('btn-close-confirm').addEventListener('click', closeConfirmModal);
});

// --- CONTROLE DE UI ---
const loading = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');

function showLoading(show) {
    loading.classList.toggle('hidden', !show);
}

function showMainPage() {
    document.getElementById('main-page').classList.add('active');
    document.getElementById('details-page').classList.remove('active');
}

function showDetailsPage() {
    document.getElementById('main-page').classList.remove('active');
    document.getElementById('details-page').classList.add('active');
}

// --- LÓGICA DE API CENTRALIZADA ---
async function performSankhyaOperation(operation) {
    let bearerToken = null;
    showLoading(true);
    try {
        const loginResponse = await fetch(`${PROXY_URL}/login`, { method: 'POST' });
        if (!loginResponse.ok) throw new Error('Falha na autenticação.');
        const loginData = await loginResponse.json();
        bearerToken = loginData.bearerToken;
        if (!bearerToken) throw new Error('Não foi possível obter o Bearer Token.');

        await operation(bearerToken);

    } catch (error) {
        // REVISADO: Chama a nova função para limpar a mensagem de erro antes de exibi-la
        const friendlyMessage = parseSankhyaError(error.message);
        openConfirmModal(friendlyMessage, 'Falha na Operação');
        return false;
    } finally {
        if (bearerToken) {
            await fetch(`${PROXY_URL}/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bearerToken })
            });
            console.log("Sessão encerrada.");
        }
        showLoading(false);
    }
    return true;
}

// --- FUNÇÕES PRINCIPAIS ---
async function handleConsulta() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';
    emptyState.classList.add('hidden');

    await performSankhyaOperation(async (bearerToken) => {
        const sequencia = document.getElementById('filtro-sequencia').value;
        let sqlFinal = "SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = 1";
        if (sequencia) {
            sqlFinal += ` AND ENDE.SEQEND LIKE '${sequencia}%'`;
        }
        const apiRequestBody = {
            serviceName: "DbExplorerSP.executeQuery",
            requestBody: { "sql": sqlFinal }
        };
        const queryResponse = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        if (!queryResponse.ok) throw new Error(`Falha na consulta: ${queryResponse.statusText}`);
        const queryData = await queryResponse.json();
        if (queryData.status !== "1") throw new Error(queryData.statusMessage);
        renderizarCards(queryData.responseBody.rows);
    });
}

async function fetchAndShowDetails(sequencia) {
    const success = await performSankhyaOperation(async (bearerToken) => {
        const sql = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = 1 AND ENDE.SEQEND = ${sequencia}`;
        const apiRequestBody = {
            serviceName: "DbExplorerSP.executeQuery",
            requestBody: { "sql": sql }
        };
        const queryResponse = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        if (!queryResponse.ok) throw new Error('Falha na consulta de detalhes.');
        const queryData = await queryResponse.json();
        if (queryData.status === "1" && queryData.responseBody.rows.length > 0) {
            populateDetails(queryData.responseBody.rows[0]);
            showDetailsPage();
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    });
    if (!success) {
        showMainPage();
    }
}

async function handleBaixa() {
    const qtdBaixarInput = document.getElementById('modal-qtd-baixa');
    const qtdBaixar = parseInt(qtdBaixarInput.value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);

    if (isNaN(qtdBaixar) || qtdBaixar <= 0 || qtdBaixar > qtdDisponivel) {
        openConfirmModal("Por favor, insira uma quantidade válida.");
        return;
    }
    closeBaixaModal();

    const success = await performSankhyaOperation(async (bearerToken) => {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoBody = {
            serviceName: "DatasetSP.save",
            requestBody: { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] }
        };
        const cabecalhoRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...cabecalhoBody })
        });
        const cabecalhoData = await cabecalhoRes.json();
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) {
            throw new Error(cabecalhoData.statusMessage || 'Resposta inválida da API ao criar cabeçalho.');
        }
        const seqBai = cabecalhoData.responseBody.result[0][0];

        const itemBody = {
            serviceName: "DatasetSP.save",
            requestBody: {
                entityName: "AD_IBXEND",
                fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                records: [{
                    values: {
                        "1": seqBai.toString(), "2": "1",
                        "3": currentItemDetails.sequencia.toString(),
                        "4": qtdBaixar.toString()
                    }
                }]
            }
        };
        const itemRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...itemBody })
        });
        const itemData = await itemRes.json();
        if (itemData.status !== "1") throw new Error(itemData.statusMessage);

        const stpBody = {
            serviceName: "ActionButtonsSP.executeSTP",
            requestBody: {
                stpCall: {
                    actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND",
                    rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] }
                }
            }
        };
        const stpRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...stpBody })
        });
        const stpData = await stpRes.json();
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
        
        if (stpData.statusMessage) {
            openConfirmModal(stpData.statusMessage, 'Sucesso!');
        }
    });

    if (success) {
        showMainPage();
        handleConsulta();
    }
}

async function handleTransfer() {
    const qtdInput = document.getElementById('modal-qtd-transfer');
    const endDesInput = document.getElementById('modal-enddes-transfer');
    
    const quantidade = parseInt(qtdInput.value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    const enderecoDestino = endDesInput.value.trim();

    if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) {
        openConfirmModal("Por favor, insira uma quantidade válida.");
        return;
    }
    if (!enderecoDestino) {
        openConfirmModal("Por favor, insira o endereço de destino.");
        return;
    }
    closeTransferModal();

    const success = await performSankhyaOperation(async (bearerToken) => {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoBody = {
            serviceName: "DatasetSP.save",
            requestBody: { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] }
        };
        const cabecalhoRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...cabecalhoBody })
        });
        const cabecalhoData = await cabecalhoRes.json();
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) {
            throw new Error(cabecalhoData.statusMessage || 'Resposta inválida da API ao criar cabeçalho.');
        }
        const seqBai = cabecalhoData.responseBody.result[0][0];

        const itemBody = {
            serviceName: "DatasetSP.save",
            requestBody: {
                entityName: "AD_IBXEND", standAlone: false,
                fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
                records: [{
                    values: {
                        "1": seqBai.toString(), "2": "1",
                        "3": currentItemDetails.sequencia.toString(),
                        "4": "1", "5": enderecoDestino, "6": quantidade.toString()
                    }
                }]
            }
        };
        const itemRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...itemBody })
        });
        const itemData = await itemRes.json();
        if (itemData.status !== "1") throw new Error(itemData.statusMessage);

        const stpBody = {
            serviceName: "ActionButtonsSP.executeSTP",
            requestBody: {
                stpCall: {
                    actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND",
                    rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] }
                }
            }
        };
        const stpRes = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...stpBody })
        });
        const stpData = await stpRes.json();
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
        
        if (stpData.statusMessage) {
            openConfirmModal(stpData.statusMessage, 'Sucesso!');
        }
    });

    if (success) {
        showMainPage();
        handleConsulta();
    }
}


// --- FUNÇÕES DE RENDERIZAÇÃO ---
function renderizarCards(rows) {
    const resultsContainer = document.getElementById('results-container');
    if (!rows || rows.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    rows.forEach(row => {
        const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval] = row;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="card-header"><p>Seq: <span>${sequencia}</span></p><p>Rua: <span>${rua}</span></p><p>Prédio: <span>${predio}</span></p></div>
            <div class="card-body"><p class="product-desc">${descrprod || 'Sem descrição'}</p></div>
            <div class="card-footer"><span class="product-code">Cód: ${codprod}</span><span class="product-validity">Val: ${formatarData(datval)}</span></div>
        `;
        card.addEventListener('click', () => fetchAndShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
}

function populateDetails(details) {
    const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade] = details;
    currentItemDetails = { sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade };
    const detailsContent = document.getElementById('details-content');
    detailsContent.innerHTML = `
        <div class="detail-hero"><h3 class="product-desc">${descrprod || 'Produto sem descrição'}</h3><div class="product-code">Cód. Prod.: ${codprod}</div></div>
        <div class="details-section"><h4 class="details-section-title">Informações</h4><div class="details-grid">
            <div class="detail-item"><div class="label">Marca</div><div class="value">${marca || 'N/A'}</div></div>
            <div class="detail-item"><div class="label">Validade</div><div class="value">${formatarData(datval)}</div></div>
            <div class="detail-item"><div class="label">Quantidade</div><div class="value">${quantidade || 0}</div></div>
        </div></div>
        <div class="details-section"><h4 class="details-section-title">Localização</h4><div class="details-grid">
            <div class="detail-item"><div class="label">Rua</div><div class="value">${rua}</div></div>
            <div class="detail-item"><div class="label">Prédio</div><div class="value">${predio}</div></div>
            <div class="detail-item"><div class="label">Sequência</div><div class="value">${sequencia}</div></div>
            <div class="detail-item"><div class="label">Apto</div><div class="value">${apto}</div></div>
        </div></div>
    `;
    feather.replace();
}

function formatarData(dataString) {
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    if (parteData.length !== 8) return dataString;
    return `${parteData.substring(0, 2)}/${parteData.substring(2, 4)}/${parteData.substring(4, 8)}`;
}