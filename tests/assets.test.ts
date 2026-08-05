import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apiAction, handleDeleteAsset, handleGetAsset, handleListAssets, handleRenameAsset, handleUploadAsset } from "../src/lib/api";
import { deriveAssetFileName, assertAssetPath, assetPathForFileName, MAX_ASSET_BYTES, validateImageBytes } from "../src/lib/asset-validation";
import { createDefaultProject, createScreenPreset } from "../src/lib/defaults";
import { addElement, toggleElementOverflow } from "../src/scene/operations";
import { calculateDeviceScreenGeometry, calculateImageCoverCrop, calculateImageFitGeometry, thumbnailSize } from "../src/devices/geometry";
import { getDevicePreset } from "../src/devices/presets";
import { ProjectStorage } from "../src/lib/storage";
import type { AssetMetadata } from "../src/lib/schema";
import { createAssetMutationQueue, mergeAssetMutationProject, removeAssetUsages } from "../src/lib/asset-mutations";
import { clearImageCache, imageResourceState, loadImageResource } from "../src/canvas/image-cache";
import { ownedElements, pngFixture } from "./helpers";

const temporaryDirectories: string[] = [];

function fixtureFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

async function temporaryStorage(): Promise<ProjectStorage> {
  const directory = await mkdtemp(join(tmpdir(), "plinth-assets-test-"));
  temporaryDirectories.push(directory);
  return new ProjectStorage(join(directory, "projects"));
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("asset validation and geometry", () => {
  test("validates signatures and dimensions instead of trusting names", async () => {
    const validated = await validateImageBytes(pngFixture(), "not-really-a-jpeg.jpg", "image/jpeg");
    expect(validated).toMatchObject({ format: "png", extension: "png", mimeType: "image/png", width: 640, height: 480 });
    expect(validated.contentHash).toHaveLength(64);
    const headerOnlyPng = new Uint8Array(24);
    headerOnlyPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    await expect(validateImageBytes(headerOnlyPng, "header-only.png", "image/png")).rejects.toMatchObject({ code: "ASSET_INVALID_CONTENT" });
    await expect(validateImageBytes(new TextEncoder().encode("<svg><script>alert(1)</script></svg>"), "unsafe.svg")).rejects.toThrow(/disallowed script/);
    await expect(validateImageBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"></svg>'), "too-many-pixels.svg")).rejects.toThrow(/100 megapixels/);
    const animatedWebp = new Uint8Array(30);
    animatedWebp.set(new TextEncoder().encode("RIFF"), 0);
    animatedWebp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    animatedWebp[20] = 0x02;
    await expect(validateImageBytes(animatedWebp, "animated.webp")).rejects.toThrow(/Animated WebP/);
    await expect(validateImageBytes(new Uint8Array(MAX_ASSET_BYTES + 1), "large.png")).rejects.toThrow(/25 MB/);
  });

  test("uses JPEG EXIF orientation when recording dimensions", async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x22,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    await expect(validateImageBytes(jpeg, "oriented.jpg")).resolves.toMatchObject({ width: 2, height: 3 });
  });

  test("keeps asset paths safe and names deterministic with collision handling", () => {
    expect(assetPathForFileName("hero-abc.png")).toBe("assets/hero-abc.png");
    expect(() => assertAssetPath("assets/../secret.png")).toThrow();
    const first = deriveAssetFileName("Résumé / Hero.png", "png", "a".repeat(64));
    expect(first).toBe("resume-hero-aaaaaaaaaaaa.png");
    expect(deriveAssetFileName("Résumé / Hero.png", "png", "a".repeat(64), new Set([first]))).toBe("resume-hero-aaaaaaaaaaaaaaaaaaaa.png");
  });

  test("calculates cover, contain, stretch, device screen, and thumbnail geometry", () => {
    expect(calculateImageFitGeometry(100, 200, 300, 300, "cover")).toMatchObject({ width: 300, height: 600, x: 0, y: -150 });
    expect(calculateImageFitGeometry(100, 200, 300, 300, "contain")).toMatchObject({ width: 150, height: 300, x: 75, y: 0 });
    expect(calculateImageFitGeometry(100, 200, 300, 300, "stretch")).toMatchObject({ width: 300, height: 300, x: 0, y: 0 });
    expect(calculateImageCoverCrop(200, 100, 100, 100)).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(calculateImageCoverCrop(200, 100, 100, 100, { x: 0, y: 0.5 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(calculateImageCoverCrop(100, 200, 100, 100, { x: 0.5, y: 1 })).toEqual({ x: 0, y: 100, width: 100, height: 100 });
    const preset = getDevicePreset("iphone-17-pro-max");
    if (!preset) throw new Error("Missing device preset");
    const geometry = calculateDeviceScreenGeometry(preset, 1470, 3000);
    expect(geometry.screen.x).toBeCloseTo(75);
    expect(geometry.screen.y).toBeCloseTo(66);
    expect(geometry.screen.width).toBeCloseTo(1320);
    expect(geometry.screen.height).toBeCloseTo(2868);
    expect(geometry.cameraKind).toBe("dynamic-island");
    expect(thumbnailSize(1320, 2868, 54, 54)).toEqual({ width: 25, height: 54, scale: expect.any(Number) });
  });

  test("deduplicates in-flight image loads, preserves error state, and supports cache invalidation", async () => {
    clearImageCache();
    const images: Array<HTMLImageElement & { triggerLoad: () => void; triggerError: () => void }> = [];
    const imageFactory = () => {
      const image = {
        decoding: "",
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        src: "",
        triggerLoad() { image.onload?.(new Event("load")); },
        triggerError() { image.onerror?.(new Event("error")); },
      } as unknown as HTMLImageElement & { triggerLoad: () => void; triggerError: () => void };
      images.push(image);
      return image;
    };

    const firstLoad = loadImageResource("/asset.png", imageFactory);
    const duplicateLoad = loadImageResource("/asset.png", imageFactory);
    expect(images).toHaveLength(1);
    images[0]?.triggerLoad();
    expect((await firstLoad).status).toBe("ready");
    expect((await duplicateLoad).status).toBe("ready");
    expect((await loadImageResource("/asset.png", imageFactory)).status).toBe("ready");
    expect(images).toHaveLength(1);

    const errorLoad = loadImageResource("/missing.png", imageFactory);
    images[1]?.triggerError();
    expect((await errorLoad).status).toBe("error");
    expect(imageResourceState("/missing.png").status).toBe("error");
    expect((await loadImageResource("/missing.png", imageFactory)).status).toBe("error");
    clearImageCache("/missing.png");
    expect(imageResourceState("/missing.png").status).toBe("loading");
    expect(images).toHaveLength(2);
    const deletedLoad = loadImageResource("/deleted.png", imageFactory);
    images[2]?.triggerLoad();
    expect((await deletedLoad).status).toBe("ready");
    clearImageCache("/deleted.png");
    expect(imageResourceState("/deleted.png").status).toBe("loading");
    const replacementLoad = loadImageResource("/deleted.png", imageFactory);
    expect(images).toHaveLength(4);
    images[3]?.triggerError();
    expect((await replacementLoad).status).toBe("error");
    clearImageCache();
  });
});

describe("asset storage and API", () => {
  test("serializes concurrent uploads without losing metadata or orphaning files", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Concurrent assets", slug: "concurrent-assets", description: "Concurrency fixture" });

    const results = await Promise.all([
      storage.ingestAsset("concurrent-assets", fixtureFile(pngFixture(16, 12), "first.png", "image/png")),
      storage.ingestAsset("concurrent-assets", fixtureFile(pngFixture(17, 12), "second.png", "image/png")),
    ]);
    const project = await storage.loadProject("concurrent-assets");
    const files = await readdir(storage.projectSubdirectory("concurrent-assets", "assets"));

    expect(results.every((result) => result.duplicate === false)).toBe(true);
    expect(project.assets).toHaveLength(2);
    expect(new Set(project.assets.map((asset) => asset.fileName))).toEqual(new Set(files));
  });

  test("preserves server-owned asset metadata when saving a stale client snapshot", async () => {
    const storage = await temporaryStorage();
    const stale = await storage.createProject({ name: "Stale client", slug: "stale-client", description: "Stale save fixture" });
    const uploaded = await storage.ingestAsset("stale-client", fixtureFile(pngFixture(16, 12), "uploaded.png", "image/png"));

    const saved = await storage.saveProjectFromClient({ ...stale, name: "Client edit" });
    expect(saved.name).toBe("Client edit");
    expect(saved.assets).toEqual(uploaded.project.assets);
  });

  test("merges a completed asset mutation into a newer local scene snapshot", async () => {
    const project = await (await temporaryStorage()).createProject({ name: "Merge fixture", slug: "merge-fixture", description: "Asset merge" });
    const latest = { ...project, decks: project.decks.map((deck) => ({ ...deck, screens: deck.screens.map((screen) => ({ ...screen, notes: "edited while uploading" })) })) };
    const asset: AssetMetadata = {
      id: "asset_merge",
      kind: "image",
      name: "Merge",
      sourceFileName: "merge.png",
      path: "assets/merge.png",
      fileName: "merge.png",
      mimeType: "image/png",
      width: 16,
      height: 12,
      byteSize: pngFixture(16, 12).byteLength,
    };
    const server = { ...project, assets: [asset] };
    const merged = mergeAssetMutationProject(latest, server, true);
    expect(merged.decks[0]?.screens[0]?.notes).toBe("edited while uploading");
    expect(merged.assets).toEqual([asset]);
    expect(mergeAssetMutationProject(latest, server, false)).toBe(server);
  });

  test("removes canonical asset layers and all of their overflow projections", () => {
    let project = createDefaultProject("Asset cleanup", { screenCount: 2 });
    const asset: AssetMetadata = {
      id: "asset_cleanup",
      kind: "image",
      name: "Cleanup",
      sourceFileName: "cleanup.png",
      path: "assets/cleanup.png",
      fileName: "cleanup.png",
      mimeType: "image/png",
      width: 640,
      height: 480,
      byteSize: 10,
    };
    const ownerScreen = project.decks[0]?.screens[0];
    const targetScreen = project.decks[0]?.screens[1];
    if (!ownerScreen || !targetScreen) throw new Error("Missing cleanup screens");
    project = { ...project, assets: [asset] };
    project = toggleElementOverflow(addElement(project, ownerScreen.id, {
      id: "image_cleanup",
      type: "image",
      name: "Cleanup image",
      x: 1200,
      y: 100,
      width: 300,
      height: 200,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: asset.path,
      fit: "cover",
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 0,
      alt: "Cleanup",
    }), ownerScreen.id, "image_cleanup", true);
    expect(targetScreen.id && project.decks[0]?.screens[1]?.layers.some((layer) => layer.kind === "overflow-link" && layer.elementId === "image_cleanup")).toBe(true);

    const cleaned = removeAssetUsages(project, asset.path);
    expect(cleaned.assets).toHaveLength(0);
    expect(cleaned.decks[0]?.screens.every((screen) => screen.layers.every((layer) => (layer.kind === "owned" ? layer.element.id : layer.elementId) !== "image_cleanup"))).toBe(true);
  });

  test("flushes an immediately unsaved scene mutation before upload and delete", async () => {
    const storage = await temporaryStorage();
    const initial = await storage.createProject({ name: "Mutation queue", slug: "mutation-queue", description: "Queue fixture" });
    const screenId = initial.decks[0]?.screens[0]?.id;
    if (!screenId) throw new Error("Missing starter screen");
    const unsavedShape = {
      id: "unsaved-before-upload",
      type: "shape" as const,
      name: "Unsaved before upload",
      x: 24,
      y: 32,
      width: 240,
      height: 120,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      shape: "rounded-rectangle" as const,
      fill: "#8b7cff",
      stroke: "#c4baff",
      strokeWidth: 1,
      radius: 18,
    };
    let current = addElement(initial, screenId, unsavedShape);
    const queue = createAssetMutationQueue();
    const flushCurrentProject = async () => {
      current = await storage.saveProject(current);
    };

    const uploaded = await queue(flushCurrentProject, () => storage.ingestAsset("mutation-queue", fixtureFile(pngFixture(16, 12), "queued.png", "image/png")));
    expect(uploaded.project.decks[0]?.screens[0] && ownedElements(uploaded.project.decks[0].screens[0]).some((element) => element.id === unsavedShape.id)).toBe(true);

    const unsavedBeforeDelete = {
      ...unsavedShape,
      id: "unsaved-before-delete",
      name: "Unsaved before delete",
      x: 320,
    };
    current = addElement(uploaded.project, screenId, unsavedBeforeDelete);
    const deleted = await queue(flushCurrentProject, () => storage.deleteAsset("mutation-queue", uploaded.asset.path, true));
    expect(deleted.project.decks[0]?.screens[0] && ownedElements(deleted.project.decks[0].screens[0]).some((element) => element.id === unsavedShape.id)).toBe(true);
    expect(deleted.project.decks[0]?.screens[0] && ownedElements(deleted.project.decks[0].screens[0]).some((element) => element.id === unsavedBeforeDelete.id)).toBe(true);
  });

  test("uploads, de-duplicates, lists, serves, and protects referenced deletion", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Assets", slug: "assets", description: "Asset fixture" });
    const bytes = pngFixture();
    const first = await storage.ingestAsset("assets", fixtureFile(bytes, "Hero.PNG", "image/png"));
    const second = await storage.ingestAsset("assets", fixtureFile(bytes, "Different-name.png", "image/png"));
    expect(first.duplicate).toBe(false);
    expect(first.asset).toMatchObject({ name: "Hero", sourceFileName: "Hero.PNG" });
    expect(second.duplicate).toBe(true);
    expect(second.project.assets).toHaveLength(1);
    expect(await storage.listAssets("assets")).toMatchObject([{ path: first.asset.path, usageCount: 0, width: 640, height: 480 }]);
    expect((await storage.readAsset("assets", first.asset.path)).bytes).toEqual(bytes);

    const legacyAsset: AssetMetadata = { ...first.asset };
    delete legacyAsset.contentHash;
    await storage.saveProject({ ...first.project, assets: [legacyAsset] });
    const legacyDuplicate = await storage.ingestAsset("assets", fixtureFile(bytes, "Legacy-name.png", "image/png"));
    expect(legacyDuplicate.duplicate).toBe(true);

    const screen = createScreenPreset("blank", { id: "screen_asset", name: "Asset screen" });
    const image = {
      id: "image_asset",
      type: "image" as const,
      name: "Placed asset",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: first.asset.path,
      fit: "cover" as const,
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 12,
      alt: "Placed asset",
    };
    const device = {
      id: "device_asset",
      type: "device" as const,
      name: "Placed device",
      x: 340,
      y: 0,
      width: 245,
      height: 500,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      preset: "iphone-17-pro-max" as const,
      deviceId: "iphone-17-pro-max",
      deviceName: "iPhone 17 Pro Max",
      frame: "phone" as const,
      frameColor: "#182d55",
      screenColor: "#f7f8fc",
      screenshotPath: first.asset.path,
      screenshotFit: "cover" as const,
      screenshotPosition: { x: 0.5, y: 0.5 },
      bezelStyle: "solid" as const,
      cornerRadius: null,
      screenCornerRadius: null,
      showGlare: false,
      showCamera: true,
    };
    const baseDeck = legacyDuplicate.project.decks[0];
    if (!baseDeck) throw new Error("Missing starter deck");
    const baseProject = { ...legacyDuplicate.project, decks: [{ ...baseDeck, screens: [{ ...screen, background: { type: "asset" as const, assetPath: first.asset.path, fit: "cover" as const, position: { x: 0.5, y: 0.5 }, blur: 0, overlayColor: "#000000", overlayOpacity: 0, texture: null } }] }] };
    const project = await storage.saveProject(addElement(addElement(baseProject, "screen_asset", image), "screen_asset", device));
    const placedScreen = project.decks[0]?.screens[0];
    expect(placedScreen && ownedElements(placedScreen)[0]?.type).toBe("image");
    expect(await storage.listAssets("assets")).toMatchObject([{ path: first.asset.path, usageCount: 3 }]);
    await expect(storage.deleteAsset("assets", first.asset.path)).rejects.toMatchObject({ code: "ASSET_IN_USE" });
    const deletedWithUsages = await storage.deleteAsset("assets", first.asset.path, true);
    expect(deletedWithUsages.project.assets).toHaveLength(0);
    expect(deletedWithUsages.project.decks[0]?.screens[0]?.layers).toHaveLength(0);
    expect(deletedWithUsages.project.decks[0]?.screens[0]?.background).toEqual({ type: "solid", color: "#10131a" });
    await expect(stat(join(storage.projectSubdirectory("assets", "assets"), first.asset.fileName))).rejects.toThrow();
  });

  test("revalidates stored bytes before serving and reports tampered SVGs", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "Tampered assets", slug: "tampered-assets", description: "SVG fixture" });
    const safeSvg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#8b7cff"/></svg>');
    const uploaded = await storage.ingestAsset("tampered-assets", fixtureFile(safeSvg, "safe.svg", "image/svg+xml"));
    await Bun.write(storage.assetFilePath("tampered-assets", uploaded.asset.path), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><script>alert(1)</script></svg>');
    await expect(storage.readAsset("tampered-assets", uploaded.asset.path)).rejects.toMatchObject({ code: "ASSET_INVALID_CONTENT" });

    const response = await apiAction(() => handleGetAsset(new Request(`http://plinth.test/api/projects/tampered-assets/assets/${encodeURIComponent(uploaded.asset.fileName)}`), storage));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "ASSET_INVALID_CONTENT", details: { repair: "re-upload" } } });
  });

  test("exposes structured multipart upload/list/get/delete handlers", async () => {
    const storage = await temporaryStorage();
    await storage.createProject({ name: "API assets", slug: "api-assets", description: "API fixture" });
    const form = new FormData();
    form.append("file", fixtureFile(pngFixture(12, 8), "api-shot.png", "image/png"));
    const uploadResponse = await handleUploadAsset(new Request("http://plinth.test/api/projects/api-assets/assets", { method: "POST", body: form }), storage);
    expect(uploadResponse.status).toBe(201);
    const uploadPayload = await uploadResponse.json() as { data: { asset: { path: string } } };
    const assetPath = uploadPayload.data.asset.path;
    const renameResponse = await apiAction(() => handleRenameAsset(new Request(`http://plinth.test/api/projects/api-assets/assets/${encodeURIComponent(assetPath.slice("assets/".length))}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "API screenshot" }) }), storage));
    expect(renameResponse.status).toBe(200);
    expect((await renameResponse.json() as { data: { asset: { name: string; fileName: string } } }).data.asset).toMatchObject({ name: "API screenshot", fileName: assetPath.slice("assets/".length) });
    const listResponse = await handleListAssets(new Request("http://plinth.test/api/projects/api-assets/assets"), storage);
    expect((await listResponse.json() as { data: { assets: unknown[] } }).data.assets).toHaveLength(1);
    const fileResponse = await handleGetAsset(new Request(`http://plinth.test/api/projects/api-assets/assets/${encodeURIComponent(assetPath.slice("assets/".length))}`), storage);
    expect(fileResponse.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await fileResponse.arrayBuffer()))).toEqual(Array.from(pngFixture(12, 8)));
    const deleteResponse = await apiAction(() => handleDeleteAsset(new Request(`http://plinth.test/api/projects/api-assets/assets/${encodeURIComponent(assetPath.slice("assets/".length))}`, { method: "DELETE" }), storage));
    expect(deleteResponse.status).toBe(200);
  });
});
