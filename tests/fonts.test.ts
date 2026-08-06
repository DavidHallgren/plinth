import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BUILT_IN_FONTS, DEFAULT_BUILT_IN_FONT_ID, getBuiltInFont, quotedFontCssFamily } from "../src/fonts/catalog";
import { validateFontBytes } from "../src/lib/font-validation";
import { createDefaultProject } from "../src/lib/defaults";
import { parseProjectWithWarnings } from "../src/lib/migrations";
import { ProjectStorage } from "../src/lib/storage";
import { normalizeFontsourceCss } from "../scripts/generate-styles";
import { apiAction, handleDeleteFont, handleGetFont, handleUploadFont } from "../src/lib/api";
import type { ProjectFontFamily } from "../src/lib/schema";

const temporaryDirectories: string[] = [];
afterEach(async () => { while (temporaryDirectories.length > 0) { const directory = temporaryDirectories.pop(); if (directory) await rm(directory, { recursive: true, force: true }); } });

async function quicksandFixture(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(import.meta.dir, "..", "node_modules", "@fontsource-variable", "quicksand", "files", "quicksand-latin-wght-normal.woff2")));
}

describe("built-in font catalog", () => {
  test("contains 17 unique pinned OFL Fontsource families", () => {
    expect(BUILT_IN_FONTS).toHaveLength(17);
    expect(new Set(BUILT_IN_FONTS.map((font) => font.id)).size).toBe(BUILT_IN_FONTS.length);
    expect(new Set(BUILT_IN_FONTS.map((font) => font.name)).size).toBe(BUILT_IN_FONTS.length);
    expect(BUILT_IN_FONTS.every((font) => font.packageVersion === "5.3.0")).toBe(true);
    expect(BUILT_IN_FONTS.every((font) => font.license.type === "OFL-1.1")).toBe(true);
    expect(getBuiltInFont(DEFAULT_BUILT_IN_FONT_ID)?.name).toBe("Inter");
    expect(getBuiltInFont("builtin:quicksand")?.weight).toEqual({ kind: "variable", min: 300, max: 700, step: 1 });
    expect(getBuiltInFont("builtin:nunito")?.weight).toEqual({ kind: "variable", min: 200, max: 900, step: 1 });
  });

  test("covers simplified and traditional Chinese, Japanese, and Korean", () => {
    const cjkSubsets = BUILT_IN_FONTS.filter((font) => font.cjk).flatMap((font) => font.subsets);
    expect(cjkSubsets).toContain("chinese-simplified");
    expect(cjkSubsets).toContain("chinese-traditional");
    expect(cjkSubsets).toContain("japanese");
    expect(cjkSubsets).toContain("korean");
  });

  test("describes continuous and discrete weight controls accurately", () => {
    expect(getBuiltInFont("builtin:inter")?.weight).toEqual({ kind: "variable", min: 100, max: 900, step: 1 });
    expect(getBuiltInFont("builtin:ibm-plex-mono")?.weight).toEqual({ kind: "static", values: [100, 200, 300, 400, 500, 600, 700] });
    expect(getBuiltInFont("builtin:bebas-neue")?.styles).toEqual(["normal"]);
  });

  test("quotes font preview families and normalizes Fontsource variable faces", () => {
    expect(quotedFontCssFamily("builtin:source-sans-3")).toBe('"Source Sans 3 Variable"');
    expect(normalizeFontsourceCss("src: url(./files/source-sans.woff2) format('woff2-variations');", "@fontsource-variable/source-sans-3"))
      .toBe("src: url(../node_modules/@fontsource-variable/source-sans-3/files/source-sans.woff2) format('woff2');");
  });
});

describe("project fonts", () => {
  test("validates real WOFF2 metadata and stores a self-contained uploaded face", async () => {
    const bytes = await quicksandFixture();
    const validated = await validateFontBytes(bytes, "Quicksand.woff2");
    expect(validated.familyName).toContain("Quicksand");
    expect(validated.face).toMatchObject({ mimeType: "font/woff2", style: "normal", weightMin: 300, weightMax: 700 });

    const directory = await mkdtemp(join(tmpdir(), "plinth-fonts-test-"));
    temporaryDirectories.push(directory);
    const storage = new ProjectStorage(join(directory, "projects"));
    await storage.createProject({ name: "Font fixture", slug: "font-fixture", description: "Font upload fixture" });
    await expect(storage.ingestFont("font-fixture", new File([bytes as unknown as BlobPart], "Quicksand.woff2"), "Quicksand.woff2", false)).rejects.toMatchObject({ code: "FONT_LICENSE_REQUIRED" });
    const mutation = await storage.ingestFont("font-fixture", new File([bytes as unknown as BlobPart], "Quicksand.woff2"), "Quicksand.woff2", true);
    expect(mutation.project.fonts).toHaveLength(1);
    expect((await storage.readFont("font-fixture", mutation.face.path)).bytes).toHaveLength(bytes.byteLength);
    expect((await storage.ingestFont("font-fixture", new File([bytes as unknown as BlobPart], "copy.woff2"), "copy.woff2", true)).duplicate).toBe(true);
    expect((await storage.deleteFont("font-fixture", mutation.font.id)).project.fonts).toHaveLength(0);
  });

  test("warns and substitutes the bundled default for an unavailable reference", () => {
    const project = createDefaultProject("Missing font fixture");
    const decks = project.decks.map((deck) => ({ ...deck, screens: deck.screens.map((screen) => ({ ...screen, layers: screen.layers.map((layer) => layer.kind === "owned" && layer.element.type === "text" ? { ...layer, element: { ...layer.element, style: { ...layer.element.style, fontFamilyId: "font_missing" } } } : layer) })) }));
    const result = parseProjectWithWarnings({ ...project, decks });
    expect(result.warnings).toEqual([{ code: "FONT_SUBSTITUTED", fontFamilyId: "font_missing", message: "Font \"font_missing\" is unavailable and was changed to Inter." }]);
    const text = result.project.decks.flatMap((deck) => deck.screens).flatMap((screen) => screen.layers).find((layer) => layer.kind === "owned" && layer.element.type === "text");
    expect(text?.kind === "owned" && text.element.type === "text" ? text.element.style.fontFamilyId : null).toBe("builtin:inter");
  });

  test("exposes project-local upload, get, and delete handlers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "plinth-font-api-test-"));
    temporaryDirectories.push(directory);
    const storage = new ProjectStorage(join(directory, "projects"));
    await storage.createProject({ name: "Font API fixture", slug: "font-api", description: "Font API fixture" });
    const bytes = await quicksandFixture();
    const form = new FormData();
    form.append("file", new File([bytes as unknown as BlobPart], "Quicksand.woff2"));
    form.append("licenseConfirmed", "true");

    const upload = await handleUploadFont(new Request("http://plinth.test/api/projects/font-api/fonts", { method: "POST", body: form }), storage);
    expect(upload.status).toBe(201);
    const payload = await upload.json() as { data: { font: ProjectFontFamily; face: { path: string } } };
    const faceName = payload.data.face.path.slice("fonts/".length);
    const file = await handleGetFont(new Request(`http://plinth.test/api/projects/font-api/fonts/${encodeURIComponent(faceName)}`), storage);
    expect(file.headers.get("content-type")).toBe("font/woff2");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(Array.from(bytes));

    const deletion = await apiAction(() => handleDeleteFont(new Request(`http://plinth.test/api/projects/font-api/fonts/${encodeURIComponent(payload.data.font.id)}`, { method: "DELETE" }), storage));
    expect(deletion.status).toBe(200);
    expect((await storage.loadProject("font-api")).fonts).toHaveLength(0);
  });
});
