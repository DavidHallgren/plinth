import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apiAction, handleAddDeck, handleAddScreen, handleCreateExport, handleCreateProject, handleDeleteAsset, handleDeleteProject, handleDuplicateProject, handleGetProject, handleGetProjectPreview, handleRenameProject, handleSaveProject, handleUploadAsset } from "../src/lib/api";
import { APPLE_BEZEL_PRESETS } from "../src/devices/apple-bezel-presets";
import { ProjectStorage } from "../src/lib/storage";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "../src/lib/schema";
import { buildExportPlan, decodePngDimensions } from "../src/lib/export-validation";
import { ownedElements, pngFixture } from "./helpers";

const temporaryDirectories: string[] = [];

async function temporaryStorage(): Promise<ProjectStorage> {
  const directory = await mkdtemp(join(tmpdir(), "plinth-api-test-"));
  temporaryDirectories.push(directory);
  return new ProjectStorage(join(directory, "projects"));
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("deck and screen API", () => {
  test.each([
    ["iphone-duo-inner-landscape", 2853, 2007],
    ...APPLE_BEZEL_PRESETS.map((preset) => [preset.id, preset.screenshotSize.width, preset.screenshotSize.height] as const),
  ] as const)("round-trips %s screenshot assets and validates exports through the existing API", async (preset, width, height) => {
    const storage = await temporaryStorage();
    const url = "http://plinth.test/api/projects/device-api";
    const response = await handleCreateProject(new Request("http://plinth.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Device API", slug: "device-api", firstDeck: { width, height, screenPreset: preset } }),
    }), storage);
    expect(response.status).toBe(201);

    const upload = new FormData();
    upload.append("file", new File([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#456789"/></svg>`], "screenshot.svg", { type: "image/svg+xml" }));
    const uploaded = await handleUploadAsset(new Request(`${url}/assets`, { method: "POST", body: upload }), storage);
    expect(uploaded.status).toBe(201);
    const project = ProjectSchema.parse((await uploaded.json()).data.project);
    const screen = project.decks[0]!.screens[0]!;
    const device = ownedElements(screen).find((element) => element.type === "device")!;
    if (device.type !== "device") throw new Error("Missing device");
    device.screenshotPath = project.assets[0]!.path;
    const saved = await handleSaveProject(new Request(url, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(project),
    }), storage);
    expect(saved.status).toBe(200);
    const loaded = ProjectSchema.parse((await (await handleGetProject(new Request(url), storage)).json()).data.project);
    expect(ownedElements(loaded.decks[0]!.screens[0]!)).toContainEqual(expect.objectContaining({ preset, screenshotPath: project.assets[0]!.path }));

    const plan = buildExportPlan(loaded)[0]!;
    expect(plan).toMatchObject({ width, height });
    const form = new FormData();
    form.append("metadata", JSON.stringify({ screenId: screen.id, fileName: plan.exportName, width: plan.width, height: plan.height }));
    form.append("file", new File([pngFixture(plan.width, plan.height) as unknown as BlobPart], plan.exportName, { type: "image/png" }));
    const exported = await handleCreateExport(new Request(`${url}/exports`, { method: "POST", body: form }), storage);
    expect(exported.status).toBe(201);
    expect(decodePngDimensions(new Uint8Array(await Bun.file(storage.exportFilePath(loaded.slug, plan.exportName)).arrayBuffer()))).toEqual({ width, height });

    expect((await handleDeleteAsset(new Request(`${url}/assets/${project.assets[0]!.fileName}?deleteUsages=true`, { method: "DELETE" }), storage)).status).toBe(200);
    const afterDelete = await storage.loadProject(loaded.slug);
    expect(ownedElements(afterDelete.decks[0]!.screens[0]!).some((element) => element.type === "device")).toBe(false);
    expect((await handleDeleteProject(new Request(url, { method: "DELETE" }), storage)).status).toBe(200);
  });

  test("creates a project with export settings and custom first-deck dimensions", async () => {
    const storage = await temporaryStorage();
    const response = await handleCreateProject(new Request("http://plinth.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Custom project",
        slug: "custom-project",
        exportDirectory: "/tmp/plinth-exports",
        firstDeck: { width: 800, height: 600, screenPreset: "custom" },
      }),
    }), storage);

    expect(response.status).toBe(201);
    const project = (await response.json() as { data: { project: { settings: { exportDirectory: string | null }; decks: Array<{ width: number; height: number; screens: Array<{ preset: string }> }> } } }).data.project;
    expect(project.settings.exportDirectory).toBe("/tmp/plinth-exports");
    expect(project.decks[0]).toMatchObject({ width: 800, height: 600 });
    expect(project.decks[0]?.screens[0]?.preset).toBe("custom");

    const previewResponse = await handleGetProjectPreview(new Request("http://plinth.test/api/projects/custom-project/preview"), storage);
    const preview = (await previewResponse.json() as { data: { preview: { screen: { width: number; height: number; elements: unknown[] }; assets: unknown[] } } }).data.preview;
    expect(preview.screen).toMatchObject({ width: 800, height: 600 });
    expect(preview.screen.elements).toBeArray();
    expect(preview.assets).toEqual([]);
  });

  test("returns structured client errors for invalid project slugs", async () => {
    const storage = await temporaryStorage();
    const createResponse = await apiAction(() => handleCreateProject(new Request("http://plinth.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bad slug", slug: "Bad Slug" }),
    }), storage));
    expect(createResponse.status).toBe(400);
    expect(await createResponse.json()).toMatchObject({ error: { code: "INVALID_REQUEST", details: { issues: [{ path: ["slug"] }] } } });

    await storage.createProject({ name: "Valid", slug: "valid", description: "Slug fixture" });
    const renameResponse = await apiAction(() => handleRenameProject(new Request("http://plinth.test/api/projects/valid/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Valid", slug: "also bad" }),
    }), storage));
    expect(renameResponse.status).toBe(400);

    const duplicateResponse = await apiAction(() => handleDuplicateProject(new Request("http://plinth.test/api/projects/valid/duplicate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "../bad" }),
    }), storage));
    expect(duplicateResponse.status).toBe(400);
    await expect(storage.createProject({ name: "Storage bad", slug: "Storage Bad", description: "Storage boundary" })).rejects.toMatchObject({ code: "INVALID_SLUG", status: 400 });
  });

  test("creates decks and screens through structured routes with inherited dimensions", async () => {
    const storage = await temporaryStorage();
    const createdResponse = await handleCreateProject(new Request("http://plinth.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Deck API", slug: "deck-api", description: "API fixture" }),
    }), storage);
    expect(createdResponse.status).toBe(201);

    const deckResponse = await handleAddDeck(new Request("http://plinth.test/api/projects/deck-api/decks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Fixed deck", slug: "fixed-deck", width: 640, height: 480, screenPreset: "blank" }),
    }), storage);
    expect(deckResponse.status).toBe(200);
    const deckProject = (await deckResponse.json() as { data: { project: { decks: Array<{ id: string; slug: string; width: number; height: number; screens: Array<{ id: string; name: string }> }> } } }).data.project;
    const deck = deckProject.decks.find((candidate) => candidate.slug === "fixed-deck");
    if (!deck) throw new Error("Missing created deck");
    expect(deck).toMatchObject({ width: 640, height: 480 });
    expect(deck.screens).toHaveLength(1);

    const screenResponse = await handleAddScreen(new Request(`http://plinth.test/api/projects/deck-api/decks/${deck.id}/screens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset: "custom", name: "Second screen", slug: "second-screen", exportSlug: "second-screen" }),
    }), storage);
    expect(screenResponse.status).toBe(200);
    const screenProject = (await screenResponse.json() as { data: { project: { decks: typeof deckProject.decks } } }).data.project;
    const updatedDeck = screenProject.decks.find((candidate) => candidate.id === deck.id);
    expect(updatedDeck?.screens).toHaveLength(2);
    expect(updatedDeck?.screens[1]).toMatchObject({ name: "Second screen" });
    expect(updatedDeck?.screens[1] && Object.hasOwn(updatedDeck.screens[1], "width")).toBe(false);
    expect(updatedDeck?.screens[1] && Object.hasOwn(updatedDeck.screens[1], "height")).toBe(false);

    const loadedResponse = await handleGetProject(new Request("http://plinth.test/api/projects/deck-api"), storage);
    expect(loadedResponse.status).toBe(200);
    expect((await loadedResponse.json() as { data: { project: { schemaVersion: number } } }).data.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test("requires fixed dimensions when creating a deck", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Deck validation", slug: "deck-validation", description: "API fixture" });
    const response = await apiAction(() => handleAddDeck(new Request("http://plinth.test/api/projects/deck-validation/decks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Missing dimensions" }),
    }), storage));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST", message: expect.stringContaining("width and height") } });
  });
});
