import {
  ChevronDown,
  ChevronRight,
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
import { useState } from "react";
import type { Document, SceneElement } from "../../lib/schema";
import { selectSortedLayers } from "../../scene/selectors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type DocumentNavigatorProps = {
  documents: Document[];
  activeDocumentId: string;
  selectedElementIds: readonly string[];
  onSelectDocument: (documentId: string) => void;
  onAddDocument: () => void;
  onMoveDocument: (documentId: string, direction: -1 | 1) => void;
  onSelectElement: (elementId: string, additive: boolean) => void;
  onRenameElement: (elementId: string, name: string) => void;
  onToggleVisible: (element: SceneElement) => void;
  onToggleLocked: (element: SceneElement) => void;
  onDuplicateElement: (elementId: string) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveElement: (elementId: string, direction: -1 | 1) => void;
};

export function DocumentNavigator({
  documents,
  activeDocumentId,
  selectedElementIds,
  onSelectDocument,
  onAddDocument,
  onMoveDocument,
  onSelectElement,
  onRenameElement,
  onToggleVisible,
  onToggleLocked,
  onDuplicateElement,
  onDeleteElement,
  onMoveElement,
}: DocumentNavigatorProps) {
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? documents[0];
  const [documentsOpen, setDocumentsOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);

  return (
    <aside className="flex min-h-0 w-[248px] shrink-0 flex-col border-r border-white/[0.08] bg-[#12151c]">
      <section className="border-b border-white/[0.08] p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setDocumentsOpen((open) => !open)} type="button">
            {documentsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Documents
          </button>
          <Button aria-label="Add document" onClick={onAddDocument} size="icon" variant="ghost"><FilePlus2 size={15} /></Button>
        </div>
        {documentsOpen ? (
          <div className="mt-2 space-y-1">
            {documents.map((document, index) => (
              <div className={`group flex items-center gap-1 rounded-lg px-1 py-1 ${document.id === activeDocument?.id ? "bg-violet/[0.12]" : "hover:bg-white/[0.04]"}`} key={document.id}>
                <button className="min-w-0 flex-1 px-1.5 py-1 text-left" onClick={() => onSelectDocument(document.id)} type="button">
                  <p className={`truncate text-xs font-medium ${document.id === activeDocument?.id ? "text-violet-soft" : "text-ink/80"}`}>{document.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">{document.width} × {document.height}</p>
                </button>
                <div className="hidden items-center gap-0.5 group-hover:flex">
                  <Button aria-label={`Move ${document.name} up`} disabled={index === 0} onClick={() => onMoveDocument(document.id, -1)} size="icon" variant="ghost"><ArrowUp size={11} /></Button>
                  <Button aria-label={`Move ${document.name} down`} disabled={index === documents.length - 1} onClick={() => onMoveDocument(document.id, 1)} size="icon" variant="ghost"><ArrowDown size={11} /></Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-3">
        <button className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setLayersOpen((open) => !open)} type="button">
          {layersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Layers
          <span className="ml-auto normal-case tracking-normal text-[10px] text-muted/60">{activeDocument?.elements.length ?? 0}</span>
        </button>
        {layersOpen && activeDocument ? (
          <div className="mt-2 space-y-0.5">
            {selectSortedLayers(activeDocument).map((element, index, all) => (
              <LayerRow
                allLayers={all}
                element={element}
                index={index}
                key={element.id}
                onDelete={onDeleteElement}
                onDuplicate={onDuplicateElement}
                onMove={onMoveElement}
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
      </section>
      <div className="border-t border-white/[0.08] px-3 py-2 text-[10px] text-muted/70">Drag gestures are saved as one history entry.</div>
    </aside>
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
};

function LayerRow({ element, selected, index, allLayers, onSelect, onRename, onToggleVisible, onToggleLocked, onDuplicate, onDelete, onMove }: LayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(element.name);

  function commitName() {
    const name = draftName.trim();
    if (name && name !== element.name) onRename(element.id, name);
    setEditing(false);
  }

  return (
    <div className={`group flex items-center gap-1 rounded-md border px-1 py-1 ${selected ? "border-violet/30 bg-violet/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`}>
      <button aria-label={`Select ${element.name}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={(event) => onSelect(element.id, event.shiftKey)} onDoubleClick={() => { setDraftName(element.name); setEditing(true); }} type="button">
        <GripVertical className="shrink-0 text-muted/40" size={13} />
        <ElementTypeIcon element={element} />
        {editing ? <Input autoFocus className="h-6 min-w-0 rounded-md px-1.5 text-[11px]" onBlur={commitName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitName(); if (event.key === "Escape") setEditing(false); }} value={draftName} /> : <span className={`truncate text-[11px] ${element.visible ? "text-ink/85" : "text-muted/50 line-through"}`}>{element.name}</span>}
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button aria-label={`Move ${element.name} up`} disabled={index === allLayers.length - 1} onClick={() => onMove(element.id, 1)} size="icon" variant="ghost"><ArrowUp size={11} /></Button>
        <Button aria-label={`Move ${element.name} down`} disabled={index === 0} onClick={() => onMove(element.id, -1)} size="icon" variant="ghost"><ArrowDown size={11} /></Button>
        <Button aria-label={element.visible ? `Hide ${element.name}` : `Show ${element.name}`} onClick={() => onToggleVisible(element)} size="icon" variant="ghost">{element.visible ? <Eye size={12} /> : <EyeOff size={12} />}</Button>
        <Button aria-label={element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`} onClick={() => onToggleLocked(element)} size="icon" variant="ghost">{element.locked ? <Lock size={12} /> : <Unlock size={12} />}</Button>
        <details className="relative">
          <summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary>
          <div className="absolute right-0 top-8 z-20 w-32 rounded-lg border border-white/10 bg-[#191c25] p-1 shadow-xl shadow-black/40">
            <MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => { setDraftName(element.name); setEditing(true); }} />
            <MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(element.id)} />
            <MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(element.id)} />
          </div>
        </details>
      </div>
    </div>
  );
}

function MenuAction({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${danger ? "text-red-200 hover:bg-red-400/10" : "text-muted hover:bg-white/[0.07] hover:text-ink"}`} onClick={onClick} type="button">{icon}{label}</button>;
}

function ElementTypeIcon({ element }: { element: SceneElement }) {
  if (element.type === "text") return <Type className="shrink-0 text-violet-soft" size={13} />;
  if (element.type === "image") return <Image className="shrink-0 text-sky-300" size={13} />;
  if (element.type === "device") return <MonitorSmartphone className="shrink-0 text-emerald-300" size={13} />;
  if (element.shape === "ellipse") return <RectangleHorizontal className="shrink-0 rounded-full text-amber-200" size={13} />;
  return <RectangleHorizontal className="shrink-0 text-amber-200" size={13} />;
}
