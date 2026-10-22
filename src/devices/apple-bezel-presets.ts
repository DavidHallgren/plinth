import type { DeviceFrameFinish, DevicePresetDefinition } from "./presets";
import { WATCH_SERIES_11_FINISHES, WATCH_ULTRA_3_FINISHES, WATCH_ULTRA_2_FINISHES } from "./apple-watch-finishes";

const IPHONE_18_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-18.dmg";
const IPAD_PRO_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Pro-%28M5%29.dmg";
const IPAD_AIR_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Air-%28M4%29.dmg";
const MACBOOK_AIR_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-MacBook-Air-M5.dmg";
const MACBOOK_PRO_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-MacBook-Pro-M5.dmg";
const WATCH_SERIES_11_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-Apple-Watch-Series-11-2025.dmg";
const WATCH_ULTRA_3_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-Apple-Watch-Ultra-3-2025.dmg";
const WATCH_ULTRA_2_SOURCE = "https://devimages-cdn.apple.com/design/resources/download/Bezel-Apple-Watch-Ultra-2-2024.dmg";

const MACBOOK_AIR_FINISHES = [
  { label: "Sky Blue", color: "#c8d8e0" },
  { label: "Silver", color: "#e3e4e5" },
  { label: "Starlight", color: "#e4dbce" },
  { label: "Midnight", color: "#303b48" },
] as const;
const MACBOOK_PRO_FINISHES = [
  { label: "Space Black", color: "#2e2e30" },
  { label: "Silver", color: "#e3e4e5" },
] as const;

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
  id: Id, label: string, category: "iPhone" | "iPad" | "Mac" | "Apple Watch",
  frame: readonly [number, number], aperture: readonly [number, number, number, number],
  clipRadius: number | readonly [number, number, number, number], finishes: readonly [DeviceFrameFinish, ...DeviceFrameFinish[]], source: string,
) {
  const [width, height] = frame;
  const [x, y, screenWidth, screenHeight] = aperture;
  return {
    id, label, category,
    aspectRatio: width / height,
    outerRadius: category === "iPhone" ? 0.14 : 0.05,
    screenRadius: (typeof clipRadius === "number" ? clipRadius : clipRadius[0]) / Math.min(screenWidth, screenHeight),
    ...(typeof clipRadius === "number" ? {} : {
      screenCornerRadii: clipRadius.map((radius) => radius / Math.min(screenWidth, screenHeight)) as [number, number, number, number],
    }),
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
  bezelPreset("apple-watch-series-11-42", "Apple Watch Series 11 · 42 mm", "Apple Watch", [520, 800], [73, 177, 374, 446], 60, WATCH_SERIES_11_FINISHES, WATCH_SERIES_11_SOURCE),
  bezelPreset("apple-watch-series-11-46", "Apple Watch Series 11 · 46 mm", "Apple Watch", [560, 880], [72, 192, 416, 496], 60, WATCH_SERIES_11_FINISHES, WATCH_SERIES_11_SOURCE),
  bezelPreset("apple-watch-ultra-3-49", "Apple Watch Ultra 3 · 49 mm", "Apple Watch", [600, 960], [89, 223, 422, 514], 60, WATCH_ULTRA_3_FINISHES, WATCH_ULTRA_3_SOURCE),
  bezelPreset("apple-watch-ultra-2-49", "Apple Watch Ultra 2 · 49 mm", "Apple Watch", [600, 940], [95, 219, 410, 502], 60, WATCH_ULTRA_2_FINISHES, WATCH_ULTRA_2_SOURCE),
  // MacBook displays have rounded top corners and square bottom corners.
  bezelPreset("macbook-air-m5-13", "MacBook Air 13″ (M5)", "Mac", [3400, 2240], [420, 288, 2560, 1664], [20, 20, 0, 0], MACBOOK_AIR_FINISHES, MACBOOK_AIR_SOURCE),
  bezelPreset("macbook-air-m5-15", "MacBook Air 15″ (M5)", "Mac", [3540, 2300], [329, 218, 2880, 1864], [20, 20, 0, 0], MACBOOK_AIR_FINISHES, MACBOOK_AIR_SOURCE),
  bezelPreset("macbook-pro-m5-14", "MacBook Pro 14″ (M5)", "Mac", [3860, 2540], [418, 288, 3024, 1964], [20, 20, 0, 0], MACBOOK_PRO_FINISHES, MACBOOK_PRO_SOURCE),
  bezelPreset("macbook-pro-m5-16", "MacBook Pro 16″ (M5)", "Mac", [4260, 2840], [402, 303, 3456, 2234], [20, 20, 0, 0], MACBOOK_PRO_FINISHES, MACBOOK_PRO_SOURCE),
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
