import macbookAirM513Midnight from "./frames/macbook-air-m5-13-midnight.png";
import macbookAirM513Silver from "./frames/macbook-air-m5-13-silver.png";
import macbookAirM513SkyBlue from "./frames/macbook-air-m5-13-sky-blue.png";
import macbookAirM513Starlight from "./frames/macbook-air-m5-13-starlight.png";
import macbookAirM515Midnight from "./frames/macbook-air-m5-15-midnight.png";
import macbookAirM515Silver from "./frames/macbook-air-m5-15-silver.png";
import macbookAirM515SkyBlue from "./frames/macbook-air-m5-15-sky-blue.png";
import macbookAirM515Starlight from "./frames/macbook-air-m5-15-starlight.png";
import macbookProM514Silver from "./frames/macbook-pro-m5-14-silver.png";
import macbookProM514SpaceBlack from "./frames/macbook-pro-m5-14-space-black.png";
import macbookProM516Silver from "./frames/macbook-pro-m5-16-silver.png";
import macbookProM516SpaceBlack from "./frames/macbook-pro-m5-16-space-black.png";
import ipadProM511LandscapeSilver from "./frames/ipad-pro-m5-11-landscape-silver.png";
import ipadProM511Silver from "./frames/ipad-pro-m5-11-silver.png";
import ipadProM511LandscapeSpaceBlack from "./frames/ipad-pro-m5-11-landscape-space-black.png";
import ipadProM511SpaceBlack from "./frames/ipad-pro-m5-11-space-black.png";
import ipadProM513LandscapeSilver from "./frames/ipad-pro-m5-13-landscape-silver.png";
import ipadProM513Silver from "./frames/ipad-pro-m5-13-silver.png";
import ipadProM513LandscapeSpaceBlack from "./frames/ipad-pro-m5-13-landscape-space-black.png";
import ipadProM513SpaceBlack from "./frames/ipad-pro-m5-13-space-black.png";
import ipadAirM411LandscapeBlue from "./frames/ipad-air-m4-11-landscape-blue.png";
import ipadAirM411Blue from "./frames/ipad-air-m4-11-blue.png";
import ipadAirM411LandscapePurple from "./frames/ipad-air-m4-11-landscape-purple.png";
import ipadAirM411Purple from "./frames/ipad-air-m4-11-purple.png";
import ipadAirM411LandscapeSpaceGray from "./frames/ipad-air-m4-11-landscape-space-gray.png";
import ipadAirM411SpaceGray from "./frames/ipad-air-m4-11-space-gray.png";
import ipadAirM411LandscapeStarlight from "./frames/ipad-air-m4-11-landscape-starlight.png";
import ipadAirM411Starlight from "./frames/ipad-air-m4-11-starlight.png";
import ipadAirM413LandscapeBlue from "./frames/ipad-air-m4-13-landscape-blue.png";
import ipadAirM413Blue from "./frames/ipad-air-m4-13-blue.png";
import ipadAirM413LandscapePurple from "./frames/ipad-air-m4-13-landscape-purple.png";
import ipadAirM413Purple from "./frames/ipad-air-m4-13-purple.png";
import ipadAirM413LandscapeSpaceGray from "./frames/ipad-air-m4-13-landscape-space-gray.png";
import ipadAirM413SpaceGray from "./frames/ipad-air-m4-13-space-gray.png";
import ipadAirM413LandscapeStarlight from "./frames/ipad-air-m4-13-landscape-starlight.png";
import ipadAirM413Starlight from "./frames/ipad-air-m4-13-starlight.png";
import iphone18ProLandscapeBlack from "./frames/iphone-18-pro-landscape-black.png";
import iphone18ProBlack from "./frames/iphone-18-pro-black.png";
import iphone18ProLandscapeBurgundy from "./frames/iphone-18-pro-landscape-burgundy.png";
import iphone18ProBurgundy from "./frames/iphone-18-pro-burgundy.png";
import iphone18ProLandscapeGlacier from "./frames/iphone-18-pro-landscape-glacier.png";
import iphone18ProGlacier from "./frames/iphone-18-pro-glacier.png";
import iphone18ProLandscapeSilver from "./frames/iphone-18-pro-landscape-silver.png";
import iphone18ProSilver from "./frames/iphone-18-pro-silver.png";
import iphone18ProMaxLandscapeBlack from "./frames/iphone-18-pro-max-landscape-black.png";
import iphone18ProMaxBlack from "./frames/iphone-18-pro-max-black.png";
import iphone18ProMaxLandscapeBurgundy from "./frames/iphone-18-pro-max-landscape-burgundy.png";
import iphone18ProMaxBurgundy from "./frames/iphone-18-pro-max-burgundy.png";
import iphone18ProMaxLandscapeGlacier from "./frames/iphone-18-pro-max-landscape-glacier.png";
import iphone18ProMaxGlacier from "./frames/iphone-18-pro-max-glacier.png";
import iphone18ProMaxLandscapeSilver from "./frames/iphone-18-pro-max-landscape-silver.png";
import iphone18ProMaxSilver from "./frames/iphone-18-pro-max-silver.png";

export const APPLE_BEZEL_ASSETS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "macbook-air-m5-13": {
    "#303b48": macbookAirM513Midnight,
    "#e3e4e5": macbookAirM513Silver,
    "#c8d8e0": macbookAirM513SkyBlue,
    "#e4dbce": macbookAirM513Starlight,
  },
  "macbook-air-m5-15": {
    "#303b48": macbookAirM515Midnight,
    "#e3e4e5": macbookAirM515Silver,
    "#c8d8e0": macbookAirM515SkyBlue,
    "#e4dbce": macbookAirM515Starlight,
  },
  "macbook-pro-m5-14": {
    "#e3e4e5": macbookProM514Silver,
    "#2e2e30": macbookProM514SpaceBlack,
  },
  "macbook-pro-m5-16": {
    "#e3e4e5": macbookProM516Silver,
    "#2e2e30": macbookProM516SpaceBlack,
  },
  "iphone-18-pro-max": {
    "#252629": iphone18ProMaxBlack,
    "#6d263e": iphone18ProMaxBurgundy,
    "#b9cbd2": iphone18ProMaxGlacier,
    "#dedede": iphone18ProMaxSilver,
  },
  "iphone-18-pro-max-landscape": {
    "#252629": iphone18ProMaxLandscapeBlack,
    "#6d263e": iphone18ProMaxLandscapeBurgundy,
    "#b9cbd2": iphone18ProMaxLandscapeGlacier,
    "#dedede": iphone18ProMaxLandscapeSilver,
  },
  "iphone-18-pro": {
    "#252629": iphone18ProBlack,
    "#6d263e": iphone18ProBurgundy,
    "#b9cbd2": iphone18ProGlacier,
    "#dedede": iphone18ProSilver,
  },
  "iphone-18-pro-landscape": {
    "#252629": iphone18ProLandscapeBlack,
    "#6d263e": iphone18ProLandscapeBurgundy,
    "#b9cbd2": iphone18ProLandscapeGlacier,
    "#dedede": iphone18ProLandscapeSilver,
  },
  "ipad-pro-m5-13": {
    "#2e2e30": ipadProM513SpaceBlack,
    "#e3e4e5": ipadProM513Silver,
  },
  "ipad-pro-m5-13-landscape": {
    "#2e2e30": ipadProM513LandscapeSpaceBlack,
    "#e3e4e5": ipadProM513LandscapeSilver,
  },
  "ipad-pro-m5-11": {
    "#2e2e30": ipadProM511SpaceBlack,
    "#e3e4e5": ipadProM511Silver,
  },
  "ipad-pro-m5-11-landscape": {
    "#2e2e30": ipadProM511LandscapeSpaceBlack,
    "#e3e4e5": ipadProM511LandscapeSilver,
  },
  "ipad-air-m4-13": {
    "#8c8e91": ipadAirM413SpaceGray,
    "#a8bdc4": ipadAirM413Blue,
    "#b8b2c5": ipadAirM413Purple,
    "#e4dbce": ipadAirM413Starlight,
  },
  "ipad-air-m4-13-landscape": {
    "#8c8e91": ipadAirM413LandscapeSpaceGray,
    "#a8bdc4": ipadAirM413LandscapeBlue,
    "#b8b2c5": ipadAirM413LandscapePurple,
    "#e4dbce": ipadAirM413LandscapeStarlight,
  },
  "ipad-air-m4-11": {
    "#8c8e91": ipadAirM411SpaceGray,
    "#a8bdc4": ipadAirM411Blue,
    "#b8b2c5": ipadAirM411Purple,
    "#e4dbce": ipadAirM411Starlight,
  },
  "ipad-air-m4-11-landscape": {
    "#8c8e91": ipadAirM411LandscapeSpaceGray,
    "#a8bdc4": ipadAirM411LandscapeBlue,
    "#b8b2c5": ipadAirM411LandscapePurple,
    "#e4dbce": ipadAirM411LandscapeStarlight,
  },
};
