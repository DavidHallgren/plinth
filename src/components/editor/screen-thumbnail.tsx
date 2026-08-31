import { Stage } from "../../canvas/react-konva";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { thumbnailSize } from "../../devices/geometry";
import type { AssetMetadata } from "../../lib/schema";
import type { ResolvedScreen } from "../../scene/selectors";

type ScreenThumbnailProps = {
  assets: readonly AssetMetadata[];
  maxHeight?: number;
  maxWidth?: number;
  screen: ResolvedScreen;
  projectSlug: string;
};

const THUMBNAIL_SUPERSAMPLE = 4;

export function ScreenThumbnail({ assets, maxHeight = 28, maxWidth = 28, screen, projectSlug }: ScreenThumbnailProps) {
  const size = thumbnailSize(screen.width, screen.height, maxWidth, maxHeight);
  const renderWidth = size.width * THUMBNAIL_SUPERSAMPLE;
  const renderHeight = size.height * THUMBNAIL_SUPERSAMPLE;
  const renderScale = size.scale * THUMBNAIL_SUPERSAMPLE;

  return (
    <div style={{ height: size.height, overflow: "hidden", width: size.width }}>
      <Stage
        height={renderHeight}
        listening={false}
        scaleX={renderScale}
        scaleY={renderScale}
        style={{ transform: `scale(${1 / THUMBNAIL_SUPERSAMPLE})`, transformOrigin: "top left" }}
        width={renderWidth}
      >
        <SceneRenderer assets={assets} compact projectSlug={projectSlug} screen={screen} />
      </Stage>
    </div>
  );
}
