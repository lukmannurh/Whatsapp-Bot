const axios = require('axios');
const ig = require('instagram-url-direct');
const { MessageMedia } = require('whatsapp-web.js');
const { logDownload } = require('../lib/db');
const log = require('../lib/log');

function parseIgCommand(text) {
  const m = text.trim().match(/^\.ig\s+(\S+)/i);
  return m ? m[1] : null;
}

async function fetchIgLinks(url) {
  const result = await ig.getInfo(url);
  const links = result?.url_list || [];
  return links;
}

async function handleInstagram(client, message) {
  const url = parseIgCommand(message.body || '');
  if (!url) return false;

  try {
    const links = await fetchIgLinks(url);
    if (!links.length) {
      await message.reply('Tidak dapat mengambil media dari link tersebut. Pastikan link publik.');
      return true;
    }

    for (const directUrl of links.slice(0, 5)) {
      try {
        const res = await axios.get(directUrl, { responseType: 'arraybuffer' });
        const b64 = Buffer.from(res.data).toString('base64');
        const mime = res.headers['content-type'] || 'video/mp4';
        const filename = mime.startsWith('image/') ? 'ig.jpg' : 'ig.mp4';
        const media = new MessageMedia(mime, b64, filename);
        await client.sendMessage(message.from, media);
        await logDownload({ chatId: message.from, url, mediaType: mime, status: 'success' });
      } catch (inner) {
        log.warn({ err: inner }, 'Failed sending one IG media');
        await logDownload({ chatId: message.from, url, mediaType: 'unknown', status: 'failed', reason: String(inner.message || inner) });
      }
    }

    return true;
  } catch (err) {
    log.error({ err }, 'IG handler error');
    await message.reply('Gagal memproses link Instagram.');
    return true;
  }
}

module.exports = { handleInstagram };
