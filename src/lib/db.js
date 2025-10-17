const { Pool } = require('pg');
const { DATABASE_URL } = require('./env');
const log = require('./log');

const pool = new Pool({ connectionString: DATABASE_URL });

pool.on('error', (err) => {
  log.error({ err }, 'PostgreSQL pool error');
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "MessageLog" (
      id BIGSERIAL PRIMARY KEY,
      "chatId" TEXT NOT NULL,
      "fromUser" TEXT NOT NULL,
      "isGroup" BOOLEAN NOT NULL,
      command TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DownloadLog" (
      id BIGSERIAL PRIMARY KEY,
      "chatId" TEXT NOT NULL,
      url TEXT NOT NULL,
      "mediaType" TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function logMessage({ chatId, fromUser, isGroup, command }) {
  try {
    await pool.query(
      'INSERT INTO "MessageLog" ("chatId", "fromUser", "isGroup", command) VALUES ($1,$2,$3,$4)',
      [chatId, fromUser, isGroup, command || null]
    );
  } catch (err) {
    log.warn({ err }, 'Failed to insert MessageLog');
  }
}

async function logDownload({ chatId, url, mediaType, status, reason }) {
  try {
    await pool.query(
      'INSERT INTO "DownloadLog" ("chatId", url, "mediaType", status, reason) VALUES ($1,$2,$3,$4,$5)',
      [chatId, url, mediaType, status, reason || null]
    );
  } catch (err) {
    log.warn({ err }, 'Failed to insert DownloadLog');
  }
}

module.exports = { pool, init, logMessage, logDownload };
