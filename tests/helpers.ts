import type { Project, SceneElement, Screen } from "../src/lib/schema";
import { resolveScreen } from "../src/scene/selectors";
import { deflateSync } from "node:zlib";

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

export function pngFixture(width = 640, height = 480): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  const chunks = [
    pngChunk("IHDR", new Uint8Array([
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      8, 6, 0, 0, 0,
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
