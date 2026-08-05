import { describe, expect, test } from "bun:test";
import { assertProjectSlug, slugify } from "../src/lib/ids";
import { createDefaultProject, createScreenPreset } from "../src/lib/defaults";
import {
  CURRENT_SCHEMA_VERSION,
  DeckSchema,
  ProjectSchema,
  SceneElementSchema,
  ScreenSchema,
} from "../src/lib/schema";
import { ownedElements } from "./helpers";

describe("project schema", () => {
  test("creates a serializable project with fixed-size decks and normalized screens", () => {
    const project = createDefaultProject("Schema fixture", { now: "2026-08-02T00:00:00.000Z" });
    const deck = project.decks[0];
    const screen = deck?.screens[0];

    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(deck).toBeDefined();
    expect(screen).toBeDefined();
    expect(screen && Object.hasOwn(screen, "width")).toBe(false);
    expect(screen && Object.hasOwn(screen, "height")).toBe(false);
    expect(screen && ownedElements(screen).map((element) => element.type)).toEqual(["device", "text", "text", "shape"]);
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);

    if (!deck || !screen) throw new Error("Expected a starter deck and screen.");
    expect(DeckSchema.parse(deck)).toEqual(deck);
    expect(ScreenSchema.parse(screen)).toEqual(screen);
    for (const element of ownedElements(screen)) {
      expect(SceneElementSchema.parse(element)).toEqual(element);
    }
  });

  test("accepts image screens without embedded binary data", () => {
    const screen = createScreenPreset("blank", { name: "Image fixture" });
    const image = {
      id: "image_fixture",
      type: "image" as const,
      name: "Local asset",
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      assetPath: "assets/fixture.svg",
      fit: "cover" as const,
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 0,
      alt: "Fixture asset",
    };

    const parsed = ScreenSchema.parse({ ...screen, layers: [{ kind: "owned", element: image, overflow: false }] });
    expect(parsed.layers[0]).toEqual({ kind: "owned", element: image, overflow: false });
    expect(JSON.stringify(image)).not.toContain("base64");
  });

  test("accepts deterministic asset-backed screen backgrounds", () => {
    const screen = createScreenPreset("blank", { name: "Background fixture" });
    const background = {
      type: "asset" as const,
      assetPath: "assets/background.webp",
      fit: "cover" as const,
      position: { x: 0.25, y: 0.75 },
      blur: 18,
      overlayColor: "#182033",
      overlayOpacity: 0.35,
      texture: { type: "texture" as const, seed: 4_294_967_295, opacity: 0.08, scale: 3 },
    };

    expect(ScreenSchema.parse({ ...screen, background }).background).toEqual(background);
    expect(ScreenSchema.safeParse({ ...screen, background: { ...background, texture: { ...background.texture, seed: -1 } } }).success).toBe(false);
    expect(JSON.stringify(background)).not.toContain("data:image");
  });

  test("normalizes names into safe ids and slugs", () => {
    expect(slugify("  Résumé / Spring 2026  ")).toBe("resume-spring-2026");
    expect(assertProjectSlug("valid-project-2")).toBe("valid-project-2");
    expect(() => assertProjectSlug("../escape")).toThrow();
    expect(() => assertProjectSlug("Has Spaces")).toThrow();
  });

  test("rejects duplicate deck, screen, and asset identities with actionable paths", () => {
    const project = createDefaultProject("Identity fixture", { deckCount: 2, screenCount: 2 });
    const firstDeck = project.decks[0];
    const secondDeck = project.decks[1];
    const firstScreen = firstDeck?.screens[0];
    const secondScreen = secondDeck?.screens[0];
    if (!firstDeck || !secondDeck || !firstScreen || !secondScreen) throw new Error("Expected two decks with screens.");

    const duplicateDeck = ProjectSchema.safeParse({
      ...project,
      decks: [firstDeck, { ...secondDeck, id: firstDeck.id }],
    });
    expect(duplicateDeck.success).toBe(false);
    if (!duplicateDeck.success) {
      expect(duplicateDeck.error.issues[0]?.message).toContain("Duplicate deck id");
      expect(duplicateDeck.error.issues[0]?.path).toEqual(["decks", 1, "id"]);
    }

    const duplicateScreen = ProjectSchema.safeParse({
      ...project,
      decks: [firstDeck, { ...secondDeck, screens: [{ ...secondScreen, id: firstScreen.id }, ...secondDeck.screens.slice(1)] }],
    });
    expect(duplicateScreen.success).toBe(false);
    if (!duplicateScreen.success) {
      expect(duplicateScreen.error.issues[0]?.message).toContain("Duplicate screen id");
      expect(duplicateScreen.error.issues[0]?.path).toEqual(["decks", 1, "screens", 0, "id"]);
    }

    const duplicateSlug = ProjectSchema.safeParse({
      ...project,
      decks: [firstDeck, { ...secondDeck, screens: [{ ...secondScreen, slug: firstScreen.slug }, ...secondDeck.screens.slice(1)] }],
    });
    expect(duplicateSlug.success).toBe(false);
    if (!duplicateSlug.success) expect(duplicateSlug.error.issues[0]?.message).toContain("Duplicate screen slug");

    const duplicateExportSlug = ProjectSchema.safeParse({
      ...project,
      decks: [firstDeck, { ...secondDeck, screens: [{ ...secondScreen, exportSlug: firstScreen.exportSlug }, ...secondDeck.screens.slice(1)] }],
    });
    expect(duplicateExportSlug.success).toBe(false);
    if (!duplicateExportSlug.success) expect(duplicateExportSlug.error.issues[0]?.message).toContain("Duplicate screen export slug");

    const asset = {
      id: "asset_duplicate",
      kind: "image" as const,
      name: "Fixture",
      sourceFileName: "fixture.svg",
      path: "assets/fixture.svg",
      fileName: "fixture.svg",
      mimeType: "image/svg+xml" as const,
      width: 100,
      height: 100,
      byteSize: 10,
    };
    const duplicateAsset = ProjectSchema.safeParse({ ...project, assets: [asset, { ...asset }] });
    expect(duplicateAsset.success).toBe(false);
    if (!duplicateAsset.success) {
      expect(duplicateAsset.error.issues[0]?.message).toContain("Duplicate asset id");
      expect(duplicateAsset.error.issues[0]?.path).toEqual(["assets", 1, "id"]);
    }
  });

  test("rejects screen dimensions and invalid deck dimensions in persisted JSON", () => {
    const project = createDefaultProject("Dimension fixture");
    const deck = project.decks[0];
    const screen = deck?.screens[0];
    if (!deck || !screen) throw new Error("Expected a starter deck and screen.");

    const screenDimensions = ProjectSchema.safeParse({
      ...project,
      decks: [{ ...deck, screens: [{ ...screen, width: deck.width, height: deck.height }] }],
    });
    expect(screenDimensions.success).toBe(false);
    if (!screenDimensions.success) expect(screenDimensions.error.issues.some((issue) => issue.message.includes("width") || issue.message.includes("height"))).toBe(true);

    const invalidDeck = ProjectSchema.safeParse({ ...project, decks: [{ ...deck, width: 0 }] });
    expect(invalidDeck.success).toBe(false);
  });

  test("rejects scene element ids duplicated across screens", () => {
    const project = createDefaultProject("Element identity fixture", { deckCount: 2 });
    const deck = project.decks[0];
    const secondDeck = project.decks[1];
    const firstScreen = deck?.screens[0];
    const secondScreen = secondDeck?.screens[0];
    const firstElement = firstScreen && ownedElements(firstScreen)[0];
    const secondElement = secondScreen && ownedElements(secondScreen)[0];
    if (!deck || !firstScreen || !secondScreen || !firstElement || !secondElement) throw new Error("Expected two screens with elements.");

    const duplicateElement = ProjectSchema.safeParse({
      ...project,
      decks: [deck, {
        ...secondDeck,
        screens: [{
          ...secondScreen,
          layers: secondScreen.layers.map((layer) => layer.kind === "owned" && layer.element.id === secondElement.id
            ? { ...layer, element: { ...layer.element, id: firstElement.id } }
            : layer),
        }, ...secondDeck.screens.slice(1)],
      }],
    });
    expect(duplicateElement.success).toBe(false);
    if (!duplicateElement.success) {
      expect(duplicateElement.error.issues[0]?.message).toContain("Duplicate scene element id");
      expect(duplicateElement.error.issues[0]?.path).toEqual(["decks", 1, "screens", 0, "layers", 0, "element", "id"]);
    }
  });

  test("keeps the current schema strict while leaving legacy fields to the v6 migration", () => {
    const project = createDefaultProject("Strict schema fixture");
    const deck = project.decks[0];
    const screen = deck?.screens[0];
    const element = screen && ownedElements(screen)[0];
    if (!deck || !screen || !element) throw new Error("Expected a starter screen element.");

    const legacyProjection = ProjectSchema.safeParse({
      ...project,
      decks: [{
        ...deck,
        screens: [{
          ...screen,
          elements: ownedElements(screen),
          layers: screen.layers.map((layer) => layer.kind === "owned" && layer.element.id === element.id
            ? { ...layer, element: { ...layer.element, zIndex: 4 } }
            : layer),
        }],
      }],
    });
    expect(legacyProjection.success).toBe(false);
    if (!legacyProjection.success) {
      expect(legacyProjection.error.issues.some((issue) => "keys" in issue && issue.keys.includes("elements"))).toBe(true);
      expect(legacyProjection.error.issues.some((issue) => "keys" in issue && issue.keys.includes("zIndex"))).toBe(true);
    }
    expect(SceneElementSchema.safeParse({ ...element, zIndex: 4 }).success).toBe(false);
  });
});
