/**
 * Uniform API errors (specs/02-backend.md §3): `{ error: { code, message } }`,
 * with `message` in Spanish, ready to show in the UI.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "no_wallet"
  | "rate_limited"
  | "blockhash_expired"
  | "tx_failed"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  bad_request: 400,
  no_wallet: 409,
  rate_limited: 429,
  blockhash_expired: 409,
  tx_failed: 422,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: "Tu sesión venció. Volvé a entrar.",
  forbidden: "No tenés permiso para hacer esto.",
  not_found: "No encontramos lo que buscás.",
  bad_request: "Revisá los datos e intentá de nuevo.",
  no_wallet: "Tu cuenta todavía no está lista. Volvé a entrar en unos segundos.",
  rate_limited: "Hiciste muchas operaciones hoy. Probá de nuevo mañana.",
  blockhash_expired: "La operación tardó demasiado. Probá de nuevo.",
  tx_failed: "La operación no se pudo completar. Revisá el estado de la orden e intentá de nuevo.",
  internal: "Algo salió mal de nuestro lado. Probá de nuevo en un rato.",
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string = DEFAULT_MESSAGE[code],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
    this.status = STATUS[code];
  }
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/** Any thrown value as the uniform JSON response. Unknown errors become `internal`. */
export function errorResponse(err: unknown): Response {
  const apiError = err instanceof ApiError ? err : new ApiError("internal", undefined, { cause: err });
  if (apiError.code === "internal") console.error(apiError.cause ?? apiError);
  const body: ApiErrorBody = { error: { code: apiError.code, message: apiError.message } };
  return Response.json(body, { status: apiError.status });
}

/** Wraps a route handler so every thrown error goes out as `errorResponse`. */
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
