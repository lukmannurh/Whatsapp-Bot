const log = require('../lib/log');
const { isOwnerJid, isGroupAdmin, toJid } = require('../utils/auth');

function parseKick(text) {
  const m = (text || '').trim().match(/^\.kick\b(?:\s+(\S+))?/i);
  return m ? (m[1] || null) : null;
}

async function handleKick(client, message) {
  const text = (message.body || '').trim();
  if (!/^\.kick\b/i.test(text)) return false;

  const { chat } = await message.getChat() && await isGroupAdmin(client, message);
  const authorJid = message.author || message.from;
  const perm = await isGroupAdmin(client, message);
  if (!(perm.authorIsAdmin || isOwnerJid(authorJid))) {
    await message.reply('Perintah .kick hanya untuk admin grup atau owner bot.');
    return true;
  }
  if (!perm.botIsAdmin) {
    await message.reply('Bot harus dijadikan admin untuk mengeluarkan anggota.');
    return true;
  }

  const chatObj = await message.getChat();
  if (!chatObj.isGroup) {
    await message.reply('Perintah ini hanya untuk grup.');
    return true;
  }

  // Determine targets
  let targets = [];
  // 1) from mentions
  if (message.mentionedIds && message.mentionedIds.length) {
    targets = targets.concat(message.mentionedIds);
  }
  // 2) from quoted message author
  if (message.hasQuotedMsg) {
    const q = await message.getQuotedMessage();
    if (q && q.author) targets.push(q.author);
  }
  // 3) from argument
  const arg = parseKick(text);
  if (arg) {
    const jid = toJid(arg);
    if (jid) targets.push(jid);
  }

  // Normalize & unique; don't allow kicking self or owner
  const me = await client.getMe();
  const myId = me?.id?._serialized || me?.id;
  const uniq = Array.from(new Set(targets.filter(Boolean)));
  const finalTargets = uniq.filter(j => j !== myId && !isOwnerJid(j));

  if (!finalTargets.length) {
    await message.reply('Sebut anggota (@user), reply pesannya, atau beri nomor: `.kick 628xxxx`');
    return true;
  }

  // Ensure targets are current participants
  const group = await message.getChat();
  const participantIds = new Set(group.participants.map(p => p.id?._serialized));
  const validTargets = finalTargets.filter(j => participantIds.has(j));

  if (!validTargets.length) {
    await message.reply('Target tidak ditemukan di grup ini.');
    return true;
  }

  try {
    await group.removeParticipants(validTargets);
    await message.reply(`Berhasil mengeluarkan:\n${validTargets.map(v => '@' + v.split('@')[0]).join(' ')}`, { mentions: validTargets });
  } catch (err) {
    log.error({ err }, 'Kick failed');
    await message.reply('Gagal mengeluarkan anggota. Pastikan bot admin dan target masih di grup.');
  }
  return true;
}

module.exports = { handleKick };
