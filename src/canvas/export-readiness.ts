import type { AssetMetadata, Document, Project } from "../lib/schema";
import { deviceFrameSource } from "../devices/frame-assets";
import { assetUrl } from "./image-loading";
import { imageResourceState, loadImageResource } from "./image-cache";

export type SceneReadiness = {
  assetPaths: string[];
  builtInImageSources: string[];
  fontFamilies: string[];
  fontSpecs: string[];
};

function referencedAssetPaths(sceneDocument: Document): string[] {
  const paths = new Set<string>();
  for (const element of sceneDocument.elements) {
    if (element.type === "image") paths.add(element.assetPath);
    if (element.type === "device" && element.screenshotPath) paths.add(element.screenshotPath);
  }
  return [...paths];
}

function referencedFontFamilies(sceneDocument: Document): string[] {
  const families = new Set<string>();
  for (const element of sceneDocument.elements) {
    if (element.type === "text") families.add(element.style.fontFamily);
    if (element.type === "device") families.add("Inter, ui-sans-serif, system-ui, sans-serif");
  }
  return [...families];
}

function referencedBuiltInImageSources(sceneDocument: Document): string[] {
  const sources = new Set<string>();
  for (const element of sceneDocument.elements) {
    if (element.type !== "device" || !element.showCamera) continue;
    const source = deviceFrameSource(element.preset, element.frameColor);
    if (source) sources.add(source);
  }
  return [...sources];
}

function referencedFontSpecs(sceneDocument: Document): string[] {
  const specs = new Set<string>(["400 16px Inter, ui-sans-serif, system-ui, sans-serif"]);
  for (const element of sceneDocument.elements) {
    if (element.type !== "text") continue;
    specs.add(`${element.style.italic ? "italic " : ""}${element.style.fontWeight} ${element.style.fontSize}px ${element.style.fontFamily}`);
  }
  return [...specs];
}

export function sceneReadiness(sceneDocument: Document): SceneReadiness {
  return {
    assetPaths: referencedAssetPaths(sceneDocument),
    builtInImageSources: referencedBuiltInImageSources(sceneDocument),
    fontFamilies: referencedFontFamilies(sceneDocument),
    fontSpecs: referencedFontSpecs(sceneDocument),
  };
}

export async function waitForSceneReady(project: Pick<Project, "slug">, sceneDocument: Document, assets: readonly AssetMetadata[]): Promise<void> {
  const readiness = sceneReadiness(sceneDocument);
  const missing = readiness.assetPaths.filter((path) => !assets.some((asset) => asset.path === path));
  if (missing.length > 0) {
    throw new Error(`Export cannot start: missing project asset${missing.length === 1 ? "" : "s"} ${missing.join(", ")}. Re-upload or remove the missing asset reference.`);
  }

  const imageSources = [
    ...readiness.assetPaths.map((path) => ({ label: path, source: assetUrl(project.slug, path) })),
    ...readiness.builtInImageSources.map((source) => ({ label: "built-in device frame", source })),
  ];
  const imageResults = await Promise.all(imageSources.map(async ({ label, source }) => {
    try {
      await loadImageResource(source);
    } catch (error) {
      return { path: label, error: error instanceof Error ? error.message : String(error) };
    }
    const resource = imageResourceState(source);
    if (resource.status !== "ready" || !resource.image) {
      return { path: label, error: resource.error ?? "The asset is still loading." };
    }
    try {
      await resource.image.decode?.();
    } catch (error) {
      return { path: label, error: error instanceof Error ? error.message : "The asset could not be decoded." };
    }
    return { path: label, error: null };
  }));
  const failedImages = imageResults.filter((result): result is { path: string; error: string } => Boolean(result.error));
  if (failedImages.length > 0) {
    throw new Error(`Export cannot start: ${failedImages.map((result) => `${result.path} (${result.error})`).join(", ")}. Fix the asset and try again.`);
  }

  const pageDocument = globalThis.document;
  if (pageDocument?.fonts) {
    const fontFailures: string[] = [];
    await Promise.all(readiness.fontSpecs.map(async (spec) => {
      try {
        await pageDocument.fonts.load(spec);
      } catch (error) {
        fontFailures.push(`${spec}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    await pageDocument.fonts.ready;
    if (fontFailures.length > 0) {
      throw new Error(`Export cannot start: a text font could not be made ready (${fontFailures.join(", ")}).`);
    }
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
