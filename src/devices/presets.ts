import { APPLE_BEZEL_PRESETS } from "./apple-bezel-presets";

export type DeviceCameraDefinition = {
  kind: "dynamic-island" | "camera" | "none";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DevicePresetDefinition = {
  id: string;
  label: string;
  category: "iPhone" | "iPad" | "Generic" | "Compatibility";
  aspectRatio: number;
  outerRadius: number;
  screenRadius: number;
  screenCornerRadii?: readonly [number, number, number, number];
  screenshotSize?: { width: number; height: number };
  screenInsets: { left: number; top: number; right: number; bottom: number };
  camera: DeviceCameraDefinition;
  colors: readonly string[];
  frameFinishes?: readonly { label: string; color: string }[];
  defaultFrameColor: string;
  defaultScreenColor: string;
  source: string;
};

// Measured from Apple's PNGs: folded frames have 88px horizontal / 80px
// vertical margins in portrait; unfolded frames have 120px on every side.
// Screenshot clipping stays beneath the opaque bezel, which supplies the
// exact asymmetric corner shape. Radii are TL, TR, BR, BL / screen short side.
function duoPreset<const Id extends string>(id: Id, label: string, screenWidth: number, screenHeight: number, outer: boolean) {
  const shortSide = Math.min(screenWidth, screenHeight);
  const landscape = screenWidth > screenHeight;
  const insetX = outer ? (landscape ? 80 : 88) : 120;
  const insetY = outer ? (landscape ? 88 : 80) : 120;
  const width = screenWidth + insetX * 2;
  const height = screenHeight + insetY * 2;
  const radius = 100 / shortSide;
  return {
    id,
    label,
    category: "iPhone",
    aspectRatio: width / height,
    outerRadius: outer ? 0.085 : 0.055,
    screenRadius: radius,
    ...(outer ? { screenCornerRadii: landscape ? [radius, radius, 0, 0] as const : [0, radius, radius, 0] as const } : {}),
    screenInsets: { left: insetX / width, top: insetY / height, right: insetX / width, bottom: insetY / height },
    // The PNG provides the hardware details; never add a synthetic camera.
    camera: { kind: "none", x: 0, y: 0, width: 0, height: 0 },
    colors: ["#242833", "#eeeeeb"],
    frameFinishes: [{ label: "Night Sky", color: "#242833" }, { label: "Star White", color: "#eeeeeb" }],
    defaultFrameColor: "#242833",
    defaultScreenColor: "#f7f8fc",
    source: "Official Apple iPhone Duo product bezels: https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-Duo.dmg",
  } as const satisfies DevicePresetDefinition;
}

// Apple PNG frames and generic vector presets share this geometry.
export const DEVICE_PRESETS = [
  ...APPLE_BEZEL_PRESETS,
  {
    id: "iphone-17-pro-max",
    label: "iPhone 17 Pro Max",
    category: "iPhone",
    aspectRatio: 1470 / 3000,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 75 / 1470, top: 66 / 3000, right: 75 / 1470, bottom: 66 / 3000 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#d9dce2", "#f17d39", "#182d55"],
    frameFinishes: [
      { label: "Deep Blue", color: "#182d55" },
      { label: "Cosmic Orange", color: "#f17d39" },
      { label: "Silver", color: "#d9dce2" },
    ],
    defaultFrameColor: "#182d55",
    defaultScreenColor: "#f7f8fc",
    source: "Apple iPhone 17 Pro and iPhone 17 Pro Max technical specifications",
  },
  {
    id: "iphone-17-pro",
    label: "iPhone 17 Pro",
    category: "iPhone",
    aspectRatio: 1350 / 2760,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 72 / 1350, top: 69 / 2760, right: 72 / 1350, bottom: 69 / 2760 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#d9dce2", "#f17d39", "#182d55"],
    frameFinishes: [
      { label: "Silver", color: "#d9dce2" },
      { label: "Cosmic Orange", color: "#f17d39" },
      { label: "Deep Blue", color: "#182d55" },
    ],
    defaultFrameColor: "#d9dce2",
    defaultScreenColor: "#f7f8fc",
    source: "Apple iPhone 17 Pro and iPhone 17 Pro Max technical specifications",
  },
  {
    id: "iphone-17",
    label: "iPhone 17",
    category: "iPhone",
    aspectRatio: 1350 / 2760,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 72 / 1350, top: 69 / 2760, right: 72 / 1350, bottom: 69 / 2760 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#202124", "#d8d5e8", "#b9ccd7", "#b8c4aa", "#f1f1ef"],
    frameFinishes: [
      { label: "Black", color: "#202124" },
      { label: "Lavender", color: "#d8d5e8" },
      { label: "Mist Blue", color: "#b9ccd7" },
      { label: "Sage", color: "#b8c4aa" },
      { label: "White", color: "#f1f1ef" },
    ],
    defaultFrameColor: "#202124",
    defaultScreenColor: "#f7f8fc",
    source: "Official Apple iPhone 17 frame artwork",
  },
  {
    id: "iphone-air",
    label: "iPhone Air",
    category: "iPhone",
    aspectRatio: 1380 / 2880,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 60 / 1380, top: 72 / 2880, right: 60 / 1380, bottom: 72 / 2880 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#f1eee8", "#d8c7a8", "#b9cbd5", "#34343a"],
    frameFinishes: [
      { label: "Cloud White", color: "#f1eee8" },
      { label: "Light Gold", color: "#d8c7a8" },
      { label: "Sky Blue", color: "#b9cbd5" },
      { label: "Space Black", color: "#34343a" },
    ],
    defaultFrameColor: "#34343a",
    defaultScreenColor: "#f7f8fc",
    source: "Official Apple iPhone Air frame artwork",
  },
  duoPreset("iphone-duo-outer", "iPhone Duo · outer (folded)", 1398, 2034, true),
  duoPreset("iphone-duo-outer-landscape", "iPhone Duo · outer (folded, landscape)", 2034, 1398, true),
  duoPreset("iphone-duo-inner", "iPhone Duo · inner (unfolded)", 2007, 2853, false),
  duoPreset("iphone-duo-inner-landscape", "iPhone Duo · inner (unfolded, landscape)", 2853, 2007, false),
  {
    id: "generic-modern-iphone",
    label: "Generic modern iPhone",
    category: "Generic",
    aspectRatio: 9 / 19.5,
    outerRadius: 0.13,
    screenRadius: 0.105,
    screenInsets: { left: 0.027, top: 0.021, right: 0.027, bottom: 0.021 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.05, width: 0.235, height: 0.032 },
    colors: ["#20242d", "#d9dce2", "#1b345d"],
    defaultFrameColor: "#20242d",
    defaultScreenColor: "#f7f8fc",
    source: "Normalized modern iPhone composition preset",
  },
  {
    id: "generic-modern-ipad",
    label: "Generic modern iPad",
    category: "Generic",
    aspectRatio: 3 / 4,
    outerRadius: 0.08,
    screenRadius: 0.065,
    screenInsets: { left: 0.022, top: 0.022, right: 0.022, bottom: 0.022 },
    camera: { kind: "camera", x: 0.5, y: 0.032, width: 0.012, height: 0.012 },
    colors: ["#242833", "#c6cbd5", "#1b1e25"],
    defaultFrameColor: "#242833",
    defaultScreenColor: "#f6f7fb",
    source: "Normalized modern iPad composition preset",
  },
  {
    id: "browser-window",
    label: "Browser window (compatibility)",
    category: "Compatibility",
    aspectRatio: 16 / 10,
    outerRadius: 0.04,
    screenRadius: 0.02,
    screenInsets: { left: 0.022, top: 0.075, right: 0.022, bottom: 0.022 },
    camera: { kind: "none", x: 0, y: 0, width: 0, height: 0 },
    colors: ["#242934"],
    defaultFrameColor: "#242934",
    defaultScreenColor: "#f6f7fb",
    source: "Plinth Phase 2 compatibility preset",
  },
] as const satisfies readonly DevicePresetDefinition[];

export type DevicePresetId = (typeof DEVICE_PRESETS)[number]["id"];

export function getDevicePreset(id: string): DevicePresetDefinition | undefined {
  return DEVICE_PRESETS.find((preset) => preset.id === id);
}

export function isDevicePreset(id: string): id is DevicePresetId {
  return DEVICE_PRESETS.some((preset) => preset.id === id);
}

export const EDITABLE_DEVICE_PRESETS = DEVICE_PRESETS.filter((preset) => preset.category !== "Compatibility");
