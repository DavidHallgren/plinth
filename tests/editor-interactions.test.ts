import { describe, expect, test } from "bun:test";
import { shouldIgnoreEditorShortcutTarget } from "../src/components/editor/editor-workspace";
import { fitDeckZoom, fitFocusedScreenZoom, fitScreenWidthZoom } from "../src/canvas/deck-canvas";
import { calculateTextAutoHeight } from "../src/scene/text-geometry";
import { createDefaultProject } from "../src/lib/defaults";
import { ProjectSchema, type TextElement } from "../src/lib/schema";
import { addElement, reorderElements } from "../src/scene/operations";
import { ownedElements } from "./helpers";
import { projectionKey } from "../src/scene/overflow";

describe("editor interaction guards and geometry", () => {
  test("does not intercept typing targets, including contenteditable descendants", () => {
    const input = { closest: (selector: string) => selector.includes("input") ? input : null } as unknown as EventTarget;
    const editor = { isContentEditable: true, closest: () => null } as unknown as EventTarget;
    const canvas = { closest: () => null } as unknown as EventTarget;
    expect(shouldIgnoreEditorShortcutTarget(input)).toBe(true);
    expect(shouldIgnoreEditorShortcutTarget(editor)).toBe(true);
    expect(shouldIgnoreEditorShortcutTarget(canvas)).toBe(false);
    expect(shouldIgnoreEditorShortcutTarget(null)).toBe(false);
  });

  test("keeps projection node identities distinct while preserving the canonical id", () => {
    expect(projectionKey("screen-a", "element-1")).toBe("screen-a:element-1");
    expect(projectionKey("screen-b", "element-1")).not.toBe(projectionKey("screen-a", "element-1"));
  });

  test("computes multiline auto-height while preserving fixed-height text", () => {
    const style = {
      fontSize: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
      padding: 8,
      autoHeight: true,
    } as const;
    const single = calculateTextAutoHeight("One line", 220, style);
    const multiline = calculateTextAutoHeight("One line\nSecond line\nThird line", 220, style);
    expect(multiline).toBeGreaterThan(single);
    expect(calculateTextAutoHeight("Many words", 220, { ...style, autoHeight: false })).toBe(1);
  });

  test("fits the active deck or focused screen in the viewport", () => {
    expect(fitFocusedScreenZoom(1320, 2868, 900, 839)).toBeCloseTo(775 / 2868);
    expect(fitFocusedScreenZoom(600, 400, 839, 839)).toBe(1);
    expect(fitScreenWidthZoom(1320, 900)).toBeCloseTo(836 / 1320);
    expect(fitScreenWidthZoom(100, 250)).toBe(1);
    expect(fitDeckZoom(1320, 2868, 2, 900, 839)).toBeCloseTo(775 / 2868);
    expect(fitDeckZoom(100, 100, 2, 250, 500)).toBeCloseTo(0.9);
  });

  test("reorder keeps layer order and retains the moved selection identity", () => {
    const seed = createDefaultProject("Reorder fixture");
    const screen = seed.decks[0]?.screens[0];
    if (!screen) throw new Error("Missing screen");
    const text: TextElement = {
      id: "text-reorder",
      type: "text",
      name: "Reorder text",
      x: 20,
      y: 20,
      width: 200,
      height: 80,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      text: "Layer",
      style: {
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 24,
        fontWeight: 400,
        italic: false,
        underline: false,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: "#ffffff",
        align: "left",
        backgroundColor: null,
        padding: 0,
        backgroundRadius: 0,
        shadow: null,
        autoHeight: false,
      },
    };
    const project = addElement(seed, screen.id, text);
    const reordered = reorderElements(project, screen.id, [text.id], 0);
    const parsed = ProjectSchema.parse(reordered);
    expect(parsed.decks[0]?.screens[0]?.layers[0]).toMatchObject({ kind: "owned", element: { id: text.id } });
    expect(parsed.decks[0]?.screens[0]?.layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId)).toEqual([text.id, ...ownedElements(screen).map((element) => element.id)]);
  });
});
