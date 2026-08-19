import type Konva from "konva";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { AssetMetadata, NormalizedCrop } from "../lib/schema";
import type { ResolvedElement } from "../scene/overflow";
import { calculateImageFitGeometry } from "../devices/geometry";
import { assetUrl, useLoadedImage } from "./image-loading";
import { Group, Image as KonvaImage, Rect, Text, Transformer } from "./react-konva";

type CropEditorOverlayProps = {
  asset: AssetMetadata | undefined;
  element: Extract<ResolvedElement, { type: "image" }>;
  projectSlug: string;
  onChange: (crop: NormalizedCrop) => void;
};

const MIN_CROP_SIZE = 8;

export function CropEditorOverlay({ asset, element, projectSlug, onChange }: CropEditorOverlayProps) {
  const cropNodeRef = useRef<Konva.Rect | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const resource = useLoadedImage(assetUrl(projectSlug, element.assetPath));
  const sourceWidth = asset?.width ?? resource.image?.naturalWidth ?? 1;
  const sourceHeight = asset?.height ?? resource.image?.naturalHeight ?? 1;
  const geometry = useMemo(() => calculateImageFitGeometry(
    sourceWidth,
    sourceHeight,
    element.width,
    element.height,
    "contain",
    { x: 0.5, y: 0.5 },
  ), [element.height, element.width, sourceHeight, sourceWidth]);
  const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const cropRect = {
    x: geometry.x + crop.x * geometry.width,
    y: geometry.y + crop.y * geometry.height,
    width: crop.width * geometry.width,
    height: crop.height * geometry.height,
  };

  useLayoutEffect(() => {
    const transformer = transformerRef.current;
    const cropNode = cropNodeRef.current;
    if (!transformer || !cropNode) return;
    transformer.nodes([cropNode]);
    transformer.getLayer()?.batchDraw();
  }, [cropRect.height, cropRect.width, cropRect.x, cropRect.y]);

  function commitCrop(): void {
    const node = cropNodeRef.current;
    if (!node) return;
    const width = Math.min(geometry.width, Math.max(MIN_CROP_SIZE, Math.abs(node.width() * node.scaleX())));
    const height = Math.min(geometry.height, Math.max(MIN_CROP_SIZE, Math.abs(node.height() * node.scaleY())));
    const x = Math.min(geometry.x + geometry.width - width, Math.max(geometry.x, node.x()));
    const y = Math.min(geometry.y + geometry.height - height, Math.max(geometry.y, node.y()));
    node.position({ x, y });
    node.size({ width, height });
    node.scale({ x: 1, y: 1 });
    onChange({
      x: (x - geometry.x) / geometry.width,
      y: (y - geometry.y) / geometry.height,
      width: width / geometry.width,
      height: height / geometry.height,
    });
  }

  const stopPropagation = (event: { cancelBubble: boolean }) => { event.cancelBubble = true; };
  return (
    <Group
      name={`crop-editor-${element.id}`}
      opacity={element.opacity}
      rotation={element.rotation}
      x={element.x}
      y={element.y}
    >
      <Rect fill="#090909" height={element.height} width={element.width} />
      {resource.status === "ready" && resource.image ? <>
        <KonvaImage height={geometry.height} image={resource.image} listening={false} opacity={0.36} width={geometry.width} x={geometry.x} y={geometry.y} />
        <Group clipHeight={cropRect.height} clipWidth={cropRect.width} clipX={cropRect.x} clipY={cropRect.y}>
          <KonvaImage height={geometry.height} image={resource.image} listening={false} width={geometry.width} x={geometry.x} y={geometry.y} />
        </Group>
      </> : <Text align="center" fill="#dedede" fontSize={16} text="Loading full image…" width={element.width} y={element.height / 2 - 10} />}
      <Rect
        draggable
        fill="rgba(255,255,255,0.001)"
        height={cropRect.height}
        name={`crop-region-${element.id}`}
        onClick={stopPropagation}
        onDragEnd={() => commitCrop()}
        onDragMove={stopPropagation}
        onDragStart={stopPropagation}
        onTap={stopPropagation}
        ref={cropNodeRef}
        stroke="#b9ff8b"
        strokeWidth={2}
        width={cropRect.width}
        x={cropRect.x}
        y={cropRect.y}
      />
      <Transformer
        anchorCornerRadius={4}
        anchorFill="#f5f5f5"
        anchorSize={10}
        anchorStroke="#7ddf45"
        borderStroke="#b9ff8b"
        boundBoxFunc={(oldBox, nextBox) => nextBox.width < MIN_CROP_SIZE || nextBox.height < MIN_CROP_SIZE ? oldBox : nextBox}
        enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
        flipEnabled={false}
        keepRatio={false}
        onTransformEnd={() => commitCrop()}
        ref={transformerRef}
        rotateEnabled={false}
      />
    </Group>
  );
}
