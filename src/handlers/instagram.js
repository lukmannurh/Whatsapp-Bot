const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const { logDownload } = require('../lib/db');
const log = require('../lib/log');

function parseIgCommand(text) {
  const m = text.trim().match(/^\.ig\s+(\S+)/i);
  return m ? m[1] : null;
}

async function ryzumiIgdl(igUrl) {
  const endpoint = 'https://api.ryzumi.vip/api/downloader/igdl';
  const res = await axios.get(endpoint, {
    params: { url: igUrl },
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json,text/plain,*/*',
    },
    timeout: 30000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (res.status >= 400) {
    throw new Error(`Ryzumi API error: HTTP ${res.status}`);
  }

  const body = res.data;
  // Be liberal about response shape
  // Try common shapes: { data: [...] } | { result: [...] } | { url: "...", urls: [...] }
  let items = [];
  const pushCandidate = (obj) => {
    if (!obj) return;
    if (typeof obj === 'string') items.push({ url: obj });
    if (obj.url) items.push({ url: obj.url, type: obj.type || null, mime: obj.mime || null });
    if (obj.download_url) items.push({ url: obj.download_url, type: obj.type || null, mime: obj.mime || null });
    if (obj.link) items.push({ url: obj.link, type: obj.type || null, mime: obj.mime || null });
  };

  if (Array.isArray(body)) body.forEach(pushCandidate);
  if (Array.isArray(body?.data)) body.data.forEach(pushCandidate);
  if (Array.isArray(body?.result)) body.result.forEach(pushCandidate);
  if (Array.isArray(body?.urls)) body.urls.forEach(pushCandidate);
  if (typeof body?.url === 'string') items.push({ url: body.url });

  // Deduplicate & basic filter
  const seen = new Set();
  items = items.filter(x => {
    if (!x.url || typeof x.url !== 'string') return false;
    const u = x.url.trim();
    if (!/^https?:\/\//i.test(u)) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  // Sort: prefer video first
  const isVideo = (u) => /(\.mp4|\.mov|\.m4v)(\?|$)/i.test(u) || /video/i.test(u);
  items.sort((a,b) => {
    const av = isVideo(a.url), bv = isVideo(b.url);
    return av === bv ? 0 : (av ? -1 : 1);
  });

  return items.map(x => x.url);
}

async function handleInstagram(client, message) {
  const igUrl = parseIgCommand(message.body || '');
  if (!igUrl) return false;

  try {
    const links = await ryzumiIgdl(igUrl);
    if (!links.length) {
      await message.reply('Tidak bisa mengambil media dari API Ryzumi. Pastikan link IG publik.');
      return true;
    }

    let sent = 0;
    for (const directUrl of links) {
      if (sent >= 5) break;
      try {
        const resp = await axios.get(directUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const ct = resp.headers['content-type'] || (/(\.mp4|\.mov|\.m4v)(\?|$)/i.test(directUrl) ? 'video/mp4' : 'image/jpeg');
        const filename = ct.startsWith('image/') ? 'ig.jpg' : 'ig.mp4';
        const b64 = Buffer.from(resp.data).toString('base64');
        const media = new MessageMedia(ct, b64, filename);
        await client.sendMessage(message.from, media);
        await logDownload({ chatId: message.from, url: igUrl, mediaType: ct, status: 'success' });
        sent++;
      } catch (inner) {
        log.warn({ err: inner?.message || inner }, 'Failed sending one IG media (Ryzumi)');
        await logDownload({ chatId: message.from, url: igUrl, mediaType: 'unknown', status: 'failed', reason: String(inner?.message || inner) });
      }
    }

    if (sent === 0) {
      await message.reply('Gagal mengirim media dari API Ryzumi. Coba link lain atau kirim ulang nanti.');
    }
    return true;
  } catch (err) {
    log.error({ err }, 'IG handler (Ryzumi) error');
    await message.reply('Gagal memproses link Instagram via API Ryzumi.');
    return true;
  }
}

module.exports = { handleInstagram };
