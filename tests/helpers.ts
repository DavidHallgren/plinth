import type { Project, SceneElement, Screen } from "../src/lib/schema";
import { resolveScreen } from "../src/scene/selectors";
import { deflateSync, inflateSync } from "node:zlib";

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  chunk.set([(data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff], 0);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < 8 + data.length; index += 1) {
    crc ^= chunk[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  chunk.set([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], 8 + data.length);
  return chunk;
}

export function pngFixture(
  width = 640,
  height = 480,
  options: { colorType?: 2 | 6; rgba?: readonly [number, number, number, number] } = {},
): Uint8Array {
  const colorType = options.colorType ?? 2;
  const rgba = options.rgba ?? [0, 0, 0, 255];
  const channelCount = colorType === 2 ? 3 : 4;
  const raw = new Uint8Array((width * channelCount + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * channelCount + 1);
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * channelCount;
      raw.set(rgba.slice(0, channelCount), pixelOffset);
    }
  }
  const chunks = [
    pngChunk("IHDR", new Uint8Array([
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      8, colorType, 0, 0, 0,
    ])),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array()),
  ];
  const bytes = new Uint8Array(8 + chunks.reduce((total, chunk) => total + chunk.length, 0));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = 8;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)) >>> 0;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

export function decodePngPixels(bytes: Uint8Array): { width: number; height: number; colorType: 2 | 6; pixels: Uint8Array } {
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlaceMethod = bytes[28];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlaceMethod !== 0) {
    throw new Error("Test PNG decoder only supports non-interlaced 8-bit RGB and RGBA PNGs.");
  }

  const idatParts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "IDAT") idatParts.push(bytes.slice(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  const compressed = new Uint8Array(idatParts.reduce((total, part) => total + part.byteLength, 0));
  let compressedOffset = 0;
  for (const part of idatParts) {
    compressed.set(part, compressedOffset);
    compressedOffset += part.byteLength;
  }

  const filtered = new Uint8Array(inflateSync(compressed));
  const channelCount = colorType === 2 ? 3 : 4;
  const rowByteLength = width * channelCount;
  const decoded = new Uint8Array(rowByteLength * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (rowByteLength + 1)];
    if (filter === undefined || filter > 4) throw new Error(`Unsupported PNG filter ${String(filter)}.`);
    for (let x = 0; x < rowByteLength; x += 1) {
      const source = filtered[y * (rowByteLength + 1) + 1 + x] ?? 0;
      const target = y * rowByteLength + x;
      const left = x < channelCount ? 0 : (decoded[target - channelCount] ?? 0);
      const above = y === 0 ? 0 : (decoded[target - rowByteLength] ?? 0);
      const upperLeft = y === 0 || x < channelCount ? 0 : (decoded[target - rowByteLength - channelCount] ?? 0);
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      decoded[target] = (source + predictor) & 0xff;
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = decoded[index * channelCount] ?? 0;
    pixels[index * 4 + 1] = decoded[index * channelCount + 1] ?? 0;
    pixels[index * 4 + 2] = decoded[index * channelCount + 2] ?? 0;
    pixels[index * 4 + 3] = colorType === 6 ? (decoded[index * channelCount + 3] ?? 0) : 255;
  }
  return { width, height, colorType, pixels };
}

export function ownedElements(screen: Screen): SceneElement[] {
  return screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element] : []);
}

export function ownedElement(screen: Screen, elementId: string): SceneElement | undefined {
  for (const layer of screen.layers) {
    if (layer.kind === "owned" && layer.element.id === elementId) return layer.element;
  }
  return undefined;
}

export function resolvedElements(project: Project, screenId: string) {
  return resolveScreen(project, screenId).elements;
}
