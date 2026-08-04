import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  GripVertical,
  Image,
  Link2,
  Lock,
  MonitorSmartphone,
  MoreHorizontal,
  Pencil,
  Plus,
  RectangleHorizontal,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import type { AssetMetadata, Deck, Project, SceneElement } from "../../lib/schema";
import { resolveDeckScreen } from "../../scene/overflow";
import { ScreenThumbnail } from "../editor/screen-thumbnail";
import { Button } from "../ui/button";

type ScreenNavigatorProps = {
  project: Project;
  activeDeckId: string;
  activeScreenId: string;
  selectedElementIds: readonly string[];
  assets: readonly AssetMetadata[];
  onSelectDeck: (deckId: string) => void;
  onAddDeck: () => void;
  onEditDeck: (deckId: string) => void;
  onDuplicateDeck: (deckId: string) => void;
  onDeleteDeck: (deckId: string) => void;
  onMoveDeck: (deckId: string, direction: -1 | 1) => void;
  onSelectScreen: (screenId: string) => void;
  onAddScreen: () => void;
  onDuplicateScreen: (screenId: string) => void;
  onDeleteScreen: (screenId: string) => void;
  onMoveScreen: (screenId: string, direction: -1 | 1) => void;
  onReorderScreen: (screenId: string, targetIndex: number) => void;
  onSelectLayer: (elementId: string, additive: boolean) => void;
  onRenameElement: (elementId: string, name: string) => void;
  onToggleVisible: (element: SceneElement) => void;
  onToggleLocked: (element: SceneElement) => void;
  onDuplicateElement: (elementId: string) => void;
  onDeleteElement: (elementId: string) => void;
  onMoveLayer: (elementId: string, direction: -1 | 1) => void;
  onReorderLayer: (elementId: string, targetIndex: number) => void;
  onGoToOwner: (ownerScreenId: string, elementId: string) => void;
};

type DropEdge = "before" | "after";
const SCREEN_DRAG_TYPE = "application/x-plinth-screen";
const LAYER_DRAG_TYPE = "application/x-plinth-layer";

export function ScreenNavigator({ project, activeDeckId, activeScreenId, selectedElementIds, assets, onSelectDeck, onAddDeck, onEditDeck, onDuplicateDeck, onDeleteDeck, onMoveDeck, onSelectScreen, onAddScreen, onDuplicateScreen, onDeleteScreen, onMoveScreen, onReorderScreen, onSelectLayer, onRenameElement, onToggleVisible, onToggleLocked, onDuplicateElement, onDeleteElement, onMoveLayer, onReorderLayer, onGoToOwner }: ScreenNavigatorProps) {
  const activeDeck = project.decks.find((deck) => deck.id === activeDeckId) ?? project.decks[0];
  const activeScreen = activeDeck?.screens.find((screen) => screen.id === activeScreenId) ?? activeDeck?.screens[0];
  const [decksOpen, setDecksOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const [screenDropTarget, setScreenDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null);
  const resolvedById = new Map(activeDeck && activeScreen ? resolveDeckScreen(activeDeck, activeScreen.id).map((element) => [element.id, element]) : []);

  return (
    <aside className="flex min-h-0 w-[276px] shrink-0 flex-col border-r border-white/[0.08] bg-[#171717]" onDragEnd={() => { setScreenDropTarget(null); setLayerDropTarget(null); }} onDragOver={(event) => { if (event.dataTransfer.types.includes(SCREEN_DRAG_TYPE)) setLayerDropTarget(null); if (event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) setScreenDropTarget(null); }}>
      <section className="border-b border-white/[0.08] p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setDecksOpen((open) => !open)} type="button">
            {decksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Decks
          </button>
          <Button aria-label="Add deck" onClick={onAddDeck} size="icon" tooltip="Add deck" variant="ghost"><Plus size={15} /></Button>
        </div>
        {decksOpen ? <div className="mt-2 space-y-1">{project.decks.map((deck, index) => <DeckRow deck={deck} index={index} key={deck.id} onDelete={onDeleteDeck} onDuplicate={onDuplicateDeck} onEdit={onEditDeck} onMove={onMoveDeck} onSelect={onSelectDeck} selected={deck.id === activeDeck?.id} total={project.decks.length} />)}</div> : null}
      </section>

      {activeDeck && activeScreen ? <>
        <section className="border-b border-white/[0.08] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Screens</p></div>
            <Button aria-label="Add screen" onClick={onAddScreen} size="icon" tooltip="Add screen" variant="ghost"><FilePlus2 size={15} /></Button>
          </div>
          <div className="mt-2 space-y-1">{activeDeck.screens.map((screen, index) => <ScreenRow deck={activeDeck} dropEdge={screenDropTarget?.id === screen.id ? screenDropTarget.edge : null} index={index} key={screen.id} onDelete={onDeleteScreen} onDragFinished={() => setScreenDropTarget(null)} onDropTarget={(edge) => setScreenDropTarget((current) => current?.id === screen.id && current.edge === edge ? current : { id: screen.id, edge })} onDuplicate={onDuplicateScreen} onMove={onMoveScreen} onReorder={onReorderScreen} onSelect={onSelectScreen} projectSlug={project.slug} screen={screen} selected={screen.id === activeScreen.id} total={activeDeck.screens.length} assets={assets} />)}</div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto p-3">
          <button className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setLayersOpen((open) => !open)} type="button">
            {layersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Focused layers <span className="ml-auto normal-case tracking-normal text-[10px] text-muted/60">{activeScreen.layers.length}</span>
          </button>
          {layersOpen ? <div className="mt-2 space-y-0.5">{[...activeScreen.layers].reverse().map((layer, displayIndex) => {
            const actualIndex = activeScreen.layers.length - 1 - displayIndex;
            const resolved = layer.kind === "owned" ? layer.element : resolvedById.get(layer.elementId);
            if (!resolved) return null;
            return <LayerRow actualIndex={actualIndex} dropEdge={layerDropTarget?.id === resolved.id ? layerDropTarget.edge : null} element={resolved} isLink={layer.kind === "overflow-link"} key={`${activeScreen.id}:${layer.kind}:${layer.kind === "owned" ? layer.element.id : `${layer.ownerScreenId}:${layer.elementId}`}`} linkOwner={layer.kind === "overflow-link" ? activeDeck.screens.find((screen) => screen.id === layer.ownerScreenId) : undefined} onDelete={onDeleteElement} onDragFinished={() => setLayerDropTarget(null)} onDropTarget={(edge) => setLayerDropTarget((current) => current?.id === resolved.id && current.edge === edge ? current : { id: resolved.id, edge })} onDuplicate={onDuplicateElement} onGoToOwner={onGoToOwner} onMove={onMoveLayer} onRename={onRenameElement} onReorder={onReorderLayer} onSelect={onSelectLayer} onToggleLocked={onToggleLocked} onToggleVisible={onToggleVisible} selected={selectedElementIds.includes(resolved.id)} total={activeScreen.layers.length} />;
          })}{activeScreen.layers.length === 0 ? <p className="px-2 py-8 text-center text-xs text-muted">Add text, a shape, an image, or a device to begin.</p> : null}</div> : null}
        </section>
      </> : null}
    </aside>
  );
}

function DeckRow({ deck, index, total, selected, onSelect, onEdit, onDuplicate, onDelete, onMove }: { deck: Deck; index: number; total: number; selected: boolean; onSelect: (id: string) => void; onEdit: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void }) {
  return <div className={`group rounded-lg border px-1 py-1 ${selected ? "border-accent/30 bg-accent/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`}><div className="flex items-center gap-1"><button className="min-w-0 flex-1 px-1 text-left" onClick={() => onSelect(deck.id)} type="button"><span className={`block truncate text-xs font-medium ${selected ? "text-accent-soft" : "text-ink/85"}`}>{deck.name}</span><span className="mt-0.5 block text-[10px] text-muted">{deck.width} × {deck.height} · {deck.screens.length} screen{deck.screens.length === 1 ? "" : "s"}</span></button><Button aria-label={`Move ${deck.name} up`} disabled={index === 0} onClick={() => onMove(deck.id, -1)} size="icon" tooltip="Move deck up" variant="ghost"><ArrowUp size={11} /></Button><Button aria-label={`Move ${deck.name} down`} disabled={index === total - 1} onClick={() => onMove(deck.id, 1)} size="icon" tooltip="Move deck down" variant="ghost"><ArrowDown size={11} /></Button><details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => onEdit(deck.id)} /><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(deck.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(deck.id)} /></div></details></div></div>;
}

function ScreenRow({ deck, screen, index, total, selected, assets, projectSlug, dropEdge, onSelect, onDuplicate, onDelete, onMove, onReorder, onDropTarget, onDragFinished }: { deck: Deck; screen: Deck["screens"][number]; index: number; total: number; selected: boolean; assets: readonly AssetMetadata[]; projectSlug: string; dropEdge: DropEdge | null; onSelect: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onReorder: (id: string, targetIndex: number) => void; onDropTarget: (edge: DropEdge) => void; onDragFinished: () => void }) {
  const [dragging, setDragging] = useState(false);
  const resolved = { ...screen, deckId: deck.id, deckName: deck.name, width: deck.width, height: deck.height, elements: resolveDeckScreen(deck, screen.id) };
  return <div className={`group relative flex items-center gap-1 rounded-lg px-1 py-1 transition-opacity ${dragging ? "opacity-40" : ""} ${selected ? "bg-accent/[0.12]" : "hover:bg-white/[0.04]"}`} onDragOver={(event) => { if (!event.dataTransfer.types.includes(SCREEN_DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDropTarget(dropEdgeForEvent(event)); }} onDrop={(event) => { event.preventDefault(); const dragged = event.dataTransfer.getData(SCREEN_DRAG_TYPE); const edge = dropEdgeForEvent(event); onDragFinished(); if (dragged && dragged !== screen.id) onReorder(dragged, index + (edge === "after" ? 1 : 0)); }}>{dropEdge ? <DropIndicator edge={dropEdge} /> : null}<button aria-label={`Drag to reorder ${screen.name}`} className="plinth-focus-ring grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-muted/60 hover:bg-white/[0.06] hover:text-muted active:cursor-grabbing" draggable onDragEnd={() => { setDragging(false); onDragFinished(); }} onDragStart={(event) => { setDragging(true); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(SCREEN_DRAG_TYPE, screen.id); }} onKeyDown={(event) => { if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); onMove(screen.id, -1); } else if (event.key === "ArrowDown" && index < total - 1) { event.preventDefault(); onMove(screen.id, 1); } }} title="Drag to reorder; use arrow keys for keyboard reordering" type="button"><GripVertical size={14} /></button><button className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left" onClick={() => onSelect(screen.id)} type="button"><span className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border ${selected ? "border-accent/30 bg-accent/15" : "border-white/10 bg-black/15"}`}><ScreenThumbnail assets={assets} projectSlug={projectSlug} screen={resolved} /></span><span className="min-w-0 flex-1"><span className={`block truncate text-xs font-medium ${selected ? "text-accent-soft" : "text-ink/80"}`}>{screen.name}</span></span></button><details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(screen.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(screen.id)} /></div></details></div>;
}

function LayerRow({ element, isLink, linkOwner, selected, actualIndex, total, dropEdge, onSelect, onRename, onToggleVisible, onToggleLocked, onDuplicate, onDelete, onMove, onReorder, onGoToOwner, onDropTarget, onDragFinished }: { element: SceneElement; isLink: boolean; linkOwner?: Deck["screens"][number]; selected: boolean; actualIndex: number; total: number; dropEdge: DropEdge | null; onSelect: (id: string, additive: boolean) => void; onRename: (id: string, name: string) => void; onToggleVisible: (element: SceneElement) => void; onToggleLocked: (element: SceneElement) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onReorder: (id: string, targetIndex: number) => void; onGoToOwner: (ownerScreenId: string, elementId: string) => void; onDropTarget: (edge: DropEdge) => void; onDragFinished: () => void }) {
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftName, setDraftName] = useState(element.name);
  const icon = element.type === "text" ? <Type size={13} /> : element.type === "image" ? <Image size={13} /> : element.type === "device" ? <MonitorSmartphone size={13} /> : <RectangleHorizontal size={13} />;
  const commitName = () => { const name = draftName.trim(); if (name && name !== element.name) onRename(element.id, name); setEditing(false); };
  return <div className={`group relative flex items-center gap-1 rounded-md border px-1 py-0.5 transition-opacity ${dragging ? "opacity-40" : ""} ${selected ? "border-accent/30 bg-accent/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`} onDragOver={(event) => { if (!event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDropTarget(dropEdgeForEvent(event)); }} onDrop={(event) => { event.preventDefault(); const dragged = event.dataTransfer.getData(LAYER_DRAG_TYPE); const edge = dropEdgeForEvent(event); onDragFinished(); if (dragged && dragged !== element.id) onReorder(dragged, actualIndex + (edge === "before" ? 1 : 0)); }}>{dropEdge ? <DropIndicator edge={dropEdge} /> : null}<button aria-label={`Drag to reorder ${element.name}`} className="plinth-focus-ring grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-muted/60 hover:bg-white/[0.06] hover:text-muted active:cursor-grabbing" draggable onDragEnd={() => { setDragging(false); onDragFinished(); }} onDragStart={(event) => { setDragging(true); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(LAYER_DRAG_TYPE, element.id); }} onKeyDown={(event) => { if (event.key === "ArrowUp" && actualIndex < total - 1) { event.preventDefault(); onMove(element.id, 1); } else if (event.key === "ArrowDown" && actualIndex > 0) { event.preventDefault(); onMove(element.id, -1); } }} title="Drag to reorder; use arrow keys for keyboard reordering" type="button"><GripVertical size={14} /></button><button className="grid h-7 w-7 shrink-0 place-items-center text-muted" onClick={() => onSelect(element.id, false)} type="button">{isLink ? <Link2 size={13} /> : icon}</button><button className="min-w-0 flex-1 text-left" onClick={(event) => onSelect(element.id, event.shiftKey)} type="button">{editing ? <input autoFocus className="h-6 w-full rounded border border-accent/40 bg-black/20 px-1 text-xs text-ink outline-none" onBlur={commitName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitName(); if (event.key === "Escape") setEditing(false); }} value={draftName} /> : <span className="block truncate text-xs text-ink/85">{element.name}</span>}</button>{isLink ? <Button aria-label={`Go to owner of ${element.name}`} onClick={() => linkOwner && onGoToOwner(linkOwner.id, element.id)} size="icon" tooltip="Go to owner" variant="ghost"><Link2 size={12} /></Button> : <details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => setEditing(true)} /><MenuAction icon={element.visible ? <EyeOff size={12} /> : <Eye size={12} />} label={element.visible ? "Hide" : "Show"} onClick={() => onToggleVisible(element)} /><MenuAction icon={element.locked ? <Unlock size={12} /> : <Lock size={12} />} label={element.locked ? "Unlock" : "Lock"} onClick={() => onToggleLocked(element)} /><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(element.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(element.id)} /></div></details>}</div>;
}

function dropEdgeForEvent(event: React.DragEvent<HTMLElement>): DropEdge {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
}

function DropIndicator({ edge }: { edge: DropEdge }) {
  return <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-current text-accent shadow-[0_0_8px_currentColor] ${edge === "before" ? "-top-[3px]" : "-bottom-[3px]"}`}><span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full border-2 border-[#171717] bg-current" /></span>;
}

function MenuAction({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] ${danger ? "text-red-200 hover:bg-red-300/10" : "text-muted hover:bg-white/[0.07] hover:text-ink"}`} onClick={onClick} type="button">{icon}{label}</button>;
}
