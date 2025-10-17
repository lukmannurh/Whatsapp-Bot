const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Prefer system ffmpeg inside Debian image
const FFMPEG_BIN = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
try { ffmpeg.setFfmpegPath(FFMPEG_BIN); } catch (_) {}

const TMP_DIR = process.env.TMP_DIR || path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

async function imageToSticker(buffer, metadata = {}) {
  const sticker = new Sticker(buffer, {
    type: StickerTypes.FULL,
    pack: metadata.pack || 'Bot Stickers',
    author: metadata.author || 'whatsapp-bot',
    quality: 90,
  });
  return await sticker.build();
}

async function videoBufferToAnimatedWebp(buffer, opts = {}) {
  const inPath = path.join(TMP_DIR, `in_${Date.now()}.mp4`);
  const outPath = path.join(TMP_DIR, `out_${Date.now()}.webp`);
  await fsp.writeFile(inPath, buffer);

  // Defaults: <=6s, 15fps, 512x512 letterboxed, loop=0
  const maxDur = String(opts.maxDurationSec || 6);
  const fps = String(opts.fps || 15);
  const bg = opts.bg || 'white@0.0'; // transparent padding
  const scale = 'scale=512:512:force_original_aspect_ratio=decrease';
  const pad = `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=${bg}`;

  await new Promise((resolve, reject) => {
    ffmpeg(inPath)
      .inputOptions(['-t', maxDur])
      .outputOptions([
        '-vcodec', 'libwebp',
        '-vf', `${scale},fps=${fps},${pad}`,
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-ss', '00:00:00'
      ])
      .toFormat('webp')
      .on('end', resolve)
      .on('error', reject)
      .save(outPath);
  });

  const outBuf = await fsp.readFile(outPath);
  // cleanup
  fsp.unlink(inPath).catch(()=>{});
  fsp.unlink(outPath).catch(()=>{});
  return outBuf;
}

async function videoToSticker(buffer, metadata = {}) {
  const webp = await videoBufferToAnimatedWebp(buffer, { maxDurationSec: 6, fps: 15 });
  return webp;
}

module.exports = { imageToSticker, videoToSticker };
