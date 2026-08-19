import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import beachballPath from "../../fixtures/projects/example/assets/beachball-2ca4d006ab51.png" with { type: "file" };
import featureGridPath from "../../fixtures/projects/example/assets/example-feature-grid-c8fb943b8676.svg" with { type: "file" };
import phonePath from "../../fixtures/projects/example/assets/example-phone-6749ec03b360.svg" with { type: "file" };
import starMascotPath from "../../fixtures/projects/example/assets/star-mascot-1da4434759e7.png" with { type: "file" };
import projectPath from "../../fixtures/projects/example/project.json" with { type: "file" };

const INITIALIZATION_MARKER = ".plinth-initialized";
const EXAMPLE_SLUG = "example";

const EXAMPLE_FILES = [
  { source: beachballPath, destination: "assets/beachball-2ca4d006ab51.png" },
  { source: featureGridPath, destination: "assets/example-feature-grid-c8fb943b8676.svg" },
  { source: phonePath, destination: "assets/example-phone-6749ec03b360.svg" },
  { source: starMascotPath, destination: "assets/star-mascot-1da4434759e7.png" },
  { source: projectPath as unknown as string, destination: "project.json" },
] as const;

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function markInitialized(markerPath: string): Promise<void> {
  try {
    await writeFile(markerPath, "1\n", { flag: "wx" });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
  }
}

export type ExampleSeedResult = "seeded" | "already-initialized" | "existing-projects";

export async function seedExampleProject(rootDirectory: string): Promise<ExampleSeedResult> {
  await mkdir(rootDirectory, { recursive: true });
  const markerPath = join(rootDirectory, INITIALIZATION_MARKER);
  if (await pathExists(markerPath)) return "already-initialized";

  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const hasExistingProjects = entries.some((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  if (hasExistingProjects) {
    await markInitialized(markerPath);
    return "existing-projects";
  }

  const exampleDirectory = join(rootDirectory, EXAMPLE_SLUG);
  const stagingDirectory = await mkdtemp(join(rootDirectory, ".example-seed-"));
  try {
    await Promise.all([
      mkdir(join(stagingDirectory, "assets"), { recursive: false }),
      mkdir(join(stagingDirectory, "fonts"), { recursive: false }),
      mkdir(join(stagingDirectory, "exports"), { recursive: false }),
    ]);
    for (const file of EXAMPLE_FILES) {
      await writeFile(join(stagingDirectory, file.destination), await Bun.file(file.source).bytes(), { flag: "wx" });
    }
    try {
      await rename(stagingDirectory, exampleDirectory);
    } catch (error) {
      if (!(await pathExists(join(exampleDirectory, "project.json")))) throw error;
    }
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  await rm(stagingDirectory, { recursive: true, force: true });

  await markInitialized(markerPath);
  return "seeded";
}
