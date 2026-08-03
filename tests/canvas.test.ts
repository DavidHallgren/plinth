import { describe, expect, test } from "bun:test";
import { konvaFontStyle } from "../src/canvas/text-style";

describe("Konva text styles", () => {
  test("composes weight and italic into supported fontStyle values", () => {
    expect(konvaFontStyle(400, false)).toBe("normal");
    expect(konvaFontStyle(700, false)).toBe("bold");
    expect(konvaFontStyle(400, true)).toBe("italic");
    expect(konvaFontStyle(750, true)).toBe("italic bold");
  });
});
