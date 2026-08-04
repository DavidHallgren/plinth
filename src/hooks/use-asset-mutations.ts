import { useRef, useState } from "react";
import type { EditorStore } from "../app/editor-store";
import { assetUrl, clearImageCache } from "../canvas/image-loading";
import { createAssetMutationQueue, mergeAssetMutationProject } from "../lib/asset-mutations";
import { ApiClientError, apiFetch } from "../lib/client-api";
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
  status: "uploading" | "error" | "done";
  message?: string;
};

export function useAssetMutations({ project, store, currentLocalRevision, flushPendingSave, commitProject, syncProject }: AssetMutationOptions) {
  const [uploadStates, setUploadStates] = useState<Map<string, AssetUploadState>>(new Map());
  const queueRef = useRef(createAssetMutationQueue());

  function applyServerProject(serverProject: Project, flushedRevision: number): void {
    const latest = store.getSnapshot();
    const hasLocalChanges = currentLocalRevision() !== flushedRevision || latest.isInTransaction;
    const nextProject = mergeAssetMutationProject(latest.project, serverProject, hasLocalChanges);
    store.replaceExternalProject(nextProject);
    if (hasLocalChanges) commitProject(nextProject);
    else syncProject(nextProject);
  }

  async function uploadFiles(files: File[]): Promise<AssetMetadata[]> {
    const uploaded: AssetMetadata[] = [];
    for (const file of files) {
      setUploadStates((current) => new Map(current).set(file.name, { status: "uploading" }));
      try {
        let flushedRevision = currentLocalRevision();
        const result = await queueRef.current(
          async () => { await flushPendingSave(); flushedRevision = currentLocalRevision(); },
          async () => {
            const formData = new FormData();
            formData.append("file", file, file.name);
            return apiFetch<{ asset: AssetMetadata; project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/assets`, { method: "POST", body: formData });
          },
        );
        uploaded.push(result.asset);
        clearImageCache(assetUrl(project.slug, result.asset.path));
        applyServerProject(result.project, flushedRevision);
        setUploadStates((current) => new Map(current).set(file.name, { status: "done", message: result.asset.fileName }));
      } catch (reason) {
        setUploadStates((current) => new Map(current).set(file.name, { status: "error", message: reason instanceof Error ? reason.message : "Upload failed." }));
      }
    }
    return uploaded;
  }

  async function deleteAsset(asset: AssetMetadata): Promise<void> {
    const path = `/api/projects/${encodeURIComponent(project.slug)}/assets/${encodeURIComponent(asset.fileName)}`;
    const performDelete = async (force: boolean) => {
      let flushedRevision = currentLocalRevision();
      const result = await queueRef.current(
        async () => { await flushPendingSave(); flushedRevision = currentLocalRevision(); },
        () => apiFetch<{ project: Project }>(force ? `${path}?force=true` : path, { method: "DELETE" }),
      );
      clearImageCache(assetUrl(project.slug, asset.path));
      applyServerProject(result.project, flushedRevision);
    };

    try {
      await performDelete(false);
    } catch (reason) {
      if (!(reason instanceof ApiClientError) || reason.code !== "ASSET_IN_USE") throw reason;
      const details = reason.details as { usages?: Array<{ screenName: string; deckName?: string; elementName: string }> } | undefined;
      const usages = details?.usages?.map((usage) => `${usage.deckName ? `${usage.deckName} / ` : ""}${usage.screenName} / ${usage.elementName}`).join(", ") ?? "another element";
      if (!window.confirm(`${asset.fileName} is used by ${usages}. Force delete it? References will show missing-asset errors.`)) throw reason;
      await performDelete(true);
    }
  }

  return { uploadStates, uploadFiles, deleteAsset };
}
