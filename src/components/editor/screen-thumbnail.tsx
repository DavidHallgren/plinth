import { Stage } from "react-konva";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { thumbnailSize } from "../../devices/geometry";
import type { AssetMetadata } from "../../lib/schema";
import type { ResolvedScreen } from "../../scene/selectors";

type ScreenThumbnailProps = {
  assets: readonly AssetMetadata[];
  screen: ResolvedScreen;
  projectSlug: string;
};

export function ScreenThumbnail({ assets, screen, projectSlug }: ScreenThumbnailProps) {
  const size = thumbnailSize(screen.width, screen.height, 28, 28);
  return (
    <Stage height={size.height} listening={false} scaleX={size.scale} scaleY={size.scale} width={size.width}>
      <SceneRenderer assets={assets} projectSlug={projectSlug} screen={screen} />
    </Stage>
  );
}
