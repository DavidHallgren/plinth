import { describe, expect, test } from "bun:test";
import { createDocumentPreset } from "../src/lib/defaults";
import { getDevicePreset } from "../src/devices/presets";
import { DocumentSchema } from "../src/lib/schema";
import { APP_STORE_PRESETS } from "../src/scene/presets";

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

  test("centralizes the requested App Store sizes and creates editable gradient scenes", () => {
    expect(APP_STORE_PRESETS.map((preset) => [preset.width, preset.height])).toEqual([
      [1320, 2868],
      [1290, 2796],
      [1284, 2778],
      [1242, 2208],
      [2064, 2752],
    ]);
    const document = createDocumentPreset("iphone-6-9");
    expect(document.background.type).toBe("linear-gradient");
    expect(document.elements.map((element) => element.name)).toContain("Headline");
    expect(document.elements.map((element) => element.name)).toContain("Subheadline");
    expect(document.elements.some((element) => element.type === "device")).toBe(true);
    expect(document.elements.some((element) => element.type === "shape")).toBe(true);
  });

  test("sizes seeded phone frames from the selected device preset aspect ratio", () => {
    const document = createDocumentPreset("iphone-6-9");
    const device = document.elements.find((element) => element.type === "device");
    const preset = getDevicePreset("iphone-17-pro-max");
    expect(device?.type).toBe("device");
    expect(preset).toBeDefined();
    expect((device?.width ?? 0) / (device?.height ?? 1)).toBeCloseTo(preset?.aspectRatio ?? 0, 2);
  });
});
