import { describe, expect, test } from "bun:test";
import { assertProjectSlug, slugify } from "../src/lib/ids";
import { createDefaultProject, createDocumentPreset } from "../src/lib/defaults";
import { CURRENT_SCHEMA_VERSION, DocumentSchema, SceneElementSchema } from "../src/lib/schema";

describe("project schema", () => {
  test("creates a serializable project with normalized discriminated elements", () => {
    const project = createDefaultProject("Schema fixture", { now: "2026-08-02T00:00:00.000Z" });
    const document = project.documents[0];

    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(document).toBeDefined();
    expect(document?.elements.map((element) => element.type)).toEqual(["device", "text", "shape"]);
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);

    for (const element of document?.elements ?? []) {
      expect(SceneElementSchema.parse(element)).toEqual(element);
    }
  });

  test("accepts the image branch without embedded binary data", () => {
    const document = createDocumentPreset("blank", { name: "Image fixture" });
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
      zIndex: 1,
      locked: false,
      visible: true,
      assetId: "asset_fixture",
      fit: "cover" as const,
      alt: "Fixture asset",
    };

    expect(DocumentSchema.parse({ ...document, elements: [image] }).elements[0]).toEqual(image);
    expect(JSON.stringify(image)).not.toContain("base64");
  });

  test("normalizes names into safe ids and slugs", () => {
    expect(slugify("  Résumé / Spring 2026  ")).toBe("resume-spring-2026");
    expect(assertProjectSlug("valid-project-2")).toBe("valid-project-2");
    expect(() => assertProjectSlug("../escape")).toThrow();
    expect(() => assertProjectSlug("Has Spaces")).toThrow();
  });
});
