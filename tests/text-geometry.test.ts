import { describe, expect, test } from "bun:test";
import { createDefaultProject, createDocumentPreset } from "../src/lib/defaults";
import { parseProject } from "../src/lib/migrations";
import { calculateTextAutoHeight } from "../src/scene/text-geometry";
import { addElement, updateElement } from "../src/scene/operations";
import { ProjectSchema, type TextElement } from "../src/lib/schema";

describe("text auto-height geometry", () => {
  test("accounts for explicit and wrapped lines with padding", () => {
    const style = {
      fontFamily: "Inter, sans-serif",
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

  test("normalizes scene text geometry and preserves fixed-height text", () => {
    const seed = createDefaultProject("Text geometry", { now: "2026-08-02T00:00:00.000Z" });
    const document = createDocumentPreset("blank", { id: "doc_text_geometry", name: "Text geometry", width: 400, height: 300, now: "2026-08-02T00:00:00.000Z" });
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
      zIndex: 0,
      locked: false,
      visible: true,
      shadow: null,
      text: "This is a deliberately long line that must wrap in a narrow box.",
      style: {
        fontFamily: "Inter, sans-serif",
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
    const project = ProjectSchema.parse({ ...seed, documents: [document] });
    const wrapped = addElement(project, document.id, text);
    const wrappedText = wrapped.documents[0]?.elements[0];
    expect(wrappedText?.type).toBe("text");
    expect(wrappedText?.height).toBeGreaterThan(text.height);

    const fixed = updateElement(wrapped, document.id, text.id, { style: { autoHeight: false }, height: 40 });
    const changed = updateElement(fixed, document.id, text.id, { text: `${text.text} more words` });
    expect(changed.documents[0]?.elements[0]?.height).toBe(40);
  });

  test("keeps stored auto-height geometry aligned with renderer and migrated JSON", () => {
    const project = createDefaultProject("Auto-height fixture", { now: "2026-08-02T00:00:00.000Z" });
    const document = project.documents[0];
    const text = document?.elements.find((element): element is TextElement => element.type === "text");
    if (!document || !text) throw new Error("Missing starter text element");
    const expectedHeight = calculateTextAutoHeight(text.text, text.width, text.style);
    expect(text.height).toBe(expectedHeight);

    const legacyHeight = 500;
    const parsed = parseProject({
      ...project,
      documents: [{ ...document, elements: document.elements.map((element) => element.id === text.id ? { ...element, height: legacyHeight } : element) }],
    });
    expect(parsed.documents[0]?.elements.find((element) => element.id === text.id)?.height).toBe(expectedHeight);
  });
});
