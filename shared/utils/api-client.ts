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

type ApiRequestMode = "json" | "status" | "ok";
type ApiModeResult<T> = T | null | ApiRequestResult<T> | boolean;
type RetryDecision<T> =
  | { kind: "continue"; isRetry: boolean; rateLimitRetries: number }
  | { kind: "return"; value: ApiModeResult<T> }
  | { kind: "none" };

const statusResult = <T>(
  status: number | null,
  retryAfterMs: number | null,
  data: T | null = null
): ApiRequestResult<T> => ({
  data,
  status,
  retryAfterMs,
});

const unknownErrorPayload = () => ({ message: "Unknown error" });

const fallbackResult = <T>(mode: ApiRequestMode): ApiModeResult<T> => {
  if (mode === "status") {
    return statusResult<T>(null, null);
  }
  if (mode === "ok") {
    return false;
  }
  return null;
};

const statusAwareFailureResult = <T>(
  mode: ApiRequestMode,
  status: number,
  retryAfterMs: number | null
): ApiModeResult<T> => {
  if (mode === "status") {
    return statusResult<T>(status, retryAfterMs);
  }
  if (mode === "ok") {
    return false;
  }
  return null;
};

const handleRetryableResponse = async <T>(
  url: string,
  response: Response,
  mode: ApiRequestMode,
  logoutCallback: LogoutCallback,
  isRetry: boolean,
  rateLimitRetries: number
): Promise<RetryDecision<T>> => {
  if (response.status === 401 && !isRetry) {
    logWarn("API: 401 received, retrying with fresh token");
    return { kind: "continue", isRetry: true, rateLimitRetries };
  }

  if (response.status === 401) {
    logError("API: 401 after retry, logging out");
    await logoutCallback();
    return {
      kind: "return",
      value: statusAwareFailureResult<T>(mode, response.status, null),
    };
  }

  if (response.status !== 429 || rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
    return { kind: "none" };
  }

  const retryAfterMs = getRetryAfterMs(response);
  if (retryAfterMs > MAX_RETRY_AFTER_MS) {
    logWarn(
      `API: 429 for ${url}, retry-after ${retryAfterMs}ms is too long; skipping automatic retry`
    );
    return {
      kind: "return",
      value: statusAwareFailureResult<T>(mode, response.status, retryAfterMs),
    };
  }

  logWarn(
    `API: 429 for ${url}, retrying in ${retryAfterMs}ms (${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`
  );
  await wait(retryAfterMs);
  return {
    kind: "continue",
    isRetry,
    rateLimitRetries: rateLimitRetries + 1,
  };
};

const handleSuccessResponse = async <T>(
  response: Response,
  mode: ApiRequestMode
): Promise<ApiModeResult<T>> => {
  if (mode === "ok") {
    return true;
  }

  if (response.status === 204) {
    if (mode === "status") {
      return statusResult<T>(response.status, null);
    }
    return null;
  }

  const data = (await response.json()) as T;
  if (mode === "status") {
    return statusResult<T>(response.status, null, data);
  }
  return data;
};

const handleErrorResponse = async <T>(
  url: string,
  response: Response,
  mode: ApiRequestMode
): Promise<ApiModeResult<T>> => {
  if (mode === "status" && response.status === 429) {
    return statusResult<T>(response.status, getRetryAfterMs(response));
  }

  const errorData = await response.json().catch(unknownErrorPayload);
  logError(`API: ${response.status} for ${url}`, errorData);

  if (mode === "status") {
    return statusResult<T>(response.status, null);
  }
  if (mode === "ok") {
    return false;
  }
  return null;
};

async function apiRequest<T>(
  url: string,
  mode: "json",
  options?: RequestInit
): Promise<T | null>;
async function apiRequest<T>(
  url: string,
  mode: "status",
  options?: RequestInit
): Promise<ApiRequestResult<T>>;
async function apiRequest(
  url: string,
  mode: "ok",
  options?: RequestInit
): Promise<boolean>;
async function apiRequest<T>(
  url: string,
  mode: ApiRequestMode,
  options?: RequestInit
): Promise<T | null | ApiRequestResult<T> | boolean> {
  const tokenGetter = getToken;
  const logoutCallback = onLogout;
  if (!(tokenGetter && logoutCallback)) {
    logError("API client not configured");
    return fallbackResult<T>(mode);
  }

  let isRetry = false;
  let rateLimitRetries = 0;

  while (true) {
    const token = await tokenGetter();
    if (!token) {
      logError("API: No valid token available");
      return fallbackResult<T>(mode);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...options?.headers,
        },
      });

      const retryDecision = await handleRetryableResponse<T>(
        url,
        response,
        mode,
        logoutCallback,
        isRetry,
        rateLimitRetries
      );

      if (retryDecision.kind === "continue") {
        isRetry = retryDecision.isRetry;
        rateLimitRetries = retryDecision.rateLimitRetries;
        continue;
      }

      if (retryDecision.kind === "return") {
        return retryDecision.value;
      }

      if (response.ok) {
        return handleSuccessResponse<T>(response, mode);
      }

      return handleErrorResponse<T>(url, response, mode);
    } catch (error) {
      logError(`API: Network error for ${url}`, error);
      return fallbackResult<T>(mode);
    }
  }
}

const apiFetch = <T>(url: string, options?: RequestInit): Promise<T | null> =>
  apiRequest<T>(url, "json", options);

export const apiGet = <T>(url: string): Promise<T | null> => apiFetch<T>(url);

const apiFetchWithStatus = <T>(
  url: string,
  options?: RequestInit
): Promise<ApiRequestResult<T>> => apiRequest<T>(url, "status", options);

export const apiGetWithStatus = <T>(
  url: string
): Promise<ApiRequestResult<T>> => apiFetchWithStatus<T>(url);

export const apiPost = <T>(url: string, body?: unknown): Promise<T | null> =>
  apiFetch<T>(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const apiFetchOk = (url: string, options?: RequestInit): Promise<boolean> =>
  apiRequest(url, "ok", options);

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
