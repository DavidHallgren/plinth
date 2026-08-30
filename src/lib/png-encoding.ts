import { decodeStructuredPng, type PngColorType } from "./png-validation";

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const textEncoder = new TextEncoder();
const CRC32_TABLE = new Uint32Array(256);
for (let value = 0; value < CRC32_TABLE.length; value += 1) {
  let entry = value;
  for (let bit = 0; bit < 8; bit += 1) entry = (entry & 1) === 1 ? (entry >>> 1) ^ 0xedb88320 : entry >>> 1;
  CRC32_TABLE[value] = entry >>> 0;
}

export type CanvasPngMode = "opaque" | "transparent";

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function crc32(bytes: Uint8Array, start: number, length: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < start + length; index += 1) {
    crc = (CRC32_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: "IHDR" | "IDAT" | "IEND", data: Uint8Array): Uint8Array {
  if (data.byteLength > 0xffff_ffff) throw new Error(`PNG ${type} chunk exceeds the format's size limit.`);
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(textEncoder.encode(type), 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.byteLength, crc32(chunk, 4, 4 + data.byteLength));
  return chunk;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const compressed = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function filteredScanlines(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, colorType: 2 | 6): Uint8Array {
  const channelCount = colorType === 2 ? 3 : 4;
  const rowByteLength = width * channelCount;
  const scanlines = new Uint8Array(height * (rowByteLength + 1));
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (rowByteLength + 1);
    scanlines[scanlineOffset] = 1;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = scanlineOffset + 1 + x * channelCount;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = rgba[sourceOffset + channel] ?? 0;
        const left = x === 0 ? 0 : (rgba[sourceOffset - 4 + channel] ?? 0);
        scanlines[targetOffset + channel] = (value - left) & 0xff;
      }
    }
  }
  return scanlines;
}

/**
 * Encode browser canvas RGBA pixels directly as an 8-bit PNG. Opaque screens
 * discard the alpha byte and use truecolor type 2; transparent screens retain
 * it and use truecolor-with-alpha type 6. No lossy image format is involved.
 */
export async function encodePngPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  mode: CanvasPngMode,
): Promise<Uint8Array> {
  if (!Number.isInteger(width) || width <= 0 || width > 100_000 || !Number.isInteger(height) || height <= 0 || height > 100_000) {
    throw new Error(`Cannot encode invalid PNG dimensions ${width}×${height}.`);
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || rgba.byteLength !== pixelCount * 4) {
    throw new Error(`PNG pixel data does not match ${width}×${height} RGBA dimensions.`);
  }

  const colorType: 2 | 6 = mode === "opaque" ? 2 : 6;
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const imageData = await deflate(filteredScanlines(rgba, width, height, colorType));
  const encoded = concatenate([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", imageData),
    pngChunk("IEND", new Uint8Array()),
  ]);

  const expectedColorType: PngColorType = colorType;
  const metadata = decodeStructuredPng(encoded, encoded.byteLength);
  if (metadata.colorType !== expectedColorType || metadata.width !== width || metadata.height !== height) {
    throw new Error(`PNG encoder produced unexpected IHDR metadata for ${width}×${height} color type ${colorType}.`);
  }
  return encoded;
}

export async function encodeCanvasPng(canvas: HTMLCanvasElement, mode: CanvasPngMode): Promise<Blob> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not read the rendered export canvas.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = await encodePngPixels(pixels.data, canvas.width, canvas.height, mode);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
}
