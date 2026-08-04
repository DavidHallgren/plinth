import { PlinthError } from "./errors";
import type { Project, Screen } from "./schema";

/** Keep a browser-generated export bounded before it reaches disk. */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const SAFE_EXPORT_FILE_NAME = /^\d{2,}-[a-z0-9][a-z0-9._-]*\.png$/;

export type PngDimensions = {
  width: number;
  height: number;
};

export type ExportPlanItem = PngDimensions & {
  deckId: string;
  deckName: string;
  screenId: string;
  screenName: string;
  exportName: string;
};

export type ExportScope =
  | { mode: "screen"; screenId: string }
  | { mode: "deck"; deckId: string }
  | { mode: "all" };

export function exportPlansForScreen(project: Project, screenId: string): ExportPlanItem[] {
  const screen = project.decks.flatMap((deck) => deck.screens).find((candidate) => candidate.id === screenId);
  if (!screen) return [];
  const deck = project.decks.find((candidate) => candidate.screens.some((candidateScreen) => candidateScreen.id === screenId));
  if (!deck) return [];

  const plans = [
    buildExportPlan(project, { mode: "all" }),
    buildExportPlan(project, { mode: "deck", deckId: deck.id }),
    buildExportPlan(project, { mode: "screen", screenId }),
  ];
  const seen = new Set<string>();
  return plans.flatMap((plan) => plan.filter((item) => {
    if (item.screenId !== screenId || seen.has(item.exportName)) return false;
    seen.add(item.exportName);
    return true;
  }));
}

export function findExportPlanForFile(project: Project, fileName: string): ExportPlanItem | undefined {
  const safeName = assertExportFileName(fileName);
  const screens = project.decks
    .flatMap((deck) => deck.screens)
    .filter((candidate) => safeName.endsWith(`-${candidate.exportSlug}.png`));
  for (const screen of screens) {
    const planned = exportPlansForScreen(project, screen.id).find((item) => item.exportName === safeName);
    if (planned) return planned;
  }
  return undefined;
}

function isPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)) >>> 0;
}

function crc32(bytes: Uint8Array, start: number, length: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < start + length; index += 1) {
    crc ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalidPng(message: string, details?: unknown): never {
  throw new PlinthError("EXPORT_INVALID_PNG", 422, message, details);
}

/**
 * Read dimensions from a structurally valid PNG. The signature, chunk bounds,
 * CRCs, IHDR dimensions, IDAT payload, and IEND terminator are checked before
 * anything is stored. IHDR is the authoritative decoded canvas size.
 */
export function decodePngDimensions(bytes: Uint8Array): PngDimensions {
  if (bytes.byteLength > MAX_EXPORT_BYTES) {
    throw new PlinthError("EXPORT_TOO_LARGE", 413, `PNG exports must be ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB or smaller.`, {
      maxBytes: MAX_EXPORT_BYTES,
      byteSize: bytes.byteLength,
    });
  }
  if (bytes.byteLength < 33 || !isPngSignature(bytes)) {
    invalidPng("Export payload is not a PNG (the PNG signature is missing).", { expectedSignature: "89504e470d0a1a0a" });
  }
  let offset = 8;
  let dimensions: PngDimensions | null = null;
  let hasImageData = false;
  let hasEnd = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) invalidPng("Export PNG contains a truncated chunk header.");
    const chunkLength = readUint32(bytes, offset);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    const crcOffset = chunkEnd;
    if (chunkEnd < chunkStart || crcOffset + 4 > bytes.byteLength) {
      invalidPng("Export PNG contains a chunk that exceeds the payload bounds.", { chunkLength });
    }
    const chunkType = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const expectedCrc = readUint32(bytes, crcOffset);
    const actualCrc = crc32(bytes, offset + 4, 4 + chunkLength);
    if (expectedCrc !== actualCrc) {
      invalidPng(`Export PNG chunk ${chunkType || "(unknown)"} has an invalid CRC.`);
    }

    if (offset === 8) {
      if (chunkType !== "IHDR" || chunkLength !== 13) invalidPng("Export payload has no valid PNG IHDR header.");
      const width = readUint32(bytes, chunkStart);
      const height = readUint32(bytes, chunkStart + 4);
      if (width <= 0 || width > 100_000 || height <= 0 || height > 100_000) {
        invalidPng("Export PNG dimensions are invalid.", { width, height });
      }
      dimensions = { width, height };
    } else if (chunkType === "IDAT") {
      hasImageData = true;
    } else if (chunkType === "IEND") {
      if (chunkLength !== 0) invalidPng("Export PNG IEND chunk must be empty.");
      hasEnd = true;
      offset = crcOffset + 4;
      break;
    }
    offset = crcOffset + 4;
  }
  if (!dimensions || !hasImageData || !hasEnd || offset !== bytes.byteLength) {
    invalidPng("Export PNG must contain IHDR, image data, and a final IEND chunk.", {
      hasImageData,
      hasEnd,
      trailingBytes: Math.max(0, bytes.byteLength - offset),
    });
  }
  return dimensions;
}

export function assertExportFileName(fileName: string): string {
  if (
    fileName.length === 0
    || fileName.length > 180
    || fileName.includes("/")
    || fileName.includes("\\")
    || fileName.includes("..")
    || !SAFE_EXPORT_FILE_NAME.test(fileName)
  ) {
    throw new PlinthError("EXPORT_FILE_INVALID", 400, "Export file name must be a numbered, lowercase .png file such as 01-home.png.", { fileName });
  }
  return fileName;
}

export function exportFileName(screen: Pick<Screen, "exportSlug">, index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new PlinthError("EXPORT_FILE_INVALID", 400, "Export screen index must be a non-negative integer.", { index });
  }
  const number = String(index + 1).padStart(2, "0");
  return assertExportFileName(`${number}-${screen.exportSlug}.png`);
}

export function buildExportPlan(project: Project, scope: ExportScope = { mode: "all" }): ExportPlanItem[] {
  const names = new Set<string>();
  const decks = scope.mode === "deck"
    ? project.decks.filter((deck) => deck.id === scope.deckId)
    : scope.mode === "screen"
      ? project.decks.filter((deck) => deck.screens.some((screen) => screen.id === scope.screenId))
      : project.decks;
  let index = 0;
  const plan = decks.flatMap((deck) => deck.screens
    .filter((screen) => scope.mode !== "screen" || screen.id === scope.screenId)
    .map((screen) => {
      const exportName = exportFileName(screen, index);
      index += 1;
      if (names.has(exportName)) {
        throw new PlinthError("EXPORT_FILE_INVALID", 422, `Screens produce the duplicate export name "${exportName}". Rename the affected screen export slugs before exporting.`, { exportName });
      }
      names.add(exportName);
      return {
        deckId: deck.id,
        deckName: deck.name,
        screenId: screen.id,
        screenName: screen.name,
        exportName,
        width: deck.width,
        height: deck.height,
      };
    }));
  if (scope.mode === "screen" && plan.length === 0) {
    throw new PlinthError("EXPORT_SCREEN_NOT_FOUND", 404, `Screen "${scope.screenId}" was not found in the project.`, { screenId: scope.screenId });
  }
  if (scope.mode === "deck" && plan.length === 0) {
    throw new PlinthError("EXPORT_SCREEN_NOT_FOUND", 404, `Deck "${scope.deckId}" was not found in the project.`, { deckId: scope.deckId });
  }
  return plan;
}

export function assertExportDimensions(actual: PngDimensions, expected: PngDimensions): void {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new PlinthError("EXPORT_DIMENSION_MISMATCH", 422, `PNG dimensions ${actual.width}×${actual.height} do not match the screen's required ${expected.width}×${expected.height}.`, {
      actual,
      expected,
    });
  }
}
