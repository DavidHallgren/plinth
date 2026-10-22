import { describe, expect, test } from "bun:test";
import { createDefaultProject, createDeckPreset, createScreenPreset } from "../src/lib/defaults";
import { APPLE_BEZEL_PRESETS } from "../src/devices/apple-bezel-presets";
import { DEVICE_PRESETS, deviceFrameKind, getDevicePreset } from "../src/devices/presets";
import { calculateDeviceScreenGeometry, calculateImageFitGeometry } from "../src/devices/geometry";
import { deviceFrameSource } from "../src/devices/frame-assets";
import { sceneReadiness } from "../src/canvas/export-readiness";
import { DeviceElementSchema, ProjectSchema, ScreenPresetSchema, ScreenSchema } from "../src/lib/schema";
import { buildExportPlan } from "../src/lib/export-validation";
import { APP_STORE_PRESETS } from "../src/scene/presets";
import { resolveScreen } from "../src/scene/selectors";
import { ownedElements } from "./helpers";

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
    expect(ownedElements(screen).map((element) => element.type)).toEqual(["device", "text", "shape"]);
  });

  test("centralizes the requested App Store sizes and creates editable gradient screens", () => {
    expect(APP_STORE_PRESETS.map((preset) => [preset.width, preset.height])).toEqual([
      [1320, 2868],
      [1290, 2796],
      [1284, 2778],
      [1242, 2208],
      [2064, 2752],
      [1398, 2034],
      [2034, 1398],
      [2007, 2853],
      [2853, 2007],
      ...APPLE_BEZEL_PRESETS.map((preset) => [preset.screenshotSize.width, preset.screenshotSize.height]),
      [3840, 1646],
      [3840, 2560],
    ]);
    const screen = createScreenPreset("iphone-6-9");
    expect(screen.background.type).toBe("linear-gradient");
    expect(ownedElements(screen).map((element) => element.name)).toContain("Headline");
    expect(ownedElements(screen).map((element) => element.name)).toContain("Subheadline");
    expect(ownedElements(screen).some((element) => element.type === "device")).toBe(true);
    expect(ownedElements(screen).some((element) => element.type === "shape")).toBe(true);
  });

  test("sizes seeded phone frames from the selected device preset aspect ratio", () => {
    const screen = createScreenPreset("iphone-6-9");
    const device = ownedElements(screen).find((element) => element.type === "device");
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
    const project = createDefaultProject("Readiness fixture");
    const firstScreen = project.decks[0]?.screens[0];
    if (!firstScreen) throw new Error("Missing readiness screen");
    expect(sceneReadiness(resolveScreen(project, firstScreen.id)).builtInImageSources).toHaveLength(1);
  });

  test("classifies frame selections consistently across canvas and image insertion", () => {
    for (const preset of DEVICE_PRESETS) {
      const expected = preset.id.startsWith("macbook") ? "laptop"
        : preset.id.includes("ipad") ? "tablet" : preset.id === "browser-window" ? "browser" : "phone";
      expect(deviceFrameKind(preset.id)).toBe(expected);
    }
    for (const preset of APP_STORE_PRESETS.filter((preset) => preset.platform === "Mac")) {
      expect(preset.note).toBe("Native screenshot size · landscape");
    }
  });

  test("accepts every registered canvas and frame preset in the persisted schema", () => {
    for (const preset of APP_STORE_PRESETS) expect(ScreenPresetSchema.parse(preset.id)).toBe(preset.id);
    expect(new Set(DeviceElementSchema.shape.preset.options)).toEqual(new Set(DEVICE_PRESETS.map((preset) => preset.id)));
    expect(ScreenPresetSchema.safeParse("iphone-duo-unknown").success).toBe(false);
    expect(DeviceElementSchema.shape.preset.safeParse("iphone-duo-unknown").success).toBe(false);
  });

  test.each([
    ["macbook-air-m5-13", 2560, 1664],
    ["macbook-air-m5-15", 2880, 1864],
    ["macbook-pro-m5-14", 3024, 1964],
    ["macbook-pro-m5-16", 3456, 2234],
    ["iphone-18-pro-max", 1320, 2868],
    ["iphone-18-pro-max-landscape", 2868, 1320],
    ["iphone-18-pro", 1206, 2622],
    ["iphone-18-pro-landscape", 2622, 1206],
    ["ipad-pro-m5-13", 2064, 2752],
    ["ipad-pro-m5-13-landscape", 2752, 2064],
    ["ipad-pro-m5-11", 1668, 2420],
    ["ipad-pro-m5-11-landscape", 2420, 1668],
    ["ipad-air-m4-13", 2048, 2732],
    ["ipad-air-m4-13-landscape", 2732, 2048],
    ["ipad-air-m4-11", 1640, 2360],
    ["ipad-air-m4-11-landscape", 2360, 1640],
    ["iphone-duo-outer", 1398, 2034],
    ["iphone-duo-outer-landscape", 2034, 1398],
    ["iphone-duo-inner", 2007, 2853],
    ["iphone-duo-inner-landscape", 2853, 2007],
  ] as const)("fits %s screenshots without cropping or padding beneath Apple's frame", (id, width, height) => {
    const deck = createDeckPreset(id);
    const project = createDefaultProject("Apple frame geometry");
    project.decks = [deck];
    expect(ProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const screen = resolveScreen(project, deck.screens[0]!.id);
    expect(screen).toMatchObject({ width, height });
    const device = screen.elements.find((element) => element.type === "device")!;
    expect(device).toMatchObject({ type: "device", preset: id, deviceId: id, frame: id.startsWith("macbook") ? "laptop" : id.startsWith("ipad") ? "tablet" : "phone" });
    expect(device.y + device.height).toBeLessThan(height * 0.84);
    const preset = getDevicePreset(id)!;
    // Persisted element dimensions use whole pixels, so starter placement can
    // round by half a pixel. The preset aperture itself has the exact ratio.
    expect(Math.abs(device.height - device.width / preset.aspectRatio)).toBeLessThanOrEqual(0.5);
    for (const scale of [0.25, 1, 3]) {
      const { screen: aperture } = calculateDeviceScreenGeometry(preset, 1000 * preset.aspectRatio * scale, 1000 * scale);
      expect(aperture.width / aperture.height).toBeCloseTo(width / height, 10);
      for (const fit of ["contain", "cover"] as const) {
        const fitted = calculateImageFitGeometry(width, height, aperture.width, aperture.height, fit);
        expect(fitted.x).toBeCloseTo(0, 8);
        expect(fitted.y).toBeCloseTo(0, 8);
        expect(fitted.width).toBeCloseTo(aperture.width, 8);
        expect(fitted.height).toBeCloseTo(aperture.height, 8);
      }
    }
    const frame = deviceFrameSource(id, preset.defaultFrameColor);
    expect(frame).toMatch(/\.png$/);
    expect(sceneReadiness(screen).builtInImageSources).toEqual([frame!]);
    expect(sceneReadiness({ ...screen, elements: screen.elements.map((element) => element.type === "device" ? { ...element, showCamera: false } : element) }).builtInImageSources).toEqual([frame!]);
    expect(buildExportPlan(project)[0]).toMatchObject({ width, height });
  });

  test.each(["iphone-duo-outer", "iphone-duo-inner"])("preserves %s aperture geometry in both orientations without a camera overlay", (id) => {
    const portraitPreset = getDevicePreset(id)!;
    const landscapePreset = getDevicePreset(`${id}-landscape`)!;
    const portrait = calculateDeviceScreenGeometry(portraitPreset, 600, 600 / portraitPreset.aspectRatio);
    const landscape = calculateDeviceScreenGeometry(landscapePreset, portrait.outer.height, portrait.outer.width);
    expect(landscape.screen.width).toBeCloseTo(portrait.screen.height);
    expect(landscape.screen.height).toBeCloseTo(portrait.screen.width);
    for (const geometry of [portrait, landscape]) {
      expect(geometry.cameraKind).toBe("none");
      expect(geometry.camera).toBeNull();
    }
  });

  test.each([
    ["app-store-header", 3840, 1646],
    ["app-store-search", 3840, 2560],
  ] as const)("creates %s as an opaque blank artwork canvas", (id, width, height) => {
    const deck = createDeckPreset(id);
    expect(deck).toMatchObject({ width, height });
    expect(deck.screens[0]).toMatchObject({ preset: id, layers: [], background: { type: "solid", color: "#10131a" } });
  });
});
