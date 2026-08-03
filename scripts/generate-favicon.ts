import { resolve } from "node:path";
import sharp from "sharp";
import { createPlinthIconPaths, PLINTH_ICON_VIEW_BOX } from "../src/lib/plinth-icon";

const SIZE = 512;
const OUTPUT = resolve(import.meta.dirname, "../public/favicon.ico");

// Primary button color from src/styles.css (--color-primary).
const PRIMARY = "#97ff7d";
const ICON = "#000000";
const paths = createPlinthIconPaths();

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${PLINTH_ICON_VIEW_BOX} ${PLINTH_ICON_VIEW_BOX}">
  <rect x="2" y="2" width="60" height="60" rx="13" fill="${PRIMARY}"/>
  <g fill="${ICON}">
    ${paths.map((path) => `<path d="${path}"/>`).join("\n    ")}
  </g>
</svg>
`;

const sourcePng = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map(async (size) => ({ size, data: await sharp(sourcePng).resize(size, size).png().toBuffer() })),
);

function buildIco(images: Array<{ size: number; data: Buffer }>): Buffer {
  const headerSize = 6;
  const directoryEntrySize = 16;
  let currentOffset = headerSize + directoryEntrySize * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directoryEntries = images.map((image) => {
    const entry = Buffer.alloc(directoryEntrySize);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    currentOffset += image.data.length;
    return entry;
  });

  return Buffer.concat([header, ...directoryEntries, ...images.map((image) => image.data)]);
}

const ico = buildIco(images);
await Bun.write(OUTPUT, ico);
console.log(`Favicon generated at ${OUTPUT}`);
