import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createDocumentPreset, DEFAULT_BACKGROUND, DEFAULT_SETTINGS } from "./lib/defaults";
import { writePrettyJsonAtomic } from "./lib/storage";
import { ProjectSchema } from "./lib/schema";
import type { AssetMetadata, DeviceElement, Document, Project } from "./lib/schema";

const seedRoot = join(process.cwd(), "data", "projects");
const seedSlug = "plinth-starter";
const seedTime = "2026-08-02T00:00:00.000Z";

const starterAssetContents: Record<string, string> = {
  asset_dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#15192a"/><stop offset="1" stop-color="#725ed2"/></linearGradient></defs><rect width="1600" height="1000" rx="42" fill="url(#bg)"/><rect x="96" y="96" width="1408" height="808" rx="26" fill="#0d1018" opacity=".78"/><rect x="154" y="164" width="310" height="24" rx="12" fill="#c4baff" opacity=".85"/><rect x="154" y="228" width="570" height="88" rx="18" fill="#f4f1ff" opacity=".92"/><rect x="154" y="356" width="440" height="18" rx="9" fill="#a7aabd" opacity=".5"/><rect x="154" y="392" width="520" height="18" rx="9" fill="#a7aabd" opacity=".32"/><rect x="948" y="190" width="448" height="282" rx="24" fill="#262d43"/><rect x="1010" y="540" width="190" height="190" rx="24" fill="#9d8cff" opacity=".9"/><rect x="1224" y="540" width="172" height="190" rx="24" fill="#3f8d9f" opacity=".72"/><text x="154" y="810" fill="#c4baff" font-family="sans-serif" font-size="28" letter-spacing="5">STARTER SCREENSHOT</text></svg>`,
  asset_phone: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400" viewBox="0 0 900 1400"><defs><linearGradient id="phone" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e3dfff"/><stop offset="1" stop-color="#6f5bd4"/></linearGradient></defs><rect width="900" height="1400" rx="58" fill="url(#phone)"/><rect x="72" y="84" width="756" height="1232" rx="42" fill="#111521"/><rect x="128" y="170" width="644" height="88" rx="18" fill="#f8f7ff" opacity=".94"/><rect x="128" y="314" width="450" height="24" rx="12" fill="#9d8cff"/><rect x="128" y="368" width="572" height="16" rx="8" fill="#8f94a3" opacity=".52"/><rect x="128" y="404" width="512" height="16" rx="8" fill="#8f94a3" opacity=".3"/><rect x="128" y="520" width="644" height="360" rx="28" fill="#29314a"/><circle cx="240" cy="1032" r="82" fill="#9d8cff" opacity=".92"/><rect x="374" y="972" width="326" height="34" rx="17" fill="#f8f7ff" opacity=".75"/><text x="128" y="1208" fill="#c4baff" font-family="sans-serif" font-size="24" letter-spacing="4">STARTER PHONE SCREEN</text></svg>`,
  asset_social: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><defs><linearGradient id="social" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#1c1730"/><stop offset=".55" stop-color="#8b7cff"/><stop offset="1" stop-color="#e0b4ff"/></linearGradient></defs><rect width="1200" height="1500" fill="url(#social)"/><circle cx="930" cy="260" r="210" fill="#fff" opacity=".12"/><circle cx="238" cy="1152" r="300" fill="#0c0d10" opacity=".14"/><rect x="120" y="132" width="190" height="20" rx="10" fill="#fff" opacity=".68"/><text x="120" y="620" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">Make the</text><text x="120" y="720" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">first frame</text><text x="120" y="820" fill="#fff" font-family="sans-serif" font-size="88" font-weight="700">count.</text><text x="120" y="1332" fill="#fff" font-family="sans-serif" font-size="22" letter-spacing="5" opacity=".75">STARTER SOCIAL SCREEN</text></svg>`,
};

function elementIds(document: Document, prefix: string): Document {
  return {
    ...document,
    elements: document.elements.map((element, index) => ({ ...element, id: `${prefix}_${element.type}_${index + 1}` })),
  };
}

function seedDevice(document: Document, assetPath: string, preset: DeviceElement["preset"], name: string, frameColor: string): Document {
  return {
    ...document,
    elements: document.elements.map((element) => element.type === "device" ? {
      ...element,
      preset,
      deviceId: preset,
      deviceName: name,
      name,
      frame: preset === "generic-modern-ipad" ? "tablet" : "phone",
      frameColor,
      screenshotPath: assetPath,
      screenshotFit: "cover",
      screenshotPosition: { x: 0.5, y: 0.5 },
      bezelStyle: "metallic",
      showGlare: true,
      showCamera: true,
    } : element),
  };
}

function starterAssets(): AssetMetadata[] {
  return [
    { id: "asset_starter_dashboard", kind: "image", path: "assets/asset_dashboard.svg", fileName: "asset_dashboard.svg", mimeType: "image/svg+xml", width: 1600, height: 1000, byteSize: new TextEncoder().encode(starterAssetContents.asset_dashboard ?? "").byteLength, contentHash: "f439074772edf87a75202eda0dc30f19943e356e60f71913da91b0c05f69c863" },
    { id: "asset_starter_phone", kind: "image", path: "assets/asset_phone.svg", fileName: "asset_phone.svg", mimeType: "image/svg+xml", width: 900, height: 1400, byteSize: new TextEncoder().encode(starterAssetContents.asset_phone ?? "").byteLength, contentHash: "7ec2c80ed94dced7b3a451c353014d6a33e5f41b3f250779b3c1ff8c987b7610" },
    { id: "asset_starter_social", kind: "image", path: "assets/asset_social.svg", fileName: "asset_social.svg", mimeType: "image/svg+xml", width: 1200, height: 1500, byteSize: new TextEncoder().encode(starterAssetContents.asset_social ?? "").byteLength, contentHash: "a1f5bed21fe5fbb9de4137a07d1af08f4fbdace37ea91605d632c50dc8ed18a9" },
  ];
}

export function createStarterProject(): { project: Project; assets: Record<string, string> } {
  const iphone = seedDevice(elementIds(createDocumentPreset("iphone-6-9", {
    id: "doc_iphone_69",
    name: "iPhone 6.9 launch",
    slug: "iphone-6-9-launch",
    now: seedTime,
  }), "iphone"), "assets/asset_phone.svg", "iphone-17-pro-max", "iPhone 17 Pro Max", "#182d55");
  const iphoneFallback = seedDevice(elementIds(createDocumentPreset("iphone-6-5", {
    id: "doc_iphone_65",
    name: "iPhone 6.5 fallback",
    slug: "iphone-6-5-fallback",
    now: seedTime,
  }), "iphone-fallback"), "assets/asset_phone.svg", "iphone-17-pro", "iPhone 17 Pro", "#d9dce2");
  const ipad = seedDevice(elementIds(createDocumentPreset("ipad-13", {
    id: "doc_ipad_13",
    name: "iPad 13 product story",
    slug: "ipad-13-product-story",
    now: seedTime,
  }), "ipad"), "assets/asset_social.svg", "generic-modern-ipad", "Generic modern iPad", "#242833");

  const project: Project = {
    schemaVersion: 4,
    id: "project_plinth_starter",
    slug: seedSlug,
    name: "Plinth starter studio",
    description: "Three App Store-ready starting frames with offline-safe screenshot assets and editable vector device frames.",
    settings: DEFAULT_SETTINGS,
    background: DEFAULT_BACKGROUND,
    assets: starterAssets(),
    documents: [iphone, iphoneFallback, ipad],
    createdAt: seedTime,
    updatedAt: seedTime,
  };

  return { project: ProjectSchema.parse(project), assets: starterAssetContents };
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
  writeStarterProject().then((project) => console.log(`Seeded ${project.slug} with ${project.documents.length} documents and ${project.assets.length} assets.`));
}
