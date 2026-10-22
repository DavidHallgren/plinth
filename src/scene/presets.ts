import type { DevicePresetId } from "../devices/presets";

export type PresetDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  platform: "iPhone" | "iPad" | "App Store" | "Custom";
  note: string;
  // null creates a blank artwork canvas instead of a screenshot composition.
  devicePreset?: DevicePresetId | null;
};

export const APP_STORE_PRESETS = [
  {
    id: "iphone-6-9",
    label: "iPhone 6.9-inch · 1320 × 2868",
    shortLabel: "iPhone 6.9″",
    width: 1320,
    height: 2868,
    platform: "iPhone",
    note: "Accepted 6.9-inch iPhone portrait size",
  },
  {
    id: "iphone-6-7",
    label: "iPhone 6.7-inch · 1290 × 2796",
    shortLabel: "iPhone 6.7″",
    width: 1290,
    height: 2796,
    platform: "iPhone",
    note: "Accepted 6.9-inch group size for recent Pro Max and Plus devices",
  },
  {
    id: "iphone-6-5",
    label: "iPhone 6.5-inch · 1284 × 2778",
    shortLabel: "iPhone 6.5″",
    width: 1284,
    height: 2778,
    platform: "iPhone",
    note: "6.5-inch fallback group",
  },
  {
    id: "iphone-5-5",
    label: "iPhone 5.5-inch · 1242 × 2208",
    shortLabel: "iPhone 5.5″",
    width: 1242,
    height: 2208,
    platform: "iPhone",
    note: "5.5-inch fallback group",
  },
  {
    id: "ipad-13",
    label: "iPad 13-inch · 2064 × 2752",
    shortLabel: "iPad 13″",
    width: 2064,
    height: 2752,
    platform: "iPad",
    note: "Required portrait size when the app runs on iPad",
  },
  {
    id: "iphone-duo-outer",
    label: "iPhone Duo outer · 1398 × 2034",
    shortLabel: "Duo outer",
    width: 1398,
    height: 2034,
    platform: "iPhone",
    note: "Folded outer display · portrait",
    devicePreset: "iphone-duo-outer",
  },
  {
    id: "iphone-duo-outer-landscape",
    label: "iPhone Duo outer landscape · 2034 × 1398",
    shortLabel: "Duo outer landscape",
    width: 2034,
    height: 1398,
    platform: "iPhone",
    note: "Folded outer display · landscape",
    devicePreset: "iphone-duo-outer-landscape",
  },
  {
    id: "iphone-duo-inner",
    label: "iPhone Duo inner · 2007 × 2853",
    shortLabel: "Duo inner",
    width: 2007,
    height: 2853,
    platform: "iPhone",
    note: "Unfolded inner display · App Store portrait screenshot size",
    devicePreset: "iphone-duo-inner",
  },
  {
    id: "iphone-duo-inner-landscape",
    label: "iPhone Duo inner landscape · 2853 × 2007",
    shortLabel: "Duo inner landscape",
    width: 2853,
    height: 2007,
    platform: "iPhone",
    note: "Unfolded inner display · App Store landscape screenshot size",
    devicePreset: "iphone-duo-inner-landscape",
  },
  {
    id: "app-store-header",
    label: "App Store product page header · 3840 × 1646",
    shortLabel: "Product page header",
    width: 3840,
    height: 1646,
    platform: "App Store",
    note: "Blank product page header artwork canvas",
    devicePreset: null,
  },
  {
    id: "app-store-search",
    label: "App Store search results · 3840 × 2560",
    shortLabel: "Search results",
    width: 3840,
    height: 2560,
    platform: "App Store",
    note: "Blank search results artwork canvas · maximum 3:2 size",
    devicePreset: null,
  },
] as const satisfies readonly PresetDefinition[];

export type AppStorePresetId = (typeof APP_STORE_PRESETS)[number]["id"];

export const LEGACY_PRESET_IDS = ["blank", "browser", "phone", "social"] as const;
export type LegacyPresetId = (typeof LEGACY_PRESET_IDS)[number];

export const CUSTOM_PRESET_ID = "custom" as const;

export function getPresetDefinition(id: string): PresetDefinition | undefined {
  return APP_STORE_PRESETS.find((preset) => preset.id === id);
}

export function isAppStorePreset(id: string): id is AppStorePresetId {
  return APP_STORE_PRESETS.some((preset) => preset.id === id);
}
