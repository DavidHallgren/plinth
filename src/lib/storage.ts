import { cp, mkdir, readdir, readFile, realpath, rename as fsRename, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { createDefaultProject } from "./defaults";
import { PlinthError, isPlinthError } from "./errors";
import { assertProjectSlug, createId, nowIso, slugify } from "./ids";
import { parseProject, parseProjectWithWarnings, type ProjectLoadWarning } from "./migrations";
import { assetFileNameFromPath, assetPathForFileName, assertAssetPath, hashBytes, MAX_ASSET_BYTES, validateImageBytes } from "./asset-validation";
import { assertExportDimensions, assertExportFileName, buildExportPlan, decodePngDimensions, findExportPlanForFile, MAX_EXPORT_BYTES } from "./export-validation";
import type { ExportScope } from "./export-validation";
import type { AssetMetadata, Project, ProjectInput, ScreenPreset } from "./schema";
import type { ProjectFontFace, ProjectFontFamily } from "./schema";
import { selectAssetReferences, selectAssetUsages, type AssetUsage } from "../scene/selectors";
import { addDeck as addSceneDeck, addScreen as addSceneScreen, type AddDeckOptions, type AddScreenOptions } from "../scene/structure-operations";
import { ProjectMutationLock } from "./project-mutation-lock";
import { assertDirectoryContained, assertFileNotSymlink, resolveWithin } from "./path-policy";
export { resolveWithin } from "./path-policy";
import { createAssetMetadata } from "./asset-storage";
import { removeAssetUsages } from "./asset-mutations";
import { ExportRunRegistry } from "./export-storage";
import { filesystemErrorCode, writePrettyJsonAtomic } from "./project-storage";
import { assertFontPath, MAX_FONT_BYTES, MAX_PROJECT_FONT_BYTES, validateFontBytes } from "./font-validation";
export { writePrettyJsonAtomic } from "./project-storage";

export type ProjectMetadata = {
  slug: string;
  id: string | null;
  name: string;
  description: string;
  deckCount: number;
  screenCount: number;
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

export type FontMutation = { project: Project; font: ProjectFontFamily; face: ProjectFontFace; duplicate: boolean };
export type FontRead = { face: ProjectFontFace; bytes: Uint8Array };

export type ExportWriteInput = {
  screenId: string;
  fileName: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  scope?: ExportScope;
  exportRunId?: string;
};

export type ExportRun = {
  id: string;
  absolutePath: string;
};

export type ExportWrite = {
  deckId: string;
  deckName: string;
  screenId: string;
  screenName: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  width: number;
  height: number;
  byteSize: number;
};

export type ExportRead = ExportWrite & { bytes: Uint8Array };

const PROJECT_FILE = "project.json";
const PROJECT_SUBDIRECTORIES = ["assets", "fonts", "exports"] as const;
const EXPORT_RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}(?:-\d+)?$/;

const errorCode = filesystemErrorCode;

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

function assertExportRunId(value: string): string {
  if (!EXPORT_RUN_ID_PATTERN.test(value)) {
    throw new PlinthError("EXPORT_RUN_INVALID", 400, "The export run identifier is invalid.", { exportRunId: value });
  }
  return value;
}

function timestampDirectoryName(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
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

export class ProjectStorage {
  readonly rootDir: string;
  private readonly mutationLock = new ProjectMutationLock();
  private readonly exportRuns = new ExportRunRegistry();

  constructor(rootDir = Bun.env.PLINTH_DATA_ROOT ?? join(process.cwd(), "data", "projects")) {
    this.rootDir = resolve(rootDir);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await assertDirectoryContained(this.rootDir, this.rootDir, true);
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

  fontFilePath(slug: string, fontPath: string): string {
    const safePath = assertFontPath(fontPath);
    return resolveWithin(this.projectSubdirectory(slug, "fonts"), safePath.slice("fonts/".length));
  }

  exportFilePath(slug: string, fileName: string): string {
    return resolveWithin(this.projectSubdirectory(slug, "exports"), assertExportFileName(fileName));
  }

  private async configuredExportRoot(project: Project, createIfMissing = false): Promise<string> {
    const configuredPath = project.settings.exportDirectory?.trim();
    if (!configuredPath) {
      throw new PlinthError("EXPORT_DIRECTORY_NOT_CONFIGURED", 422, "Configure an export folder for this project before exporting to a folder.");
    }
    if (!isAbsolute(configuredPath)) {
      throw new PlinthError("EXPORT_DIRECTORY_INVALID", 422, `The configured export folder must be an absolute path: "${configuredPath}".`, { path: configuredPath });
    }

    let directoryStats: Awaited<ReturnType<typeof stat>>;
    try {
      directoryStats = await stat(configuredPath);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw new PlinthError("EXPORT_DIRECTORY_UNAVAILABLE", 422, `The configured export folder is unavailable: "${configuredPath}".`, {
          path: configuredPath,
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      if (!createIfMissing) {
        throw new PlinthError("EXPORT_DIRECTORY_MISSING", 422, `The configured export folder does not exist: "${configuredPath}".`, { path: configuredPath });
      }
      try {
        await mkdir(configuredPath, { recursive: true });
        directoryStats = await stat(configuredPath);
      } catch (creationError) {
        throw new PlinthError("EXPORT_DIRECTORY_WRITE_FAILED", 422, `Plinth could not create the configured export folder: "${configuredPath}".`, {
          path: configuredPath,
          cause: creationError instanceof Error ? creationError.message : String(creationError),
        });
      }
    }
    if (!directoryStats.isDirectory()) {
      throw new PlinthError("EXPORT_DIRECTORY_INVALID", 422, `The configured export folder is not a directory: "${configuredPath}".`, { path: configuredPath });
    }
    try {
      return await realpath(configuredPath);
    } catch (error) {
      throw new PlinthError("EXPORT_DIRECTORY_UNAVAILABLE", 422, `The configured export folder is unavailable: "${configuredPath}".`, {
        path: configuredPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createExportRun(slug: string, options: { createDirectory?: boolean } = {}): Promise<ExportRun> {
    const project = await this.loadProject(slug);
    const exportRoot = await this.configuredExportRoot(project, options.createDirectory);
    const baseName = timestampDirectoryName();

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const id = suffix === 0 ? baseName : `${baseName}-${suffix + 1}`;
      const runDirectory = resolveWithin(exportRoot, id);
      try {
        await mkdir(runDirectory, { recursive: false });
        this.exportRuns.register(project.id, id, runDirectory);
        return { id, absolutePath: runDirectory };
      } catch (error) {
        if (errorCode(error) === "EEXIST") continue;
        throw new PlinthError("EXPORT_DIRECTORY_WRITE_FAILED", 422, `Plinth could not create an export directory inside "${exportRoot}".`, {
          path: exportRoot,
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new PlinthError("EXPORT_DIRECTORY_WRITE_FAILED", 422, `Plinth could not create a unique timestamped export directory inside "${exportRoot}".`, { path: exportRoot });
  }

  private async exportRunDirectory(project: Project, exportRunId: string): Promise<string> {
    const id = assertExportRunId(exportRunId);
    return this.exportRuns.resolve(project.id, id);
  }

  async ensureProjectDirectories(slug: string): Promise<void> {
    await this.ensureRoot();
    const projectDirectory = this.projectDirectory(slug);
    if (!(await pathExists(projectDirectory))) await mkdir(projectDirectory, { recursive: false });
    await assertDirectoryContained(this.rootDir, projectDirectory);
    for (const subdirectory of PROJECT_SUBDIRECTORIES) {
      const directory = resolveWithin(projectDirectory, subdirectory);
      if (!(await pathExists(directory))) await mkdir(directory, { recursive: false });
      await assertDirectoryContained(projectDirectory, directory);
    }
  }

  async createProject(input: ProjectInput): Promise<Project> {
    const project = createDefaultProject(input.name, input.slug === undefined ? input : { ...input, slug: assertProjectSlug(input.slug) });
    return this.mutationLock.run(project.slug, () => this.createProjectUnlocked(project));
  }

  private async createProjectUnlocked(project: Project): Promise<Project> {
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
      await assertDirectoryContained(this.rootDir, projectDirectory);
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

  async loadProjectWithWarnings(slug: string): Promise<{ project: Project; warnings: ProjectLoadWarning[] }> {
    const filePath = this.projectFile(slug);
    let contents: string;

    try {
      await assertDirectoryContained(this.rootDir, this.projectDirectory(slug));
      await assertFileNotSymlink(filePath);
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
      const result = parseProjectWithWarnings(raw);
      const unavailable = new Set<string>();
      await Promise.all(result.project.fonts.map(async (family) => {
        for (const face of family.faces) {
          try {
            const bytes = new Uint8Array(await readFile(this.fontFilePath(slug, face.path)));
            if (bytes.byteLength !== face.byteSize || await hashBytes(bytes) !== face.contentHash) unavailable.add(family.id);
          } catch (error) {
            if (errorCode(error) === "ENOENT") unavailable.add(family.id);
            else throw error;
          }
        }
      }));
      if (unavailable.size === 0) return result;
      const warnings = [...result.warnings];
      for (const fontFamilyId of unavailable) warnings.push({ code: "FONT_SUBSTITUTED", fontFamilyId, message: `Project font "${fontFamilyId}" is missing or does not match its metadata and was changed to Inter.` });
      const project = {
        ...result.project,
        decks: result.project.decks.map((deck) => ({ ...deck, screens: deck.screens.map((screen) => ({
          ...screen,
          layers: screen.layers.map((layer) => layer.kind === "owned" && layer.element.type === "text" && unavailable.has(layer.element.style.fontFamilyId)
            ? { ...layer, element: { ...layer.element, style: { ...layer.element.style, fontFamilyId: "builtin:inter" as const } } }
            : layer),
        })) })),
      };
      return { project, warnings };
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

  async loadProject(slug: string): Promise<Project> {
    return (await this.loadProjectWithWarnings(slug)).project;
  }

  async saveProject(project: Project): Promise<Project> {
    const validated = parseProject(project);
    return this.mutationLock.run(validated.slug, () => this.saveProjectUnlocked(validated));
  }

  async saveProjectFromClient(project: Project): Promise<Project> {
    const validated = parseProject(project);
    return this.mutationLock.run(validated.slug, async () => {
      const current = await this.loadProject(validated.slug);
      if (current.id !== validated.id) {
        throw new PlinthError("INVALID_REQUEST", 409, "The project identity does not match the stored project.", {
          expectedProjectId: current.id,
          projectId: validated.id,
        });
      }
      return this.saveProjectUnlocked({ ...validated, assets: current.assets, fonts: current.fonts });
    });
  }

  private async saveProjectUnlocked(project: Project): Promise<Project> {
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

  async readFont(slug: string, fontPath: string): Promise<FontRead> {
    const project = await this.loadProject(slug);
    const safePath = assertFontPath(fontPath);
    const face = project.fonts.flatMap((family) => family.faces).find((candidate) => candidate.path === safePath);
    if (!face) throw new PlinthError("FONT_NOT_FOUND", 404, `Font "${safePath}" was not found in project "${slug}".`);
    try {
      const filePath = this.fontFilePath(slug, safePath);
      await assertFileNotSymlink(filePath);
      const bytes = new Uint8Array(await readFile(filePath));
      const hash = await hashBytes(bytes);
      if (hash !== face.contentHash || bytes.byteLength !== face.byteSize) throw new PlinthError("FONT_INVALID_CONTENT", 422, `Stored font "${safePath}" does not match its project metadata.`);
      return { face, bytes };
    } catch (error) {
      if (errorCode(error) === "ENOENT") throw new PlinthError("FONT_NOT_FOUND", 404, `Font file "${safePath}" is missing from project storage.`);
      throw error;
    }
  }

  async ingestFont(slug: string, file: Blob, sourceFileName: string, licenseConfirmed: boolean): Promise<FontMutation> {
    if (!licenseConfirmed) throw new PlinthError("FONT_LICENSE_REQUIRED", 422, "Confirm that you have the right to use and share this font before uploading it.");
    if (file.size > MAX_FONT_BYTES) throw new PlinthError("FONT_TOO_LARGE", 422, `Fonts must be ${MAX_FONT_BYTES / 1024 / 1024} MB or smaller.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = await validateFontBytes(bytes, sourceFileName);
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, async () => {
      const project = await this.loadProject(safeSlug);
      const existingFamily = project.fonts.find((family) => family.faces.some((face) => face.contentHash === validated.face.contentHash));
      const existingFace = existingFamily?.faces.find((face) => face.contentHash === validated.face.contentHash);
      if (existingFamily && existingFace) return { project, font: existingFamily, face: existingFace, duplicate: true };
      const currentBytes = project.fonts.flatMap((family) => family.faces).reduce((sum, face) => sum + face.byteSize, 0);
      if (currentBytes + bytes.byteLength > MAX_PROJECT_FONT_BYTES) throw new PlinthError("FONT_PROJECT_LIMIT", 422, "Project fonts may use at most 50 MB in total.");
      const matchingFamily = project.fonts.find((family) => family.name.toLocaleLowerCase() === validated.familyName.toLocaleLowerCase());
      const family: ProjectFontFamily = matchingFamily
        ? { ...matchingFamily, faces: [...matchingFamily.faces, validated.face] }
        : { id: `font_${validated.face.contentHash.slice(0, 20)}`, name: validated.familyName, source: "uploaded", licenseConfirmed: true, faces: [validated.face] };
      await this.ensureProjectDirectories(safeSlug);
      const filePath = this.fontFilePath(safeSlug, validated.face.path);
      await this.writeBinaryFileAtomic(filePath, bytes);
      try {
        const fonts = matchingFamily ? project.fonts.map((candidate) => candidate.id === family.id ? family : candidate) : [...project.fonts, family];
        const nextProject = await this.saveProjectUnlocked({ ...project, fonts, updatedAt: nowIso() });
        return { project: nextProject, font: family, face: validated.face, duplicate: false };
      } catch (error) {
        await unlink(filePath).catch(() => undefined);
        throw error;
      }
    });
  }

  async deleteFont(slug: string, familyId: string): Promise<{ project: Project; deleted: ProjectFontFamily }> {
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, async () => {
      const project = await this.loadProject(safeSlug);
      const family = project.fonts.find((candidate) => candidate.id === familyId);
      if (!family) throw new PlinthError("FONT_NOT_FOUND", 404, `Font family "${familyId}" was not found.`);
      const usages = project.decks.flatMap((deck) => deck.screens.flatMap((screen) => screen.layers.filter((layer) => layer.kind === "owned" && layer.element.type === "text" && layer.element.style.fontFamilyId === familyId).map((layer) => ({ deckId: deck.id, screenId: screen.id, elementId: layer.kind === "owned" ? layer.element.id : "" }))));
      if (usages.length > 0) throw new PlinthError("FONT_IN_USE", 409, `Font "${family.name}" is still used by ${usages.length} text layer${usages.length === 1 ? "" : "s"}. Choose another font for those layers first.`, { usages });
      const originals = await Promise.all(family.faces.map(async (face) => ({ face, bytes: await readFile(this.fontFilePath(safeSlug, face.path)).catch(() => null) })));
      await Promise.all(family.faces.map((face) => unlink(this.fontFilePath(safeSlug, face.path)).catch((error) => { if (errorCode(error) !== "ENOENT") throw error; })));
      try {
        const nextProject = await this.saveProjectUnlocked({ ...project, fonts: project.fonts.filter((candidate) => candidate.id !== familyId), updatedAt: nowIso() });
        return { project: nextProject, deleted: family };
      } catch (error) {
        await Promise.all(originals.map(({ face, bytes }) => bytes ? this.writeBinaryFileAtomic(this.fontFilePath(safeSlug, face.path), new Uint8Array(bytes)) : undefined));
        throw error;
      }
    });
  }

  async readAsset(slug: string, assetPath: string): Promise<AssetRead> {
    const project = await this.loadProject(slug);
    const safePath = assertAssetPath(assetPath);
    const asset = project.assets.find((candidate) => candidate.path === safePath);
    if (!asset) {
      throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset "${safePath}" was not found in project "${slug}".`, { assetPath: safePath });
    }
    try {
      const assetDirectory = this.projectSubdirectory(slug, "assets");
      const assetFile = this.assetFilePath(slug, safePath);
      await assertDirectoryContained(this.projectDirectory(slug), assetDirectory);
      await assertFileNotSymlink(assetFile);
      const bytes = new Uint8Array(await readFile(assetFile));
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

  async ingestAsset(slug: string, file: Blob, originalName?: string): Promise<AssetMutation> {
    if (file.size > MAX_ASSET_BYTES) {
      throw new PlinthError("ASSET_TOO_LARGE", 422, `Images must be ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB or smaller.`, { maxBytes: MAX_ASSET_BYTES, byteSize: file.size });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blobName = (file as Blob & { name?: unknown }).name;
    const sourceName = originalName ?? (typeof blobName === "string" ? blobName : "asset");
    const validated = await validateImageBytes(bytes, sourceName, file.type);
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, () => this.ingestAssetUnlocked(safeSlug, bytes, sourceName, validated));
  }

  private async ingestAssetUnlocked(
    slug: string,
    bytes: Uint8Array,
    originalName: string,
    validated: Awaited<ReturnType<typeof validateImageBytes>>,
  ): Promise<AssetMutation> {
    const project = await this.loadProject(slug);
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

    const asset = createAssetMetadata(originalName, validated, project.assets);
    const assetFile = this.assetFilePath(slug, asset.path);
    await this.writeAssetFileAtomic(slug, asset.path, bytes);
    try {
      const nextProject = await this.saveProjectUnlocked({ ...project, assets: [...project.assets, asset], updatedAt: nowIso() });
      return { project: nextProject, asset, duplicate: false };
    } catch (error) {
      await unlink(assetFile).catch(() => undefined);
      throw error;
    }
  }

  async renameAsset(slug: string, assetPath: string, name: string): Promise<{ project: Project; asset: AssetMetadata }> {
    const safeSlug = assertProjectSlug(slug);
    const safePath = assertAssetPath(assetPath);
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      throw new PlinthError("INVALID_REQUEST", 400, "Asset names must contain between 1 and 120 characters.");
    }
    return this.mutationLock.run(safeSlug, async () => {
      const project = await this.loadProject(safeSlug);
      const asset = project.assets.find((candidate) => candidate.path === safePath);
      if (!asset) throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset "${safePath}" was not found in project "${safeSlug}".`, { assetPath: safePath });
      if (asset.name === trimmedName) return { project, asset };
      const renamed = { ...asset, name: trimmedName };
      const nextProject = await this.saveProjectUnlocked({
        ...project,
        assets: project.assets.map((candidate) => candidate.path === safePath ? renamed : candidate),
        updatedAt: nowIso(),
      });
      return { project: nextProject, asset: renamed };
    });
  }

  async deleteAsset(slug: string, assetPath: string, deleteUsages = false): Promise<{ project: Project; deleted: AssetMetadata; usages: AssetUsage[] }> {
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, () => this.deleteAssetUnlocked(safeSlug, assetPath, deleteUsages));
  }

  private async deleteAssetUnlocked(slug: string, assetPath: string, deleteUsages: boolean): Promise<{ project: Project; deleted: AssetMetadata; usages: AssetUsage[] }> {
    const project = await this.loadProject(slug);
    const safePath = assertAssetPath(assetPath);
    const asset = project.assets.find((candidate) => candidate.path === safePath);
    if (!asset) {
      throw new PlinthError("ASSET_NOT_FOUND", 404, `Asset "${safePath}" was not found in project "${slug}".`, { assetPath: safePath });
    }
    const usages = selectAssetUsages(project, safePath);
    if (usages.length > 0 && !deleteUsages) {
      throw new PlinthError("ASSET_IN_USE", 409, `Asset "${asset.fileName}" is still referenced in ${usages.length} place${usages.length === 1 ? "" : "s"}.`, {
        assetPath: safePath,
        usages,
      });
    }

    const filePath = this.assetFilePath(slug, safePath);
    await assertDirectoryContained(this.projectDirectory(slug), this.projectSubdirectory(slug, "assets"));
    await assertFileNotSymlink(filePath);
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
      const nextProject = await this.saveProjectUnlocked(deleteUsages
        ? removeAssetUsages(project, safePath)
        : { ...project, assets: project.assets.filter((candidate) => candidate.path !== safePath), updatedAt: nowIso() });
      return { project: nextProject, deleted: asset, usages };
    } catch (error) {
      if (originalBytes) await this.writeAssetFileAtomic(slug, safePath, originalBytes).catch(() => undefined);
      throw error;
    }
  }

  async writeExport(slug: string, input: ExportWriteInput): Promise<ExportWrite> {
    const project = await this.loadProject(slug);
    const plan = buildExportPlan(project, input.scope);
    const planned = plan.find((item) => item.screenId === input.screenId);
    if (!planned) {
      throw new PlinthError("EXPORT_SCREEN_NOT_FOUND", 404, `Screen "${input.screenId}" is not part of project "${slug}".`, {
        screenId: input.screenId,
        projectSlug: slug,
      });
    }

    const fileName = assertExportFileName(input.fileName);
    if (fileName !== planned.exportName) {
      throw new PlinthError("EXPORT_FILE_INVALID", 400, `Export file name "${fileName}" does not match this screen's planned output "${planned.exportName}".`, {
        expectedFileName: planned.exportName,
        fileName,
        screenId: input.screenId,
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

    const exportRunDirectory = input.exportRunId ? await this.exportRunDirectory(project, input.exportRunId) : null;
    const filePath = exportRunDirectory
      ? resolveWithin(exportRunDirectory, fileName)
      : this.exportFilePath(slug, fileName);
    try {
      if (!exportRunDirectory) await this.ensureProjectDirectories(slug);
      await this.writeBinaryFileAtomic(filePath, input.bytes);
    } catch (error) {
      const configuredDestination = Boolean(exportRunDirectory);
      throw new PlinthError(configuredDestination ? "EXPORT_DIRECTORY_WRITE_FAILED" : "EXPORT_WRITE_FAILED", 500, configuredDestination
        ? `Could not write export "${fileName}" to the configured export folder.`
        : `Could not write export "${fileName}".`, {
        fileName,
        path: filePath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      deckId: planned.deckId,
      deckName: planned.deckName,
      screenId: planned.screenId,
      screenName: planned.screenName,
      fileName,
      relativePath: input.exportRunId ? `${input.exportRunId}/${fileName}` : `exports/${fileName}`,
      absolutePath: filePath,
      width: decoded.width,
      height: decoded.height,
      byteSize: input.bytes.byteLength,
    };
  }

  async readExport(slug: string, fileName: string): Promise<ExportRead> {
    const project = await this.loadProject(slug);
    const planned = findExportPlanForFile(project, fileName);
    if (!planned) {
      throw new PlinthError("EXPORT_NOT_FOUND", 404, `Export "${fileName}" is not registered for project "${slug}".`, { fileName });
    }
    const filePath = this.exportFilePath(slug, fileName);
    let bytes: Uint8Array;
    try {
      await assertDirectoryContained(this.projectDirectory(slug), this.projectSubdirectory(slug, "exports"));
      await assertFileNotSymlink(filePath);
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
      deckId: planned.deckId,
      deckName: planned.deckName,
      screenId: planned.screenId,
      screenName: planned.screenName,
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
          deckCount: project.decks.length,
          screenCount: project.decks.reduce((count, deck) => count + deck.screens.length, 0),
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
          deckCount: 0,
          screenCount: 0,
          createdAt: null,
          updatedAt: fileStats?.mtime.toISOString() ?? null,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return metadata.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async renameProject(slug: string, name: string, newSlug = slugify(name), exportDirectory?: string | null): Promise<Project> {
    const oldSlug = assertProjectSlug(slug);
    const targetSlug = assertProjectSlug(newSlug);
    return this.mutationLock.runMany([oldSlug, targetSlug], () => this.renameProjectUnlocked(oldSlug, targetSlug, name, exportDirectory));
  }

  private async renameProjectUnlocked(oldSlug: string, targetSlug: string, name: string, exportDirectory?: string | null): Promise<Project> {
    const current = await this.loadProject(oldSlug);
    const updated: Project = {
      ...current,
      slug: targetSlug,
      name: name.trim() || current.name,
      settings: exportDirectory === undefined
        ? current.settings
        : { ...current.settings, exportDirectory: exportDirectory?.trim() || null },
      updatedAt: nowIso(),
    };

    if (targetSlug === oldSlug) {
      return this.saveProjectUnlocked(updated);
    }

    const oldDirectory = this.projectDirectory(oldSlug);
    const targetDirectory = this.projectDirectory(targetSlug);
    if (await pathExists(targetDirectory)) {
      throw new PlinthError("PROJECT_EXISTS", 409, `Project "${targetSlug}" already exists.`);
    }

    await fsRename(oldDirectory, targetDirectory);
    try {
      return await this.saveProjectUnlocked(updated);
    } catch (error) {
      await fsRename(targetDirectory, oldDirectory).catch(() => undefined);
      throw error;
    }
  }

  async deleteProject(slug: string): Promise<void> {
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, () => this.deleteProjectUnlocked(safeSlug));
  }

  private async deleteProjectUnlocked(slug: string): Promise<void> {
    const projectDirectory = this.projectDirectory(slug);
    if (!(await pathExists(projectDirectory))) {
      throw new PlinthError("PROJECT_NOT_FOUND", 404, `Project "${slug}" was not found.`);
    }
    await assertDirectoryContained(this.rootDir, projectDirectory);
    await rm(projectDirectory, { recursive: true, force: false });
  }

  async duplicateProject(slug: string, newSlug: string, name?: string): Promise<Project> {
    const sourceSlug = assertProjectSlug(slug);
    const targetSlug = assertProjectSlug(newSlug);
    return this.mutationLock.runMany([sourceSlug, targetSlug], () => this.duplicateProjectUnlocked(sourceSlug, targetSlug, name));
  }

  private async duplicateProjectUnlocked(slug: string, targetSlug: string, name?: string): Promise<Project> {
    const source = await this.loadProject(slug);
    const now = nowIso();
    const usedIds = new Set([
      source.id,
      ...source.assets.map((asset) => asset.id),
      ...source.fonts.flatMap((font) => [font.id, ...font.faces.map((face) => face.id)]),
      ...source.decks.flatMap((deck) => [deck.id, ...deck.screens.flatMap((screen) => [screen.id, ...screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])])]),
    ]);
    const freshId = (prefix: string): string => {
      let id = createId(prefix);
      while (usedIds.has(id)) id = createId(prefix);
      usedIds.add(id);
      return id;
    };
    const screenIds = new Map(source.decks.flatMap((deck) => deck.screens.map((screen) => [screen.id, freshId("screen")] as const)));
    const elementIds = new Map(source.decks.flatMap((deck) => deck.screens.flatMap((screen) => screen.layers
      .filter((layer) => layer.kind === "owned")
      .map((layer) => [layer.element.id, freshId(layer.element.type)] as const))));
    const decks = source.decks.map((deck, deckIndex) => ({
      ...deck,
      id: freshId("deck"),
      slug: `${slugify(deck.name)}-${deckIndex + 1}`,
      screens: deck.screens.map((screen, screenIndex) => ({
        ...screen,
        id: screenIds.get(screen.id) ?? freshId("screen"),
        slug: `${slugify(screen.name)}-${deckIndex + 1}-${screenIndex + 1}`,
        exportSlug: `${slugify(screen.name)}-${deckIndex + 1}-${screenIndex + 1}`,
        layers: screen.layers.map((layer) => layer.kind === "owned"
          ? { ...layer, element: { ...layer.element, id: elementIds.get(layer.element.id) ?? freshId(layer.element.type) } }
          : {
            ...layer,
            elementId: elementIds.get(layer.elementId) ?? layer.elementId,
            ownerScreenId: screenIds.get(layer.ownerScreenId) ?? layer.ownerScreenId,
          }),
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    }));
    const duplicate = parseProject({
      ...source,
      id: freshId("project"),
      slug: targetSlug,
      name: name?.trim() || `${source.name} copy`,
      decks,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.createProjectFromValue(duplicate);
    try {
      await this.copyAssets(slug, targetSlug);
      await this.copyProjectFiles(slug, targetSlug, "fonts");
      return created;
    } catch (error) {
      await this.deleteProjectUnlocked(targetSlug).catch(() => undefined);
      throw error;
    }
  }

  async addDeck(slug: string, options: AddDeckOptions): Promise<Project> {
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, async () => {
      const project = await this.loadProject(safeSlug);
      return this.saveProjectUnlocked(addSceneDeck(project, options));
    });
  }

  async addScreen(slug: string, deckId: string, preset: ScreenPreset, name?: string, options: AddScreenOptions = {}): Promise<Project> {
    const safeSlug = assertProjectSlug(slug);
    return this.mutationLock.run(safeSlug, async () => {
      const project = await this.loadProject(safeSlug);
      const screenName = name?.trim() || `${preset[0]?.toUpperCase() ?? "S"}${preset.slice(1)} screen`;
      return this.saveProjectUnlocked(addSceneScreen(project, deckId, preset, { ...options, name: screenName }));
    });
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
      await assertDirectoryContained(this.rootDir, projectDirectory);
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
    return this.copyProjectFiles(sourceSlug, targetSlug, "assets");
  }

  private async copyProjectFiles(sourceSlug: string, targetSlug: string, subdirectory: "assets" | "fonts"): Promise<void> {
    const sourceDirectory = this.projectSubdirectory(sourceSlug, subdirectory);
    const targetDirectory = this.projectSubdirectory(targetSlug, subdirectory);
    if (!(await pathExists(sourceDirectory))) {
      return;
    }
    await assertDirectoryContained(this.projectDirectory(sourceSlug), sourceDirectory);
    await assertDirectoryContained(this.projectDirectory(targetSlug), targetDirectory);

    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      await assertFileNotSymlink(resolveWithin(sourceDirectory, entry.name));
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
