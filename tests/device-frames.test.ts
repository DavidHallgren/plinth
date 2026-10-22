import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { deviceFrameSource } from "../src/devices/frame-assets";
import { getDevicePreset } from "../src/devices/presets";
import { calculateDeviceScreenGeometry } from "../src/devices/geometry";
import { roundedRectPath } from "../src/canvas/image-loading";

const layouts = [
  ["iphone-duo-outer", 1574, 2194, 88, 80, 1398, 2034],
  ["iphone-duo-outer-landscape", 2194, 1574, 80, 88, 2034, 1398],
  ["iphone-duo-inner", 2247, 3093, 120, 120, 2007, 2853],
  ["iphone-duo-inner-landscape", 3093, 2247, 120, 120, 2853, 2007],
] as const;

describe("official Duo frame artwork", () => {
  test.each(layouts)("aligns %s with the actual transparent aperture in both finishes", async (id, width, height, x, y, screenWidth, screenHeight) => {
    const preset = getDevicePreset(id)!;
    const geometry = calculateDeviceScreenGeometry(preset, width, height);
    expect(geometry.screen.x).toBeCloseTo(x, 8);
    expect(geometry.screen.y).toBeCloseTo(y, 8);
    expect(geometry.screen.width).toBeCloseTo(screenWidth, 8);
    expect(geometry.screen.height).toBeCloseTo(screenHeight, 8);
    expect(preset.aspectRatio).toBe(width / height);
    expect(preset.frameFinishes?.map((finish) => finish.label)).toEqual(["Night Sky", "Star White"]);
    for (const finish of preset.frameFinishes!) {
      const source = deviceFrameSource(id, finish.color)!;
      expect(deviceFrameSource(id, finish.color, false)).toBe(source);
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width, height, channels: 4 });
      const alpha = (px: number, py: number) => data[(py * width + px) * 4 + 3]!;
      const centerX = x + Math.floor(screenWidth / 2);
      const centerY = y + Math.floor(screenHeight / 2);
      expect(alpha(centerX, centerY)).toBe(0);
      // Opaque borders immediately outside, transparent screenshot immediately
      // inside. Apple's folded top/bottom edge includes a 1-alpha AA pixel.
      for (const [outsideX, outsideY, insideX, insideY] of [
        [x - 1, centerY, x + 1, centerY],
        [x + screenWidth, centerY, x + screenWidth - 2, centerY],
        [centerX, y - 1, centerX, y + 1],
        [centerX, y + screenHeight, centerX, y + screenHeight - 2],
      ]) {
        expect(alpha(outsideX!, outsideY!)).toBe(255);
        expect(alpha(insideX!, insideY!)).toBe(0);
      }
      // Sample the actual shared renderer's quadratic clip curves. Every
      // curved clipping edge must sit beneath opaque artwork, avoiding both
      // screenshot leakage outside the device and holes inside its display.
      let cursor = { x: 0, y: 0 };
      const samples: number[] = [];
      roundedRectPath({
        beginPath() {}, closePath() {},
        moveTo(px, py) { cursor = { x: px, y: py }; },
        lineTo(px, py) { cursor = { x: px, y: py }; },
        quadraticCurveTo(cx, cy, px, py) {
          if (cursor.x !== px || cursor.y !== py) {
            for (let step = 1; step < 20; step++) {
              const t = step / 20;
              const sx = (1 - t) ** 2 * cursor.x + 2 * (1 - t) * t * cx + t ** 2 * px;
              const sy = (1 - t) ** 2 * cursor.y + 2 * (1 - t) * t * cy + t ** 2 * py;
              samples.push(alpha(x + Math.min(screenWidth - 1, Math.floor(sx)), y + Math.min(screenHeight - 1, Math.floor(sy))));
            }
          }
          cursor = { x: px, y: py };
        },
      }, screenWidth, screenHeight, geometry.screen.cornerRadii ?? geometry.screen.radius);
      expect(Math.min(...samples)).toBe(255);
    }
    const override = calculateDeviceScreenGeometry(preset, width, height, null, 12);
    expect(override.screen.radius).toBe(12);
    expect(override.screen.cornerRadii).toBeUndefined();
  });

  test("preserves legacy camera-toggle behavior and falls back from custom colors to an official finish", () => {
    expect(deviceFrameSource("iphone-17-pro-max", "#182d55", false)).toBeNull();
    expect(deviceFrameSource("iphone-duo-outer", "#123456", false)).toBe(deviceFrameSource("iphone-duo-outer", "#242833"));
    expect(deviceFrameSource("iphone-duo-inner", "#EEEEEB")).toBe(deviceFrameSource("iphone-duo-inner", "#eeeeeb"));
  });
});
