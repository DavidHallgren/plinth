import { createDefaultProject, DEFAULT_BACKGROUND } from "./defaults";
import { PlinthError } from "./errors";
import { createId, slugify } from "./ids";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "./schema";
import type { AssetMetadata, Background, OwnedLayer, Project, SceneElement, Screen, Shadow } from "./schema";
import { SceneElementSchema } from "./schema";
import { isAppStorePreset } from "../scene/presets";
import { isDevicePreset, getDevicePreset } from "../devices/presets";
import { deriveAssetDisplayName, normalizeSourceFileName, sanitizeAssetStem } from "./asset-validation";
import { reconcileOverflowLinks } from "../scene/overflow-operations";
import { DEFAULT_BUILT_IN_FONT_ID, getBuiltInFont } from "../fonts/catalog";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  const candidate = asFiniteNumber(value, fallback);
  return candidate > 0 ? candidate : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizePoint(value: unknown, fallback = 0.5): { x: number; y: number } {
  const source = isRecord(value) ? value : {};
  return {
    x: Math.min(1, Math.max(0, asFiniteNumber(source.x, fallback))),
    y: Math.min(1, Math.max(0, asFiniteNumber(source.y, fallback))),
  };
}

function normalizeShadow(value: unknown): Shadow | null {
  if (!isRecord(value)) return null;
  return {
    color: asString(value.color, "#05060a"),
    blur: Math.max(0, asFiniteNumber(value.blur, 0)),
    offsetX: asFiniteNumber(value.offsetX, 0),
    offsetY: asFiniteNumber(value.offsetY, 0),
    opacity: Math.min(1, Math.max(0, asFiniteNumber(value.opacity, 0.2))),
  };
}

function normalizeStops(value: unknown, from: string, to: string) {
  if (!Array.isArray(value)) {
    return [{ offset: 0, color: from }, { offset: 1, color: to }];
  }
  const stops = value
    .filter(isRecord)
    .map((stop) => ({
      offset: Math.min(1, Math.max(0, asFiniteNumber(stop.offset, 0))),
      color: asString(stop.color, from),
    }))
    .sort((left, right) => left.offset - right.offset);
  return stops.length >= 2 ? stops : [{ offset: 0, color: from }, { offset: 1, color: to }];
}

function migrateBackground(value: unknown): Background {
  if (!isRecord(value)) return DEFAULT_BACKGROUND;
  if (value.type === "solid") {
    return { type: "solid", color: asString(value.color, DEFAULT_BACKGROUND.type === "solid" ? DEFAULT_BACKGROUND.color : "#10131a") };
  }
  if (value.type === "transparent") return { type: "transparent" };
  if (value.type === "linear-gradient") {
    const start = isRecord(value.start) ? value.start : {};
    const end = isRecord(value.end) ? value.end : {};
    return {
      type: "linear-gradient",
      stops: normalizeStops(value.stops, "#10131a", "#8b7cff"),
      start: { x: asFiniteNumber(start.x, 0), y: asFiniteNumber(start.y, 0) },
      end: { x: asFiniteNumber(end.x, 1), y: asFiniteNumber(end.y, 1) },
    };
  }
  if (value.type === "radial-gradient") {
    const center = isRecord(value.center) ? value.center : {};
    return {
      type: "radial-gradient",
      stops: normalizeStops(value.stops, "#10131a", "#8b7cff"),
      center: { x: asFiniteNumber(center.x, 0.5), y: asFiniteNumber(center.y, 0.5) },
      radius: Math.max(0.01, asFiniteNumber(value.radius, 0.75)),
    };
  }
  if (value.type === "asset") {
    const texture: Extract<Background, { type: "asset" }>["texture"] = isRecord(value.texture) && (value.texture.type === "noise" || value.texture.type === "texture")
      ? {
        type: value.texture.type as "noise" | "texture",
        seed: Math.min(0xffff_ffff, Math.max(0, Math.round(asFiniteNumber(value.texture.seed, 1)))),
        opacity: Math.min(1, Math.max(0, asFiniteNumber(value.texture.opacity, 0.08))),
        scale: Math.min(16, Math.max(1, Math.round(asFiniteNumber(value.texture.scale, 1)))),
      }
      : null;
    return {
      type: "asset",
      assetPath: legacyAssetPath(value.assetPath ?? value.assetId, []),
      fit: value.fit === "contain" ? "contain" : "cover",
      position: normalizePoint(value.position),
      blur: Math.min(256, Math.max(0, asFiniteNumber(value.blur, 0))),
      overlayColor: asString(value.overlayColor, "#000000"),
      overlayOpacity: Math.min(1, Math.max(0, asFiniteNumber(value.overlayOpacity, 0))),
      texture,
    };
  }
  if (value.type === "gradient") {
    const angle = asFiniteNumber(value.angle, 135) * (Math.PI / 180);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return {
      type: "linear-gradient",
      stops: normalizeStops(undefined, asString(value.from, "#10131a"), asString(value.to, "#8b7cff")),
      start: { x: 0.5 - dx * 0.5, y: 0.5 - dy * 0.5 },
      end: { x: 0.5 + dx * 0.5, y: 0.5 + dy * 0.5 },
    };
  }
  return DEFAULT_BACKGROUND;
}

function migratePreset(value: unknown): Screen["preset"] {
  if (typeof value === "string" && isAppStorePreset(value)) return value;
  return "custom";
}

function safeExtension(value: unknown, fallback = "png"): "png" | "jpg" | "webp" | "svg" {
  const extension = typeof value === "string" ? value.toLowerCase().replace(/^\./, "") : fallback;
  return extension === "jpeg" ? "jpg" : extension === "jpg" || extension === "webp" || extension === "svg" || extension === "png" ? extension : fallback as "png" | "jpg" | "webp" | "svg";
}

function legacyAssetPath(value: unknown, assets: AssetMetadata[], fallbackName = "asset-placeholder"): string {
  if (typeof value === "string") {
    const direct = value.match(/^assets\/([a-z0-9][a-z0-9._-]{0,254})$/i);
    if (direct?.[1]) return `assets/${direct[1].toLowerCase()}`;
    const byId = assets.find((asset) => asset.id === value || asset.path === value);
    if (byId) return byId.path;
  }
  const source = typeof value === "string" ? value.split(/[\\/]/).pop() ?? fallbackName : fallbackName;
  const extension = safeExtension(source.includes(".") ? source.split(".").pop() : undefined);
  return `assets/${sanitizeAssetStem(source)}.${extension}`;
}

function normalizeAsset(value: unknown, index: number): AssetMetadata {
  const source = isRecord(value) ? value : {};
  const originalPath = typeof source.path === "string" ? source.path : undefined;
  const originalName = typeof source.fileName === "string" ? source.fileName : originalPath?.split("/").pop();
  const extension = safeExtension(originalName?.split(".").pop());
  const fileName = `${sanitizeAssetStem(originalName ?? `asset-${index + 1}`)}.${extension}`;
  const path = originalPath?.match(/^assets\/([a-z0-9][a-z0-9._-]{0,254})$/i)?.[1]
    ? `assets/${originalPath.split("/").pop()?.toLowerCase()}`
    : `assets/${fileName}`;
  const sourceMimeType = typeof source.mimeType === "string" ? source.mimeType : "";
  const mimeType = sourceMimeType === "image/png" || sourceMimeType === "image/jpeg" || sourceMimeType === "image/webp" || sourceMimeType === "image/svg+xml"
    ? sourceMimeType
    : extension === "svg" ? "image/svg+xml" : extension === "jpg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
  const contentHash = typeof source.contentHash === "string" && /^[a-f0-9]{64}$/.test(source.contentHash) ? source.contentHash : undefined;
  const sourceFileName = normalizeSourceFileName(asString(source.sourceFileName, originalName ?? fileName));
  return {
    id: asString(source.id, createId("asset")),
    kind: "image",
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 120) : deriveAssetDisplayName(sourceFileName),
    sourceFileName,
    path,
    fileName: path.slice("assets/".length),
    mimeType,
    width: Math.round(asPositiveNumber(source.width, 1)),
    height: Math.round(asPositiveNumber(source.height, 1)),
    byteSize: Math.max(0, Math.round(asFiniteNumber(source.byteSize, 0))),
    ...(contentHash ? { contentHash } : {}),
  };
}

function normalizeAssets(value: unknown): AssetMetadata[] {
  return Array.isArray(value) ? value.map((asset, index) => normalizeAsset(asset, index)) : [];
}

type MigratedElement = SceneElement & { zIndex: number };

function migrateElement(value: unknown, index: number, assets: AssetMetadata[]): MigratedElement | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const type = value.type;
  const base = {
    id: asString(value.id, createId(type)),
    x: asFiniteNumber(value.x, 0),
    y: asFiniteNumber(value.y, 0),
    width: asPositiveNumber(value.width, 120),
    height: asPositiveNumber(value.height, 80),
    rotation: asFiniteNumber(value.rotation, 0),
    opacity: Math.min(1, Math.max(0, asFiniteNumber(value.opacity, 1))),
    zIndex: Number.isInteger(value.zIndex) && Number(value.zIndex) >= 0 ? Number(value.zIndex) : index,
    locked: asBoolean(value.locked, false),
    visible: asBoolean(value.visible, true),
    name: asString(value.name, `${type[0]?.toUpperCase() ?? "E"}${type.slice(1)} ${index + 1}`),
    shadow: normalizeShadow(value.shadow),
  };

  if (type === "device") {
    const frame = value.frame === "browser" || value.frame === "tablet" ? value.frame : "phone";
    const fallbackPreset = frame === "browser" ? "browser-window" : frame === "tablet" ? "generic-modern-ipad" : "iphone-17-pro-max";
    const preset = typeof value.preset === "string" && isDevicePreset(value.preset) ? value.preset : fallbackPreset;
    const definition = getDevicePreset(preset);
    const screenshotValue = value.screenshotPath ?? value.assetPath ?? value.assetId;
    return {
      ...base,
      type: "device",
      preset,
      deviceId: asString(value.deviceId, preset),
      deviceName: asString(value.deviceName, definition?.label ?? "Device"),
      frame,
      frameColor: asString(value.frameColor, definition?.defaultFrameColor ?? "#20242d"),
      screenColor: asString(value.screenColor, definition?.defaultScreenColor ?? "#f6f7fb"),
      screenshotPath: screenshotValue === undefined || screenshotValue === null ? null : legacyAssetPath(screenshotValue, assets),
      screenshotFit: value.screenshotFit === "contain" || value.screenshotFit === "stretch" ? value.screenshotFit : "cover",
      screenshotPosition: normalizePoint(value.screenshotPosition ?? value.position),
      bezelStyle: value.bezelStyle === "metallic" ? "metallic" : "solid",
      cornerRadius: asNullableNumber(value.cornerRadius),
      screenCornerRadius: asNullableNumber(value.screenCornerRadius),
      showGlare: asBoolean(value.showGlare, false),
      showCamera: asBoolean(value.showCamera, true),
    };
  }

  if (type === "text") {
    const style = isRecord(value.style) ? value.style : {};
    return {
      ...base,
      type: "text",
      text: typeof value.text === "string" ? value.text : "Text",
      style: {
        fontFamilyId: DEFAULT_BUILT_IN_FONT_ID,
        fontSize: asPositiveNumber(style.fontSize, 32),
        fontWeight: Math.min(900, Math.max(100, Math.round(asFiniteNumber(style.fontWeight, 400)))),
        italic: asBoolean(style.italic, false),
        underline: asBoolean(style.underline, false),
        lineHeight: asPositiveNumber(style.lineHeight, 1.2),
        letterSpacing: asFiniteNumber(style.letterSpacing, 0),
        color: asString(style.color, "#ffffff"),
        align: style.align === "center" || style.align === "right" ? style.align : "left",
        backgroundColor: typeof style.backgroundColor === "string" ? style.backgroundColor : null,
        padding: Math.max(0, asFiniteNumber(style.padding, 0)),
        backgroundRadius: Math.max(0, asFiniteNumber(style.backgroundRadius, 0)),
        shadow: normalizeShadow(style.shadow),
        autoHeight: asBoolean(style.autoHeight, true),
      },
    };
  }

  if (type === "image") {
    return {
      ...base,
      type: "image",
      assetPath: legacyAssetPath(value.assetPath ?? value.assetId, assets),
      fit: value.fit === "contain" ? "contain" : value.fit === "fill" || value.fit === "stretch" ? "stretch" : "cover",
      position: normalizePoint(value.position),
      cornerRadius: Math.max(0, asFiniteNumber(value.cornerRadius, 0)),
      alt: typeof value.alt === "string" ? value.alt : "Asset placeholder",
    };
  }

  if (type === "shape") {
    const shape = value.shape === "rounded-rectangle" || value.shape === "ellipse" || value.shape === "line" ? value.shape : "rectangle";
    return {
      ...base,
      type: "shape",
      shape,
      fill: asString(value.fill, "#8b7cff"),
      stroke: asString(value.stroke, "#8b7cff"),
      strokeWidth: Math.max(0, asFiniteNumber(value.strokeWidth, 0)),
      radius: Math.max(0, asFiniteNumber(value.radius, 0)),
    };
  }

  return null;
}

function canonicalMigratedElement(element: MigratedElement): SceneElement {
  const { zIndex: _zIndex, ...canonical } = element;
  return SceneElementSchema.parse(canonical);
}

type LegacyScreen = Omit<Screen, "createdAt" | "updatedAt"> & {
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

function legacyScreen(value: unknown, index: number, now: string, assets: AssetMetadata[]): LegacyScreen {
  const source = isRecord(value) ? value : {};
  const name = asString(source.name, asString(source.title, `Composition ${index + 1}`));
  const width = Math.round(asPositiveNumber(source.width, 1320));
  const height = Math.round(asPositiveNumber(source.height, 2868));
  const rawElements = Array.isArray(source.elements)
    ? source.elements
    : Array.isArray(source.layers)
      ? source.layers.filter((layer): layer is Record<string, unknown> => isRecord(layer) && layer.kind === "owned").map((layer) => layer.element)
      : [];
  const elements = rawElements
    .map((element, elementIndex) => migrateElement(element, elementIndex, assets))
    .filter((element): element is MigratedElement => element !== null)
    .sort((left, right) => ((left as SceneElement & { zIndex?: number }).zIndex ?? 0) - ((right as SceneElement & { zIndex?: number }).zIndex ?? 0));
  const layers: OwnedLayer[] = elements.map((element) => ({
    kind: "owned",
    element: canonicalMigratedElement(element),
    overflow: false,
  }));

  return {
    id: asString(source.id, createId("screen")),
    name,
    slug: slugify(asString(source.slug, name), "composition"),
    exportSlug: slugify(asString(source.exportSlug, asString(source.exportFileName, asString(source.slug, name))), "composition"),
    preset: migratePreset(source.preset),
    width,
    height,
    background: migrateBackground(source.background),
    layers,
    notes: typeof source.notes === "string" ? source.notes : "",
    createdAt: asString(source.createdAt, now),
    updatedAt: asString(source.updatedAt, now),
  };
}

function normalizeSettings(value: unknown, starter: Project["settings"]): Project["settings"] {
  if (!isRecord(value)) return starter;
  const grid = isRecord(value.grid) ? value.grid : {};
  const presetCandidate = typeof value.defaultScreenPreset === "string"
    ? value.defaultScreenPreset
    : typeof value.defaultDocumentPreset === "string" ? value.defaultDocumentPreset : "";
  const defaultScreenPreset = isAppStorePreset(presetCandidate) ? presetCandidate : "iphone-6-9";
  return {
    autosave: asBoolean(value.autosave, starter.autosave),
    autosaveDelayMs: Math.min(60_000, Math.max(100, Math.round(asFiniteNumber(value.autosaveDelayMs, starter.autosaveDelayMs)))),
    defaultScreenPreset,
    exportDirectory: typeof value.exportDirectory === "string" && value.exportDirectory.trim()
      ? value.exportDirectory.trim()
      : null,
    grid: {
      enabled: asBoolean(grid.enabled, starter.grid.enabled),
      size: Math.max(1, asFiniteNumber(grid.size, starter.grid.size)),
      snap: asBoolean(grid.snap, starter.grid.snap),
    },
  };
}

function migrateVersionOne(source: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const name = asString(source.name, "Migrated project");
  const starter = createDefaultProject(name, {
    now,
    id: typeof source.id === "string" ? source.id : undefined,
    slug: typeof source.slug === "string" ? slugify(source.slug) : slugify(name),
    deckCount: 1,
    screenCount: 1,
  });
  const starterDeck = starter.decks[0];
  const starterScreen = starterDeck?.screens[0];
  if (!starterDeck || !starterScreen) throw new Error("The default project did not contain a starter screen.");
  const assets = normalizeAssets(source.assets);
  const rawDocuments = Array.isArray(source.documents) ? source.documents : [];
  const fallbackDocument: LegacyScreen = {
    ...starterScreen,
    width: starterDeck.width,
    height: starterDeck.height,
  };
  const documents = rawDocuments.length > 0
    ? rawDocuments.map((document, index) => legacyScreen(document, index, now, assets))
    : [fallbackDocument];
  const { decks: _decks, ...starterWithoutDecks } = starter;

  return {
    ...starterWithoutDecks,
    schemaVersion: 5,
    description: typeof source.description === "string" ? source.description : starter.description,
    settings: normalizeSettings(source.settings, starter.settings),
    background: migrateBackground(source.background),
    assets,
    documents,
    updatedAt: asString(source.updatedAt, now),
  };
}

function migrateVersionZero(source: Record<string, unknown>): Record<string, unknown> {
  return migrateVersionOne({
    ...source,
    schemaVersion: 1,
    documents: Array.isArray(source.documents) ? source.documents : [],
  });
}

function migrateVersionTwo(source: Record<string, unknown>): Record<string, unknown> {
  return migrateVersionOne({
    ...source,
    schemaVersion: 1,
    documents: Array.isArray(source.documents) ? source.documents : [],
  });
}

function migrateVersionThree(source: Record<string, unknown>): Record<string, unknown> {
  const rawDocuments = Array.isArray(source.documents) ? source.documents : [];
  const documents = rawDocuments.map((value, index) => {
    if (!isRecord(value)) return value;
    const name = asString(value.name, `Composition ${index + 1}`);
    return {
      ...value,
      exportSlug: slugify(asString(value.exportSlug, asString(value.exportFileName, asString(value.slug, name))), "composition"),
    };
  });
  return migrateVersionFour({ ...source, schemaVersion: 4, documents });
}

function migrateVersionFour(source: Record<string, unknown>): Record<string, unknown> {
  const settings = isRecord(source.settings) ? source.settings : {};
  return {
    ...source,
    schemaVersion: 5,
    settings: {
      ...settings,
      exportDirectory: typeof settings.exportDirectory === "string" && settings.exportDirectory.trim()
        ? settings.exportDirectory.trim()
        : null,
    },
  };
}

function uniqueMigrationSlug(proposed: string, used: Set<string>, fallback: string): string {
  const base = slugify(proposed, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function migrateVersionFive(source: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const name = asString(source.name, "Migrated project");
  const starter = createDefaultProject(name, {
    now,
    id: typeof source.id === "string" ? source.id : undefined,
    slug: typeof source.slug === "string" ? slugify(source.slug) : slugify(name),
  });
  const assets = normalizeAssets(source.assets);
  const rawDocuments = Array.isArray(source.documents) ? source.documents : [];
  const documents = rawDocuments.length > 0
    ? rawDocuments.map((document, index) => legacyScreen(document, index, now, assets))
    : (() => {
      const deck = starter.decks[0];
      const screen = deck?.screens[0];
      if (!deck || !screen) throw new Error("The default project did not contain a starter screen.");
      return [{ ...screen, width: deck.width, height: deck.height } satisfies LegacyScreen];
    })();

  const groups = new Map<string, { width: number; height: number; documents: LegacyScreen[] }>();
  for (const document of documents) {
    const width = Math.round(asPositiveNumber(document.width, 1320));
    const height = Math.round(asPositiveNumber(document.height, 2868));
    const key = `${width}x${height}`;
    const group = groups.get(key) ?? { width, height, documents: [] };
    group.documents.push({ ...document, width, height });
    groups.set(key, group);
  }

  const deckSlugs = new Set<string>();
  const screenSlugs = new Set<string>();
  const screenExportSlugs = new Set<string>();
  const decks = [...groups.values()].map((group, groupIndex) => {
    const first = group.documents[0];
    if (!first) throw new Error("A migrated deck did not contain a screen.");
    const deckName = groups.size === 1 ? `${name} deck` : `${name} ${group.width}×${group.height}`;
    const deckSlug = uniqueMigrationSlug(`${source.slug ?? name}-${group.width}x${group.height}`, deckSlugs, `deck-${groupIndex + 1}`);
    const screens = group.documents.map((document, screenIndex) => {
      const { width: _width, height: _height, ...screen } = document;
      return {
        ...screen,
        slug: uniqueMigrationSlug(screen.slug, screenSlugs, `screen-${screenIndex + 1}`),
        exportSlug: uniqueMigrationSlug(screen.exportSlug, screenExportSlugs, `screen-${screenIndex + 1}`),
      };
    });
    const createdAt = first.createdAt;
    const updatedAt = group.documents.reduce((latest, document) => document.updatedAt > latest ? document.updatedAt : latest, first.updatedAt);
    return {
      id: `deck_${slugify(`${source.id ?? name}-${group.width}x${group.height}`, `deck-${groupIndex + 1}`)}`,
      slug: deckSlug,
      name: deckName,
      width: group.width,
      height: group.height,
      screens,
      createdAt,
      updatedAt,
    };
  });

  const { decks: _starterDecks, ...starterWithoutDecks } = starter;
  return {
    ...starterWithoutDecks,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    description: typeof source.description === "string" ? source.description : starter.description,
    settings: normalizeSettings(source.settings, starter.settings),
    background: migrateBackground(source.background),
    assets,
    decks,
    createdAt: asString(source.createdAt, now),
    updatedAt: asString(source.updatedAt, now),
  };
}

function migrateVersionSix(source: Record<string, unknown>): Record<string, unknown> {
  const assets = normalizeAssets(source.assets);
  const rawDecks = Array.isArray(source.decks) ? source.decks : [];
  const decks = rawDecks.map((deckValue) => {
    if (!isRecord(deckValue)) return deckValue;
    const rawScreens = Array.isArray(deckValue.screens) ? deckValue.screens : [];
    return {
      ...deckValue,
      screens: rawScreens.map((screenValue) => {
        if (!isRecord(screenValue)) return screenValue;
        const rawElements = Array.isArray(screenValue.elements) ? screenValue.elements : [];
        const elements = rawElements
          .map((element, elementIndex) => migrateElement(element, elementIndex, assets))
          .filter((element): element is MigratedElement => element !== null)
          .sort((left, right) => ((left as SceneElement & { zIndex?: number }).zIndex ?? 0) - ((right as SceneElement & { zIndex?: number }).zIndex ?? 0))
          .map((element) => ({
            kind: "owned" as const,
            element: canonicalMigratedElement(element),
            overflow: false,
          } satisfies OwnedLayer));
        const { elements: _elements, ...screenWithoutElements } = screenValue;
        return { ...screenWithoutElements, layers: elements };
      }),
    };
  });
  return { ...source, schemaVersion: CURRENT_SCHEMA_VERSION, assets, decks };
}

function migrateVersionSeven(source: Record<string, unknown>): Record<string, unknown> {
  const rawDecks = Array.isArray(source.decks) ? source.decks : [];
  return {
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    assets: normalizeAssets(source.assets),
    background: migrateBackground(source.background),
    decks: rawDecks.map((deckValue) => {
      if (!isRecord(deckValue)) return deckValue;
      const rawScreens = Array.isArray(deckValue.screens) ? deckValue.screens : [];
      return {
        ...deckValue,
        screens: rawScreens.map((screenValue) => isRecord(screenValue)
          ? { ...screenValue, background: migrateBackground(screenValue.background) }
          : screenValue),
      };
    }),
  };
}

function migrateVersionEight(source: Record<string, unknown>): Record<string, unknown> {
  return {
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    assets: normalizeAssets(source.assets),
  };
}

function migrateVersionNine(source: Record<string, unknown>): Record<string, unknown> {
  const rawDecks = Array.isArray(source.decks) ? source.decks : [];
  return {
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    fonts: [],
    decks: rawDecks.map((deckValue) => {
      if (!isRecord(deckValue)) return deckValue;
      const screens = Array.isArray(deckValue.screens) ? deckValue.screens : [];
      return {
        ...deckValue,
        screens: screens.map((screenValue) => {
          if (!isRecord(screenValue)) return screenValue;
          const layers = Array.isArray(screenValue.layers) ? screenValue.layers : [];
          return {
            ...screenValue,
            layers: layers.map((layerValue) => {
              if (!isRecord(layerValue) || layerValue.kind !== "owned" || !isRecord(layerValue.element) || layerValue.element.type !== "text") return layerValue;
              const element = layerValue.element;
              const style = isRecord(element.style) ? element.style : {};
              const { fontFamily: _fontFamily, ...styleWithoutFamily } = style;
              return {
                ...layerValue,
                element: { ...element, style: { ...styleWithoutFamily, fontFamilyId: DEFAULT_BUILT_IN_FONT_ID } },
              };
            }),
          };
        }),
      };
    }),
  };
}

function migrateVersionTen(source: Record<string, unknown>): Record<string, unknown> {
  const rawDecks = Array.isArray(source.decks) ? source.decks : [];
  return {
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    decks: rawDecks.map((deckValue) => isRecord(deckValue) ? { ...deckValue, groups: [] } : deckValue),
  };
}

export function migrateProject(input: unknown): unknown {
  if (!isRecord(input)) {
    throw new PlinthError("SCHEMA_INVALID", 422, "Project data must be a JSON object.");
  }

  const versionValue = input.schemaVersion ?? input.version ?? 0;
  if (typeof versionValue !== "number" || !Number.isInteger(versionValue) || versionValue < 0) {
    throw new PlinthError("SCHEMA_INVALID", 422, "Project schemaVersion must be a non-negative integer.");
  }

  if (versionValue > CURRENT_SCHEMA_VERSION) {
    throw new PlinthError(
      "SCHEMA_VERSION_UNSUPPORTED",
      422,
      `Project schema version ${versionValue} is newer than this Plinth build supports.`,
      { currentVersion: CURRENT_SCHEMA_VERSION },
    );
  }

  if (versionValue === 0) return migrateVersionTen(migrateVersionNine(migrateVersionFive(migrateVersionZero(input))));
  if (versionValue === 1) return migrateVersionTen(migrateVersionNine(migrateVersionFive(migrateVersionOne(input))));
  if (versionValue === 2) return migrateVersionTen(migrateVersionNine(migrateVersionFive(migrateVersionTwo(input))));
  if (versionValue === 3) return migrateVersionTen(migrateVersionNine(migrateVersionFive(migrateVersionThree(input))));
  if (versionValue === 4) return migrateVersionTen(migrateVersionNine(migrateVersionFive(migrateVersionFour(input))));
  if (versionValue === 5) return migrateVersionTen(migrateVersionNine(migrateVersionFive(input)));
  if (versionValue === 6) return migrateVersionTen(migrateVersionNine(migrateVersionEight(migrateVersionSeven(migrateVersionSix(input)))));
  if (versionValue === 7) return migrateVersionTen(migrateVersionNine(migrateVersionEight(migrateVersionSeven(input))));
  if (versionValue === 8) return migrateVersionTen(migrateVersionNine(migrateVersionEight(input)));
  if (versionValue === 9) return migrateVersionTen(migrateVersionNine(input));
  if (versionValue === 10) return migrateVersionTen(input);
  return input;
}

export type ProjectLoadWarning = { code: "FONT_SUBSTITUTED"; message: string; fontFamilyId: string };

export function parseProjectWithWarnings(input: unknown): { project: Project; warnings: ProjectLoadWarning[] } {
  const migrated = migrateProject(input);
  const warnings: ProjectLoadWarning[] = [];
  const source = isRecord(migrated) ? migrated : {};
  const projectFontIds = new Set(Array.isArray(source.fonts) ? source.fonts.filter(isRecord).map((font) => font.id).filter((id): id is string => typeof id === "string") : []);
  const decks = Array.isArray(source.decks) ? source.decks : [];
  const normalizedInput = {
    ...source,
    decks: decks.map((deckValue) => {
      if (!isRecord(deckValue)) return deckValue;
      const screens = Array.isArray(deckValue.screens) ? deckValue.screens : [];
      return { ...deckValue, screens: screens.map((screenValue) => {
        if (!isRecord(screenValue)) return screenValue;
        const layers = Array.isArray(screenValue.layers) ? screenValue.layers : [];
        return { ...screenValue, layers: layers.map((layerValue) => {
          if (!isRecord(layerValue) || layerValue.kind !== "owned" || !isRecord(layerValue.element) || layerValue.element.type !== "text" || !isRecord(layerValue.element.style)) return layerValue;
          const id = layerValue.element.style.fontFamilyId;
          if (typeof id !== "string") return layerValue;
          const available = id.startsWith("builtin:") ? Boolean(getBuiltInFont(id as `builtin:${string}`)) : projectFontIds.has(id);
          if (available) return layerValue;
          if (!warnings.some((warning) => warning.fontFamilyId === id)) warnings.push({ code: "FONT_SUBSTITUTED", fontFamilyId: id, message: `Font "${id}" is unavailable and was changed to Inter.` });
          return { ...layerValue, element: { ...layerValue.element, style: { ...layerValue.element.style, fontFamilyId: DEFAULT_BUILT_IN_FONT_ID } } };
        }) };
      }) };
    }),
  };
  const result = ProjectSchema.safeParse(normalizedInput);

  if (!result.success) {
    const issueSummary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
      .join("; ");
    throw new PlinthError("SCHEMA_INVALID", 422, `Project data failed schema validation: ${issueSummary}`, {
      issues: result.error.issues,
      summary: issueSummary,
    });
  }

  // Persisted links are required to name a real owner, but links can become
  // stale after hand-edited geometry. Normalize that recoverable case on load.
  return { project: reconcileOverflowLinks(result.data, { transferOwnership: false }), warnings };
}

export function parseProject(input: unknown): Project {
  return parseProjectWithWarnings(input).project;
}
