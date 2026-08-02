import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isPlinthError } from "./lib/errors";

const projectRoot = process.cwd();
const sourceStyles = join(projectRoot, "src", "styles.css");
const generatedStyles = join(projectRoot, "src", "styles.generated.css");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function tailwindArguments(watch: boolean, minify: boolean): string[] {
  const localBinary = join(projectRoot, "node_modules", ".bin", "tailwindcss");
  const command = [localBinary, "-i", sourceStyles, "-o", generatedStyles];

  if (watch) {
    command.push("--watch");
  }
  if (minify) {
    command.push("--minify");
  }

  return command;
}

async function spawnTailwind(watch: boolean, minify: boolean) {
  const localBinary = join(projectRoot, "node_modules", ".bin", "tailwindcss");
  const command = (await exists(localBinary))
    ? tailwindArguments(watch, minify)
    : [process.execPath, "x", "@tailwindcss/cli", ...tailwindArguments(watch, minify).slice(1)];

  return Bun.spawn(command, {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
}

async function generateStyles(): Promise<void> {
  await mkdir(join(projectRoot, "src"), { recursive: true });
  const processHandle = await spawnTailwind(false, false);
  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`Tailwind exited with code ${exitCode}.`);
  }
}

async function build(): Promise<void> {
  await generateStyles();
  await mkdir(join(projectRoot, "dist"), { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(projectRoot, "src", "server.ts")],
    outdir: join(projectRoot, "dist"),
    target: "bun",
    minify: true,
    sourcemap: "linked",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Bun production build failed.");
  }

  console.log("Built dist/server.js and bundled HTML assets.");
}

async function dev(): Promise<void> {
  await generateStyles();
  const styleWatcher = await spawnTailwind(true, false);
  const serverProcess = Bun.spawn([process.execPath, "--hot", join(projectRoot, "src", "server.ts")], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exitCode = await serverProcess.exited;
  styleWatcher.kill();
  process.exitCode = exitCode;
}

async function start(): Promise<void> {
  const serverBundle = join(projectRoot, "dist", "server.js");
  if (!(await exists(serverBundle))) {
    throw new Error("dist/server.js is missing. Run `bun run build` first.");
  }

  const serverProcess = Bun.spawn([process.execPath, "server.js"], {
    cwd: join(projectRoot, "dist"),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...Bun.env,
      NODE_ENV: "production",
      PLINTH_DATA_ROOT: join(projectRoot, "data", "projects"),
    } as Record<string, string>,
  });
  process.exitCode = await serverProcess.exited;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "build") {
    await build();
    return;
  }
  if (command === "dev") {
    await dev();
    return;
  }
  if (command === "start") {
    await start();
    return;
  }

  console.log("Usage: bun src/tooling.ts <dev|start|build>");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (isPlinthError(error)) {
      console.error(`${error.code}: ${error.message}`);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  });
}
