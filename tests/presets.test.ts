import { describe, expect, test } from "bun:test";
import { createDeckPreset, createScreenPreset } from "../src/lib/defaults";
import { getDevicePreset } from "../src/devices/presets";
import { deviceFrameSource } from "../src/devices/frame-assets";
import { sceneReadiness } from "../src/canvas/export-readiness";
import { ScreenSchema } from "../src/lib/schema";
import { APP_STORE_PRESETS } from "../src/scene/presets";

describe("deck and screen presets", () => {
  test("creates valid screens without persisting dimensions", () => {
    for (const preset of ["blank", "browser", "phone", "social"] as const) {
      const screen = createScreenPreset(preset, { name: `${preset} fixture` });
      expect(ScreenSchema.parse(screen)).toEqual(screen);
      expect(screen.preset).toBe(preset);
      expect(Object.hasOwn(screen, "width")).toBe(false);
      expect(Object.hasOwn(screen, "height")).toBe(false);
    }
  });

  test("creates fixed-size decks and screens inherit their containing dimensions", () => {
    const deck = createDeckPreset("iphone-6-9", { name: "Phone deck" });
    expect(deck.width).toBe(1320);
    expect(deck.height).toBe(2868);
    expect(deck.screens[0]?.preset).toBe("iphone-6-9");
    expect(Object.hasOwn(deck.screens[0] ?? {}, "width")).toBe(false);
    expect(Object.hasOwn(deck.screens[0] ?? {}, "height")).toBe(false);
  });

  test("browser preset contains the normalized foundation elements", () => {
    const screen = createScreenPreset("browser");
    expect(screen.elements.map((element) => element.type)).toEqual(["device", "shape", "text"]);
  });

  test("centralizes the requested App Store sizes and creates editable gradient screens", () => {
    expect(APP_STORE_PRESETS.map((preset) => [preset.width, preset.height])).toEqual([
      [1320, 2868],
      [1290, 2796],
      [1284, 2778],
      [1242, 2208],
      [2064, 2752],
    ]);
    const screen = createScreenPreset("iphone-6-9");
    expect(screen.background.type).toBe("linear-gradient");
    expect(screen.elements.map((element) => element.name)).toContain("Headline");
    expect(screen.elements.map((element) => element.name)).toContain("Subheadline");
    expect(screen.elements.some((element) => element.type === "device")).toBe(true);
    expect(screen.elements.some((element) => element.type === "shape")).toBe(true);
  });

  test("sizes seeded phone frames from the selected device preset aspect ratio", () => {
    const screen = createScreenPreset("iphone-6-9");
    const device = screen.elements.find((element) => element.type === "device");
    const preset = getDevicePreset("iphone-17-pro-max");
    expect(device?.type).toBe("device");
    expect(preset).toBeDefined();
    expect((device?.width ?? 0) / (device?.height ?? 1)).toBeCloseTo(preset?.aspectRatio ?? 0, 2);
  });

  test("maps official iPhone presets and finishes to bundled frame artwork", () => {
    for (const presetId of ["iphone-17-pro-max", "iphone-17-pro", "iphone-17", "iphone-air"] as const) {
      const preset = getDevicePreset(presetId);
      expect(preset?.frameFinishes?.length).toBeGreaterThan(0);
      for (const finish of preset?.frameFinishes ?? []) {
        expect(deviceFrameSource(presetId, finish.color)).toMatch(/\.png$/);
      }
    }
    expect(deviceFrameSource("generic-modern-iphone", "#20242d")).toBeNull();
    expect(sceneReadiness(createScreenPreset("iphone-6-9")).builtInImageSources).toHaveLength(1);
  });
});
