import { logError, logWarn } from "./logger";

type TokenGetter = () => Promise<string | null>;
type LogoutCallback = () => Promise<void>;

let getToken: TokenGetter | null = null;
let onLogout: LogoutCallback | null = null;

export const configureApiClient = (options: {
  getToken: TokenGetter;
  onLogout: LogoutCallback;
}) => {
  getToken = options.getToken;
  onLogout = options.onLogout;
};

const apiFetch = async <T>(
  url: string,
  options?: RequestInit,
  isRetry = false
): Promise<T | null> => {
  if (!(getToken && onLogout)) {
    logError("API client not configured");
    return null;
  }

  const token = await getToken();
  if (!token) {
    logError("API: No valid token available");
    return null;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });

    if (response.ok) {
      if (response.status === 204) {
        return null;
      }
      return (await response.json()) as T;
    }

    if (response.status === 401 && !isRetry) {
      logWarn("API: 401 received, retrying with fresh token");
      return apiFetch<T>(url, options, true);
    }

    if (response.status === 401) {
      logError("API: 401 after retry, logging out");
      await onLogout();
      return null;
    }

    const errorData = await response
      .json()
      .catch(() => ({ message: "Unknown error" }));
    logError(`API: ${response.status} for ${url}`, errorData);
    return null;
  } catch (error) {
    logError(`API: Network error for ${url}`, error);
    return null;
  }
};

export const apiGet = <T>(url: string): Promise<T | null> => apiFetch<T>(url);

export const apiPost = <T>(url: string, body?: unknown): Promise<T | null> =>
  apiFetch<T>(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const apiFetchOk = async (
  url: string,
  options?: RequestInit,
  isRetry = false
): Promise<boolean> => {
  if (!(getToken && onLogout)) {
    logError("API client not configured");
    return false;
  }

  const token = await getToken();
  if (!token) {
    logError("API: No valid token available");
    return false;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 401 && !isRetry) {
      logWarn("API: 401 received, retrying with fresh token");
      return apiFetchOk(url, options, true);
    }

    if (response.status === 401) {
      logError("API: 401 after retry, logging out");
      await onLogout();
      return false;
    }

    const errorData = await response
      .json()
      .catch(() => ({ message: "Unknown error" }));
    logError(`API: ${response.status} for ${url}`, errorData);
    return false;
  } catch (error) {
    logError(`API: Network error for ${url}`, error);
    return false;
  }
};

export const apiPut = (url: string, body?: unknown): Promise<boolean> =>
  apiFetchOk(url, {
    method: "PUT",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiDelete = (url: string, body?: unknown): Promise<boolean> =>
  apiFetchOk(url, {
    method: "DELETE",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
