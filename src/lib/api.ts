import { z } from "zod";
import { PlinthError, toPlinthError } from "./errors";
import { parseProject } from "./migrations";
import { ProjectStorage } from "./storage";

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
    preset: z.enum(["blank", "browser", "phone", "social"]),
    name: z.string().trim().min(1).max(120).optional(),
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

export function handleHealth(): Response {
  return success({ service: "plinth", status: "ok", schemaVersion: 1 });
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
  const project = await storage.addDocument(slug, body.preset, body.name);
  return success({ project });
}

export function handleReservedExportOrAsset(): Response {
  return failure(
    new PlinthError(
      "NOT_IMPLEMENTED",
      501,
      "This route is reserved for a later phase. Browser rendering or asset ingestion is required.",
    ),
  );
}

export function handleApiNotFound(): Response {
  return failure(new PlinthError("PROJECT_NOT_FOUND", 404, "API route not found."));
}
