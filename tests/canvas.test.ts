import { describe, expect, test } from "bun:test";
import { konvaFontStyle } from "../src/canvas/text-style";

describe("Konva text styles", () => {
  test("preserves exact numeric weight and italic in the canvas font descriptor", () => {
    expect(konvaFontStyle(400, false)).toBe("normal 400");
    expect(konvaFontStyle(700, false)).toBe("normal 700");
    expect(konvaFontStyle(400, true)).toBe("italic 400");
    expect(konvaFontStyle(750, true)).toBe("italic 750");
  });
});
