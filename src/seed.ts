import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createDocumentPreset, DEFAULT_BACKGROUND, DEFAULT_SETTINGS } from "./lib/defaults";
import { writePrettyJsonAtomic } from "./lib/storage";
import { ProjectSchema } from "./lib/schema";
import type { Document, ImageElement, Project } from "./lib/schema";

const seedRoot = join(process.cwd(), "data", "projects");
const seedSlug = "plinth-starter";
const seedTime = "2026-08-02T00:00:00.000Z";

const dashboardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#15192a"/><stop offset="1" stop-color="#725ed2"/></linearGradient></defs>
  <rect width="1600" height="1000" rx="42" fill="url(#bg)"/>
  <rect x="96" y="96" width="1408" height="808" rx="26" fill="#0d1018" opacity=".78"/>
  <rect x="154" y="164" width="310" height="24" rx="12" fill="#c4baff" opacity=".85"/>
  <rect x="154" y="228" width="570" height="88" rx="18" fill="#f4f1ff" opacity=".92"/>
  <rect x="154" y="356" width="440" height="18" rx="9" fill="#a7aabd" opacity=".5"/>
  <rect x="154" y="392" width="520" height="18" rx="9" fill="#a7aabd" opacity=".32"/>
  <rect x="948" y="190" width="448" height="282" rx="24" fill="#262d43"/>
  <rect x="1010" y="540" width="190" height="190" rx="24" fill="#9d8cff" opacity=".9"/>
  <rect x="1224" y="540" width="172" height="190" rx="24" fill="#3f8d9f" opacity=".72"/>
  <text x="154" y="810" fill="#c4baff" font-family="sans-serif" font-size="28" letter-spacing="5">PLACEHOLDER SCREENSHOT</text>
</svg>
`;

const phoneSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400" viewBox="0 0 900 1400">
  <defs><linearGradient id="phone" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e3dfff"/><stop offset="1" stop-color="#6f5bd4"/></linearGradient></defs>
  <rect width="900" height="1400" rx="58" fill="url(#phone)"/>
  <rect x="72" y="84" width="756" height="1232" rx="42" fill="#111521"/>
  <rect x="128" y="170" width="644" height="88" rx="18" fill="#f8f7ff" opacity=".94"/>
  <rect x="128" y="314" width="450" height="24" rx="12" fill="#9d8cff"/>
  <rect x="128" y="368" width="572" height="16" rx="8" fill="#8f94a3" opacity=".52"/>
  <rect x="128" y="404" width="512" height="16" rx="8" fill="#8f94a3" opacity=".3"/>
  <rect x="128" y="520" width="644" height="360" rx="28" fill="#29314a"/>
  <circle cx="240" cy="1032" r="82" fill="#9d8cff" opacity=".92"/>
  <rect x="374" y="972" width="326" height="34" rx="17" fill="#f8f7ff" opacity=".75"/>
  <text x="128" y="1208" fill="#c4baff" font-family="sans-serif" font-size="24" letter-spacing="4">PHONE FRAME / PLACEHOLDER</text>
</svg>
`;

const socialSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <defs><linearGradient id="social" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#1c1730"/><stop offset=".55" stop-color="#8b7cff"/><stop offset="1" stop-color="#e0b4ff"/></linearGradient></defs>
  <rect width="1200" height="1500" fill="url(#social)"/>
  <circle cx="930" cy="260" r="210" fill="#fff" opacity=".12"/>
  <circle cx="238" cy="1152" r="300" fill="#0c0d10" opacity=".14"/>
  <rect x="120" y="132" width="190" height="20" rx="10" fill="#fff" opacity=".68"/>
  <text x="120" y="620" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">Make the</text>
  <text x="120" y="720" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">first frame</text>
  <text x="120" y="820" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">count.</text>
  <text x="120" y="1332" fill="#fff" font-family="sans-serif" font-size="22" letter-spacing="5" opacity=".75">SOCIAL FRAME / PLACEHOLDER</text>
</svg>
`;

function elementIds(document: Document, prefix: string): Document {
  return {
    ...document,
    elements: document.elements.map((element, index) => ({ ...element, id: `${prefix}_${element.type}_${index + 1}` })),
  };
}

function imageElement(assetId: string, name: string, values: Pick<ImageElement, "x" | "y" | "width" | "height">): ImageElement {
  return {
    id: `image_${assetId}`,
    type: "image",
    name,
    x: values.x,
    y: values.y,
    width: values.width,
    height: values.height,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    assetId,
    fit: "cover",
    alt: name,
  };
}

export function createStarterProject(): { project: Project; assets: Record<string, string> } {
  let landing = elementIds(createDocumentPreset("browser", { id: "doc_landing", name: "Landing page", slug: "landing-page", now: seedTime }), "landing");
  landing = { ...landing, elements: [...landing.elements, imageElement("asset_dashboard", "Dashboard placeholder", { x: 790, y: 440, width: 280, height: 170 })] };
  let mobile = elementIds(createDocumentPreset("phone", { id: "doc_mobile", name: "Mobile product tour", slug: "mobile-product-tour", now: seedTime }), "mobile");
  mobile = { ...mobile, elements: [...mobile.elements, imageElement("asset_phone", "Phone placeholder", { x: 164, y: 680, width: 310, height: 220 })] };
  let announcement = elementIds(createDocumentPreset("social", { id: "doc_announcement", name: "Launch announcement", slug: "launch-announcement", now: seedTime }), "announcement");
  announcement = { ...announcement, elements: [...announcement.elements, imageElement("asset_social", "Social frame placeholder", { x: 760, y: 740, width: 260, height: 330 })] };

  const assets = {
    asset_dashboard: dashboardSvg,
    asset_phone: phoneSvg,
    asset_social: socialSvg,
  };
  const project: Project = {
    schemaVersion: 1,
    id: "project_plinth_starter",
    slug: seedSlug,
    name: "Plinth starter studio",
    description: "Three starting frames for exploring Plinth's local-first composition model.",
    settings: DEFAULT_SETTINGS,
    background: DEFAULT_BACKGROUND,
    assets: Object.entries(assets).map(([id, content]) => ({
      id,
      kind: "image" as const,
      fileName: `${id}.svg`,
      mimeType: "image/svg+xml",
      width: id === "asset_phone" ? 900 : id === "asset_social" ? 1200 : 1600,
      height: id === "asset_phone" ? 1400 : id === "asset_social" ? 1500 : 1000,
      byteSize: Buffer.byteLength(content),
    })),
    documents: [landing, mobile, announcement],
    createdAt: seedTime,
    updatedAt: seedTime,
  };

  return { project: ProjectSchema.parse(project), assets };
}

export async function writeStarterProject(root = seedRoot): Promise<Project> {
  const { project, assets } = createStarterProject();
  const projectDirectory = join(root, seedSlug);
  await mkdir(join(projectDirectory, "assets"), { recursive: true });
  await mkdir(join(projectDirectory, "exports"), { recursive: true });
  for (const [id, content] of Object.entries(assets)) {
    await Bun.write(join(projectDirectory, "assets", `${id}.svg`), content);
  }
  await writePrettyJsonAtomic(join(projectDirectory, "project.json"), project);
  return project;
}

if (import.meta.main) {
  writeStarterProject().then((project) => console.log(`Seeded ${project.slug} with ${project.documents.length} documents.`));
}
