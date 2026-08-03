import { createId, nowIso, slugify } from "./ids";
import type {
  Background,
  DeviceElement,
  Document,
  DocumentPreset,
  Project,
  ProjectInput,
  SceneElement,
  Settings,
  ShapeElement,
  TextElement,
} from "./schema";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "./schema";
import { getPresetDefinition, isAppStorePreset } from "../scene/presets";
import { getDevicePreset } from "../devices/presets";
import { normalizeTextElementGeometry } from "../scene/text-geometry";
import { normalizeLayerOrder } from "../scene/selectors";

export const DEFAULT_BACKGROUND: Background = {
  type: "solid",
  color: "#10131a",
};

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  autosaveDelayMs: 800,
  defaultDocumentPreset: "iphone-6-9",
  grid: {
    enabled: true,
    size: 8,
    snap: true,
  },
};

export const DEFAULT_SHADOW = {
  color: "#05060a",
  blur: 28,
  offsetX: 0,
  offsetY: 14,
  opacity: 0.24,
} as const;

type CreateDocumentOptions = {
  id?: string;
  name?: string;
  slug?: string;
  exportSlug?: string;
  now?: string;
  width?: number;
  height?: number;
};

function frame(
  id: string,
  name: string,
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
) {
  return {
    id,
    name,
    x: values.x,
    y: values.y,
    width: values.width,
    height: values.height,
    rotation: 0,
    opacity: 1,
    zIndex: values.zIndex,
    locked: false,
    visible: true,
    shadow: null,
  };
}

function deviceElement(
  frameKind: "browser" | "phone" | "tablet",
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
  id = createId("device"),
): DeviceElement {
  const isPhone = frameKind === "phone";
  const isTablet = frameKind === "tablet";
  const preset = frameKind === "browser" ? "browser-window" : isTablet ? "generic-modern-ipad" : "iphone-17-pro-max";
  const deviceName = frameKind === "browser" ? "Browser window" : isTablet ? "Generic modern iPad" : "iPhone 17 Pro Max";
  return {
    ...frame(id, deviceName, values),
    type: "device",
    preset,
    deviceId: isPhone ? "iphone-17-pro-max" : isTablet ? "generic-modern-ipad" : "browser-window",
    deviceName,
    frame: frameKind,
    frameColor: isPhone ? "#1d2029" : isTablet ? "#242833" : "#242934",
    screenColor: isPhone ? "#f8f9fc" : "#f6f7fb",
    screenshotPath: null,
    screenshotFit: "cover",
    screenshotPosition: { x: 0.5, y: 0.5 },
    bezelStyle: "solid",
    cornerRadius: null,
    screenCornerRadius: null,
    showGlare: false,
    showCamera: true,
    shadow: DEFAULT_SHADOW,
  };
}

function textElement(
  text: string,
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
  style: TextElement["style"],
  id = createId("text"),
  name = text.slice(0, 32),
): TextElement {
  return {
    ...frame(id, name || "Text", values),
    type: "text",
    text,
    style: {
      italic: false,
      underline: false,
      backgroundColor: null,
      padding: 0,
      backgroundRadius: 0,
      shadow: null,
      autoHeight: true,
      ...style,
    },
  };
}

function shapeElement(
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
  overrides: Pick<ShapeElement, "shape" | "fill" | "stroke" | "strokeWidth" | "radius"> & Partial<Pick<ShapeElement, "shadow">>,
  id = createId("shape"),
  name = "Decorative shape",
): ShapeElement {
  return {
    ...frame(id, name, values),
    type: "shape",
    shadow: null,
    ...overrides,
  };
}

function appStoreBackground(preset: string): Background {
  switch (preset) {
    case "iphone-6-9":
      return {
        type: "linear-gradient",
        stops: [
          { offset: 0, color: "#13182a" },
          { offset: 0.55, color: "#4d4c99" },
          { offset: 1, color: "#bc9aff" },
        ],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      };
    case "iphone-6-7":
      return { type: "solid", color: "#eef1f7" };
    case "iphone-6-5":
      return {
        type: "linear-gradient",
        stops: [
          { offset: 0, color: "#0f1420" },
          { offset: 1, color: "#2d6070" },
        ],
        start: { x: 0, y: 1 },
        end: { x: 1, y: 0 },
      };
    case "iphone-5-5":
      return {
        type: "radial-gradient",
        stops: [
          { offset: 0, color: "#f5c7da" },
          { offset: 0.6, color: "#9f8de6" },
          { offset: 1, color: "#27203d" },
        ],
        center: { x: 0.72, y: 0.26 },
        radius: 0.86,
      };
    case "ipad-13":
      return {
        type: "radial-gradient",
        stops: [
          { offset: 0, color: "#d2f0ef" },
          { offset: 0.55, color: "#6584aa" },
          { offset: 1, color: "#1a2434" },
        ],
        center: { x: 0.2, y: 0.16 },
        radius: 1,
      };
    default:
      return DEFAULT_BACKGROUND;
  }
}

function createAppStoreElements(
  preset: string,
  width: number,
  height: number,
): SceneElement[] {
  const isTablet = preset === "ipad-13";
  const isLight = preset === "iphone-6-7";
  const horizontalPadding = Math.round(width * 0.085);
  const devicePreset = getDevicePreset(isTablet ? "generic-modern-ipad" : isLight ? "iphone-17-pro" : "iphone-17-pro-max");
  const deviceWidth = Math.round(width * (isTablet ? 0.72 : 0.46));
  const deviceHeight = Math.round(deviceWidth / (devicePreset?.aspectRatio ?? (isTablet ? 0.75 : 0.47)));
  const deviceX = Math.round((width - deviceWidth) / 2);
  const deviceY = Math.round(height * (isTablet ? 0.28 : 0.34));
  const headlineSize = Math.max(42, Math.round(width * (isTablet ? 0.035 : 0.048)));
  const bodySize = Math.max(20, Math.round(headlineSize * 0.34));
  const foreground = isLight ? "#10131a" : "#ffffff";
  const muted = isLight ? "#485064" : "#e6e5f0";

  return [
    deviceElement(isTablet ? "tablet" : "phone", {
      x: deviceX,
      y: deviceY,
      width: deviceWidth,
      height: deviceHeight,
      zIndex: 1,
    }),
    textElement(
      "Project overview",
      {
        x: horizontalPadding,
        y: Math.round(height * 0.085),
        width: width - horizontalPadding * 2,
        height: Math.round(headlineSize * 2.15),
        zIndex: 3,
      },
      {
        fontFamily: "Inter, SF Pro Display, ui-sans-serif, system-ui, sans-serif",
        fontSize: headlineSize,
        fontWeight: 750,
        lineHeight: 1.02,
        letterSpacing: -Math.max(1, Math.round(headlineSize * 0.045)),
        color: foreground,
        align: "left",
      },
      createId("text"),
      "Headline",
    ),
    textElement(
      "Sample frame",
      {
        x: horizontalPadding,
        y: Math.round(height * 0.19),
        width: Math.round(width * 0.72),
        height: Math.round(bodySize * 2.8),
        zIndex: 4,
      },
      {
        fontFamily: "Inter, SF Pro Text, ui-sans-serif, system-ui, sans-serif",
        fontSize: bodySize,
        fontWeight: 500,
        lineHeight: 1.35,
        letterSpacing: 0,
        color: muted,
        align: "left",
      },
      createId("text"),
      "Subheadline",
    ),
    shapeElement(
      {
        x: horizontalPadding,
        y: Math.round(height * 0.84),
        width: width - horizontalPadding * 2,
        height: Math.max(120, Math.round(height * 0.055)),
        zIndex: 0,
      },
      {
        shape: "rounded-rectangle",
        fill: isLight ? "#d6dcf2" : "#ffffff",
        stroke: isLight ? "#c5cde6" : "#ffffff",
        strokeWidth: 1,
        radius: Math.max(24, Math.round(width * 0.02)),
        shadow: { ...DEFAULT_SHADOW, opacity: 0.12, blur: 18, offsetY: 8 },
      },
      createId("shape"),
      "Decorative surface",
    ),
  ];
}

function createLegacyElements(preset: "blank" | "browser" | "phone" | "social"): SceneElement[] {
  if (preset === "blank") return [];
  if (preset === "social") {
    return [
      shapeElement(
        { x: 120, y: 120, width: 960, height: 1040, zIndex: 0 },
        { shape: "rounded-rectangle", fill: "#8b7cff", stroke: "#8b7cff", strokeWidth: 0, radius: 40 },
      ),
      textElement(
        "Sample composition",
        { x: 208, y: 320, width: 790, height: 220, zIndex: 1 },
        {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 84,
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: -2.4,
          color: "#ffffff",
          align: "left",
        },
      ),
    ];
  }

  const isPhone = preset === "phone";
  return [
    deviceElement(isPhone ? "phone" : "browser", {
      x: 96,
      y: 96,
      width: isPhone ? 390 : 960,
      height: isPhone ? 844 : 620,
      zIndex: 0,
    }),
    textElement(
      "Project overview",
      {
        x: isPhone ? 148 : 176,
        y: isPhone ? 230 : 184,
        width: isPhone ? 286 : 720,
        height: 112,
        zIndex: 2,
      },
      {
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: isPhone ? 42 : 64,
        fontWeight: 700,
        lineHeight: 1.04,
        letterSpacing: -1.8,
        color: "#10131a",
        align: "left",
      },
    ),
    shapeElement(
      {
        x: isPhone ? 148 : 176,
        y: isPhone ? 404 : 352,
        width: isPhone ? 170 : 260,
        height: 12,
        zIndex: 1,
      },
      {
        shape: "rounded-rectangle",
        fill: "#8b7cff",
        stroke: "#8b7cff",
        strokeWidth: 0,
        radius: 8,
      },
    ),
  ];
}

export function createDocumentPreset(
  preset: DocumentPreset,
  options: CreateDocumentOptions = {},
): Document {
  const now = options.now ?? nowIso();
  const definition = getPresetDefinition(preset);
  const isLegacy = preset === "blank" || preset === "browser" || preset === "phone" || preset === "social";
  const name = options.name ?? (definition?.shortLabel ?? `${preset[0]?.toUpperCase() ?? "D"}${preset.slice(1)} composition`);
  const id = options.id ?? createId("doc");
  const width = options.width ?? definition?.width ?? (preset === "phone" ? 1170 : preset === "social" ? 1200 : preset === "browser" ? 1440 : 1320);
  const height = options.height ?? definition?.height ?? (preset === "phone" ? 2532 : preset === "social" ? 1500 : preset === "browser" ? 900 : 2868);
  const elements = isAppStorePreset(preset)
    ? createAppStoreElements(preset, width, height)
    : createLegacyElements(isLegacy ? preset : "blank");
  const normalizedElements = elements.map((element) => element.type === "text" ? normalizeTextElementGeometry(element, width, height) : element);
  const document: Document = {
    id,
    slug: options.slug ?? slugify(name, "composition"),
    exportSlug: options.exportSlug ?? slugify(name, "composition"),
    name,
    preset,
    width,
    height,
    background: isAppStorePreset(preset) ? appStoreBackground(preset) : preset === "social" ? {
      type: "linear-gradient",
      stops: [{ offset: 0, color: "#27203d" }, { offset: 1, color: "#8b7cff" }],
      start: { x: 0, y: 1 },
      end: { x: 1, y: 0 },
    } : DEFAULT_BACKGROUND,
    elements: normalizeLayerOrder(normalizedElements),
    notes: "",
    createdAt: now,
    updatedAt: now,
  };

  return document;
}

export function createDefaultProject(
  name = "Untitled project",
  input: Partial<ProjectInput> & { now?: string; id?: string; documentCount?: number } = {},
): Project {
  const now = input.now ?? nowIso();
  const slug = input.slug ?? slugify(name);
  const documentCount = input.documentCount ?? 1;
  const documents = Array.from({ length: Math.max(1, documentCount) }, (_, index) =>
    createDocumentPreset(index === 0 ? DEFAULT_SETTINGS.defaultDocumentPreset : "custom", {
      name: index === 0 ? "First screenshot" : `Composition ${index + 1}`,
      now,
    }),
  );

  const project: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: input.id ?? createId("project"),
    slug,
    name,
    description: input.description ?? "A local-first composition project.",
    settings: DEFAULT_SETTINGS,
    background: DEFAULT_BACKGROUND,
    assets: [],
    documents,
    createdAt: now,
    updatedAt: now,
  };

  return ProjectSchema.parse(project);
}
