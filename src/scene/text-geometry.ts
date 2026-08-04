import type { SceneElement, TextStyle } from "../lib/schema";

type CanonicalTextElement = Extract<SceneElement, { type: "text" }>;

/**
 * A deterministic, browser-independent text measurement used by operations
 * and the Konva renderer. It intentionally measures the editable text box in
 * canvas units rather than relying on whichever font happens to be active
 * in a particular browser.
 */
export function calculateTextAutoHeight(text: string, width: number, style: Pick<TextStyle, "fontSize" | "lineHeight" | "letterSpacing" | "padding" | "autoHeight">): number {
  if (style.autoHeight === false) return 1;
  const padding = Math.max(0, style.padding ?? 0);
  const innerWidth = Math.max(1, width - padding * 2);
  const glyphWidth = Math.max(1, style.fontSize * 0.52 + style.letterSpacing);
  const charactersPerLine = Math.max(1, Math.floor(innerWidth / glyphWidth));
  const explicitLines = text.split("\n");
  const lineCount = explicitLines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return Math.max(1, Math.ceil(lineCount * style.fontSize * style.lineHeight + padding * 2));
}

export function normalizeTextElementGeometry(element: CanonicalTextElement, canvasWidth: number, canvasHeight: number, maxWidth = canvasWidth): CanonicalTextElement {
  if (element.style.autoHeight === false) return element;
  const width = Math.min(Math.max(1, element.width), Math.max(canvasWidth, maxWidth));
  const height = Math.min(canvasHeight, calculateTextAutoHeight(element.text, width, element.style));
  return {
    ...element,
    x: Math.min(Math.max(1 - width, element.x), canvasWidth - 1),
    y: Math.min(Math.max(1 - height, element.y), canvasHeight - 1),
    width,
    height,
  };
}
