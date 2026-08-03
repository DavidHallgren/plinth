import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssetMetadata, DeviceElement, DocumentPreset, ImageElement, Project, ShapeElement, TextElement } from "../../lib/schema";
import { createId, nowIso } from "../../lib/ids";
import { apiFetch, ApiClientError } from "../../lib/client-api";
import { EditorStore } from "../../app/editor-store";
import { selectActiveDocument, selectAssetReferences, selectSelectedElements } from "../../scene/selectors";
import { addElement } from "../../scene/operations";
import type { AutosaveState } from "../../hooks/use-autosave";
import { EditorCanvas } from "../../canvas/editor-canvas";
import { DocumentNavigator } from "../sidebar/document-navigator";
import { EditorToolbar } from "../toolbar/editor-toolbar";
import { ProjectPreview } from "./project-preview";
import { Inspector } from "./inspector";
import { AssetLibrary, type AssetUploadState } from "./asset-library";
import { ExportDialog } from "./export-dialog";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { APP_STORE_PRESETS } from "../../scene/presets";
import { getDevicePreset } from "../../devices/presets";
import { createAssetMutationQueue, mergeAssetMutationProject } from "../../lib/asset-mutations";
import { assetUrl, clearImageCache } from "../../canvas/image-loading";

type EditorWorkspaceProps = {
  project: Project;
  dirty: boolean;
  saveState: AutosaveState;
  error: string | null;
  onProjectChange: (project: Project) => void;
  onProjectSynced: (project: Project) => void;
  onSaveNow: (project?: Project) => Promise<Project>;
  onBack: () => Promise<void>;
  onRenameProject: (name: string, slug?: string, exportDirectory?: string | null) => Promise<void>;
};

export function shouldIgnoreEditorShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as HTMLElement & { isContentEditable?: boolean };
  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.closest !== "function") return false;
  return Boolean(candidate.closest("input, textarea, select, [contenteditable]"));
}

export function EditorWorkspace({ project, dirty, saveState, error, onProjectChange, onProjectSynced, onSaveNow, onBack, onRenameProject }: EditorWorkspaceProps) {
  const storeRef = useRef<EditorStore | null>(null);
  const localCommitRevisionRef = useRef(0);
  const handleProjectCommit = useCallback((nextProject: Project) => {
    localCommitRevisionRef.current += 1;
    onProjectChange(nextProject);
  }, [onProjectChange]);
  if (!storeRef.current || storeRef.current.history.project.id !== project.id) {
    storeRef.current = new EditorStore(project, handleProjectCommit);
  }
  const store = storeRef.current;
  store.setCommitHandler(handleProjectCommit);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [fitRequest, setFitRequest] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPreset, setAddPreset] = useState<DocumentPreset>(APP_STORE_PRESETS[0]?.id ?? "custom");
  const [addName, setAddName] = useState("");
  const [addWidth, setAddWidth] = useState("1320");
  const [addHeight, setAddHeight] = useState("2868");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [renameSlug, setRenameSlug] = useState(project.slug);
  const [renameExportDirectory, setRenameExportDirectory] = useState(project.settings.exportDirectory ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRendering, setExportRendering] = useState(false);
  const [uploadStates, setUploadStates] = useState<Map<string, AssetUploadState>>(new Map());
  const [dropActive, setDropActive] = useState(false);
  const assetMutationQueueRef = useRef(createAssetMutationQueue());
  const inspectorCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    store.replaceProject(project);
  }, [project, store]);

  useEffect(() => {
    setRenameName(project.name);
    setRenameSlug(project.slug);
    setRenameExportDirectory(project.settings.exportDirectory ?? "");
  }, [project.name, project.settings.exportDirectory, project.slug]);

  const activeDocument = selectActiveDocument(snapshot.project, snapshot.activeDocumentId);
  const selectedElements = selectSelectedElements(activeDocument, snapshot.selectedElementIds);
  const reportError = useCallback((reason: unknown) => {
    setLocalError(reason instanceof Error ? reason.message : "The editor could not apply that change.");
  }, []);
  const commitInspectorTransaction = useCallback(() => {
    if (inspectorCommitTimerRef.current) {
      clearTimeout(inspectorCommitTimerRef.current);
      inspectorCommitTimerRef.current = null;
    }
    if (store.getSnapshot().isInTransaction) store.commitTransaction();
  }, [store]);
  useEffect(() => () => {
    if (inspectorCommitTimerRef.current) clearTimeout(inspectorCommitTimerRef.current);
  }, []);
  function queueInspectorChange(label: string, action: () => void): void {
    setLocalError(null);
    try {
      if (!store.getSnapshot().isInTransaction) store.beginTransaction(label);
      action();
      if (inspectorCommitTimerRef.current) clearTimeout(inspectorCommitTimerRef.current);
      inspectorCommitTimerRef.current = setTimeout(() => {
        inspectorCommitTimerRef.current = null;
        if (store.getSnapshot().isInTransaction) store.commitTransaction();
      }, 450);
    } catch (reason) {
      if (store.getSnapshot().isInTransaction) store.cancelTransaction();
      reportError(reason);
    }
  }
  const run = useCallback((action: () => void) => {
    setLocalError(null);
    try {
      action();
    } catch (reason) {
      if (store.getSnapshot().isInTransaction) store.cancelTransaction();
      reportError(reason);
    }
  }, [reportError]);
  const fitZoom = useCallback((zoom: number) => store.setZoom(zoom), [store]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreEditorShortcutTarget(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        run(() => event.shiftKey ? store.redo() : store.undo());
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        run(() => store.redo());
        return;
      }
      if (previewMode) return;
      if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        store.copy();
        return;
      }
      if (command && event.key.toLowerCase() === "v") {
        event.preventDefault();
        run(() => store.paste());
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        run(() => store.duplicateSelection());
        return;
      }
      if (!command && event.key === "]") {
        event.preventDefault();
        run(() => event.shiftKey ? store.bringToFront() : store.bringForward());
        return;
      }
      if (!command && event.key === "[") {
        event.preventDefault();
        run(() => event.shiftKey ? store.sendToBack() : store.sendBackward());
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        run(() => store.deleteSelection());
        return;
      }
      if (event.key === "Escape") {
        store.setSelection([]);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const delta = event.key === "ArrowUp" ? { x: 0, y: -distance } : event.key === "ArrowDown" ? { x: 0, y: distance } : event.key === "ArrowLeft" ? { x: -distance, y: 0 } : { x: distance, y: 0 };
        run(() => store.nudge(delta));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMode, run, store]);

  function addText() {
    const element: TextElement = {
      id: createId("text"),
      type: "text",
      name: "Text",
      x: Math.round(activeDocument.width * 0.1),
      y: Math.round(activeDocument.height * 0.12),
      width: Math.round(activeDocument.width * 0.72),
      height: 120,
      rotation: 0,
      opacity: 1,
      zIndex: activeDocument.elements.length,
      locked: false,
      visible: true,
      shadow: null,
      text: "New headline",
      style: {
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 56,
        fontWeight: 700,
        italic: false,
        underline: false,
        lineHeight: 1.1,
        letterSpacing: -1,
        color: "#ffffff",
        align: "left",
        backgroundColor: null,
        padding: 0,
        backgroundRadius: 0,
        shadow: null,
        autoHeight: true,
      },
    };
    run(() => {
      store.apply("Add text", (current) => addElement(current, activeDocument.id, element));
      store.setSelection([element.id]);
    });
  }

  function addShape(shape: ShapeElement["shape"]) {
    const element: ShapeElement = {
      id: createId("shape"),
      type: "shape",
      name: shape === "line" ? "Line" : "Shape",
      x: Math.round(activeDocument.width * 0.12),
      y: Math.round(activeDocument.height * 0.62),
      width: Math.round(activeDocument.width * 0.5),
      height: shape === "line" ? 12 : Math.round(activeDocument.height * 0.12),
      rotation: 0,
      opacity: 1,
      zIndex: activeDocument.elements.length,
      locked: false,
      visible: true,
      shadow: null,
      shape,
      fill: "#b0b0b0",
      stroke: "#dedede",
      strokeWidth: shape === "line" ? 4 : 1,
      radius: shape === "rounded-rectangle" ? 28 : 0,
    };
    run(() => {
      store.apply("Add shape", (current) => addElement(current, activeDocument.id, element));
      store.setSelection([element.id]);
    });
  }

  function addImage(asset: AssetMetadata) {
    const maxWidth = Math.max(120, Math.round(activeDocument.width * 0.58));
    const aspect = asset.width / Math.max(1, asset.height);
    const width = Math.min(maxWidth, Math.max(120, Math.round(activeDocument.width * 0.58)));
    const height = Math.max(80, Math.min(activeDocument.height * 0.42, Math.round(width / Math.max(0.1, aspect))));
    const element: ImageElement = {
      id: createId("image"),
      type: "image",
      name: asset.fileName,
      x: Math.round((activeDocument.width - width) / 2),
      y: Math.round((activeDocument.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex: activeDocument.elements.length,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: asset.path,
      fit: "cover",
      position: { x: 0.5, y: 0.5 },
      cornerRadius: Math.min(32, Math.round(Math.min(width, height) * 0.06)),
      alt: asset.fileName,
    };
    run(() => {
      store.apply("Add image", (current) => addElement(current, activeDocument.id, element));
      store.setSelection([element.id]);
    });
  }

  function placeAssetInDevice(asset: AssetMetadata) {
    const selectedDevice = selectedElements.find((element): element is DeviceElement => element.type === "device");
    if (selectedDevice) {
      run(() => store.updateElement(selectedDevice.id, { screenshotPath: asset.path }));
      return;
    }
    const preset = getDevicePreset("iphone-17-pro-max");
    if (!preset) return;
    const width = Math.round(activeDocument.width * 0.46);
    const height = Math.min(Math.round(width / preset.aspectRatio), Math.round(activeDocument.height * 0.58));
    const element: DeviceElement = {
      id: createId("device"),
      type: "device",
      preset: "iphone-17-pro-max",
      deviceId: "iphone-17-pro-max",
      deviceName: "iPhone 17 Pro Max",
      frame: "phone",
      frameColor: preset.defaultFrameColor,
      screenColor: preset.defaultScreenColor,
      screenshotPath: asset.path,
      screenshotFit: "cover",
      screenshotPosition: { x: 0.5, y: 0.5 },
      bezelStyle: "solid",
      cornerRadius: null,
      screenCornerRadius: null,
      showGlare: false,
      showCamera: true,
      name: "iPhone 17 Pro Max",
      x: Math.round((activeDocument.width - width) / 2),
      y: Math.round((activeDocument.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex: activeDocument.elements.length,
      locked: false,
      visible: true,
      shadow: null,
    };
    run(() => {
      store.apply("Add device", (current) => addElement(current, activeDocument.id, element));
      store.setSelection([element.id]);
    });
  }

  async function uploadFiles(files: File[]): Promise<AssetMetadata[]> {
    const uploaded: AssetMetadata[] = [];
    for (const file of files) {
      setUploadStates((current) => new Map(current).set(file.name, { status: "uploading" }));
      try {
        let flushedRevision = localCommitRevisionRef.current;
        const result = await assetMutationQueueRef.current(
          async () => {
            await flushPendingSave();
            flushedRevision = localCommitRevisionRef.current;
          },
          async () => {
            const formData = new FormData();
            formData.append("file", file, file.name);
            return apiFetch<{ asset: AssetMetadata; project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/assets`, { method: "POST", body: formData });
          },
        );
        uploaded.push(result.asset);
        clearImageCache(assetUrl(project.slug, result.asset.path));
        applyAssetMutationProject(result.project, flushedRevision);
        setUploadStates((current) => new Map(current).set(file.name, { status: "done", message: result.asset.fileName }));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Upload failed.";
        setUploadStates((current) => new Map(current).set(file.name, { status: "error", message }));
      }
    }
    return uploaded;
  }

  async function deleteAsset(asset: AssetMetadata): Promise<void> {
    const path = `/api/projects/${encodeURIComponent(project.slug)}/assets/${encodeURIComponent(asset.fileName)}`;
    try {
      let flushedRevision = localCommitRevisionRef.current;
      const result = await assetMutationQueueRef.current(
        async () => {
          await flushPendingSave();
          flushedRevision = localCommitRevisionRef.current;
        },
        () => apiFetch<{ project: Project }>(path, { method: "DELETE" }),
      );
      clearImageCache(assetUrl(project.slug, asset.path));
      applyAssetMutationProject(result.project, flushedRevision);
    } catch (reason) {
      if (!(reason instanceof ApiClientError) || reason.code !== "ASSET_IN_USE") throw reason;
      const details = reason.details as { usages?: Array<{ documentName: string; elementName: string }> } | undefined;
      const usages = details?.usages?.map((usage) => `${usage.documentName} / ${usage.elementName}`).join(", ") ?? "another element";
      if (!window.confirm(`${asset.fileName} is used by ${usages}. Force delete it? References will show missing-asset errors.`)) throw reason;
      let flushedRevision = localCommitRevisionRef.current;
      const result = await assetMutationQueueRef.current(
        async () => {
          await flushPendingSave();
          flushedRevision = localCommitRevisionRef.current;
        },
        () => apiFetch<{ project: Project }>(`${path}?force=true`, { method: "DELETE" }),
      );
      clearImageCache(assetUrl(project.slug, asset.path));
      applyAssetMutationProject(result.project, flushedRevision);
    }
  }

  async function handleDroppedFiles(files: FileList | File[]) {
    setDropActive(false);
    const uploaded = await uploadFiles(Array.from(files));
    for (const asset of uploaded) addImage(asset);
  }

  function applyAssetMutationProject(serverProject: Project, flushedRevision: number): void {
    const latest = store.getSnapshot();
    const hasLocalChanges = localCommitRevisionRef.current !== flushedRevision || latest.isInTransaction;
    const nextProject = mergeAssetMutationProject(latest.project, serverProject, hasLocalChanges);
    store.replaceProject(nextProject);
    if (hasLocalChanges) handleProjectCommit(nextProject);
    else onProjectSynced(nextProject);
  }

  function submitAddDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => {
      const width = Math.min(100000, Math.max(1, Math.round(Number(addWidth) || 1320)));
      const height = Math.min(100000, Math.max(1, Math.round(Number(addHeight) || 2868)));
      store.addDocument(addPreset, { name: addName.trim() || undefined, ...(addPreset === "custom" ? { width, height } : {}) });
      const added = store.history.project.documents[store.history.project.documents.length - 1];
      if (added) store.setActiveDocument(added.id);
      setPreviewMode(false);
      setAddOpen(false);
      setAddName("");
      setAddWidth("1320");
      setAddHeight("2868");
    });
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameName.trim()) return;
    commitInspectorTransaction();
    setBusy(true);
    setLocalError(null);
    try {
      await onRenameProject(renameName.trim(), renameSlug.trim() || undefined, renameExportDirectory.trim() || null);
      setRenameOpen(false);
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  function deleteDocument(documentId = snapshot.activeDocumentId) {
    const target = snapshot.project.documents.find((document) => document.id === documentId);
    if (!target) return;
    if (snapshot.project.documents.length <= 1) {
      setLocalError("A project must keep at least one document.");
      return;
    }
    if (!window.confirm(`Delete “${target.name}”?`)) return;
    run(() => store.removeDocumentById(documentId));
  }

  async function flushPendingSave(): Promise<Project> {
    commitInspectorTransaction();
    const current = store.getSnapshot().project;
    await onSaveNow(current);
    return current;
  }

  async function leaveProject(): Promise<void> {
    setBusy(true);
    try {
      await onBack();
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  const visibleError = localError ?? error;

  return (
    <div className="flex h-screen min-h-[620px] min-w-[960px] flex-col overflow-hidden bg-[#0d0d0d]">
      <EditorToolbar
        canRedo={snapshot.canRedo}
        canUndo={snapshot.canUndo}
        dirty={dirty}
        onAddShape={addShape}
        onAddText={addText}
        onOpenAssets={() => setAssetLibraryOpen(true)}
        onExport={() => setExportOpen(true)}
        onBack={() => { commitInspectorTransaction(); void leaveProject(); }}
        onFit={() => setFitRequest((value) => value + 1)}
        onRedo={() => run(() => store.redo())}
        onRenameProject={() => setRenameOpen(true)}
        onSaveNow={() => { commitInspectorTransaction(); void onSaveNow(store.getSnapshot().project).catch(reportError); }}
        onUndo={() => run(() => store.undo())}
        onZoomChange={(zoom) => store.setZoom(zoom)}
        saveState={saveState}
        projectName={project.name}
        zoom={snapshot.zoom}
        previewMode={previewMode}
      />
      {visibleError ? <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-300/20 bg-red-400/[0.08] px-4 py-2 text-xs text-red-100" role="alert"><span>{visibleError}</span><button className="text-red-100/70 hover:text-red-50" onClick={() => setLocalError(null)} type="button">Dismiss</button></div> : null}
      <div className="flex min-h-0 flex-1">
        <DocumentNavigator
          activeDocumentId={snapshot.activeDocumentId}
          assets={snapshot.project.assets}
          documents={snapshot.project.documents}
          onAddDocument={() => setAddOpen(true)}
          onDeleteDocument={deleteDocument}
          onDuplicateDocument={(documentId) => run(() => store.duplicateDocumentById(documentId))}
          onOpenPreview={() => { commitInspectorTransaction(); store.setSelection([]); setPreviewMode(true); }}
          onDeleteElement={(elementId) => run(() => { store.setSelection([elementId]); store.deleteSelection(); })}
          onDuplicateElement={(elementId) => run(() => store.duplicateElement(elementId))}
          onMoveDocument={(documentId, direction) => run(() => {
            const index = snapshot.project.documents.findIndex((document) => document.id === documentId);
            store.reorderCurrentDocuments([documentId], index + direction);
          })}
          onReorderDocument={(documentId, targetIndex) => run(() => {
            const sourceIndex = store.getSnapshot().project.documents.findIndex((document) => document.id === documentId);
            store.reorderCurrentDocuments([documentId], sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
          })}
          onMoveElement={(elementId, direction) => run(() => store.reorderElementByDirection(elementId, direction))}
          onReorderElement={(elementId, targetIndex) => run(() => {
            const currentDocument = selectActiveDocument(store.getSnapshot().project, store.getSnapshot().activeDocumentId);
            const ordered = [...currentDocument.elements].sort((left, right) => left.zIndex - right.zIndex);
            const sourceIndex = ordered.findIndex((element) => element.id === elementId);
            store.reorderElementToIndex(elementId, sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
          })}
          onRenameElement={(elementId, name) => run(() => store.updateElement(elementId, { name }))}
          onSelectDocument={(documentId) => { store.setActiveDocument(documentId); setPreviewMode(false); }}
          onSelectElement={(elementId, additive) => store.toggleSelection(elementId, additive)}
          onToggleLocked={(element) => run(() => store.updateElement(element.id, { locked: !element.locked }))}
          onToggleVisible={(element) => run(() => store.updateElement(element.id, { visible: !element.visible }))}
          projectSlug={project.slug}
          selectedElementIds={snapshot.selectedElementIds}
          previewMode={previewMode}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className="relative flex min-h-0 flex-1"
            onDragEnter={(event) => { if (previewMode) return; event.preventDefault(); setDropActive(true); }}
            onDragLeave={(event) => { if (!previewMode && event.currentTarget === event.target) setDropActive(false); }}
            onDragOver={(event) => { if (previewMode) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDrop={(event) => { if (previewMode) return; event.preventDefault(); void handleDroppedFiles(event.dataTransfer.files); }}
          >
            {exportRendering ? <div className="grid min-h-0 flex-1 place-items-center text-xs text-muted">Rendering export…</div> : previewMode ? <ProjectPreview
              assets={snapshot.project.assets}
              documents={snapshot.project.documents}
              onMoveDocument={(documentId, direction) => run(() => {
                const index = store.getSnapshot().project.documents.findIndex((document) => document.id === documentId);
                store.reorderCurrentDocuments([documentId], index + direction);
              })}
              onOpenDocument={(documentId) => { store.setActiveDocument(documentId); setPreviewMode(false); }}
              onReorderDocument={(documentId, targetIndex) => run(() => {
                const sourceIndex = store.getSnapshot().project.documents.findIndex((document) => document.id === documentId);
                store.reorderCurrentDocuments([documentId], sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
              })}
              projectSlug={project.slug}
            /> : <EditorCanvas
              assets={snapshot.project.assets}
              document={activeDocument}
              fitRequest={`${activeDocument.id}:${fitRequest}`}
              onClearSelection={() => store.setSelection([])}
              onFitZoom={fitZoom}
              onGestureStart={(label) => { commitInspectorTransaction(); store.beginTransaction(label); }}
              onMoveEnd={(elementId, x, y) => run(() => {
                const currentSnapshot = store.getSnapshot();
                const currentDocument = selectActiveDocument(currentSnapshot.project, currentSnapshot.activeDocumentId);
                const current = currentDocument.elements.find((element) => element.id === elementId);
                if (!current) return;
                const dx = x - current.x;
                const dy = y - current.y;
                if (!currentSnapshot.selectedElementIds.includes(elementId)) store.setSelection([elementId]);
                store.moveSelection({ x: dx, y: dy });
                store.commitTransaction();
              })}
              onSelect={(elementId, additive) => store.toggleSelection(elementId, additive)}
              onTransformEnd={(transforms) => run(() => {
                store.updateElements(transforms.map((transform) => ({ id: transform.id, patch: transform })));
                store.commitTransaction();
              })}
              projectSlug={project.slug}
              selectedElementIds={snapshot.selectedElementIds}
              zoom={snapshot.zoom}
            />}
            {dropActive ? <div className="pointer-events-none absolute inset-4 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent/[0.12] text-sm font-semibold text-accent-soft">Drop images to upload and place them</div> : null}
          </div>
        </main>
        {!previewMode ? <aside className="flex min-h-0 w-[312px] shrink-0 flex-col border-l border-white/[0.08] bg-[#171717]">
          <Inspector document={activeDocument} onUpdateDocument={(patch) => queueInspectorChange("Edit document", () => store.updateCurrentDocument(patch))} onUpdateElement={(elementId, patch) => queueInspectorChange("Edit element", () => store.updateElement(elementId, patch))} onUpdateElements={(updates) => queueInspectorChange("Edit selection", () => store.updateElements(updates))} selectedElements={selectedElements} />
        </aside> : null}
      </div>

      <Dialog footer={<><Button onClick={() => setAddOpen(false)} variant="ghost">Cancel</Button><Button form="add-document" type="submit" variant="primary">Add document</Button></>} onOpenChange={setAddOpen} open={addOpen} title="New document">
        <form className="space-y-3" id="add-document" onSubmit={submitAddDocument}>
          <label className="block text-xs font-medium text-muted" htmlFor="new-document-preset">Preset</label>
          <select className="plinth-focus-ring h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-ink outline-none focus:border-accent/70" id="new-document-preset" onChange={(event) => setAddPreset(event.target.value as DocumentPreset)} value={addPreset}>{APP_STORE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Custom size</option></select>
          {addPreset === "custom" ? <div className="grid grid-cols-2 gap-2 pt-2"><label className="block space-y-1 text-xs font-medium text-muted" htmlFor="new-document-width"><span>Width</span><Input id="new-document-width" max={100000} min={1} onChange={(event) => setAddWidth(event.target.value)} type="number" value={addWidth} /></label><label className="block space-y-1 text-xs font-medium text-muted" htmlFor="new-document-height"><span>Height</span><Input id="new-document-height" max={100000} min={1} onChange={(event) => setAddHeight(event.target.value)} type="number" value={addHeight} /></label></div> : null}
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="new-document-name">Name</label>
          <Input id="new-document-name" onChange={(event) => setAddName(event.target.value)} placeholder="Product launch" value={addName} />
        </form>
      </Dialog>

      <Dialog footer={<><Button onClick={() => setRenameOpen(false)} variant="ghost">Cancel</Button><Button disabled={busy || !renameName.trim()} form="rename-project" type="submit" variant="primary">{busy ? "Saving…" : "Save changes"}</Button></>} onOpenChange={setRenameOpen} open={renameOpen} title="Edit project">
        <form className="space-y-3" id="rename-project" onSubmit={(event) => void submitRename(event)}>
          <label className="block text-xs font-medium text-muted" htmlFor="rename-project-name">Project name</label>
          <Input id="rename-project-name" onChange={(event) => setRenameName(event.target.value)} value={renameName} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="rename-project-slug">Project slug</label>
          <Input id="rename-project-slug" onChange={(event) => setRenameSlug(event.target.value)} value={renameSlug} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="edit-project-export-directory">Export folder</label>
          <Input id="edit-project-export-directory" onChange={(event) => setRenameExportDirectory(event.target.value)} placeholder="/absolute/path/to/exports" value={renameExportDirectory} />
          <p className="text-[10px] leading-4 text-muted">Folder exports create timestamped directories inside this existing absolute path.</p>
        </form>
      </Dialog>

      <AssetLibrary
        assets={snapshot.project.assets}
        onAddImage={addImage}
        onDeleteAsset={deleteAsset}
        onOpenChange={setAssetLibraryOpen}
        onPlaceInDevice={placeAssetInDevice}
        onUploadFiles={uploadFiles}
        open={assetLibraryOpen}
        projectSlug={project.slug}
        uploadStates={uploadStates}
        usageCounts={selectAssetReferences(snapshot.project)}
      />
      <ExportDialog
        activeDocumentId={snapshot.activeDocumentId}
        onBeforeExport={flushPendingSave}
        onError={setLocalError}
        onExportDirectoryChange={(directory) => run(() => {
          const current = store.getSnapshot().project;
          if (current.settings.exportDirectory === directory) return;
          store.apply("Configure export folder", (value) => ({
            ...value,
            settings: { ...value.settings, exportDirectory: directory },
            updatedAt: nowIso(),
          }));
        })}
        onOpenChange={setExportOpen}
        onRenderingChange={setExportRendering}
        open={exportOpen}
        project={snapshot.project}
      />
    </div>
  );
}
