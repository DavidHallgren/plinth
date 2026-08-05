import { useRef, useState } from "react";
import type { EditorStore } from "../app/editor-store";
import { assetUrl, clearImageCache } from "../canvas/image-loading";
import { MAX_ASSET_BYTES, MAX_ASSET_PIXELS } from "../lib/asset-validation";
import { createAssetMutationQueue, mergeAssetMutationProject, removeAssetUsages } from "../lib/asset-mutations";
import { apiFetch, jsonRequest } from "../lib/client-api";
import type { AssetMetadata, Project } from "../lib/schema";

type AssetMutationOptions = {
  project: Project;
  store: EditorStore;
  currentLocalRevision: () => number;
  flushPendingSave: () => Promise<Project>;
  commitProject: (project: Project) => void;
  syncProject: (project: Project) => void;
};

export type AssetUploadState = {
  id: string;
  fileName: string;
  status: "uploading" | "error" | "done" | "duplicate";
  message?: string;
};

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

async function decodeBrowserImage(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      // SVG support differs between browsers; fall back to an image element.
    }
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(`“${file.name}” could not be decoded as an image.`));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function preflightAssetFile(file: File): Promise<void> {
  if (file.size === 0) throw new Error(`“${file.name}” is empty.`);
  if (file.size > MAX_ASSET_BYTES) throw new Error(`“${file.name}” is larger than 25 MB.`);
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!SUPPORTED_MIME_TYPES.has(file.type) && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`“${file.name}” is not a PNG, JPEG, WebP, or SVG image.`);
  }
  const dimensions = await decodeBrowserImage(file);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return;
  const pixelCount = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_ASSET_PIXELS) {
    throw new Error(`“${file.name}” contains more than ${Math.round(MAX_ASSET_PIXELS / 1_000_000)} megapixels.`);
  }
}

export function useAssetMutations({ project, store, currentLocalRevision, flushPendingSave, commitProject, syncProject }: AssetMutationOptions) {
  const [uploadStates, setUploadStates] = useState<Map<string, AssetUploadState>>(new Map());
  const uploadFilesRef = useRef(new Map<string, File>());
  const queueRef = useRef(createAssetMutationQueue());

  function applyServerProject(
    serverProject: Project,
    flushedRevision: number,
    rebase?: (latestProject: Project, serverProject: Project) => Project,
  ): void {
    const latest = store.getSnapshot();
    const hasLocalChanges = currentLocalRevision() !== flushedRevision || latest.isInTransaction;
    const nextProject = hasLocalChanges
      ? rebase?.(latest.project, serverProject) ?? mergeAssetMutationProject(latest.project, serverProject, true)
      : serverProject;
    store.replaceExternalProject(nextProject);
    if (hasLocalChanges) commitProject(nextProject);
    else syncProject(nextProject);
  }

  function updateUpload(id: string, update: Omit<AssetUploadState, "id" | "fileName">): void {
    setUploadStates((current) => {
      const previous = current.get(id);
      if (!previous) return current;
      return new Map(current).set(id, { ...previous, ...update });
    });
  }

  async function uploadFile(file: File, id: string): Promise<AssetMetadata | null> {
    updateUpload(id, { status: "uploading", message: undefined });
    try {
      await preflightAssetFile(file);
      let flushedRevision = currentLocalRevision();
      const result = await queueRef.current(
        async () => { await flushPendingSave(); flushedRevision = currentLocalRevision(); },
        async () => {
          const formData = new FormData();
          formData.append("file", file, file.name);
          return apiFetch<{ asset: AssetMetadata; duplicate: boolean; project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/assets`, { method: "POST", body: formData });
        },
      );
      clearImageCache(assetUrl(project.slug, result.asset.path));
      applyServerProject(result.project, flushedRevision);
      updateUpload(id, {
        status: result.duplicate ? "duplicate" : "done",
        message: result.duplicate ? `Already in library as ${result.asset.name}` : result.asset.name,
      });
      return result.asset;
    } catch (reason) {
      updateUpload(id, { status: "error", message: reason instanceof Error ? reason.message : "Upload failed." });
      return null;
    }
  }

  async function uploadFiles(files: File[]): Promise<AssetMetadata[]> {
    const entries = files.map((file) => ({ file, id: crypto.randomUUID() }));
    if (entries.length === 0) return [];
    setUploadStates((current) => {
      const next = new Map(current);
      for (const { file, id } of entries) {
        uploadFilesRef.current.set(id, file);
        next.set(id, { id, fileName: file.name, status: "uploading" });
      }
      return next;
    });
    const results = await Promise.all(entries.map(({ file, id }) => uploadFile(file, id)));
    return results.filter((asset): asset is AssetMetadata => asset !== null);
  }

  function dismissUpload(id: string): void {
    uploadFilesRef.current.delete(id);
    setUploadStates((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }

  async function retryUpload(id: string): Promise<void> {
    const file = uploadFilesRef.current.get(id);
    if (file) await uploadFile(file, id);
  }

  async function renameAsset(asset: AssetMetadata, name: string): Promise<void> {
    let flushedRevision = currentLocalRevision();
    const result = await queueRef.current(
      async () => { await flushPendingSave(); flushedRevision = currentLocalRevision(); },
      () => apiFetch<{ asset: AssetMetadata; project: Project }>(
        `/api/projects/${encodeURIComponent(project.slug)}/assets/${encodeURIComponent(asset.fileName)}`,
        { ...jsonRequest({ name }), method: "PATCH" },
      ),
    );
    applyServerProject(result.project, flushedRevision);
  }

  async function deleteAsset(asset: AssetMetadata, deleteUsages: boolean): Promise<void> {
    const path = `/api/projects/${encodeURIComponent(project.slug)}/assets/${encodeURIComponent(asset.fileName)}`;
    let flushedRevision = currentLocalRevision();
    const result = await queueRef.current(
      async () => { await flushPendingSave(); flushedRevision = currentLocalRevision(); },
      () => apiFetch<{ project: Project }>(deleteUsages ? `${path}?deleteUsages=true` : path, { method: "DELETE" }),
    );
    clearImageCache(assetUrl(project.slug, asset.path));
    applyServerProject(result.project, flushedRevision, deleteUsages
      ? (latestProject, serverProject) => removeAssetUsages({ ...latestProject, assets: serverProject.assets }, asset.path)
      : undefined);
  }

  return { uploadStates, uploadFiles, dismissUpload, retryUpload, renameAsset, deleteAsset };
}
