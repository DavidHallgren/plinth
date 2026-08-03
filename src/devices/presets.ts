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
  screenInsets: { left: number; top: number; right: number; bottom: number };
  camera: DeviceCameraDefinition;
  colors: readonly string[];
  defaultFrameColor: string;
  defaultScreenColor: string;
  source: string;
};

// Apple publishes the 17 Pro/Pro Max physical dimensions, display resolutions,
// rounded display note, Dynamic Island, and finishes in its current specs. The
// exact pixel inset and camera silhouette below are normalized composition
// geometry so Plinth can render a clean, editable vector frame without bundling
// Apple artwork. See the official references in README.md.
export const DEVICE_PRESETS = [
  {
    id: "iphone-17-pro-max",
    label: "iPhone 17 Pro Max",
    category: "iPhone",
    aspectRatio: 78 / 163.4,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 0.025, top: 0.018, right: 0.025, bottom: 0.018 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#d9dce2", "#f17d39", "#182d55"],
    defaultFrameColor: "#182d55",
    defaultScreenColor: "#f7f8fc",
    source: "Apple iPhone 17 Pro and iPhone 17 Pro Max technical specifications",
  },
  {
    id: "iphone-17-pro",
    label: "iPhone 17 Pro",
    category: "iPhone",
    aspectRatio: 71.9 / 150,
    outerRadius: 0.14,
    screenRadius: 0.115,
    screenInsets: { left: 0.025, top: 0.018, right: 0.025, bottom: 0.018 },
    camera: { kind: "dynamic-island", x: 0.5, y: 0.047, width: 0.245, height: 0.031 },
    colors: ["#d9dce2", "#f17d39", "#182d55"],
    defaultFrameColor: "#d9dce2",
    defaultScreenColor: "#f7f8fc",
    source: "Apple iPhone 17 Pro and iPhone 17 Pro Max technical specifications",
  },
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
