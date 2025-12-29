const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Biblioteca para gerar imagem (não terminal)
const express = require('express'); // Servidor web mais robusto
const config = require('./loja_config'); // Suas configurações

// --- 1. CONFIGURAÇÃO DO SERVIDOR WEB (Para mostrar o QR Code) ---
const app = express();
const port = process.env.PORT || 10000;

let qrCodeImage = ''; // Variável para guardar a imagem do QR
let statusBot = 'Iniciando sistema...';

app.get('/', (req, res) => {
    // Cria um site simples que se atualiza sozinho
    const html = `
        <html>
            <head>
                <title>Robô Dona Baguete</title>
                <meta http-equiv="refresh" content="5"> <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 40px; background-color: #f4f4f9; }
                    .box { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); display: inline-block; }
                    h1 { color: #333; }
                    .status { font-weight: bold; color: #007bff; }
                    .connected { color: green; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h1>🥪 Painel Dona Baguete</h1>
                    <p>Status: <span class="status ${statusBot.includes('Sucesso') ? 'connected' : ''}">${statusBot}</span></p>
                    <hr/>
                    ${qrCodeImage ? `<p>Leia o QR Code no seu WhatsApp:</p><img src="${qrCodeImage}" width="300"/>` : ''}
                    ${!qrCodeImage && !statusBot.includes('Sucesso') ? '<p>Gerando QR Code... Aguarde...</p>' : ''}
                </div>
            </body>
        </html>
    `;
    res.send(html);
});

app.listen(port, () => {
    console.log(`Servidor web rodando na porta ${port}`);
});

// --- 2. CLIENTE DO WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
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
    }
});

// --- Eventos de Conexão ---
client.on('qr', async (qr) => {
    console.log('QR Code recebido! Atualizando site...');
    // Converte o código em uma imagem para exibir no navegador
    qrCodeImage = await qrcode.toDataURL(qr);
    statusBot = 'Aguardando leitura do QR Code...';
});

client.on('ready', () => {
    console.log(`✅ ${config.nomeLoja} ESTÁ ON-LINE!`);
    statusBot = 'Bot Conectado com Sucesso! ✅';
    qrCodeImage = ''; // Limpa o QR Code da tela
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
    statusBot = 'Desconectado. Reiniciando...';
    client.initialize();
});

// --- 3. LÓGICA DO ROBÔ (SEU CÓDIGO ORIGINAL) ---
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

    // --- FUNÇÃO GENÉRICA DE RESUMO ---
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
            await client.sendMessage(from, 
                `💠 *DADOS PIX:*\n🔑 Chave: ${config.pixChave}\n👤 Nome: ${config.pixNome}\n\n_Envie o comprovante!_`
            );
        }
        sessoes[from] = { stage: STAGES.INICIO, itens: [], total: 0 };
    }

    // --- ETAPA 0: INÍCIO ---
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

    // --- ETAPA 1: MENU ---
    else if (sessao.stage === STAGES.MENU) {
        if (config.menu[texto]) {
            const itemSelecionado = config.menu[texto];
            
            if (itemSelecionado.tipo === 'lanche') {
                sessao.itemTemp = { ...itemSelecionado, precoBase: itemSelecionado.preco, adicionais: [] };
                await client.sendMessage(from, `🧀 Você escolheu *${itemSelecionado.titulo}*.\nQual queijo? (1. Prato / 2. Mussarela / 3. Catupiry)`);
                sessao.stage = STAGES.ESCOLHA_QUEIJO;
            } else {
                sessao.itens.push({ ...itemSelecionado, precoBase: itemSelecionado.preco, titulo: itemSelecionado.titulo, adicionais: [] });
                sessao.total += itemSelecionado.preco;
                await client.sendMessage(from, `✅ *${itemSelecionado.titulo}* add! Digite outro ou *AVANÇAR*.`);
            }
        } 
        else if (['avançar', 'avancar', 'fim'].includes(texto)) {
            if (sessao.itens.length === 0) {
                await client.sendMessage(from, 'Carrinho vazio!');
            } else {
                await client.sendMessage(from, `📝 *Observações/Remoções?* Digite ou *NADA*.`);
                sessao.stage = STAGES.OBSERVACOES;
            }
        } else {
            await client.sendMessage(from, '❌ Digite o número do item.');
        }
    }

    // --- ETAPA 2: QUEIJO ---
    else if (sessao.stage === STAGES.ESCOLHA_QUEIJO) {
        let queijo = '';
        if (texto.includes('1') || texto.includes('prato')) queijo = 'Queijo Prato';
        else if (texto.includes('2') || texto.includes('mussarela')) queijo = 'Queijo Mussarela';
        else if (texto.includes('3') || texto.includes('catupiry')) queijo = 'Catupiry (Recheio)';
        
        if (queijo) {
            sessao.itemTemp.titulo = `${sessao.itemTemp.titulo} (${queijo})`;
            let msgAdic = `🛠 Adicionais para *${sessao.itemTemp.titulo}*?\n`;
            for (const k in config.adicionais) msgAdic += `*${k}* - ${config.adicionais[k].nome} (+R$${config.adicionais[k].preco})\n`;
            msgAdic += `\nDigite o código ou *NÃO*.`;
            await client.sendMessage(from, msgAdic);
            sessao.stage = STAGES.ADICIONAIS_ITEM;
        } else {
            await client.sendMessage(from, '❌ Digite 1, 2 ou 3.');
        }
    }

    // --- ETAPA 3: ADICIONAIS DO ITEM ---
    else if (sessao.stage === STAGES.ADICIONAIS_ITEM) {
        if (config.adicionais[texto]) {
            const adic = config.adicionais[texto];
            sessao.itemTemp.adicionais.push(adic);
            await client.sendMessage(from, `➕ *${adic.nome}* add! Mais algum? (Código ou NÃO).`);
        } 
        else if (['nao', 'não', 'ok', 'nada'].includes(texto)) {
            const precoTotalItem = sessao.itemTemp.precoBase + sessao.itemTemp.adicionais.reduce((a, b) => a + b.preco, 0);
            sessao.total += precoTotalItem;
            sessao.itens.push(sessao.itemTemp);
            sessao.itemTemp = null;
            await client.sendMessage(from, `✅ Item confirmado! Escolha OUTRO ou *AVANÇAR*.`);
            sessao.stage = STAGES.MENU;
        }
    }

    // --- ETAPA 4: OBSERVAÇÕES ---
    else if (sessao.stage === STAGES.OBSERVACOES) {
        sessao.obs = (['nada', 'nao', 'ok'].includes(texto)) ? '' : message.body;
        sessao.total += config.taxaEntrega;
        await client.sendMessage(from, `📍 Digite seu *ENDEREÇO COMPLETO*:`);
        sessao.stage = STAGES.MORADA;
    }

    // --- ETAPA 5: ENDEREÇO ---
    else if (sessao.stage === STAGES.MORADA) {
        sessao.endereco = message.body;
        await client.sendMessage(from, `💳 Total: R$ ${sessao.total.toFixed(2)}\nPagamento?\n1. Dinheiro\n2. Cartão\n3. Pix`);
        sessao.stage = STAGES.PAGAMENTO;
    }

    // --- ETAPA 6: PAGAMENTO ---
    else if (sessao.stage === STAGES.PAGAMENTO) {
        if (texto.includes('1') || texto.includes('dinheiro')) {
            await client.sendMessage(from, `💵 Troco para quanto? (Digite valor ou NÃO)`);
            sessao.stage = STAGES.TROCO;
        }
        else if (texto.includes('2') || texto.includes('cartao')) await finalizarPedido('Cartão');
        else if (texto.includes('3') || texto.includes('pix')) await finalizarPedido('Pix');
    }

    // --- ETAPA 7: TROCO ---
    else if (sessao.stage === STAGES.TROCO) {
        const valor = parseFloat(texto.replace(',', '.'));
        if (!isNaN(valor) && valor >= sessao.total) {
            await finalizarPedido('Dinheiro', `(Troco p/ ${valor} -> ${valor - sessao.total})`);
        } else {
            await finalizarPedido('Dinheiro', '(Sem troco)');
        }
    }
});

// Inicializa o robô
client.initialize();