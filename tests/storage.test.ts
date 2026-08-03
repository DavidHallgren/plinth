import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDocumentPreset } from "../src/lib/defaults";
import { handleRenameProject } from "../src/lib/api";
import { resolveWithin, writePrettyJsonAtomic, ProjectStorage } from "../src/lib/storage";

const temporaryDirectories: string[] = [];

async function temporaryStorage(): Promise<ProjectStorage> {
  const directory = await mkdtemp(join(tmpdir(), "plinth-test-"));
  temporaryDirectories.push(directory);
  return new ProjectStorage(join(directory, "projects"));
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe("safe project storage", () => {
  test("rejects traversal and absolute child paths", () => {
    expect(() => resolveWithin("/tmp/plinth", "../outside")).toThrow();
    expect(() => resolveWithin("/tmp/plinth", "/etc/passwd")).toThrow();
    expect(() => resolveWithin("/tmp/plinth", "assets/../project.json")).toThrow();
  });

  test("writes pretty JSON atomically without leaving a temp file", async () => {
    const storage = await temporaryStorage();
    await storage.ensureRoot();
    const file = join(storage.rootDir, "fixture.json");
    await writePrettyJsonAtomic(file, { hello: "world", values: [1, 2, 3] });

    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ hello: "world", values: [1, 2, 3] });
    expect(await readdir(storage.rootDir)).toEqual(["fixture.json"]);
    expect(await readFile(file, "utf8")).toContain("\n  \"hello\":");
  });

  test("round trips text, shape, and device elements through project.json", async () => {
    const storage = await temporaryStorage();
    const created = await storage.createProject({
      name: "Round trip",
      slug: "round-trip",
      description: "Storage integration fixture",
    });
    const document = createDocumentPreset("browser", {
      id: "doc_round_trip",
      name: "Round trip document",
      slug: "round-trip-document",
      now: "2026-08-02T00:00:00.000Z",
    });
    const updated = await storage.saveProject({
      ...created,
      documents: [document],
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    const reloaded = await storage.loadProject(updated.slug);
    const kinds = reloaded.documents[0]?.elements.map((element) => element.type);

    expect(kinds).toEqual(["device", "shape", "text"]);
    expect(reloaded.documents[0]?.elements).toEqual(updated.documents[0]?.elements);
    expect(JSON.parse(await readFile(storage.projectFile("round-trip"), "utf8"))).toEqual(reloaded);
  });

  test("lists metadata and refuses to overwrite a project", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Listed project", slug: "listed-project", description: "Metadata" });

    const metadata = await storage.listProjectMetadata();
    expect(metadata[0]).toMatchObject({ slug: "listed-project", name: "Listed project", documentCount: 1, valid: true });
    await expect(storage.createProject({ name: "Same slug", slug: "listed-project", description: "No overwrite" })).rejects.toThrow(/already exists/);
  });

  test("persists and clears the configured export folder when editing a project", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Editable project", slug: "editable-project", description: "Project settings" });
    const exportDirectory = join(storage.rootDir, "configured-exports");

    const configuredResponse = await handleRenameProject(new Request("http://plinth.test/api/projects/editable-project/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Editable project", slug: "editable-project", exportDirectory }),
    }), storage);
    expect(configuredResponse.status).toBe(200);
    expect((await storage.loadProject("editable-project")).settings.exportDirectory).toBe(exportDirectory);
    expect(JSON.parse(await readFile(storage.projectFile("editable-project"), "utf8")).settings.exportDirectory).toBe(exportDirectory);

    const clearedResponse = await handleRenameProject(new Request("http://plinth.test/api/projects/editable-project/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Editable project", slug: "editable-project", exportDirectory: null }),
    }), storage);
    expect(clearedResponse.status).toBe(200);
    expect((await storage.loadProject("editable-project")).settings.exportDirectory).toBeNull();
  });

  test("duplicates project assets without overwriting the target", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Asset source", slug: "asset-source", description: "Assets" });
    await Bun.write(join(storage.projectSubdirectory("asset-source", "assets"), "fixture.svg"), "<svg />");

    await storage.duplicateProject("asset-source", "asset-copy");

    expect(await readFile(join(storage.projectSubdirectory("asset-copy", "assets"), "fixture.svg"), "utf8")).toBe("<svg />");
  });
});
