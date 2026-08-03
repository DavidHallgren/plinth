import { describe, expect, test } from "bun:test";
import { assertProjectSlug, slugify } from "../src/lib/ids";
import { createDefaultProject, createDocumentPreset } from "../src/lib/defaults";
import { CURRENT_SCHEMA_VERSION, DocumentSchema, ProjectSchema, SceneElementSchema } from "../src/lib/schema";

describe("project schema", () => {
  test("creates a serializable project with normalized discriminated elements", () => {
    const project = createDefaultProject("Schema fixture", { now: "2026-08-02T00:00:00.000Z" });
    const document = project.documents[0];

    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(document).toBeDefined();
    expect(document?.elements.map((element) => element.type)).toEqual(["device", "text", "text", "shape"]);
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

  test("rejects duplicate document and asset ids with actionable paths", () => {
    const project = createDefaultProject("Identity fixture", { documentCount: 2 });
    const firstDocument = project.documents[0];
    const secondDocument = project.documents[1];
    if (!firstDocument || !secondDocument) throw new Error("Expected two documents.");

    const duplicateDocument = ProjectSchema.safeParse({
      ...project,
      documents: [firstDocument, { ...secondDocument, id: firstDocument.id }],
    });
    expect(duplicateDocument.success).toBe(false);
    if (!duplicateDocument.success) {
      expect(duplicateDocument.error.issues[0]?.message).toContain("Duplicate document id");
      expect(duplicateDocument.error.issues[0]?.path).toEqual(["documents", 1, "id"]);
    }

    const asset = {
      id: "asset_duplicate",
      kind: "image" as const,
      fileName: "fixture.svg",
      mimeType: "image/svg+xml",
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

  test("rejects scene element ids duplicated across documents", () => {
    const project = createDefaultProject("Element identity fixture");
    const firstDocument = project.documents[0];
    if (!firstDocument?.elements[0]) throw new Error("Expected a foundation element.");
    const secondDocument = createDocumentPreset("browser", { name: "Second document" });
    const secondElement = secondDocument.elements[0];
    if (!secondElement) throw new Error("Expected a second foundation element.");

    const duplicateElement = ProjectSchema.safeParse({
      ...project,
      documents: [
        firstDocument,
        { ...secondDocument, elements: [{ ...secondElement, id: firstDocument.elements[0].id }, ...secondDocument.elements.slice(1)] },
      ],
    });
    expect(duplicateElement.success).toBe(false);
    if (!duplicateElement.success) {
      expect(duplicateElement.error.issues[0]?.message).toContain("Duplicate scene element id");
      expect(duplicateElement.error.issues[0]?.path).toEqual(["documents", 1, "elements", 0, "id"]);
    }
  });
});
