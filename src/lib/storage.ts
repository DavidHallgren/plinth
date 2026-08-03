import { cp, mkdir, readdir, readFile, rename as fsRename, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createDocumentPreset, createDefaultProject } from "./defaults";
import { PlinthError, isPlinthError } from "./errors";
import { assertProjectSlug, createId, nowIso, slugify } from "./ids";
import { parseProject } from "./migrations";
import type { Document, Project, ProjectInput, SceneElement } from "./schema";
import { addDocument as addSceneDocument, type AddDocumentOptions } from "../scene/operations";

export type ProjectMetadata = {
  slug: string;
  id: string | null;
  name: string;
  description: string;
  documentCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  valid: boolean;
  error?: string;
};

const PROJECT_FILE = "project.json";
const PROJECT_SUBDIRECTORIES = ["assets", "exports"] as const;

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function resolveWithin(rootPath: string, ...segments: string[]): string {
  const root = resolve(rootPath);

  for (const segment of segments) {
    if (
      segment.length === 0 ||
      isAbsolute(segment) ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment === "." ||
      segment === ".."
    ) {
      throw new PlinthError("INVALID_PATH", 400, "Path segment is not safe.", { segment });
    }
  }

  const candidate = resolve(root, ...segments);
  const relation = relative(root, candidate);

  if (relation.length === 0 || relation === ".." || relation.startsWith(`..${"/"}`) || isAbsolute(relation)) {
    throw new PlinthError("INVALID_PATH", 400, "Resolved path would leave its allowed root.");
  }

  return candidate;
}

export async function writePrettyJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID().replaceAll("-", "")}`,
  );
  const contents = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await Bun.write(temporaryPath, contents);
    await fsRename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // Best effort cleanup. The original error is more useful to the caller.
    }
    throw error;
  }
}

export class ProjectStorage {
  readonly rootDir: string;

  constructor(rootDir = Bun.env.PLINTH_DATA_ROOT ?? join(process.cwd(), "data", "projects")) {
    this.rootDir = resolve(rootDir);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  projectDirectory(slug: string): string {
    return resolveWithin(this.rootDir, assertProjectSlug(slug));
  }

  projectFile(slug: string): string {
    return resolveWithin(this.projectDirectory(slug), PROJECT_FILE);
  }

  projectSubdirectory(slug: string, subdirectory: (typeof PROJECT_SUBDIRECTORIES)[number]): string {
    return resolveWithin(this.projectDirectory(slug), subdirectory);
  }

  async ensureProjectDirectories(slug: string): Promise<void> {
    const projectDirectory = this.projectDirectory(slug);
    await mkdir(projectDirectory, { recursive: true });
    for (const subdirectory of PROJECT_SUBDIRECTORIES) {
      await mkdir(resolveWithin(projectDirectory, subdirectory), { recursive: true });
    }
  }

  async createProject(input: ProjectInput): Promise<Project> {
    await this.ensureRoot();
    const project = createDefaultProject(input.name, input);
    const projectDirectory = this.projectDirectory(project.slug);

    try {
      await mkdir(projectDirectory, { recursive: false });
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new PlinthError("PROJECT_EXISTS", 409, `Project "${project.slug}" already exists.`);
      }
      throw error;
    }

    try {
      for (const subdirectory of PROJECT_SUBDIRECTORIES) {
        await mkdir(resolveWithin(projectDirectory, subdirectory), { recursive: false });
      }
      await writePrettyJsonAtomic(resolveWithin(projectDirectory, PROJECT_FILE), project);
      return project;
    } catch (error) {
      await rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async loadProject(slug: string): Promise<Project> {
    const filePath = this.projectFile(slug);
    let contents: string;

    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new PlinthError("PROJECT_NOT_FOUND", 404, `Project "${slug}" was not found.`);
      }
      throw error;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new PlinthError("PROJECT_INVALID", 422, `Project "${slug}" contains invalid JSON.`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      return parseProject(raw);
    } catch (error) {
      if (isPlinthError(error)) {
        throw new PlinthError("PROJECT_INVALID", 422, `Project "${slug}" failed validation: ${error.message}`, {
          cause: error.message,
          details: error.details,
        });
      }
      throw error;
    }
  }

  async saveProject(project: Project): Promise<Project> {
    const validated = parseProject(project);
    await this.ensureProjectDirectories(validated.slug);
    await writePrettyJsonAtomic(this.projectFile(validated.slug), validated);
    return validated;
  }

  async listProjectMetadata(): Promise<ProjectMetadata[]> {
    await this.ensureRoot();
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const metadata: ProjectMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const slug = entry.name;
      const filePath = join(this.rootDir, slug, PROJECT_FILE);
      try {
        const project = parseProject(JSON.parse(await readFile(filePath, "utf8")) as unknown);
        metadata.push({
          slug: project.slug,
          id: project.id,
          name: project.name,
          description: project.description,
          documentCount: project.documents.length,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          valid: true,
        });
      } catch (error) {
        const fileStats = await stat(filePath).catch(() => undefined);
        metadata.push({
          slug,
          id: null,
          name: "Invalid project",
          description: "This project could not be read.",
          documentCount: 0,
          createdAt: null,
          updatedAt: fileStats?.mtime.toISOString() ?? null,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return metadata.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async renameProject(slug: string, name: string, newSlug = slugify(name)): Promise<Project> {
    const oldSlug = assertProjectSlug(slug);
    const targetSlug = assertProjectSlug(newSlug);
    const current = await this.loadProject(oldSlug);
    const updated: Project = {
      ...current,
      slug: targetSlug,
      name: name.trim() || current.name,
      updatedAt: nowIso(),
    };

    if (targetSlug === oldSlug) {
      return this.saveProject(updated);
    }

    const oldDirectory = this.projectDirectory(oldSlug);
    const targetDirectory = this.projectDirectory(targetSlug);
    if (await pathExists(targetDirectory)) {
      throw new PlinthError("PROJECT_EXISTS", 409, `Project "${targetSlug}" already exists.`);
    }

    await fsRename(oldDirectory, targetDirectory);
    try {
      return await this.saveProject(updated);
    } catch (error) {
      await fsRename(targetDirectory, oldDirectory).catch(() => undefined);
      throw error;
    }
  }

  async deleteProject(slug: string): Promise<void> {
    const projectDirectory = this.projectDirectory(slug);
    if (!(await pathExists(projectDirectory))) {
      throw new PlinthError("PROJECT_NOT_FOUND", 404, `Project "${slug}" was not found.`);
    }
    await rm(projectDirectory, { recursive: true, force: false });
  }

  async duplicateProject(slug: string, newSlug: string, name?: string): Promise<Project> {
    const source = await this.loadProject(slug);
    const targetSlug = assertProjectSlug(newSlug);
    const now = nowIso();
    const documents: Document[] = source.documents.map((document, index) => ({
      ...document,
      id: createId("doc"),
      slug: `${slugify(document.name)}-${index + 1}`,
      elements: document.elements.map((element: SceneElement) => ({ ...element, id: createId(element.type) })),
      createdAt: now,
      updatedAt: now,
    }));
    const duplicate: Project = {
      ...source,
      id: createId("project"),
      slug: targetSlug,
      name: name?.trim() || `${source.name} copy`,
      documents,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.createProjectFromValue(duplicate);
    try {
      await this.copyAssets(slug, targetSlug);
      return created;
    } catch (error) {
      await this.deleteProject(targetSlug).catch(() => undefined);
      throw error;
    }
  }

  async addDocument(slug: string, preset: Parameters<typeof createDocumentPreset>[0], name?: string, options: Pick<AddDocumentOptions, "width" | "height"> = {}): Promise<Project> {
    const project = await this.loadProject(slug);
    const documentName = name?.trim() || `${preset[0]?.toUpperCase() ?? "D"}${preset.slice(1)} composition`;
    return this.saveProject(addSceneDocument(project, preset, { ...options, name: documentName }));
  }

  private async createProjectFromValue(project: Project): Promise<Project> {
    await this.ensureRoot();
    const projectDirectory = this.projectDirectory(project.slug);
    try {
      await mkdir(projectDirectory, { recursive: false });
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new PlinthError("PROJECT_EXISTS", 409, `Project "${project.slug}" already exists.`);
      }
      throw error;
    }

    try {
      for (const subdirectory of PROJECT_SUBDIRECTORIES) {
        await mkdir(resolveWithin(projectDirectory, subdirectory), { recursive: false });
      }
      await writePrettyJsonAtomic(resolveWithin(projectDirectory, PROJECT_FILE), project);
      return project;
    } catch (error) {
      await rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private async copyAssets(sourceSlug: string, targetSlug: string): Promise<void> {
    const sourceDirectory = this.projectSubdirectory(sourceSlug, "assets");
    const targetDirectory = this.projectSubdirectory(targetSlug, "assets");
    if (!(await pathExists(sourceDirectory))) {
      return;
    }

    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      await cp(
        resolveWithin(sourceDirectory, entry.name),
        resolveWithin(targetDirectory, entry.name),
        { errorOnExist: true, force: false },
      );
    }
  }
}
