export type KonvaFontStyle = string;

export function konvaFontStyle(fontWeight: number, italic: boolean): KonvaFontStyle {
  const weight = Number.isFinite(fontWeight) ? Math.min(900, Math.max(100, Math.round(fontWeight))) : 400;
  return `${italic ? "italic" : "normal"} ${weight}`;
}
