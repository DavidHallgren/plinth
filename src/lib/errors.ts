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
  | "ASSET_NOT_FOUND"
  | "ASSET_IN_USE"
  | "ASSET_TOO_LARGE"
  | "ASSET_UNSUPPORTED"
  | "ASSET_INVALID_CONTENT"
  | "EXPORT_NOT_FOUND"
  | "EXPORT_SCREEN_NOT_FOUND"
  | "EXPORT_FILE_INVALID"
  | "EXPORT_INVALID_PNG"
  | "EXPORT_DIMENSION_MISMATCH"
  | "EXPORT_TOO_LARGE"
  | "EXPORT_NOT_READY"
  | "EXPORT_WRITE_FAILED"
  | "EXPORT_DIRECTORY_NOT_CONFIGURED"
  | "EXPORT_DIRECTORY_INVALID"
  | "EXPORT_DIRECTORY_UNAVAILABLE"
  | "EXPORT_DIRECTORY_WRITE_FAILED"
  | "EXPORT_RUN_INVALID"
  | "EXPORT_RUN_UNAVAILABLE"
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
