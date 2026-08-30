import { PlinthError } from "./errors";
import type { Project, Screen } from "./schema";
import { decodeStructuredPng, PngStructureError, type PngDimensions, type PngMetadata } from "./png-validation";
export type { PngDimensions, PngMetadata } from "./png-validation";

/** Keep a browser-generated export bounded before it reaches disk. */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

const SAFE_EXPORT_FILE_NAME = /^\d{2,}-[a-z0-9][a-z0-9._-]*\.png$/;

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

/**
 * Read IHDR metadata from a structurally valid PNG. The signature, chunk
 * bounds, CRCs, IHDR fields, IDAT payload, and IEND terminator are checked
 * before anything is stored.
 */
export function decodePngMetadata(bytes: Uint8Array): PngMetadata {
  try {
    return decodeStructuredPng(bytes, MAX_EXPORT_BYTES);
  } catch (error) {
    if (error instanceof PngStructureError && error.kind === "too-large") {
      throw new PlinthError("EXPORT_TOO_LARGE", 413, `PNG exports must be ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB or smaller.`, error.details);
    }
    if (error instanceof PngStructureError) {
      throw new PlinthError("EXPORT_INVALID_PNG", 422, `Export ${error.message}`, error.details);
    }
    throw error;
  }
}

export function decodePngDimensions(bytes: Uint8Array): PngDimensions {
  const { width, height } = decodePngMetadata(bytes);
  return { width, height };
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

export function assertExportColorType(metadata: PngMetadata, transparentBackground: boolean): void {
  const expectedColorType = transparentBackground ? 6 : 2;
  if (metadata.bitDepth !== 8 || metadata.colorType !== expectedColorType) {
    const description = transparentBackground ? "transparent" : "opaque";
    throw new PlinthError(
      "EXPORT_INVALID_PNG",
      422,
      `Export for a ${description} screen must be an 8-bit PNG with IHDR color type ${expectedColorType}.`,
      {
        actualBitDepth: metadata.bitDepth,
        actualColorType: metadata.colorType,
        expectedBitDepth: 8,
        expectedColorType,
      },
    );
  }
}
