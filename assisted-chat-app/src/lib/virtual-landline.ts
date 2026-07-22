import { API_BASE_URL, ApiError, getAdminToken } from './api';
import type {
  VirtualLandlineImportResponse,
  VirtualLandlinePreviewResponse,
} from '@/types/virtual-landline';

export interface PickedCsvAsset {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  file?: Blob;
}

function appendPickedFile(form: FormData, asset: PickedCsvAsset): void {
  const name = asset.name || 'virtual-landline-call-history.csv';
  const type = asset.mimeType || 'text/csv';
  if (typeof Blob !== 'undefined' && asset.file instanceof Blob) {
    form.append('file', asset.file, name);
    return;
  }

  form.append('file', { uri: asset.uri, name, type } as unknown as Blob);
}

async function uploadVirtualLandlineCsv<T>(path: string, asset: PickedCsvAsset, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  appendPickedFile(form, asset);
  Object.entries(extra ?? {}).forEach(([key, value]) => form.append(key, value));

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(getAdminToken() ? { Authorization: `Bearer ${getAdminToken()}` } : {}),
    },
    body: form,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    if (payload && typeof payload === 'object') {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === 'string' && error.trim()) message = error;
    }
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function previewVirtualLandlineCsv(asset: PickedCsvAsset): Promise<VirtualLandlinePreviewResponse> {
  return uploadVirtualLandlineCsv<VirtualLandlinePreviewResponse>('/api/mobile/admin/virtual-landline/preview', asset);
}

export function importVirtualLandlineCsv(asset: PickedCsvAsset): Promise<VirtualLandlineImportResponse> {
  return uploadVirtualLandlineCsv<VirtualLandlineImportResponse>(
    '/api/mobile/admin/virtual-landline/import',
    asset,
    { confirm: 'true' },
  );
}
