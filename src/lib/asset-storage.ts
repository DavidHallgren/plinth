import { assetPathForFileName, deriveAssetDisplayName, deriveAssetFileName, normalizeSourceFileName, type ValidatedImage } from "./asset-validation";
import type { AssetMetadata } from "./schema";

export function createAssetMetadata(originalName: string, validated: ValidatedImage, existingAssets: readonly AssetMetadata[]): AssetMetadata {
  const fileName = deriveAssetFileName(originalName, validated.extension, validated.contentHash, new Set(existingAssets.map((asset) => asset.fileName)));
  return {
    id: `asset_${validated.contentHash}`,
    kind: "image",
    name: deriveAssetDisplayName(originalName),
    sourceFileName: normalizeSourceFileName(originalName),
    path: assetPathForFileName(fileName),
    fileName,
    mimeType: validated.mimeType,
    width: validated.width,
    height: validated.height,
    byteSize: validated.byteSize,
    contentHash: validated.contentHash,
  };
}
