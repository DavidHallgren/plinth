import { Stage } from "react-konva";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { thumbnailSize } from "../../devices/geometry";
import type { AssetMetadata } from "../../lib/schema";
import type { ResolvedScreen } from "../../scene/selectors";

type DocumentThumbnailProps = {
  assets: readonly AssetMetadata[];
  document: ResolvedScreen;
  projectSlug: string;
};

export function DocumentThumbnail({ assets, document, projectSlug }: DocumentThumbnailProps) {
  const size = thumbnailSize(document.width, document.height, 28, 28);

  return (
    <Stage height={size.height} listening={false} scaleX={size.scale} scaleY={size.scale} width={size.width}>
      <SceneRenderer assets={assets} document={document} projectSlug={projectSlug} />
    </Stage>
  );
}
