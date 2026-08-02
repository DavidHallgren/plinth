import { PlinthError } from "./errors";

export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createId(prefix: string): string {
  const compactUuid = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${prefix}_${compactUuid}`;
}

export function slugify(value: string, fallback = "untitled-project"): string {
  const result = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return result || fallback;
}

export function assertProjectSlug(value: string): string {
  const slug = value.trim();

  if (
    slug.length === 0 ||
    slug.length > 64 ||
    !PROJECT_SLUG_PATTERN.test(slug) ||
    slug === "." ||
    slug === ".." ||
    slug.includes("/") ||
    slug.includes("\\")
  ) {
    throw new PlinthError(
      "INVALID_SLUG",
      400,
      `Invalid project slug "${value}". Use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return slug;
}

export function nowIso(): string {
  return new Date().toISOString();
}
