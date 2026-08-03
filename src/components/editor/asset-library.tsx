import { AlertTriangle, FileImage, ImagePlus, LoaderCircle, MonitorSmartphone, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AssetMetadata } from "../../lib/schema";
import { assetUrl } from "../../canvas/image-loading";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type AssetUploadState = {
  status: "uploading" | "error" | "done";
  message?: string;
};

type AssetLibraryProps = {
  open: boolean;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  usageCounts: ReadonlyMap<string, number>;
  uploadStates: ReadonlyMap<string, AssetUploadState>;
  onOpenChange: (open: boolean) => void;
  onUploadFiles: (files: File[]) => Promise<AssetMetadata[]>;
  onAddImage: (asset: AssetMetadata) => void;
  onPlaceInDevice: (asset: AssetMetadata) => void;
  onDeleteAsset: (asset: AssetMetadata) => Promise<void>;
};

export function AssetLibrary({ open, projectSlug, assets, usageCounts, uploadStates, onOpenChange, onUploadFiles, onAddImage, onPlaceInDevice, onDeleteAsset }: AssetLibraryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setDragging(false);
  }, [open]);

  async function upload(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    await onUploadFiles(selected);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function deleteAsset(asset: AssetMetadata) {
    setBusyPath(asset.path);
    setDeleteError(null);
    try {
      await onDeleteAsset(asset);
    } catch (reason) {
      if (reason instanceof Error && reason.message) setDeleteError(reason.message);
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open} title="Asset library">
      <div className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto pr-1">
        <div
          className={`rounded-lg border border-dashed p-4 text-center transition ${dragging ? "border-accent bg-accent/[0.1]" : "border-white/15 bg-white/[0.025]"}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
        >
          <Upload className="mx-auto text-accent-soft" size={20} />
          <p className="mt-2 text-xs font-medium text-ink">Drop images here or choose files</p>
          <p className="mt-1 text-[10px] text-muted">PNG, JPEG, WebP, or SVG · 25 MB max</p>
          <input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" multiple onChange={(event) => { if (event.target.files) void upload(event.target.files); }} ref={inputRef} type="file" />
          <Button className="mt-3" onClick={() => inputRef.current?.click()} size="sm" variant="secondary"><Upload size={13} /> Choose files</Button>
        </div>

        {[...uploadStates.entries()].map(([fileName, state]) => (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${state.status === "error" ? "border-red-300/20 bg-red-400/[0.06]" : "border-accent/20 bg-accent/[0.06]"}`} key={fileName}>
            {state.status === "uploading" ? <LoaderCircle className="animate-spin text-accent-soft" size={14} /> : <AlertTriangle className="text-red-200" size={14} />}
            <span className="min-w-0 flex-1 truncate text-muted">{fileName}</span>
            <span className={state.status === "error" ? "text-red-200" : "text-accent-soft"}>{state.status === "error" ? state.message ?? "Upload failed" : state.status === "done" ? `Uploaded${state.message ? ` · ${state.message}` : ""}` : "Uploading…"}</span>
          </div>
        ))}

        {deleteError ? <div className="flex items-start gap-2 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200" role="alert"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{deleteError}</div> : null}

        {assets.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] p-8 text-center text-xs text-muted"><FileImage className="mx-auto mb-2 text-muted/70" size={22} />No assets yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset) => <AssetCard asset={asset} busy={busyPath === asset.path} key={asset.path} projectSlug={projectSlug} usageCount={usageCounts.get(asset.path) ?? 0} onAddImage={onAddImage} onDelete={() => void deleteAsset(asset)} onPlaceInDevice={onPlaceInDevice} />)}
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={() => onOpenChange(false)} size="sm" variant="ghost"><X size={13} /> Close</Button></div>
    </Dialog>
  );
}

function AssetCard({ asset, projectSlug, usageCount, busy, onAddImage, onPlaceInDevice, onDelete }: { asset: AssetMetadata; projectSlug: string; usageCount: number; busy: boolean; onAddImage: (asset: AssetMetadata) => void; onPlaceInDevice: (asset: AssetMetadata) => void; onDelete: () => void }) {
  const [imageError, setImageError] = useState(false);
  return (
    <article className="overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.025]">
      <div className="relative grid h-28 place-items-center overflow-hidden bg-[#121212]">
        {!imageError ? <img alt={asset.fileName} className="h-full w-full object-contain" onError={() => setImageError(true)} src={assetUrl(projectSlug, asset.path)} /> : <div className="text-center text-[10px] text-red-200"><AlertTriangle className="mx-auto mb-1" size={16} />Missing or unreadable file</div>}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2"><FileImage className="mt-0.5 shrink-0 text-sky-300" size={14} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-ink" title={asset.fileName}>{asset.fileName}</p><p className="mt-0.5 text-[10px] text-muted">{asset.width} × {asset.height} · {formatBytes(asset.byteSize)}</p></div></div>
        <p className="text-[10px] text-muted">{formatAssetType(asset.mimeType)} · {usageCount} use{usageCount === 1 ? "" : "s"}</p>
        <div className="grid grid-cols-2 gap-1.5"><Button onClick={() => onAddImage(asset)} size="sm" variant="secondary"><ImagePlus size={12} /> Image</Button><Button onClick={() => onPlaceInDevice(asset)} size="sm" variant="secondary"><MonitorSmartphone size={12} /> Device</Button></div>
        <Button className="w-full" disabled={busy} onClick={onDelete} size="sm" variant="ghost">{busy ? <LoaderCircle className="animate-spin" size={12} /> : <Trash2 size={12} />} {busy ? "Removing…" : "Remove asset"}</Button>
      </div>
    </article>
  );
}

export function formatBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAssetType(mimeType: string): string {
  if (mimeType === "image/svg+xml") return "SVG";
  return mimeType.replace("image/", "").toUpperCase();
}
