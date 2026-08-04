const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type PngDimensions = { width: number; height: number };

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
    crc ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(message: string, details?: unknown): never {
  throw new PngStructureError("invalid", message, details);
}

export function decodeStructuredPng(bytes: Uint8Array, maxBytes: number): PngDimensions {
  if (bytes.byteLength > maxBytes) {
    throw new PngStructureError("too-large", "PNG payload exceeds its byte limit.", { maxBytes, byteSize: bytes.byteLength });
  }
  if (bytes.byteLength < 33 || !hasPngSignature(bytes)) {
    invalid("PNG signature is missing or the payload is truncated.", { expectedSignature: "89504e470d0a1a0a" });
  }

  let offset = 8;
  let dimensions: PngDimensions | null = null;
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
      dimensions = { width, height };
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

  if (!dimensions || !hasImageData || !hasEnd || offset !== bytes.byteLength) {
    invalid("PNG must contain IHDR, image data, and a final IEND chunk.", { hasImageData, hasEnd, trailingBytes: Math.max(0, bytes.byteLength - offset) });
  }
  return dimensions;
}
