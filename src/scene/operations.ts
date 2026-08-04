import { createScreenPreset } from "../lib/defaults";
import { createId, nowIso, slugify } from "../lib/ids";
import { DeckSchema, SceneElementSchema, ScreenSchema } from "../lib/schema";
import type { Deck, DeviceElement, ImageFit, Point, Project, SceneElement, Screen, ScreenPreset, Shadow, TextStyle } from "../lib/schema";
import type { ShapeElement } from "../lib/schema";
import { calculateTextAutoHeight } from "./text-geometry";
import { normalizeLayerOrder, sortLayerElements } from "./selectors";

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

function elementFor(screen: Screen, elementId: string): SceneElement {
  const element = screen.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new SceneOperationError("ELEMENT_NOT_FOUND", `Element "${elementId}" was not found in screen "${screen.id}".`);
  return element;
}

function touchProject(project: Project, decks: Project["decks"]): Project {
  return { ...project, decks, updatedAt: nowIso() };
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

function sortedByLayer(elements: SceneElement[]): SceneElement[] {
  return sortLayerElements(elements);
}

export function normalizeElementOrder(elements: SceneElement[]): SceneElement[] {
  return elements.map((element, index) => ({ ...element, zIndex: index }));
}

function clampElementToDeck(deck: Deck, element: SceneElement): SceneElement {
  const width = clamp(Math.round(Math.abs(finite(element.width, MIN_DIMENSION))), MIN_DIMENSION, deck.width);
  const requestedHeight = element.type === "text" && element.style.autoHeight !== false
    ? calculateTextAutoHeight(element.text, width, element.style)
    : Math.abs(finite(element.height, MIN_DIMENSION));
  const height = clamp(Math.round(requestedHeight), MIN_DIMENSION, deck.height);
  return {
    ...element,
    x: clamp(Math.round(finite(element.x, 0)), MIN_DIMENSION - width, deck.width - MIN_DIMENSION),
    y: clamp(Math.round(finite(element.y, 0)), MIN_DIMENSION - height, deck.height - MIN_DIMENSION),
    width,
    height,
    rotation: roundToTenth(finite(element.rotation, 0)),
    opacity: clamp(finite(element.opacity, 1), 0, 1),
  } as SceneElement;
}

function updateScreenElements(deck: Deck, screen: Screen, elements: SceneElement[]): Screen {
  const bounded = elements.map((element) => clampElementToDeck(deck, element));
  return touchScreen(screen, { elements: normalizeElementOrder(sortedByLayer(bounded)) });
}

function projectIds(project: Project): Set<string> {
  return new Set([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.decks.flatMap((deck) => [deck.id, ...deck.screens.flatMap((screen) => [screen.id, ...screen.elements.map((element) => element.id)])]),
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

function patchElement(deck: Deck, element: SceneElement, patch: ElementPatch): SceneElement {
  if (patch.id && patch.id !== element.id) throw new SceneOperationError("INVALID_OPERATION", "Element ids cannot be changed by an update.");
  if (patch.type && patch.type !== element.type) throw new SceneOperationError("INVALID_OPERATION", "Element types cannot be changed by an update.");
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
  return SceneElementSchema.parse(clampElementToDeck(deck, next));
}

export function addElement(project: Project, screenId: string, element: SceneElement): Project {
  const { deck, screen } = screenContextFor(project, screenId);
  if (projectIds(project).has(element.id)) throw new SceneOperationError("INVALID_OPERATION", `Element id "${element.id}" is already in use.`);
  const nextElement = clampElementToDeck(deck, { ...SceneElementSchema.parse(element), zIndex: screen.elements.length });
  return withScreen(project, screenId, (current, currentDeck) => updateScreenElements(currentDeck, current, [...current.elements, nextElement]));
}

export function removeElements(project: Project, screenId: string, elementIds: string[]): Project {
  const { screen } = screenContextFor(project, screenId);
  const ids = new Set(elementIds);
  if (ids.size === 0) return project;
  for (const id of ids) elementFor(screen, id);
  return withScreen(project, screenId, (current, deck) => updateScreenElements(deck, current, current.elements.filter((element) => !ids.has(element.id))));
}

export function updateElement(project: Project, screenId: string, elementId: string, patch: ElementPatch): Project {
  const { screen } = screenContextFor(project, screenId);
  const current = elementFor(screen, elementId);
  return withScreen(project, screenId, (currentScreen, deck) => updateScreenElements(
    deck,
    currentScreen,
    currentScreen.elements.map((element) => element.id === elementId ? patchElement(deck, current, patch) : element),
  ));
}

export function updateElements(project: Project, screenId: string, updates: ElementUpdate[] | Record<string, ElementPatch>): Project {
  const normalizedUpdates = Array.isArray(updates) ? updates : Object.entries(updates).map(([id, patch]) => ({ id, patch }));
  if (normalizedUpdates.length === 0) return project;
  const { screen } = screenContextFor(project, screenId);
  const updateMap = new Map(normalizedUpdates.map((update) => [update.id, update.patch]));
  for (const id of updateMap.keys()) elementFor(screen, id);
  return withScreen(project, screenId, (currentScreen, deck) => updateScreenElements(
    deck,
    currentScreen,
    currentScreen.elements.map((element) => {
      const patch = updateMap.get(element.id);
      return patch ? patchElement(deck, element, patch) : element;
    }),
  ));
}

export function moveElements(project: Project, screenId: string, elementIds: string[], delta: MoveDelta): Project {
  const { deck, screen } = screenContextFor(project, screenId);
  const ids = new Set(elementIds);
  const requested = screen.elements.filter((element) => ids.has(element.id));
  if (requested.length !== ids.size) {
    const missing = elementIds.find((id) => !requested.some((element) => element.id === id));
    if (missing) elementFor(screen, missing);
  }
  const selected = requested.filter((element) => !element.locked);
  if (selected.length === 0) return project;
  const requestedX = finite(delta.x, 0);
  const requestedY = finite(delta.y, 0);
  const minX = Math.min(...selected.map((element) => element.x));
  const minY = Math.min(...selected.map((element) => element.y));
  const maxRight = Math.max(...selected.map((element) => element.x + element.width));
  const maxBottom = Math.max(...selected.map((element) => element.y + element.height));
  const dx = clamp(requestedX, MIN_DIMENSION - maxRight, deck.width - MIN_DIMENSION - minX);
  const dy = clamp(requestedY, MIN_DIMENSION - maxBottom, deck.height - MIN_DIMENSION - minY);
  return withScreen(project, screenId, (current, currentDeck) => updateScreenElements(
    currentDeck,
    current,
    current.elements.map((element) => ids.has(element.id) && !element.locked ? { ...element, x: element.x + dx, y: element.y + dy } : element),
  ));
}

export function resizeElement(project: Project, screenId: string, elementId: string, input: ResizeElementInput): Project {
  const { screen } = screenContextFor(project, screenId);
  const element = elementFor(screen, elementId);
  if (element.locked) return project;
  const widthValue = finite(input.width, element.width);
  const heightValue = finite(input.height, element.height);
  const next = {
    ...element,
    x: finite(input.x, element.x) + (widthValue < 0 ? widthValue : 0),
    y: finite(input.y, element.y) + (heightValue < 0 ? heightValue : 0),
    width: Math.abs(widthValue),
    height: Math.abs(heightValue),
    rotation: finite(input.rotation, element.rotation),
  } as SceneElement;
  return withScreen(project, screenId, (current, deck) => updateScreenElements(
    deck,
    current,
    current.elements.map((candidate) => candidate.id === elementId ? next : candidate),
  ));
}

export function reorderElements(project: Project, screenId: string, elementIds: string[], targetIndex: number): Project {
  const { screen } = screenContextFor(project, screenId);
  const selectedIds = new Set(elementIds);
  for (const id of selectedIds) elementFor(screen, id);
  if (selectedIds.size === 0) return project;
  const ordered = sortedByLayer(screen.elements);
  const selected = ordered.filter((element) => selectedIds.has(element.id));
  const remaining = ordered.filter((element) => !selectedIds.has(element.id));
  const insertionIndex = clamp(Math.round(targetIndex), 0, remaining.length);
  remaining.splice(insertionIndex, 0, ...selected);
  return withScreen(project, screenId, (current, deck) => updateScreenElements(deck, current, normalizeElementOrder(remaining)));
}

export const reorderElement = reorderElements;

export function duplicateElements(project: Project, screenId: string, elementIds: string[], offset: MoveDelta = { x: 24, y: 24 }): Project {
  const { deck, screen } = screenContextFor(project, screenId);
  const ids = new Set(elementIds);
  const selected = sortedByLayer(screen.elements).filter((element) => ids.has(element.id));
  if (selected.length !== ids.size) {
    const missing = elementIds.find((id) => !selected.some((element) => element.id === id));
    if (missing) elementFor(screen, missing);
  }
  if (selected.length === 0) return project;
  const usedIds = projectIds(project);
  let nextZIndex = screen.elements.length;
  const duplicates = selected.map((element) => clampElementToDeck(deck, {
    ...element,
    id: uniqueId(element.type, usedIds),
    name: `${element.name} copy`,
    x: element.x + finite(offset.x, 24),
    y: element.y + finite(offset.y, 24),
    zIndex: nextZIndex++,
  } as SceneElement));
  return withScreen(project, screenId, (current, currentDeck) => updateScreenElements(currentDeck, current, [...current.elements, ...duplicates]));
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
  assertNoIdentityCollision(project, [deck.id, ...deck.screens.flatMap((candidate) => [candidate.id, ...candidate.elements.map((element) => element.id)])], "Deck or screen");
  return touchProject(project, [...project.decks, DeckSchema.parse(deck)]);
}

export function duplicateDeck(project: Project, deckId: string, overrides: Pick<AddDeckOptions, "name" | "slug"> = {}): Project {
  const source = deckFor(project, deckId);
  const now = nowIso();
  const usedIds = projectIds(project);
  const screens = source.screens.map((screen, index) => ({
    ...screen,
    id: uniqueId("screen", usedIds),
    name: index === 0 ? `${screen.name} copy` : screen.name,
    slug: uniqueScreenSlug(project, `${screen.slug}-copy`),
    exportSlug: uniqueScreenExportSlug(project, `${screen.exportSlug}-copy`),
    elements: normalizeLayerOrder(screen.elements.map((element) => ({ ...element, id: uniqueId(element.type, usedIds) }))),
    createdAt: now,
    updatedAt: now,
  }));
  const duplicate: Deck = {
    ...source,
    id: uniqueId("deck", usedIds),
    name: overrides.name?.trim() || `${source.name} copy`,
    slug: uniqueDeckSlug(project, overrides.slug ?? `${source.slug}-copy`),
    screens,
    createdAt: now,
    updatedAt: now,
  };
  assertNoIdentityCollision(project, [duplicate.id, ...duplicate.screens.flatMap((screen) => [screen.id, ...screen.elements.map((element) => element.id)])], "Deck or screen");
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
  const screen = typeof presetOrScreen === "string"
    ? createScreenPreset(presetOrScreen, { ...options, id: options.id ?? uniqueId("screen", usedIds), width: deck.width, height: deck.height, now })
    : ScreenSchema.parse({ ...presetOrScreen, id: options.id ?? presetOrScreen.id, createdAt: now, updatedAt: now });
  const nextScreen = ScreenSchema.parse({
    ...screen,
    id: screen.id || uniqueId("screen", usedIds),
    slug: uniqueScreenSlug(project, options.slug ?? screen.slug),
    exportSlug: uniqueScreenExportSlug(project, options.exportSlug ?? screen.exportSlug),
    elements: normalizeLayerOrder(screen.elements.map((element) => clampElementToDeck(deck, element))),
  });
  assertNoIdentityCollision(project, [nextScreen.id, ...nextScreen.elements.map((element) => element.id)], "Screen or element");
  return withDeck(project, deckId, (current) => touchDeck(current, { screens: [...current.screens, nextScreen] }));
}

export function duplicateScreen(project: Project, deckIdOrScreenId: string, screenIdOrOverrides?: string | Pick<AddScreenOptions, "name" | "slug">, overrides: Pick<AddScreenOptions, "name" | "slug"> = {}): Project {
  const expectedDeckId = typeof screenIdOrOverrides === "string" ? deckIdOrScreenId : undefined;
  const screenId = typeof screenIdOrOverrides === "string" ? screenIdOrOverrides : deckIdOrScreenId;
  const context = screenContextFor(project, screenId, expectedDeckId);
  const values = typeof screenIdOrOverrides === "string" ? overrides : screenIdOrOverrides ?? {};
  const now = nowIso();
  const usedIds = projectIds(project);
  const duplicate: Screen = {
    ...context.screen,
    id: uniqueId("screen", usedIds),
    name: values.name?.trim() || `${context.screen.name} copy`,
    slug: uniqueScreenSlug(project, values.slug ?? `${context.screen.slug}-copy`),
    exportSlug: uniqueScreenExportSlug(project, `${context.screen.exportSlug}-copy`),
    elements: normalizeLayerOrder(context.screen.elements.map((element) => ({ ...element, id: uniqueId(element.type, usedIds) }))),
    createdAt: now,
    updatedAt: now,
  };
  assertNoIdentityCollision(project, [duplicate.id, ...duplicate.elements.map((element) => element.id)], "Screen or element");
  return withDeck(project, context.deck.id, (deck) => touchDeck(deck, { screens: [...deck.screens, duplicate] }));
}

export function removeScreen(project: Project, deckIdOrScreenId: string, screenId?: string): Project {
  const context = screenContextFor(project, screenId ?? deckIdOrScreenId, screenId ? deckIdOrScreenId : undefined);
  if (context.deck.screens.length <= 1) throw new SceneOperationError("INVALID_OPERATION", "A deck must keep at least one screen.");
  return withDeck(project, context.deck.id, (deck) => touchDeck(deck, { screens: deck.screens.filter((candidate) => candidate.id !== context.screen.id) }));
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
  return withDeck(project, deckId, (current) => touchDeck(current, { screens: remaining }));
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
  const boundedElements = candidate.elements.map((element) => clampElementToDeck(context.deck, element));
  return withDeck(project, context.deck.id, (deck) => touchDeck(deck, {
    screens: deck.screens.map((screen) => screen.id === screenId ? ScreenSchema.parse({ ...candidate, elements: normalizeElementOrder(sortedByLayer(boundedElements)) }) : screen),
  }));
}
