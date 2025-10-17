const { imageToSticker, videoToSticker } = require('../utils/media');
const { MessageMedia } = require('whatsapp-web.js');
const log = require('../lib/log');

async function handleSticker(client, message) {
  try {
    const trigger = (message.body && message.body.trim() === '.s') || (message.caption && message.caption.trim() === '.s');

    let targetMsg = message;
    if (!trigger && message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      if (quoted && quoted.hasMedia && message.body && message.body.trim() === '.s') {
        targetMsg = quoted;
      } else {
        return false;
      }
    } else if (!trigger) {
      return false;
    }

    const media = await targetMsg.downloadMedia();
    if (!media) {
      await message.reply('Tidak ada media ditemukan. Kirim gambar/video dengan caption `.s` atau reply `.s` ke media.');
      return true;
    }

    const isVideo = media.mimetype.startsWith('video/');
    const buffer = Buffer.from(media.data, 'base64');

    const webp = isVideo
      ? await videoToSticker(buffer, { author: message.author || message.from })
      : await imageToSticker(buffer, { author: message.author || message.from });

    const sticker = new MessageMedia('image/webp', webp.toString('base64'), 'sticker.webp');
    await client.sendMessage(message.from, sticker, { sendMediaAsSticker: true });
    return true;
  } catch (err) {
    log.error({ err }, 'Sticker generation failed');
    await message.reply('Gagal membuat sticker. Pastikan format media benar.');
    return true;
  }
}

module.exports = { handleSticker };
