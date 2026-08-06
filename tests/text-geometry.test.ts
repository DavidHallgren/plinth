import { describe, expect, test } from "bun:test";
import { createDefaultProject, createDeckPreset } from "../src/lib/defaults";
import { parseProject } from "../src/lib/migrations";
import { calculateTextAutoHeight } from "../src/scene/text-geometry";
import { addElement, updateElement } from "../src/scene/operations";
import { ProjectSchema, type TextElement } from "../src/lib/schema";
import { ownedElements } from "./helpers";

const timestamp = "2026-08-02T00:00:00.000Z";

describe("text auto-height geometry", () => {
  test("accounts for explicit and wrapped lines with padding", () => {
    const style = {
      fontFamilyId: "builtin:inter",
      fontSize: 20,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#ffffff",
      align: "left" as const,
      padding: 8,
      autoHeight: true,
    };
    expect(calculateTextAutoHeight("one\ntwo", 240, style)).toBe(64);
    expect(calculateTextAutoHeight("a".repeat(40), 120, style)).toBeGreaterThan(calculateTextAutoHeight("short", 120, style));
  });

  test("uses measured font width instead of a character-count boundary", () => {
    const style = {
      fontFamilyId: "builtin:inter",
      fontSize: 96,
      fontWeight: 820,
      italic: false,
      lineHeight: 0.96,
      letterSpacing: -5,
      padding: 0,
      autoHeight: true,
    };
    const measuredFont = (value: string) => value.length * 40;

    expect(calculateTextAutoHeight("Your training stays yours.", 1096, style, measuredFont)).toBe(93);
  });

  test("normalizes screen text geometry using the containing deck", () => {
    const seed = createDefaultProject("Text geometry", { now: timestamp });
    const deck = createDeckPreset("custom", {
      id: "deck_text_geometry",
      name: "Text deck",
      slug: "text-deck",
      width: 400,
      height: 300,
      screenPreset: "blank",
      screenName: "Text geometry",
      screenSlug: "text-geometry",
      screenExportSlug: "text-geometry",
      now: timestamp,
    });
    const screen = deck.screens[0];
    if (!screen) throw new Error("Missing screen");
    const text: TextElement = {
      id: "text_geometry",
      type: "text",
      name: "Wrapping text",
      x: 10,
      y: 10,
      width: 120,
      height: 12,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      text: "This is a deliberately long line that must wrap in a narrow box.",
      style: {
        fontFamilyId: "builtin:inter",
        fontSize: 20,
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: "#ffffff",
        align: "left",
        padding: 4,
        autoHeight: true,
      },
    };
    const project = ProjectSchema.parse({ ...seed, decks: [{ ...deck, screens: [screen] }] });
    const wrapped = addElement(project, screen.id, text);
    const wrappedScreen = wrapped.decks[0]?.screens[0];
    const wrappedText = wrappedScreen && ownedElements(wrappedScreen)[0];
    expect(wrappedText?.type).toBe("text");
    expect(wrappedText?.height).toBeGreaterThan(text.height);

    const fixed = updateElement(wrapped, screen.id, text.id, { style: { autoHeight: false }, height: 40 });
    const changed = updateElement(fixed, screen.id, text.id, { text: `${text.text} more words` });
    const changedScreen = changed.decks[0]?.screens[0];
    expect(changedScreen && ownedElements(changedScreen)[0]?.height).toBe(40);
  });

  test("keeps browser-computed auto-height geometry and does not remeasure it on the server", () => {
    const project = createDefaultProject("Auto-height fixture", { now: timestamp });
    const deck = project.decks[0];
    const screen = deck?.screens[0];
    const text = screen && ownedElements(screen).find((element): element is TextElement => element.type === "text");
    if (!deck || !screen || !text) throw new Error("Missing starter text element");
    const expectedHeight = calculateTextAutoHeight(text.text, text.width, text.style);
    expect(text.height).toBe(expectedHeight);

    const legacyHeight = 500;
    const parsed = parseProject({
      ...project,
      decks: [{ ...deck, screens: [{ ...screen, layers: screen.layers.map((layer) => layer.kind === "owned" && layer.element.id === text.id ? { ...layer, element: { ...layer.element, height: legacyHeight } } : layer) }] }],
    });
    const parsedScreen = parsed.decks[0]?.screens[0];
    expect(parsedScreen && ownedElements(parsedScreen).find((element) => element.id === text.id)?.height).toBe(legacyHeight);
  });
});
