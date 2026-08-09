import type { Deck, LayerEntry, LayerGroup, Project, SceneElement, Screen } from "../lib/schema";
import { resolveDeckScreen, type ResolvedElement } from "./overflow";

export type ResolvedScreen = Screen & {
  deckId: string;
  deckName: string;
  width: number;
  height: number;
  elements: ResolvedElement[];
};

export function selectActiveDeck(project: Project, deckId: string | null | undefined): Deck {
  return project.decks.find((deck) => deck.id === deckId) ?? project.decks[0] as Deck;
}

export function selectScreenWithDeck(project: Project, screenId: string | null | undefined): { deck: Deck; screen: Screen } | undefined {
  if (!screenId) return undefined;
  for (const deck of project.decks) {
    const screen = deck.screens.find((candidate) => candidate.id === screenId);
    if (screen) return { deck, screen };
  }
  return undefined;
}

export function selectActiveScreen(project: Project, deckId: string | null | undefined, screenId?: string | null): Screen {
  const deck = selectActiveDeck(project, deckId);
  return deck.screens.find((screen) => screen.id === screenId) ?? deck.screens[0] as Screen;
}

export function resolveScreen(project: Project, screenId: string | null | undefined): ResolvedScreen {
  const selected = selectScreenWithDeck(project, screenId) ?? {
    deck: project.decks[0] as Deck,
    screen: project.decks[0]?.screens[0] as Screen,
  };
  return {
    ...selected.screen,
    deckId: selected.deck.id,
    deckName: selected.deck.name,
    width: selected.deck.width,
    height: selected.deck.height,
    elements: resolveDeckScreen(selected.deck, selected.screen.id),
  };
}

export function selectSelectedElements(screen: { elements: readonly ResolvedElement[] }, selectedIds: readonly string[]): ResolvedElement[] {
  const selected = new Set(selectedIds);
  return screen.elements.filter((element) => selected.has(element.id));
}

export function selectSortedLayers(screen: { elements: readonly ResolvedElement[] }): ResolvedElement[] {
  return [...screen.elements].sort((left, right) => left.renderOrder - right.renderOrder);
}

export function selectGroupForElement(deck: Deck, elementId: string): LayerGroup | undefined {
  return deck.groups.find((group) => group.elementIds.includes(elementId));
}

export function selectLayerEntries(screen: Screen): LayerEntry[] {
  return screen.layers;
}

export function selectCanonicalElement(project: Project, elementId: string): SceneElement | undefined {
  for (const deck of project.decks) {
    for (const screen of deck.screens) {
      const layer = screen.layers.find((candidate) => candidate.kind === "owned" && candidate.element.id === elementId);
      if (layer?.kind === "owned") return layer.element;
    }
  }
  return undefined;
}

export function selectAssetReferences(project: Project, screenId?: string): Map<string, number> {
  const screens = screenId
    ? project.decks.flatMap((deck) => deck.screens.filter((screen) => screen.id === screenId).map((screen) => ({ deck, screen })))
    : project.decks.flatMap((deck) => deck.screens.map((screen) => ({ deck, screen })));
  const references = new Map<string, number>();
  if (!screenId && project.background.type === "asset") {
    references.set(project.background.assetPath, 1);
  }
  for (const { deck, screen } of screens) {
    if (screen.background.type === "asset") {
      references.set(screen.background.assetPath, (references.get(screen.background.assetPath) ?? 0) + 1);
    }
    for (const element of resolveDeckScreen(deck, screen.id)) {
      const assetPath = element.type === "image" ? element.assetPath : element.type === "device" ? element.screenshotPath : null;
      if (!assetPath) continue;
      references.set(assetPath, (references.get(assetPath) ?? 0) + 1);
    }
  }
  return references;
}

export type AssetUsage = {
  deckId: string;
  deckName: string;
  screenId: string;
  screenName: string;
  elementId: string;
  elementName: string;
  elementType: "image" | "device" | "background";
  linked: boolean;
};

export function selectAssetUsages(project: Project, assetPath: string): AssetUsage[] {
  const usages: AssetUsage[] = [];
  const firstDeck = project.decks[0];
  const firstScreen = firstDeck?.screens[0];
  if (project.background.type === "asset" && project.background.assetPath === assetPath && firstDeck && firstScreen) {
    usages.push({
      deckId: firstDeck.id,
      deckName: project.name,
      screenId: firstScreen.id,
      screenName: "Project defaults",
      elementId: `${project.id}:background`,
      elementName: "Project background",
      elementType: "background",
      linked: false,
    });
  }
  for (const deck of project.decks) {
    for (const screen of deck.screens) {
      if (screen.background.type === "asset" && screen.background.assetPath === assetPath) {
        usages.push({
          deckId: deck.id,
          deckName: deck.name,
          screenId: screen.id,
          screenName: screen.name,
          elementId: `${screen.id}:background`,
          elementName: "Background",
          elementType: "background",
          linked: false,
        });
      }
      for (const element of resolveDeckScreen(deck, screen.id)) {
        const referencedPath = element.type === "image" ? element.assetPath : element.type === "device" ? element.screenshotPath : null;
        if (referencedPath !== assetPath || (element.type !== "image" && element.type !== "device")) continue;
        usages.push({
          deckId: deck.id,
          deckName: deck.name,
          screenId: screen.id,
          screenName: screen.name,
          elementId: element.id,
          elementName: element.name,
          elementType: element.type,
          linked: element.isOverflowLink,
        });
      }
    }
  }
  return usages;
}

export function selectElementById(screen: { elements: readonly ResolvedElement[] }, elementId: string | null | undefined): ResolvedElement | undefined {
  return elementId ? screen.elements.find((element) => element.id === elementId) : undefined;
}

export function selectElementOverflow(project: Project, screenId: string, elementId: string): boolean {
  const context = selectScreenWithDeck(project, screenId);
  if (!context) return false;
  for (const screen of context.deck.screens) {
    const layer = screen.layers.find((candidate) => candidate.kind === "owned" && candidate.element.id === elementId);
    if (layer?.kind === "owned") return layer.overflow;
  }
  return false;
}
