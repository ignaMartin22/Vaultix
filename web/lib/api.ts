/**
 * Typed fetch to our `/api` routes with the Privy access token. Errors come
 * back as `ApiClientError` carrying the uniform `{ error: { code, message } }`.
 */
export type GetAccessToken = () => Promise<string | null>;

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const FALLBACK_MESSAGE = "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";

export interface ApiRequest {
  method?: "GET" | "POST";
  body?: unknown;
  /** Required for authenticated routes. */
  getAccessToken?: GetAccessToken;
  fetchImpl?: typeof fetch;
}

export async function apiFetch<T>(path: string, req: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (req.body !== undefined) headers["content-type"] = "application/json";
  if (req.getAccessToken) {
    const token = await req.getAccessToken();
    if (!token) throw new ApiClientError("unauthorized", "Tu sesión venció. Volvé a entrar.", 401);
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await (req.fetchImpl ?? fetch)(path, {
      method: req.method ?? (req.body === undefined ? "GET" : "POST"),
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
  } catch {
    throw new ApiClientError("network", FALLBACK_MESSAGE, 0);
  }

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error: { code?: unknown; message?: unknown } }).error
        : undefined;
    throw new ApiClientError(
      typeof error?.code === "string" ? error.code : "internal",
      typeof error?.message === "string" ? error.message : FALLBACK_MESSAGE,
      res.status,
    );
  }
  return payload as T;
}

/** `POST /api/tx/sponsor`: the fee payer co-signs and sends (01 §5.1). */
export function sponsorTransaction(
  transactionBase64: string,
  getAccessToken: GetAccessToken,
  fetchImpl?: typeof fetch,
): Promise<{ signature: string }> {
  return apiFetch("/api/tx/sponsor", {
    method: "POST",
    body: { transaction: transactionBase64 },
    getAccessToken,
    fetchImpl,
  });
}
