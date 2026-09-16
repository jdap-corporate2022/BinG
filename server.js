require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(cors());

// Conexão Banco de Dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Inicialização da SDK Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

// 1. ENDPOINT: Gerar QRCode PIX para Depósito
app.post('/api/pagamentos/pix', async (req, res) => {
    const { usuario_id, valor, email_usuario } = req.body;

    if (!valor || valor <= 0) {
        return res.status(400).json({ error: 'Valor inválido para depósito.' });
    }

    try {
        // Criar pagamento no Mercado Pago
        const body = {
            transaction_amount: parseFloat(valor),
            description: 'Depósito de Saldo - Bicho777Bet',
            payment_method_id: 'pix',
            payer: {
                email: email_usuario || 'usuario@email.com',
            },
            notification_url: process.env.WEBHOOK_URL
        };

        const mpResponse = await payment.create({ body });

        // Registrar pagamento pendente no banco
        await pool.query(
            'INSERT INTO pagamentos_pix (usuario_id, mp_payment_id, valor, status) VALUES ($1, $2, $3, $4)',
            [usuario_id, mpResponse.id, valor, mpResponse.status]
        );

        // Retornar dados do PIX para o front-end
        res.status(200).json({
            payment_id: mpResponse.id,
            qr_code: mpResponse.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: mpResponse.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: mpResponse.point_of_interaction.transaction_data.ticket_url
        });

    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        res.status(500).json({ error: 'Erro ao gerar cobrança PIX.' });
    }
});

// 2. ENDPOINT: Webhook (Notificação automática do Mercado Pago)
app.post('/api/webhooks/mercadopago', async (req, res) => {
    const { action, data } = req.body;

    // Responde imediatamente 200 OK para o Mercado Pago
    res.status(200).send('OK');

    if (action === 'payment.created' || action === 'payment.updated') {
        const paymentId = data.id;

        try {
            // Buscar dados atualizados do pagamento na API do Mercado Pago
            const paymentInfo = await payment.get({ id: paymentId });
            const status = paymentInfo.status;

            if (status === 'approved') {
                const dbClient = await pool.connect();

                try {
                    await dbClient.query('BEGIN');

                    // Buscar transação no banco e verificar se já foi processada
                    const resPix = await dbClient.query(
                        'SELECT usuario_id, valor, status FROM pagamentos_pix WHERE mp_payment_id = $1 FOR UPDATE',
                        [paymentId]
                    );

                    if (resPix.rows.length > 0 && resPix.rows[0].status !== 'approved') {
                        const { usuario_id, valor } = resPix.rows[0];

                        // Atualiza o status do PIX para aprovado
                        await dbClient.query(
                            'UPDATE pagamentos_pix SET status = $1, atualizado_em = NOW() WHERE mp_payment_id = $2',
                            ['approved', paymentId]
                        );

                        // Credita o valor na carteira do usuário
                        await dbClient.query(
                            'UPDATE carteiras SET saldo = saldo + $1 WHERE usuario_id = $2',
                            [valor, usuario_id]
                        );

                        console.log(`[PIX APROVADO] Creditado R$ ${valor} para o usuário ${usuario_id}`);
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

// 3. ENDPOINT: Verificar status do pagamento (Polling do Front-end)
app.get('/api/pagamentos/status/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'SELECT status FROM pagamentos_pix WHERE mp_payment_id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pagamento não encontrado.' });
        }

        res.json({ status: result.rows[0].status });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar pagamento.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
