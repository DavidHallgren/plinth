import { cp, mkdir, readdir, readFile, rename as fsRename, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createDocumentPreset, createDefaultProject } from "./defaults";
import { PlinthError, isPlinthError } from "./errors";
import { assertProjectSlug, createId, nowIso, slugify } from "./ids";
import { parseProject } from "./migrations";
import { assetFileNameFromPath, assetPathForFileName, assertAssetPath, deriveAssetFileName, hashBytes, MAX_ASSET_BYTES, validateImageBytes } from "./asset-validation";
import { assertExportDimensions, assertExportFileName, buildExportPlan, decodePngDimensions, MAX_EXPORT_BYTES } from "./export-validation";
import type { AssetMetadata, Document, Project, ProjectInput, SceneElement } from "./schema";
import { selectAssetReferences, selectAssetUsages, type AssetUsage } from "../scene/selectors";
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

export type AssetLibraryItem = AssetMetadata & {
  usageCount: number;
};

export type AssetRead = {
  asset: AssetMetadata;
  bytes: Uint8Array;
};

export type AssetMutation = {
  project: Project;
  asset: AssetMetadata;
  duplicate: boolean;
};

export type ExportWriteInput = {
  documentId: string;
  fileName: string;
  width: number;
  height: number;
  bytes: Uint8Array;
};

export type ExportWrite = {
  documentId: string;
  documentName: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  width: number;
  height: number;
  byteSize: number;
};

export type ExportRead = ExportWrite & { bytes: Uint8Array };

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

export function assetPathFromRequestName(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new PlinthError("INVALID_PATH", 400, "Asset path is not valid URL encoding.");
  }
  if (decoded.startsWith("assets/")) return assertAssetPath(decoded);
  return assetPathForFileName(decoded);
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

  assetFilePath(slug: string, assetPath: string): string {
    const safePath = assertAssetPath(assetPath);
    return resolveWithin(this.projectSubdirectory(slug, "assets"), assetFileNameFromPath(safePath));
  }

  exportFilePath(slug: string, fileName: string): string {
    return resolveWithin(this.projectSubdirectory(slug, "exports"), assertExportFileName(fileName));
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
    if (!(await pathExists(this.projectDirectory(validated.slug)))) {
      throw new PlinthError("PROJECT_NOT_FOUND", 404, `Project "${validated.slug}" was not found.`);
    }
    await this.ensureProjectDirectories(validated.slug);
    await writePrettyJsonAtomic(this.projectFile(validated.slug), validated);
    return validated;
  }

  async listAssets(slug: string): Promise<AssetLibraryItem[]> {
    const project = await this.loadProject(slug);
    const references = selectAssetReferences(project);
    return project.assets.map((asset) => ({ ...asset, usageCount: references.get(asset.path) ?? 0 }));
  }

  async readAsset(slug: string, assetPath: string): Promise<AssetRead> {
    const project = await this.loadProject(slug);
    const safePath = assertAssetPath(assetPath);
    const asset = project.assets.find((candidate) => candidate.path === safePath);
    if (!asset) {
      throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset "${safePath}" was not found in project "${slug}".`, { assetPath: safePath });
    }
    try {
      const bytes = new Uint8Array(await readFile(this.assetFilePath(slug, safePath)));
      let validated;
      try {
        validated = await validateImageBytes(bytes, asset.fileName, asset.mimeType);
      } catch (error) {
        if (isPlinthError(error) && ["ASSET_TOO_LARGE", "ASSET_UNSUPPORTED", "ASSET_INVALID_CONTENT"].includes(error.code)) {
          throw new PlinthError(
            error.code === "ASSET_TOO_LARGE" ? "ASSET_TOO_LARGE" : "ASSET_INVALID_CONTENT",
            422,
            `Stored asset "${safePath}" failed content validation. Re-upload the asset to repair it.`,
            { assetPath: safePath, repair: "re-upload", cause: error.message, validation: error.details },
          );
        }
        throw error;
      }
      const mismatches = [
        validated.mimeType !== asset.mimeType ? "mimeType" : null,
        validated.width !== asset.width ? "width" : null,
        validated.height !== asset.height ? "height" : null,
        validated.byteSize !== asset.byteSize ? "byteSize" : null,
        asset.contentHash && validated.contentHash !== asset.contentHash ? "contentHash" : null,
      ].filter((value): value is string => value !== null);
      if (mismatches.length > 0) {
        throw new PlinthError(
          "ASSET_INVALID_CONTENT",
          422,
          `Stored asset "${safePath}" does not match its project metadata. Re-upload the asset to repair it.`,
          { assetPath: safePath, repair: "re-upload", mismatches, expected: asset, actual: validated },
        );
      }
      return { asset, bytes };
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset file "${safePath}" is missing from project storage.`, { assetPath: safePath, missingFile: true });
      }
      throw error;
    }
  }

  async ingestAsset(slug: string, file: Blob, originalName = "asset"): Promise<AssetMutation> {
    const project = await this.loadProject(slug);
    if (file.size > MAX_ASSET_BYTES) {
      throw new PlinthError("ASSET_TOO_LARGE", 422, `Images must be ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB or smaller.`, { maxBytes: MAX_ASSET_BYTES, byteSize: file.size });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = await validateImageBytes(bytes, originalName, file.type);
    let existing: AssetMetadata | undefined;
    for (const candidate of project.assets) {
      if (candidate.byteSize !== validated.byteSize) continue;
      let diskHash: string | null = null;
      try {
        diskHash = await hashBytes(new Uint8Array(await readFile(this.assetFilePath(slug, candidate.path))));
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      if (candidate.contentHash === validated.contentHash || diskHash === validated.contentHash) {
        existing = candidate;
        break;
      }
    }
    if (existing) {
      const existingPath = this.assetFilePath(slug, existing.path);
      let repair = !(await pathExists(existingPath));
      if (!repair) {
        repair = (await hashBytes(new Uint8Array(await readFile(existingPath)))) !== validated.contentHash;
      }
      if (repair) {
        await this.writeAssetFileAtomic(slug, existing.path, bytes);
      }
      return { project, asset: existing, duplicate: true };
    }

    const fileName = deriveAssetFileName(originalName, validated.extension, validated.contentHash, new Set(project.assets.map((asset) => asset.fileName)));
    const asset: AssetMetadata = {
      id: `asset_${validated.contentHash}`,
      kind: "image",
      path: assetPathForFileName(fileName),
      fileName,
      mimeType: validated.mimeType,
      width: validated.width,
      height: validated.height,
      byteSize: validated.byteSize,
      contentHash: validated.contentHash,
    };
    const assetFile = this.assetFilePath(slug, asset.path);
    await this.writeAssetFileAtomic(slug, asset.path, bytes);
    try {
      const nextProject = await this.saveProject({ ...project, assets: [...project.assets, asset], updatedAt: nowIso() });
      return { project: nextProject, asset, duplicate: false };
    } catch (error) {
      await unlink(assetFile).catch(() => undefined);
      throw error;
    }
  }

  async deleteAsset(slug: string, assetPath: string, force = false): Promise<{ project: Project; deleted: AssetMetadata; usages: AssetUsage[] }> {
    const project = await this.loadProject(slug);
    const safePath = assertAssetPath(assetPath);
    const asset = project.assets.find((candidate) => candidate.path === safePath);
    if (!asset) {
      throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset "${safePath}" was not found in project "${slug}".`, { assetPath: safePath });
    }
    const usages = selectAssetUsages(project, safePath);
    if (usages.length > 0 && !force) {
      throw new PlinthError("ASSET_IN_USE", 409, `Asset "${asset.fileName}" is still referenced by ${usages.length} element${usages.length === 1 ? "" : "s"}.`, {
        assetPath: safePath,
        usages,
      });
    }

    const filePath = this.assetFilePath(slug, safePath);
    let originalBytes: Uint8Array | null = null;
    try {
      originalBytes = new Uint8Array(await readFile(filePath));
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    await unlink(filePath).catch((error) => {
      if (errorCode(error) !== "ENOENT") throw error;
    });
    try {
      const nextProject = await this.saveProject({ ...project, assets: project.assets.filter((candidate) => candidate.path !== safePath), updatedAt: nowIso() });
      return { project: nextProject, deleted: asset, usages };
    } catch (error) {
      if (originalBytes) await this.writeAssetFileAtomic(slug, safePath, originalBytes).catch(() => undefined);
      throw error;
    }
  }

  async writeExport(slug: string, input: ExportWriteInput): Promise<ExportWrite> {
    const project = await this.loadProject(slug);
    const plan = buildExportPlan(project);
    const planned = plan.find((item) => item.documentId === input.documentId);
    if (!planned) {
      throw new PlinthError("EXPORT_DOCUMENT_NOT_FOUND", 404, `Document "${input.documentId}" is not part of project "${slug}".`, {
        documentId: input.documentId,
        projectSlug: slug,
      });
    }

    const fileName = assertExportFileName(input.fileName);
    if (fileName !== planned.exportName) {
      throw new PlinthError("EXPORT_FILE_INVALID", 400, `Export file name "${fileName}" does not match this document's planned output "${planned.exportName}".`, {
        expectedFileName: planned.exportName,
        fileName,
        documentId: input.documentId,
      });
    }
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height)) {
      throw new PlinthError("INVALID_REQUEST", 400, "Export metadata width and height must be integers.", { width: input.width, height: input.height });
    }
    assertExportDimensions({ width: input.width, height: input.height }, planned);
    if (input.bytes.byteLength > MAX_EXPORT_BYTES) {
      throw new PlinthError("EXPORT_TOO_LARGE", 413, `PNG exports must be ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB or smaller.`, {
        maxBytes: MAX_EXPORT_BYTES,
        byteSize: input.bytes.byteLength,
      });
    }
    const decoded = decodePngDimensions(input.bytes);
    assertExportDimensions(decoded, planned);

    const filePath = this.exportFilePath(slug, fileName);
    try {
      await this.ensureProjectDirectories(slug);
      await this.writeBinaryFileAtomic(filePath, input.bytes);
    } catch (error) {
      throw new PlinthError("EXPORT_WRITE_FAILED", 500, `Could not write export "${fileName}".`, {
        fileName,
        path: `exports/${fileName}`,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      documentId: planned.documentId,
      documentName: planned.documentName,
      fileName,
      relativePath: `exports/${fileName}`,
      absolutePath: filePath,
      width: decoded.width,
      height: decoded.height,
      byteSize: input.bytes.byteLength,
    };
  }

  async readExport(slug: string, fileName: string): Promise<ExportRead> {
    const project = await this.loadProject(slug);
    const planned = buildExportPlan(project).find((item) => item.exportName === assertExportFileName(fileName));
    if (!planned) {
      throw new PlinthError("EXPORT_NOT_FOUND", 404, `Export "${fileName}" is not registered for project "${slug}".`, { fileName });
    }
    const filePath = this.exportFilePath(slug, fileName);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(filePath));
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new PlinthError("EXPORT_NOT_FOUND", 404, `Export "${fileName}" has not been written yet.`, { fileName });
      }
      throw error;
    }
    const decoded = decodePngDimensions(bytes);
    assertExportDimensions(decoded, planned);
    return {
      documentId: planned.documentId,
      documentName: planned.documentName,
      fileName,
      relativePath: `exports/${fileName}`,
      absolutePath: filePath,
      width: decoded.width,
      height: decoded.height,
      byteSize: bytes.byteLength,
      bytes,
    };
  }

  async exportPlan(slug: string): Promise<ReturnType<typeof buildExportPlan>> {
    const project = await this.loadProject(slug);
    return buildExportPlan(project);
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

  private async writeAssetFileAtomic(slug: string, assetPath: string, bytes: Uint8Array): Promise<void> {
    const filePath = this.assetFilePath(slug, assetPath);
    await this.ensureProjectDirectories(slug);
    const temporaryPath = resolveWithin(
      this.projectSubdirectory(slug, "assets"),
      `.${basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID().replaceAll("-", "")}`,
    );
    await this.writeBinaryFileAtomic(filePath, bytes, temporaryPath);
  }

  private async writeBinaryFileAtomic(filePath: string, bytes: Uint8Array, providedTemporaryPath?: string): Promise<void> {
    const temporaryPath = providedTemporaryPath ?? join(
      dirname(filePath),
      `.${basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID().replaceAll("-", "")}`,
    );
    try {
      await Bun.write(temporaryPath, bytes);
      await fsRename(temporaryPath, filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
