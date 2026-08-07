import { describe, expect, test } from "bun:test";
import { Group, Layer } from "react-konva";
import { createDefaultProject } from "../src/lib/defaults";
import { resolveScreen } from "../src/scene/selectors";
import { SceneContents, SceneRenderer } from "../src/canvas/scene-renderer";
import { konvaFontStyle } from "../src/canvas/text-style";

describe("Konva text styles", () => {
  test("preserves exact numeric weight and italic in the canvas font descriptor", () => {
    expect(konvaFontStyle(400, false)).toBe("normal 400");
    expect(konvaFontStyle(700, false)).toBe("normal 700");
    expect(konvaFontStyle(400, true)).toBe("italic 400");
    expect(konvaFontStyle(750, true)).toBe("italic 750");
  });
});

describe("scene renderer composition", () => {
  test("keeps layer ownership outside reusable screen contents", () => {
    const project = createDefaultProject("Renderer fixture");
    const sourceScreen = project.decks[0]?.screens[0];
    if (!sourceScreen) throw new Error("Missing renderer fixture screen.");
    const props = { assets: project.assets, projectSlug: project.slug, screen: resolveScreen(project, sourceScreen.id) };

    expect(SceneContents(props).type).toBe(Group);
    expect(SceneRenderer(props).type).toBe(Layer);
  });
});
