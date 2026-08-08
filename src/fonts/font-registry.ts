import type { Project, ProjectFontFace } from "../lib/schema";
import { fontCssFamily, isBuiltInFontId, projectFontCssFamily } from "./catalog";

const loadedFaces = new Map<string, Promise<FontFace>>();

export function projectFontLoadKey(project: Pick<Project, "id" | "slug" | "fonts">): string {
  return JSON.stringify([project.id, project.slug, project.fonts]);
}

export type ProjectFontRequest = {
  familyId: string;
  weight: number;
  italic: boolean;
  text: string;
};

export function projectFontUrl(projectSlug: string, path: string): string {
  const fileName = path.slice("fonts/".length);
  return `/api/projects/${encodeURIComponent(projectSlug)}/fonts/${encodeURIComponent(fileName)}`;
}

function faceKey(project: Project, face: ProjectFontFace): string {
  return `${project.id}:${face.contentHash}`;
}

function registerFace(project: Project, familyId: string, face: ProjectFontFace): Promise<FontFace> {
  const key = faceKey(project, face);
  const cached = loadedFaces.get(key);
  if (cached) return cached;
  const task = (async () => {
    const fontFace = new FontFace(projectFontCssFamily(familyId), `url("${projectFontUrl(project.slug, face.path)}")`, {
      style: face.style,
      weight: face.weightMin === face.weightMax ? String(face.weightMin) : `${face.weightMin} ${face.weightMax}`,
    });
    document.fonts.add(fontFace);
    await fontFace.load();
    return fontFace;
  })();
  loadedFaces.set(key, task);
  task.catch(() => loadedFaces.delete(key));
  return task;
}

export async function ensureProjectFonts(project: Project): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  await Promise.all(projectFontRequests(project).map((request) =>
    ensureFontReady(project, request.familyId, request.weight, request.italic, request.text),
  ));
}

export function projectFontRequests(project: Project): ProjectFontRequest[] {
  const requests = new Map<string, ProjectFontRequest>();
  for (const deck of project.decks) {
    for (const screen of deck.screens) {
      for (const layer of screen.layers) {
        if (layer.kind !== "owned" || layer.element.type !== "text") continue;
        const request = {
          familyId: layer.element.style.fontFamilyId,
          weight: layer.element.style.fontWeight,
          italic: layer.element.style.italic ?? false,
          text: layer.element.text || "Plinth 123",
        };
        const key = `${request.familyId}:${request.weight}:${request.italic}:${request.text}`;
        requests.set(key, request);
      }
    }
  }
  return [...requests.values()];
}

export async function ensureFontReady(project: Project, familyId: string, weight: number, italic: boolean, text = "Plinth 123"): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  if (!isBuiltInFontId(familyId)) {
    const family = project.fonts.find((candidate) => candidate.id === familyId);
    if (!family) throw new Error(`Project font ${familyId} is not available.`);
    await Promise.all(family.faces.map((face) => registerFace(project, family.id, face)));
  }
  const spec = `${italic ? "italic " : ""}${Math.round(weight)} 16px "${fontCssFamily(familyId)}"`;
  const loaded = await document.fonts.load(spec, text);
  if (loaded.length === 0 || !document.fonts.check(spec, text)) throw new Error(`Font ${familyId} did not load for ${italic ? "italic " : ""}${weight}.`);
}
