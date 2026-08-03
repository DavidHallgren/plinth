import {
  ArrowLeft,
  ChevronDown,
  Circle,
  Copy,
  Minus,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Document } from "../../lib/schema";
import type { AutosaveState } from "../../hooks/use-autosave";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export function SaveStatus({ state }: { state: AutosaveState }) {
  const content: Record<AutosaveState, { label: string; tone: "green" | "violet" | "amber" | "red" }> = {
    saved: { label: "Saved", tone: "green" },
    pending: { label: "Save pending", tone: "violet" },
    saving: { label: "Saving", tone: "amber" },
    error: { label: "Save failed", tone: "red" },
  };
  const item = content[state];
  return <Badge tone={item.tone}><span className="h-1.5 w-1.5 rounded-full bg-current" />{item.label}</Badge>;
}

type EditorToolbarProps = {
  projectName: string;
  document: Document;
  dirty: boolean;
  saveState: AutosaveState;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onBack: () => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
  onSaveNow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddText: () => void;
  onAddShape: (shape: "rectangle" | "rounded-rectangle" | "ellipse" | "line") => void;
  onDuplicateDocument: () => void;
  onDeleteDocument: () => void;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
};

export function EditorToolbar({
  projectName,
  document,
  dirty,
  saveState,
  canUndo,
  canRedo,
  zoom,
  onBack,
  onRenameProject,
  onDeleteProject,
  onSaveNow,
  onUndo,
  onRedo,
  onAddText,
  onAddShape,
  onDuplicateDocument,
  onDeleteDocument,
  onZoomChange,
  onFit,
}: EditorToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#101218] px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button aria-label="Back to projects" onClick={onBack} size="icon" variant="ghost"><ArrowLeft size={16} /></Button>
        <div className="hidden h-6 w-px bg-white/10 sm:block" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="max-w-[170px] truncate text-xs font-semibold text-ink">{projectName}</p>
            <span className="text-white/20">/</span>
            <p className="max-w-[180px] truncate text-xs text-muted">{document.name}</p>
          </div>
          <p className="truncate text-[10px] text-muted/70">{document.width} × {document.height} · {document.preset}</p>
        </div>
        <Button aria-label="Rename project" onClick={onRenameProject} size="icon" variant="ghost"><PencilIcon /></Button>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo} size="icon" variant="ghost"><Undo2 size={15} /></Button>
        <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo} size="icon" variant="ghost"><Redo2 size={15} /></Button>
        <span className="mx-2 h-5 w-px bg-white/10" />
        <Button onClick={onAddText} size="sm" variant="secondary"><Type size={14} /> Text</Button>
        <div className="relative">
          <details className="group">
            <summary className="plinth-focus-ring flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-panel-strong px-2.5 text-xs font-medium text-ink hover:bg-white/[0.08]"><Square size={13} /> Shape <ChevronDown className="transition group-open:rotate-180" size={13} /></summary>
            <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-white/10 bg-[#191c25] p-1.5 shadow-2xl shadow-black/40">
              <ShapeMenuItem label="Rectangle" icon={<Square size={13} />} onClick={() => onAddShape("rectangle")} />
              <ShapeMenuItem label="Rounded rectangle" icon={<Square className="rounded" size={13} />} onClick={() => onAddShape("rounded-rectangle")} />
              <ShapeMenuItem label="Ellipse" icon={<Circle size={13} />} onClick={() => onAddShape("ellipse")} />
              <ShapeMenuItem label="Line" icon={<Minus size={13} />} onClick={() => onAddShape("line")} />
            </div>
          </details>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-0.5 rounded-lg border border-line bg-panel-strong p-0.5 lg:flex">
          <Button aria-label="Zoom out" onClick={() => onZoomChange(zoom - 0.05)} size="icon" variant="ghost"><ZoomOut size={14} /></Button>
          <button className="h-7 min-w-12 px-1 text-[11px] text-muted hover:text-ink" onClick={onFit} type="button">{Math.round(zoom * 100)}%</button>
          <Button aria-label="Zoom in" onClick={() => onZoomChange(zoom + 0.05)} size="icon" variant="ghost"><ZoomIn size={14} /></Button>
        </div>
        <div className="hidden sm:block"><SaveStatus state={saveState} /></div>
        <Button aria-label="Save now" disabled={!dirty || saveState === "saving"} onClick={onSaveNow} size="icon" variant="ghost"><Save size={15} /></Button>
        <Button aria-label="Duplicate document" onClick={onDuplicateDocument} size="icon" variant="ghost"><Copy size={15} /></Button>
        <Button aria-label="Delete document" onClick={onDeleteDocument} size="icon" variant="danger"><Trash2 size={15} /></Button>
        <Button aria-label="Delete project" onClick={onDeleteProject} size="icon" variant="ghost"><Trash2 size={14} /></Button>
      </div>
    </header>
  );
}

function ShapeMenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted hover:bg-white/[0.07] hover:text-ink" onClick={onClick} type="button">{icon}{label}</button>;
}

function PencilIcon() {
  return <Plus className="rotate-45" size={14} />;
}
