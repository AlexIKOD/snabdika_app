import { isTauriEnvironment } from './tauriBridge';

/** The native bridge keeps the local authorization key outside the webview. */
export async function localApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  if (isTauriEnvironment()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ status: number; body: string }>('local_api', {
      path, method: init.method || 'GET', body: typeof init.body === 'string' ? init.body : null,
    });
    response = new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
  } else {
    response = await fetch(path, init);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${response.status}`);
  }
  return response;
}
