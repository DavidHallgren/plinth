import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { apiAction, handleCreateExport, handleCreateExportRun, handleGetExport, handleListExports } from "../src/lib/api";
import { createDeckPreset } from "../src/lib/defaults";
import { buildExportPlan, decodePngDimensions, exportFileName, assertExportFileName } from "../src/lib/export-validation";
import { ProjectStorage } from "../src/lib/storage";

const temporaryDirectories: string[] = [];

function pngFixture(width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  const chunks = [
    pngChunk("IHDR", new Uint8Array([
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      8, 6, 0, 0, 0,
    ])),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array()),
  ];
  const bytes = new Uint8Array(8 + chunks.reduce((total, chunk) => total + chunk.length, 0));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = 8;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  chunk.set([(data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff], 0);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < 8 + data.length; index += 1) {
    crc ^= chunk[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  chunk.set([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], 8 + data.length);
  return chunk;
}

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

    const form = new FormData();
    form.append("metadata", JSON.stringify({ screenId: deck.screens[0]?.id, fileName: "01-configured.png", width: 320, height: 240, exportRunId: runPayload.data.exportRun.id }));
    form.append("file", fixtureFile(pngFixture(320, 240), "01-configured.png"), "01-configured.png");
    const response = await handleCreateExport(new Request("http://plinth.test/api/projects/configured-export/exports", { method: "POST", body: form }), storage);
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { export: { absolutePath: string; relativePath: string } } };
    expect(payload.data.export.relativePath).toBe(`${runPayload.data.exportRun.id}/01-configured.png`);
    expect(payload.data.export.absolutePath).toBe(join(await realpath(exportRoot), runPayload.data.exportRun.id, "01-configured.png"));
    expect(Array.from(await readFile(payload.data.export.absolutePath))).toEqual(Array.from(pngFixture(320, 240)));
  });

  test("returns clear errors when the configured folder is missing or unavailable", async () => {
    const storage = await temporaryStorage();
    const created = await storage.createProject({ name: "Missing export folder", slug: "missing-export-folder", description: "Folder export" });

    const missingConfiguration = await apiAction(() => handleCreateExportRun(new Request("http://plinth.test/api/projects/missing-export-folder/export-runs", { method: "POST" }), storage));
    expect(missingConfiguration.status).toBe(422);
    expect(await missingConfiguration.json()).toMatchObject({ error: { code: "EXPORT_DIRECTORY_NOT_CONFIGURED", message: expect.stringContaining("Configure an export folder") } });

    await storage.saveProject({ ...created, settings: { ...created.settings, exportDirectory: join(storage.rootDir, "does-not-exist") } });
    const unavailable = await apiAction(() => handleCreateExportRun(new Request("http://plinth.test/api/projects/missing-export-folder/export-runs", { method: "POST" }), storage));
    expect(unavailable.status).toBe(422);
    expect(await unavailable.json()).toMatchObject({ error: { code: "EXPORT_DIRECTORY_UNAVAILABLE", message: expect.stringContaining("unavailable") } });
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
    expect(Array.from(await readFile(storage.exportFilePath("export-fixture", "01-home.png")))).toEqual(Array.from(pngFixture(640, 480)));

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
