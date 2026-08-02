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

export const DEFAULT_BACKGROUND: Background = {
  type: "solid",
  color: "#10131a",
};

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  autosaveDelayMs: 800,
  defaultDocumentPreset: "browser",
  grid: {
    enabled: true,
    size: 8,
    snap: true,
  },
};

type CreateDocumentOptions = {
  id?: string;
  name?: string;
  slug?: string;
  now?: string;
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
  };
}

function deviceElement(preset: "browser" | "phone", id = createId("device")): DeviceElement {
  const isPhone = preset === "phone";
  return {
    ...frame(id, isPhone ? "iPhone frame" : "Browser frame", {
      x: 96,
      y: 96,
      width: isPhone ? 390 : 960,
      height: isPhone ? 844 : 620,
      zIndex: 0,
    }),
    type: "device",
    deviceId: isPhone ? "iphone-15-pro" : "browser-chrome",
    deviceName: isPhone ? "iPhone 15 Pro" : "Chrome window",
    frame: isPhone ? "phone" : "browser",
    frameColor: isPhone ? "#20242d" : "#242934",
    screenColor: "#f6f7fb",
  };
}

function textElement(
  text: string,
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
  style: TextElement["style"],
  id = createId("text"),
): TextElement {
  return {
    ...frame(id, text.slice(0, 32), values),
    type: "text",
    text,
    style,
  };
}

function shapeElement(
  values: Pick<SceneElement, "x" | "y" | "width" | "height" | "zIndex">,
  overrides: Pick<ShapeElement, "shape" | "fill" | "stroke" | "strokeWidth" | "radius">,
  id = createId("shape"),
): ShapeElement {
  return {
    ...frame(id, "Accent shape", values),
    type: "shape",
    ...overrides,
  };
}

export function createDocumentPreset(
  preset: DocumentPreset,
  options: CreateDocumentOptions = {},
): Document {
  const now = options.now ?? nowIso();
  const name = options.name ?? `${preset[0]?.toUpperCase() ?? "D"}${preset.slice(1)} composition`;
  const id = options.id ?? createId("doc");
  const width = preset === "phone" ? 1170 : preset === "social" ? 1200 : 1440;
  const height = preset === "phone" ? 2532 : preset === "social" ? 1500 : 900;
  const elements: SceneElement[] = [];

  if (preset === "browser" || preset === "phone") {
    elements.push(deviceElement(preset));
    elements.push(
      textElement(
        preset === "phone" ? "Pocket-sized clarity" : "A clearer way to present the work",
        {
          x: preset === "phone" ? 148 : 176,
          y: preset === "phone" ? 230 : 184,
          width: preset === "phone" ? 286 : 720,
          height: 112,
          zIndex: 2,
        },
        {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: preset === "phone" ? 42 : 64,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: -1.8,
          color: "#10131a",
          align: "left",
        },
      ),
    );
    elements.push(
      shapeElement(
        {
          x: preset === "phone" ? 148 : 176,
          y: preset === "phone" ? 404 : 352,
          width: preset === "phone" ? 170 : 260,
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
    );
  }

  if (preset === "social") {
    elements.push(
      shapeElement(
        { x: 120, y: 120, width: 960, height: 1_040, zIndex: 0 },
        {
          shape: "rounded-rectangle",
          fill: "#8b7cff",
          stroke: "#8b7cff",
          strokeWidth: 0,
          radius: 40,
        },
      ),
    );
    elements.push(
      textElement(
        "Make the first frame count.",
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
    );
  }

  const document: Document = {
    id,
    slug: options.slug ?? slugify(name),
    name,
    preset,
    width,
    height,
    background: preset === "social" ? { type: "gradient", from: "#27203d", to: "#8b7cff", angle: 135 } : DEFAULT_BACKGROUND,
    elements,
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
    createDocumentPreset(index === 0 ? DEFAULT_SETTINGS.defaultDocumentPreset : "blank", {
      name: index === 0 ? "First composition" : `Composition ${index + 1}`,
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
