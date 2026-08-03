import { access } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const input = join(projectRoot, "src", "styles.css");
const output = join(projectRoot, "src", "styles.generated.css");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const executable = join(projectRoot, "node_modules", ".bin", "tailwindcss");
  if (!(await exists(executable))) {
    throw new Error("Tailwind CLI is not installed. Run `bun install` before starting Plinth.");
  }

  const argumentsList = [executable, "-i", input, "-o", output];
  if (process.argv.includes("--minify")) {
    argumentsList.push("--minify");
  }

  const processHandle = Bun.spawn(argumentsList, {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`Tailwind CLI exited with code ${exitCode}.`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
