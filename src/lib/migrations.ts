import { createDefaultProject } from "./defaults";
import { PlinthError } from "./errors";
import { slugify } from "./ids";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "./schema";
import type { Project } from "./schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function legacyDocument(value: unknown, index: number, now: string): Project["documents"][number] {
  const source = isRecord(value) ? value : {};
  const name = typeof source.name === "string" ? source.name : typeof source.title === "string" ? source.title : `Composition ${index + 1}`;
  const template = createDefaultProject("Migration seed", { now, documentCount: 1 }).documents[0];

  if (!template) {
    throw new PlinthError("SCHEMA_INVALID", 422, "Migration could not create a document template.");
  }

  return {
    ...template,
    id: typeof source.id === "string" ? source.id : template.id,
    name,
    slug: typeof source.slug === "string" ? slugify(source.slug) : slugify(name),
    elements: Array.isArray(source.elements) ? source.elements : [],
    createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
  };
}

function migrateVersionZero(source: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const name = typeof source.name === "string" && source.name.trim() ? source.name : "Migrated project";
  const starter = createDefaultProject(name, {
    now,
    id: typeof source.id === "string" ? source.id : undefined,
    slug: typeof source.slug === "string" ? slugify(source.slug) : slugify(name),
    documentCount: 1,
  });
  const rawDocuments = Array.isArray(source.documents) ? source.documents : [];

  return {
    ...starter,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    description: typeof source.description === "string" ? source.description : starter.description,
    settings: isRecord(source.settings) ? { ...starter.settings, ...source.settings } : starter.settings,
    background: isRecord(source.background) ? source.background : starter.background,
    assets: Array.isArray(source.assets) ? source.assets : starter.assets,
    documents: rawDocuments.length > 0 ? rawDocuments.map((document, index) => legacyDocument(document, index, now)) : starter.documents,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
  };
}

export function migrateProject(input: unknown): unknown {
  if (!isRecord(input)) {
    throw new PlinthError("SCHEMA_INVALID", 422, "Project data must be a JSON object.");
  }

  const versionValue = input.schemaVersion ?? input.version ?? 0;
  if (typeof versionValue !== "number" || !Number.isInteger(versionValue) || versionValue < 0) {
    throw new PlinthError("SCHEMA_INVALID", 422, "Project schemaVersion must be a non-negative integer.");
  }

  if (versionValue > CURRENT_SCHEMA_VERSION) {
    throw new PlinthError(
      "SCHEMA_VERSION_UNSUPPORTED",
      422,
      `Project schema version ${versionValue} is newer than this Plinth build supports.`,
      { currentVersion: CURRENT_SCHEMA_VERSION },
    );
  }

  if (versionValue === 0) {
    return migrateVersionZero(input);
  }

  return input;
}

export function parseProject(input: unknown): Project {
  const migrated = migrateProject(input);
  const result = ProjectSchema.safeParse(migrated);

  if (!result.success) {
    const issueSummary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
      .join("; ");
    throw new PlinthError("SCHEMA_INVALID", 422, `Project data failed schema validation: ${issueSummary}`, {
      issues: result.error.issues,
      summary: issueSummary,
    });
  }

  return result.data;
}
