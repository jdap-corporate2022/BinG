require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(cors());

// Conexão PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Inicialização e Sincronização do Schema
const initDb = async () => {
    try {
        // 1. Criação Inicial das Tabelas (caso não existam)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(50) UNIQUE,
                senha VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS carteiras (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                saldo DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS apostas (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id),
                tipo_aposta VARCHAR(20) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                palpites JSONB NOT NULL,
                status VARCHAR(20) DEFAULT 'pendente',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS pagamentos_pix (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id),
                mp_payment_id BIGINT UNIQUE NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                status VARCHAR(30) NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS saques (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id),
                tipo_chave VARCHAR(20) NOT NULL,
                chave_pix VARCHAR(150) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                status VARCHAR(30) DEFAULT 'pendente',
                mp_disbursement_id VARCHAR(100),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Garante migração de colunas para tabelas já existentes no Render
        try {
            await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(50) UNIQUE;');
        } catch (e) {
            console.log("Nota: Ajuste em 'telefone'.");
        }

        try {
            await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha VARCHAR(255);');
        } catch (e) {
            console.log("Nota: Ajuste em 'senha'.");
        }

        try {
            await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
        } catch (e) {
            console.log("Nota: Ajuste em 'is_admin'.");
        }

        try {
            await pool.query('ALTER TABLE usuarios DROP COLUMN IF EXISTS email;');
        } catch (e) {
            console.log("Nota: Removendo 'email' antigo se existir.");
        }

        // 3. Criação do Usuário Administrador Padrão
        const adminCheck = await pool.query("SELECT id FROM usuarios WHERE telefone = 'admin'");
        if (adminCheck.rows.length === 0) {
            const hashSenhaAdmin = await bcrypt.hash('@Dell8245', 10);
            await pool.query(
                "INSERT INTO usuarios (nome, telefone, senha, is_admin) VALUES ('Administrador', 'admin', $1, TRUE)",
                [hashSenhaAdmin]
            );
            console.log("Usuário Administrador 'admin' criado com sucesso.");
        }

        // 4. Exclusão permanente de registros inválidos e visitantes incompletos
        await pool.query(`
            DELETE FROM usuarios 
            WHERE nome IS NULL 
               OR nome = '' 
               OR nome = 'Usuário Visitante' 
               OR telefone IS NULL 
               OR telefone = '' 
               OR telefone = 'null';
        `);
        console.log("Limpeza concluída: Registros inválidos excluídos com sucesso.");

        console.log("Banco de dados pronto e sincronizado para uso.");
    } catch (err) {
        console.error("Erro ao inicializar banco de dados:", err);
    }
};

initDb();

// Configuração SDK Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

// ROTA: Login do Painel Administrativo
app.post('/api/admin/login', async (req, res) => {
    const { login, senha } = req.body;

    if (!login || !senha) {
        return res.status(400).json({ error: 'Informe o login e a senha de administrador.' });
    }

    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1 AND is_admin = TRUE', [login]);
        
        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Login ou senha incorretos.' });
        }

        const admin = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, admin.senha);

        if (!senhaValida) {
            return res.status(403).json({ error: 'Login ou senha incorretos.' });
        }

        res.json({
            admin: { id: admin.id, nome: admin.nome },
            token: `admin_token_${admin.id}_${Date.now()}`
        });

    } catch (error) {
        console.error('Erro na autenticação admin:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao autenticar administrador.' });
    }
});

// ROTA: Cadastro de Usuário
app.post('/api/auth/cadastro', async (req, res) => {
    const { nome, telefone, senha } = req.body;

    if (!nome || !telefone || !senha) {
        return res.status(400).json({ error: 'Todos os campos (nome, telefone, senha) são obrigatórios.' });
    }

    try {
        const userExists = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Este número de telefone já está cadastrado.' });
        }

        const hashSenha = await bcrypt.hash(senha, 10);

        const newUser = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefone, hashSenha]
        );

        const userId = newUser.rows[0].id;

        await pool.query(
            'INSERT INTO carteiras (usuario_id, saldo) VALUES ($1, 0.00)',
            [userId]
        );

        res.status(201).json({
            usuario: newUser.rows[0],
            token: `token_${userId}_${Date.now()}`
        });

    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao realizar cadastro.' });
    }
});

// ROTA: Login de Usuário
app.post('/api/auth/login', async (req, res) => {
    const { telefone, senha } = req.body;

    if (!telefone || !senha) {
        return res.status(400).json({ error: 'Informe o telefone e a senha.' });
    }

    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Telefone ou senha incorretos.' });
        }

        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            return res.status(400).json({ error: 'Telefone ou senha incorretos.' });
        }

        res.json({
            usuario: { id: usuario.id, nome: usuario.nome, telefone: usuario.telefone },
            token: `token_${usuario.id}_${Date.now()}`
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao realizar login.' });
    }
});

// ROTA: Buscar Saldo do Usuário
app.get('/api/usuario/:id/saldo', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT saldo FROM carteiras WHERE usuario_id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.json({ saldo: 0.00 });
        }
        res.json({ saldo: parseFloat(result.rows[0].saldo) });
    } catch (error) {
        console.error('Erro ao buscar saldo:', error);
        res.status(500).json({ error: 'Erro ao consultar saldo.' });
    }
});

// ROTA: Gerar PIX (Depósito / Aposta)
app.post('/api/pagamentos/pix', async (req, res) => {
    const { usuario_id, valor } = req.body;

    if (!usuario_id) {
        return res.status(401).json({ error: 'Usuário não autenticado. Faça login para continuar.' });
    }

    const valorFinal = Number(valor) >= 1 ? Number(valor) : 2.00;

    try {
        const body = {
            transaction_amount: valorFinal,
            description: 'Deposito de Saldo - Bicho777Bet',
            payment_method_id: 'pix',
            payer: {
                email: 'cliente@bicho777bet.com',
                first_name: 'Cliente',
                last_name: 'Usuario'
            },
            notification_url: 'https://bing-j6vi.onrender.com/api/webhooks/mercadopago'
        };

        const mpResponse = await payment.create({ body });

        await pool.query(
            'INSERT INTO pagamentos_pix (usuario_id, mp_payment_id, valor, status) VALUES ($1, $2, $3, $4)',
            [usuario_id, mpResponse.id, valorFinal, mpResponse.status]
        );

        res.status(200).json({
            payment_id: mpResponse.id,
            qr_code: mpResponse.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: mpResponse.point_of_interaction.transaction_data.qr_code_base64
        });

    } catch (error) {
        console.error('Erro detalhado MP:', JSON.stringify(error.cause || error, null, 2));
        res.status(500).json({ error: 'Erro ao gerar cobrança PIX. Verifique os dados fornecidos.' });
    }
});

// ROTA: Webhook Mercado Pago
app.post('/api/webhooks/mercadopago', async (req, res) => {
    const { action, data } = req.body;
    res.status(200).send('OK');

    if (action === 'payment.created' || action === 'payment.updated') {
        const paymentId = data.id;

        try {
            const paymentInfo = await payment.get({ id: paymentId });

            if (paymentInfo.status === 'approved') {
                const dbClient = await pool.connect();

                try {
                    await dbClient.query('BEGIN');

                    const resPix = await dbClient.query(
                        'SELECT usuario_id, valor, status FROM pagamentos_pix WHERE mp_payment_id = $1 FOR UPDATE',
                        [paymentId]
                    );

                    if (resPix.rows.length > 0 && resPix.rows[0].status !== 'approved') {
                        const { usuario_id, valor } = resPix.rows[0];

                        await dbClient.query(
                            'UPDATE pagamentos_pix SET status = $1, atualizado_em = NOW() WHERE mp_payment_id = $2',
                            ['approved', paymentId]
                        );

                        await dbClient.query(
                            'UPDATE carteiras SET saldo = saldo + $1 WHERE usuario_id = $2',
                            [valor, usuario_id]
                        );
                    }

                    await dbClient.query('COMMIT');
                } catch (err) {
                    await dbClient.query('ROLLBACK');
                    console.error('Erro ao creditar saldo:', err);
                } finally {
                    dbClient.release();
                }
            }
        } catch (error) {
            console.error('Erro ao consultar pagamento no MP:', error);
        }
    }
});

// ROTA: Verificação de Status de Depósito
app.get('/api/pagamentos/status/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT status FROM pagamentos_pix WHERE mp_payment_id = $1',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado.' });
        res.json({ status: result.rows[0].status });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar pagamento.' });
    }
});

// ROTA: Solicitar Saque Pix
app.post('/api/saque', async (req, res) => {
    const { usuarioId, tipoChave, chavePix, valor } = req.body;
    const userId = usuarioId || 1;
    const valorSaque = parseFloat(valor);

    if (!chavePix || isNaN(valorSaque) || valorSaque < 20) {
        return res.status(400).json({ mensagem: 'O valor mínimo para saque é R$ 20,00 e a chave Pix é obrigatória.' });
    }

    const dbClient = await pool.connect();

    try {
        await dbClient.query('BEGIN');

        const carteiraRes = await dbClient.query(
            'SELECT saldo FROM carteiras WHERE usuario_id = $1 FOR UPDATE',
            [userId]
        );

        if (carteiraRes.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ mensagem: 'Carteira do usuário não encontrada.' });
        }

        const saldoAtual = parseFloat(carteiraRes.rows[0].saldo);

        if (saldoAtual < valorSaque) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({ mensagem: 'Saldo insuficiente para realizar este saque.' });
        }

        await dbClient.query(
            'UPDATE carteiras SET saldo = saldo - $1, atualizado_em = NOW() WHERE usuario_id = $2',
            [valorSaque, userId]
        );

        const saqueInsert = await dbClient.query(
            'INSERT INTO saques (usuario_id, tipo_chave, chave_pix, valor, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, tipoChave, chavePix, valorSaque, 'pendente']
        );
        const saqueId = saqueInsert.rows[0].id;

        await dbClient.query('COMMIT');
        return res.status(200).json({ 
            mensagem: 'Solicitação de saque processada com sucesso!',
            saque_id: saqueId 
        });

    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error('Erro ao processar saque:', error);
        return res.status(500).json({ mensagem: 'Falha ao processar saque. O saldo permaneceu inalterado.' });
    } finally {
        dbClient.release();
    }
});

// ROTA: Métrica e Dados Consolidados para o Painel Admin (admin.html)
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        // 1. Total Depositado (apenas depósitos aprovados via Mercado Pago)
        const totalDepRes = await pool.query(
            "SELECT COALESCE(SUM(valor), 0) AS total FROM pagamentos_pix WHERE status = 'approved'"
        );
        
        // 2. Total de Saques Aprovados
        const totalSaquesRes = await pool.query(
            "SELECT COALESCE(SUM(valor), 0) AS total FROM saques WHERE status = 'concluido' OR status = 'aprovado'"
        );

        // 3. Total de Usuários VÁLIDOS Cadastrados (ignorando admins e visitantes inválidos)
        const totalUsersRes = await pool.query(`
            SELECT COUNT(id) AS total 
            FROM usuarios 
            WHERE (is_admin = FALSE OR is_admin IS NULL)
              AND nome IS NOT NULL AND nome != '' AND nome != 'Usuário Visitante'
              AND telefone IS NOT NULL AND telefone != '' AND telefone != 'null'
        `);

        // 4. Volume Total de Apostas
        const totalApostasRes = await pool.query(
            "SELECT COALESCE(SUM(valor), 0) AS total FROM apostas"
        );

        // 5. Lista de Saques Pendentes
        const saquesPendentesRes = await pool.query(`
            SELECT s.id, u.nome AS "nomeUsuario", s.chave_pix AS "chavePix", s.valor
            FROM saques s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.status = 'pendente'
            ORDER BY s.criado_em DESC
        `);

        // 6. Lista de Todos os Usuários VÁLIDOS e seus respectivos Saldos
        const listaUsuariosRes = await pool.query(`
            SELECT u.id, u.nome, u.telefone AS email, COALESCE(c.saldo, 0.00) AS saldo
            FROM usuarios u
            LEFT JOIN carteiras c ON u.id = c.usuario_id
            WHERE (u.is_admin = FALSE OR u.is_admin IS NULL)
              AND u.nome IS NOT NULL AND u.nome != '' AND u.nome != 'Usuário Visitante'
              AND u.telefone IS NOT NULL AND u.telefone != '' AND u.telefone != 'null'
            ORDER BY u.id DESC
        `);

        // Retorna a estrutura que o admin.html espera consumir
        res.json({
            totalDepositado: parseFloat(totalDepRes.rows[0].total),
            totalSaques: parseFloat(totalSaquesRes.rows[0].total),
            totalUsuarios: parseInt(totalUsersRes.rows[0].total, 10),
            totalApostado: parseFloat(totalApostasRes.rows[0].total),
            saquesPendentes: saquesPendentesRes.rows,
            depositosPendentes: [],
            listaUsuarios: listaUsuariosRes.rows.map(u => ({
                ...u,
                saldo: parseFloat(u.saldo)
            }))
        });

    } catch (error) {
        console.error('Erro ao gerar dados do dashboard admin:', error);
        res.status(500).json({ error: 'Erro ao buscar métricas do sistema.' });
    }
});


// ROTA: Alteração Manual de Saldo pelo Painel Admin (admin.html)
app.post('/api/admin/usuario/saldo', async (req, res) => {
    const { userId, valor } = req.body;
    const valorNum = parseFloat(valor);

    if (!userId || isNaN(valorNum)) {
        return res.status(400).json({ error: 'ID do usuário e valor numérico são obrigatórios.' });
    }

    try {
        // Atualiza o saldo somando ou subtraindo o valor enviado
        const result = await pool.query(`
            UPDATE carteiras 
            SET saldo = saldo + $1, atualizado_em = NOW() 
            WHERE usuario_id = $2 
            RETURNING saldo
        `, [valorNum, userId]);

        if (result.rows.length === 0) {
            // Caso o usuário ainda não tenha uma linha na tabela carteiras, cria uma
            await pool.query(
                'INSERT INTO carteiras (usuario_id, saldo) VALUES ($1, $2)',
                [userId, Math.max(0, valorNum)]
            );
            return res.json({ success: true, novoSaldo: Math.max(0, valorNum) });
        }

        res.json({
            success: true,
            novoSaldo: parseFloat(result.rows[0].saldo)
        });

    } catch (error) {
        console.error('Erro ao alterar saldo manualmente:', error);
        res.status(500).json({ error: 'Erro ao atualizar saldo no banco de dados.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
