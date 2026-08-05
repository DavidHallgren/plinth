import type { BackgroundTexture } from "../lib/schema";

export const BACKGROUND_TEXTURE_TILE_SIZE = 128;

function hashCoordinate(seed: number, x: number, y: number, salt: number): number {
  let value = (seed ^ Math.imul(x + 1, 0x9e37_79b1) ^ Math.imul(y + 1, 0x85eb_ca77) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function channel(seed: number, x: number, y: number, salt = 0): number {
  return hashCoordinate(seed, x, y, salt) & 0xff;
}

export function createBackgroundTexturePixels(texture: BackgroundTexture, size = BACKGROUND_TEXTURE_TILE_SIZE): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = channel(texture.seed, x, y);
      const coarse = channel(texture.seed, Math.floor(x / 8), Math.floor(y / 8), 0x68bc_21eb);
      const value = texture.type === "noise" ? fine : Math.round(fine * 0.28 + coarse * 0.72);
      const index = (y * size + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

export function createBackgroundTextureTile(texture: BackgroundTexture): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = BACKGROUND_TEXTURE_TILE_SIZE;
  canvas.height = BACKGROUND_TEXTURE_TILE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.createImageData(canvas.width, canvas.height);
  imageData.data.set(createBackgroundTexturePixels(texture));
  context.putImageData(imageData, 0, 0);
  return canvas;
}
