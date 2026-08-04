import type { Deck, LegacySceneElement, OwnedLayer, SceneElement, Screen, Shadow } from "../lib/schema";
import { calculateTextAutoHeight } from "./text-geometry";

export type ScreenOrigin = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElementBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ResolvedElement = LegacySceneElement & {
  ownerScreenId: string;
  targetScreenId: string;
  isOverflowLink: boolean;
};

export function screenHorizontalOrigin(deck: Pick<Deck, "width">, index: number): number {
  return Math.max(0, Math.round(index)) * deck.width;
}

export function screenOrigin(deck: Deck, screenId: string): ScreenOrigin | undefined {
  const index = deck.screens.findIndex((screen) => screen.id === screenId);
  if (index < 0) return undefined;
  return {
    index,
    x: screenHorizontalOrigin(deck, index),
    y: 0,
    width: deck.width,
    height: deck.height,
  };
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
  const blur = Math.max(0, shadow.blur);
  const shifted = {
    left: bounds.left + shadow.offsetX - blur,
    top: bounds.top + shadow.offsetY - blur,
    right: bounds.right + shadow.offsetX + blur,
    bottom: bounds.bottom + shadow.offsetY + blur,
  };
  return {
    left: Math.min(bounds.left, shifted.left),
    top: Math.min(bounds.top, shifted.top),
    right: Math.max(bounds.right, shifted.right),
    bottom: Math.max(bounds.bottom, shifted.bottom),
  };
}

function elementHeight(element: SceneElement): number {
  return element.type === "text" && element.style.autoHeight !== false
    ? Math.max(1, calculateTextAutoHeight(element.text, element.width, element.style))
    : element.height;
}

function elementStrokeWidth(element: SceneElement): number {
  return element.type === "shape" ? Math.max(0, element.strokeWidth) / 2 : 0;
}

/**
 * Conservative local pixel bounds for seam reconciliation. The renderer
 * rotates each element around its local origin, so the same corner transform
 * is used here. Stroke, text auto-height, and both supported shadow locations
 * are included to keep visible pixels from disappearing at a seam.
 */
export function elementLocalBounds(element: SceneElement): ElementBounds {
  const height = elementHeight(element);
  const corners = [
    rotatePoint(0, 0, element.rotation),
    rotatePoint(element.width, 0, element.rotation),
    rotatePoint(element.width, height, element.rotation),
    rotatePoint(0, height, element.rotation),
  ];
  const stroke = elementStrokeWidth(element);
  let bounds: ElementBounds = {
    left: Math.min(...corners.map((point) => point.x)) - stroke,
    top: Math.min(...corners.map((point) => point.y)) - stroke,
    right: Math.max(...corners.map((point) => point.x)) + stroke,
    bottom: Math.max(...corners.map((point) => point.y)) + stroke,
  };
  bounds = shadowBounds(bounds, element.shadow);
  if (element.type === "text") bounds = shadowBounds(bounds, element.style.shadow);
  return bounds;
}

export function elementDeckBounds(deck: Deck, ownerScreenId: string, element: SceneElement): ElementBounds | undefined {
  const origin = screenOrigin(deck, ownerScreenId);
  if (!origin) return undefined;
  const local = elementLocalBounds(element);
  return {
    left: local.left + origin.x + element.x,
    top: local.top + element.y,
    right: local.right + origin.x + element.x,
    bottom: local.bottom + element.y,
  };
}

export function boundsIntersectScreen(deck: Deck, targetScreenId: string, bounds: ElementBounds): boolean {
  const origin = screenOrigin(deck, targetScreenId);
  if (!origin) return false;
  return bounds.right > origin.x
    && bounds.left < origin.x + origin.width
    && bounds.bottom > origin.y
    && bounds.top < origin.y + origin.height;
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
  const origin = screenOrigin(deck, ownerScreenId);
  if (!origin) return undefined;
  const height = elementHeight(element);
  const center = rotatePoint(element.width / 2, height / 2, element.rotation);
  return { x: origin.x + element.x + center.x, y: element.y + center.y };
}

export function screenContainingElementCenter(deck: Deck, ownerScreenId: string, element: SceneElement): string | undefined {
  const center = elementDeckCenter(deck, ownerScreenId, element);
  if (!center || deck.screens.length === 0) return undefined;
  const index = Math.min(deck.screens.length - 1, Math.max(0, Math.floor(center.x / deck.width)));
  return deck.screens[index]?.id;
}

function resolvedElement(element: SceneElement, ownerScreenId: string, targetScreenId: string, zIndex: number, x: number, y: number): ResolvedElement {
  return {
    ...element,
    x,
    y,
    zIndex,
    ownerScreenId,
    targetScreenId,
    isOverflowLink: ownerScreenId !== targetScreenId,
  };
}

/** Resolve one target screen's canonical layers into local render elements. */
export function resolveDeckScreen(deck: Deck, targetScreenId: string): ResolvedElement[] {
  const target = deck.screens.find((screen) => screen.id === targetScreenId);
  if (!target) return [];
  const resolved: ResolvedElement[] = [];
  target.layers.forEach((layer, zIndex) => {
    if (layer.kind === "owned") {
      resolved.push(resolvedElement(layer.element, target.id, target.id, zIndex, layer.element.x, layer.element.y));
      return;
    }
    const owner = deck.screens.find((screen) => screen.id === layer.ownerScreenId);
    const owned = owner ? elementForOwnedLayer(owner, layer.elementId) : undefined;
    const ownerOrigin = owner ? screenOrigin(deck, owner.id) : undefined;
    const targetOrigin = screenOrigin(deck, target.id);
    if (!owner || !owned || !ownerOrigin || !targetOrigin) return;
    resolved.push(resolvedElement(
      owned.element,
      owner.id,
      target.id,
      zIndex,
      owned.element.x + ownerOrigin.x - targetOrigin.x,
      owned.element.y,
    ));
  });
  return resolved;
}

export function resolveScreenElements(deck: Deck, targetScreenId: string): ResolvedElement[] {
  return resolveDeckScreen(deck, targetScreenId);
}
