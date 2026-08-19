import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStorage } from "../src/lib/storage";

const temporaryDirectories: string[] = [];

async function temporaryStorage(): Promise<ProjectStorage> {
  const directory = await mkdtemp(join(tmpdir(), "plinth-example-test-"));
  temporaryDirectories.push(directory);
  return new ProjectStorage(join(directory, "projects"));
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("first-launch example project", () => {
  test("copies the bundled fixture into an empty project directory", async () => {
    const storage = await temporaryStorage();

    expect(await storage.initialize()).toBe("seeded");
    expect(await storage.loadProject("example")).toMatchObject({ slug: "example", name: "Example" });
    expect((await storage.listAssets("example")).length).toBe(3);
    expect(await readFile(join(storage.rootDir, ".plinth-initialized"), "utf8")).toBe("1\n");
  });

  test("does not restore the example after the user deletes it", async () => {
    const storage = await temporaryStorage();
    await storage.initialize();
    await storage.deleteProject("example");

    expect(await storage.initialize()).toBe("already-initialized");
    expect(await storage.listProjectMetadata()).toEqual([]);
  });

  test("does not add the example to a directory that already contains projects", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Existing", slug: "existing", description: "Existing project" });

    expect(await storage.initialize()).toBe("existing-projects");
    expect((await storage.listProjectMetadata()).map((project) => project.slug)).toEqual(["existing"]);
  });

  test("does not treat hidden directories as existing projects", async () => {
    const storage = await temporaryStorage();
    await mkdir(join(storage.rootDir, ".metadata"), { recursive: true });

    expect(await storage.initialize()).toBe("seeded");
    expect((await storage.listProjectMetadata()).map((project) => project.slug)).toEqual(["example"]);
  });
});
