// app.js

/**
 * Função principal que lida com a consulta.
 */
async function handleConsulta() {
    const loading = document.getElementById('loading');
    const tabelaBody = document.querySelector("#tabela-resultados tbody");
    
    // Declara o bearerToken aqui para que ele seja acessível no bloco 'finally'
    let bearerToken = null;

    tabelaBody.innerHTML = '';
    loading.classList.remove('hidden');

    try {
        // ETAPA 1: Login
        const loginResponse = await fetch('http://192.168.2.57:3000/login', { method: 'POST' });
        if (!loginResponse.ok) throw new Error('Falha na autenticação com o proxy.');
        
        const loginData = await loginResponse.json();
        bearerToken = loginData.bearerToken; // Atribui o token obtido
        if (!bearerToken) throw new Error('Não foi possível obter o Bearer Token.');

        // ETAPA 2: Montar o SQL
        const sequencia = document.getElementById('filtro-sequencia').value;
        let sqlFinal = "SELECT ENDE.SEQEND AS SEQUENCIA, ENDE.CODRUA AS RUA, ENDE.CODPRD AS PREDIO, ENDE.CODAPT AS APTO, ENDE.CODPROD AS PRODUTO, PRO.DESCRPROD AS DESCRICAO, PRO.MARCA AS MARCA, ENDE.DATVAL AS VALIDADE FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = 1";
        if (sequencia) {
            sqlFinal += ` AND ENDE.SEQEND LIKE '${sequencia}%'`;
        }
        const requestBody = {
            "serviceName": "DbExplorerSP.executeQuery",
            "requestBody": { "sql": sqlFinal, "params": {} }
        };
        
        // ETAPA 3: Executar a consulta
        const queryResponse = await fetch('http://192.168.2.57:3000/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, requestBody })
        });
        if (!queryResponse.ok) throw new Error('Falha na consulta com o proxy.');
        const queryData = await queryResponse.json();
        if (queryData.status === "1") {
            renderizarTabela(queryData.responseBody.rows);
        } else {
            throw new Error(queryData.statusMessage);
        }
    } catch (error) {
        alert('Erro: ' + error.message);
    } finally {
        // ETAPA FINAL: Logout (sempre executa, com sucesso ou erro)
        if (bearerToken) {
            await logoutSankhya(bearerToken);
        }
        loading.classList.add('hidden');
    }
}

/**
 * Nova função para fazer logout, invalidando o token.
 */
async function logoutSankhya(token) {
    console.log("Encerrando a sessão...");
    try {
        const logoutResponse = await fetch('http://192.168.2.57:3000/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken: token })
        });
        const logoutData = await logoutResponse.json();
        if (logoutData.status === "1") {
            console.log("Sessão encerrada com sucesso.");
        } else {
            // Apenas avisa no console, não precisa mostrar alerta para o usuário
            console.warn("Sessão não pôde ser encerrada no Sankhya:", logoutData.statusMessage);
        }
    } catch (error) {
        console.error("Erro na chamada de logout via proxy:", error.message);
    }
}

/**
 * Função que desenha os resultados na tabela HTML.
 */
function renderizarTabela(rows) {
    // ... (esta função continua exatamente igual a antes)
    const tabelaBody = document.querySelector("#tabela-resultados tbody");
    if (!rows || rows.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="8">Nenhum resultado encontrado.</td></tr>';
        return;
    }
    let html = '';
    rows.forEach(row => {
        let tr = '<tr>';
        row.forEach((cell, index) => {
            let cellValue = cell !== null ? cell : '';
            if (index === 7) { // Formata a 8ª coluna (validade)
                cellValue = formatarData(cellValue);
            }
            tr += `<td>${cellValue}</td>`;
        });
        tr += '</tr>';
        html += tr;
    });
    tabelaBody.innerHTML = html;
}

/**
 * Função para formatar a data.
 */
function formatarData(dataString) {
    // ... (esta função continua exatamente igual a antes)
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    if (parteData.length !== 8) return dataString;
    const dia = parteData.substring(0, 2);
    const mes = parteData.substring(2, 4);
    const ano = parteData.substring(4, 8);
    return `${dia}/${mes}/${ano}`;
}

// Adiciona o listener quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
});