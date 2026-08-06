import { access, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FONT_FACE_STYLESHEETS } from "../src/fonts/font-faces";

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

export function normalizeFontsourceCss(css: string, packageName: string): string {
  const packageFiles = `../node_modules/${packageName}/files/`;
  return css
    .replaceAll("format('woff2-variations')", "format('woff2')")
    .replaceAll('format("woff2-variations")', 'format("woff2")')
    .replaceAll("url(./files/", `url(${packageFiles}`)
    .replaceAll('url("./files/', `url("${packageFiles}`)
    .replaceAll("url('./files/", `url('${packageFiles}`);
}

async function appendFontFaces(): Promise<void> {
  const stylesheets: string[] = [];
  for (const source of FONT_FACE_STYLESHEETS) {
    for (const cssFile of source.cssFiles) {
      const path = join(projectRoot, "node_modules", source.packageName, cssFile);
      const css = await readFile(path, "utf8");
      stylesheets.push(normalizeFontsourceCss(css, source.packageName));
    }
  }
  await appendFile(output, `\n/* Bundled Fontsource faces */\n${stylesheets.join("\n")}\n`);
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
  await appendFontFaces();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
