// One fetch helper for every backend (Rails under /api/v1, AI services under /api/ai and
// /api/quiz). It attaches the JWT, turns error bodies into readable messages, and signs the
// user out when the token has expired.

const TOKEN_KEY = "token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); the session just won't persist.
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "That request couldn't be processed. Check your input and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have access to this.",
  404: "We couldn't find that. It may have expired or been removed.",
  410: "This interview has already finished.",
  413: "That file is too large.",
  415: "That file type isn't supported.",
  422: "Some of the details aren't valid. Check them and try again.",
  429: "Too many requests. Wait a moment and try again.",
  503: "The AI service is busy right now. Try again in a minute.",
};

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (Array.isArray(b.errors) && b.errors.length) return b.errors.join(". ");
    if (typeof b.message === "string") return b.message;
    // FastAPI: { detail: "..." } or { detail: [{ msg }] }
    if (typeof b.detail === "string") return b.detail;
    if (Array.isArray(b.detail) && b.detail[0]?.msg) return String(b.detail[0].msg);
  }
  return FALLBACK_MESSAGES[status] || "Something went wrong. Please try again.";
}

type Unauthorized = () => void;
let onUnauthorized: Unauthorized = () => {};
export function setUnauthorizedHandler(handler: Unauthorized) {
  onUnauthorized = handler;
}

export async function api<T = any>(
  url: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = "GET", body, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Can't reach Nexora. Check your connection and try again.", 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    // A 401 from login itself means bad credentials, not an expired session.
    if (res.status === 401 && token && !url.endsWith("/login")) {
      setToken(null);
      onUnauthorized();
    }
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
