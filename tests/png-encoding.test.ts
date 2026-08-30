import { describe, expect, test } from "bun:test";
import { encodePngPixels } from "../src/lib/png-encoding";
import { decodePngMetadata } from "../src/lib/export-validation";
import { decodePngPixels } from "./helpers";

describe("browser export PNG encoding", () => {
  test("encodes opaque canvas pixels as RGB color type 2 without changing dimensions or colors", async () => {
    const source = new Uint8Array([
      12, 34, 56, 255,
      78, 90, 123, 255,
      145, 167, 189, 255,
      210, 45, 67, 255,
    ]);

    const encoded = await encodePngPixels(source, 2, 2, "opaque");
    expect(decodePngMetadata(encoded)).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 2 });
    expect(decodePngPixels(encoded)).toEqual({ width: 2, height: 2, colorType: 2, pixels: source });
  });

  test("encodes transparent canvas pixels as RGBA color type 6 and preserves alpha", async () => {
    const source = new Uint8Array([
      12, 34, 56, 0,
      78, 90, 123, 64,
      145, 167, 189, 128,
      210, 45, 67, 255,
    ]);

    const encoded = await encodePngPixels(source, 2, 2, "transparent");
    expect(decodePngMetadata(encoded)).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 6 });
    expect(decodePngPixels(encoded)).toEqual({ width: 2, height: 2, colorType: 6, pixels: source });
  });

  test("normalizes alpha-bearing opaque canvas pixels by removing the channel losslessly", async () => {
    const source = new Uint8Array([
      9, 19, 29, 0,
      39, 49, 59, 127,
    ]);

    const encoded = await encodePngPixels(source, 2, 1, "opaque");
    const decoded = decodePngPixels(encoded);
    expect(decodePngMetadata(encoded).colorType).toBe(2);
    expect(Array.from(decoded.pixels)).toEqual([
      9, 19, 29, 255,
      39, 49, 59, 255,
    ]);
  });
});
