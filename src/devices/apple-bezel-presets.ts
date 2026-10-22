import type { DevicePresetDefinition } from "./presets";

const IPHONE_18_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-18.dmg";
const IPAD_PRO_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Pro-%28M5%29.dmg";
const IPAD_AIR_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Air-%28M4%29.dmg";

const IPHONE_18_FINISHES = [
  { label: "Black", color: "#252629" },
  { label: "Burgundy", color: "#6d263e" },
  { label: "Glacier", color: "#b9cbd2" },
  { label: "Silver", color: "#dedede" },
] as const;
const IPAD_PRO_FINISHES = [
  { label: "Space Black", color: "#2e2e30" },
  { label: "Silver", color: "#e3e4e5" },
] as const;
const IPAD_AIR_FINISHES = [
  { label: "Space Gray", color: "#8c8e91" },
  { label: "Blue", color: "#a8bdc4" },
  { label: "Purple", color: "#b8b2c5" },
  { label: "Starlight", color: "#e4dbce" },
] as const;

// Native PNG bounds and display apertures are measured independently for
// each orientation. Clip curves stay beneath the artwork's opaque bezel.
function bezelPreset<const Id extends string>(
  id: Id, label: string, category: "iPhone" | "iPad",
  frame: readonly [number, number], aperture: readonly [number, number, number, number],
  clipRadius: number, finishes: readonly [{ label: string; color: string }, ...{ label: string; color: string }[]], source: string,
) {
  const [width, height] = frame;
  const [x, y, screenWidth, screenHeight] = aperture;
  return {
    id, label, category,
    aspectRatio: width / height,
    outerRadius: category === "iPad" ? 0.05 : 0.14,
    screenRadius: clipRadius / Math.min(screenWidth, screenHeight),
    screenInsets: { left: x / width, top: y / height, right: (width - x - screenWidth) / width, bottom: (height - y - screenHeight) / height },
    screenshotSize: { width: screenWidth, height: screenHeight },
    // All hardware details are in the PNG; no synthetic camera is added.
    camera: { kind: "none", x: 0, y: 0, width: 0, height: 0 },
    colors: finishes.map((finish) => finish.color),
    frameFinishes: finishes,
    defaultFrameColor: finishes[0].color,
    defaultScreenColor: "#f7f8fc",
    source,
  } as const satisfies DevicePresetDefinition;
}

export const APPLE_BEZEL_PRESETS = [
  bezelPreset("iphone-18-pro-max", "iPhone 18 Pro Max", "iPhone", [1470, 3000], [75, 66, 1320, 2868], 150, IPHONE_18_FINISHES, IPHONE_18_SOURCE),
  // Apple's landscape aperture is shifted one pixel relative to a simple rotation.
  bezelPreset("iphone-18-pro-max-landscape", "iPhone 18 Pro Max · landscape", "iPhone", [3000, 1470], [66, 76, 2868, 1320], 150, IPHONE_18_FINISHES, IPHONE_18_SOURCE),
  bezelPreset("iphone-18-pro", "iPhone 18 Pro", "iPhone", [1350, 2760], [72, 69, 1206, 2622], 150, IPHONE_18_FINISHES, IPHONE_18_SOURCE),
  bezelPreset("iphone-18-pro-landscape", "iPhone 18 Pro · landscape", "iPhone", [2760, 1350], [69, 72, 2622, 1206], 150, IPHONE_18_FINISHES, IPHONE_18_SOURCE),
  bezelPreset("ipad-pro-m5-13", "iPad Pro 13″ (M5)", "iPad", [2300, 3000], [118, 124, 2064, 2752], 40, IPAD_PRO_FINISHES, IPAD_PRO_SOURCE),
  bezelPreset("ipad-pro-m5-13-landscape", "iPad Pro 13″ (M5) · landscape", "iPad", [3000, 2300], [124, 118, 2752, 2064], 40, IPAD_PRO_FINISHES, IPAD_PRO_SOURCE),
  bezelPreset("ipad-pro-m5-11", "iPad Pro 11″ (M5)", "iPad", [1880, 2640], [106, 110, 1668, 2420], 40, IPAD_PRO_FINISHES, IPAD_PRO_SOURCE),
  bezelPreset("ipad-pro-m5-11-landscape", "iPad Pro 11″ (M5) · landscape", "iPad", [2640, 1880], [110, 106, 2420, 1668], 40, IPAD_PRO_FINISHES, IPAD_PRO_SOURCE),
  bezelPreset("ipad-air-m4-13", "iPad Air 13″ (M4)", "iPad", [2300, 2980], [126, 124, 2048, 2732], 20, IPAD_AIR_FINISHES, IPAD_AIR_SOURCE),
  bezelPreset("ipad-air-m4-13-landscape", "iPad Air 13″ (M4) · landscape", "iPad", [2980, 2300], [124, 126, 2732, 2048], 20, IPAD_AIR_FINISHES, IPAD_AIR_SOURCE),
  bezelPreset("ipad-air-m4-11", "iPad Air 11″ (M4)", "iPad", [1900, 2620], [130, 130, 1640, 2360], 20, IPAD_AIR_FINISHES, IPAD_AIR_SOURCE),
  bezelPreset("ipad-air-m4-11-landscape", "iPad Air 11″ (M4) · landscape", "iPad", [2620, 1900], [130, 130, 2360, 1640], 20, IPAD_AIR_FINISHES, IPAD_AIR_SOURCE),
] as const;
