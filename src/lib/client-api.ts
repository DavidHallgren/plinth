export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.code = payload.code;
    this.details = payload.details;
  }
}

type ApiEnvelope<T> =
  | { data: T }
  | { error: ApiErrorPayload };

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init);
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError({ code: "INVALID_RESPONSE", message: "The server returned an invalid response." });
  }

  if (!response.ok || "error" in payload) {
    if ("error" in payload) {
      throw new ApiClientError(payload.error);
    }
    throw new ApiClientError({ code: "REQUEST_FAILED", message: `Request failed with status ${response.status}.` });
  }

  return payload.data;
}

export function jsonRequest<T>(body: T): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
