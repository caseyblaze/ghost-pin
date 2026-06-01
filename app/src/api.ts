import { SERVER_BASE_URL } from './config';

export type ApiResult = { ok: boolean; message: string; data?: { online?: boolean } };

const FETCH_TIMEOUT_MS = 8000;

async function post(path: string, body?: object): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return (await res.json()) as ApiResult;
  } catch (e) {
    clearTimeout(timer);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    return { ok: false, message: isTimeout ? '連線逾時' : `連線失敗：${String(e)}` };
  }
}

export function setLocation(lat: number, lng: number): Promise<ApiResult> {
  return post('/location', { lat, lng });
}

export function resetLocation(): Promise<ApiResult> {
  return post('/reset');
}

export async function getStatus(): Promise<ApiResult> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/status`);
    return (await res.json()) as ApiResult;
  } catch (e) {
    return { ok: false, message: `連線失敗：${String(e)}` };
  }
}
