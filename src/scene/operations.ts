import { createScreenPreset } from "../lib/defaults";
import { createId, nowIso, slugify } from "../lib/ids";
import { DeckSchema, LayerEntrySchema, ProjectSchema, SceneElementSchema, ScreenSchema } from "../lib/schema";
import type { Deck, DeviceElement, ImageFit, LayerEntry, OwnedLayer, Point, Project, SceneElement, Screen, ScreenPreset, Shadow, TextStyle } from "../lib/schema";
import type { ShapeElement } from "../lib/schema";
import { calculateTextAutoHeight } from "./text-geometry";
import {
  boundsIntersectScreen,
  elementDeckBounds,
  elementForOwnedLayer,
  ownerOfElement,
  overflowTargetScreenIds,
  screenContainingElementCenter,
  screenOrigin,
} from "./overflow";
import { resolveDeckScreen } from "./overflow";

export const MIN_DIMENSION = 1;

export class SceneOperationError extends Error {
  readonly code: "DECK_NOT_FOUND" | "SCREEN_NOT_FOUND" | "ELEMENT_NOT_FOUND" | "INVALID_OPERATION";

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
  preset?: DeviceElement["preset"];
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

export type AddDeckOptions = {
  id?: string;
  name?: string;
  slug?: string;
  width: number;
  height: number;
  screenPreset?: ScreenPreset;
  screenName?: string;
  screenSlug?: string;
  screenExportSlug?: string;
  now?: string;
};

export type AddScreenOptions = {
  id?: string;
  name?: string;
  slug?: string;
  exportSlug?: string;
  now?: string;
};

export type ScreenPatch = Partial<Pick<Screen, "name" | "slug" | "exportSlug" | "preset" | "background" | "notes">>;
export type DeckPatch = Partial<Pick<Deck, "name" | "slug">>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundToTenth(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function deckFor(project: Project, deckId: string): Deck {
  const deck = project.decks.find((candidate) => candidate.id === deckId);
  if (!deck) throw new SceneOperationError("DECK_NOT_FOUND", `Deck "${deckId}" was not found.`);
  return deck;
}

function screenContextFor(project: Project, screenId: string, expectedDeckId?: string): { deck: Deck; screen: Screen } {
  if (expectedDeckId) {
    const deck = deckFor(project, expectedDeckId);
    const screen = deck.screens.find((candidate) => candidate.id === screenId);
    if (!screen) throw new SceneOperationError("SCREEN_NOT_FOUND", `Screen "${screenId}" was not found in deck "${expectedDeckId}".`);
    return { deck, screen };
  }
  for (const deck of project.decks) {
    const screen = deck.screens.find((candidate) => candidate.id === screenId);
    if (screen) return { deck, screen };
  }
  throw new SceneOperationError("SCREEN_NOT_FOUND", `Screen "${screenId}" was not found.`);
}

function touchProject(project: Project, decks: Project["decks"]): Project {
  return ProjectSchema.parse({ ...project, decks, updatedAt: nowIso() });
}

function touchDeck(deck: Deck, values: Partial<Deck>): Deck {
  return DeckSchema.parse({ ...deck, ...values, updatedAt: nowIso() });
}

function touchScreen(screen: Screen, values: Partial<Screen>): Screen {
  return ScreenSchema.parse({ ...screen, ...values, updatedAt: nowIso() });
}

function withDeck(project: Project, deckId: string, update: (deck: Deck) => Deck): Project {
  const nextDecks = project.decks.map((deck) => deck.id === deckId ? update(deck) : deck);
  if (nextDecks.every((deck, index) => deck === project.decks[index])) return project;
  return touchProject(project, nextDecks);
}

function withScreen(project: Project, screenId: string, update: (screen: Screen, deck: Deck) => Screen): Project {
  const context = screenContextFor(project, screenId);
  return withDeck(project, context.deck.id, (deck) => {
    const nextScreens = deck.screens.map((screen) => screen.id === screenId ? update(screen, deck) : screen);
    if (nextScreens.every((screen, index) => screen === deck.screens[index])) return deck;
    return touchDeck(deck, { screens: nextScreens });
  });
}

function clampElementToDeck(deck: Deck, element: SceneElement, allowDeckGlobalX = false): SceneElement {
  const width = clamp(Math.round(Math.abs(finite(element.width, MIN_DIMENSION))), MIN_DIMENSION, deck.width * Math.max(1, deck.screens.length));
  const requestedHeight = element.type === "text" && element.style.autoHeight !== false
    ? calculateTextAutoHeight(element.text, width, element.style)
    : Math.abs(finite(element.height, MIN_DIMENSION));
  const height = clamp(Math.round(requestedHeight), MIN_DIMENSION, deck.height);
  const maxX = allowDeckGlobalX ? deck.width * Math.max(1, deck.screens.length) : deck.width;
  return SceneElementSchema.parse({
    ...element,
    x: clamp(Math.round(finite(element.x, 0)), MIN_DIMENSION - width, maxX - MIN_DIMENSION),
    y: clamp(Math.round(finite(element.y, 0)), MIN_DIMENSION - height, deck.height - MIN_DIMENSION),
    width,
    height,
    rotation: roundToTenth(finite(element.rotation, 0)),
    opacity: clamp(finite(element.opacity, 1), 0, 1),
  });
}

function ownedLayer(element: SceneElement, overflow = false): OwnedLayer {
  return { kind: "owned", element: SceneElementSchema.parse(element), overflow };
}

function layerElementId(layer: LayerEntry): string {
  return layer.kind === "owned" ? layer.element.id : layer.elementId;
}

function projectIds(project: Project): Set<string> {
  return new Set([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.decks.flatMap((deck) => [deck.id, ...deck.screens.flatMap((screen) => [screen.id, ...screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])])]),
  ]);
}

function uniqueId(type: string, used: Set<string>): string {
  let id = createId(type);
  while (used.has(id)) id = createId(type);
  used.add(id);
  return id;
}

function assertNoIdentityCollision(project: Project, ids: string[], label: string): void {
  const used = projectIds(project);
  for (const id of ids) {
    if (used.has(id)) throw new SceneOperationError("INVALID_OPERATION", `${label} id "${id}" is already in use.`);
    used.add(id);
  }
}

function uniqueDeckSlug(project: Project, proposed: string, ignoredId?: string): string {
  const existing = new Set(project.decks.filter((deck) => deck.id !== ignoredId).map((deck) => deck.slug));
  const base = slugify(proposed, "deck");
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueScreenSlug(project: Project, proposed: string, ignoredId?: string): string {
  const existing = new Set(project.decks.flatMap((deck) => deck.screens.filter((screen) => screen.id !== ignoredId).map((screen) => screen.slug)));
  const base = slugify(proposed, "screen");
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueScreenExportSlug(project: Project, proposed: string, ignoredId?: string): string {
  const existing = new Set(project.decks.flatMap((deck) => deck.screens.filter((screen) => screen.id !== ignoredId).map((screen) => screen.exportSlug)));
  const base = slugify(proposed, "screen");
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function patchElement(deck: Deck, element: SceneElement, patch: ElementPatch, coordinateScreenId: string, ownerScreenId: string): SceneElement {
  if (patch.id && patch.id !== element.id) throw new SceneOperationError("INVALID_OPERATION", "Element ids cannot be changed by an update.");
  if (patch.type && patch.type !== element.type) throw new SceneOperationError("INVALID_OPERATION", "Element types cannot be changed by an update.");
  const effectivePatch = element.locked
    ? Object.fromEntries(Object.entries(patch).filter(([key]) => !["x", "y", "width", "height", "rotation"].includes(key))) as ElementPatch
    : patch;
  const ownerOrigin = screenOrigin(deck, ownerScreenId);
  const coordinateOrigin = screenOrigin(deck, coordinateScreenId);
  const translatedPatch = ownerOrigin && coordinateOrigin
    ? {
      ...effectivePatch,
      ...(effectivePatch.x === undefined ? {} : { x: effectivePatch.x + coordinateOrigin.x - ownerOrigin.x }),
    }
    : effectivePatch;
  const next = {
    ...element,
    ...translatedPatch,
    ...(element.type === "text" && translatedPatch.style ? { style: { ...element.style, ...translatedPatch.style } } : {}),
    id: element.id,
    type: element.type,
  } as SceneElement;
  return SceneElementSchema.parse(clampElementToDeck(deck, next, coordinateScreenId !== ownerScreenId));
}

type ElementContext = {
  deck: Deck;
  targetScreen: Screen;
  ownerScreen: Screen;
  ownerLayer: OwnedLayer;
};

function elementContextFor(project: Project, targetScreenId: string, elementId: string): ElementContext {
  const { deck, screen: targetScreen } = screenContextFor(project, targetScreenId);
  const owner = ownerOfElement(deck, elementId);
  if (!owner) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in deck "${deck.id}".`);
  if (owner.screen.id !== targetScreen.id) {
    const linked = targetScreen.layers.some((layer) => layer.kind === "overflow-link" && layer.elementId === elementId && layer.ownerScreenId === owner.screen.id);
    if (!linked) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in screen "${targetScreen.id}".`);
  }
  return { deck, targetScreen, ownerScreen: owner.screen, ownerLayer: owner.layer };
}

function replaceOwnedElement(project: Project, deckId: string, ownerScreenId: string, elementId: string, nextElement: SceneElement): Project {
  return withDeck(project, deckId, (deck) => touchDeck(deck, {
    screens: deck.screens.map((screen) => screen.id !== ownerScreenId ? screen : touchScreen(screen, {
      layers: screen.layers.map((layer) => layer.kind === "owned" && layer.element.id === elementId ? ownedLayer(nextElement, layer.overflow) : layer),
    })),
  }));
}

function transferElementOwnershipInDeck(deck: Deck, elementId: string, targetScreenId: string): Deck {
  const owner = ownerOfElement(deck, elementId);
  const target = deck.screens.find((screen) => screen.id === targetScreenId);
  if (!owner) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in deck "${deck.id}".`);
  if (!target) throw new SceneOperationError("SCREEN_NOT_FOUND", `Screen "${targetScreenId}" was not found in deck "${deck.id}".`);
  if (owner.screen.id === target.id) return deck;
  const ownerOrigin = screenOrigin(deck, owner.screen.id);
  const targetOrigin = screenOrigin(deck, target.id);
  if (!ownerOrigin || !targetOrigin) throw new SceneOperationError("INVALID_OPERATION", "Could not resolve screen coordinates for ownership transfer.");

  const translated = SceneElementSchema.parse({
    ...owner.layer.element,
    x: owner.layer.element.x + ownerOrigin.x - targetOrigin.x,
  });
  const existingTargetLinkIndex = target.layers.findIndex((layer) => layer.kind === "overflow-link" && layer.elementId === elementId);
  const targetLayersWithoutElement = target.layers.filter((layer) => !(layer.kind === "overflow-link" && layer.elementId === elementId));
  const nextTargetLayers = [...targetLayersWithoutElement];
  const nextOwned = ownedLayer(translated, owner.layer.overflow);
  if (existingTargetLinkIndex >= 0) {
    nextTargetLayers.splice(Math.min(existingTargetLinkIndex, nextTargetLayers.length), 0, nextOwned);
  } else {
    nextTargetLayers.push(nextOwned);
  }

  const nextScreens = deck.screens.map((screen) => {
    if (screen.id === owner.screen.id) {
      return touchScreen(screen, { layers: screen.layers.filter((layer) => !(layer.kind === "owned" && layer.element.id === elementId)) });
    }
    if (screen.id === target.id) return touchScreen(screen, { layers: nextTargetLayers });
    return touchScreen(screen, { layers: screen.layers.filter((layer) => !(layer.kind === "overflow-link" && layer.elementId === elementId)) });
  });
  return touchDeck(deck, { screens: nextScreens });
}

/** Explicitly move a canonical element to another screen while preserving deck coordinates. */
export function transferElementOwnership(project: Project, elementId: string, targetScreenId: string): Project;
export function transferElementOwnership(project: Project, ownerScreenId: string, elementId: string, targetScreenId: string): Project;
export function transferElementOwnership(project: Project, first: string, second: string, third?: string): Project {
  const elementId = third === undefined ? first : second;
  const targetScreenId = third === undefined ? second : third;
  const context = screenContextFor(project, targetScreenId);
  const expectedOwner = third === undefined ? undefined : context.deck.screens.find((screen) => screen.id === first);
  const actualOwner = ownerOfElement(context.deck, elementId);
  if (third !== undefined && (!expectedOwner || !elementForOwnedLayer(expectedOwner, elementId) || actualOwner?.screen.id !== first)) {
    throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in owner screen "${first}".`);
  }
  if (!actualOwner) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in deck "${context.deck.id}".`);
  if (actualOwner.screen.id === targetScreenId) return project;
  const nextDeck = transferElementOwnershipInDeck(context.deck, elementId, targetScreenId);
  return reconcileOverflowLinks(touchProject(project, project.decks.map((deck) => deck.id === context.deck.id ? nextDeck : deck)), { transferOwnership: false });
}

function reconcileDeckOverflowLinks(inputDeck: Deck, transferOwnership: boolean): Deck {
  let deck = inputDeck;
  // Ownership follows the element until its visible geometry no longer
  // intersects the owner. At that point center containment chooses the new
  // owner and the transfer preserves the element's deck-global position.
  for (let pass = 0; transferOwnership && pass < deck.screens.length + 1; pass += 1) {
    let transferred = false;
    for (const screen of [...deck.screens]) {
      for (const layer of screen.layers) {
        if (layer.kind !== "owned") continue;
        const bounds = elementDeckBounds(deck, screen.id, layer.element);
        const centerOwner = screenContainingElementCenter(deck, screen.id, layer.element);
        if (bounds && !boundsIntersectScreen(deck, screen.id, bounds) && centerOwner && centerOwner !== screen.id) {
          deck = transferElementOwnershipInDeck(deck, layer.element.id, centerOwner);
          transferred = true;
          break;
        }
      }
      if (transferred) break;
    }
    if (!transferred) break;
  }

  const expectedByTarget = new Map<string, Array<{ elementId: string; ownerScreenId: string }>>();
  for (const ownerScreen of deck.screens) {
    for (const layer of ownerScreen.layers) {
      if (layer.kind !== "owned" || !layer.overflow) continue;
      for (const targetScreenId of overflowTargetScreenIds(deck, ownerScreen.id, layer.element)) {
        const values = expectedByTarget.get(targetScreenId) ?? [];
        values.push({ elementId: layer.element.id, ownerScreenId: ownerScreen.id });
        expectedByTarget.set(targetScreenId, values);
      }
    }
  }

  const nextScreens = deck.screens.map((screen) => {
    const expected = expectedByTarget.get(screen.id) ?? [];
    const expectedKeys = new Set(expected.map((value) => `${value.ownerScreenId}:${value.elementId}`));
    const retainedKeys = new Set<string>();
    const layers = screen.layers.filter((layer) => {
      if (layer.kind === "owned") return true;
      const key = `${layer.ownerScreenId}:${layer.elementId}`;
      if (!expectedKeys.has(key) || retainedKeys.has(key)) return false;
      retainedKeys.add(key);
      return true;
    });
    for (const value of expected) {
      const key = `${value.ownerScreenId}:${value.elementId}`;
      if (retainedKeys.has(key)) continue;
      layers.push({ kind: "overflow-link", elementId: value.elementId, ownerScreenId: value.ownerScreenId });
    }
    const changed = layers.length !== screen.layers.length || layers.some((layer, index) => JSON.stringify(layer) !== JSON.stringify(screen.layers[index]));
    return changed ? touchScreen(screen, { layers }) : screen;
  });
  return nextScreens.some((screen, index) => screen !== deck.screens[index])
    ? touchDeck(deck, { screens: nextScreens })
    : deck;
}

/** Reconcile all overflow links after a geometry, visibility, or deck-order change. */
export function reconcileOverflowLinks(project: Project, options: { transferOwnership?: boolean } = {}): Project {
  const decks = project.decks.map((deck) => reconcileDeckOverflowLinks(deck, options.transferOwnership !== false));
  if (decks.every((deck, index) => deck === project.decks[index])) return project;
  return touchProject(project, decks);
}

export function toggleElementOverflow(project: Project, screenId: string, elementId: string, enabled?: boolean): Project {
  const context = elementContextFor(project, screenId, elementId);
  const nextOverflow = enabled ?? !context.ownerLayer.overflow;
  const next = replaceOwnedElement(project, context.deck.id, context.ownerScreen.id, elementId, context.ownerLayer.element);
  const withFlag = {
    ...next,
    decks: next.decks.map((deck) => deck.id !== context.deck.id ? deck : touchDeck(deck, {
      screens: deck.screens.map((screen) => {
        const layers = screen.layers
          .filter((layer) => nextOverflow || layer.kind !== "overflow-link" || layer.elementId !== elementId)
          .map((layer) => layer.kind === "owned" && screen.id === context.ownerScreen.id && layer.element.id === elementId
            ? { ...layer, overflow: nextOverflow }
            : layer);
        return screen.id === context.ownerScreen.id || layers.length !== screen.layers.length
          ? touchScreen(screen, { layers })
          : screen;
      }),
    })),
  };
  return reconcileOverflowLinks(ProjectSchema.parse(withFlag));
}

export const setElementOverflow = toggleElementOverflow;

export function addElement(project: Project, screenId: string, element: SceneElement): Project {
  const { deck } = screenContextFor(project, screenId);
  if (projectIds(project).has(element.id)) throw new SceneOperationError("INVALID_OPERATION", `Element id "${element.id}" is already in use.`);
  const nextElement = clampElementToDeck(deck, SceneElementSchema.parse(element));
  const next = withScreen(project, screenId, (current) => touchScreen(current, { layers: [...current.layers, ownedLayer(nextElement)] }));
  return reconcileOverflowLinks(next);
}

export function removeElements(project: Project, screenId: string, elementIds: string[]): Project {
  const { deck } = screenContextFor(project, screenId);
  const ids = new Set(elementIds);
  if (ids.size === 0) return project;
  for (const id of ids) elementContextFor(project, screenId, id);
  const nextDeck = touchDeck(deck, {
    screens: deck.screens.map((screen) => touchScreen(screen, {
      layers: screen.layers.filter((layer) => !ids.has(layerElementId(layer))),
    })),
  });
  return touchProject(project, project.decks.map((candidate) => candidate.id === deck.id ? nextDeck : candidate));
}

export function updateElement(project: Project, screenId: string, elementId: string, patch: ElementPatch): Project {
  const context = elementContextFor(project, screenId, elementId);
  const nextElement = patchElement(context.deck, context.ownerLayer.element, patch, screenId, context.ownerScreen.id);
  return reconcileOverflowLinks(replaceOwnedElement(project, context.deck.id, context.ownerScreen.id, elementId, nextElement));
}

export function updateElements(project: Project, screenId: string, updates: ElementUpdate[] | Record<string, ElementPatch>): Project {
  const normalizedUpdates = Array.isArray(updates) ? updates : Object.entries(updates).map(([id, patch]) => ({ id, patch }));
  return normalizedUpdates.reduce((current, update) => updateElement(current, screenId, update.id, update.patch), project);
}

export function moveElements(project: Project, screenId: string, elementIds: string[], delta: MoveDelta): Project {
  const { deck } = screenContextFor(project, screenId);
  const ids = new Set(elementIds);
  if (ids.size === 0) return project;
  const contexts = elementIds.map((id) => elementContextFor(project, screenId, id));
  const selected = contexts.filter((context, index) => !context.ownerLayer.element.locked && elementIds.indexOf(context.ownerLayer.element.id) === index);
  if (selected.length === 0) return project;
  const origins = selected.map((context) => screenOrigin(deck, context.ownerScreen.id)).filter((origin): origin is NonNullable<typeof origin> => Boolean(origin));
  const minX = Math.min(...selected.map((context, index) => context.ownerLayer.element.x + (origins[index]?.x ?? 0)));
  const minY = Math.min(...selected.map((context) => context.ownerLayer.element.y));
  const maxRight = Math.max(...selected.map((context, index) => context.ownerLayer.element.x + context.ownerLayer.element.width + (origins[index]?.x ?? 0)));
  const maxBottom = Math.max(...selected.map((context) => context.ownerLayer.element.y + context.ownerLayer.element.height));
  const totalWidth = deck.width * deck.screens.length;
  const dx = clamp(finite(delta.x, 0), MIN_DIMENSION - maxRight, totalWidth - MIN_DIMENSION - minX);
  const dy = clamp(finite(delta.y, 0), MIN_DIMENSION - maxBottom, deck.height - MIN_DIMENSION - minY);
  let next = project;
  for (const context of selected) {
    next = replaceOwnedElement(next, context.deck.id, context.ownerScreen.id, context.ownerLayer.element.id, {
      ...context.ownerLayer.element,
      x: context.ownerLayer.element.x + dx,
      y: context.ownerLayer.element.y + dy,
    });
  }
  return reconcileOverflowLinks(next);
}

export function resizeElement(project: Project, screenId: string, elementId: string, input: ResizeElementInput): Project {
  const context = elementContextFor(project, screenId, elementId);
  const element = context.ownerLayer.element;
  if (element.locked) return project;
  const targetOrigin = screenOrigin(context.deck, screenId);
  const ownerOrigin = screenOrigin(context.deck, context.ownerScreen.id);
  const requestedX = finite(input.x, element.x);
  const requestedY = finite(input.y, element.y);
  const next = {
    ...element,
    x: (targetOrigin && ownerOrigin ? requestedX + targetOrigin.x - ownerOrigin.x : requestedX) + (finite(input.width, element.width) < 0 ? finite(input.width, element.width) : 0),
    y: requestedY + (finite(input.height, element.height) < 0 ? finite(input.height, element.height) : 0),
    width: Math.abs(finite(input.width, element.width)),
    height: Math.abs(finite(input.height, element.height)),
    rotation: finite(input.rotation, element.rotation),
  } as SceneElement;
  return reconcileOverflowLinks(replaceOwnedElement(project, context.deck.id, context.ownerScreen.id, elementId, clampElementToDeck(context.deck, next, screenId !== context.ownerScreen.id)));
}

function targetLayerEntry(screen: Screen, elementId: string): LayerEntry | undefined {
  return screen.layers.find((layer) => layerElementId(layer) === elementId);
}

export function reorderElements(project: Project, screenId: string, elementIds: string[], targetIndex: number): Project {
  const { screen } = screenContextFor(project, screenId);
  const selectedIds = new Set(elementIds);
  for (const id of selectedIds) {
    if (!targetLayerEntry(screen, id)) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${id}" was not found in screen "${screenId}".`);
  }
  if (selectedIds.size === 0) return project;
  const selected = screen.layers.filter((layer) => selectedIds.has(layerElementId(layer)));
  const remaining = screen.layers.filter((layer) => !selectedIds.has(layerElementId(layer)));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return withScreen(project, screenId, (current) => touchScreen(current, { layers: remaining.map((layer) => LayerEntrySchema.parse(layer)) }));
}

export const reorderElement = reorderElements;

export function duplicateElements(project: Project, screenId: string, elementIds: string[], offset: MoveDelta = { x: 24, y: 24 }): Project {
  const context = screenContextFor(project, screenId);
  const resolved = resolveDeckScreen(context.deck, screenId);
  const ids = new Set(elementIds);
  const selected = resolved.filter((element) => ids.has(element.id));
  if (selected.length !== ids.size) {
    const missing = elementIds.find((id) => !selected.some((element) => element.id === id));
    if (missing) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${missing}" was not found in screen "${screenId}".`);
  }
  if (selected.length === 0) return project;
  const usedIds = projectIds(project);
  const duplicates = selected.map((element) => {
    const { ownerScreenId: _ownerScreenId, targetScreenId: _targetScreenId, isOverflowLink: _isOverflowLink, renderOrder: _renderOrder, ...canonicalElement } = element;
    const duplicate = SceneElementSchema.parse({
      ...canonicalElement,
      id: uniqueId(element.type, usedIds),
      name: `${element.name} copy`,
      x: element.x + finite(offset.x, 24),
      y: element.y + finite(offset.y, 24),
    });
    return ownedLayer(clampElementToDeck(context.deck, duplicate));
  });
  const next = withScreen(project, screenId, (current) => touchScreen(current, { layers: [...current.layers, ...duplicates] }));
  return reconcileOverflowLinks(next);
}

export function addDeck(project: Project, options: AddDeckOptions): Project {
  const now = options.now ?? nowIso();
  const width = Math.round(finite(options.width, 0));
  const height = Math.round(finite(options.height, 0));
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new SceneOperationError("INVALID_OPERATION", "Deck width and height must be positive integers chosen at creation.");
  }
  const usedIds = projectIds(project);
  const screen = createScreenPreset(options.screenPreset ?? "blank", {
    id: uniqueId("screen", usedIds),
    name: options.screenName ?? "First screen",
    slug: options.screenSlug,
    exportSlug: options.screenExportSlug,
    width,
    height,
    now,
  });
  const deckName = options.name?.trim() || "New deck";
  const deck: Deck = {
    id: options.id ?? uniqueId("deck", usedIds),
    slug: uniqueDeckSlug(project, options.slug ?? deckName),
    name: deckName,
    width,
    height,
    screens: [{
      ...screen,
      slug: uniqueScreenSlug(project, screen.slug),
      exportSlug: uniqueScreenExportSlug(project, screen.exportSlug),
    }],
    createdAt: now,
    updatedAt: now,
  };
  assertNoIdentityCollision(project, [deck.id, ...deck.screens.flatMap((candidate) => [candidate.id, ...candidate.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])])], "Deck or screen");
  return touchProject(project, [...project.decks, DeckSchema.parse(deck)]);
}

export function duplicateDeck(project: Project, deckId: string, overrides: Pick<AddDeckOptions, "name" | "slug"> = {}): Project {
  const source = deckFor(project, deckId);
  const now = nowIso();
  const usedIds = projectIds(project);
  const screenIds = new Map(source.screens.map((screen) => [screen.id, uniqueId("screen", usedIds)]));
  const elementIds = new Map(source.screens.flatMap((screen) => screen.layers
    .filter((layer): layer is OwnedLayer => layer.kind === "owned")
    .map((layer) => [layer.element.id, uniqueId(layer.element.type, usedIds)] as const)));
  const screens = source.screens.map((screen, index) => {
    const layers: LayerEntry[] = screen.layers.map((layer): LayerEntry => layer.kind === "owned"
      ? ownedLayer({ ...layer.element, id: elementIds.get(layer.element.id) ?? uniqueId(layer.element.type, usedIds) }, layer.overflow)
      : {
        kind: "overflow-link" as const,
        elementId: elementIds.get(layer.elementId) ?? layer.elementId,
        ownerScreenId: screenIds.get(layer.ownerScreenId) ?? layer.ownerScreenId,
      });
    return ScreenSchema.parse({
      ...screen,
      id: screenIds.get(screen.id) ?? uniqueId("screen", usedIds),
      name: index === 0 ? `${screen.name} copy` : screen.name,
      slug: uniqueScreenSlug(project, `${screen.slug}-copy`),
      exportSlug: uniqueScreenExportSlug(project, `${screen.exportSlug}-copy`),
      layers,
      createdAt: now,
      updatedAt: now,
    });
  });
  const duplicate: Deck = {
    ...source,
    id: uniqueId("deck", usedIds),
    name: overrides.name?.trim() || `${source.name} copy`,
    slug: uniqueDeckSlug(project, overrides.slug ?? `${source.slug}-copy`),
    screens,
    createdAt: now,
    updatedAt: now,
  };
  assertNoIdentityCollision(project, [duplicate.id, ...duplicate.screens.flatMap((screen) => [screen.id, ...screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])])], "Deck or screen");
  return touchProject(project, [...project.decks, duplicate]);
}

export function removeDeck(project: Project, deckId: string): Project {
  deckFor(project, deckId);
  if (project.decks.length <= 1) throw new SceneOperationError("INVALID_OPERATION", "A project must keep at least one deck.");
  return touchProject(project, project.decks.filter((deck) => deck.id !== deckId));
}

export function reorderDecks(project: Project, deckIds: string[], targetIndex: number): Project {
  const selectedIds = new Set(deckIds);
  for (const id of selectedIds) deckFor(project, id);
  if (selectedIds.size === 0) return project;
  const selected = project.decks.filter((deck) => selectedIds.has(deck.id));
  const remaining = project.decks.filter((deck) => !selectedIds.has(deck.id));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return touchProject(project, remaining);
}

export function addScreen(project: Project, deckId: string, presetOrScreen: ScreenPreset | Screen, options: AddScreenOptions = {}): Project {
  const deck = deckFor(project, deckId);
  const now = options.now ?? nowIso();
  const usedIds = projectIds(project);
  const sourceScreen = typeof presetOrScreen === "string"
    ? createScreenPreset(presetOrScreen, { ...options, id: options.id ?? uniqueId("screen", usedIds), width: deck.width, height: deck.height, now })
    : ScreenSchema.parse(presetOrScreen);
  const layers = sourceScreen.layers
    .filter((layer): layer is OwnedLayer => layer.kind === "owned")
    .map((layer) => ownedLayer(clampElementToDeck(deck, layer.element), layer.overflow));
  const nextScreen = ScreenSchema.parse({
    ...sourceScreen,
    id: options.id ?? (sourceScreen.id || uniqueId("screen", usedIds)),
    slug: uniqueScreenSlug(project, options.slug ?? sourceScreen.slug),
    exportSlug: uniqueScreenExportSlug(project, options.exportSlug ?? sourceScreen.exportSlug),
    layers,
    createdAt: now,
    updatedAt: now,
  });
  assertNoIdentityCollision(project, [nextScreen.id, ...nextScreen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])], "Screen or element");
  return reconcileOverflowLinks(withDeck(project, deckId, (current) => touchDeck(current, { screens: [...current.screens, nextScreen] })));
}

export function duplicateScreen(project: Project, deckIdOrScreenId: string, screenIdOrOverrides?: string | Pick<AddScreenOptions, "name" | "slug">, overrides: Pick<AddScreenOptions, "name" | "slug"> = {}): Project {
  const expectedDeckId = typeof screenIdOrOverrides === "string" ? deckIdOrScreenId : undefined;
  const screenId = typeof screenIdOrOverrides === "string" ? screenIdOrOverrides : deckIdOrScreenId;
  const context = screenContextFor(project, screenId, expectedDeckId);
  const values = typeof screenIdOrOverrides === "string" ? overrides : screenIdOrOverrides ?? {};
  const now = nowIso();
  const usedIds = projectIds(project);
  const duplicate = ScreenSchema.parse({
    ...context.screen,
    id: uniqueId("screen", usedIds),
    name: values.name?.trim() || `${context.screen.name} copy`,
    slug: uniqueScreenSlug(project, values.slug ?? `${context.screen.slug}-copy`),
    exportSlug: uniqueScreenExportSlug(project, `${context.screen.exportSlug}-copy`),
    layers: context.screen.layers.flatMap((layer) => layer.kind === "owned"
      ? [ownedLayer({ ...layer.element, id: uniqueId(layer.element.type, usedIds) }, layer.overflow)]
      : []),
    createdAt: now,
    updatedAt: now,
  });
  assertNoIdentityCollision(project, [duplicate.id, ...duplicate.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])], "Screen or element");
  return reconcileOverflowLinks(withDeck(project, context.deck.id, (deck) => touchDeck(deck, { screens: [...deck.screens, duplicate] })));
}

export function removeScreen(project: Project, deckIdOrScreenId: string, screenId?: string): Project {
  const context = screenContextFor(project, screenId ?? deckIdOrScreenId, screenId ? deckIdOrScreenId : undefined);
  if (context.deck.screens.length <= 1) throw new SceneOperationError("INVALID_OPERATION", "A deck must keep at least one screen.");
  const remaining = context.deck.screens.filter((candidate) => candidate.id !== context.screen.id);
  const receiver = remaining[Math.min(context.deck.screens.findIndex((candidate) => candidate.id === context.screen.id), remaining.length - 1)];
  if (!receiver) throw new SceneOperationError("INVALID_OPERATION", "A deck must keep a screen to receive transferred elements.");
  let nextDeck = context.deck;
  for (const layer of context.screen.layers) {
    if (layer.kind === "owned") nextDeck = transferElementOwnershipInDeck(nextDeck, layer.element.id, receiver.id);
  }
  nextDeck = touchDeck(nextDeck, { screens: nextDeck.screens.filter((candidate) => candidate.id !== context.screen.id) });
  return reconcileOverflowLinks(touchProject(project, project.decks.map((deck) => deck.id === context.deck.id ? nextDeck : deck)));
}

export function reorderScreens(project: Project, deckId: string, screenIds: string[], targetIndex: number): Project {
  const deck = deckFor(project, deckId);
  const selectedIds = new Set(screenIds);
  for (const id of selectedIds) screenContextFor(project, id, deckId);
  if (selectedIds.size === 0) return project;
  const selected = deck.screens.filter((screen) => selectedIds.has(screen.id));
  const remaining = deck.screens.filter((screen) => !selectedIds.has(screen.id));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return reconcileOverflowLinks(withDeck(project, deckId, (current) => touchDeck(current, { screens: remaining })));
}

export function updateScreen(project: Project, screenId: string, patch: ScreenPatch): Project {
  const context = screenContextFor(project, screenId);
  const rawPatch = patch as Record<string, unknown>;
  if ("width" in rawPatch || "height" in rawPatch) {
    throw new SceneOperationError("INVALID_OPERATION", "Screen dimensions are inherited from its deck and cannot be updated on a screen.");
  }
  const candidate = touchScreen(context.screen, {
    ...patch,
    name: patch.name === undefined ? context.screen.name : patch.name.trim() || context.screen.name,
    slug: patch.slug === undefined ? context.screen.slug : uniqueScreenSlug(project, patch.slug, screenId),
    exportSlug: patch.exportSlug === undefined ? context.screen.exportSlug : uniqueScreenExportSlug(project, patch.exportSlug, screenId),
  });
  const layers = candidate.layers.map((layer) => layer.kind === "owned" ? ownedLayer(clampElementToDeck(context.deck, layer.element), layer.overflow) : layer);
  return reconcileOverflowLinks(withDeck(project, context.deck.id, (deck) => touchDeck(deck, {
    screens: deck.screens.map((screen) => screen.id === screenId ? touchScreen(screen, { ...candidate, layers }) : screen),
  })));
}

export function updateDeck(project: Project, deckId: string, patch: DeckPatch): Project {
  const deck = deckFor(project, deckId);
  const rawPatch = patch as Record<string, unknown>;
  if ("width" in rawPatch || "height" in rawPatch) {
    throw new SceneOperationError("INVALID_OPERATION", "Deck dimensions are immutable after creation.");
  }
  const nextName = patch.name === undefined ? deck.name : patch.name.trim() || deck.name;
  const nextSlug = patch.slug === undefined ? deck.slug : uniqueDeckSlug(project, patch.slug, deckId);
  return withDeck(project, deckId, (current) => touchDeck(current, { name: nextName, slug: nextSlug }));
}
