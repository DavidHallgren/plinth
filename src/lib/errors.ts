export type PlinthErrorCode =
  | "INVALID_SLUG"
  | "INVALID_PATH"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_EXISTS"
  | "PROJECT_INVALID"
  | "SCHEMA_INVALID"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "INVALID_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "CONFIRMATION_REQUIRED"
  | "INTERNAL_ERROR";

export class PlinthError extends Error {
  readonly code: PlinthErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: PlinthErrorCode,
    status: number,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "PlinthError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isPlinthError(error: unknown): error is PlinthError {
  return error instanceof PlinthError;
}

export function toPlinthError(error: unknown): PlinthError {
  if (isPlinthError(error)) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return new PlinthError("INVALID_REQUEST", 400, "The request body is not valid JSON.");
  }

  return new PlinthError("INTERNAL_ERROR", 500, "An unexpected error occurred.");
}
