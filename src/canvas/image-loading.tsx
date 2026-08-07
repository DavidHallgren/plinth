import Konva from "konva";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "./react-konva";
import type { AssetMetadata, ImageFit, Point } from "../lib/schema";
import { calculateImageCoverCrop, calculateImageFitGeometry } from "../devices/geometry";
import { clearImageCache as clearImageCacheEntries, imageCacheVersion, imageResourceState, loadImageResource, subscribeImageCache, type ImageResource } from "./image-cache";

export type { ImageResource } from "./image-cache";

export function useLoadedImage(source: string | null): ImageResource {
  const cacheVersion = useSyncExternalStore(subscribeImageCache, imageCacheVersion, imageCacheVersion);

  useEffect(() => {
    if (!source) {
      return;
    }
    void loadImageResource(source);
  }, [cacheVersion, source]);

  return imageResourceState(source);
}

function roundedRectPath(context: { beginPath: () => void; moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void; quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => void; closePath: () => void }, width: number, height: number, radius: number): void {
  const safeRadius = Math.min(Math.max(0, radius), Math.min(width, height) / 2);
  context.beginPath();
  context.moveTo(safeRadius, 0);
  context.lineTo(width - safeRadius, 0);
  context.quadraticCurveTo(width, 0, width, safeRadius);
  context.lineTo(width, height - safeRadius);
  context.quadraticCurveTo(width, height, width - safeRadius, height);
  context.lineTo(safeRadius, height);
  context.quadraticCurveTo(0, height, 0, height - safeRadius);
  context.lineTo(0, safeRadius);
  context.quadraticCurveTo(0, 0, safeRadius, 0);
  context.closePath();
}

export function assetUrl(projectSlug: string, assetPath: string): string {
  const fileName = assetPath.startsWith("assets/") ? assetPath.slice("assets/".length) : assetPath;
  return `/api/projects/${encodeURIComponent(projectSlug)}/assets/${encodeURIComponent(fileName)}`;
}

export type AssetImageLayerProps = {
  projectSlug: string;
  assetPath: string | null;
  asset: AssetMetadata | undefined;
  width: number;
  height: number;
  fit: ImageFit;
  position: Point;
  cornerRadius: number;
  backgroundColor?: string;
  listening?: boolean;
  compact?: boolean;
  label?: string;
  blur?: number;
  cachePixelRatio?: number;
};

export function AssetImageLayer({ projectSlug, assetPath, asset, width, height, fit, position, cornerRadius, backgroundColor, listening = false, compact = false, label, blur = 0, cachePixelRatio = 1 }: AssetImageLayerProps) {
  const imageNodeRef = useRef<Konva.Image>(null);
  const source = assetPath ? assetUrl(projectSlug, assetPath) : null;
  const resource = useLoadedImage(source);
  const sourceWidth = asset?.width ?? resource.image?.naturalWidth ?? 1;
  const sourceHeight = asset?.height ?? resource.image?.naturalHeight ?? 1;
  const geometry = useMemo(() => calculateImageFitGeometry(
    sourceWidth,
    sourceHeight,
    width,
    height,
    fit,
    position,
  ), [fit, height, position, sourceHeight, sourceWidth, width]);
  const coverCrop = useMemo(() => fit === "cover" && blur === 0
    ? calculateImageCoverCrop(sourceWidth, sourceHeight, width, height, position)
    : null, [blur, fit, height, position, sourceHeight, sourceWidth, width]);
  const statusLabel = resource.status === "loading" ? "Loading asset…" : resource.error ?? label ?? "Missing asset";
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node) return;
    node.clearCache();
    if (blur > 0 && resource.status === "ready") node.cache({ pixelRatio: cachePixelRatio });
    node.getLayer()?.batchDraw();
    return () => { node.clearCache(); };
  }, [blur, cachePixelRatio, geometry.height, geometry.width, geometry.x, geometry.y, resource.image, resource.status]);
  const blurScale = blur > 0 ? 1 + (blur * 4) / Math.max(1, Math.min(geometry.width, geometry.height)) : 1;
  const renderWidth = geometry.width * blurScale;
  const renderHeight = geometry.height * blurScale;
  return (
    <Group clipFunc={(context) => roundedRectPath(context, width, height, cornerRadius)}>
      {listening ? <Rect fill="#000000" height={height} opacity={0.001} width={width} /> : null}
      {backgroundColor ? <Rect fill={backgroundColor} height={height} listening={false} width={width} /> : null}
      {resource.status === "ready" && resource.image ? (
        <KonvaImage
          blurRadius={blur * cachePixelRatio}
          crop={coverCrop ?? undefined}
          filters={blur > 0 ? [Konva.Filters.Blur] : undefined}
          height={coverCrop ? height : renderHeight}
          image={resource.image}
          listening={listening}
          ref={imageNodeRef}
          width={coverCrop ? width : renderWidth}
          x={coverCrop ? 0 : geometry.x - (renderWidth - geometry.width) / 2}
          y={coverCrop ? 0 : geometry.y - (renderHeight - geometry.height) / 2}
        />
      ) : (
        <>
          <Rect dash={compact ? [3, 3] : [10, 8]} fill="#1a1a1a" height={height} listening={listening} stroke="#828282" strokeWidth={compact ? 1 : 2} width={width} />
          {!compact ? <Text align="center" fill={resource.status === "loading" ? "#dedede" : "#ffb6b6"} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize={Math.max(11, Math.min(18, width * 0.035))} listening={false} text={statusLabel} width={width - 24} x={12} y={height / 2 - 12} /> : null}
        </>
      )}
    </Group>
  );
}

export function clearImageCache(source?: string): void {
  clearImageCacheEntries(source);
}
