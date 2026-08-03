import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DocumentPreset, Project, ShapeElement, TextElement } from "../../lib/schema";
import { createId } from "../../lib/ids";
import { EditorStore } from "../../app/editor-store";
import { selectActiveDocument, selectSelectedElements } from "../../scene/selectors";
import { addElement } from "../../scene/operations";
import type { AutosaveState } from "../../hooks/use-autosave";
import { EditorCanvas } from "../../canvas/editor-canvas";
import { DocumentNavigator } from "../sidebar/document-navigator";
import { EditorToolbar } from "../toolbar/editor-toolbar";
import { DocumentStrip } from "./document-strip";
import { Inspector } from "./inspector";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { APP_STORE_PRESETS } from "../../scene/presets";

type EditorWorkspaceProps = {
  project: Project;
  dirty: boolean;
  saveState: AutosaveState;
  error: string | null;
  onProjectChange: (project: Project) => void;
  onSaveNow: () => Promise<void>;
  onBack: () => void;
  onRenameProject: (name: string, slug?: string) => Promise<void>;
  onDeleteProject: () => Promise<void>;
};

export function EditorWorkspace({ project, dirty, saveState, error, onProjectChange, onSaveNow, onBack, onRenameProject, onDeleteProject }: EditorWorkspaceProps) {
  const storeRef = useRef<EditorStore | null>(null);
  if (!storeRef.current || storeRef.current.history.project.id !== project.id) {
    storeRef.current = new EditorStore(project, onProjectChange);
  }
  const store = storeRef.current;
  store.setCommitHandler(onProjectChange);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [fitRequest, setFitRequest] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [addPreset, setAddPreset] = useState<DocumentPreset>(APP_STORE_PRESETS[0]?.id ?? "custom");
  const [addName, setAddName] = useState("");
  const [addWidth, setAddWidth] = useState("1320");
  const [addHeight, setAddHeight] = useState("2868");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [renameSlug, setRenameSlug] = useState(project.slug);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    store.replaceProject(project);
  }, [project, store]);

  useEffect(() => {
    setRenameName(project.name);
    setRenameSlug(project.slug);
  }, [project.name, project.slug]);

  const activeDocument = selectActiveDocument(snapshot.project, snapshot.activeDocumentId);
  const selectedElements = selectSelectedElements(activeDocument, snapshot.selectedElementIds);
  const reportError = useCallback((reason: unknown) => {
    setLocalError(reason instanceof Error ? reason.message : "The editor could not apply that change.");
  }, []);
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
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
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
  }, [run, store]);

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
      fill: "#9d8cff",
      stroke: "#c4baff",
      strokeWidth: shape === "line" ? 4 : 1,
      radius: shape === "rounded-rectangle" ? 28 : 0,
    };
    run(() => {
      store.apply("Add shape", (current) => addElement(current, activeDocument.id, element));
      store.setSelection([element.id]);
    });
  }

  function submitAddDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => {
      const width = Math.min(100000, Math.max(1, Math.round(Number(addWidth) || 1320)));
      const height = Math.min(100000, Math.max(1, Math.round(Number(addHeight) || 2868)));
      store.addDocument(addPreset, { name: addName.trim() || undefined, ...(addPreset === "custom" ? { width, height } : {}) });
      const added = store.history.project.documents[store.history.project.documents.length - 1];
      if (added) store.setActiveDocument(added.id);
      setAddOpen(false);
      setAddName("");
      setAddWidth("1320");
      setAddHeight("2868");
    });
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameName.trim()) return;
    setBusy(true);
    setLocalError(null);
    try {
      await onRenameProject(renameName.trim(), renameSlug.trim() || undefined);
      setRenameOpen(false);
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!window.confirm(`Delete “${project.name}”? This removes its local project directory.`)) return;
    setBusy(true);
    try {
      await onDeleteProject();
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  function deleteDocument() {
    if (snapshot.project.documents.length <= 1) {
      setLocalError("A project must keep at least one document.");
      return;
    }
    if (!window.confirm(`Delete “${activeDocument.name}”?`)) return;
    run(() => store.removeCurrentDocument());
  }

  const visibleError = localError ?? error;

  return (
    <div className="flex h-screen min-h-[620px] min-w-[960px] flex-col overflow-hidden bg-[#0c0e13]">
      <EditorToolbar
        canRedo={snapshot.canRedo}
        canUndo={snapshot.canUndo}
        dirty={dirty}
        document={activeDocument}
        onAddShape={addShape}
        onAddText={addText}
        onBack={onBack}
        onDeleteDocument={deleteDocument}
        onDeleteProject={() => void deleteProject()}
        onDuplicateDocument={() => run(() => store.duplicateCurrentDocument())}
        onFit={() => setFitRequest((value) => value + 1)}
        onRedo={() => run(() => store.redo())}
        onRenameProject={() => setRenameOpen(true)}
        onSaveNow={() => void onSaveNow().catch(reportError)}
        onUndo={() => run(() => store.undo())}
        onZoomChange={(zoom) => store.setZoom(zoom)}
        saveState={saveState}
        projectName={project.name}
        zoom={snapshot.zoom}
      />
      {visibleError ? <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-300/20 bg-red-400/[0.08] px-4 py-2 text-xs text-red-100" role="alert"><span>{visibleError}</span><button className="text-red-100/70 hover:text-red-50" onClick={() => setLocalError(null)} type="button">Dismiss</button></div> : null}
      <div className="flex min-h-0 flex-1">
        <DocumentNavigator
          activeDocumentId={snapshot.activeDocumentId}
          documents={snapshot.project.documents}
          onAddDocument={() => setAddOpen(true)}
          onDeleteElement={(elementId) => run(() => { store.setSelection([elementId]); store.deleteSelection(); })}
          onDuplicateElement={(elementId) => run(() => store.duplicateElement(elementId))}
          onMoveDocument={(documentId, direction) => run(() => {
            const index = snapshot.project.documents.findIndex((document) => document.id === documentId);
            store.reorderCurrentDocuments([documentId], index + direction);
          })}
          onMoveElement={(elementId, direction) => run(() => store.reorderElementByDirection(elementId, direction))}
          onRenameElement={(elementId, name) => run(() => store.updateElement(elementId, { name }))}
          onSelectDocument={(documentId) => store.setActiveDocument(documentId)}
          onSelectElement={(elementId, additive) => store.toggleSelection(elementId, additive)}
          onToggleLocked={(element) => run(() => store.updateElement(element.id, { locked: !element.locked }))}
          onToggleVisible={(element) => run(() => store.updateElement(element.id, { visible: !element.visible }))}
          selectedElementIds={snapshot.selectedElementIds}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorCanvas
            document={activeDocument}
            fitRequest={fitRequest}
            onClearSelection={() => store.setSelection([])}
            onFitZoom={fitZoom}
            onGestureStart={store.beginTransaction.bind(store)}
            onMoveEnd={(elementId, x, y) => run(() => {
              const current = activeDocument.elements.find((element) => element.id === elementId);
              if (!current) return;
              const dx = x - current.x;
              const dy = y - current.y;
              if (!snapshot.selectedElementIds.includes(elementId)) store.setSelection([elementId]);
              store.moveSelection({ x: dx, y: dy });
              store.commitTransaction();
            })}
            onSelect={(elementId, additive) => store.toggleSelection(elementId, additive)}
            onTransformEnd={(transforms) => run(() => {
              store.updateElements(transforms.map((transform) => ({ id: transform.id, patch: transform })));
              store.commitTransaction();
            })}
            selectedElementIds={snapshot.selectedElementIds}
            zoom={snapshot.zoom}
          />
          <DocumentStrip activeDocumentId={snapshot.activeDocumentId} documents={snapshot.project.documents} onAdd={() => setAddOpen(true)} onSelect={(documentId) => store.setActiveDocument(documentId)} />
        </main>
        <aside className="hidden min-h-0 w-[312px] shrink-0 flex-col border-l border-white/[0.08] bg-[#12151c] xl:flex">
          <div className="flex h-11 shrink-0 items-center border-b border-white/[0.08] px-3"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Inspector</p></div>
          <Inspector document={activeDocument} onUpdateDocument={(patch) => run(() => store.updateCurrentDocument(patch))} onUpdateElement={(elementId, patch) => run(() => store.updateElement(elementId, patch))} onUpdateElements={(updates) => run(() => store.updateElements(updates))} selectedElements={selectedElements} />
        </aside>
      </div>

      <Dialog description="Choose an App Store screenshot size or start with a custom frame." footer={<><Button onClick={() => setAddOpen(false)} variant="ghost">Cancel</Button><Button form="add-document" type="submit" variant="primary">Add document</Button></>} onOpenChange={setAddOpen} open={addOpen} title="New document">
        <form className="space-y-3" id="add-document" onSubmit={submitAddDocument}>
          <label className="block text-xs font-medium text-muted" htmlFor="new-document-preset">Preset</label>
          <select className="plinth-focus-ring h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-ink outline-none focus:border-violet/70" id="new-document-preset" onChange={(event) => setAddPreset(event.target.value as DocumentPreset)} value={addPreset}>{APP_STORE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Custom size</option></select>
          {addPreset === "custom" ? <div className="grid grid-cols-2 gap-2 pt-2"><label className="block space-y-1 text-xs font-medium text-muted" htmlFor="new-document-width"><span>Width</span><Input id="new-document-width" max={100000} min={1} onChange={(event) => setAddWidth(event.target.value)} type="number" value={addWidth} /></label><label className="block space-y-1 text-xs font-medium text-muted" htmlFor="new-document-height"><span>Height</span><Input id="new-document-height" max={100000} min={1} onChange={(event) => setAddHeight(event.target.value)} type="number" value={addHeight} /></label></div> : null}
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="new-document-name">Name</label>
          <Input id="new-document-name" onChange={(event) => setAddName(event.target.value)} placeholder="Product launch" value={addName} />
        </form>
      </Dialog>

      <Dialog description="Update the project display name and export-safe slug." footer={<><Button onClick={() => setRenameOpen(false)} variant="ghost">Cancel</Button><Button disabled={busy || !renameName.trim()} form="rename-project" type="submit" variant="primary">{busy ? "Saving…" : "Save changes"}</Button></>} onOpenChange={setRenameOpen} open={renameOpen} title="Rename project">
        <form className="space-y-3" id="rename-project" onSubmit={(event) => void submitRename(event)}>
          <label className="block text-xs font-medium text-muted" htmlFor="rename-project-name">Project name</label>
          <Input id="rename-project-name" onChange={(event) => setRenameName(event.target.value)} value={renameName} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="rename-project-slug">Project slug</label>
          <Input id="rename-project-slug" onChange={(event) => setRenameSlug(event.target.value)} value={renameSlug} />
        </form>
      </Dialog>
    </div>
  );
}
