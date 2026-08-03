export type PresetDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  platform: "iPhone" | "iPad" | "Custom";
  note: string;
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
