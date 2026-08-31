import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apiAction, handleAddDeck, handleAddScreen, handleCreateProject, handleDuplicateProject, handleGetProject, handleGetProjectPreview, handleRenameProject } from "../src/lib/api";
import { ProjectStorage } from "../src/lib/storage";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/schema";

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
