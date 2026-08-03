import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createDocumentPreset, DEFAULT_BACKGROUND, DEFAULT_SETTINGS } from "./lib/defaults";
import { writePrettyJsonAtomic } from "./lib/storage";
import { ProjectSchema } from "./lib/schema";
import type { Document, Project } from "./lib/schema";

const seedRoot = join(process.cwd(), "data", "projects");
const seedSlug = "plinth-starter";
const seedTime = "2026-08-02T00:00:00.000Z";

function elementIds(document: Document, prefix: string): Document {
  return {
    ...document,
    elements: document.elements.map((element, index) => ({ ...element, id: `${prefix}_${element.type}_${index + 1}` })),
  };
}

export function createStarterProject(): { project: Project; assets: Record<string, string> } {
  const iphone = elementIds(createDocumentPreset("iphone-6-9", {
    id: "doc_iphone_69",
    name: "iPhone 6.9 launch",
    slug: "iphone-6-9-launch",
    now: seedTime,
  }), "iphone");
  const iphoneFallback = elementIds(createDocumentPreset("iphone-6-5", {
    id: "doc_iphone_65",
    name: "iPhone 6.5 fallback",
    slug: "iphone-6-5-fallback",
    now: seedTime,
  }), "iphone-fallback");
  const ipad = elementIds(createDocumentPreset("ipad-13", {
    id: "doc_ipad_13",
    name: "iPad 13 product story",
    slug: "ipad-13-product-story",
    now: seedTime,
  }), "ipad");

  const project: Project = {
    schemaVersion: 2,
    id: "project_plinth_starter",
    slug: seedSlug,
    name: "Plinth starter studio",
    description: "Three App Store-ready starting frames for exploring Plinth's local-first composition model.",
    settings: DEFAULT_SETTINGS,
    background: DEFAULT_BACKGROUND,
    assets: [],
    documents: [iphone, iphoneFallback, ipad],
    createdAt: seedTime,
    updatedAt: seedTime,
  };

  return { project: ProjectSchema.parse(project), assets: {} };
}

export async function writeStarterProject(root = seedRoot): Promise<Project> {
  const { project, assets } = createStarterProject();
  const projectDirectory = join(root, seedSlug);
  await mkdir(join(projectDirectory, "assets"), { recursive: true });
  await mkdir(join(projectDirectory, "exports"), { recursive: true });
  for (const [id, content] of Object.entries(assets)) {
    await Bun.write(join(projectDirectory, "assets", `${id}.svg`), content);
  }
  await writePrettyJsonAtomic(join(projectDirectory, "project.json"), project);
  return project;
}

if (import.meta.main) {
  writeStarterProject().then((project) => console.log(`Seeded ${project.slug} with ${project.documents.length} documents.`));
}
