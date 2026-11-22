import path from 'node:path';

export interface ValidatedUpload {
  ok: true;
  extension: string;
  detectedMime: string;
}

export interface InvalidUpload {
  ok: false;
  reason: string;
}

export type UploadValidationResult = ValidatedUpload | InvalidUpload;

function startsWithBytes(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

export function validateImageBuffer(
  buffer: Buffer,
  originalFilename: string,
  maxBytes = 5 * 1024 * 1024
): UploadValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'Uploaded image file is empty.' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, reason: `Image exceeds maximum allowed size (${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
  if (!allowedExts.has(ext)) {
    return { ok: false, reason: 'Unsupported image extension. Allowed: PNG, JPG, JPEG, WebP, GIF.' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, extension: '.png', detectedMime: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return { ok: true, extension: '.jpg', detectedMime: 'image/jpeg' };
  }
  // GIF87a or GIF89a
  if (
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { ok: true, extension: '.gif', detectedMime: 'image/gif' };
  }
  // WebP: RIFF....WEBP
  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
    startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ok: true, extension: '.webp', detectedMime: 'image/webp' };
  }

  return { ok: false, reason: 'File contents do not match a valid PNG, JPEG, WebP, or GIF image signature.' };
}

export function validateAudioBuffer(
  buffer: Buffer,
  originalFilename: string,
  maxBytes = 10 * 1024 * 1024
): UploadValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'Uploaded audio file is empty.' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, reason: `Audio file exceeds maximum allowed size (${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  const allowedExts = new Set(['.wav', '.mp3', '.ogg', '.webm', '.m4a']);
  if (!allowedExts.has(ext)) {
    return { ok: false, reason: 'Unsupported audio extension. Allowed: WAV, MP3, OGG, WebM, M4A.' };
  }

  // WAV: RIFF....WAVE
  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
    startsWithBytes(buffer, [0x57, 0x41, 0x56, 0x45], 8)
  ) {
    return { ok: true, extension: '.wav', detectedMime: 'audio/wav' };
  }
  // MP3: ID3 or MPEG sync frame (FF FB / FF F3 / FF F2 / FF FA / FF E3)
  if (
    startsWithBytes(buffer, [0x49, 0x44, 0x33]) ||
    (buffer.length >= 2 && buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    return { ok: true, extension: '.mp3', detectedMime: 'audio/mpeg' };
  }
  // OGG: OggS
  if (startsWithBytes(buffer, [0x4f, 0x67, 0x67, 0x53])) {
    return { ok: true, extension: '.ogg', detectedMime: 'audio/ogg' };
  }
  // WebM / Matroska: 1A 45 DF A3
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { ok: true, extension: '.webm', detectedMime: 'audio/webm' };
  }
  // M4A / MP4 ISO BMFF: ....ftyp
  if (startsWithBytes(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { ok: true, extension: '.m4a', detectedMime: 'audio/mp4' };
  }

  return { ok: false, reason: 'File contents do not match a valid WAV, MP3, OGG, WebM, or M4A audio signature.' };
}
