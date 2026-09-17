// Aguarda o carregamento completo da árvore DOM
document.addEventListener('DOMContentLoaded', () => {
    inicializarTelaAposta();
});

function inicializarTelaAposta() {
    gerarGrupos();
    gerarDezenas();

    // Estado local da aposta
    window.apostaAtual = {
        tipo: null,
        palpite: null,
        valor: 5.00
    };
}

// GERA OS 25 GRUPOS (1 A 25)
function gerarGrupos() {
    const gridGroups = document.getElementById('gridGroups');
    if (!gridGroups) {
        console.error('Elemento #gridGroups não encontrado no HTML.');
        return;
    }

    gridGroups.innerHTML = '';
    for (let i = 1; i <= 25; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-num';
        btn.textContent = i;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            selecionarPalpite('grupo', i, btn);
        });
        gridGroups.appendChild(btn);
    }
}

// GERA AS 100 DEZENAS (00 A 99)
function gerarDezenas() {
    const gridDezenas = document.getElementById('gridDezenas');
    if (!gridDezenas) {
        console.error('Elemento #gridDezenas não encontrado no HTML.');
        return;
    }

    gridDezenas.innerHTML = '';
    for (let i = 0; i <= 99; i++) {
        const valStr = i.toString().padStart(2, '0');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-num';
        btn.textContent = valStr;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            selecionarPalpite('dezena', valStr, btn);
        });
        gridDezenas.appendChild(btn);
    }
}

// SELEÇÃO E DESTAQUE DOS BOTÕES
function selecionarPalpite(tipo, valor, elementoBtn) {
    document.querySelectorAll('.btn-num').forEach(btn => {
        btn.classList.remove('selected');
    });

    elementoBtn.classList.add('selected');

    window.apostaAtual.tipo = tipo;
    window.apostaAtual.palpite = valor;

    processarAposta();
}

// VALIDAÇÃO SILENCIOSA E PROCESSAMENTO
function processarAposta() {
    // 1. Verificação de Autenticação
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    if (!usuarioLogado) {
        abrirModalLogin();
        return;
    }

    // 2. Verificação de Saldo nos bastidores
    const saldoDisponivel = parseFloat(localStorage.getItem('userBalance') || '0.00');
    const valorAposta = window.apostaAtual.valor || 2.00;

    if (saldoDisponivel < valorAposta) {
        abrirModalSaldo();
        return;
    }

    // 3. Débito e confirmação
    const novoSaldo = saldoDisponivel - valorAposta;
    localStorage.setItem('userBalance', novoSaldo.toFixed(2));

    salvarHistoricoAposta({
        data: new Date().toLocaleString('pt-BR'),
        tipo: window.apostaAtual.tipo.toUpperCase(),
        palpite: window.apostaAtual.palpite,
        valor: valorAposta
    });

    abrirModalSucesso();
}

function salvarHistoricoAposta(aposta) {
    const historico = JSON.parse(localStorage.getItem('minhasApostas') || '[]');
    historico.unshift(aposta);
    localStorage.setItem('minhasApostas', JSON.stringify(historico));
}

// CONTROLE DOS MODAIS
function abrirModalSaldo() {
    const modal = document.getElementById('balanceModal');
    if (modal) modal.style.display = 'flex';
}

function fecharModalSaldo() {
    const modal = document.getElementById('balanceModal');
    if (modal) modal.style.display = 'none';
}

function abrirModalLogin() {
    const modal = document.getElementById('modalAuthRequired');
    if (modal) modal.style.display = 'flex';
}

function fecharModalLogin() {
    const modal = document.getElementById('modalAuthRequired');
    if (modal) modal.style.display = 'none';
}

function abrirModalSucesso() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            window.location.href = 'apostas.html';
        }, 2000);
    }
}
