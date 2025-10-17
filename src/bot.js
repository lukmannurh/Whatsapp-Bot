const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const log = require('./lib/log');
const { WAPP_CLIENT_ID } = require('./lib/env');
const { handleSticker } = require('./handlers/sticker');
const { handleInstagram } = require('./handlers/instagram');
const { logMessage } = require('./lib/db');

let lastQrDataUrl = null;

function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: WAPP_CLIENT_ID }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    }
  });

  client.on('qr', async (qr) => {
    log.info('QR received, open logs or GET /qr to scan');
    lastQrDataUrl = await qrcode.toDataURL(qr);
  });

  client.on('ready', () => {
    log.info('WhatsApp client ready');
    lastQrDataUrl = null;
  });

  client.on('auth_failure', (m) => log.error({ m }, 'Auth failure'));

  client.on('message', async (message) => {
    try {
      const isGroup = message.from.endsWith('@g.us');
      if (!isGroup) {
        await message.reply('Bot ini hanya dapat digunakan di grup.');
        return;
      }

      const sender = message.author || message.from;
      const text = (message.body || '').trim();

      const command = text.startsWith('.') ? text.split(' ')[0] : null;
      logMessage({ chatId: message.from, fromUser: sender, isGroup, command });

      if (await handleInstagram(client, message)) return;
      if (await handleSticker(client, message)) return;

      if (text === '.help') {
        await message.reply(
          `Perintah tersedia:\n` +
          `- Kirim gambar/video + caption ".s" → bot balas sticker\n` +
          `- .ig <link_instagram> → unduh media IG (via SaveFrom)\n` +
          `- .help → bantuan`
        );
      }
    } catch (err) {
      log.error({ err }, 'Message handler error');
    }
  });

  return client;
}

function getLastQr() {
  return lastQrDataUrl;
}

module.exports = { createClient, getLastQr };
