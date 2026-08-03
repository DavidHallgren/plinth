export type KonvaFontStyle = "normal" | "bold" | "italic" | "italic bold";

export function konvaFontStyle(fontWeight: number, italic: boolean): KonvaFontStyle {
  const bold = Number.isFinite(fontWeight) && fontWeight >= 700;
  if (italic && bold) return "italic bold";
  if (italic) return "italic";
  if (bold) return "bold";
  return "normal";
}
