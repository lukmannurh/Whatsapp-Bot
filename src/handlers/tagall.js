const log = require('../lib/log');
const { isOwnerJid, isGroupAdmin } = require('../utils/auth');

function parseTagAll(text) {
  return /^\.(tagall|all|semua)\b/i.test((text || '').trim());
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function handleTagAll(client, message) {
  const text = (message.body || '').trim();
  if (!parseTagAll(text)) return false;

  try {
    const chat = await message.getChat();
    if (!chat.isGroup) {
      await message.reply('Perintah ini hanya untuk grup.');
      return true;
    }

    const participants = chat.participants || [];
    if (!participants.length) {
      await message.reply('Tidak ada anggota grup yang bisa disebut.');
      return true;
    }

    // Ambil Contact untuk mention
    const contacts = await Promise.all(
      participants.map(p => client.getContactById(p.id._serialized))
    );

    // WhatsApp bisa batasi panjang pesan / jumlah mention,
    // bagi menjadi chunk (mis. 25 per pesan).
    const CHUNK_SIZE = 25;
    const batches = chunk(contacts, CHUNK_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
const batchIds = batch.map(c => c.id?._serialized || c.id || c.number);
const names = batch.map(c => `@${(c.number || c.id.user)}`).join(' ');
const header = i === 0
  ? `Menandai ${contacts.length} anggota grup:`
  : `Lanjutan (${i+1}/${batches.length})`;
const body = `${header}
${names}`;
await client.sendMessage(message.from, body, { mentions: batchIds });
    }

    return true;
  } catch (err) {
    log.error({ err }, 'TagAll handler error');
    await message.reply('Gagal menjalankan .tagall.');
    return true;
  }
}

module.exports = { handleTagAll };
