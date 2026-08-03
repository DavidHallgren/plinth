import { createDocumentPreset } from "../lib/defaults";
import { createId, nowIso, slugify } from "../lib/ids";
import { DocumentSchema, SceneElementSchema } from "../lib/schema";
import type { Document, DocumentPreset, ImageFit, Point, Project, SceneElement, Shadow, TextStyle } from "../lib/schema";
import type { ShapeElement } from "../lib/schema";
import { calculateTextAutoHeight } from "./text-geometry";
import { normalizeLayerOrder, sortLayerElements } from "./selectors";

export const MIN_DIMENSION = 1;

export class SceneOperationError extends Error {
  readonly code: "DOCUMENT_NOT_FOUND" | "ELEMENT_NOT_FOUND" | "INVALID_OPERATION";

  constructor(code: SceneOperationError["code"], message: string) {
    super(message);
    this.name = "SceneOperationError";
    this.code = code;
  }
}

export type ElementPatch = {
  id?: string;
  type?: SceneElement["type"];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  visible?: boolean;
  name?: string;
  shadow?: Shadow | null;
  text?: string;
  style?: Partial<TextStyle>;
  shape?: ShapeElement["shape"];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  deviceId?: string;
  deviceName?: string;
  frame?: "browser" | "phone" | "tablet";
  preset?: "iphone-17-pro-max" | "iphone-17-pro" | "generic-modern-iphone" | "generic-modern-ipad" | "browser-window";
  frameColor?: string;
  screenColor?: string;
  screenshotPath?: string | null;
  screenshotFit?: ImageFit;
  screenshotPosition?: Point;
  bezelStyle?: "solid" | "metallic";
  cornerRadius?: number | null;
  screenCornerRadius?: number | null;
  showGlare?: boolean;
  showCamera?: boolean;
  assetPath?: string;
  fit?: ImageFit;
  position?: Point;
  alt?: string;
};
export type ElementUpdate = { id: string; patch: ElementPatch };
export type ResizeElementInput = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  rotation?: number;
};
export type MoveDelta = { x: number; y: number };
export type AddDocumentOptions = {
  id?: string;
  name?: string;
  slug?: string;
  exportSlug?: string;
  width?: number;
  height?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function documentFor(project: Project, documentId: string): Document {
  const document = project.documents.find((candidate) => candidate.id === documentId);
  if (!document) throw new SceneOperationError("DOCUMENT_NOT_FOUND", `Document "${documentId}" was not found.`);
  return document;
}

function elementFor(document: Document, elementId: string): SceneElement {
  const element = document.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in document "${document.id}".`);
  return element;
}

function touchProject(project: Project, documents: Project["documents"]): Project {
  return { ...project, documents, updatedAt: nowIso() };
}

function touchDocument(document: Document, values: Partial<Document>): Document {
  return DocumentSchema.parse({ ...document, ...values, updatedAt: nowIso() });
}

function withDocument(project: Project, documentId: string, update: (document: Document) => Document): Project {
  const nextDocuments = project.documents.map((document) => document.id === documentId ? update(document) : document);
  if (nextDocuments.every((document, index) => document === project.documents[index])) {
    return project;
  }
  return touchProject(project, nextDocuments);
}

function sortedByLayer(elements: SceneElement[]): SceneElement[] {
  return sortLayerElements(elements);
}

export function normalizeElementOrder(elements: SceneElement[]): SceneElement[] {
  return elements.map((element, index) => ({ ...element, zIndex: index }));
}

function clampElementToDocument(document: Document, element: SceneElement): SceneElement {
  const width = clamp(Math.abs(finite(element.width, MIN_DIMENSION)), MIN_DIMENSION, document.width);
  const requestedHeight = element.type === "text" && element.style.autoHeight !== false
    ? calculateTextAutoHeight(element.text, width, element.style)
    : Math.abs(finite(element.height, MIN_DIMENSION));
  const height = clamp(requestedHeight, MIN_DIMENSION, document.height);
  return {
    ...element,
    x: clamp(finite(element.x, 0), 0, document.width - width),
    y: clamp(finite(element.y, 0), 0, document.height - height),
    width,
    height,
    opacity: clamp(finite(element.opacity, 1), 0, 1),
  } as SceneElement;
}

function updateDocumentElements(document: Document, elements: SceneElement[]): Document {
  const bounded = elements.map((element) => clampElementToDocument(document, element));
  return touchDocument(document, { elements: normalizeElementOrder(sortedByLayer(bounded)) });
}

function assertNoProjectIdentityCollision(project: Project, document: Document): void {
  const existing = new Set<string>([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.documents.flatMap((candidate) => [candidate.id, ...candidate.elements.map((element) => element.id)]),
  ]);
  if (existing.has(document.id)) throw new SceneOperationError("INVALID_OPERATION", `Document id "${document.id}" is already in use.`);
  for (const element of document.elements) {
    if (existing.has(element.id)) throw new SceneOperationError("INVALID_OPERATION", `Element id "${element.id}" is already in use.`);
    existing.add(element.id);
  }
}

function uniqueDocumentSlug(project: Project, proposed: string, ignoredId?: string): string {
  const existing = new Set(project.documents.filter((document) => document.id !== ignoredId).map((document) => document.slug));
  const base = slugify(proposed, "composition");
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueDocumentExportSlug(project: Project, proposed: string, ignoredId?: string): string {
  const existing = new Set(project.documents.filter((document) => document.id !== ignoredId).map((document) => document.exportSlug));
  const base = slugify(proposed, "composition");
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function projectIds(project: Project): Set<string> {
  return new Set([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.documents.flatMap((document) => [document.id, ...document.elements.map((element) => element.id)]),
  ]);
}

function uniqueId(type: string, used: Set<string>): string {
  let id = createId(type);
  while (used.has(id)) id = createId(type);
  used.add(id);
  return id;
}

function patchElement(document: Document, element: SceneElement, patch: ElementPatch): SceneElement {
  if (patch.id && patch.id !== element.id) {
    throw new SceneOperationError("INVALID_OPERATION", "Element ids cannot be changed by an update.");
  }
  if (patch.type && patch.type !== element.type) {
    throw new SceneOperationError("INVALID_OPERATION", "Element types cannot be changed by an update.");
  }
  const effectivePatch = element.locked
    ? Object.fromEntries(Object.entries(patch).filter(([key]) => !["x", "y", "width", "height", "rotation"].includes(key))) as ElementPatch
    : patch;
  const next = {
    ...element,
    ...effectivePatch,
    ...(element.type === "text" && effectivePatch.style ? { style: { ...element.style, ...effectivePatch.style } } : {}),
    id: element.id,
    type: element.type,
  } as SceneElement;
  return clampElementToDocument(document, SceneElementSchema.parse(next));
}

export function addElement(project: Project, documentId: string, element: SceneElement): Project {
  const document = documentFor(project, documentId);
  if (project.id === element.id || project.assets.some((asset) => asset.id === element.id) || project.documents.some((candidate) => candidate.id === element.id) || project.documents.some((candidate) => candidate.elements.some((item) => item.id === element.id))) {
    throw new SceneOperationError("INVALID_OPERATION", `Element id "${element.id}" is already in use.`);
  }
  const nextElement = clampElementToDocument(document, {
    ...SceneElementSchema.parse(element),
    zIndex: document.elements.length,
  });
  return withDocument(project, documentId, (current) => updateDocumentElements(current, [...current.elements, nextElement]));
}

export function removeElements(project: Project, documentId: string, elementIds: string[]): Project {
  const document = documentFor(project, documentId);
  const ids = new Set(elementIds);
  if (ids.size === 0) return project;
  for (const id of ids) elementFor(document, id);
  return withDocument(project, documentId, (current) => updateDocumentElements(current, current.elements.filter((element) => !ids.has(element.id))));
}

export function updateElement(project: Project, documentId: string, elementId: string, patch: ElementPatch): Project {
  const document = documentFor(project, documentId);
  const current = elementFor(document, elementId);
  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(
    currentDocument,
    currentDocument.elements.map((element) => element.id === elementId ? patchElement(currentDocument, current, patch) : element),
  ));
}

export function updateElements(project: Project, documentId: string, updates: ElementUpdate[] | Record<string, ElementPatch>): Project {
  const normalizedUpdates = Array.isArray(updates) ? updates : Object.entries(updates).map(([id, patch]) => ({ id, patch }));
  if (normalizedUpdates.length === 0) return project;
  const document = documentFor(project, documentId);
  const updateMap = new Map(normalizedUpdates.map((update) => [update.id, update.patch]));
  for (const id of updateMap.keys()) elementFor(document, id);
  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(
    currentDocument,
    currentDocument.elements.map((element) => {
      const patch = updateMap.get(element.id);
      return patch ? patchElement(currentDocument, element, patch) : element;
    }),
  ));
}

export function moveElements(project: Project, documentId: string, elementIds: string[], delta: MoveDelta): Project {
  const document = documentFor(project, documentId);
  const ids = new Set(elementIds);
  const requested = document.elements.filter((element) => ids.has(element.id));
  if (requested.length !== ids.size) {
    const missing = elementIds.find((id) => !requested.some((element) => element.id === id));
    if (missing) elementFor(document, missing);
  }
  const selected = requested.filter((element) => !element.locked);
  if (selected.length === 0) return project;
  const requestedX = finite(delta.x, 0);
  const requestedY = finite(delta.y, 0);
  const minX = Math.min(...selected.map((element) => element.x));
  const minY = Math.min(...selected.map((element) => element.y));
  const maxRight = Math.max(...selected.map((element) => element.x + element.width));
  const maxBottom = Math.max(...selected.map((element) => element.y + element.height));
  const dx = clamp(requestedX, -minX, document.width - maxRight);
  const dy = clamp(requestedY, -minY, document.height - maxBottom);

  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(
    currentDocument,
    currentDocument.elements.map((element) => ids.has(element.id) && !element.locked ? { ...element, x: element.x + dx, y: element.y + dy } : element),
  ));
}

export function resizeElement(project: Project, documentId: string, elementId: string, input: ResizeElementInput): Project {
  const document = documentFor(project, documentId);
  const element = elementFor(document, elementId);
  if (element.locked) return project;
  const widthValue = finite(input.width, element.width);
  const heightValue = finite(input.height, element.height);
  const xValue = finite(input.x, element.x) + (widthValue < 0 ? widthValue : 0);
  const yValue = finite(input.y, element.y) + (heightValue < 0 ? heightValue : 0);
  const next = {
    ...element,
    x: xValue,
    y: yValue,
    width: Math.abs(widthValue),
    height: Math.abs(heightValue),
    rotation: finite(input.rotation, element.rotation),
  } as SceneElement;
  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(
    currentDocument,
    currentDocument.elements.map((candidate) => candidate.id === elementId ? next : candidate),
  ));
}

export function reorderElements(project: Project, documentId: string, elementIds: string[], targetIndex: number): Project {
  const document = documentFor(project, documentId);
  const selectedIds = new Set(elementIds);
  for (const id of selectedIds) elementFor(document, id);
  if (selectedIds.size === 0) return project;
  const ordered = sortedByLayer(document.elements);
  const selected = ordered.filter((element) => selectedIds.has(element.id));
  const remaining = ordered.filter((element) => !selectedIds.has(element.id));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(currentDocument, normalizeElementOrder(remaining)));
}

export const reorderElement = reorderElements;

export function duplicateElements(project: Project, documentId: string, elementIds: string[], offset: MoveDelta = { x: 24, y: 24 }): Project {
  const document = documentFor(project, documentId);
  const ids = new Set(elementIds);
  const selected = sortedByLayer(document.elements).filter((element) => ids.has(element.id));
  if (selected.length !== ids.size) {
    const missing = elementIds.find((id) => !selected.some((element) => element.id === id));
    if (missing) elementFor(document, missing);
  }
  if (selected.length === 0) return project;
  const nextElements = [...document.elements];
  const usedIds = projectIds(project);
  let nextZIndex = nextElements.length;
  const duplicates = selected.map((element) => {
    const duplicate = {
      ...element,
      id: uniqueId(element.type, usedIds),
      name: `${element.name} copy`,
      x: element.x + finite(offset.x, 24),
      y: element.y + finite(offset.y, 24),
      zIndex: nextZIndex++,
    } as SceneElement;
    return clampElementToDocument(document, duplicate);
  });
  return withDocument(project, documentId, (currentDocument) => updateDocumentElements(currentDocument, [...nextElements, ...duplicates]));
}

export function addDocument(project: Project, presetOrDocument: DocumentPreset | Document, options: AddDocumentOptions = {}): Project {
  const now = nowIso();
  const usedIds = projectIds(project);
  const document = typeof presetOrDocument === "string"
    ? createDocumentPreset(presetOrDocument, { ...options, id: options.id ?? uniqueId("doc", usedIds), now, name: options.name, slug: options.slug, exportSlug: options.exportSlug })
    : DocumentSchema.parse({ ...presetOrDocument, id: options.id ?? presetOrDocument.id, createdAt: now, updatedAt: now });
  const nextDocument = DocumentSchema.parse({
    ...document,
    id: document.id || createId("doc"),
    slug: uniqueDocumentSlug(project, options.slug ?? document.slug),
    exportSlug: uniqueDocumentExportSlug(project, options.exportSlug ?? document.exportSlug, undefined),
    elements: normalizeLayerOrder(document.elements),
  });
  assertNoProjectIdentityCollision(project, nextDocument);
  return touchProject(project, [...project.documents, nextDocument]);
}

export function duplicateDocument(project: Project, documentId: string, overrides: Pick<AddDocumentOptions, "name" | "slug"> = {}): Project {
  const source = documentFor(project, documentId);
  const now = nowIso();
  const usedIds = projectIds(project);
  const duplicate: Document = {
    ...source,
    id: uniqueId("doc", usedIds),
    name: overrides.name?.trim() || `${source.name} copy`,
    slug: uniqueDocumentSlug(project, overrides.slug ?? `${source.slug}-copy`),
    exportSlug: uniqueDocumentExportSlug(project, `${source.exportSlug}-copy`),
    elements: normalizeLayerOrder(source.elements.map((element) => ({ ...element, id: uniqueId(element.type, usedIds) }))),
    createdAt: now,
    updatedAt: now,
  };
  assertNoProjectIdentityCollision(project, duplicate);
  return touchProject(project, [...project.documents, duplicate]);
}

export function removeDocument(project: Project, documentId: string): Project {
  documentFor(project, documentId);
  if (project.documents.length <= 1) {
    throw new SceneOperationError("INVALID_OPERATION", "A project must keep at least one document.");
  }
  return touchProject(project, project.documents.filter((document) => document.id !== documentId));
}

export type DocumentPatch = Partial<Pick<Document, "name" | "slug" | "exportSlug" | "preset" | "width" | "height" | "background" | "notes">>;

export function updateDocument(project: Project, documentId: string, patch: DocumentPatch): Project {
  const document = documentFor(project, documentId);
  const nextWidth = patch.width === undefined ? document.width : Math.max(MIN_DIMENSION, Math.round(finite(patch.width, document.width)));
  const nextHeight = patch.height === undefined ? document.height : Math.max(MIN_DIMENSION, Math.round(finite(patch.height, document.height)));
  const nextSlug = patch.slug === undefined ? document.slug : uniqueDocumentSlug(project, patch.slug, documentId);
  const nextExportSlug = patch.exportSlug === undefined ? document.exportSlug : uniqueDocumentExportSlug(project, patch.exportSlug, documentId);
  const candidate = touchDocument(document, {
    ...patch,
    name: patch.name === undefined ? document.name : patch.name.trim() || document.name,
    slug: nextSlug,
    exportSlug: nextExportSlug,
    width: nextWidth,
    height: nextHeight,
  });
  const boundedElements = candidate.elements.map((element) => clampElementToDocument(candidate, element));
  const nextDocument = DocumentSchema.parse({ ...candidate, elements: normalizeElementOrder(sortedByLayer(boundedElements)) });
  return touchProject(project, project.documents.map((current) => current.id === documentId ? nextDocument : current));
}

export function reorderDocuments(project: Project, documentIds: string[], targetIndex: number): Project {
  const selectedIds = new Set(documentIds);
  for (const id of selectedIds) documentFor(project, id);
  if (selectedIds.size === 0) return project;
  const selected = project.documents.filter((document) => selectedIds.has(document.id));
  const remaining = project.documents.filter((document) => !selectedIds.has(document.id));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return touchProject(project, remaining);
}
