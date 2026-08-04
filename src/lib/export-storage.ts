import { realpath, stat } from "node:fs/promises";
import { PlinthError } from "./errors";

export class ExportRunRegistry {
  private readonly runs = new Map<string, { directory: string; createdAt: number }>();

  register(projectId: string, runId: string, directory: string): void {
    const expiration = Date.now() - 6 * 60 * 60 * 1000;
    for (const [key, run] of this.runs) if (run.createdAt < expiration) this.runs.delete(key);
    this.runs.set(`${projectId}:${runId}`, { directory, createdAt: Date.now() });
  }

  async resolve(projectId: string, runId: string): Promise<string> {
    const run = this.runs.get(`${projectId}:${runId}`);
    try {
      if (!run) throw new Error("The export run is not registered in this server process.");
      const directoryStats = await stat(run.directory);
      if (!directoryStats.isDirectory()) throw new Error("The export run path is not a directory.");
      const canonicalDirectory = await realpath(run.directory);
      if (canonicalDirectory !== run.directory) throw new Error("The export run directory no longer resolves to its original location.");
      return canonicalDirectory;
    } catch (error) {
      throw new PlinthError("EXPORT_RUN_UNAVAILABLE", 422, "The timestamped export directory is no longer available. Start the export again.", {
        exportRunId: runId,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
