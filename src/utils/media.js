const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const ffmpeg = require('fluent-ffmpeg');

async function imageToSticker(buffer, metadata = {}) {
  const sticker = new Sticker(buffer, {
    type: StickerTypes.FULL,
    pack: metadata.pack || 'Bot Stickers',
    author: metadata.author || 'whatsapp-bot',
    quality: 90,
  });
  return await sticker.build();
}

async function videoToSticker(buffer, metadata = {}) {
  const sticker = new Sticker(buffer, {
    type: StickerTypes.FULL,
    pack: metadata.pack || 'Bot Stickers',
    author: metadata.author || 'whatsapp-bot',
    quality: 90,
    animated: true,
    loop: 0,
  });
  return await sticker.build();
}

module.exports = { imageToSticker, videoToSticker };
