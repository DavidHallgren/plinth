import { createDefaultProject, DEFAULT_BACKGROUND } from "./defaults";
import { PlinthError } from "./errors";
import { createId, slugify } from "./ids";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "./schema";
import type { AssetMetadata, Background, Document, Project, SceneElement, Shadow } from "./schema";
import { isAppStorePreset } from "../scene/presets";
import { isDevicePreset, getDevicePreset } from "../devices/presets";
import { sanitizeAssetStem } from "./asset-validation";

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

function migratePreset(value: unknown): Document["preset"] {
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
  return {
    id: asString(source.id, createId("asset")),
    kind: "image",
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

function migrateElement(value: unknown, index: number, assets: AssetMetadata[]): SceneElement | null {
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
        fontFamily: asString(style.fontFamily, "Inter, ui-sans-serif, system-ui, sans-serif"),
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

function legacyDocument(value: unknown, index: number, now: string, assets: AssetMetadata[]): Document {
  const source = isRecord(value) ? value : {};
  const name = asString(source.name, asString(source.title, `Composition ${index + 1}`));
  const width = Math.round(asPositiveNumber(source.width, 1320));
  const height = Math.round(asPositiveNumber(source.height, 2868));
  const rawElements = Array.isArray(source.elements) ? source.elements : [];
  const elements = rawElements
    .map((element, elementIndex) => migrateElement(element, elementIndex, assets))
    .filter((element): element is SceneElement => element !== null)
    .map((element, elementIndex) => ({ ...element, zIndex: elementIndex }));

  return {
    id: asString(source.id, createId("doc")),
    name,
    slug: slugify(asString(source.slug, name), "composition"),
    preset: migratePreset(source.preset),
    width,
    height,
    background: migrateBackground(source.background),
    elements,
    notes: typeof source.notes === "string" ? source.notes : "",
    createdAt: asString(source.createdAt, now),
    updatedAt: asString(source.updatedAt, now),
  };
}

function normalizeSettings(value: unknown, starter: Project["settings"]): Project["settings"] {
  if (!isRecord(value)) return starter;
  const grid = isRecord(value.grid) ? value.grid : {};
  const presetCandidate = typeof value.defaultDocumentPreset === "string" ? value.defaultDocumentPreset : "";
  const defaultDocumentPreset = isAppStorePreset(presetCandidate) ? presetCandidate : "iphone-6-9";
  return {
    autosave: asBoolean(value.autosave, starter.autosave),
    autosaveDelayMs: Math.min(60_000, Math.max(100, Math.round(asFiniteNumber(value.autosaveDelayMs, starter.autosaveDelayMs)))),
    defaultDocumentPreset,
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
    documentCount: 1,
  });
  const assets = normalizeAssets(source.assets);
  const rawDocuments = Array.isArray(source.documents) ? source.documents : [];

  return {
    ...starter,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    description: typeof source.description === "string" ? source.description : starter.description,
    settings: normalizeSettings(source.settings, starter.settings),
    background: migrateBackground(source.background),
    assets,
    documents: rawDocuments.length > 0 ? rawDocuments.map((document, index) => legacyDocument(document, index, now, assets)) : starter.documents,
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

  if (versionValue === 0) return migrateVersionZero(input);
  if (versionValue === 1) return migrateVersionOne(input);
  if (versionValue === 2) return migrateVersionTwo(input);
  return input;
}

export function parseProject(input: unknown): Project {
  const migrated = migrateProject(input);
  const result = ProjectSchema.safeParse(migrated);

  if (!result.success) {
    const issueSummary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
      .join("; ");
    throw new PlinthError("SCHEMA_INVALID", 422, `Project data failed schema validation: ${issueSummary}`, {
      issues: result.error.issues,
      summary: issueSummary,
    });
  }

  return result.data;
}
