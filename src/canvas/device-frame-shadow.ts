const ALPHA_OFFSET = 3;
const silhouetteCache = new WeakMap<HTMLImageElement, HTMLCanvasElement | null>();

function alphaAt(pixels: Uint8ClampedArray, index: number): number {
  return pixels[index * 4 + ALPHA_OFFSET] ?? 0;
}

export function fillFrameShadowSilhouette(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  const pixelCount = width * height;
  if (pixelCount === 0) return result;

  const exterior = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;
  const enqueueTransparent = (index: number) => {
    if (exterior[index] || alphaAt(pixels, index) !== 0) return;
    exterior[index] = 1;
    queue[writeIndex] = index;
    writeIndex += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueTransparent(x);
    enqueueTransparent((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueTransparent(y * width);
    enqueueTransparent(y * width + width - 1);
  }

  while (readIndex < writeIndex) {
    const index = queue[readIndex] ?? 0;
    readIndex += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueTransparent(index - 1);
    if (x + 1 < width) enqueueTransparent(index + 1);
    if (y > 0) enqueueTransparent(index - width);
    if (y + 1 < height) enqueueTransparent(index + width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (exterior[index]) continue;
    const offset = index * 4;
    if (alphaAt(pixels, index) === 0) {
      result[offset] = 0;
      result[offset + 1] = 0;
      result[offset + 2] = 0;
    }
    result[offset + ALPHA_OFFSET] = 255;
  }
  return result;
}

export function createDeviceFrameShadowSilhouette(image: HTMLImageElement): HTMLCanvasElement | null {
  const cached = silhouetteCache.get(image);
  if (cached !== undefined) return cached;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0 || typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    imageData.data.set(fillFrameShadowSilhouette(imageData.data, width, height));
    context.putImageData(imageData, 0, 0);
    silhouetteCache.set(image, canvas);
    return canvas;
  } catch {
    silhouetteCache.set(image, null);
    return null;
  }
}
