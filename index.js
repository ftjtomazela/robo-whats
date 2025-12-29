const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const config = require('./loja_config');

const app = express();
const port = process.env.PORT || 10000;

let qrCodeImage = '';
let statusBot = 'Iniciando sistema... (Aguarde)';

// --- SERVIDOR WEB ---
app.get('/', (req, res) => {
    const html = `
        <html>
            <head>
                <title>Robô Dona Baguete</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 20px; background: #eee; }
                    .box { background: white; padding: 30px; border-radius: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    h1 { color: #444; margin-bottom: 10px; }
                    .status { font-weight: bold; color: #d35400; font-size: 1.2em; }
                    .connected { color: #27ae60; }
                    img { margin-top: 20px; border: 5px solid #333; border-radius: 10px; }
                    p.aviso { font-size: 0.9em; color: #666; max-width: 400px; margin: 10px auto; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h1>🥪 Painel Dona Baguete</h1>
                    <p>Status: <span class="status ${statusBot.includes('Sucesso') ? 'connected' : ''}">${statusBot}</span></p>
                    <hr/>
                    ${qrCodeImage ? `
                        <p><strong>Escaneie com seu WhatsApp:</strong></p>
                        <img src="${qrCodeImage}" width="280"/>
                        <p class="aviso">Se der erro ao conectar, aguarde 10 segundos e atualize a página para tentar um novo código.</p>
                    ` : ''}
                    
                    ${!qrCodeImage && !statusBot.includes('Sucesso') ? '<p>🚀 Ligando motores... Isso pode levar até 1 minuto.</p>' : ''}
                </div>
            </body>
        </html>
    `;
    res.send(html);
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});

// --- CLIENTE WHATSAPP COM CAMUFLAGEM ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // CAMUFLAGEM: Finge ser um Chrome normal no Windows
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--gpu-context-lost'
        ]
    },
    // Aumenta tolerância para internet lenta do Render
    qrMaxRetries: 5,
    authTimeoutMs: 60000, 
});

client.on('qr', async (qr) => {
    console.log('Novo QR Code gerado!');
    qrCodeImage = await qrcode.toDataURL(qr);
    statusBot = 'Aguardando leitura do QR Code...';
});

client.on('ready', () => {
    console.log(`✅ ${config.nomeLoja} CONECTADO!`);
    statusBot = 'Bot Conectado com Sucesso! ✅';
    qrCodeImage = '';
});

client.on('authenticated', () => {
    console.log('Autenticado com sucesso!');
    statusBot = 'Autenticado! Carregando chats...';
});

client.on('auth_failure', msg => {
    console.error('Falha na autenticação', msg);
    statusBot = 'Falha na autenticação. Reiniciando...';
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
    statusBot = 'Desconectado. Reiniciando...';
    client.initialize();
});

// --- LÓGICA DO ROBÔ ---
const sessoes = {}; 
const STAGES = { INICIO: 0, MENU: 1, ESCOLHA_QUEIJO: 2, ADICIONAIS_ITEM: 3, OBSERVACOES: 4, MORADA: 5, PAGAMENTO: 6, TROCO: 7 };

client.on('message', async message => {
    const chat = await message.getChat();
    if (chat.isGroup) return;

    const texto = message.body.toLowerCase();
    const from = message.from;

    if (!sessoes[from]) {
        sessoes[from] = { stage: STAGES.INICIO, itens: [], total: 0, itemTemp: null };
    }
    const sessao = sessoes[from];

    // --- FUNÇÕES ---
    async function finalizarPedido(metodoPagamento, infoTroco = '') {
        let resumo = `📝 *PEDIDO - ${config.nomeLoja.toUpperCase()}*\n----------------------\n`;
        sessao.itens.forEach(i => {
            resumo += `▪️ ${i.titulo} (R$ ${i.precoBase.toFixed(2)})\n`;
            if (i.adicionais && i.adicionais.length > 0) {
                i.adicionais.forEach(a => resumo += `   + ${a.nome} (R$ ${a.preco.toFixed(2)})\n`);
            }
        });
        if (sessao.obs) resumo += `\n⚠️ *Obs:* ${sessao.obs}\n`;
        resumo += `----------------------\n`;
        resumo += `🛵 Entrega: R$ ${config.taxaEntrega.toFixed(2)}\n`;
        resumo += `💰 *TOTAL: R$ ${sessao.total.toFixed(2)}*\n`;
        resumo += `📍 Endereço: ${sessao.endereco}\n`;
        resumo += `💳 Pagto: ${metodoPagamento} ${infoTroco}\n`;
        resumo += `----------------------\n`;
        resumo += `Obrigado! Enviando para preparação... 🔥`;

        await client.sendMessage(from, resumo);
        if (metodoPagamento === 'Pix') {
            await client.sendMessage(from, `💠 *DADOS PIX:*\n🔑 Chave: ${config.pixChave}\n👤 Nome: ${config.pixNome}\n\n_Envie o comprovante!_`);
        }
        sessoes[from] = { stage: STAGES.INICIO, itens: [], total: 0 };
    }

    // --- FLUXO ---
    if (sessao.stage === STAGES.INICIO) {
        let msg = `👋 Bem-vindo ao *${config.nomeLoja}*!\n${config.mensagemSaudacao}\n\nCardápio:\n`;
        for (const k in config.menu) {
            const item = config.menu[k];
            msg += `*${k}* - ${item.titulo} - R$ ${item.preco.toFixed(2)}\n`;
            if(item.descricao) msg += `   _(${item.descricao})_\n`;
        }
        msg += `\n🛵 Taxa Entrega: R$ ${config.taxaEntrega.toFixed(2)}\n⬇️ *Digite o número do item:*`;
        await client.sendMessage(from, msg);
        sessao.stage = STAGES.MENU;
    }
    else if (sessao.stage === STAGES.MENU) {
        if (config.menu[texto]) {
            const item = config.menu[texto];
            if (item.tipo === 'lanche') {
                sessao.itemTemp = { ...item, precoBase: item.preco, adicionais: [] };
                await client.sendMessage(from, `🧀 Você escolheu *${item.titulo}*.\nQual queijo? (1. Prato / 2. Mussarela / 3. Catupiry)`);
                sessao.stage = STAGES.ESCOLHA_QUEIJO;
            } else {
                sessao.itens.push({ ...item, precoBase: item.preco, titulo: item.titulo, adicionais: [] });
                sessao.total += item.preco;
                await client.sendMessage(from, `✅ *${item.titulo}* add! Digite outro ou *AVANÇAR*.`);
            }
        } else if (['avançar', 'avancar', 'fim'].includes(texto)) {
            if (sessao.itens.length === 0) await client.sendMessage(from, 'Carrinho vazio!');
            else {
                await client.sendMessage(from, `📝 *Observações?* Digite ou *NADA*.`);
                sessao.stage = STAGES.OBSERVACOES;
            }
        } else await client.sendMessage(from, '❌ Digite o número do item.');
    }
    else if (sessao.stage === STAGES.ESCOLHA_QUEIJO) {
        let queijo = '';
        if (texto.includes('1') || texto.includes('prato')) queijo = 'Queijo Prato';
        else if (texto.includes('2') || texto.includes('mussarela')) queijo = 'Queijo Mussarela';
        else if (texto.includes('3') || texto.includes('catupiry')) queijo = 'Catupiry';
        
        if (queijo) {
            sessao.itemTemp.titulo += ` (${queijo})`;
            let msg = `🛠 Adicionais para *${sessao.itemTemp.titulo}*?\n`;
            for (const k in config.adicionais) msg += `*${k}* - ${config.adicionais[k].nome} (+R$${config.adicionais[k].preco})\n`;
            msg += `\nDigite o código ou *NÃO*.`;
            await client.sendMessage(from, msg);
            sessao.stage = STAGES.ADICIONAIS_ITEM;
        } else await client.sendMessage(from, '❌ Digite 1, 2 ou 3.');
    }
    else if (sessao.stage === STAGES.ADICIONAIS_ITEM) {
        if (config.adicionais[texto]) {
            const adic = config.adicionais[texto];
            sessao.itemTemp.adicionais.push(adic);
            await client.sendMessage(from, `➕ *${adic.nome}* add! Mais algum? (Código ou NÃO).`);
        } else if (['nao', 'não', 'ok', 'nada'].includes(texto)) {
            const totalItem = sessao.itemTemp.precoBase + sessao.itemTemp.adicionais.reduce((a,b)=>a+b.preco,0);
            sessao.total += totalItem;
            sessao.itens.push(sessao.itemTemp);
            sessao.itemTemp = null;
            await client.sendMessage(from, `✅ Item confirmado! Escolha OUTRO ou *AVANÇAR*.`);
            sessao.stage = STAGES.MENU;
        }
    }
    else if (sessao.stage === STAGES.OBSERVACOES) {
        sessao.obs = (['nada', 'nao'].includes(texto)) ? '' : message.body;
        sessao.total += config.taxaEntrega;
        await client.sendMessage(from, `📍 *ENDEREÇO COMPLETO*:`);
        sessao.stage = STAGES.MORADA;
    }
    else if (sessao.stage === STAGES.MORADA) {
        sessao.endereco = message.body;
        await client.sendMessage(from, `💳 Total: R$ ${sessao.total.toFixed(2)}\nPagamento?\n1. Dinheiro\n2. Cartão\n3. Pix`);
        sessao.stage = STAGES.PAGAMENTO;
    }
    else if (sessao.stage === STAGES.PAGAMENTO) {
        if (texto.includes('1') || texto.includes('dinheiro')) {
            await client.sendMessage(from, `💵 Troco para quanto? (Valor ou NÃO)`);
            sessao.stage = STAGES.TROCO;
        }
        else if (texto.includes('2') || texto.includes('cartao')) await finalizarPedido('Cartão');
        else if (texto.includes('3') || texto.includes('pix')) await finalizarPedido('Pix');
    }
    else if (sessao.stage === STAGES.TROCO) {
        const val = parseFloat(texto.replace(',', '.'));
        if (!isNaN(val) && val >= sessao.total) await finalizarPedido('Dinheiro', `(Troco p/ ${val})`);
        else await finalizarPedido('Dinheiro', '(Sem troco)');
    }
});

client.initialize();