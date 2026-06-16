export class InternalServiceError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InternalServiceError';
  }
}

async function callService(
  baseUrl: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Request': '1',
  };

  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'no body');
    throw new InternalServiceError(baseUrl, res.status, `${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json();
}

export function makeInternalClient(baseUrl: string) {
  return {
    get: (path: string) => callService(baseUrl, path, 'GET'),
    post: (path: string, body: unknown) => callService(baseUrl, path, 'POST', body),
    patch: (path: string, body: unknown) => callService(baseUrl, path, 'PATCH', body),
    delete: (path: string) => callService(baseUrl, path, 'DELETE'),
  };
}
