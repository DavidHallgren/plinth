export type BuiltInFontId = `builtin:${string}`;
export type BuiltInFontStyle = "normal" | "italic";
export type BuiltInFontCategory = "sans-serif" | "serif" | "monospace" | "display";

export type BuiltInFontWeight =
  | { kind: "variable"; min: number; max: number; step: number }
  | { kind: "static"; values: readonly number[] };

export type BuiltInFont = {
  id: BuiltInFontId;
  name: string;
  cssFamily: string;
  category: BuiltInFontCategory;
  packageName: string;
  packageVersion: string;
  sourceVersion: string;
  fontsourceUrl: string;
  styles: readonly BuiltInFontStyle[];
  weight: BuiltInFontWeight;
  subsets: readonly string[];
  cjk: boolean;
  license: {
    type: "OFL-1.1";
    url: string;
    attribution: string;
  };
};

const FONTSOURCE_VERSION = "5.3.0";
const OFL_URL = "https://openfontlicense.org";

function font(values: Omit<BuiltInFont, "packageVersion" | "fontsourceUrl"> & { slug: string }): BuiltInFont {
  const { slug, ...metadata } = values;
  return {
    ...metadata,
    packageVersion: FONTSOURCE_VERSION,
    fontsourceUrl: `https://fontsource.org/fonts/${slug}`,
  };
}

export const DEFAULT_BUILT_IN_FONT_ID = "builtin:inter" satisfies BuiltInFontId;

export const BUILT_IN_FONTS = [
  font({
    id: "builtin:inter",
    slug: "inter",
    name: "Inter",
    cssFamily: "Inter Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/inter",
    sourceVersion: "v20",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)." },
  }),
  font({
    id: "builtin:dm-sans",
    slug: "dm-sans",
    name: "DM Sans",
    cssFamily: "DM Sans Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/dm-sans",
    sourceVersion: "v17",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["latin", "latin-ext"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)." },
  }),
  font({
    id: "builtin:manrope",
    slug: "manrope",
    name: "Manrope",
    cssFamily: "Manrope Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/manrope",
    sourceVersion: "v20",
    styles: ["normal"],
    weight: { kind: "variable", min: 200, max: 800, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)." },
  }),
  font({
    id: "builtin:space-grotesk",
    slug: "space-grotesk",
    name: "Space Grotesk",
    cssFamily: "Space Grotesk Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/space-grotesk",
    sourceVersion: "v22",
    styles: ["normal"],
    weight: { kind: "variable", min: 300, max: 700, step: 1 },
    subsets: ["latin", "latin-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)." },
  }),
  font({
    id: "builtin:source-sans-3",
    slug: "source-sans-3",
    name: "Source Sans 3",
    cssFamily: "Source Sans 3 Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/source-sans-3",
    sourceVersion: "v19",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 200, max: 900, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
  font({
    id: "builtin:quicksand",
    slug: "quicksand",
    name: "Quicksand",
    cssFamily: "Quicksand Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/quicksand",
    sourceVersion: "v37",
    styles: ["normal"],
    weight: { kind: "variable", min: 300, max: 700, step: 1 },
    subsets: ["latin", "latin-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2011 The Quicksand Project Authors (https://github.com/andrew-paglinawan/QuicksandFamily)." },
  }),
  font({
    id: "builtin:nunito",
    slug: "nunito",
    name: "Nunito",
    cssFamily: "Nunito Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/nunito",
    sourceVersion: "v32",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 200, max: 900, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)." },
  }),
  font({
    id: "builtin:lora",
    slug: "lora",
    name: "Lora",
    cssFamily: "Lora Variable",
    category: "serif",
    packageName: "@fontsource-variable/lora",
    sourceVersion: "v37",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 400, max: 700, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese", "math", "symbols"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name Lora." },
  }),
  font({
    id: "builtin:source-serif-4",
    slug: "source-serif-4",
    name: "Source Serif 4",
    cssFamily: "Source Serif 4 Variable",
    category: "serif",
    packageName: "@fontsource-variable/source-serif-4",
    sourceVersion: "v14",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 200, max: 900, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
  font({
    id: "builtin:fraunces",
    slug: "fraunces",
    name: "Fraunces",
    cssFamily: "Fraunces Variable",
    category: "serif",
    packageName: "@fontsource-variable/fraunces",
    sourceVersion: "v38",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["latin", "latin-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2020 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)." },
  }),
  font({
    id: "builtin:jetbrains-mono",
    slug: "jetbrains-mono",
    name: "JetBrains Mono",
    cssFamily: "JetBrains Mono Variable",
    category: "monospace",
    packageName: "@fontsource-variable/jetbrains-mono",
    sourceVersion: "v24",
    styles: ["normal", "italic"],
    weight: { kind: "variable", min: 100, max: 800, step: 1 },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)." },
  }),
  font({
    id: "builtin:ibm-plex-mono",
    slug: "ibm-plex-mono",
    name: "IBM Plex Mono",
    cssFamily: "IBM Plex Mono",
    category: "monospace",
    packageName: "@fontsource/ibm-plex-mono",
    sourceVersion: "v20",
    styles: ["normal", "italic"],
    weight: { kind: "static", values: [100, 200, 300, 400, 500, 600, 700] },
    subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2017 IBM Corp. All rights reserved." },
  }),
  font({
    id: "builtin:bebas-neue",
    slug: "bebas-neue",
    name: "Bebas Neue",
    cssFamily: "Bebas Neue",
    category: "display",
    packageName: "@fontsource/bebas-neue",
    sourceVersion: "v16",
    styles: ["normal"],
    weight: { kind: "static", values: [400] },
    subsets: ["latin", "latin-ext"],
    cjk: false,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Copyright 2019 The Bebas Neue Project Authors (https://github.com/dharmatype/Bebas-Neue)." },
  }),
  font({
    id: "builtin:noto-sans-sc",
    slug: "noto-sans-sc",
    name: "Noto Sans SC",
    cssFamily: "Noto Sans SC Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/noto-sans-sc",
    sourceVersion: "v40",
    styles: ["normal"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["chinese-simplified", "latin", "latin-ext", "cyrillic", "vietnamese"],
    cjk: true,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
  font({
    id: "builtin:noto-sans-tc",
    slug: "noto-sans-tc",
    name: "Noto Sans TC",
    cssFamily: "Noto Sans TC Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/noto-sans-tc",
    sourceVersion: "v39",
    styles: ["normal"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["chinese-traditional", "latin", "latin-ext", "cyrillic", "vietnamese"],
    cjk: true,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
  font({
    id: "builtin:noto-sans-jp",
    slug: "noto-sans-jp",
    name: "Noto Sans JP",
    cssFamily: "Noto Sans JP Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/noto-sans-jp",
    sourceVersion: "v56",
    styles: ["normal"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["japanese", "latin", "latin-ext", "cyrillic", "vietnamese"],
    cjk: true,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
  font({
    id: "builtin:noto-sans-kr",
    slug: "noto-sans-kr",
    name: "Noto Sans KR",
    cssFamily: "Noto Sans KR Variable",
    category: "sans-serif",
    packageName: "@fontsource-variable/noto-sans-kr",
    sourceVersion: "v39",
    styles: ["normal"],
    weight: { kind: "variable", min: 100, max: 900, step: 1 },
    subsets: ["korean", "latin", "latin-ext", "cyrillic", "vietnamese"],
    cjk: true,
    license: { type: "OFL-1.1", url: OFL_URL, attribution: "Google Inc." },
  }),
] as const satisfies readonly BuiltInFont[];

export function getBuiltInFont(id: BuiltInFontId): BuiltInFont | undefined {
  return BUILT_IN_FONTS.find((candidate) => candidate.id === id);
}

export function isBuiltInFontId(id: string): id is BuiltInFontId {
  return id.startsWith("builtin:");
}

export function projectFontCssFamily(id: string): string {
  return `Plinth Project ${id.replace(/[^a-z0-9_-]/gi, "_")}`;
}

export function fontCssFamily(id: string): string {
  if (isBuiltInFontId(id)) return getBuiltInFont(id)?.cssFamily ?? getBuiltInFont(DEFAULT_BUILT_IN_FONT_ID)?.cssFamily ?? "Inter Variable";
  return projectFontCssFamily(id);
}

export function quotedFontCssFamily(id: string): string {
  return `"${fontCssFamily(id).replaceAll('"', '\\"')}"`;
}

export function fontWeightRange(id: string): { min: number; max: number; step: number } {
  const definition = isBuiltInFontId(id) ? getBuiltInFont(id) : undefined;
  if (!definition) return { min: 100, max: 900, step: 1 };
  if (definition.weight.kind === "variable") return definition.weight;
  return {
    min: Math.min(...definition.weight.values),
    max: Math.max(...definition.weight.values),
    step: 100,
  };
}
