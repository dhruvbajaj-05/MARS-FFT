'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { badRequest } = require('../utils/httpError');

// Map a mime type to a file extension (avoids trusting the client filename).
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

// Default cap on how many images a single record may carry.
const MAX_IMAGES_PER_RECORD = 50;

// Build a multer instance that writes images for one department subfolder to disk.
// Binaries live under env.upload.dir/<subdir>; only a URL reference is later stored
// in `mediaassets`. `maxFiles` bounds the total number of files accepted in the request
// (single-image routes pass 1; multi-image routes pass their maxCount).
function imageUploader(subdir, maxFiles = MAX_IMAGES_PER_RECORD) {
  const destDir = path.join(env.upload.dir, subdir);
  // Ensure the target directory exists once, at startup.
  fs.mkdirSync(destDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || '';
      const unique = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      cb(null, `${subdir}_${unique}${ext}`);
    },
  });

  function fileFilter(req, file, cb) {
    if (!env.upload.allowedImageTypes.includes(file.mimetype)) {
      return cb(badRequest(
        `Unsupported image type "${file.mimetype}". Allowed: ${env.upload.allowedImageTypes.join(', ')}`,
        'unsupported_media_type'
      ));
    }
    return cb(null, true);
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: env.upload.maxImageBytes, files: maxFiles },
  });
}

// Public URL for a stored file, given its on-disk path (uses env.upload.baseUrl
// when set so the API can return absolute, client-usable URLs).
function publicUrlFor(diskPath) {
  const rel = path.relative(env.upload.dir, diskPath).split(path.sep).join('/');
  return `${env.upload.baseUrl}${env.upload.publicPath}/${rel}`;
}

// Translate a multer error into a clean 400 (size/count limits, unexpected field).
function toUploadError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return badRequest('File exceeds the maximum allowed size', 'upload_error');
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return badRequest(`Too many files (max ${MAX_IMAGES_PER_RECORD} per field)`, 'too_many_files');
  }
  return badRequest(err.message, 'upload_error');
}

// Build a multer instance that accepts several named file fields, each of a given
// "kind" ('image' | 'document'), validating mime type per-field. Used by the
// Packing & Dispatch module which carries both photos[] and documents[].
function mediaUploader(subdir, fieldKinds) {
  const destDir = path.join(env.upload.dir, subdir);
  fs.mkdirSync(destDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '';
      const unique = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      cb(null, `${subdir}_${file.fieldname}_${unique}${ext}`);
    },
  });

  function fileFilter(req, file, cb) {
    const kind = fieldKinds[file.fieldname];
    const allowed = kind === 'document' ? env.upload.allowedDocTypes : env.upload.allowedImageTypes;
    if (!allowed.includes(file.mimetype)) {
      return cb(badRequest(
        `Unsupported ${kind} type "${file.mimetype}". Allowed: ${allowed.join(', ')}`,
        'unsupported_media_type'
      ));
    }
    return cb(null, true);
  }

  return multer({
    storage,
    fileFilter,
    // Per-file size cap = the larger of the two limits; the fileFilter still
    // enforces the correct mime types per field.
    limits: { fileSize: Math.max(env.upload.maxImageBytes, env.upload.maxDocBytes) },
  });
}

// Run a multer handler, mapping its errors to consistent HttpErrors (not raw 500s).
function runHandler(handler) {
  return function uploadMiddleware(req, res, next) {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) return next(toUploadError(err));
      return next(err); // already an HttpError (e.g. from fileFilter) or unexpected.
    });
  };
}

// Single optional image on `field` (used by the Moulding module).
function singleImage(subdir, field = 'image') {
  return runHandler(imageUploader(subdir, 1).single(field));
}

// Multiple optional images on `field` (used by Assembly + QC photos[]). The uploader's
// total-files limit must match maxCount, otherwise multi-photo requests fail (this was
// the QC "can't submit with photos" bug — the shared uploader was capped at 1 file).
function arrayImages(subdir, field = 'photos', maxCount = MAX_IMAGES_PER_RECORD) {
  return runHandler(imageUploader(subdir, maxCount).array(field, maxCount));
}

// Multiple named file fields of mixed kinds (used by Packing & Dispatch).
// `specs`: [{ name:'photos', kind:'image', maxCount }, { name:'documents', kind:'document', maxCount }]
// Populates req.files as { photos: [...], documents: [...] }.
function mediaFields(subdir, specs) {
  const fieldKinds = {};
  const fields = specs.map((s) => {
    fieldKinds[s.name] = s.kind;
    return { name: s.name, maxCount: s.maxCount || MAX_IMAGES_PER_RECORD };
  });
  return runHandler(mediaUploader(subdir, fieldKinds).fields(fields));
}

module.exports = { singleImage, arrayImages, mediaFields, publicUrlFor, MAX_IMAGES_PER_RECORD };
