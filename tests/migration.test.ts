import { describe, expect, test } from "bun:test";
import { parseProject, migrateProject } from "../src/lib/migrations";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/schema";

describe("project migrations", () => {
  test("upgrades an unversioned legacy project to schema v1", () => {
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
});
