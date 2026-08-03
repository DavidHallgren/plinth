import { z } from "zod";
import { APP_STORE_PRESETS } from "../scene/presets";

export const CURRENT_SCHEMA_VERSION = 2 as const;

const IdSchema = z.string().min(1).max(96);
const ColorSchema = z.string().min(1).max(128);
const TimestampSchema = z.string().datetime({ offset: true });
const DimensionSchema = z.number().int().positive().max(100_000);

export const DocumentPresetSchema = z.enum([
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
export type DocumentPreset = z.infer<typeof DocumentPresetSchema>;
export type AppStoreDocumentPreset = (typeof APP_STORE_PRESETS)[number]["id"];

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
const PointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

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
    zIndex: z.number().int().min(0),
    locked: z.boolean(),
    visible: z.boolean(),
    name: z.string().trim().min(1).max(120),
    shadow: ShadowSchema.nullable().optional(),
  })
  .strict();

export const DeviceElementSchema = ElementFrameSchema.extend({
  type: z.literal("device"),
  deviceId: z.string().min(1).max(96),
  deviceName: z.string().min(1).max(120),
  frame: z.enum(["browser", "phone", "tablet"]),
  frameColor: ColorSchema,
  screenColor: ColorSchema,
}).strict();
export type DeviceElement = z.infer<typeof DeviceElementSchema>;

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
export type TextElement = z.infer<typeof TextElementSchema>;

export const ImageElementSchema = ElementFrameSchema.extend({
  type: z.literal("image"),
  assetId: IdSchema,
  fit: z.enum(["contain", "cover", "fill"]),
  alt: z.string().max(500),
}).strict();
export type ImageElement = z.infer<typeof ImageElementSchema>;

export const ShapeElementSchema = ElementFrameSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rectangle", "rounded-rectangle", "ellipse", "line"]),
  fill: ColorSchema,
  stroke: ColorSchema,
  strokeWidth: z.number().min(0).finite(),
  radius: z.number().min(0).finite(),
}).strict();
export type ShapeElement = z.infer<typeof ShapeElementSchema>;

export const SceneElementSchema = z.discriminatedUnion("type", [
  DeviceElementSchema,
  TextElementSchema,
  ImageElementSchema,
  ShapeElementSchema,
]);
export type SceneElement = z.infer<typeof SceneElementSchema>;

export const AssetMetadataSchema = z
  .object({
    id: IdSchema,
    kind: z.literal("image"),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(120),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    byteSize: z.number().int().nonnegative(),
  })
  .strict();
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

export const SettingsSchema = z
  .object({
    autosave: z.boolean(),
    autosaveDelayMs: z.number().int().min(100).max(60_000),
    defaultDocumentPreset: DocumentPresetSchema,
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

export const DocumentSchema = z
  .object({
    id: IdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
    name: z.string().trim().min(1).max(120),
    preset: DocumentPresetSchema,
    width: DimensionSchema,
    height: DimensionSchema,
    background: BackgroundSchema,
    elements: z.array(SceneElementSchema),
    notes: z.string().max(10_000),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict()
  .superRefine((document, context) => {
    const seen = new Set<number>();
    document.elements.forEach((element, index) => {
      if (seen.has(element.zIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["elements", index, "zIndex"],
          message: `Duplicate zIndex ${element.zIndex}; layers must have a valid order.`,
        });
      }
      seen.add(element.zIndex);
    });
  });
export type Document = z.infer<typeof DocumentSchema>;

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
    documents: z.array(DocumentSchema).min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

function identityPath(path: Array<string | number>): string {
  return path.reduce<string>((result, segment) => typeof segment === "number" ? `${result}[${segment}]` : `${result}.${segment}`, "project");
}

const ProjectIdentitySchema = ProjectBaseSchema.superRefine((project, context) => {
  const seen = new Map<string, { namespace: string; path: Array<string | number> }>();

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
  project.assets.forEach((asset, assetIndex) => checkIdentity(asset.id, "asset", ["assets", assetIndex, "id"]));
  project.documents.forEach((document, documentIndex) => {
    checkIdentity(document.id, "document", ["documents", documentIndex, "id"]);
    document.elements.forEach((element, elementIndex) => checkIdentity(
      element.id,
      "scene element",
      ["documents", documentIndex, "elements", elementIndex, "id"],
    ));
  });
});

export const ProjectSchema = ProjectIdentitySchema;
export type Project = z.infer<typeof ProjectSchema>;

export type ProjectInput = Pick<Project, "name" | "description"> &
  Partial<Pick<Project, "slug">>;

export function isSceneElement(value: unknown): value is SceneElement {
  return SceneElementSchema.safeParse(value).success;
}
