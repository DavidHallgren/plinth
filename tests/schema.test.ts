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
    expect(screen?.elements.map((element) => element.type)).toEqual(["shape", "device", "text", "text"]);
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);

    if (!deck || !screen) throw new Error("Expected a starter deck and screen.");
    expect(DeckSchema.parse(deck)).toEqual(deck);
    expect(ScreenSchema.parse(screen)).toEqual(screen);
    for (const element of screen.elements) {
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
      zIndex: 0,
      locked: false,
      visible: true,
      assetPath: "assets/fixture.svg",
      fit: "cover" as const,
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 0,
      alt: "Fixture asset",
    };

    expect(ScreenSchema.parse({ ...screen, elements: [image] }).elements[0]).toEqual(image);
    expect(JSON.stringify(image)).not.toContain("base64");
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
    const firstElement = firstScreen?.elements[0];
    const secondElement = secondScreen?.elements[0];
    if (!deck || !firstScreen || !secondScreen || !firstElement || !secondElement) throw new Error("Expected two screens with elements.");

    const duplicateElement = ProjectSchema.safeParse({
      ...project,
      decks: [deck, { ...secondDeck, screens: [{ ...secondScreen, elements: [{ ...secondElement, id: firstElement.id }, ...secondScreen.elements.slice(1)] }] }],
    });
    expect(duplicateElement.success).toBe(false);
    if (!duplicateElement.success) {
      expect(duplicateElement.error.issues[0]?.message).toContain("Duplicate scene element id");
      expect(duplicateElement.error.issues[0]?.path).toEqual(["decks", 1, "screens", 0, "elements", 0, "id"]);
    }
  });
});
