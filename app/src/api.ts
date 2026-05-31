import { SERVER_BASE_URL } from './config';

export type ApiResult = { ok: boolean; message: string; data?: { online?: boolean } };

async function post(path: string, body?: object): Promise<ApiResult> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as ApiResult;
  } catch (e) {
    return { ok: false, message: `連線失敗：${String(e)}` };
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
