import { z } from "zod";
import { PlinthError, toPlinthError } from "./errors";
import { parseProject } from "./migrations";
import { CURRENT_SCHEMA_VERSION, DocumentPresetSchema } from "./schema";
import { assetPathFromRequestName, ProjectStorage } from "./storage";

const CreateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(64).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

const RenameProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const DuplicateProjectRequestSchema = z
  .object({
    slug: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const AddDocumentRequestSchema = z
  .object({
    preset: DocumentPresetSchema,
    name: z.string().trim().min(1).max(120).optional(),
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional(),
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
  await storage.loadProject(slug);
  const project = parseProject(await jsonBody(request));
  if (project.slug !== slug) {
    throw new PlinthError("INVALID_REQUEST", 400, "Project slug in the body must match the URL.");
  }
  const savedProject = await storage.saveProject(project);
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
  const project = await storage.renameProject(slug, body.name, body.slug);
  return success({ project });
}

export async function handleDuplicateProject(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const body = parseBody(DuplicateProjectRequestSchema, await jsonBody(request));
  const project = await storage.duplicateProject(slug, body.slug, body.name);
  return success({ project }, 201);
}

export async function handleAddDocument(request: Request, storage: ProjectStorage): Promise<Response> {
  const slug = pathSegment(request, 3);
  const body = parseBody(AddDocumentRequestSchema, await jsonBody(request));
  const project = await storage.addDocument(slug, body.preset, body.name, { width: body.width, height: body.height });
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

export function handleReservedExport(): Response {
  return failure(
    new PlinthError(
      "NOT_IMPLEMENTED",
      501,
      "Export rendering and download are reserved for a later phase.",
    ),
  );
}

export function handleApiNotFound(): Response {
  return failure(new PlinthError("PROJECT_NOT_FOUND", 404, "API route not found."));
}
