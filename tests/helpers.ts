import type { Project, SceneElement, Screen } from "../src/lib/schema";
import { resolveScreen } from "../src/scene/selectors";

export function ownedElements(screen: Screen): SceneElement[] {
  return screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element] : []);
}

export function ownedElement(screen: Screen, elementId: string): SceneElement | undefined {
  for (const layer of screen.layers) {
    if (layer.kind === "owned" && layer.element.id === elementId) return layer.element;
  }
  return undefined;
}

export function resolvedElements(project: Project, screenId: string) {
  return resolveScreen(project, screenId).elements;
}
