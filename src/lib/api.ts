import { z } from "zod";
import { PlinthError, toPlinthError } from "./errors";
import { MAX_EXPORT_BYTES } from "./export-validation";
import { parseProject } from "./migrations";
import { CURRENT_SCHEMA_VERSION, ScreenPresetSchema } from "./schema";
import { assetPathFromRequestName, ProjectStorage } from "./storage";
import { PROJECT_SLUG_PATTERN } from "./ids";

const ProjectSlugRequestSchema = z.string().trim().min(1).max(64).regex(
  PROJECT_SLUG_PATTERN,
  "Use lowercase letters, numbers, and single hyphens.",
);

const CreateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: ProjectSlugRequestSchema.optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

const RenameProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: ProjectSlugRequestSchema.optional(),
    exportDirectory: z.string().trim().max(4096).nullable().optional(),
  })
  .strict();

const DuplicateProjectRequestSchema = z
  .object({
    slug: ProjectSlugRequestSchema,
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const AddDeckRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(96).optional(),
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional(),
    screenPreset: ScreenPresetSchema.optional(),
  })
  .strict();

const AddScreenRequestSchema = z
  .object({
    preset: ScreenPresetSchema,
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(96).optional(),
    exportSlug: z.string().trim().min(1).max(96).optional(),
  })
  .strict();

const ExportMetadataSchema = z
  .object({
    screenId: z.string().min(1).max(96),
    fileName: z.string().min(1).max(180),
    width: z.number().int().positive().max(100_000),
    height: z.number().int().positive().max(100_000),
    scope: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("screen"), screenId: z.string().min(1).max(96) }).strict(),
      z.object({ mode: z.literal("deck"), deckId: z.string().min(1).max(96) }).strict(),
      z.object({ mode: z.literal("all") }).strict(),
    ]).optional(),
    exportRunId: z.string().min(1).max(64).optional(),
  })
  .strict();

type ApiAction = () => Response | Promise<Response>;

export function success<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}

export function failure(error: unknown): Response {
  const normalized = toPlinthError(error);
  return Response.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      },
    },
    { status: normalized.status },
  );
}

export async function apiAction(action: ApiAction): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    return failure(error);
  }
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new PlinthError("INVALID_REQUEST", 400, "The request body is not valid JSON.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new PlinthError("INVALID_REQUEST", 400, "The request body failed validation.", {
      issues: result.error.issues,
    });
  }
  return result.data;
}

function pathSegment(request: Request, index: number): string {
  const segment = new URL(request.url).pathname.split("/")[index];
  if (!segment) {
    throw new PlinthError("INVALID_REQUEST", 400, "The project slug is required.");
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new PlinthError("INVALID_REQUEST", 400, "The project path is not valid.");
  }
}

function assetPathSegment(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const marker = "/assets/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) {
    throw new PlinthError("INVALID_REQUEST", 400, "The asset file name is required.");
  }
  return assetPathFromRequestName(pathname.slice(markerIndex + marker.length));
}

function exportFileNameSegment(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const marker = "/exports/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) {
    throw new PlinthError("INVALID_REQUEST", 400, "The export file name is required.");
  }
  try {
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    throw new PlinthError("INVALID_REQUEST", 400, "The export file name is not valid URL encoding.");
  }
}

export function handleHealth(): Response {
  return success({ service: "plinth", status: "ok", schemaVersion: CURRENT_SCHEMA_VERSION });
}

export function handleListProjects(storage: ProjectStorage): Promise<Response> {
  return storage.listProjectMetadata().then((projects) => success({ projects }));
}

export async function handleCreateProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const body = parseBody(CreateProjectRequestSchema, await jsonBody(request));
  const project = await storage.createProject({
    name: body.name,
    slug: body.slug,
    description: body.description ?? "A local-first composition project.",
  });
  return success({ project }, 201);
}

export async function handleGetProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const project = await storage.loadProject(pathSegment(request, 3));
  return success({ project });
}

export async function handleSaveProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const project = parseProject(await jsonBody(request));
  if (project.slug !== slug) {
    throw new PlinthError("INVALID_REQUEST", 400, "Project slug in the body must match the URL.");
  }
  const savedProject = await storage.saveProjectFromClient(project);
  return success({ project: savedProject });
}

export async function handleDeleteProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  await storage.deleteProject(slug);
  return success({ deleted: slug });
}

export async function handleRenameProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const body = parseBody(RenameProjectRequestSchema, await jsonBody(request));
  const project = await storage.renameProject(slug, body.name, body.slug, body.exportDirectory);
  return success({ project });
}

export async function handleDuplicateProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const body = parseBody(DuplicateProjectRequestSchema, await jsonBody(request));
  const project = await storage.duplicateProject(slug, body.slug, body.name);
  return success({ project }, 201);
}

export async function handleAddDeck(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const body = parseBody(AddDeckRequestSchema, await jsonBody(request));
  if (!body.width || !body.height) {
    throw new PlinthError("INVALID_REQUEST", 400, "Deck width and height are required when creating a deck.");
  }
  const project = await storage.addDeck(slug, {
    name: body.name,
    slug: body.slug,
    width: body.width,
    height: body.height,
    screenPreset: body.screenPreset,
  });
  return success({ project });
}

export async function handleAddScreen(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const deckId = pathSegment(request, 5);
  const body = parseBody(AddScreenRequestSchema, await jsonBody(request));
  const project = await storage.addScreen(slug, deckId, body.preset, body.name, {
    slug: body.slug,
    exportSlug: body.exportSlug,
  });
  return success({ project });
}

export async function handleListAssets(request: Request, storage: ProjectStorage): Promise<Response> {
  const assets = await storage.listAssets(pathSegment(request, 3));
  return success({ assets });
}

export async function handleUploadAsset(request: Request, storage: ProjectStorage): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    throw new PlinthError("INVALID_REQUEST", 400, "The upload must be a valid multipart form.", { cause: error instanceof Error ? error.message : String(error) });
  }
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    throw new PlinthError("INVALID_REQUEST", 400, "Multipart uploads must include an image file in the `file` field.");
  }
  const fileName = typeof (file as { name?: unknown }).name === "string" ? (file as { name: string }).name : "asset";
  const mutation = await storage.ingestAsset(pathSegment(request, 3), file, fileName);
  return success({ asset: mutation.asset, duplicate: mutation.duplicate, project: mutation.project }, mutation.duplicate ? 200 : 201);
}

export async function handleGetAsset(request: Request, storage: ProjectStorage): Promise<Response> {
  const asset = await storage.readAsset(pathSegment(request, 3), assetPathSegment(request));
  const headers = new Headers({
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": `inline; filename="${asset.asset.fileName.replaceAll('"', "")}"`,
    "content-length": String(asset.bytes.byteLength),
    "content-type": asset.asset.mimeType,
    "x-content-type-options": "nosniff",
  });
  if (asset.asset.mimeType === "image/svg+xml") {
    headers.set("content-security-policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  }
  return new Response(asset.bytes.buffer as ArrayBuffer, { headers });
}

export async function handleDeleteAsset(request: Request, storage: ProjectStorage): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true" || request.headers.get("x-plinth-force") === "true";
  const result = await storage.deleteAsset(pathSegment(request, 3), assetPathSegment(request), force);
  return success({ deleted: result.deleted.path, project: result.project, usages: result.usages });
}

export async function handleListExports(request: Request, storage: ProjectStorage): Promise<Response> {
  return success({ exports: await storage.exportPlan(pathSegment(request, 3)) });
}

function parseNumberField(value: FormDataEntryValue | null, label: string): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PlinthError("INVALID_REQUEST", 400, `Export metadata field "${label}" is required.`);
  }
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new PlinthError("INVALID_REQUEST", 400, `Export metadata field "${label}" must be an integer.`, { label, value });
  }
  return number;
}

async function parseExportMultipart(request: Request): Promise<{ metadata: z.infer<typeof ExportMetadataSchema>; file: Blob }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_EXPORT_BYTES + 2 * 1024 * 1024) {
    throw new PlinthError("EXPORT_TOO_LARGE", 413, `PNG exports must be ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB or smaller.`, { maxBytes: MAX_EXPORT_BYTES, contentLength });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    throw new PlinthError("INVALID_REQUEST", 400, "The export must be a valid multipart form.", { cause: error instanceof Error ? error.message : String(error) });
  }
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    throw new PlinthError("INVALID_REQUEST", 400, "Export uploads must include a PNG file in the `file` field.");
  }
  if (file.size > MAX_EXPORT_BYTES) {
    throw new PlinthError("EXPORT_TOO_LARGE", 413, `PNG exports must be ${Math.round(MAX_EXPORT_BYTES / 1024 / 1024)} MB or smaller.`, { maxBytes: MAX_EXPORT_BYTES, byteSize: file.size });
  }

  const metadataValue = formData.get("metadata");
  let metadata: unknown;
  if (typeof metadataValue === "string" && metadataValue.trim()) {
    try {
      metadata = JSON.parse(metadataValue) as unknown;
    } catch (error) {
      throw new PlinthError("INVALID_REQUEST", 400, "Export metadata is not valid JSON.", { cause: error instanceof Error ? error.message : String(error) });
    }
  } else {
    metadata = {
      screenId: formData.get("screenId"),
      fileName: formData.get("fileName") ?? (typeof (file as { name?: unknown }).name === "string" ? (file as { name: string }).name : null),
      width: parseNumberField(formData.get("width"), "width"),
      height: parseNumberField(formData.get("height"), "height"),
    };
  }
  const parsed = ExportMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new PlinthError("INVALID_REQUEST", 400, "Export metadata failed validation.", { issues: parsed.error.issues });
  }
  const uploadedFileName = typeof (file as { name?: unknown }).name === "string"
    ? (file as { name: string }).name
    : "";
  if (uploadedFileName && uploadedFileName !== parsed.data.fileName) {
    throw new PlinthError("EXPORT_FILE_INVALID", 400, "The uploaded file name must match the export metadata fileName.", {
      uploadedFileName,
      fileName: parsed.data.fileName,
    });
  }
  return { metadata: parsed.data, file };
}

export async function handleCreateExport(request: Request, storage: ProjectStorage): Promise<Response> {
  const { metadata, file } = await parseExportMultipart(request);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storage.writeExport(pathSegment(request, 3), { ...metadata, bytes });
  return success({ export: result }, 201);
}

export async function handleCreateExportRun(request: Request, storage: ProjectStorage): Promise<Response> {
  const result = await storage.createExportRun(pathSegment(request, 3));
  return success({ exportRun: result }, 201);
}

export async function handleGetExport(request: Request, storage: ProjectStorage): Promise<Response> {
  const result = await storage.readExport(pathSegment(request, 3), exportFileNameSegment(request));
  return new Response(result.bytes.buffer as ArrayBuffer, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${result.fileName}"`,
      "content-length": String(result.byteSize),
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
    },
  });
}

export function handleApiNotFound(): Response {
  return failure(new PlinthError("PROJECT_NOT_FOUND", 404, "API route not found."));
}
