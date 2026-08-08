import type { Deck, OwnedLayer, SceneElement, Screen, Shadow } from "../lib/schema";
import { calculateTextAutoHeight } from "./text-geometry";

/** A resolved element is render-only data. Its geometry is local to the target screen. */
export type ResolvedElement = SceneElement & {
  ownerScreenId: string;
  targetScreenId: string;
  isOverflowLink: boolean;
  renderOrder: number;
};

/** Stable render-only identity for one canonical element projection. */
export function projectionKey(targetScreenId: string, elementId: string): string {
  return `${targetScreenId}:${elementId}`;
}

export type ScreenOrigin = {
  x: number;
  y: number;
};

export type ElementBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function screenHorizontalOrigin(deck: Pick<Deck, "width">, index: number): number {
  return Math.max(0, index) * deck.width;
}

export function screenOrigin(deck: Deck, screenId: string): ScreenOrigin | undefined {
  const index = deck.screens.findIndex((screen) => screen.id === screenId);
  return index < 0 ? undefined : { x: screenHorizontalOrigin(deck, index), y: 0 };
}

export function elementForOwnedLayer(screen: Screen, elementId: string): OwnedLayer | undefined {
  return screen.layers.find((layer): layer is OwnedLayer => layer.kind === "owned" && layer.element.id === elementId);
}

export function ownerOfElement(deck: Deck, elementId: string): { screen: Screen; layer: OwnedLayer } | undefined {
  for (const screen of deck.screens) {
    const layer = elementForOwnedLayer(screen, elementId);
    if (layer) return { screen, layer };
  }
  return undefined;
}

function rotatePoint(x: number, y: number, rotation: number): { x: number; y: number } {
  const radians = rotation * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

function shadowBounds(bounds: ElementBounds, shadow: Shadow | null | undefined): ElementBounds {
  if (!shadow) return bounds;
  return {
    left: bounds.left + Math.min(0, shadow.offsetX) - shadow.blur,
    top: bounds.top + Math.min(0, shadow.offsetY) - shadow.blur,
    right: bounds.right + Math.max(0, shadow.offsetX) + shadow.blur,
    bottom: bounds.bottom + Math.max(0, shadow.offsetY) + shadow.blur,
  };
}

function elementHeight(element: SceneElement): number {
  return element.type === "text" && element.style.autoHeight !== false
    ? Math.max(1, calculateTextAutoHeight(element.text, element.width, element.style))
    : element.height;
}

function elementStrokeWidth(element: SceneElement): number {
  return element.type === "shape" ? element.strokeWidth : 0;
}

/** Transformed element geometry used by alignment tools. Visual effects such as shadows are excluded. */
export function elementAlignmentBounds(element: SceneElement): ElementBounds {
  const width = element.width;
  const height = elementHeight(element);
  const stroke = elementStrokeWidth(element) / 2;
  const corners = [
    rotatePoint(0, 0, element.rotation),
    rotatePoint(width, 0, element.rotation),
    rotatePoint(width, height, element.rotation),
    rotatePoint(0, height, element.rotation),
  ];
  const left = element.x + Math.min(...corners.map((point) => point.x)) - stroke;
  const top = element.y + Math.min(...corners.map((point) => point.y)) - stroke;
  const right = element.x + Math.max(...corners.map((point) => point.x)) + stroke;
  const bottom = element.y + Math.max(...corners.map((point) => point.y)) + stroke;
  return { left, top, right, bottom };
}

export function elementLocalBounds(element: SceneElement): ElementBounds {
  return shadowBounds(elementAlignmentBounds(element), element.type === "text" ? element.style.shadow ?? element.shadow : element.shadow);
}

export function elementDeckBounds(deck: Deck, ownerScreenId: string, element: SceneElement): ElementBounds | undefined {
  const origin = screenOrigin(deck, ownerScreenId);
  if (!origin) return undefined;
  const local = elementLocalBounds(element);
  return { left: local.left + origin.x, top: local.top + origin.y, right: local.right + origin.x, bottom: local.bottom + origin.y };
}

export function boundsIntersectScreen(deck: Deck, targetScreenId: string, bounds: ElementBounds): boolean {
  const origin = screenOrigin(deck, targetScreenId);
  if (!origin) return false;
  return bounds.right > origin.x && bounds.left < origin.x + deck.width && bounds.bottom > origin.y && bounds.top < origin.y + deck.height;
}

export function overflowTargetScreenIds(deck: Deck, ownerScreenId: string, element: SceneElement): string[] {
  if (!element.visible) return [];
  const bounds = elementDeckBounds(deck, ownerScreenId, element);
  if (!bounds) return [];
  return deck.screens
    .filter((screen) => screen.id !== ownerScreenId && boundsIntersectScreen(deck, screen.id, bounds))
    .map((screen) => screen.id);
}

export function elementDeckCenter(deck: Deck, ownerScreenId: string, element: SceneElement): { x: number; y: number } | undefined {
  const bounds = elementDeckBounds(deck, ownerScreenId, element);
  if (!bounds) return undefined;
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}

export function screenContainingElementCenter(deck: Deck, ownerScreenId: string, element: SceneElement): string | undefined {
  const center = elementDeckCenter(deck, ownerScreenId, element);
  if (!center) return undefined;
  return deck.screens.find((screen) => {
    const origin = screenOrigin(deck, screen.id);
    return Boolean(origin && center.x >= origin.x && center.x < origin.x + deck.width && center.y >= origin.y && center.y < origin.y + deck.height);
  })?.id;
}

function resolvedElement(element: SceneElement, ownerScreenId: string, targetScreenId: string, renderOrder: number, x: number, y: number): ResolvedElement {
  return {
    ...element,
    x,
    y,
    ownerScreenId,
    targetScreenId,
    isOverflowLink: ownerScreenId !== targetScreenId,
    renderOrder,
  };
}

/** Resolve one target screen's canonical layer array into its independent render order. */
export function resolveDeckScreen(deck: Deck, targetScreenId: string): ResolvedElement[] {
  const target = deck.screens.find((screen) => screen.id === targetScreenId);
  if (!target) return [];
  const targetOrigin = screenOrigin(deck, target.id);
  if (!targetOrigin) return [];
  const resolved: ResolvedElement[] = [];
  target.layers.forEach((layer, renderOrder) => {
    if (layer.kind === "owned") {
      resolved.push(resolvedElement(layer.element, target.id, target.id, renderOrder, layer.element.x, layer.element.y));
      return;
    }
    const owner = ownerOfElement(deck, layer.elementId);
    const ownerOrigin = owner ? screenOrigin(deck, owner.screen.id) : undefined;
    if (!owner || !ownerOrigin || owner.screen.id !== layer.ownerScreenId) return;
    resolved.push(resolvedElement(
      owner.layer.element,
      owner.screen.id,
      target.id,
      renderOrder,
      owner.layer.element.x + ownerOrigin.x - targetOrigin.x,
      owner.layer.element.y,
    ));
  });
  return resolved;
}

export const resolveScreenElements = resolveDeckScreen;
