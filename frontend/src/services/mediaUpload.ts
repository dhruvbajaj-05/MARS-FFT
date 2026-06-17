import { config } from '@/config/env';
import { ApiError } from './apiError';

// A normalized picked file from Expo Image Picker or Document Picker.
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

function assertAllowed(file: PickedFile, kind: 'image' | 'document') {
  const allowed: readonly string[] =
    kind === 'document' ? config.upload.allowedDocTypes : config.upload.allowedImageTypes;
  const maxBytes = kind === 'document' ? config.upload.maxDocBytes : config.upload.maxImageBytes;
  if (!allowed.includes(file.mimeType)) {
    throw new ApiError(`Unsupported ${kind} type: ${file.mimeType}`, { code: 'unsupported_media_type' });
  }
  if (file.sizeBytes && file.sizeBytes > maxBytes) {
    throw new ApiError(`File too large (max ${Math.round(maxBytes / 1024 / 1024)}MB)`, {
      code: 'file_too_large',
    });
  }
}

// React Native FormData accepts { uri, name, type } objects for files. The cast is
// required because RN's FormData file value type differs from the DOM's Blob.
function appendFile(form: FormData, field: string, file: PickedFile) {
  const rnFile = { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
  form.append(field, rnFile);
}

interface BuildOptions {
  // Plain text fields. Values are stringified; objects/arrays are JSON-encoded
  // (the QC `defects` array MUST be sent this way — the backend JSON.parse()s it).
  fields: Record<string, string | number | boolean | object | null | undefined>;
  // File fields keyed by the EXACT backend field name (image | photos | documents).
  files?: { field: string; kind: 'image' | 'document'; items: PickedFile[] }[];
}

// Build a multipart body matching a department's create endpoint contract.
export function buildRecordFormData({ fields, files = [] }: BuildOptions): FormData {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      form.append(key, JSON.stringify(value)); // e.g. defects[]
    } else {
      form.append(key, String(value));
    }
  }

  let total = 0;
  for (const group of files) {
    for (const file of group.items) {
      assertAllowed(file, group.kind);
      appendFile(form, group.field, file);
      total += 1;
    }
  }
  if (total > config.upload.maxFilesPerRecord) {
    throw new ApiError(`Too many files (max ${config.upload.maxFilesPerRecord})`, {
      code: 'too_many_files',
    });
  }

  return form;
}
