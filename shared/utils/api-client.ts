import { logError, logWarn } from "./logger";

type TokenGetter = () => Promise<string | null>;
type LogoutCallback = () => Promise<void>;

let getToken: TokenGetter | null = null;
let onLogout: LogoutCallback | null = null;

const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = 15_000;

export const configureApiClient = (options: {
  getToken: TokenGetter;
  onLogout: LogoutCallback;
}) => {
  getToken = options.getToken;
  onLogout = options.onLogout;
};

const wait = async (durationMs: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const getRetryAfterMs = (response: Response): number => {
  const retryAfterValue = response.headers.get("retry-after");
  if (!retryAfterValue) {
    return DEFAULT_RETRY_AFTER_MS;
  }

  const retryAfterSeconds = Number.parseFloat(retryAfterValue);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }

  const retryAtMs = Date.parse(retryAfterValue);
  if (Number.isFinite(retryAtMs)) {
    const waitMs = retryAtMs - Date.now();
    if (waitMs > 0) {
      return waitMs;
    }
  }

  return DEFAULT_RETRY_AFTER_MS;
};

export interface ApiRequestResult<T> {
  data: T | null;
  status: number | null;
  retryAfterMs: number | null;
}

const apiFetch = async <T>(
  url: string,
  options?: RequestInit,
  isRetry = false,
  rateLimitRetries = 0
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
      return apiFetch<T>(url, options, true, rateLimitRetries);
    }

    if (response.status === 401) {
      logError("API: 401 after retry, logging out");
      await onLogout();
      return null;
    }

    if (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterMs = getRetryAfterMs(response);
      if (retryAfterMs > MAX_RETRY_AFTER_MS) {
        logWarn(
          `API: 429 for ${url}, retry-after ${retryAfterMs}ms is too long; skipping automatic retry`
        );
        return null;
      }
      logWarn(
        `API: 429 for ${url}, retrying in ${retryAfterMs}ms (${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`
      );
      await wait(retryAfterMs);
      return apiFetch<T>(url, options, isRetry, rateLimitRetries + 1);
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

const apiFetchWithStatus = async <T>(
  url: string,
  options?: RequestInit,
  isRetry = false,
  rateLimitRetries = 0
): Promise<ApiRequestResult<T>> => {
  if (!(getToken && onLogout)) {
    logError("API client not configured");
    return { data: null, status: null, retryAfterMs: null };
  }

  const token = await getToken();
  if (!token) {
    logError("API: No valid token available");
    return { data: null, status: null, retryAfterMs: null };
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
        return { data: null, status: response.status, retryAfterMs: null };
      }
      const data = (await response.json()) as T;
      return { data, status: response.status, retryAfterMs: null };
    }

    if (response.status === 401 && !isRetry) {
      logWarn("API: 401 received, retrying with fresh token");
      return apiFetchWithStatus<T>(url, options, true, rateLimitRetries);
    }

    if (response.status === 401) {
      logError("API: 401 after retry, logging out");
      await onLogout();
      return { data: null, status: response.status, retryAfterMs: null };
    }

    if (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterMs = getRetryAfterMs(response);
      if (retryAfterMs > MAX_RETRY_AFTER_MS) {
        logWarn(
          `API: 429 for ${url}, retry-after ${retryAfterMs}ms is too long; skipping automatic retry`
        );
        return { data: null, status: response.status, retryAfterMs };
      }
      logWarn(
        `API: 429 for ${url}, retrying in ${retryAfterMs}ms (${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`
      );
      await wait(retryAfterMs);
      return apiFetchWithStatus<T>(url, options, isRetry, rateLimitRetries + 1);
    }

    if (response.status === 429) {
      return {
        data: null,
        status: response.status,
        retryAfterMs: getRetryAfterMs(response),
      };
    }

    const errorData = await response
      .json()
      .catch(() => ({ message: "Unknown error" }));
    logError(`API: ${response.status} for ${url}`, errorData);
    return { data: null, status: response.status, retryAfterMs: null };
  } catch (error) {
    logError(`API: Network error for ${url}`, error);
    return { data: null, status: null, retryAfterMs: null };
  }
};

export const apiGetWithStatus = <T>(
  url: string
): Promise<ApiRequestResult<T>> => apiFetchWithStatus<T>(url);

export const apiPost = <T>(url: string, body?: unknown): Promise<T | null> =>
  apiFetch<T>(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const apiFetchOk = async (
  url: string,
  options?: RequestInit,
  isRetry = false,
  rateLimitRetries = 0
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
      return apiFetchOk(url, options, true, rateLimitRetries);
    }

    if (response.status === 401) {
      logError("API: 401 after retry, logging out");
      await onLogout();
      return false;
    }

    if (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterMs = getRetryAfterMs(response);
      if (retryAfterMs > MAX_RETRY_AFTER_MS) {
        logWarn(
          `API: 429 for ${url}, retry-after ${retryAfterMs}ms is too long; skipping automatic retry`
        );
        return false;
      }
      logWarn(
        `API: 429 for ${url}, retrying in ${retryAfterMs}ms (${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`
      );
      await wait(retryAfterMs);
      return apiFetchOk(url, options, isRetry, rateLimitRetries + 1);
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
