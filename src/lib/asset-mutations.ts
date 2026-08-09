import { DEFAULT_BACKGROUND } from "./defaults";
import { nowIso } from "./ids";
import { ProjectSchema, type AssetPath, type Project, type SceneElement } from "./schema";

export type SerializedAssetMutation = <T>(flushCurrentProject: () => Promise<void>, mutation: () => Promise<T>) => Promise<T>;

export function mergeAssetMutationProject(latestProject: Project, serverProject: Project, preserveLocalChanges: boolean): Project {
  return preserveLocalChanges ? { ...latestProject, assets: serverProject.assets } : serverProject;
}

function elementUsesAsset(element: SceneElement, assetPath: AssetPath): boolean {
  return (element.type === "image" && element.assetPath === assetPath)
    || (element.type === "device" && element.screenshotPath === assetPath);
}

/** Remove every scene reference to an asset without leaving broken overflow links. */
export function removeAssetUsages(project: Project, assetPath: AssetPath, removeAsset = true): Project {
  const updatedAt = nowIso();
  let projectChanged = project.background.type === "asset" && project.background.assetPath === assetPath;
  const decks = project.decks.map((deck) => {
    const removedIds = new Set(deck.screens.flatMap((screen) => screen.layers.flatMap((layer) => (
      layer.kind === "owned" && elementUsesAsset(layer.element, assetPath) ? [layer.element.id] : []
    ))));
    let deckChanged = removedIds.size > 0;
    const screens = deck.screens.map((screen) => {
      const resetBackground = screen.background.type === "asset" && screen.background.assetPath === assetPath;
      const layers = screen.layers.filter((layer) => !removedIds.has(layer.kind === "owned" ? layer.element.id : layer.elementId));
      if (!resetBackground && layers.length === screen.layers.length) return screen;
      deckChanged = true;
      return {
        ...screen,
        background: resetBackground ? DEFAULT_BACKGROUND : screen.background,
        layers,
        updatedAt,
      };
    });
    if (!deckChanged) return deck;
    projectChanged = true;
    const groups = deck.groups.flatMap((group) => {
      const elementIds = group.elementIds.filter((elementId) => !removedIds.has(elementId));
      return elementIds.length >= 2 ? [{ ...group, elementIds }] : [];
    });
    return { ...deck, groups, screens, updatedAt };
  });
  const assets = removeAsset ? project.assets.filter((asset) => asset.path !== assetPath) : project.assets;
  if (!projectChanged && assets.length === project.assets.length) return project;
  return ProjectSchema.parse({
    ...project,
    background: project.background.type === "asset" && project.background.assetPath === assetPath ? DEFAULT_BACKGROUND : project.background,
    assets,
    decks,
    updatedAt,
  });
}

/**
 * Asset endpoints reload project.json before changing files. Serialize each
 * operation and flush the editor snapshot immediately before it so unsaved
 * scene edits cannot be replaced by an older server snapshot.
 */
export function createAssetMutationQueue(): SerializedAssetMutation {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(flushCurrentProject: () => Promise<void>, mutation: () => Promise<T>): Promise<T> {
    const operation = tail.then(async () => {
      await flushCurrentProject();
      return mutation();
    });
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  };
}
