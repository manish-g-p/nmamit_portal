export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, string[]>) { super(message); }
}
const send = (path: string, opts: RequestInit) => fetch(path, { credentials: 'include', ...opts, headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } });
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body ? 'POST' : 'GET'), body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined };
  let res = await send(path, init);
  // One silent renewal attempt when the short-lived access cookie has expired.
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (r.ok) res = await send(path, init); else window.dispatchEvent(new Event('session-expired'));
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Try again.', data?.details);
  return data as T;
}
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
