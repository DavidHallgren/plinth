import { rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export function filesystemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}

export async function writePrettyJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID().replaceAll("-", "")}`);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await Bun.write(temporaryPath, contents);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
