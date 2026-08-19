import type { DevicePresetDefinition } from "./presets";

export type NormalizedPoint = { x: number; y: number };

export type RectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export type DeviceScreenGeometry = {
  outer: RectGeometry;
  screen: RectGeometry;
  camera: RectGeometry | null;
  cameraKind: "dynamic-island" | "camera" | "none";
};

export type ImageFit = "contain" | "cover" | "stretch";

export type ImageFitGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export type ImageCropGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function calculateNormalizedImageCrop(
  sourceWidth: number,
  sourceHeight: number,
  crop: { x: number; y: number; width: number; height: number },
): ImageCropGeometry {
  const sourceW = Math.max(1, sourceWidth);
  const sourceH = Math.max(1, sourceHeight);
  const width = Math.min(1, Math.max(0.000001, crop.width));
  const height = Math.min(1, Math.max(0.000001, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  return { x: x * sourceW, y: y * sourceH, width: width * sourceW, height: height * sourceH };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

export function calculateDeviceScreenGeometry(
  preset: DevicePresetDefinition,
  width: number,
  height: number,
  cornerRadius?: number | null,
  screenCornerRadius?: number | null,
): DeviceScreenGeometry {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const inset = preset.screenInsets;
  const screenWidth = Math.max(1, safeWidth * (1 - inset.left - inset.right));
  const screenHeight = Math.max(1, safeHeight * (1 - inset.top - inset.bottom));
  const outerRadius = Math.min(safeWidth, safeHeight) * preset.outerRadius;
  const screenRadius = Math.min(screenWidth, screenHeight) * preset.screenRadius;
  const camera = preset.camera.kind === "none" ? null : {
    x: safeWidth * (preset.camera.x - preset.camera.width / 2),
    y: safeHeight * (preset.camera.y - preset.camera.height / 2),
    width: safeWidth * preset.camera.width,
    height: safeHeight * preset.camera.height,
    radius: Math.min(safeWidth, safeHeight) * preset.camera.height / 2,
  };
  return {
    outer: { x: 0, y: 0, width: safeWidth, height: safeHeight, radius: Math.max(0, cornerRadius ?? outerRadius) },
    screen: { x: safeWidth * inset.left, y: safeHeight * inset.top, width: screenWidth, height: screenHeight, radius: Math.max(0, screenCornerRadius ?? screenRadius) },
    camera,
    cameraKind: preset.camera.kind,
  };
}

export function calculateImageFitGeometry(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: ImageFit,
  position: NormalizedPoint = { x: 0.5, y: 0.5 },
): ImageFitGeometry {
  const sourceW = Math.max(1, sourceWidth);
  const sourceH = Math.max(1, sourceHeight);
  const targetW = Math.max(1, targetWidth);
  const targetH = Math.max(1, targetHeight);
  if (fit === "stretch") return { x: 0, y: 0, width: targetW, height: targetH, scale: 1 };
  const scale = fit === "cover" ? Math.max(targetW / sourceW, targetH / sourceH) : Math.min(targetW / sourceW, targetH / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  return {
    x: (targetW - width) * clamp01(position.x),
    y: (targetH - height) * clamp01(position.y),
    width,
    height,
    scale,
  };
}

export function calculateImageCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  position: NormalizedPoint = { x: 0.5, y: 0.5 },
): ImageCropGeometry {
  const sourceW = Math.max(1, sourceWidth);
  const sourceH = Math.max(1, sourceHeight);
  const geometry = calculateImageFitGeometry(sourceW, sourceH, targetWidth, targetHeight, "cover", position);
  return {
    x: Math.max(0, Math.min(sourceW, -geometry.x / geometry.scale)),
    y: Math.max(0, Math.min(sourceH, -geometry.y / geometry.scale)),
    width: Math.min(sourceW, Math.max(1, Math.max(1, targetWidth) / geometry.scale)),
    height: Math.min(sourceH, Math.max(1, Math.max(1, targetHeight) / geometry.scale)),
  };
}

export function thumbnailSize(canvasWidth: number, canvasHeight: number, maxWidth = 54, maxHeight = 54): { width: number; height: number; scale: number } {
  const width = Math.max(1, canvasWidth);
  const height = Math.max(1, canvasHeight);
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
