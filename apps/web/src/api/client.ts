export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Array<{ path: string; message: string }>;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }

  /** Mensaje del campo pedido, si el servidor rechazó la validación. */
  fieldError(path: string): string | undefined {
    return this.fields?.find((f) => f.path === path)?.message;
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // Una sola renovación en vuelo aunque fallen tres peticiones a la vez.
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function raw(path: string, init: RequestInit): Promise<Response> {
  // La cabecera de tipo va sólo cuando hay cuerpo: declarar JSON y no mandar
  // nada hace que el servidor rechace la petición con un 400, y eso rompía
  // cualquier POST sin datos —cerrar sesión, inscribirse a un torneo— de una
  // forma que no se notaba hasta probarla de punta a punta.
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`/api${path}`, { credentials: 'include', ...init, headers });
}

/**
 * Cliente HTTP con renovación transparente: si el token de acceso venció, lo
 * renueva y reintenta una sola vez antes de dar la sesión por perdida.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await raw(path, init);

  if (response.status === 401 && path !== '/auth/refresh' && path !== '/auth/me') {
    if (await refreshSession()) {
      response = await raw(path, init);
    }
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'No se pudo completar la operación.',
      error?.fields,
    );
  }
  return body as T;
}

export const get = <T,>(path: string) => api<T>(path, { method: 'GET' });
export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
