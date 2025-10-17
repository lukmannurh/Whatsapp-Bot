const log = require('../lib/log');

// Normalize various phone formats to WhatsApp JID (best-effort)
function toJid(num) {
  if (!num) return null;
  const digits = String(num).replace(/\D+/g, '');
  if (!digits) return null;
  // If starts with 0, assume Indonesia +62 as common case; otherwise keep as is.
  const intl = digits.startsWith('0') ? ('62' + digits.slice(1)) : digits;
  return intl + '@c.us';
}

function parseOwnerNumbers(envStr) {
  const raw = (envStr || '').trim();
  const list = raw ? raw.split(',') : [];
  return list.map(s => toJid(s.trim())).filter(Boolean);
}

const OWNER_JIDS = (() => {
  const envStr = process.env.OWNER_NUMBERS || '082210371333';
  const arr = parseOwnerNumbers(envStr);
  return new Set(arr);
})();

function isOwnerJid(jid) {
  if (!jid) return false;
  return OWNER_JIDS.has(jid);
}

async function isGroupAdmin(client, message) {
  const chat = await message.getChat();
  if (!chat.isGroup) return false;
  const author = message.author || message.from; // author exists for group msgs
  const me = await client.getMe();
  const myId = me?.id?._serialized || me?.id;
  // find me in participants for bot admin check (some actions require bot admin)
  const mePart = chat.participants.find(p => p.id?._serialized === myId);
  const authorPart = chat.participants.find(p => p.id?._serialized === author);
  const authorIsAdmin = Boolean(authorPart && (authorPart.isAdmin || authorPart.isSuperAdmin));
  const botIsAdmin = Boolean(mePart && (mePart.isAdmin || mePart.isSuperAdmin));
  return { authorIsAdmin, botIsAdmin, chat, meId: myId };
}

module.exports = { toJid, isOwnerJid, isGroupAdmin };
