import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FONT_FACE_STYLESHEETS } from "../src/fonts/font-faces";

const projectRoot = process.cwd();
const outputDirectory = join(projectRoot, "dist");
const executable = join(outputDirectory, "plinth");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const build = Bun.spawn(["bun", "build", "--compile", "src/server.ts", "--outfile", executable], {
  cwd: projectRoot,
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await build.exited;
if (exitCode !== 0) throw new Error(`Bun build exited with code ${exitCode}.`);

await copyFile(join(projectRoot, "THIRD_PARTY_NOTICES.md"), join(outputDirectory, "THIRD_PARTY_NOTICES.md"));
await copyFile(join(projectRoot, "LICENSE"), join(outputDirectory, "LICENSE"));
const appleLicenseDirectory = join(outputDirectory, "licenses", "apple");
await mkdir(appleLicenseDirectory, { recursive: true });
await copyFile(join(projectRoot, "src/devices/frames/Apple-Design-Resources-License.rtf"), join(appleLicenseDirectory, "Apple-Design-Resources-License.rtf"));
const fontLicenseDirectory = join(outputDirectory, "licenses", "fonts");
await mkdir(fontLicenseDirectory, { recursive: true });
await Promise.all(FONT_FACE_STYLESHEETS.map((source) => copyFile(
  join(projectRoot, "node_modules", source.packageName, "LICENSE"),
  join(fontLicenseDirectory, `${source.packageName.replaceAll("/", "__").replaceAll("@", "")}.txt`),
)));
