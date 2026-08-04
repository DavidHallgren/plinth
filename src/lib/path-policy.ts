import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PlinthError } from "./errors";

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}

function leavesRoot(root: string, candidate: string, allowRoot: boolean): boolean {
  const relation = relative(root, candidate);
  return (!allowRoot && relation.length === 0) || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation);
}

export function resolveWithin(rootPath: string, ...segments: string[]): string {
  const root = resolve(rootPath);
  for (const segment of segments) {
    if (segment.length === 0 || isAbsolute(segment) || segment.includes("/") || segment.includes("\\") || segment === "." || segment === "..") {
      throw new PlinthError("INVALID_PATH", 400, "Path segment is not safe.", { segment });
    }
  }
  const candidate = resolve(root, ...segments);
  if (leavesRoot(root, candidate, false)) throw new PlinthError("INVALID_PATH", 400, "Resolved path would leave its allowed root.");
  return candidate;
}

export async function assertDirectoryContained(rootPath: string, directoryPath: string, allowRoot = false): Promise<string> {
  const [rootStats, directoryStats] = await Promise.all([lstat(rootPath), lstat(directoryPath)]);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new PlinthError("INVALID_PATH", 400, "The managed storage root must be a real directory.", { path: rootPath });
  if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) throw new PlinthError("INVALID_PATH", 400, "Managed storage directories cannot be symbolic links.", { path: directoryPath });
  const [canonicalRoot, canonicalDirectory] = await Promise.all([realpath(rootPath), realpath(directoryPath)]);
  if (leavesRoot(canonicalRoot, canonicalDirectory, allowRoot)) throw new PlinthError("INVALID_PATH", 400, "A managed storage directory resolves outside its allowed root.", { path: directoryPath });
  return canonicalDirectory;
}

export async function assertFileNotSymlink(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) throw new PlinthError("INVALID_PATH", 400, "Managed storage files cannot be symbolic links.", { path: filePath });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
}
