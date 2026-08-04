import { PlinthError } from "./errors";
import { decodeStructuredPng, hasPngSignature, PngStructureError } from "./png-validation";

export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const ASSET_PATH_PREFIX = "assets/";

export type SupportedImageFormat = "png" | "jpeg" | "webp" | "svg";

export type ValidatedImage = {
  format: SupportedImageFormat;
  extension: "png" | "jpg" | "webp" | "svg";
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  width: number;
  height: number;
  byteSize: number;
  contentHash: string;
};

const SAFE_FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,254}$/;
const ASSET_PATH_PATTERN = /^assets\/[a-z0-9][a-z0-9._-]{0,254}$/;

function fail(code: "ASSET_TOO_LARGE" | "ASSET_UNSUPPORTED" | "ASSET_INVALID_CONTENT", message: string, details?: unknown): never {
  throw new PlinthError(code, 422, message, details);
}

function assertDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 100_000) {
    fail("ASSET_INVALID_CONTENT", `The image has an invalid ${label}.`, { [label]: value });
  }
  return value;
}

function bytesEqual(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8);
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasPngSignature(bytes)) return null;
  try {
    return decodeStructuredPng(bytes, MAX_ASSET_BYTES);
  } catch (error) {
    if (error instanceof PngStructureError) {
      fail(error.kind === "too-large" ? "ASSET_TOO_LARGE" : "ASSET_INVALID_CONTENT", `The PNG is invalid: ${error.message}`, error.details);
    }
    throw error;
  }
}

function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: assertDimension(((bytes[offset + 3] ?? 0) << 8) + (bytes[offset + 4] ?? 0), "height"),
        width: assertDimension(((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0), "width"),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16 || !bytesEqual(bytes, 0, [0x52, 0x49, 0x46, 0x46]) || !bytesEqual(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return null;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: assertDimension(1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16), "width"),
      height: assertDimension(1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16), "height"),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + (bytes[21] ?? 0) + (((bytes[22] ?? 0) & 0x3f) << 8);
    const height = 1 + (((bytes[22] ?? 0) >> 6) & 0x03) + ((bytes[23] ?? 0) << 2) + (((bytes[24] ?? 0) & 0x0f) << 10);
    return { width: assertDimension(width, "width"), height: assertDimension(height, "height") };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: assertDimension(readUint16LittleEndian(bytes, 26) & 0x3fff, "width"),
      height: assertDimension(readUint16LittleEndian(bytes, 28) & 0x3fff, "height"),
    };
  }
  return null;
}

function parseSvgDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ASSET_INVALID_CONTENT", "The SVG is not valid UTF-8.");
  }

  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) || /<\/svg\s*>\s*$/i.test(source) === false) {
    fail("ASSET_INVALID_CONTENT", "The SVG must contain one complete root element.");
  }
  const unsafePatterns: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "script elements"],
    [/<\s*foreignObject\b/i, "foreignObject elements"],
    [/<\s*!DOCTYPE\b/i, "DOCTYPE declarations"],
    [/<\s*!ENTITY\b/i, "entity declarations"],
    [/<\?xml-stylesheet\b/i, "external stylesheets"],
    [/(?:javascript|vbscript)\s*:/i, "script URLs"],
    [/(?:href|src|xlink:href)\s*=\s*["']\s*(?:https?:|data:|\/\/|file:)/i, "external or data references"],
    [/<\s*(?:use|image)\b[^>]*(?:href|src|xlink:href)\s*=/i, "linked image elements"],
    [/@import\b/i, "CSS imports"],
    [/url\s*\(\s*(?:https?:|\/\/|data:|file:)/i, "external paint resources"],
    [/<\s*style\b[^>]*>[^<]*(?:expression\s*\(|url\s*\()/i, "unsafe style content"],
    [/\bon[a-z]+\s*=/i, "event handler attributes"],
  ];
  const unsafe = unsafePatterns.find(([pattern]) => pattern.test(source));
  if (unsafe) fail("ASSET_INVALID_CONTENT", `SVG contains disallowed ${unsafe[1]}.`);

  const root = source.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const parseLength = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
    return match?.[1] ? Number(match[1]) : undefined;
  };
  const width = parseLength(root.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
  const height = parseLength(root.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);
  const viewBox = root.match(/\bviewBox\s*=\s*["']\s*([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s*["']/i);
  const viewBoxWidth = viewBox?.[3] ? Number(viewBox[3]) : undefined;
  const viewBoxHeight = viewBox?.[4] ? Number(viewBox[4]) : undefined;
  return {
    width: assertDimension(Math.round(width ?? viewBoxWidth ?? 0), "width"),
    height: assertDimension(Math.round(height ?? viewBoxHeight ?? 0), "height"),
  };
}

export function sanitizeAssetStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 96);
  return stem || "asset";
}

export function assertSafeAssetFileName(fileName: string): string {
  if (!SAFE_FILE_NAME.test(fileName) || fileName.includes("..")) {
    throw new PlinthError("INVALID_PATH", 400, "Asset file name is not safe.", { fileName });
  }
  return fileName;
}

export function assertAssetPath(assetPath: string): string {
  if (!ASSET_PATH_PATTERN.test(assetPath)) {
    throw new PlinthError("INVALID_PATH", 400, "Asset path must be a single safe file under assets/.", { assetPath });
  }
  assertSafeAssetFileName(assetPath.slice(ASSET_PATH_PREFIX.length));
  return assetPath;
}

export function assetPathForFileName(fileName: string): string {
  const safeName = assertSafeAssetFileName(fileName);
  return `${ASSET_PATH_PREFIX}${safeName}`;
}

export function assetFileNameFromPath(assetPath: string): string {
  assertAssetPath(assetPath);
  return assetPath.slice(ASSET_PATH_PREFIX.length);
}

export function deriveAssetFileName(originalName: string, extension: ValidatedImage["extension"], contentHash: string, existingNames: ReadonlySet<string> = new Set()): string {
  const stem = sanitizeAssetStem(originalName);
  const hashLengths = [12, 20, 32, 64];
  for (const length of hashLengths) {
    const candidate = `${stem}-${contentHash.slice(0, length)}.${extension}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  let suffix = 2;
  while (existingNames.has(`${stem}-${contentHash}.${suffix}.${extension}`)) suffix += 1;
  return `${stem}-${contentHash}.${suffix}.${extension}`;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function validateImageBytes(bytes: Uint8Array, originalName: string, declaredMimeType?: string): Promise<ValidatedImage> {
  void declaredMimeType;
  if (bytes.byteLength === 0) fail("ASSET_INVALID_CONTENT", "The uploaded image is empty.");
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    fail("ASSET_TOO_LARGE", `Images must be ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB or smaller.`, { maxBytes: MAX_ASSET_BYTES, byteSize: bytes.byteLength });
  }

  let format: SupportedImageFormat;
  let dimensions: { width: number; height: number } | null;
  let extension: ValidatedImage["extension"];
  let mimeType: ValidatedImage["mimeType"];
  if ((dimensions = parsePngDimensions(bytes))) {
    format = "png";
    extension = "png";
    mimeType = "image/png";
  } else if ((dimensions = parseJpegDimensions(bytes))) {
    format = "jpeg";
    extension = "jpg";
    mimeType = "image/jpeg";
  } else if ((dimensions = parseWebpDimensions(bytes))) {
    format = "webp";
    extension = "webp";
    mimeType = "image/webp";
  } else if (originalName.toLowerCase().endsWith(".svg") || bytes[0] === 0x3c) {
    dimensions = parseSvgDimensions(bytes);
    format = "svg";
    extension = "svg";
    mimeType = "image/svg+xml";
  } else {
    fail("ASSET_UNSUPPORTED", "Unsupported image. Upload a PNG, JPEG, WebP, or safe SVG file.", { supported: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] });
  }

  if (!dimensions) fail("ASSET_INVALID_CONTENT", "The image signature is recognized, but its dimensions could not be read.");
  return {
    format,
    extension,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: bytes.byteLength,
    contentHash: await hashBytes(bytes),
  };
}
