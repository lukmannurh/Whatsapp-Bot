const axios = require('axios');
const { load } = require('cheerio');
const { MessageMedia } = require('whatsapp-web.js');
const { logDownload } = require('../lib/db');
const log = require('../lib/log');

const RYZUMI_ENABLED = String(process.env.RYZUMI_ENABLED || 'true').toLowerCase() === 'true';
const RYZUMI_API_URL = process.env.RYZUMI_API_URL || 'https://api.ryzumi.vip/api/downloader/igdl';
const RYZUMI_API_KEY = process.env.RYZUMI_API_KEY || null;

function parseIgCommand(text) {
  const m = (text || '').trim().match(/^\.ig\s+(\S+)/i);
  return m ? m[1] : null;
}

function serializeParams(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }
  return usp.toString();
}

async function ryzumiIgdl(igUrl) {
  const params = { url: igUrl };
  if (RYZUMI_API_KEY) params.apikey = RYZUMI_API_KEY;

  const tryProfiles = [
    // Profile A: minimal headers (matches their curl docs: accept: application/json)
    { headers: { 'accept': 'application/json', 'user-agent': 'curl/8.x bot' } },
    // Profile B: browser-like
    { headers: { 'Accept': 'application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0' } },
  ];

  let lastErr;
  for (const prof of tryProfiles) {
    try {
      const res = await axios.get(`${RYZUMI_API_URL}?${serializeParams(params)}`, {
        ...prof,
        timeout: 30000,
        validateStatus: (s) => s >= 200 && s < 500,
      });
      if (res.status >= 400) {
        const e = new Error(`Ryzumi API error: HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
      const body = res.data;
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

      const seen = new Set();
      items = items.filter(x => {
        const u = x?.url;
        if (!u || typeof u !== 'string') return false;
        const t = u.trim();
        if (!/^https?:\/\//i.test(t)) return false;
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      });

      const isVideo = (u) => /(\.mp4|\.mov|\.m4v)(\?|$)/i.test(u) || /video/i.test(u);
      items.sort((a,b) => {
        const av = isVideo(a.url), bv = isVideo(b.url);
        return av === bv ? 0 : (av ? -1 : 1);
      });
      const urls = items.map(x => x.url);
      if (urls.length) return urls;
      lastErr = new Error('Ryzumi returned no media links');
    } catch (e) {
      lastErr = e;
      log.warn({ profile: prof.headers, err: e?.message || e }, 'Ryzumi attempt failed');
      // try next profile
    }
  }
  throw lastErr || new Error('Ryzumi failed');
}

function toSaveFromUrl(igUrl) {
  const normalized = igUrl.startsWith('http') ? igUrl : `https://${igUrl}`;
  return `https://sfrom.net/${encodeURIComponent(normalized)}`;
}

function normalizeLink(href) {
  if (!href) return null;
  let h = href.trim();
  if (!h) return null;
  // Protocol-relative URLs: //cdn.example.com/file.mp4
  if (h.startsWith('//')) return 'https:' + h;
  // Relative paths: /dl/file.mp4
  if (h.startsWith('/')) return new URL(h, 'https://sfrom.net').href;
  // Data URIs or blobs are invalid for our purpose
  if (h.startsWith('data:') || h.startsWith('blob:')) return null;
  // Otherwise, return as-is
  return h;
}

function pickMediaLinksFromHtml(html) {
  const $ = load(html);
  const links = new Set();

  $('a[href]').each((_, el) => {
    const raw = ($(el).attr('href') || '');
    const href = normalizeLink(raw);
    if (!href) return;
    if (/\.(mp4|mov|m4v)(\?|$)/i.test(href)) links.add(href);
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(href)) links.add(href);
  });

  $('source[src]').each((_, el) => {
    const raw = ($(el).attr('src') || '');
    const src = normalizeLink(raw);
    if (!src) return;
    if (/\.(mp4|mov|m4v)(\?|$)/i.test(src)) links.add(src);
  });

  const ogVideo = normalizeLink($('meta[property="og:video"]').attr('content'));
  const ogImage = normalizeLink($('meta[property="og:image"]').attr('content'));
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
async function savefromFallback(igUrl) {
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

  let links = [];
  try {
    if (RYZUMI_ENABLED) {
      links = await ryzumiIgdl(igUrl);
    }
  } catch (e) {
    log.warn({ err: e?.message || e }, 'Ryzumi failed; using SaveFrom fallback');
  }

  if (!links.length) {
    try {
      links = await savefromFallback(igUrl);
    } catch (e) {
      log.error({ err: e?.message || e }, 'SaveFrom fallback failed');
    }
  }

  if (!links.length) {
    await message.reply('Tidak bisa mengambil media. Coba link publik atau beberapa saat lagi.');
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
      log.warn({ err: inner?.message || inner }, 'Failed sending one IG media');
      await logDownload({ chatId: message.from, url: igUrl, mediaType: 'unknown', status: 'failed', reason: String(inner?.message || inner) });
    }
  }

  if (sent === 0) {
    await message.reply('Gagal mengirim media dari link tersebut.');
  }
  return true;
}

module.exports = { handleInstagram };
