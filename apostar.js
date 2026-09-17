<script>
    const API_URL = 'https://bing-j6vi.onrender.com';
    const urlParams = new URLSearchParams(window.location.search);
    const betType = urlParams.get('type') || 'grupo';
    const rawVal = parseFloat(urlParams.get('val'));
    const betVal = isNaN(rawVal) || rawVal < 1 ? 2.00 : rawVal; 
    const maxSelections = parseInt(urlParams.get('max')) || 1;

    let selectedItems = [];
    let saldoAtual = 0;

    async function carregarSaldo() {
        try {
            const res = await fetch(`${API_URL}/api/usuario/1/saldo`);
            const data = await res.json();
            if (data.saldo !== undefined) {
                saldoAtual = data.saldo;
                document.getElementById('userBalance').textContent = `R$ ${saldoAtual.toFixed(2).replace('.', ',')}`;
            }
        } catch (err) {
            console.error('Erro ao carregar saldo:', err);
        }
    }

    document.getElementById('infoType').textContent = `TIPO: ${betType === 'grupo' ? 'GRUPO' : 'DEZENA'}`;
    document.getElementById('infoValue').textContent = `VALOR: R$ ${betVal.toFixed(2).replace('.', ',')}`;
    document.getElementById('infoLimit').textContent = `LIMITE: ${maxSelections}`;

    if (betType === 'grupo') {
        const container = document.getElementById('groupsContainer');
        container.classList.remove('hidden');
        const grid = document.getElementById('gridGroups');

        for (let i = 1; i <= 25; i++) {
            const btn = document.createElement('button');
            btn.className = 'bet-num-btn';
            btn.textContent = i;
            btn.addEventListener('click', () => handleSelect(btn, i.toString().padStart(2, '0')));
            grid.appendChild(btn);
        }
    } else {
        const container = document.getElementById('dezenasContainer');
        container.classList.remove('hidden');
        const grid = document.getElementById('gridDezenas');

        for (let i = 0; i <= 99; i++) {
            const btn = document.createElement('button');
            btn.className = 'bet-num-btn';
            const val = i.toString().padStart(2, '0');
            btn.textContent = val;
            btn.addEventListener('click', () => handleSelect(btn, val));
            grid.appendChild(btn);
        }
    }

    function handleSelect(btn, item) {
        if (selectedItems.includes(item)) {
            selectedItems = selectedItems.filter(i => i !== item);
            btn.classList.remove('selected');
        } else {
            if (selectedItems.length >= maxSelections) {
                alert(`Você pode selecionar no máximo ${maxSelections} opção(ões).`);
                return;
            }
            selectedItems.push(item);
            btn.classList.add('selected');
        }
    }


        // Função para validar se o usuário está logado
function validarAcesso() {
    const user = localStorage.getItem('user');
    if (!user) {
        alert('Você precisa estar logado para fazer uma aposta e gerar o pagamento!');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Exemplo: no evento de clique do botão "Gera PIX" ou "Confirmar Aposta"
document.getElementById('btnGerarPix').addEventListener('click', function(e) {
    if (!validarAcesso()) {
        e.preventDefault(); // Impede o envio se não estiver logado
        return;
    }

    // Segue o fluxo normal de gerar o PIX...
});
        

    document.getElementById('confirmBet').addEventListener('click', async () => {
        if (selectedItems.length === 0) {
            alert('Selecione ao menos um palpite.');
            return;
        }

        // Se o saldo for menor que o valor da aposta, abre o Pop-up com botão para Depositar
        if (saldoAtual < betVal) {
            document.getElementById('balanceModal').style.display = 'flex';
            return;
        }

        const btnConfirmar = document.getElementById('confirmBet');
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'REGISTRANDO...';

        try {
            const response = await fetch(`${API_URL}/api/apostas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usuario_id: 1,
                    modalidade: betType === 'grupo' ? 'Grupo' : 'Dezena',
                    palpites: selectedItems,
                    valor: betVal
                })
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('successModal').style.display = 'flex';
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2500);
            } else {
                alert(data.error || 'Erro ao registrar aposta.');
                btnConfirmar.disabled = false;
                btnConfirmar.textContent = 'FINALIZAR APOSTA ❯';
            }
        } catch (error) {
            console.error('Erro na requisição:', error);
            alert('Erro de conexão com o servidor.');
            btnConfirmar.disabled = false;
            btnConfirmar.textContent = 'FINALIZAR APOSTA ❯';
        }
    });

    function fecharModalSaldo() {
        document.getElementById('balanceModal').style.display = 'none';
    }

    carregarSaldo();


        // Função para verificar se o usuário está logado
function verificarLoginParaApostar() {
    const user = localStorage.getItem('user');
    
    if (!user) {
        // Exibe o modal se não estiver logado
        const modal = document.getElementById('modalAuthRequired');
        modal.style.display = 'flex';
        return false;
    }
    return true;
}

// Função para fechar o modal
function fecharModalLogin() {
    document.getElementById('modalAuthRequired').style.display = 'none';
}

// Exemplo de uso no clique do botão de Apostar / Gerar PIX:
document.getElementById('btnFinalizarAposta').addEventListener('click', function(e) {
    // Interrompe o fluxo se não estiver logado
    if (!verificarLoginParaApostar()) {
        e.preventDefault();
        return;
    }

    // Se estiver logado, segue com o envio dos palpites e PIX...
});
        
    </script>
