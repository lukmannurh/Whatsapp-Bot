const axios = require('axios');
const { load } = require('cheerio');
const { MessageMedia } = require('whatsapp-web.js');
const { logDownload } = require('../lib/db');
const log = require('../lib/log');

function parseIgCommand(text) {
  const m = text.trim().match(/^\.ig\s+(\S+)/i);
  return m ? m[1] : null;
}

function toSaveFromUrl(igUrl) {
  const normalized = igUrl.startsWith('http') ? igUrl : `https://${igUrl}`;
  return `https://sfrom.net/${normalized}`;
}

function pickMediaLinksFromHtml(html) {
  const $ = load(html);
  const links = new Set();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (/\.(mp4|mov|m4v)(\?|$)/i.test(href)) links.add(href);
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(href)) links.add(href);
  });

  $('source[src]').each((_, el) => {
    const src = ($(el).attr('src') || '').trim();
    if (/\.(mp4|mov|m4v)(\?|$)/i.test(src)) links.add(src);
  });

  const ogVideo = $('meta[property="og:video"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogVideo) links.add(ogVideo);
  if (ogImage) links.add(ogImage);

  const arr = Array.from(links);
  arr.sort((a,b) => {
    const isVidA = /\.(mp4|mov|m4v)(\?|$)/i.test(a);
    const isVidB = /\.(mp4|mov|m4v)(\?|$)/i.test(b);
    return (isVidA === isVidB) ? 0 : (isVidA ? -1 : 1);
  });
  return arr;
}

async function fetchSaveFromLinks(igUrl) {
  const url = toSaveFromUrl(igUrl);
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 20000
  });
  return pickMediaLinksFromHtml(res.data);
}

async function handleInstagram(client, message) {
  const igUrl = parseIgCommand(message.body || '');
  if (!igUrl) return false;

  try {
    const links = await fetchSaveFromLinks(igUrl);
    if (!links.length) {
      await message.reply('Tidak bisa mengambil media via SaveFrom. Pastikan link IG publik.');
      return true;
    }

    let sent = 0;
    for (const directUrl of links) {
      if (sent >= 3) break;
      try {
        const resp = await axios.get(directUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const ct = resp.headers['content-type'] || (directUrl.match(/\.(mp4|mov|m4v)$/i) ? 'video/mp4' : 'image/jpeg');
        const filename = ct.startsWith('image/') ? 'ig.jpg' : 'ig.mp4';
        const b64 = Buffer.from(resp.data).toString('base64');
        const media = new MessageMedia(ct, b64, filename);
        await client.sendMessage(message.from, media);
        await logDownload({ chatId: message.from, url: igUrl, mediaType: ct, status: 'success' });
        sent++;
      } catch (inner) {
        log.warn({ err: inner?.message || inner }, 'Failed sending one SaveFrom media');
        await logDownload({ chatId: message.from, url: igUrl, mediaType: 'unknown', status: 'failed', reason: String(inner?.message || inner) });
      }
    }

    if (sent === 0) {
      await message.reply('Gagal mengirim media dari SaveFrom. Coba link lain atau kirim ulang nanti.');
    }
    return true;
  } catch (err) {
    log.error({ err }, 'IG handler (SaveFrom) error');
    await message.reply('Gagal memproses link Instagram via SaveFrom.');
    return true;
  }
}

module.exports = { handleInstagram };
