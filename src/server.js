const express = require('express');
const { PORT } = require('./lib/env');
const { getLastQr } = require('./bot');

function createServer() {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get('/qr', (req, res) => {
    const dataUrl = getLastQr();
    if (!dataUrl) return res.status(204).end();
    const img = Buffer.from(dataUrl.split(',')[1], 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.send(img);
  });

  const server = app.listen(PORT, () => {
    console.log(`HTTP server listening on :${PORT}`);
  });

  return { app, server };
}

module.exports = { createServer };
