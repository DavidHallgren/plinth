import type { SceneElement, TextStyle } from "../lib/schema";

type CanonicalTextElement = Extract<SceneElement, { type: "text" }>;
export type TextMeasurementStyle = Pick<TextStyle, "fontSize" | "lineHeight" | "letterSpacing" | "padding" | "autoHeight"> &
  Partial<Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">>;
export type TextWidthMeasurer = (text: string, style: TextMeasurementStyle) => number | null;

const DEFAULT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, sans-serif";
const DEFAULT_FONT_WEIGHT = 400;

type CanvasTextContext = {
  font: string;
  measureText: (text: string) => TextMetrics;
};

let cachedMeasurementContext: CanvasTextContext | null = null;

function measurementContext(): CanvasTextContext | null {
  if (cachedMeasurementContext) return cachedMeasurementContext;

  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) return (cachedMeasurementContext = context);
    }
    if (typeof OffscreenCanvas !== "undefined") {
      const context = new OffscreenCanvas(1, 1).getContext("2d");
      if (context) return (cachedMeasurementContext = context);
    }
  } catch {
    // Bun's server runtime has no canvas implementation. Use the fallback
    // estimator below in that environment.
  }

  return null;
}

function normalizeFontFamily(fontFamily: string): string {
  return fontFamily
    .split(",")
    .map((family) => {
      const trimmed = family.trim();
      const hasSpace = trimmed.includes(" ");
      const hasQuotes = trimmed.includes('"') || trimmed.includes("'");
      return hasSpace && !hasQuotes ? `"${trimmed}"` : trimmed;
    })
    .join(", ");
}

function canvasFont(style: TextMeasurementStyle): string {
  const bold = (style.fontWeight ?? DEFAULT_FONT_WEIGHT) >= 700;
  const fontStyle = style.italic ? (bold ? "italic bold" : "italic") : bold ? "bold" : "normal";
  const family = normalizeFontFamily(style.fontFamily ?? DEFAULT_FONT_FAMILY);
  return `${fontStyle} normal ${style.fontSize}px ${family}`;
}

/**
 * Measures text using the same Canvas 2D font model Konva uses. The callback
 * includes letter spacing because Konva adds it to the measured width too.
 */
function measureTextWithCanvas(text: string, style: TextMeasurementStyle): number | null {
  const context = measurementContext();
  if (!context) return null;

  try {
    context.font = canvasFont(style);
    const width = context.measureText(text).width + style.letterSpacing * text.length;
    return Number.isFinite(width) ? width : null;
  } catch {
    return null;
  }
}

function textUnits(text: string): string[] {
  return [...text];
}

function longestFittingPrefix(units: string[], maxWidth: number, style: TextMeasurementStyle, measureText: TextWidthMeasurer): number | null {
  let low = 0;
  let high = units.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const width = measureText(units.slice(0, mid).join(""), style);
    if (width === null) return null;
    if (width <= maxWidth) low = mid;
    else high = mid - 1;
  }

  return low;
}

function measuredLineCount(text: string, maxWidth: number, style: TextMeasurementStyle, measureText: TextWidthMeasurer): number | null {
  let lineCount = 0;

  for (const paragraph of text.split("\n")) {
    let remaining = textUnits(paragraph);
    if (remaining.length === 0) {
      lineCount += 1;
      continue;
    }

    while (remaining.length > 0) {
      const line = remaining.join("");
      const lineWidth = measureText(line, style);
      if (lineWidth === null) return null;
      if (lineWidth <= maxWidth) {
        lineCount += 1;
        break;
      }

      const fittingLength = longestFittingPrefix(remaining, maxWidth, style, measureText);
      if (fittingLength === null) return null;

      // Konva's default `word` wrapping prefers the last space or dash that
      // fits, but falls back to character wrapping for a long word.
      let wrapIndex = Math.max(1, fittingLength);
      const nextUnit = remaining[fittingLength];
      if (nextUnit !== " " && nextUnit !== "-") {
        const fittingText = remaining.slice(0, fittingLength);
        const lastSpace = fittingText.lastIndexOf(" ");
        const lastDash = fittingText.lastIndexOf("-");
        const wordWrapIndex = Math.max(lastSpace, lastDash) + 1;
        if (wordWrapIndex > 0) wrapIndex = wordWrapIndex;
      }

      lineCount += 1;
      remaining = textUnits(remaining.slice(wrapIndex).join("").trimStart());
    }
  }

  return lineCount;
}

function estimatedLineCount(text: string, innerWidth: number, style: TextMeasurementStyle): number {
  const glyphWidth = Math.max(1, style.fontSize * 0.52 + style.letterSpacing);
  const charactersPerLine = Math.max(1, Math.floor(innerWidth / glyphWidth));
  const explicitLines = text.split("\n");
  return explicitLines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

/**
 * Calculates the editable text box height in canvas units. Browser/editor
 * calls use Canvas 2D metrics so wrapping follows the active font; Bun/server
 * calls fall back to a deterministic estimate because they have no font
 * measurement environment.
 */
export function calculateTextAutoHeight(text: string, width: number, style: TextMeasurementStyle, measureText: TextWidthMeasurer = measureTextWithCanvas): number {
  if (style.autoHeight === false) return 1;
  const padding = Math.max(0, style.padding ?? 0);
  const innerWidth = Math.max(1, width - padding * 2);
  const lineCount = measuredLineCount(text, innerWidth, style, measureText) ?? estimatedLineCount(text, innerWidth, style);
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
