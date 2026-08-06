import { extname } from "node:path";
import * as fontkit from "fontkit";
import { PlinthError } from "./errors";
import { hashBytes, sanitizeAssetStem } from "./asset-validation";
import type { ProjectFontFace } from "./schema";

export const MAX_FONT_BYTES = 12 * 1024 * 1024;
export const MAX_PROJECT_FONT_BYTES = 50 * 1024 * 1024;

const formats = {
  wOF2: { extension: "woff2", mimeType: "font/woff2" },
  wOFF: { extension: "woff", mimeType: "font/woff" },
  OTTO: { extension: "otf", mimeType: "font/otf" },
  true: { extension: "ttf", mimeType: "font/ttf" },
} as const;

export function assertFontPath(value: string): string {
  if (!/^fonts\/[a-z0-9][a-z0-9._-]{0,254}$/.test(value)) throw new PlinthError("INVALID_PATH", 400, "The font path is invalid.");
  return value;
}

function fontFormat(bytes: Uint8Array) {
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  if (signature in formats) return formats[signature as keyof typeof formats];
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return formats.true;
  if (signature === "ttcf") throw new PlinthError("FONT_UNSUPPORTED", 422, "Font collections are not supported. Upload an individual WOFF2, WOFF, TTF, or OTF face.");
  throw new PlinthError("FONT_UNSUPPORTED", 422, "Only valid WOFF2, WOFF, TTF, and OTF font files are supported.");
}

function inferredWeight(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("thin")) return 100;
  if (normalized.includes("extralight") || normalized.includes("ultralight")) return 200;
  if (normalized.includes("light")) return 300;
  if (normalized.includes("medium")) return 500;
  if (normalized.includes("semibold") || normalized.includes("demibold")) return 600;
  if (normalized.includes("extrabold") || normalized.includes("ultrabold")) return 800;
  if (normalized.includes("black") || normalized.includes("heavy")) return 900;
  if (normalized.includes("bold")) return 700;
  return 400;
}

export async function validateFontBytes(bytes: Uint8Array, sourceFileName: string): Promise<{ familyName: string; face: ProjectFontFace }> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FONT_BYTES) throw new PlinthError("FONT_TOO_LARGE", 422, `Fonts must be ${MAX_FONT_BYTES / 1024 / 1024} MB or smaller.`);
  const format = fontFormat(bytes);
  let parsed: fontkit.Font;
  try {
    parsed = fontkit.create(bytes);
  } catch (error) {
    throw new PlinthError("FONT_INVALID_CONTENT", 422, "The font could not be parsed.", { cause: error instanceof Error ? error.message : String(error) });
  }
  const rawFamilyName = (parsed.familyName || parsed.fullName || sanitizeAssetStem(sourceFileName)).trim();
  const familyName = (parsed.variationAxes?.wght
    ? rawFamilyName.replace(/\s+(?:thin|extra ?light|ultra ?light|light|regular|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy)$/i, "")
    : rawFamilyName).slice(0, 120);
  const subfamily = parsed.subfamilyName || parsed.fullName || "Regular";
  const axis = parsed.variationAxes?.wght;
  const weight = inferredWeight(`${subfamily} ${parsed.postscriptName ?? ""}`);
  const contentHash = await hashBytes(bytes);
  const sourceStem = sanitizeAssetStem(sourceFileName.slice(0, Math.max(0, sourceFileName.length - extname(sourceFileName).length))) || "font";
  const fileName = `${sourceStem}-${contentHash.slice(0, 12)}.${format.extension}`;
  return {
    familyName,
    face: {
      id: `fontface_${contentHash.slice(0, 20)}`,
      path: `fonts/${fileName}`,
      sourceFileName: sourceFileName.slice(0, 255) || `font.${format.extension}`,
      mimeType: format.mimeType,
      contentHash,
      byteSize: bytes.byteLength,
      style: /italic|oblique/i.test(subfamily) || Boolean(parsed.italicAngle) ? "italic" : "normal",
      weightMin: Math.max(1, Math.round(axis?.min ?? weight)),
      weightMax: Math.min(1000, Math.round(axis?.max ?? weight)),
      postscriptName: parsed.postscriptName?.trim().slice(0, 255) || null,
    },
  };
}
