import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Grid2X2,
  ImagePlus,
  Info,
  List,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { assetUrl } from "../../canvas/image-loading";
import type { DevicePresetId } from "../../devices/presets";
import type { AssetUploadState } from "../../hooks/use-asset-mutations";
import type { AssetMetadata } from "../../lib/schema";
import type { AssetUsage } from "../../scene/selectors";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { FramePresetMenu } from "./frame-preset-menu";

export type FrameAssetTarget = {
  selectedFrameName: string | null;
};

type AssetLibraryProps = {
  open: boolean;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  usagesByPath: ReadonlyMap<string, readonly AssetUsage[]>;
  uploadStates: ReadonlyMap<string, AssetUploadState>;
  frameTarget: FrameAssetTarget;
  onOpenChange: (open: boolean) => void;
  onUploadFiles: (files: File[]) => Promise<AssetMetadata[]>;
  onDismissUpload: (id: string) => void;
  onRetryUpload: (id: string) => Promise<void>;
  onAddImage: (asset: AssetMetadata) => void;
  onAddWithFrame: (asset: AssetMetadata, presetId: DevicePresetId) => void;
  onReplaceSelectedFrame: (asset: AssetMetadata) => void;
  onRenameAsset: (asset: AssetMetadata, name: string) => Promise<void>;
  onDeleteAsset: (asset: AssetMetadata, deleteUsages: boolean) => Promise<void>;
  onRevealUsage: (usage: AssetUsage) => void;
};

type AssetFilter = "all" | "used" | "unused" | "attention";
type AssetSort = "recent" | "name" | "uses" | "size";
type ViewMode = "grid" | "list";

const checkerboardStyle: CSSProperties = {
  backgroundColor: "#151515",
  backgroundImage: "linear-gradient(45deg, #202020 25%, transparent 25%), linear-gradient(-45deg, #202020 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #202020 75%), linear-gradient(-45deg, transparent 75%, #202020 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundSize: "16px 16px",
};

export function AssetLibrary({
  open,
  projectSlug,
  assets,
  usagesByPath,
  uploadStates,
  frameTarget,
  onOpenChange,
  onUploadFiles,
  onDismissUpload,
  onRetryUpload,
  onAddImage,
  onAddWithFrame,
  onReplaceSelectedFrame,
  onRenameAsset,
  onDeleteAsset,
  onRevealUsage,
}: AssetLibraryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [sort, setSort] = useState<AssetSort>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AssetMetadata | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setDragging(false);
  }, [open]);

  useEffect(() => {
    for (const [id, state] of uploadStates) {
      if ((state.status === "done" || state.status === "duplicate") && !dismissTimersRef.current.has(id)) {
        dismissTimersRef.current.set(id, setTimeout(() => {
          dismissTimersRef.current.delete(id);
          onDismissUpload(id);
        }, 5000));
      }
    }
    for (const [id, timer] of dismissTimersRef.current) {
      if (uploadStates.has(id)) continue;
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, [onDismissUpload, uploadStates]);

  useEffect(() => () => {
    for (const timer of dismissTimersRef.current.values()) clearTimeout(timer);
    dismissTimersRef.current.clear();
  }, []);

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assets
      .map((asset, index) => ({ asset, index, usages: usagesByPath.get(asset.path) ?? [] }))
      .filter(({ asset, usages }) => {
        if (filter === "used" && usages.length === 0) return false;
        if (filter === "unused" && usages.length > 0) return false;
        if (filter === "attention" && !previewErrors.has(asset.path)) return false;
        if (!normalizedQuery) return true;
        return [asset.name, asset.sourceFileName, asset.fileName].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        if (sort === "name") return left.asset.name.localeCompare(right.asset.name);
        if (sort === "uses") return right.usages.length - left.usages.length || left.asset.name.localeCompare(right.asset.name);
        if (sort === "size") return right.asset.byteSize - left.asset.byteSize || left.asset.name.localeCompare(right.asset.name);
        return right.index - left.index;
      });
  }, [assets, filter, previewErrors, query, sort, usagesByPath]);

  useEffect(() => {
    if (selectedPath && visibleAssets.some(({ asset }) => asset.path === selectedPath)) return;
    setSelectedPath(visibleAssets[0]?.asset.path ?? null);
  }, [selectedPath, visibleAssets]);

  const selectedAsset = assets.find((asset) => asset.path === selectedPath) ?? null;
  const selectedUsages = selectedAsset ? usagesByPath.get(selectedAsset.path) ?? [] : [];
  const uploadEntries = [...uploadStates.values()];
  const uploadingCount = uploadEntries.filter((state) => state.status === "uploading").length;

  async function upload(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    await onUploadFiles(selected);
    if (inputRef.current) inputRef.current.value = "";
  }

  function markPreviewError(path: string, failed: boolean): void {
    setPreviewErrors((current) => {
      const next = new Set(current);
      if (failed) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function addAsImage(asset: AssetMetadata): void {
    onAddImage(asset);
    onOpenChange(false);
  }

  function addWithFrame(asset: AssetMetadata, presetId: DevicePresetId): void {
    onAddWithFrame(asset, presetId);
    onOpenChange(false);
  }

  function replaceSelectedFrame(asset: AssetMetadata): void {
    onReplaceSelectedFrame(asset);
    onOpenChange(false);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    const usages = usagesByPath.get(deleteTarget.path) ?? [];
    setBusyPath(deleteTarget.path);
    setActionError(null);
    try {
      await onDeleteAsset(deleteTarget, usages.length > 0);
      setDeleteTarget(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The asset could not be deleted.");
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <>
      <Dialog bodyClassName="mt-4 flex min-h-0 flex-1 flex-col" className="flex h-[min(44rem,calc(100dvh-2rem))] !max-w-[1100px] flex-col" onOpenChange={onOpenChange} open={open} title={`Asset library · ${assets.length}`}>
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
        >
          {dragging ? (
            <div className="absolute inset-0 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-[#182116]/95 text-center shadow-2xl">
              <div><Upload className="mx-auto text-accent-soft" size={28} /><p className="mt-3 text-sm font-semibold text-ink">Drop images to add them</p><p className="mt-1 text-xs text-muted">PNG, JPEG, WebP, or SVG · 25 MB max</p></div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
              <Input aria-label="Search assets" className="h-9 pl-9 text-xs" onChange={(event) => setQuery(event.target.value)} placeholder="Search names and filenames…" value={query} />
            </div>
            <select aria-label="Filter assets" className="plinth-focus-ring h-9 rounded-lg border border-line bg-panel-strong px-2.5 text-xs text-ink outline-none" onChange={(event) => setFilter(event.target.value as AssetFilter)} value={filter}>
              <option value="all">All assets</option>
              <option value="used">Used</option>
              <option value="unused">Unused</option>
              <option value="attention">Needs attention</option>
            </select>
            <select aria-label="Sort assets" className="plinth-focus-ring h-9 rounded-lg border border-line bg-panel-strong px-2.5 text-xs text-ink outline-none" onChange={(event) => setSort(event.target.value as AssetSort)} value={sort}>
              <option value="recent">Recently added</option>
              <option value="name">Name</option>
              <option value="uses">Most used</option>
              <option value="size">Largest file</option>
            </select>
            <div className="flex rounded-lg border border-line bg-panel-strong p-0.5">
              <Button aria-label="Grid view" className="h-7 w-7" onClick={() => setViewMode("grid")} size="icon" tooltip="Grid view" variant={viewMode === "grid" ? "secondary" : "ghost"}><Grid2X2 size={13} /></Button>
              <Button aria-label="List view" className="h-7 w-7" onClick={() => setViewMode("list")} size="icon" tooltip="List view" variant={viewMode === "list" ? "secondary" : "ghost"}><List size={14} /></Button>
            </div>
            <input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" multiple onChange={(event) => { if (event.target.files) void upload(event.target.files); }} ref={inputRef} type="file" />
            <Button className="h-9" onClick={() => inputRef.current?.click()} size="sm" variant="primary"><Upload size={13} /> Upload</Button>
          </div>

          {uploadEntries.length > 0 ? (
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
              <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-muted"><span>{uploadingCount > 0 ? `Uploading ${uploadEntries.length - uploadingCount + 1} of ${uploadEntries.length}` : "Recent uploads"}</span>{uploadingCount > 0 ? <span>{uploadingCount} remaining</span> : null}</div>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {uploadEntries.map((state) => <UploadStatus key={state.id} onDismiss={() => onDismissUpload(state.id)} onRetry={() => void onRetryUpload(state.id)} state={state} />)}
              </div>
            </div>
          ) : null}

          <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] overflow-hidden rounded-xl border border-white/[0.08] bg-black/10">
            <div className="min-h-0 overflow-y-auto p-3">
              {assets.length === 0 ? (
                <button className="grid h-full min-h-80 w-full place-items-center rounded-xl border border-dashed border-white/10 text-center" onClick={() => inputRef.current?.click()} type="button"><span><FileImage className="mx-auto mb-3 text-muted/70" size={28} /><span className="block text-sm font-medium text-ink">No assets yet</span><span className="mt-1 block text-xs text-muted">Upload or drop images to get started.</span></span></button>
              ) : visibleAssets.length === 0 ? (
                <div className="grid h-full min-h-80 place-items-center text-center"><div><Search className="mx-auto mb-2 text-muted/70" size={22} /><p className="text-xs text-muted">No assets match this view.</p><Button className="mt-2" onClick={() => { setQuery(""); setFilter("all"); }} size="sm" variant="ghost">Clear filters</Button></div></div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-2.5">
                  {visibleAssets.map(({ asset, usages }) => <AssetTile asset={asset} attention={previewErrors.has(asset.path)} key={asset.path} onAdd={() => addAsImage(asset)} onPreviewError={markPreviewError} onSelect={() => setSelectedPath(asset.path)} projectSlug={projectSlug} selected={selectedPath === asset.path} usageCount={usages.length} />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {visibleAssets.map(({ asset, usages }) => <AssetRow asset={asset} attention={previewErrors.has(asset.path)} key={asset.path} onAdd={() => addAsImage(asset)} onPreviewError={markPreviewError} onSelect={() => setSelectedPath(asset.path)} projectSlug={projectSlug} selected={selectedPath === asset.path} usageCount={usages.length} />)}
                </div>
              )}
            </div>
            <aside className="flex min-h-0 flex-col overflow-hidden border-l border-white/[0.08] bg-white/[0.02] p-3">
              {selectedAsset ? (
                <AssetDetails
                  asset={selectedAsset}
                  attention={previewErrors.has(selectedAsset.path)}
                  busy={busyPath === selectedAsset.path}
                  frameTarget={frameTarget}
                  onAddImage={() => addAsImage(selectedAsset)}
                  onDelete={() => { setActionError(null); setDeleteTarget(selectedAsset); }}
                  onAddWithFrame={(presetId) => addWithFrame(selectedAsset, presetId)}
                  onReplaceSelectedFrame={() => replaceSelectedFrame(selectedAsset)}
                  onPreviewError={markPreviewError}
                  onRename={async (name) => {
                    setBusyPath(selectedAsset.path);
                    setActionError(null);
                    try { await onRenameAsset(selectedAsset, name); }
                    catch (reason) { setActionError(reason instanceof Error ? reason.message : "The asset could not be renamed."); }
                    finally { setBusyPath(null); }
                  }}
                  onRevealUsage={(usage) => { onRevealUsage(usage); onOpenChange(false); }}
                  projectSlug={projectSlug}
                  usages={selectedUsages}
                />
              ) : <div className="grid h-full place-items-center text-xs text-muted">Select an asset to see its details.</div>}
              {actionError ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200" role="alert"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{actionError}</div> : null}
            </aside>
          </div>
        </div>
      </Dialog>

      <Dialog
        description={deleteTarget ? deleteDescription(deleteTarget, usagesByPath.get(deleteTarget.path) ?? []) : undefined}
        footer={<><Button disabled={Boolean(busyPath)} onClick={() => setDeleteTarget(null)} variant="ghost">Cancel</Button><Button disabled={Boolean(busyPath)} onClick={() => void confirmDelete()} variant="danger">{busyPath ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}{deleteTarget && (usagesByPath.get(deleteTarget.path)?.length ?? 0) > 0 ? "Delete usages and asset" : "Delete asset"}</Button></>}
        onOpenChange={(nextOpen) => { if (!nextOpen && !busyPath) setDeleteTarget(null); }}
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete asset?"}
      >
        {deleteTarget && (usagesByPath.get(deleteTarget.path)?.length ?? 0) > 0 ? (
          <UsageList onReveal={undefined} usages={usagesByPath.get(deleteTarget.path) ?? []} />
        ) : null}
        {actionError ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200" role="alert"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{actionError}</div> : null}
      </Dialog>
    </>
  );
}

function UploadStatus({ state, onRetry, onDismiss }: { state: AssetUploadState; onRetry: () => void; onDismiss: () => void }) {
  const isError = state.status === "error";
  const icon = state.status === "uploading"
    ? <LoaderCircle className="animate-spin text-accent-soft" size={14} />
    : isError
      ? <AlertTriangle className="text-red-200" size={14} />
      : state.status === "duplicate"
        ? <Info className="text-sky-200" size={14} />
        : <CheckCircle2 className="text-emerald-200" size={14} />;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${isError ? "bg-red-400/[0.06]" : "bg-white/[0.025]"}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-muted" title={state.fileName}>{state.fileName}</span>
      <span className={`max-w-[45%] truncate ${isError ? "text-red-200" : state.status === "done" ? "text-emerald-200" : "text-accent-soft"}`} title={state.message}>{state.status === "uploading" ? "Uploading…" : state.message}</span>
      {isError ? <Button aria-label={`Retry ${state.fileName}`} className="h-6 w-6" onClick={onRetry} size="icon" tooltip="Retry upload" variant="ghost"><RefreshCw size={12} /></Button> : null}
      <Button aria-label={`Dismiss ${state.fileName}`} className="h-6 w-6" onClick={onDismiss} size="icon" tooltip="Dismiss" variant="ghost"><X size={12} /></Button>
    </div>
  );
}

function AssetPreview({ asset, projectSlug, className, fit = "cover", onError }: { asset: AssetMetadata; projectSlug: string; className: string; fit?: "contain" | "cover"; onError: (failed: boolean) => void }) {
  return (
    <div className={`relative grid place-items-center overflow-hidden ${className}`} style={checkerboardStyle}>
      <img
        alt={asset.name}
        className="absolute inset-0 block h-full w-full"
        onError={() => onError(true)}
        onLoad={() => onError(false)}
        src={assetUrl(projectSlug, asset.path)}
        style={{ objectFit: fit }}
      />
    </div>
  );
}

function AssetTile({ asset, projectSlug, usageCount, selected, attention, onSelect, onAdd, onPreviewError }: { asset: AssetMetadata; projectSlug: string; usageCount: number; selected: boolean; attention: boolean; onSelect: () => void; onAdd: () => void; onPreviewError: (path: string, failed: boolean) => void }) {
  return (
    <button aria-pressed={selected} className={`overflow-hidden rounded-xl border text-left transition ${selected ? "border-accent bg-accent/[0.07] ring-1 ring-accent/30" : "border-white/[0.09] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"}`} onClick={onSelect} onDoubleClick={onAdd} type="button">
      <AssetPreview asset={asset} className="h-28" onError={(failed) => onPreviewError(asset.path, failed)} projectSlug={projectSlug} />
      <div className="p-2.5">
        <div className="flex items-center gap-1.5"><p className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={asset.name}>{asset.name}</p>{attention ? <AlertTriangle className="shrink-0 text-red-200" size={12} /> : selected ? <Check className="shrink-0 text-accent-soft" size={12} /> : null}</div>
        <p className="mt-1 truncate text-[10px] text-muted">{asset.width}×{asset.height} · {usageCount === 0 ? "Unused" : `${usageCount} use${usageCount === 1 ? "" : "s"}`}</p>
      </div>
    </button>
  );
}

function AssetRow({ asset, projectSlug, usageCount, selected, attention, onSelect, onAdd, onPreviewError }: { asset: AssetMetadata; projectSlug: string; usageCount: number; selected: boolean; attention: boolean; onSelect: () => void; onAdd: () => void; onPreviewError: (path: string, failed: boolean) => void }) {
  return (
    <button aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${selected ? "border-accent bg-accent/[0.07]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`} onClick={onSelect} onDoubleClick={onAdd} type="button">
      <AssetPreview asset={asset} className="h-14 w-20 shrink-0 rounded-lg" onError={(failed) => onPreviewError(asset.path, failed)} projectSlug={projectSlug} />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-xs font-medium text-ink">{asset.name}</p>{attention ? <AlertTriangle className="shrink-0 text-red-200" size={12} /> : null}</div><p className="mt-1 truncate text-[10px] text-muted">{asset.fileName}</p></div>
      <p className="shrink-0 text-[10px] text-muted">{asset.width}×{asset.height}</p>
      <Badge tone={usageCount > 0 ? "accent" : "neutral"}>{usageCount === 0 ? "Unused" : `${usageCount} use${usageCount === 1 ? "" : "s"}`}</Badge>
    </button>
  );
}

function AssetDetails({ asset, projectSlug, usages, frameTarget, attention, busy, onPreviewError, onAddImage, onAddWithFrame, onReplaceSelectedFrame, onRename, onDelete, onRevealUsage }: { asset: AssetMetadata; projectSlug: string; usages: readonly AssetUsage[]; frameTarget: FrameAssetTarget; attention: boolean; busy: boolean; onPreviewError: (path: string, failed: boolean) => void; onAddImage: () => void; onAddWithFrame: (presetId: DevicePresetId) => void; onReplaceSelectedFrame: () => void; onRename: (name: string) => Promise<void>; onDelete: () => void; onRevealUsage: (usage: AssetUsage) => void }) {
  const [name, setName] = useState(asset.name);
  useEffect(() => setName(asset.name), [asset.name, asset.path]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetPreview asset={asset} className="h-32 shrink-0 rounded-xl border border-white/[0.08]" fit="contain" onError={(failed) => onPreviewError(asset.path, failed)} projectSlug={projectSlug} />
      {attention ? <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-2.5 py-2 text-[10px] text-red-200"><AlertTriangle size={13} />Missing or unreadable file</div> : null}
      <form className="mt-3 shrink-0" onSubmit={(event) => { event.preventDefault(); if (name.trim() && name.trim() !== asset.name) void onRename(name.trim()); }}>
        <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="asset-display-name">Name</label>
        <div className="mt-1 flex gap-1.5"><Input className="h-8 text-xs" id="asset-display-name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /><Button className="h-8 px-2.5" disabled={busy || !name.trim() || name.trim() === asset.name} size="sm" type="submit" variant="secondary">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />} Save</Button></div>
      </form>

      <dl className="mt-2 shrink-0 space-y-1 text-[10px]">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Filename</dt><dd className="min-w-0 truncate text-ink" title={asset.fileName}>{asset.fileName}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">File type</dt><dd className="text-ink">{formatAssetType(asset.mimeType)}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Size</dt><dd className="text-ink">{asset.width} × {asset.height}</dd></div>
      </dl>

      <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
        <Button onClick={onAddImage} size="sm" variant="primary"><ImagePlus size={13} /> Add to screen</Button>
        <FramePresetMenu label="Add with frame" onSelect={onAddWithFrame} selectedFrameAction={frameTarget.selectedFrameName ? { frameName: frameTarget.selectedFrameName, onSelect: onReplaceSelectedFrame } : undefined} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-white/[0.08] pt-2.5"><div className="flex shrink-0 items-center justify-between"><h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">Used in</h3>{usages.length > 0 ? <span className="text-[10px] text-muted">{usages.length} place{usages.length === 1 ? "" : "s"}</span> : null}</div>{usages.length > 0 ? <UsageList className="min-h-0 flex-1" onReveal={onRevealUsage} usages={usages} /> : <p className="mt-1.5 text-[10px] leading-4 text-muted">This asset is not referenced by any layer or background.</p>}</div>
      <Button className="mt-2.5 w-full shrink-0" disabled={busy} onClick={onDelete} size="sm" variant="ghost"><Trash2 size={13} /> Delete asset</Button>
    </div>
  );
}

function UsageList({ usages, onReveal, className = "max-h-36" }: { usages: readonly AssetUsage[]; onReveal: ((usage: AssetUsage) => void) | undefined; className?: string }) {
  return <div className={`mt-1.5 space-y-1 overflow-y-auto ${className}`}>{usages.map((usage, index) => <button className="flex w-full items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-1.5 text-left text-[10px] hover:bg-white/[0.07] disabled:pointer-events-none" disabled={!onReveal} key={`${usage.screenId}:${usage.elementId}:${index}`} onClick={() => onReveal?.(usage)} type="button"><span className="min-w-0 flex-1 truncate text-ink">{usage.deckName} / {usage.screenName}</span>{onReveal ? <ExternalLink className="shrink-0 text-muted" size={12} /> : null}</button>)}</div>;
}

function deleteDescription(asset: AssetMetadata, usages: readonly AssetUsage[]): string {
  if (usages.length === 0) return `This permanently removes “${asset.name}” from the project. This action cannot be undone.`;
  const backgrounds = usages.filter((usage) => usage.elementType === "background").length;
  const canonicalLayers = new Set(usages.filter((usage) => usage.elementType !== "background").map((usage) => usage.elementId)).size;
  const parts = [`${canonicalLayers} layer${canonicalLayers === 1 ? "" : "s"} will be deleted`];
  if (backgrounds > 0) parts.push(`${backgrounds} background${backgrounds === 1 ? "" : "s"} will be reset`);
  return `${asset.name} is still in use. ${parts.join(" and ")}. The asset file will then be permanently deleted.`;
}

function formatAssetType(mimeType: string): string {
  if (mimeType === "image/svg+xml") return "SVG";
  return mimeType.replace("image/", "").toUpperCase();
}
