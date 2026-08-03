import { describe, expect, test } from "bun:test";
import { shouldIgnoreEditorShortcutTarget } from "../src/components/editor/editor-workspace";
import { previewDocumentZoom } from "../src/components/editor/project-preview";
import { calculateTextAutoHeight } from "../src/scene/text-geometry";
import { createDefaultProject } from "../src/lib/defaults";
import { ProjectSchema, type TextElement } from "../src/lib/schema";
import { addElement, reorderElements } from "../src/scene/operations";

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

  test("fits project preview documents within the available vertical space", () => {
    expect(previewDocumentZoom(2868, 839)).toBeCloseTo(727 / 2868);
    expect(previewDocumentZoom(600, 839)).toBe(1);
    expect(previewDocumentZoom(2868, 0)).toBeCloseTo(120 / 2868);
  });

  test("reorder normalizes z-index and retains the moved selection identity", () => {
    const seed = createDefaultProject("Reorder fixture");
    const document = seed.documents[0];
    if (!document) throw new Error("Missing document");
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
      zIndex: document.elements.length,
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
    const project = addElement(seed, document.id, text);
    const reordered = reorderElements(project, document.id, [text.id], 0);
    const parsed = ProjectSchema.parse(reordered);
    expect(parsed.documents[0]?.elements.find((element) => element.id === text.id)?.zIndex).toBe(0);
    expect(parsed.documents[0]?.elements.map((element) => element.zIndex)).toEqual(parsed.documents[0]?.elements.map((_element, index) => index));
  });
});
