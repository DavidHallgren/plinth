import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  GripVertical,
  Image,
  Lock,
  MonitorSmartphone,
  MoreHorizontal,
  Pencil,
  RectangleHorizontal,
  Trash2,
  Type,
  Unlock,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetMetadata, Document, SceneElement } from "../../lib/schema";
import { selectSortedLayers } from "../../scene/selectors";
import { DocumentThumbnail } from "../editor/document-thumbnail";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type DocumentNavigatorProps = {
  documents: Document[];
  assets: readonly AssetMetadata[];
  projectSlug: string;
  activeDocumentId: string;
  selectedElementIds: readonly string[];
  onSelectDocument: (documentId: string) => void;
  onAddDocument: () => void;
  onMoveDocument: (documentId: string, direction: -1 | 1) => void;
  onDuplicateDocument: (documentId: string) => void;
  onDeleteDocument: (documentId: string) => void;
  onReorderDocument: (documentId: string, targetIndex: number) => void;
  onSelectElement: (elementId: string, additive: boolean) => void;
  onRenameElement: (elementId: string, name: string) => void;
  onToggleVisible: (element: SceneElement) => void;
  onToggleLocked: (element: SceneElement) => void;
  onDuplicateElement: (elementId: string) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveElement: (elementId: string, direction: -1 | 1) => void;
  onReorderElement: (elementId: string, targetIndex: number) => void;
  previewMode: boolean;
  onOpenPreview: () => void;
};

export function DocumentNavigator({
  documents,
  assets,
  projectSlug,
  activeDocumentId,
  selectedElementIds,
  onSelectDocument,
  onAddDocument,
  onMoveDocument,
  onDuplicateDocument,
  onDeleteDocument,
  onReorderDocument,
  onSelectElement,
  onRenameElement,
  onToggleVisible,
  onToggleLocked,
  onDuplicateElement,
  onDeleteElement,
  onMoveElement,
  onReorderElement,
  previewMode,
  onOpenPreview,
}: DocumentNavigatorProps) {
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? documents[0];
  const layerStack = activeDocument ? [...selectSortedLayers(activeDocument)].reverse() : [];
  const [documentsOpen, setDocumentsOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);

  return (
    <aside className="flex min-h-0 w-[256px] shrink-0 flex-col border-r border-white/[0.08] bg-[#171717]">
      <section className="border-b border-white/[0.08] p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setDocumentsOpen((open) => !open)} type="button">
            {documentsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Documents
          </button>
          <div className="flex items-center gap-0.5">
            <Button aria-label="Preview all documents" onClick={onOpenPreview} size="icon" variant={previewMode ? "secondary" : "ghost"}><Columns3 size={15} /></Button>
            <Button aria-label="Add document" onClick={onAddDocument} size="icon" variant="ghost"><FilePlus2 size={15} /></Button>
          </div>
        </div>
        {documentsOpen ? (
          <div className="mt-2 space-y-1">
            {documents.map((document, index) => (
              <DocumentRow
                allDocuments={documents}
                assets={assets}
                document={document}
                index={index}
                key={document.id}
                onDelete={onDeleteDocument}
                onDuplicate={onDuplicateDocument}
                onMove={onMoveDocument}
                onReorder={onReorderDocument}
                onSelect={onSelectDocument}
                projectSlug={projectSlug}
                selected={document.id === activeDocument?.id}
              />
            ))}
          </div>
        ) : null}
      </section>

      {!previewMode ? <section className="min-h-0 flex-1 overflow-auto p-3">
        <button className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setLayersOpen((open) => !open)} type="button">
          {layersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Layers
          <span className="ml-auto normal-case tracking-normal text-[10px] text-muted/60">{activeDocument?.elements.length ?? 0}</span>
        </button>
        {layersOpen && activeDocument ? (
          <div className="mt-2 space-y-0.5">
            {layerStack.map((element, index, all) => (
              <LayerRow
                allLayers={all}
                element={element}
                index={index}
                key={element.id}
                onDelete={onDeleteElement}
                onDuplicate={onDuplicateElement}
                onMove={onMoveElement}
                onReorder={onReorderElement}
                onRename={onRenameElement}
                onSelect={onSelectElement}
                onToggleLocked={onToggleLocked}
                onToggleVisible={onToggleVisible}
                selected={selectedElementIds.includes(element.id)}
              />
            ))}
            {activeDocument.elements.length === 0 ? <p className="px-2 py-8 text-center text-xs text-muted">Add text or a shape to begin.</p> : null}
          </div>
        ) : null}
      </section> : null}
    </aside>
  );
}

type DocumentRowProps = {
  document: Document;
  selected: boolean;
  index: number;
  allDocuments: Document[];
  assets: readonly AssetMetadata[];
  projectSlug: string;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (id: string, targetIndex: number) => void;
};

function DocumentRow({ document: documentItem, selected, index, allDocuments, assets, projectSlug, onSelect, onDuplicate, onDelete, onMove, onReorder }: DocumentRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsPosition, setActionsPosition] = useState({ left: 0, top: 0 });
  const rowRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const hideActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActionsPosition = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    setActionsPosition({
      left: bounds.right + 4,
      top: Math.max(24, Math.min(window.innerHeight - 24, bounds.top + bounds.height / 2)),
    });
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    updateActionsPosition();
    window.addEventListener("resize", updateActionsPosition);
    window.addEventListener("scroll", updateActionsPosition, true);
    return () => {
      window.removeEventListener("resize", updateActionsPosition);
      window.removeEventListener("scroll", updateActionsPosition, true);
    };
  }, [actionsOpen, updateActionsPosition]);

  useEffect(() => () => {
    if (hideActionsTimerRef.current) clearTimeout(hideActionsTimerRef.current);
  }, []);

  function showActions() {
    if (hideActionsTimerRef.current) {
      clearTimeout(hideActionsTimerRef.current);
      hideActionsTimerRef.current = null;
    }
    updateActionsPosition();
    setActionsOpen(true);
  }

  function hideActions() {
    if (hideActionsTimerRef.current) clearTimeout(hideActionsTimerRef.current);
    hideActionsTimerRef.current = setTimeout(() => {
      hideActionsTimerRef.current = null;
      const focused = globalThis.document.activeElement;
      if (focused && (rowRef.current?.contains(focused) || actionsRef.current?.contains(focused))) return;
      setActionsOpen(false);
    }, 80);
  }

  return (
    <div
      className={`group relative flex h-10 items-center gap-1 rounded-lg px-1 py-1 ${selected ? "bg-accent/[0.12]" : "hover:bg-white/[0.04]"}`}
      draggable
      onBlurCapture={hideActions}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-plinth-document", documentItem.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData("application/x-plinth-document");
        if (draggedId && draggedId !== documentItem.id) onReorder(draggedId, index);
      }}
      onFocusCapture={showActions}
      onMouseEnter={showActions}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Node && actionsRef.current?.contains(event.relatedTarget)) return;
        hideActions();
      }}
      ref={rowRef}
    >
      <button className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left" onClick={() => onSelect(documentItem.id)} type="button">
        <span className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border ${selected ? "border-accent/30 bg-accent/15" : "border-white/10 bg-black/15"}`}>
          <DocumentThumbnail assets={assets} document={documentItem} projectSlug={projectSlug} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-xs font-medium ${selected ? "text-accent-soft" : "text-ink/80"}`}>{documentItem.name}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted">{documentItem.width} × {documentItem.height}</span>
        </span>
      </button>
      {actionsOpen ? createPortal(
        <div
          className="fixed z-50 flex -translate-y-1/2 items-center rounded-md border border-white/10 bg-[#202020] p-0.5 shadow-lg shadow-black/30"
          onMouseEnter={showActions}
          onMouseLeave={hideActions}
          ref={actionsRef}
          style={actionsPosition}
        >
          <Button aria-label={`Move ${documentItem.name} up`} disabled={index === 0} onClick={() => onMove(documentItem.id, -1)} size="icon" variant="ghost"><ArrowUp size={11} /></Button>
          <Button aria-label={`Move ${documentItem.name} down`} disabled={index === allDocuments.length - 1} onClick={() => onMove(documentItem.id, 1)} size="icon" variant="ghost"><ArrowDown size={11} /></Button>
          <details className="relative">
            <summary aria-label={`More actions for ${documentItem.name}`} className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary>
            <div className="absolute right-0 top-8 z-20 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl shadow-black/40">
              <MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(documentItem.id)} />
              <MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(documentItem.id)} />
            </div>
          </details>
        </div>,
        globalThis.document.body,
      ) : null}
    </div>
  );
}

type LayerRowProps = {
  element: SceneElement;
  selected: boolean;
  index: number;
  allLayers: SceneElement[];
  onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisible: (element: SceneElement) => void;
  onToggleLocked: (element: SceneElement) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (id: string, targetIndex: number) => void;
};

function LayerRow({ element, selected, index, allLayers, onSelect, onRename, onToggleVisible, onToggleLocked, onDuplicate, onDelete, onMove, onReorder }: LayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(element.name);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsPosition, setActionsPosition] = useState({ left: 0, top: 0 });
  const rowRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const hideActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActionsPosition = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    setActionsPosition({
      left: bounds.right + 4,
      top: Math.max(24, Math.min(window.innerHeight - 24, bounds.top + bounds.height / 2)),
    });
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    updateActionsPosition();
    window.addEventListener("resize", updateActionsPosition);
    window.addEventListener("scroll", updateActionsPosition, true);
    return () => {
      window.removeEventListener("resize", updateActionsPosition);
      window.removeEventListener("scroll", updateActionsPosition, true);
    };
  }, [actionsOpen, updateActionsPosition]);

  useEffect(() => () => {
    if (hideActionsTimerRef.current) clearTimeout(hideActionsTimerRef.current);
  }, []);

  function showActions() {
    if (hideActionsTimerRef.current) {
      clearTimeout(hideActionsTimerRef.current);
      hideActionsTimerRef.current = null;
    }
    updateActionsPosition();
    setActionsOpen(true);
  }

  function hideActions() {
    if (hideActionsTimerRef.current) clearTimeout(hideActionsTimerRef.current);
    hideActionsTimerRef.current = setTimeout(() => {
      hideActionsTimerRef.current = null;
      const focused = document.activeElement;
      if (focused && (rowRef.current?.contains(focused) || actionsRef.current?.contains(focused))) return;
      setActionsOpen(false);
    }, 80);
  }

  function commitName() {
    const name = draftName.trim();
    if (name && name !== element.name) onRename(element.id, name);
    setEditing(false);
  }

  return (
    <div
      className={`group relative flex items-center gap-1 rounded-md border px-1 py-1 ${selected ? "border-accent/30 bg-accent/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`}
      draggable
      onBlurCapture={hideActions}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-plinth-layer", element.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData("application/x-plinth-layer");
        // The panel is front-to-back while scene operations are back-to-front.
        // Dropping before a visible row therefore targets the boundary after it
        // in ascending z-order.
        if (draggedId && draggedId !== element.id) onReorder(draggedId, allLayers.length - index);
      }}
      onFocusCapture={showActions}
      onMouseEnter={showActions}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Node && actionsRef.current?.contains(event.relatedTarget)) return;
        hideActions();
      }}
      ref={rowRef}
    >
      <button aria-label={`Select ${element.name}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={(event) => onSelect(element.id, event.shiftKey)} onDoubleClick={() => { setDraftName(element.name); setEditing(true); }} type="button">
        <GripVertical className="shrink-0 text-muted/40" size={13} />
        <ElementTypeIcon element={element} />
        {editing ? <Input autoFocus className="h-6 min-w-0 rounded-md px-1.5 text-[11px]" onBlur={commitName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitName(); if (event.key === "Escape") setEditing(false); }} value={draftName} /> : <span className={`truncate text-[11px] ${element.visible ? "text-ink/85" : "text-muted/50 line-through"}`}>{element.name}</span>}
      </button>
      {actionsOpen ? createPortal(
        <div
          className="fixed z-50 flex -translate-y-1/2 items-center rounded-md border border-white/10 bg-[#202020] p-0.5 shadow-lg shadow-black/30"
          onMouseEnter={showActions}
          onMouseLeave={hideActions}
          ref={actionsRef}
          style={actionsPosition}
        >
          <Button aria-label={`Move ${element.name} up`} disabled={index === 0} onClick={() => onMove(element.id, 1)} size="icon" variant="ghost"><ArrowUp size={11} /></Button>
          <Button aria-label={`Move ${element.name} down`} disabled={index === allLayers.length - 1} onClick={() => onMove(element.id, -1)} size="icon" variant="ghost"><ArrowDown size={11} /></Button>
          <Button aria-label={element.visible ? `Hide ${element.name}` : `Show ${element.name}`} onClick={() => onToggleVisible(element)} size="icon" variant="ghost">{element.visible ? <Eye size={12} /> : <EyeOff size={12} />}</Button>
          <Button aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`} onClick={() => onToggleLocked(element)} size="icon" variant="ghost">{element.locked ? <Lock size={12} /> : <Unlock size={12} />}</Button>
          <details className="relative">
            <summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary>
            <div className="absolute right-0 top-8 z-20 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl shadow-black/40">
              <MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => { setDraftName(element.name); setEditing(true); }} />
              <MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(element.id)} />
              <MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(element.id)} />
            </div>
          </details>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function MenuAction({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${danger ? "text-red-200 hover:bg-red-400/10" : "text-muted hover:bg-white/[0.07] hover:text-ink"}`} onClick={onClick} type="button">{icon}{label}</button>;
}

function ElementTypeIcon({ element }: { element: SceneElement }) {
  if (element.type === "text") return <Type className="shrink-0 text-accent-soft" size={13} />;
  if (element.type === "image") return <Image className="shrink-0 text-accent-soft" size={13} />;
  if (element.type === "device") return <MonitorSmartphone className="shrink-0 text-accent-soft" size={13} />;
  if (element.shape === "ellipse") return <RectangleHorizontal className="shrink-0 rounded-full text-accent-soft" size={13} />;
  return <RectangleHorizontal className="shrink-0 text-accent-soft" size={13} />;
}
