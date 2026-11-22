import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { UPLOADS_DIR, ensureDataDirectories } from '../config.js';
import { validateAudioBuffer, validateImageBuffer } from '../utils/fileValidation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB ceiling; per-type limit checked below
    files: 1,
  },
});

export function createUploadsRouter(): Router {
  const router = Router();
  ensureDataDirectories();

  router.post('/uploads/image', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded under field "file".' });
      return;
    }

    const validation = validateImageBuffer(req.file.buffer, req.file.originalname, 5 * 1024 * 1024);
    if (!validation.ok) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    const filename = `img_${crypto.randomUUID()}${validation.extension}`;
    const fullPath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(fullPath, req.file.buffer);

    res.status(201).json({
      url: `/uploads/${filename}`,
      mimeType: validation.detectedMime,
      size: req.file.buffer.length,
    });
  });

  router.post('/uploads/audio', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded under field "file".' });
      return;
    }

    const validation = validateAudioBuffer(req.file.buffer, req.file.originalname, 10 * 1024 * 1024);
    if (!validation.ok) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    const filename = `sfx_${crypto.randomUUID()}${validation.extension}`;
    const fullPath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(fullPath, req.file.buffer);

    res.status(201).json({
      url: `/uploads/${filename}`,
      mimeType: validation.detectedMime,
      size: req.file.buffer.length,
    });
  });

  return router;
}
