import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apiAction, handleCreateExport, handleCreateExportRun, handleGetExport, handleListExports } from "../src/lib/api";
import { createDeckPreset } from "../src/lib/defaults";
import { buildExportPlan, decodePngDimensions, decodePngMetadata, exportFileName, assertExportFileName } from "../src/lib/export-validation";
import { ProjectStorage } from "../src/lib/storage";
import { decodePngPixels, pngFixture } from "./helpers";

const temporaryDirectories: string[] = [];

function fixtureFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as unknown as BlobPart], name, { type: "image/png" });
}

async function temporaryStorage(): Promise<ProjectStorage> {
  const directory = await mkdtemp(join(tmpdir(), "plinth-export-test-"));
  temporaryDirectories.push(directory);
  return new ProjectStorage(join(directory, "projects"));
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("export naming and PNG validation", () => {
  test("creates deterministic safe names from the export slug", () => {
    const screen = createDeckPreset("custom", { name: "Export deck", screenName: "Home screen", screenSlug: "internal-id", screenExportSlug: "home" }).screens[0];
    if (!screen) throw new Error("Missing screen");
    expect(exportFileName(screen, 0)).toBe("01-home.png");
    expect(exportFileName(screen, 11)).toBe("12-home.png");
    expect(assertExportFileName("02-speak.png")).toBe("02-speak.png");
    expect(() => assertExportFileName("../escape.png")).toThrow(/numbered/);
    expect(() => assertExportFileName("home.png")).toThrow(/numbered/);
    expect(() => assertExportFileName("01-home.PNG")).toThrow(/numbered/);
  });

  test("reads actual PNG signature and IHDR dimensions", () => {
    const bytes = pngFixture(640, 480);
    expect(decodePngDimensions(bytes)).toEqual({ width: 640, height: 480 });
    expect(decodePngMetadata(bytes)).toEqual({
      width: 640,
      height: 480,
      bitDepth: 8,
      colorType: 2,
      compressionMethod: 0,
      filterMethod: 0,
      interlaceMethod: 0,
    });
    expect(() => decodePngDimensions(new TextEncoder().encode("not png"))).toThrow(/PNG/);
    const truncated = bytes.slice(0, 24);
    expect(() => decodePngDimensions(truncated)).toThrow(/chunk|IEND|PNG/i);
  });
});

describe("export API and storage", () => {
  test("creates a timestamped configured-folder run and writes all output inside it", async () => {
    const storage = await temporaryStorage();
    const exportRoot = join(storage.rootDir, "configured-output");
    await mkdir(exportRoot, { recursive: true });
    const created = await storage.createProject({ name: "Configured export", slug: "configured-export", description: "Folder export" });
    const deck = createDeckPreset("custom", {
      id: "deck_configured",
      name: "Configured deck",
      screenName: "Configured screen",
      screenSlug: "configured-screen",
      screenExportSlug: "configured",
      width: 320,
      height: 240,
    });
    await storage.saveProject({
      ...created,
      settings: { ...created.settings, exportDirectory: exportRoot },
      decks: [deck],
    });

    const runResponse = await handleCreateExportRun(new Request("http://plinth.test/api/projects/configured-export/export-runs", { method: "POST" }), storage);
    expect(runResponse.status).toBe(201);
    const runPayload = await runResponse.json() as { data: { exportRun: { id: string; absolutePath: string } } };
    expect(runPayload.data.exportRun.id).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}/);
    expect(runPayload.data.exportRun.absolutePath).toBe(join(await realpath(exportRoot), runPayload.data.exportRun.id));

    const changedExportRoot = join(storage.rootDir, "changed-configured-exports");
    await mkdir(changedExportRoot, { recursive: true });
    const beforeWrite = await storage.loadProject("configured-export");
    await storage.saveProject({ ...beforeWrite, settings: { ...beforeWrite.settings, exportDirectory: changedExportRoot } });

    const form = new FormData();
    form.append("metadata", JSON.stringify({ screenId: deck.screens[0]?.id, fileName: "01-configured.png", width: 320, height: 240, exportRunId: runPayload.data.exportRun.id }));
    form.append("file", fixtureFile(pngFixture(320, 240), "01-configured.png"), "01-configured.png");
    const response = await handleCreateExport(new Request("http://plinth.test/api/projects/configured-export/exports", { method: "POST", body: form }), storage);
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { export: { absolutePath: string; relativePath: string } } };
    expect(payload.data.export.relativePath).toBe(`${runPayload.data.exportRun.id}/01-configured.png`);
    expect(payload.data.export.absolutePath).toBe(join(await realpath(exportRoot), runPayload.data.exportRun.id, "01-configured.png"));
    const savedBytes = new Uint8Array(await readFile(payload.data.export.absolutePath));
    expect(Array.from(savedBytes)).toEqual(Array.from(pngFixture(320, 240)));
    expect(decodePngMetadata(savedBytes).colorType).toBe(2);

    const standardForm = new FormData();
    standardForm.append("metadata", JSON.stringify({ screenId: deck.screens[0]?.id, fileName: "01-configured.png", width: 320, height: 240 }));
    standardForm.append("file", fixtureFile(savedBytes, "01-configured.png"), "01-configured.png");
    const standardResponse = await handleCreateExport(new Request("http://plinth.test/api/projects/configured-export/exports", { method: "POST", body: standardForm }), storage);
    expect(standardResponse.status).toBe(201);
    const standardBytes = new Uint8Array(await readFile(storage.exportFilePath("configured-export", "01-configured.png")));
    expect(Array.from(standardBytes)).toEqual(Array.from(savedBytes));
  });

  test("rejects RGBA for opaque screens and preserves RGBA transparency for transparent screens", async () => {
    const storage = await temporaryStorage();
    const opaqueProject = await storage.createProject({ name: "Opaque export", slug: "opaque-export", description: "RGB export" });
    const opaqueDeck = createDeckPreset("custom", {
      id: "deck_opaque",
      name: "Opaque deck",
      screenName: "Opaque screen",
      screenSlug: "opaque-screen",
      screenExportSlug: "opaque",
      width: 2,
      height: 1,
    });
    const opaqueScreen = opaqueDeck.screens[0];
    if (!opaqueScreen) throw new Error("Missing opaque screen");
    await storage.saveProject({ ...opaqueProject, decks: [opaqueDeck] });

    const unexpectedRgba = new FormData();
    unexpectedRgba.append("metadata", JSON.stringify({ screenId: opaqueScreen.id, fileName: "01-opaque.png", width: 2, height: 1 }));
    unexpectedRgba.append("file", fixtureFile(pngFixture(2, 1, { colorType: 6, rgba: [9, 19, 29, 255] }), "01-opaque.png"), "01-opaque.png");
    const rejected = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/opaque-export/exports", { method: "POST", body: unexpectedRgba }), storage));
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: {
        code: "EXPORT_INVALID_PNG",
        details: { actualColorType: 6, expectedColorType: 2 },
      },
    });
    await expect(stat(storage.exportFilePath("opaque-export", "01-opaque.png"))).rejects.toThrow();

    const transparentProject = await storage.createProject({ name: "Transparent export", slug: "transparent-export", description: "RGBA export" });
    const transparentDeck = createDeckPreset("custom", {
      id: "deck_transparent",
      name: "Transparent deck",
      screenName: "Transparent screen",
      screenSlug: "transparent-screen",
      screenExportSlug: "transparent",
      width: 2,
      height: 1,
    });
    const baseTransparentScreen = transparentDeck.screens[0];
    if (!baseTransparentScreen) throw new Error("Missing transparent screen");
    const transparentScreen = { ...baseTransparentScreen, background: { type: "transparent" as const } };
    await storage.saveProject({ ...transparentProject, decks: [{ ...transparentDeck, screens: [transparentScreen] }] });

    const transparentBytes = pngFixture(2, 1, { colorType: 6, rgba: [31, 63, 95, 0] });
    const transparentForm = new FormData();
    transparentForm.append("metadata", JSON.stringify({ screenId: transparentScreen.id, fileName: "01-transparent.png", width: 2, height: 1 }));
    transparentForm.append("file", fixtureFile(transparentBytes, "01-transparent.png"), "01-transparent.png");
    const transparentResponse = await handleCreateExport(new Request("http://plinth.test/api/projects/transparent-export/exports", { method: "POST", body: transparentForm }), storage);
    expect(transparentResponse.status).toBe(201);
    const savedTransparent = new Uint8Array(await readFile(storage.exportFilePath("transparent-export", "01-transparent.png")));
    expect(Array.from(savedTransparent)).toEqual(Array.from(transparentBytes));
    expect(decodePngMetadata(savedTransparent).colorType).toBe(6);
    expect(Array.from(decodePngPixels(savedTransparent).pixels)).toEqual([31, 63, 95, 0, 31, 63, 95, 0]);
  });

  test("requires confirmation before creating a missing configured folder", async () => {
    const storage = await temporaryStorage();
    const created = await storage.createProject({ name: "Missing export folder", slug: "missing-export-folder", description: "Folder export" });

    const missingConfiguration = await apiAction(() => handleCreateExportRun(new Request("http://plinth.test/api/projects/missing-export-folder/export-runs", { method: "POST" }), storage));
    expect(missingConfiguration.status).toBe(422);
    expect(await missingConfiguration.json()).toMatchObject({ error: { code: "EXPORT_DIRECTORY_NOT_CONFIGURED", message: expect.stringContaining("Configure an export folder") } });

    const exportRoot = join(storage.rootDir, "does-not-exist", "screenshots");
    await storage.saveProject({ ...created, settings: { ...created.settings, exportDirectory: exportRoot } });
    const missing = await apiAction(() => handleCreateExportRun(new Request("http://plinth.test/api/projects/missing-export-folder/export-runs", { method: "POST" }), storage));
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ error: { code: "EXPORT_DIRECTORY_MISSING", message: expect.stringContaining("does not exist"), details: { path: exportRoot } } });

    const confirmed = await handleCreateExportRun(new Request("http://plinth.test/api/projects/missing-export-folder/export-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ createDirectory: true }),
    }), storage);
    expect(confirmed.status).toBe(201);
    expect((await stat(exportRoot)).isDirectory()).toBe(true);
    const confirmedPayload = await confirmed.json() as { data: { exportRun: { absolutePath: string } } };
    expect(confirmedPayload.data.exportRun.absolutePath.startsWith(`${await realpath(exportRoot)}/`)).toBe(true);
  });

  test("validates membership, metadata, dimensions, signature, and atomic persistence", async () => {
    const storage = await temporaryStorage();
    const created = await storage.createProject({ name: "Export fixture", slug: "export-fixture", description: "PNG export" });
    const deck = createDeckPreset("custom", {
      id: "deck_home",
      name: "Home deck",
      screenName: "Home screen",
      screenSlug: "internal-home",
      screenExportSlug: "home",
      width: 640,
      height: 480,
    });
    const homeScreen = deck.screens[0];
    if (!homeScreen) throw new Error("Missing home screen");
    const secondDeck = createDeckPreset("custom", {
      id: "deck_other",
      name: "Other deck",
      screenName: "Other screen",
      screenSlug: "other-screen",
      screenExportSlug: "other",
      width: 320,
      height: 240,
    });
    const otherScreen = secondDeck.screens[0];
    if (!otherScreen) throw new Error("Missing other screen");
    const project = await storage.saveProject({ ...created, decks: [deck, secondDeck] });
    const plan = buildExportPlan(project);
    expect(plan).toEqual([
      { deckId: "deck_home", deckName: "Home deck", screenId: homeScreen.id, screenName: "Home screen", exportName: "01-home.png", width: 640, height: 480 },
      { deckId: "deck_other", deckName: "Other deck", screenId: otherScreen.id, screenName: "Other screen", exportName: "02-other.png", width: 320, height: 240 },
    ]);
    expect(buildExportPlan(project, { mode: "screen", screenId: otherScreen.id })).toEqual([
      { deckId: "deck_other", deckName: "Other deck", screenId: otherScreen.id, screenName: "Other screen", exportName: "01-other.png", width: 320, height: 240 },
    ]);
    expect(buildExportPlan(project, { mode: "deck", deckId: "deck_home" }).map((item) => item.screenId)).toEqual([homeScreen.id]);
    expect(buildExportPlan(project, { mode: "all" }).map((item) => item.deckId)).toEqual(["deck_home", "deck_other"]);

    const form = new FormData();
    form.append("metadata", JSON.stringify({ screenId: homeScreen.id, fileName: "01-home.png", width: 640, height: 480 }));
    form.append("file", fixtureFile(pngFixture(640, 480), "01-home.png"), "01-home.png");
    const response = await handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: form }), storage);
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { export: { relativePath: string; width: number; height: number } } };
    expect(payload.data.export).toMatchObject({ relativePath: "exports/01-home.png", width: 640, height: 480 });
    const savedHome = new Uint8Array(await readFile(storage.exportFilePath("export-fixture", "01-home.png")));
    expect(Array.from(savedHome)).toEqual(Array.from(pngFixture(640, 480)));
    expect(decodePngMetadata(savedHome).colorType).toBe(2);

    const listed = await handleListExports(new Request("http://plinth.test/api/projects/export-fixture/exports"), storage);
    const listedPayload = await listed.json() as { data: { exports: Array<Record<string, unknown>> } };
    expect(listedPayload.data.exports).toHaveLength(2);
    expect(listedPayload.data.exports[0]).toMatchObject({ exportName: "01-home.png", screenId: homeScreen.id, deckId: "deck_home", deckName: "Home deck", screenName: "Home screen", width: 640, height: 480 });

    const downloaded = await handleGetExport(new Request("http://plinth.test/api/projects/export-fixture/exports/01-home.png"), storage);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await downloaded.arrayBuffer()))).toEqual(Array.from(pngFixture(640, 480)));

    const scopedForm = new FormData();
    scopedForm.append("metadata", JSON.stringify({
      screenId: otherScreen.id,
      fileName: "01-other.png",
      width: 320,
      height: 240,
      scope: { mode: "screen", screenId: otherScreen.id },
    }));
    scopedForm.append("file", fixtureFile(pngFixture(320, 240), "01-other.png"), "01-other.png");
    const scopedResponse = await handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: scopedForm }), storage);
    expect(scopedResponse.status).toBe(201);
    const scopedDownload = await handleGetExport(new Request("http://plinth.test/api/projects/export-fixture/exports/01-other.png"), storage);
    expect(scopedDownload.status).toBe(200);
    expect(Array.from(new Uint8Array(await scopedDownload.arrayBuffer()))).toEqual(Array.from(pngFixture(320, 240)));

    const invalidName = new FormData();
    invalidName.append("metadata", JSON.stringify({ screenId: homeScreen.id, fileName: "../escape.png", width: 640, height: 480 }));
    invalidName.append("file", fixtureFile(pngFixture(640, 480), "escape.png"), "escape.png");
    const invalidNameResponse = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: invalidName }), storage));
    expect(invalidNameResponse.status).toBe(400);
    expect(await invalidNameResponse.json()).toMatchObject({ error: { code: "EXPORT_FILE_INVALID" } });

    const mismatchedUpload = new FormData();
    mismatchedUpload.append("metadata", JSON.stringify({ screenId: homeScreen.id, fileName: "01-home.png", width: 640, height: 480 }));
    mismatchedUpload.append("file", fixtureFile(pngFixture(640, 480), "renamed.png"), "renamed.png");
    const mismatchedUploadResponse = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: mismatchedUpload }), storage));
    expect(mismatchedUploadResponse.status).toBe(400);
    expect(await mismatchedUploadResponse.json()).toMatchObject({ error: { code: "EXPORT_FILE_INVALID" } });

    const wrongDimensions = new FormData();
    wrongDimensions.append("metadata", JSON.stringify({ screenId: homeScreen.id, fileName: "01-home.png", width: 640, height: 480 }));
    wrongDimensions.append("file", fixtureFile(pngFixture(320, 240), "01-home.png"), "01-home.png");
    const wrongDimensionsResponse = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: wrongDimensions }), storage));
    expect(wrongDimensionsResponse.status).toBe(422);
    expect(await wrongDimensionsResponse.json()).toMatchObject({ error: { code: "EXPORT_DIMENSION_MISMATCH" } });

    const wrongDocument = new FormData();
    wrongDocument.append("metadata", JSON.stringify({ screenId: "missing", fileName: "01-home.png", width: 640, height: 480 }));
    wrongDocument.append("file", fixtureFile(pngFixture(640, 480), "01-home.png"), "01-home.png");
    const wrongDocumentResponse = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: wrongDocument }), storage));
    expect(wrongDocumentResponse.status).toBe(404);
    expect(await wrongDocumentResponse.json()).toMatchObject({ error: { code: "EXPORT_SCREEN_NOT_FOUND" } });

    const invalidPng = new FormData();
    invalidPng.append("metadata", JSON.stringify({ screenId: homeScreen.id, fileName: "01-home.png", width: 640, height: 480 }));
    invalidPng.append("file", fixtureFile(new TextEncoder().encode("not png"), "01-home.png"), "01-home.png");
    const invalidPngResponse = await apiAction(() => handleCreateExport(new Request("http://plinth.test/api/projects/export-fixture/exports", { method: "POST", body: invalidPng }), storage));
    expect(invalidPngResponse.status).toBe(422);
    expect(await invalidPngResponse.json()).toMatchObject({ error: { code: "EXPORT_INVALID_PNG" } });

    await expect(stat(join(storage.projectDirectory("export-fixture"), "escape.png"))).rejects.toThrow();
  });
});
