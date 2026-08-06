export type FontFaceStylesheet = {
  packageName: string;
  cssFiles: readonly string[];
};

// This manifest is consumed by scripts/generate-styles.ts. Fontsource's
// variable-face CSS needs a small compatibility normalization before Bun
// bundles it, so these files intentionally are not imported as side effects.
export const FONT_FACE_STYLESHEETS = [
  { packageName: "@fontsource-variable/inter", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/dm-sans", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/manrope", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/space-grotesk", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/source-sans-3", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/quicksand", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/nunito", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/lora", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/source-serif-4", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/fraunces", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/jetbrains-mono", cssFiles: ["wght.css", "wght-italic.css"] },
  { packageName: "@fontsource-variable/noto-sans-sc", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/noto-sans-tc", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/noto-sans-jp", cssFiles: ["wght.css"] },
  { packageName: "@fontsource-variable/noto-sans-kr", cssFiles: ["wght.css"] },
  {
    packageName: "@fontsource/ibm-plex-mono",
    cssFiles: [
      "100.css", "100-italic.css", "200.css", "200-italic.css", "300.css", "300-italic.css", "400.css", "400-italic.css",
      "500.css", "500-italic.css", "600.css", "600-italic.css", "700.css", "700-italic.css",
    ],
  },
  { packageName: "@fontsource/bebas-neue", cssFiles: ["index.css"] },
] as const satisfies readonly FontFaceStylesheet[];
