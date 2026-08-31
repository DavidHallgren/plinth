import { describe, expect, test } from "bun:test";
import { Group, Layer, Stage } from "../src/canvas/react-konva";
import { ScreenThumbnail } from "../src/components/editor/screen-thumbnail";
import { thumbnailSize } from "../src/devices/geometry";
import { createDefaultProject } from "../src/lib/defaults";
import { resolveScreen } from "../src/scene/selectors";
import { SceneContents, SceneRenderer, shapeVisualProps } from "../src/canvas/scene-renderer";
import { konvaFontStyle } from "../src/canvas/text-style";
import { fillFrameShadowSilhouette } from "../src/canvas/device-frame-shadow";

describe("Konva text styles", () => {
  test("preserves exact numeric weight and italic in the canvas font descriptor", () => {
    expect(konvaFontStyle(400, false)).toBe("normal 400");
    expect(konvaFontStyle(700, false)).toBe("normal 700");
    expect(konvaFontStyle(400, true)).toBe("italic 400");
    expect(konvaFontStyle(750, true)).toBe("italic 750");
  });
});

describe("scene renderer composition", () => {
  test("fills enclosed frame apertures without filling exterior gaps", () => {
    const width = 7;
    const height = 7;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const setOpaque = (x: number, y: number) => { pixels[(y * width + x) * 4 + 3] = 255; };
    for (let x = 1; x <= 5; x += 1) {
      setOpaque(x, 1);
      setOpaque(x, 5);
    }
    for (let y = 1; y <= 5; y += 1) {
      setOpaque(1, y);
      setOpaque(5, y);
    }

    const silhouette = fillFrameShadowSilhouette(pixels, width, height);
    expect(silhouette[(3 * width + 3) * 4 + 3]).toBe(255);
    expect(silhouette[(0 * width + 3) * 4 + 3]).toBe(0);

    pixels[(1 * width + 3) * 4 + 3] = 0;
    const openSilhouette = fillFrameShadowSilhouette(pixels, width, height);
    expect(openSilhouette[(3 * width + 3) * 4 + 3]).toBe(0);
  });

  test("keeps layer ownership outside reusable screen contents", () => {
    const project = createDefaultProject("Renderer fixture");
    const sourceScreen = project.decks[0]?.screens[0];
    if (!sourceScreen) throw new Error("Missing renderer fixture screen.");
    const props = { assets: project.assets, projectSlug: project.slug, screen: resolveScreen(project, sourceScreen.id) };

    expect(SceneContents(props).type).toBe(Group);
    expect(SceneRenderer(props).type).toBe(Layer);
  });

  test("supersamples compact thumbnails before displaying them at their requested size", () => {
    const project = createDefaultProject("Thumbnail fixture");
    const sourceScreen = project.decks[0]?.screens[0];
    if (!sourceScreen) throw new Error("Missing thumbnail fixture screen.");
    const screen = resolveScreen(project, sourceScreen.id);
    const displaySize = thumbnailSize(screen.width, screen.height, 46, 46);
    const thumbnail = ScreenThumbnail({ assets: project.assets, maxHeight: 46, maxWidth: 46, projectSlug: project.slug, screen });
    const stage = thumbnail.props.children;

    expect(stage.type).toBe(Stage);
    expect(stage.props).toMatchObject({
      height: displaySize.height * 4,
      scaleX: displaySize.scale * 4,
      scaleY: displaySize.scale * 4,
      width: displaySize.width * 4,
      style: { transform: "scale(0.25)", transformOrigin: "top left" },
    });
    expect(thumbnail.props.style).toEqual({ height: displaySize.height, overflow: "hidden", width: displaySize.width });
  });

  test("applies shape shadows to the drawable node props", () => {
    const project = createDefaultProject("Shape shadow fixture");
    const sourceScreen = project.decks[0]?.screens[0];
    if (!sourceScreen) throw new Error("Missing shape shadow fixture screen.");
    const shape = resolveScreen(project, sourceScreen.id).elements.find((element) => element.type === "shape");
    if (!shape || shape.type !== "shape") throw new Error("Missing shape fixture.");
    const shadow = { color: "#123456", blur: 12, offsetX: 4, offsetY: 6, opacity: 0.7 };

    expect(shapeVisualProps({ ...shape, shape: "line", shadow })).toMatchObject({
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      shadowColor: shadow.color,
      shadowBlur: shadow.blur,
      shadowOffsetX: shadow.offsetX,
      shadowOffsetY: shadow.offsetY,
      shadowOpacity: shadow.opacity,
    });
  });
});
