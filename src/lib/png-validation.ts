const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const CRC32_TABLE = new Uint32Array(256);
for (let value = 0; value < CRC32_TABLE.length; value += 1) {
  let entry = value;
  for (let bit = 0; bit < 8; bit += 1) entry = (entry & 1) === 1 ? (entry >>> 1) ^ 0xedb88320 : entry >>> 1;
  CRC32_TABLE[value] = entry >>> 0;
}

export type PngDimensions = { width: number; height: number };
export type PngColorType = 0 | 2 | 3 | 4 | 6;
export type PngMetadata = PngDimensions & {
  bitDepth: 1 | 2 | 4 | 8 | 16;
  colorType: PngColorType;
  compressionMethod: 0;
  filterMethod: 0;
  interlaceMethod: 0 | 1;
};

export class PngStructureError extends Error {
  readonly kind: "too-large" | "invalid";
  readonly details: unknown;

  constructor(kind: PngStructureError["kind"], message: string, details?: unknown) {
    super(message);
    this.name = "PngStructureError";
    this.kind = kind;
    this.details = details;
  }
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)) >>> 0;
}

function crc32(bytes: Uint8Array, start: number, length: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < start + length; index += 1) {
    crc = (CRC32_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(message: string, details?: unknown): never {
  throw new PngStructureError("invalid", message, details);
}

function isValidBitDepth(bitDepth: number, colorType: number): bitDepth is PngMetadata["bitDepth"] {
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth);
  if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth);
  return [2, 4, 6].includes(colorType) && [8, 16].includes(bitDepth);
}

export function decodeStructuredPng(bytes: Uint8Array, maxBytes: number): PngMetadata {
  if (bytes.byteLength > maxBytes) {
    throw new PngStructureError("too-large", "PNG payload exceeds its byte limit.", { maxBytes, byteSize: bytes.byteLength });
  }
  if (bytes.byteLength < 33 || !hasPngSignature(bytes)) {
    invalid("PNG signature is missing or the payload is truncated.", { expectedSignature: "89504e470d0a1a0a" });
  }

  let offset = 8;
  let metadata: PngMetadata | null = null;
  let hasImageData = false;
  let hasEnd = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) invalid("PNG contains a truncated chunk header.");
    const chunkLength = readUint32(bytes, offset);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    const crcOffset = chunkEnd;
    if (chunkEnd < chunkStart || crcOffset + 4 > bytes.byteLength) invalid("PNG contains a chunk that exceeds the payload bounds.", { chunkLength });
    const chunkType = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (readUint32(bytes, crcOffset) !== crc32(bytes, offset + 4, 4 + chunkLength)) invalid(`PNG chunk ${chunkType || "(unknown)"} has an invalid CRC.`);

    if (offset === 8) {
      if (chunkType !== "IHDR" || chunkLength !== 13) invalid("PNG has no valid IHDR header.");
      const width = readUint32(bytes, chunkStart);
      const height = readUint32(bytes, chunkStart + 4);
      if (width <= 0 || width > 100_000 || height <= 0 || height > 100_000) invalid("PNG dimensions are invalid.", { width, height });
      const bitDepth = bytes[chunkStart + 8] ?? -1;
      const colorType = bytes[chunkStart + 9] ?? -1;
      const compressionMethod = bytes[chunkStart + 10] ?? -1;
      const filterMethod = bytes[chunkStart + 11] ?? -1;
      const interlaceMethod = bytes[chunkStart + 12] ?? -1;
      if (![0, 2, 3, 4, 6].includes(colorType) || !isValidBitDepth(bitDepth, colorType)) {
        invalid("PNG IHDR has an invalid bit-depth and color-type combination.", { bitDepth, colorType });
      }
      if (compressionMethod !== 0 || filterMethod !== 0 || (interlaceMethod !== 0 && interlaceMethod !== 1)) {
        invalid("PNG IHDR uses an unsupported compression, filter, or interlace method.", { compressionMethod, filterMethod, interlaceMethod });
      }
      metadata = {
        width,
        height,
        bitDepth: bitDepth as PngMetadata["bitDepth"],
        colorType: colorType as PngColorType,
        compressionMethod: 0,
        filterMethod: 0,
        interlaceMethod,
      };
    } else if (chunkType === "IDAT") {
      hasImageData = true;
    } else if (chunkType === "IEND") {
      if (chunkLength !== 0) invalid("PNG IEND chunk must be empty.");
      hasEnd = true;
      offset = crcOffset + 4;
      break;
    }
    offset = crcOffset + 4;
  }

  if (!metadata || !hasImageData || !hasEnd || offset !== bytes.byteLength) {
    invalid("PNG must contain IHDR, image data, and a final IEND chunk.", { hasImageData, hasEnd, trailingBytes: Math.max(0, bytes.byteLength - offset) });
  }
  return metadata;
}
