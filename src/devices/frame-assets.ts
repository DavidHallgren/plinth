import iphone17Black from "./frames/iphone-17-black.png";
import iphone17Lavender from "./frames/iphone-17-lavender.png";
import iphone17MistBlue from "./frames/iphone-17-mist-blue.png";
import iphone17ProCosmicOrange from "./frames/iphone-17-pro-cosmic-orange.png";
import iphone17ProDeepBlue from "./frames/iphone-17-pro-deep-blue.png";
import iphone17ProMaxCosmicOrange from "./frames/iphone-17-pro-max-cosmic-orange.png";
import iphone17ProMaxDeepBlue from "./frames/iphone-17-pro-max-deep-blue.png";
import iphone17ProMaxSilver from "./frames/iphone-17-pro-max-silver.png";
import iphone17ProSilver from "./frames/iphone-17-pro-silver.png";
import iphone17Sage from "./frames/iphone-17-sage.png";
import iphone17White from "./frames/iphone-17-white.png";
import iphoneAirCloudWhite from "./frames/iphone-air-cloud-white.png";
import iphoneAirLightGold from "./frames/iphone-air-light-gold.png";
import iphoneAirSkyBlue from "./frames/iphone-air-sky-blue.png";
import iphoneAirSpaceBlack from "./frames/iphone-air-space-black.png";
import duoOuterNightSky from "./frames/iphone-duo-outer-night-sky.png";
import duoOuterStarWhite from "./frames/iphone-duo-outer-star-white.png";
import duoOuterLandscapeNightSky from "./frames/iphone-duo-outer-landscape-night-sky.png";
import duoOuterLandscapeStarWhite from "./frames/iphone-duo-outer-landscape-star-white.png";
import duoInnerNightSky from "./frames/iphone-duo-inner-night-sky.png";
import duoInnerStarWhite from "./frames/iphone-duo-inner-star-white.png";
import duoInnerLandscapeNightSky from "./frames/iphone-duo-inner-landscape-night-sky.png";
import duoInnerLandscapeStarWhite from "./frames/iphone-duo-inner-landscape-star-white.png";
import { getDevicePreset } from "./presets";

const DEVICE_FRAME_ASSETS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "iphone-duo-outer": { "#242833": duoOuterNightSky, "#eeeeeb": duoOuterStarWhite },
  "iphone-duo-outer-landscape": { "#242833": duoOuterLandscapeNightSky, "#eeeeeb": duoOuterLandscapeStarWhite },
  "iphone-duo-inner": { "#242833": duoInnerNightSky, "#eeeeeb": duoInnerStarWhite },
  "iphone-duo-inner-landscape": { "#242833": duoInnerLandscapeNightSky, "#eeeeeb": duoInnerLandscapeStarWhite },
  "iphone-17-pro-max": {
    "#f17d39": iphone17ProMaxCosmicOrange,
    "#182d55": iphone17ProMaxDeepBlue,
    "#d9dce2": iphone17ProMaxSilver,
  },
  "iphone-17-pro": {
    "#f17d39": iphone17ProCosmicOrange,
    "#182d55": iphone17ProDeepBlue,
    "#d9dce2": iphone17ProSilver,
  },
  "iphone-17": {
    "#202124": iphone17Black,
    "#d8d5e8": iphone17Lavender,
    "#b9ccd7": iphone17MistBlue,
    "#b8c4aa": iphone17Sage,
    "#f1f1ef": iphone17White,
  },
  "iphone-air": {
    "#f1eee8": iphoneAirCloudWhite,
    "#d8c7a8": iphoneAirLightGold,
    "#b9cbd5": iphoneAirSkyBlue,
    "#34343a": iphoneAirSpaceBlack,
  },
};

export function deviceFrameSource(presetId: string, frameColor: string, showCamera = true): string | null {
  const frames = DEVICE_FRAME_ASSETS[presetId];
  if (!frames) return null;
  const preset = getDevicePreset(presetId);
  // Legacy phone PNGs include their camera overlay. Duo has no synthetic
  // camera, so its official bezel remains visible with either toggle state.
  if (!showCamera && preset?.camera.kind !== "none") return null;
  return frames[frameColor.toLowerCase()] ?? (preset ? frames[preset.defaultFrameColor.toLowerCase()] : undefined) ?? Object.values(frames)[0] ?? null;
}
