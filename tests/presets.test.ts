import { describe, expect, test } from "bun:test";
import { createDocumentPreset } from "../src/lib/defaults";
import { DocumentSchema } from "../src/lib/schema";

describe("document presets", () => {
  test("creates all Phase 1 presets as valid documents", () => {
    for (const preset of ["blank", "browser", "phone", "social"] as const) {
      const document = createDocumentPreset(preset, { name: `${preset} fixture` });
      expect(DocumentSchema.parse(document)).toEqual(document);
      expect(document.preset).toBe(preset);
      expect(document.width).toBeGreaterThan(0);
      expect(document.height).toBeGreaterThan(0);
    }
  });

  test("browser preset contains the normalized foundation elements", () => {
    const document = createDocumentPreset("browser");
    expect(document.elements.map((element) => element.type)).toEqual(["device", "text", "shape"]);
  });
});
