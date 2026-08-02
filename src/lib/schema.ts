import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 1 as const;

const IdSchema = z.string().min(1).max(96);
const ColorSchema = z.string().min(1).max(128);
const TimestampSchema = z.string().datetime({ offset: true });

export const DocumentPresetSchema = z.enum(["blank", "browser", "phone", "social"]);
export type DocumentPreset = z.infer<typeof DocumentPresetSchema>;

const SolidBackgroundSchema = z
  .object({
    type: z.literal("solid"),
    color: ColorSchema,
  })
  .strict();

const GradientBackgroundSchema = z
  .object({
    type: z.literal("gradient"),
    from: ColorSchema,
    to: ColorSchema,
    angle: z.number().finite(),
  })
  .strict();

const TransparentBackgroundSchema = z
  .object({
    type: z.literal("transparent"),
  })
  .strict();

export const BackgroundSchema = z.discriminatedUnion("type", [
  SolidBackgroundSchema,
  GradientBackgroundSchema,
  TransparentBackgroundSchema,
]);
export type Background = z.infer<typeof BackgroundSchema>;

const ElementFrameSchema = z
  .object({
    id: IdSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
    rotation: z.number().finite(),
    opacity: z.number().min(0).max(1),
    zIndex: z.number().int(),
    locked: z.boolean(),
    visible: z.boolean(),
    name: z.string().min(1).max(120),
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
    fontSize: z.number().positive(),
    fontWeight: z.number().int().min(100).max(900),
    lineHeight: z.number().positive(),
    letterSpacing: z.number().finite(),
    color: ColorSchema,
    align: z.enum(["left", "center", "right"]),
  })
  .strict();

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
    slug: z.string().min(1).max(96),
    name: z.string().min(1).max(120),
    preset: DocumentPresetSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    background: BackgroundSchema,
    elements: z.array(SceneElementSchema),
    notes: z.string().max(10_000),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type Document = z.infer<typeof DocumentSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: IdSchema,
    slug: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    description: z.string().max(500),
    settings: SettingsSchema,
    background: BackgroundSchema,
    assets: z.array(AssetMetadataSchema),
    documents: z.array(DocumentSchema).min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export type ProjectInput = Pick<Project, "name" | "description"> &
  Partial<Pick<Project, "slug">>;

export function isSceneElement(value: unknown): value is SceneElement {
  return SceneElementSchema.safeParse(value).success;
}
