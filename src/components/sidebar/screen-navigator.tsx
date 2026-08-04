import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
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

export function ScreenNavigator({ project, activeDeckId, activeScreenId, selectedElementIds, assets, onSelectDeck, onAddDeck, onEditDeck, onDuplicateDeck, onDeleteDeck, onMoveDeck, onSelectScreen, onAddScreen, onDuplicateScreen, onDeleteScreen, onMoveScreen, onReorderScreen, onSelectLayer, onRenameElement, onToggleVisible, onToggleLocked, onDuplicateElement, onDeleteElement, onMoveLayer, onReorderLayer, onGoToOwner }: ScreenNavigatorProps) {
  const activeDeck = project.decks.find((deck) => deck.id === activeDeckId) ?? project.decks[0];
  const activeScreen = activeDeck?.screens.find((screen) => screen.id === activeScreenId) ?? activeDeck?.screens[0];
  const [decksOpen, setDecksOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const resolvedById = new Map(activeDeck && activeScreen ? resolveDeckScreen(activeDeck, activeScreen.id).map((element) => [element.id, element]) : []);

  return (
    <aside className="flex min-h-0 w-[276px] shrink-0 flex-col border-r border-white/[0.08] bg-[#171717]">
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
            <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Screens</p><p className="mt-1 truncate text-[10px] text-muted/70">{activeDeck.name} · {activeDeck.width} × {activeDeck.height} fixed</p></div>
            <Button aria-label="Add screen" onClick={onAddScreen} size="icon" tooltip="Add screen" variant="ghost"><FilePlus2 size={15} /></Button>
          </div>
          <div className="mt-2 space-y-1">{activeDeck.screens.map((screen, index) => <ScreenRow deck={activeDeck} index={index} key={screen.id} onDelete={onDeleteScreen} onDuplicate={onDuplicateScreen} onMove={onMoveScreen} onReorder={onReorderScreen} onSelect={onSelectScreen} projectSlug={project.slug} screen={screen} selected={screen.id === activeScreen.id} total={activeDeck.screens.length} assets={assets} />)}</div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto p-3">
          <button className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted hover:text-ink" onClick={() => setLayersOpen((open) => !open)} type="button">
            {layersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Focused layers <span className="ml-auto normal-case tracking-normal text-[10px] text-muted/60">{activeScreen.layers.length}</span>
          </button>
          {layersOpen ? <div className="mt-2 space-y-0.5">{[...activeScreen.layers].reverse().map((layer, displayIndex) => {
            const actualIndex = activeScreen.layers.length - 1 - displayIndex;
            const resolved = layer.kind === "owned" ? layer.element : resolvedById.get(layer.elementId);
            if (!resolved) return null;
            return <LayerRow actualIndex={actualIndex} element={resolved} isLink={layer.kind === "overflow-link"} key={`${activeScreen.id}:${layer.kind}:${layer.kind === "owned" ? layer.element.id : `${layer.ownerScreenId}:${layer.elementId}`}`} linkOwner={layer.kind === "overflow-link" ? activeDeck.screens.find((screen) => screen.id === layer.ownerScreenId) : undefined} onDelete={onDeleteElement} onDuplicate={onDuplicateElement} onGoToOwner={onGoToOwner} onMove={onMoveLayer} onRename={onRenameElement} onReorder={onReorderLayer} onSelect={onSelectLayer} onToggleLocked={onToggleLocked} onToggleVisible={onToggleVisible} selected={selectedElementIds.includes(resolved.id)} total={activeScreen.layers.length} />;
          })}{activeScreen.layers.length === 0 ? <p className="px-2 py-8 text-center text-xs text-muted">Add text, a shape, an image, or a device to begin.</p> : null}</div> : null}
        </section>
      </> : null}
    </aside>
  );
}

function DeckRow({ deck, index, total, selected, onSelect, onEdit, onDuplicate, onDelete, onMove }: { deck: Deck; index: number; total: number; selected: boolean; onSelect: (id: string) => void; onEdit: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void }) {
  return <div className={`group rounded-lg border px-1 py-1 ${selected ? "border-accent/30 bg-accent/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`}><div className="flex items-center gap-1"><button className="min-w-0 flex-1 px-1 text-left" onClick={() => onSelect(deck.id)} type="button"><span className={`block truncate text-xs font-medium ${selected ? "text-accent-soft" : "text-ink/85"}`}>{deck.name}</span><span className="mt-0.5 block text-[10px] text-muted">{deck.width} × {deck.height} · {deck.screens.length} screen{deck.screens.length === 1 ? "" : "s"}</span></button><Button aria-label={`Move ${deck.name} up`} disabled={index === 0} onClick={() => onMove(deck.id, -1)} size="icon" tooltip="Move deck up" variant="ghost"><ArrowUp size={11} /></Button><Button aria-label={`Move ${deck.name} down`} disabled={index === total - 1} onClick={() => onMove(deck.id, 1)} size="icon" tooltip="Move deck down" variant="ghost"><ArrowDown size={11} /></Button><details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => onEdit(deck.id)} /><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(deck.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(deck.id)} /></div></details></div></div>;
}

function ScreenRow({ deck, screen, index, total, selected, assets, projectSlug, onSelect, onDuplicate, onDelete, onMove, onReorder }: { deck: Deck; screen: Deck["screens"][number]; index: number; total: number; selected: boolean; assets: readonly AssetMetadata[]; projectSlug: string; onSelect: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onReorder: (id: string, targetIndex: number) => void }) {
  const resolved = { ...screen, deckId: deck.id, deckName: deck.name, width: deck.width, height: deck.height, elements: resolveDeckScreen(deck, screen.id) };
  return <div className={`group relative flex items-center gap-1 rounded-lg px-1 py-1 ${selected ? "bg-accent/[0.12]" : "hover:bg-white/[0.04]"}`} draggable onDragOver={(event) => event.preventDefault()} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-plinth-screen", screen.id); }} onDrop={(event) => { event.preventDefault(); const dragged = event.dataTransfer.getData("application/x-plinth-screen"); if (dragged && dragged !== screen.id) onReorder(dragged, index); }}><button className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left" onClick={() => onSelect(screen.id)} type="button"><span className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border ${selected ? "border-accent/30 bg-accent/15" : "border-white/10 bg-black/15"}`}><ScreenThumbnail assets={assets} projectSlug={projectSlug} screen={resolved} /></span><span className="min-w-0 flex-1"><span className={`block truncate text-xs font-medium ${selected ? "text-accent-soft" : "text-ink/80"}`}>{screen.name}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{deck.width} × {deck.height}</span></span></button><Button aria-label={`Move ${screen.name} up`} disabled={index === 0} onClick={() => onMove(screen.id, -1)} size="icon" tooltip="Move screen up" variant="ghost"><ArrowUp size={11} /></Button><Button aria-label={`Move ${screen.name} down`} disabled={index === total - 1} onClick={() => onMove(screen.id, 1)} size="icon" tooltip="Move screen down" variant="ghost"><ArrowDown size={11} /></Button><details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(screen.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(screen.id)} /></div></details></div>;
}

function LayerRow({ element, isLink, linkOwner, selected, actualIndex, total, onSelect, onRename, onToggleVisible, onToggleLocked, onDuplicate, onDelete, onMove, onReorder, onGoToOwner }: { element: SceneElement; isLink: boolean; linkOwner?: Deck["screens"][number]; selected: boolean; actualIndex: number; total: number; onSelect: (id: string, additive: boolean) => void; onRename: (id: string, name: string) => void; onToggleVisible: (element: SceneElement) => void; onToggleLocked: (element: SceneElement) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onReorder: (id: string, targetIndex: number) => void; onGoToOwner: (ownerScreenId: string, elementId: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(element.name);
  const icon = element.type === "text" ? <Type size={13} /> : element.type === "image" ? <Image size={13} /> : element.type === "device" ? <MonitorSmartphone size={13} /> : <RectangleHorizontal size={13} />;
  const commitName = () => { const name = draftName.trim(); if (name && name !== element.name) onRename(element.id, name); setEditing(false); };
  return <div className={`group flex items-center gap-1 rounded-md border px-1 py-1 ${selected ? "border-accent/30 bg-accent/[0.12]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`} draggable={!isLink} onDragOver={(event) => event.preventDefault()} onDragStart={(event) => { if (!isLink) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-plinth-layer", element.id); } }} onDrop={(event) => { event.preventDefault(); const dragged = event.dataTransfer.getData("application/x-plinth-layer"); if (dragged && dragged !== element.id) onReorder(dragged, actualIndex); }}><button className="grid h-7 w-7 shrink-0 place-items-center text-muted" onClick={() => onSelect(element.id, false)} type="button">{isLink ? <Link2 size={13} /> : icon}</button><button className="min-w-0 flex-1 text-left" onClick={(event) => onSelect(element.id, event.shiftKey)} type="button">{editing ? <input autoFocus className="h-6 w-full rounded border border-accent/40 bg-black/20 px-1 text-xs text-ink outline-none" onBlur={commitName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitName(); if (event.key === "Escape") setEditing(false); }} value={draftName} /> : <><span className="block truncate text-xs text-ink/85">{element.name}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{isLink ? `Linked · owner ${linkOwner?.name ?? "unknown"}` : element.type}</span></>}</button><Button aria-label={`Move ${element.name} backward`} disabled={actualIndex === 0} onClick={() => onMove(element.id, -1)} size="icon" tooltip="Move backward" variant="ghost"><ArrowDown size={11} /></Button><Button aria-label={`Move ${element.name} forward`} disabled={actualIndex === total - 1} onClick={() => onMove(element.id, 1)} size="icon" tooltip="Move forward" variant="ghost"><ArrowUp size={11} /></Button>{isLink ? <Button aria-label={`Go to owner of ${element.name}`} onClick={() => linkOwner && onGoToOwner(linkOwner.id, element.id)} size="icon" tooltip="Go to owner" variant="ghost"><Link2 size={12} /></Button> : <details className="relative"><summary className="plinth-focus-ring grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"><MoreHorizontal size={13} /></summary><div className="absolute right-0 top-8 z-30 w-32 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl"><MenuAction icon={<Pencil size={12} />} label="Rename" onClick={() => setEditing(true)} /><MenuAction icon={element.visible ? <EyeOff size={12} /> : <Eye size={12} />} label={element.visible ? "Hide" : "Show"} onClick={() => onToggleVisible(element)} /><MenuAction icon={element.locked ? <Unlock size={12} /> : <Lock size={12} />} label={element.locked ? "Unlock" : "Lock"} onClick={() => onToggleLocked(element)} /><MenuAction icon={<Copy size={12} />} label="Duplicate" onClick={() => onDuplicate(element.id)} /><MenuAction danger icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(element.id)} /></div></details>}</div>;
}

function MenuAction({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] ${danger ? "text-red-200 hover:bg-red-300/10" : "text-muted hover:bg-white/[0.07] hover:text-ink"}`} onClick={onClick} type="button">{icon}{label}</button>;
}
