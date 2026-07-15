import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
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

// POST a multipart body using React Native's fetch instead of axios. RN's fetch reliably
// sets `multipart/form-data; boundary=…` for a FormData body; axios in RN can send it
// without a boundary, which makes the server hang until timeout and surfaces as a false
// "network" error. Auth + error handling mirror the axios client.
export async function postFormData<T>(path: string, form: FormData): Promise<T> {
  const token = useAuthStore.getState().token;
  const url = `${config.apiBaseUrl}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // Intentionally NO Content-Type — fetch adds it with the correct boundary.
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  } catch (e) {
    // Surface the real transport error in the Metro console for diagnosis (the on-screen
    // message stays user-friendly).
    console.warn('[postFormData] upload failed:', url, e);
    throw new ApiError('Network unavailable. Check your connection and retry.', {
      isNetwork: true,
      code: 'network_error',
    });
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON / empty body */
  }

  if (!res.ok) {
    throw new ApiError(data?.message ?? `Request failed (${res.status})`, {
      status: res.status,
      code: data?.error ?? 'http_error',
    });
  }
  return data as T;
}
