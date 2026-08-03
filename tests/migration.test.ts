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
});
