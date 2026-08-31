import type { AssetMetadata, Project } from "./schema";
import { resolveScreen, selectAssetReferences, type ResolvedScreen } from "../scene/selectors";

export type ProjectPreview = {
  screen: ResolvedScreen;
  assets: AssetMetadata[];
};

export function createProjectPreview(project: Project): ProjectPreview {
  const firstScreen = project.decks[0]?.screens[0];
  const screen = resolveScreen(project, firstScreen?.id);
  const referencedAssets = selectAssetReferences(project, screen.id);

  return {
    screen,
    assets: project.assets.filter((asset) => referencedAssets.has(asset.path)),
  };
}
