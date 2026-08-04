import { z } from "zod";
import { APP_STORE_PRESETS } from "../scene/presets";

export const CURRENT_SCHEMA_VERSION = 7 as const;

const IdSchema = z.string().min(1).max(96);
const ColorSchema = z.string().min(1).max(128);
const TimestampSchema = z.string().datetime({ offset: true });
export const DimensionSchema = z.number().int().positive().max(100_000);
export const DeckSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96);
export const ScreenSlugSchema = DeckSlugSchema;
/** @deprecated Use ScreenSlugSchema. */
export const DocumentSlugSchema = ScreenSlugSchema;
export const AssetPathSchema = z.string().regex(/^assets\/[a-z0-9][a-z0-9._-]{0,254}$/);
export type AssetPath = z.infer<typeof AssetPathSchema>;
export const ImageFitSchema = z.enum(["contain", "cover", "stretch"]);
export type ImageFit = z.infer<typeof ImageFitSchema>;
export const AssetMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export const ScreenPresetSchema = z.enum([
  "iphone-6-9",
  "iphone-6-7",
  "iphone-6-5",
  "iphone-5-5",
  "ipad-13",
  "custom",
  // These values remain readable so a v1 document can be migrated without
  // throwing away its dimensions. Migrations convert them to `custom`.
  "blank",
  "browser",
  "phone",
  "social",
]);
export type ScreenPreset = z.infer<typeof ScreenPresetSchema>;
export type AppStoreScreenPreset = (typeof APP_STORE_PRESETS)[number]["id"];
/** @deprecated Use ScreenPresetSchema. */
export const DocumentPresetSchema = ScreenPresetSchema;
/** @deprecated Use ScreenPreset. */
export type DocumentPreset = ScreenPreset;
/** @deprecated Use AppStoreScreenPreset. */
export type AppStoreDocumentPreset = AppStoreScreenPreset;

export const ShadowSchema = z
  .object({
    color: ColorSchema,
    blur: z.number().min(0).finite(),
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
    opacity: z.number().min(0).max(1),
  })
  .strict();
export type Shadow = z.infer<typeof ShadowSchema>;

const SolidBackgroundSchema = z
  .object({
    type: z.literal("solid"),
    color: ColorSchema,
  })
  .strict();

const GradientStopSchema = z
  .object({
    offset: z.number().min(0).max(1),
    color: ColorSchema,
  })
  .strict();

const GradientStopsSchema = z.array(GradientStopSchema).min(2).max(16);
export const PointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();
export type Point = z.infer<typeof PointSchema>;
export const NormalizedPointSchema = z
  .object({
    x: z.number().min(0).max(1).finite(),
    y: z.number().min(0).max(1).finite(),
  })
  .strict();
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

export const LinearGradientBackgroundSchema = z
  .object({
    type: z.literal("linear-gradient"),
    stops: GradientStopsSchema,
    start: PointSchema,
    end: PointSchema,
  })
  .strict();

export const RadialGradientBackgroundSchema = z
  .object({
    type: z.literal("radial-gradient"),
    stops: GradientStopsSchema,
    center: PointSchema,
    radius: z.number().positive().finite(),
  })
  .strict();

const TransparentBackgroundSchema = z
  .object({
    type: z.literal("transparent"),
  })
  .strict();

export const BackgroundSchema = z.discriminatedUnion("type", [
  SolidBackgroundSchema,
  LinearGradientBackgroundSchema,
  RadialGradientBackgroundSchema,
  TransparentBackgroundSchema,
]);
export type Background = z.infer<typeof BackgroundSchema>;
export type GradientStop = z.infer<typeof GradientStopSchema>;

export const ElementFrameSchema = z
  .object({
    id: IdSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    width: DimensionSchema,
    height: DimensionSchema,
    rotation: z.number().finite(),
    opacity: z.number().min(0).max(1),
    // v6 persisted zIndex values. They remain accepted as migration input but
    // are stripped by SceneElementSchema; layer array position is the only
    // persisted ordering authority in v7.
    zIndex: z.number().int().min(0).optional(),
    locked: z.boolean(),
    visible: z.boolean(),
    name: z.string().trim().min(1).max(120),
    shadow: ShadowSchema.nullable().optional(),
  })
  .strict();

export const DeviceElementSchema = ElementFrameSchema.extend({
  type: z.literal("device"),
  preset: z.enum(["iphone-17-pro-max", "iphone-17-pro", "iphone-17", "iphone-air", "generic-modern-iphone", "generic-modern-ipad", "browser-window"] as const),
  deviceId: z.string().min(1).max(96),
  deviceName: z.string().min(1).max(120),
  frame: z.enum(["browser", "phone", "tablet"]),
  frameColor: ColorSchema,
  screenColor: ColorSchema,
  screenshotPath: AssetPathSchema.nullable(),
  screenshotFit: ImageFitSchema,
  screenshotPosition: NormalizedPointSchema,
  bezelStyle: z.enum(["solid", "metallic"]),
  cornerRadius: z.number().min(0).finite().nullable(),
  screenCornerRadius: z.number().min(0).finite().nullable(),
  showGlare: z.boolean(),
  showCamera: z.boolean(),
}).strict();
export type DeviceElement = Omit<z.infer<typeof DeviceElementSchema>, "zIndex"> & { zIndex: number };

const TextStyleSchema = z
  .object({
    fontFamily: z.string().min(1).max(120),
    fontSize: z.number().positive().finite(),
    fontWeight: z.number().int().min(100).max(900),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    lineHeight: z.number().positive().finite(),
    letterSpacing: z.number().finite(),
    color: ColorSchema,
    align: z.enum(["left", "center", "right"]),
    backgroundColor: ColorSchema.nullable().optional(),
    padding: z.number().min(0).finite().optional(),
    backgroundRadius: z.number().min(0).finite().optional(),
    shadow: ShadowSchema.nullable().optional(),
    autoHeight: z.boolean().optional(),
  })
  .strict();
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TextElementSchema = ElementFrameSchema.extend({
  type: z.literal("text"),
  text: z.string().max(20_000),
  style: TextStyleSchema,
}).strict();
export type TextElement = Omit<z.infer<typeof TextElementSchema>, "zIndex"> & { zIndex: number };

export const ImageElementSchema = ElementFrameSchema.extend({
  type: z.literal("image"),
  assetPath: AssetPathSchema,
  fit: ImageFitSchema,
  position: NormalizedPointSchema,
  cornerRadius: z.number().min(0).finite(),
  alt: z.string().max(500),
}).strict();
export type ImageElement = Omit<z.infer<typeof ImageElementSchema>, "zIndex"> & { zIndex: number };

export const ShapeElementSchema = ElementFrameSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rectangle", "rounded-rectangle", "ellipse", "line"]),
  fill: ColorSchema,
  stroke: ColorSchema,
  strokeWidth: z.number().min(0).finite(),
  radius: z.number().min(0).finite(),
}).strict();
export type ShapeElement = Omit<z.infer<typeof ShapeElementSchema>, "zIndex"> & { zIndex: number };

const RawSceneElementSchema = z.discriminatedUnion("type", [
  DeviceElementSchema,
  TextElementSchema,
  ImageElementSchema,
  ShapeElementSchema,
]);

export const SceneElementSchema = RawSceneElementSchema.transform((element) => {
  const { zIndex: _zIndex, ...canonical } = element;
  return canonical;
});
type CanonicalDeviceElement = Omit<z.infer<typeof DeviceElementSchema>, "zIndex">;
type CanonicalTextElement = Omit<z.infer<typeof TextElementSchema>, "zIndex">;
type CanonicalImageElement = Omit<z.infer<typeof ImageElementSchema>, "zIndex">;
type CanonicalShapeElement = Omit<z.infer<typeof ShapeElementSchema>, "zIndex">;
export type SceneElement = CanonicalDeviceElement | CanonicalTextElement | CanonicalImageElement | CanonicalShapeElement;
export type LegacySceneElement =
  (CanonicalDeviceElement & { zIndex: number }) |
  (CanonicalTextElement & { zIndex: number }) |
  (CanonicalImageElement & { zIndex: number }) |
  (CanonicalShapeElement & { zIndex: number });

export const AssetMetadataSchema = z
  .object({
    id: IdSchema,
    kind: z.literal("image"),
    path: AssetPathSchema,
    fileName: z.string().min(1).max(255),
    mimeType: AssetMimeTypeSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    byteSize: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.path.slice("assets/".length) !== asset.fileName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["fileName"], message: "Asset fileName must match the basename of path." });
    }
  });
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

export const SettingsSchema = z
  .object({
    autosave: z.boolean(),
    autosaveDelayMs: z.number().int().min(100).max(60_000),
    defaultScreenPreset: ScreenPresetSchema,
    exportDirectory: z.string().trim().max(4096).nullable(),
    grid: z
      .object({
        enabled: z.boolean(),
        size: z.number().positive(),
        snap: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;

const OwnedLayerSchema = z
  .object({
    kind: z.literal("owned"),
    element: SceneElementSchema,
    overflow: z.boolean(),
  })
  .strict();
export type OwnedLayer = z.infer<typeof OwnedLayerSchema>;

const OverflowLinkSchema = z
  .object({
    kind: z.literal("overflow-link"),
    elementId: IdSchema,
    ownerScreenId: IdSchema,
  })
  .strict();
export type OverflowLink = z.infer<typeof OverflowLinkSchema>;

export const LayerEntrySchema = z.discriminatedUnion("kind", [OwnedLayerSchema, OverflowLinkSchema]);
export type LayerEntry = z.infer<typeof LayerEntrySchema>;

type ScreenData = {
  id: string;
  slug: string;
  exportSlug: string;
  name: string;
  preset: ScreenPreset;
  background: Background;
  layers: LayerEntry[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Screen = ScreenData & {
  /** @deprecated Derived compatibility projection; never persisted. */
  readonly elements: LegacySceneElement[];
};

function legacyLayersFromElements(elements: Array<SceneElement & { zIndex?: number }>): OwnedLayer[] {
  return elements
    .map((element, index) => ({ element, index, zIndex: (element as SceneElement & { zIndex?: number }).zIndex ?? index }))
    .sort((left, right) => left.zIndex - right.zIndex || left.index - right.index)
    .map(({ element }) => ({ kind: "owned" as const, element: SceneElementSchema.parse(element), overflow: false }));
}

export function decorateScreen(screen: ScreenData): Screen {
  Object.defineProperty(screen, "elements", {
    configurable: true,
    enumerable: false,
    get: () => screen.layers
      .filter((layer): layer is OwnedLayer => layer.kind === "owned")
      .map((layer, index) => ({ ...layer.element, zIndex: index })),
  });
  return screen as Screen;
}

const ScreenInputSchema = z
  .object({
    id: IdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
    exportSlug: ScreenSlugSchema,
    name: z.string().trim().min(1).max(120),
    preset: ScreenPresetSchema,
    background: BackgroundSchema,
    layers: z.array(LayerEntrySchema).optional(),
    // Accepted only as an in-memory/backward-compatible input. Migrations
    // write v7 layers, and the transform below removes this property.
    elements: z.array(RawSceneElementSchema).optional(),
    notes: z.string().max(10_000),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((screen, context) => {
    if (!screen.layers && !screen.elements) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers"], message: "A screen must contain a layers array." });
    }
  })
  .transform((screen) => {
    const ownedLayers = screen.layers?.filter((layer): layer is OwnedLayer => layer.kind === "owned") ?? [];
    const hasLegacyElements = screen.elements !== undefined;
    const legacyElements = screen.elements ?? [];
    const sameOwnedElements = ownedLayers.length === legacyElements.length
      && ownedLayers.every((layer, index) => JSON.stringify(layer.element) === JSON.stringify(legacyElements[index]));
    const hasLinkOrOverflow = Boolean(screen.layers?.some((layer) => layer.kind === "overflow-link" || (layer.kind === "owned" && layer.overflow)));
    const layers = screen.layers && (!hasLegacyElements || hasLinkOrOverflow || sameOwnedElements)
      ? screen.layers
      : legacyLayersFromElements(legacyElements);
    const { elements: _elements, ...rest } = screen;
    return decorateScreen({ ...rest, layers });
  });
export const ScreenSchema = ScreenInputSchema;

export const DeckSchema = z
  .object({
    id: IdSchema,
    slug: DeckSlugSchema,
    name: z.string().trim().min(1).max(120),
    width: DimensionSchema,
    height: DimensionSchema,
    screens: z.array(ScreenSchema).min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type Deck = z.infer<typeof DeckSchema>;

const ProjectBaseSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: IdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500),
    settings: SettingsSchema,
    background: BackgroundSchema,
    assets: z.array(AssetMetadataSchema),
    decks: z.array(DeckSchema).min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

function identityPath(path: Array<string | number>): string {
  return path.reduce<string>((result, segment) => typeof segment === "number" ? `${result}[${segment}]` : `${result}.${segment}`, "project");
}

const ProjectIdentitySchema = ProjectBaseSchema.superRefine((project, context) => {
  const seen = new Map<string, { namespace: string; path: Array<string | number> }>();
  const assetPaths = new Map<string, number>();

  function checkIdentity(id: string, namespace: string, path: Array<string | number>): void {
    const previous = seen.get(id);
    if (previous) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate ${namespace} id "${id}"; already used by ${previous.namespace} at ${identityPath(previous.path)}. Project-owned IDs must be unique.`,
      });
      return;
    }
    seen.set(id, { namespace, path });
  }

  checkIdentity(project.id, "project", ["id"]);
  project.assets.forEach((asset, assetIndex) => {
    checkIdentity(asset.id, "asset", ["assets", assetIndex, "id"]);
    const previousIndex = assetPaths.get(asset.path);
    if (previousIndex !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets", assetIndex, "path"],
        message: `Duplicate asset path "${asset.path}"; already used by project.assets[${previousIndex}].path.`,
      });
    } else {
      assetPaths.set(asset.path, assetIndex);
    }
  });
  const deckSlugs = new Map<string, number>();
  const screenSlugs = new Map<string, Array<string | number>>();
  const screenExportSlugs = new Map<string, Array<string | number>>();

  function checkUniqueValue(
    values: Map<string, Array<string | number> | number>,
    value: string,
    namespace: string,
    path: Array<string | number>,
  ): void {
    if (values.has(value)) {
      const previous = values.get(value);
      const previousPath = Array.isArray(previous) ? identityPath(previous) : `project.decks[${previous}]`;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate ${namespace} "${value}"; already used at ${previousPath}. Project-owned ${namespace}s must be unique.`,
      });
      return;
    }
    values.set(value, path);
  }

  project.decks.forEach((deck, deckIndex) => {
    checkIdentity(deck.id, "deck", ["decks", deckIndex, "id"]);
    checkUniqueValue(deckSlugs, deck.slug, "deck slug", ["decks", deckIndex, "slug"]);
    deck.screens.forEach((screen, screenIndex) => {
      checkIdentity(screen.id, "screen", ["decks", deckIndex, "screens", screenIndex, "id"]);
      checkUniqueValue(screenSlugs, screen.slug, "screen slug", ["decks", deckIndex, "screens", screenIndex, "slug"]);
      checkUniqueValue(screenExportSlugs, screen.exportSlug, "screen export slug", ["decks", deckIndex, "screens", screenIndex, "exportSlug"]);
      const layerIds = new Set<string>();
      screen.layers.forEach((layer, layerIndex) => {
        if (layer.kind === "owned") {
          checkIdentity(
            layer.element.id,
            "scene element",
            ["decks", deckIndex, "screens", screenIndex, "layers", layerIndex, "element", "id"],
          );
          return;
        }
        if (layerIds.has(layer.elementId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["decks", deckIndex, "screens", screenIndex, "layers", layerIndex, "elementId"],
            message: `Duplicate overflow link for element "${layer.elementId}" in screen "${screen.id}".`,
          });
        }
        layerIds.add(layer.elementId);
      });
    });
  });

  const screensById = new Map<string, { deck: Deck; screen: Screen }>();
  const ownersByElementId = new Map<string, { deck: Deck; screen: Screen }>();
  project.decks.forEach((deck) => deck.screens.forEach((screen) => {
    screensById.set(screen.id, { deck, screen });
    screen.layers.forEach((layer) => {
      if (layer.kind === "owned") ownersByElementId.set(layer.element.id, { deck, screen });
    });
  }));
  project.decks.forEach((deck, deckIndex) => deck.screens.forEach((screen, screenIndex) => screen.layers.forEach((layer, layerIndex) => {
    if (layer.kind !== "overflow-link") return;
    const owner = ownersByElementId.get(layer.elementId);
    const ownerScreen = screensById.get(layer.ownerScreenId);
    const path = ["decks", deckIndex, "screens", screenIndex, "layers", layerIndex];
    if (!owner) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "elementId"], message: `Overflow link references missing element "${layer.elementId}".` });
      return;
    }
    if (!ownerScreen) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "ownerScreenId"], message: `Overflow link references missing owner screen "${layer.ownerScreenId}".` });
      return;
    }
    if (owner.deck.id !== deck.id || ownerScreen.deck.id !== deck.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: "Overflow links must stay within one deck." });
    }
    if (owner.screen.id !== layer.ownerScreenId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "ownerScreenId"], message: `Overflow link owner screen "${layer.ownerScreenId}" does not own element "${layer.elementId}".` });
    }
    if (screen.id === layer.ownerScreenId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: "An overflow link cannot target its owner screen." });
    }
    const ownerLayer = owner.screen.layers.find((candidate) => candidate.kind === "owned" && candidate.element.id === layer.elementId);
    if (!ownerLayer || ownerLayer.kind !== "owned" || !ownerLayer.overflow) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: "Overflow link owner does not have overflow enabled." });
    }
  })));
});

export const ProjectSchema = ProjectIdentitySchema;
export type Project = z.infer<typeof ProjectSchema>;

/** @deprecated Use ScreenSchema. */
export const DocumentSchema = ScreenSchema;
/** @deprecated Use Screen. */
export type Document = Screen;

export type ProjectInput = Pick<Project, "name" | "description"> &
  Partial<Pick<Project, "slug">>;

export function isSceneElement(value: unknown): value is SceneElement {
  return SceneElementSchema.safeParse(value).success;
}
