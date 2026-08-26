import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TOKEN_KEY = 'deska_access_token';
const REFRESH_KEY = 'deska_refresh_token';
const TENANT_KEY = 'deska_tenant_id';

export function withBasePath(path: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (!basePath || !path.startsWith('/')) return path;
  return `${basePath.replace(/\/$/, '')}${path}`;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function setTenantId(tenantId: string) {
  localStorage.setItem(TENANT_KEY, tenantId);
}

export function clearTenantId() {
  localStorage.removeItem(TENANT_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(withBasePath('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  skipTenant?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, skipAuth, skipTenant, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  if (!skipTenant) {
    const tenantId = getTenantId();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
  }

  const url = withBasePath(path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('سرور API در دسترس نیست — لطفاً Run.bat را اجرا کنید', 503);
  }

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      const token = getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      response = await fetch(url, {
        ...rest,
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!response.ok) {
    let errorData: unknown;
    let rawText = '';
    try {
      rawText = await response.text();
      errorData = rawText ? JSON.parse(rawText) : null;
    } catch {
      errorData = rawText || null;
    }

    const isProxyFailure =
      response.status >= 500 &&
      (rawText === 'Internal Server Error' ||
        rawText.includes('ECONNREFUSED') ||
        !rawText.trim());

    const message = isProxyFailure
      ? 'سرور API در دسترس نیست — Run.bat را اجرا کنید (Docker Desktop باید روشن باشد)'
      : (errorData as { message?: string | string[] })?.message
        ? Array.isArray((errorData as { message: string[] }).message)
          ? (errorData as { message: string[] }).message.join('، ')
          : (errorData as { message: string }).message
        : `خطای ${response.status}`;

    throw new ApiError(message, response.status, errorData);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const text = await response.text();
      if (!text.trim()) return undefined as T;
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('پاسخ نامعتبر از سرور', response.status);
    }
  }

  return undefined as T;
}

export async function apiFetchBlob(path: string, options: ApiFetchOptions = {}): Promise<Blob> {
  const { body, skipAuth, skipTenant, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  if (!skipTenant) {
    const tenantId = getTenantId();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
  }

  const url = withBasePath(path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      const token = getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const retry = await fetch(url, {
        ...rest,
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) throw new ApiError(`خطای ${retry.status}`, retry.status);
      return retry.blob();
    }
  }

  if (!response.ok) {
    throw new ApiError(`خطای ${response.status}`, response.status);
  }

  return response.blob();
}
