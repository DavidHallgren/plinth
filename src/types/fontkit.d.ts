declare module "fontkit" {
  export type Font = {
    type?: string;
    familyName?: string;
    subfamilyName?: string;
    fullName?: string;
    postscriptName?: string;
    italicAngle?: number;
    variationAxes?: Record<string, { min: number; max: number; default: number; name?: string }>;
  };
  export function create(buffer: Uint8Array): Font;
}
