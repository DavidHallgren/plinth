import { describe, expect, test } from "bun:test";
import { parseProject, migrateProject } from "../src/lib/migrations";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/schema";

describe("project migrations", () => {
  test("upgrades an unversioned legacy project to the current schema", () => {
    const migrated = parseProject({
      version: 0,
      id: "legacy_project",
      name: "Legacy project",
      slug: "legacy-project",
      documents: [{ title: "Old document", elements: [] }],
    });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.name).toBe("Legacy project");
    expect(migrated.documents).toHaveLength(1);
    expect(migrated.documents[0]?.name).toBe("Old document");
    expect(migrated.settings.autosave).toBe(true);
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
        { id: "duplicate_document", name: "First", elements: [] },
        { id: "duplicate_document", name: "Second", elements: [] },
      ],
    })).toThrow(/Duplicate document id/);
  });

  test("converts the v1 gradient shape and fills new text defaults", () => {
    const migrated = parseProject({
      schemaVersion: 1,
      id: "legacy_gradient",
      name: "Legacy gradient",
      slug: "legacy-gradient",
      documents: [{
        id: "legacy_document",
        name: "Legacy frame",
        slug: "legacy-frame",
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
        notes: "",
      }],
      assets: [],
    });

    expect(migrated.documents[0]?.preset).toBe("custom");
    expect(migrated.documents[0]?.background.type).toBe("linear-gradient");
    expect(migrated.documents[0]?.elements[0]).toMatchObject({ type: "text", shadow: null });
    expect(migrated.documents[0]?.elements[0]?.type === "text" && migrated.documents[0].elements[0].style).toMatchObject({ italic: false, autoHeight: true });
  });

  test("migrates the Phase 2 asset id and device placeholder to canonical v3 paths and presets", () => {
    const migrated = parseProject({
      schemaVersion: 2,
      id: "phase-two-project",
      name: "Phase 2 project",
      slug: "phase-two-project",
      assets: [{ id: "asset_old", kind: "image", fileName: "screen.svg", mimeType: "image/svg+xml", width: 100, height: 200, byteSize: 20 }],
      documents: [{
        id: "phase-two-document",
        name: "Phase 2 document",
        slug: "phase-two-document",
        preset: "custom",
        width: 400,
        height: 800,
        background: { type: "solid", color: "#111111" },
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
        notes: "",
      }],
      settings: { autosave: true, autosaveDelayMs: 800, defaultDocumentPreset: "iphone-6-9", grid: { enabled: true, size: 8, snap: true } },
      background: { type: "solid", color: "#10131a" },
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.assets[0]?.path).toBe("assets/screen.svg");
    expect(migrated.documents[0]?.elements[0]).toMatchObject({ type: "device", preset: "iphone-17-pro-max", screenshotPath: "assets/screen.svg" });
  });

  test("adds an explicit export filename stem when loading a schema v3 project", () => {
    const migrated = parseProject({
      schemaVersion: 3,
      id: "v3-export-project",
      name: "V3 export project",
      slug: "v3-export-project",
      description: "Migration fixture",
      assets: [],
      documents: [{
        id: "v3-document",
        slug: "display-slug",
        name: "Display name with spaces",
        preset: "custom",
        width: 320,
        height: 240,
        background: { type: "solid", color: "#111111" },
        elements: [],
        notes: "",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      }],
      settings: { autosave: true, autosaveDelayMs: 800, defaultDocumentPreset: "iphone-6-9", grid: { enabled: true, size: 8, snap: true } },
      background: { type: "solid", color: "#10131a" },
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.documents[0]?.exportSlug).toBe("display-slug");
  });
});
