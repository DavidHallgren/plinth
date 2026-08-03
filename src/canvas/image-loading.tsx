import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import type { AssetMetadata, ImageFit, Point } from "../lib/schema";
import { calculateImageFitGeometry } from "../devices/geometry";
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
  compact?: boolean;
  label?: string;
};

export function AssetImageLayer({ projectSlug, assetPath, asset, width, height, fit, position, cornerRadius, backgroundColor = "#111521", compact = false, label }: AssetImageLayerProps) {
  const source = assetPath ? assetUrl(projectSlug, assetPath) : null;
  const resource = useLoadedImage(source);
  const geometry = useMemo(() => calculateImageFitGeometry(
    asset?.width ?? resource.image?.naturalWidth ?? 1,
    asset?.height ?? resource.image?.naturalHeight ?? 1,
    width,
    height,
    fit,
    position,
  ), [asset?.height, asset?.width, fit, height, position, resource.image?.naturalHeight, resource.image?.naturalWidth, width]);
  const statusLabel = resource.status === "loading" ? "Loading asset…" : resource.error ?? label ?? "Missing asset";
  return (
    <Group clipFunc={(context) => roundedRectPath(context, width, height, cornerRadius)}>
      <Rect fill={backgroundColor} height={height} listening={false} width={width} />
      {resource.status === "ready" && resource.image ? (
        <KonvaImage
          height={geometry.height}
          image={resource.image}
          listening={false}
          width={geometry.width}
          x={geometry.x}
          y={geometry.y}
        />
      ) : (
        <>
          <Rect dash={compact ? [3, 3] : [10, 8]} fill="#161a24" height={height} listening={false} stroke="#777f99" strokeWidth={compact ? 1 : 2} width={width} />
          {!compact ? <Text align="center" fill={resource.status === "loading" ? "#c4baff" : "#ffb6b6"} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize={Math.max(11, Math.min(18, width * 0.035))} listening={false} text={statusLabel} width={width - 24} x={12} y={height / 2 - 12} /> : null}
        </>
      )}
    </Group>
  );
}

export function clearImageCache(source?: string): void {
  clearImageCacheEntries(source);
}
