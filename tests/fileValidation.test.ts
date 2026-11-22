import { describe, expect, it } from 'vitest';
import { validateAudioBuffer, validateImageBuffer } from '../server/utils/fileValidation.js';

describe('fileValidation (Magic-Byte Upload Security)', () => {
  it('accepts valid PNG, JPEG, and WebP signatures', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(validateImageBuffer(png, 'banner.png')).toMatchObject({
      ok: true,
      extension: '.png',
      detectedMime: 'image/png',
    });

    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(validateImageBuffer(jpg, 'captains.jpg')).toMatchObject({
      ok: true,
      extension: '.jpg',
      detectedMime: 'image/jpeg',
    });

    const webp = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1');
    expect(validateImageBuffer(webp, 'logo.webp')).toMatchObject({
      ok: true,
      extension: '.webp',
      detectedMime: 'image/webp',
    });
  });

  it('rejects spoofed files (HTML/JS renamed to .png) and disallowed extensions', () => {
    const fakePng = Buffer.from('<script>alert(1)</script>', 'utf8');
    expect(validateImageBuffer(fakePng, 'evil.png').ok).toBe(false);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateImageBuffer(png, 'evil.svg').ok).toBe(false);
  });

  it('accepts valid WAV and MP3 audio signatures and rejects spoofed audio', () => {
    const wav = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1');
    expect(validateAudioBuffer(wav, 'four.wav')).toMatchObject({
      ok: true,
      extension: '.wav',
      detectedMime: 'audio/wav',
    });

    const mp3 = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'latin1');
    expect(validateAudioBuffer(mp3, 'six.mp3')).toMatchObject({
      ok: true,
      extension: '.mp3',
      detectedMime: 'audio/mpeg',
    });

    const spoof = Buffer.from('not really audio data', 'utf8');
    expect(validateAudioBuffer(spoof, 'wicket.wav').ok).toBe(false);
  });
});
