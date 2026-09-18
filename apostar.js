<script>

document.addEventListener('DOMContentLoaded', () => {
    inicializarTelaAposta();
});

function inicializarTelaAposta() {
    window.apostaAtual = {
        tipo: null,
        palpite: null,
        valor: 5.00
    };
}

// SELEÇÃO E DESTAQUE DOS BOTÕES
function selecionarPalpite(tipo, valor, elementoBtn) {
    // Remove o destaque de todos os botões
    document.querySelectorAll('.btn-num').forEach(btn => {
        btn.classList.remove('selected');
    });

    // Adiciona o destaque ao botão clicado
    elementoBtn.classList.add('selected');

    // Registra a seleção atual no estado local
    window.apostaAtual.tipo = tipo;
    window.apostaAtual.palpite = valor;
}

// VALIDAÇÃO E PROCESSAMENTO AO CLICAR EM "REALIZAR APOSTA"
function processarAposta() {
    // Valida se o usuário escolheu um palpite
    if (!window.apostaAtual.tipo || window.apostaAtual.palpite === null) {
        alert('Por favor, selecione um Grupo ou uma Dezena antes de apostar.');
        return;
    }

    // 1. Verificação de Autenticação
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    if (!usuarioLogado) {
        abrirModalLogin();
        return;
    }

    // 2. Verificação de Saldo
    const saldoDisponivel = parseFloat(localStorage.getItem('userBalance') || '0.00');
    const valorAposta = window.apostaAtual.valor || 5.00;

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



    
</script>
