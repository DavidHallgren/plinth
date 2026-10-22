import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { deviceFrameSource } from "../src/devices/frame-assets";
import { getDevicePreset } from "../src/devices/presets";
import { calculateDeviceScreenGeometry } from "../src/devices/geometry";
import { roundedRectPath } from "../src/canvas/image-loading";

const layouts = [
  ["macbook-air-m5-13", 3400, 2240, 420, 288, 2560, 1664],
  ["macbook-air-m5-15", 3540, 2300, 329, 218, 2880, 1864],
  ["macbook-pro-m5-14", 3860, 2540, 418, 288, 3024, 1964],
  ["macbook-pro-m5-16", 4260, 2840, 402, 303, 3456, 2234],
  ["iphone-18-pro-max", 1470, 3000, 75, 66, 1320, 2868],
  ["iphone-18-pro-max-landscape", 3000, 1470, 66, 76, 2868, 1320],
  ["iphone-18-pro", 1350, 2760, 72, 69, 1206, 2622],
  ["iphone-18-pro-landscape", 2760, 1350, 69, 72, 2622, 1206],
  ["ipad-pro-m5-13", 2300, 3000, 118, 124, 2064, 2752],
  ["ipad-pro-m5-13-landscape", 3000, 2300, 124, 118, 2752, 2064],
  ["ipad-pro-m5-11", 1880, 2640, 106, 110, 1668, 2420],
  ["ipad-pro-m5-11-landscape", 2640, 1880, 110, 106, 2420, 1668],
  ["ipad-air-m4-13", 2300, 2980, 126, 124, 2048, 2732],
  ["ipad-air-m4-13-landscape", 2980, 2300, 124, 126, 2732, 2048],
  ["ipad-air-m4-11", 1900, 2620, 130, 130, 1640, 2360],
  ["ipad-air-m4-11-landscape", 2620, 1900, 130, 130, 2360, 1640],
  ["iphone-duo-outer", 1574, 2194, 88, 80, 1398, 2034],
  ["iphone-duo-outer-landscape", 2194, 1574, 80, 88, 2034, 1398],
  ["iphone-duo-inner", 2247, 3093, 120, 120, 2007, 2853],
  ["iphone-duo-inner-landscape", 3093, 2247, 120, 120, 2853, 2007],
] as const;

describe("official Apple frame artwork", () => {
  test.each(layouts)("aligns %s with the actual transparent aperture in every finish", async (id, width, height, x, y, screenWidth, screenHeight) => {
    const preset = getDevicePreset(id)!;
    const geometry = calculateDeviceScreenGeometry(preset, width, height);
    expect(geometry.screen.x).toBeCloseTo(x, 8);
    expect(geometry.screen.y).toBeCloseTo(y, 8);
    expect(geometry.screen.width).toBeCloseTo(screenWidth, 8);
    expect(geometry.screen.height).toBeCloseTo(screenHeight, 8);
    expect(preset.aspectRatio).toBe(width / height);
    expect(preset.frameFinishes!.length).toBeGreaterThanOrEqual(2);
    expect(new Set(preset.frameFinishes!.map((finish) => deviceFrameSource(id, finish.color))).size).toBe(preset.frameFinishes!.length);
    for (const finish of preset.frameFinishes!) {
      const source = deviceFrameSource(id, finish.color)!;
      expect(deviceFrameSource(id, finish.color, false)).toBe(source);
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width, height, channels: 4 });
      const alpha = (px: number, py: number) => data[(py * width + px) * 4 + 3]!;
      const centerX = x + Math.floor(screenWidth / 2);
      const centerY = y + Math.floor(screenHeight / 2);
      // MacBook notches cover the top center; probe beside the notch.
      const edgeX = preset.category === "Mac" ? x + Math.floor(screenWidth / 4) : centerX;
      expect(alpha(centerX, centerY)).toBe(0);
      // Opaque borders immediately outside, transparent screenshot immediately
      // inside. Apple's folded top/bottom edge includes a 1-alpha AA pixel.
      for (const [outsideX, outsideY, insideX, insideY] of [
        [x - 1, centerY, x + 1, centerY],
        [x + screenWidth, centerY, x + screenWidth - 2, centerY],
        [edgeX, y - 1, edgeX, y + 1],
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
      if (preset.category === "Mac") {
        expect(geometry.screen.cornerRadii?.[0]).toBeCloseTo(20, 8);
        expect(geometry.screen.cornerRadii?.[1]).toBeCloseTo(20, 8);
        expect(geometry.screen.cornerRadii?.slice(2)).toEqual([0, 0]);
        expect(alpha(centerX, y + 5)).toBe(255);
        // The bottom display corners are fully exposed, so any rounding
        // would incorrectly cut pixels out of a native desktop screenshot.
        expect(alpha(x, y + screenHeight - 1)).toBe(0);
        expect(alpha(x + screenWidth - 1, y + screenHeight - 1)).toBe(0);
      }
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
