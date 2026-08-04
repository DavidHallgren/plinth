import { describe, expect, test } from "bun:test";
import { parseProject, migrateProject } from "../src/lib/migrations";
import { createDefaultProject } from "../src/lib/defaults";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/schema";

const timestamp = "2026-08-02T00:00:00.000Z";

function legacyDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "legacy-screen",
    name: "Legacy screen",
    slug: "legacy-screen",
    exportSlug: "legacy-screen",
    preset: "custom",
    width: 640,
    height: 480,
    background: { type: "solid", color: "#111111" },
    elements: [],
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("project migrations", () => {
  test("upgrades an unversioned legacy project to schema v6", () => {
    const migrated = parseProject({
      version: 0,
      id: "legacy_project",
      name: "Legacy project",
      slug: "legacy-project",
      documents: [{ title: "Old screen", elements: [] }],
    });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.name).toBe("Legacy project");
    expect(migrated.decks).toHaveLength(1);
    expect(migrated.decks[0]?.screens[0]?.name).toBe("Old screen");
    expect(migrated.decks[0]?.width).toBe(1320);
    expect(migrated.decks[0]?.screens[0] && Object.hasOwn(migrated.decks[0].screens[0], "width")).toBe(false);
    expect(migrated.settings.autosave).toBe(true);
  });

  test("groups v5 documents into fixed-size decks while preserving order and exact dimensions", () => {
    const migrated = parseProject({
      schemaVersion: 5,
      id: "v5-project",
      name: "V5 project",
      slug: "v5-project",
      settings: { autosave: true, autosaveDelayMs: 800, defaultDocumentPreset: "iphone-6-9", grid: { enabled: true, size: 8, snap: true } },
      background: { type: "solid", color: "#10131a" },
      assets: [],
      documents: [
        legacyDocument({ id: "screen-a", slug: "same", exportSlug: "same", width: 400, height: 300 }),
        legacyDocument({ id: "screen-b", slug: "same", exportSlug: "same", width: 400, height: 300 }),
        legacyDocument({ id: "screen-c", slug: "tablet", exportSlug: "tablet", width: 800, height: 600 }),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(migrated.decks.map((deck) => [deck.width, deck.height])).toEqual([[400, 300], [800, 600]]);
    expect(migrated.decks[0]?.screens.map((screen) => screen.id)).toEqual(["screen-a", "screen-b"]);
    expect(migrated.decks[0]?.screens.map((screen) => screen.slug)).toEqual(["same", "same-2"]);
    expect(migrated.decks[0]?.screens.map((screen) => screen.exportSlug)).toEqual(["same", "same-2"]);
    expect(migrated.decks.flatMap((deck) => deck.screens).every((screen) => !Object.hasOwn(screen, "width") && !Object.hasOwn(screen, "height"))).toBe(true);
    expect(migrated.settings.defaultScreenPreset).toBe("iphone-6-9");
  });

  test("rejects a project from a future schema version", () => {
    expect(() => migrateProject({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(/newer/);
  });

  test("runs migrated data through duplicate identity validation", () => {
    expect(() => parseProject({
      version: 0,
      id: "legacy_project",
      name: "Legacy duplicate",
      slug: "legacy-duplicate",
      documents: [
        { id: "duplicate_screen", name: "First", elements: [] },
        { id: "duplicate_screen", name: "Second", elements: [] },
      ],
    })).toThrow(/Duplicate screen id/);
  });

  test("converts the v1 gradient shape and fills new text defaults", () => {
    const migrated = parseProject({
      schemaVersion: 1,
      id: "legacy_gradient",
      name: "Legacy gradient",
      slug: "legacy-gradient",
      documents: [legacyDocument({
        id: "legacy-screen-gradient",
        name: "Legacy frame",
        preset: "browser",
        width: 640,
        height: 480,
        background: { type: "gradient", from: "#111111", to: "#999999", angle: 90 },
        elements: [{
          id: "legacy_headline",
          type: "text",
          name: "Headline",
          x: 20,
          y: 20,
          width: 400,
          height: 80,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          locked: false,
          visible: true,
          text: "Legacy headline",
          style: {
            fontFamily: "Arial",
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: 0,
            color: "#ffffff",
            align: "left",
          },
        }],
      })],
      assets: [],
    });

    const screen = migrated.decks[0]?.screens[0];
    expect(screen?.preset).toBe("custom");
    expect(screen?.background.type).toBe("linear-gradient");
    expect(screen?.elements[0]).toMatchObject({ type: "text", shadow: null });
    expect(screen?.elements[0]?.type === "text" && screen.elements[0].style).toMatchObject({ italic: false, autoHeight: true });
  });

  test("migrates v2 asset ids and device placeholders to canonical paths and presets", () => {
    const migrated = parseProject({
      schemaVersion: 2,
      id: "phase-two-project",
      name: "Phase 2 project",
      slug: "phase-two-project",
      assets: [{ id: "asset_old", kind: "image", fileName: "screen.svg", mimeType: "image/svg+xml", width: 100, height: 200, byteSize: 20 }],
      documents: [legacyDocument({
        id: "phase-two-screen",
        name: "Phase 2 screen",
        width: 400,
        height: 800,
        elements: [{
          id: "old-device",
          type: "device",
          x: 0,
          y: 0,
          width: 200,
          height: 400,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          locked: false,
          visible: true,
          name: "Old phone",
          deviceId: "iphone-placeholder",
          deviceName: "iPhone placeholder",
          frame: "phone",
          frameColor: "#20242d",
          screenColor: "#f6f7fb",
          assetId: "asset_old",
        }],
      })],
      settings: { autosave: true, autosaveDelayMs: 800, defaultDocumentPreset: "iphone-6-9", grid: { enabled: true, size: 8, snap: true } },
      background: { type: "solid", color: "#10131a" },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(migrated.assets[0]?.path).toBe("assets/screen.svg");
    expect(migrated.decks[0]?.screens[0]?.elements[0]).toMatchObject({ type: "device", preset: "iphone-17-pro-max", screenshotPath: "assets/screen.svg" });
  });

  test("adds export slugs and the configured export directory when loading v3/v4", () => {
    const base = {
      id: "v3-export-project",
      name: "V3 export project",
      slug: "v3-export-project",
      description: "Migration fixture",
      assets: [],
      documents: [legacyDocument({ id: "v3-screen", slug: "display-slug", exportSlug: undefined, name: "Display name with spaces", width: 320, height: 240 })],
      settings: { autosave: true, autosaveDelayMs: 800, defaultDocumentPreset: "iphone-6-9", grid: { enabled: true, size: 8, snap: true } },
      background: { type: "solid", color: "#10131a" },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const migratedV3 = parseProject({ ...base, schemaVersion: 3 });
    expect(migratedV3.decks[0]?.screens[0]?.exportSlug).toBe("display-slug");
    expect(migratedV3.settings.exportDirectory).toBeNull();

    const migratedV4 = parseProject({ ...base, schemaVersion: 4, id: "v4-export-project", slug: "v4-export-project" });
    expect(migratedV4.settings.exportDirectory).toBeNull();
  });

  test("canonicalizes persisted layer order and text geometry in schema v6", () => {
    const project = createDefaultProject("Layer order project", { now: timestamp });
    const deck = project.decks[0];
    const screen = deck?.screens[0];
    if (!deck || !screen) throw new Error("Missing starter screen.");
    const migrated = parseProject({
      ...project,
      decks: [{
        ...deck,
        screens: [{
          ...screen,
          elements: screen.elements.map((element, index) => ({ ...element, zIndex: index === 0 ? 9 : index === 1 ? 2 : index + 10 })),
        }],
      }],
    });
    expect(migrated.decks[0]?.screens[0]?.elements.map((element) => element.zIndex)).toEqual(
      migrated.decks[0]?.screens[0]?.elements.map((_element, index) => index),
    );
  });
});
