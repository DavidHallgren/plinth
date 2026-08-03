import {
  ArrowLeft,
  ChevronDown,
  Circle,
  FileOutput,
  Images,
  Minus,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "../ui/button";

type EditorToolbarProps = {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onBack: () => void;
  onRenameProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddText: () => void;
  onOpenAssets: () => void;
  onAddShape: (shape: "rectangle" | "rounded-rectangle" | "ellipse" | "line") => void;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  onExport: () => void;
  previewMode?: boolean;
};

export function EditorToolbar({
  projectName,
  canUndo,
  canRedo,
  zoom,
  onBack,
  onRenameProject,
  onUndo,
  onRedo,
  onAddText,
  onOpenAssets,
  onAddShape,
  onZoomChange,
  onFit,
  onExport,
  previewMode = false,
}: EditorToolbarProps) {
  if (previewMode) {
    return (
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.08] bg-[#141414] px-4">
        <p className="max-w-[320px] truncate text-xs font-semibold text-ink">{projectName}</p>
        <div className="flex items-center gap-1">
          <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo} size="icon" variant="ghost"><Undo2 size={15} /></Button>
          <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo} size="icon" variant="ghost"><Redo2 size={15} /></Button>
        </div>
        <div className="justify-self-end">
          <Button onClick={onExport} size="sm" variant="secondary"><FileOutput size={14} /> Export</Button>
        </div>
      </header>
    );
  }
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.08] bg-[#141414] px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button aria-label="Back to projects" onClick={onBack} size="icon" variant="ghost"><ArrowLeft size={16} /></Button>
        <div className="hidden h-6 w-px bg-white/10 sm:block" />
        <p className="max-w-[260px] truncate text-xs font-semibold text-ink">{projectName}</p>
        <Button aria-label="Edit project" onClick={onRenameProject} size="icon" variant="ghost"><Pencil size={14} /></Button>
      </div>

      <div className="hidden min-w-0 items-center gap-1 justify-self-center md:flex">
        <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo} size="icon" variant="ghost"><Undo2 size={15} /></Button>
        <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo} size="icon" variant="ghost"><Redo2 size={15} /></Button>
        <span className="mx-2 h-5 w-px bg-white/10" />
        <Button onClick={onOpenAssets} size="sm" variant="secondary"><Images size={14} /> Assets</Button>
        <Button onClick={onAddText} size="sm" variant="secondary"><Type size={14} /> Text</Button>
        <div className="relative">
          <details className="group">
            <summary className="plinth-focus-ring flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-panel-strong px-2.5 text-xs font-medium text-ink hover:bg-white/[0.08]"><Square size={13} /> Shape <ChevronDown className="transition group-open:rotate-180" size={13} /></summary>
            <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-white/10 bg-[#212121] p-1.5 shadow-2xl shadow-black/40">
              <ShapeMenuItem label="Rectangle" icon={<Square size={13} />} onClick={() => onAddShape("rectangle")} />
              <ShapeMenuItem label="Rounded rectangle" icon={<Square className="rounded" size={13} />} onClick={() => onAddShape("rounded-rectangle")} />
              <ShapeMenuItem label="Ellipse" icon={<Circle size={13} />} onClick={() => onAddShape("ellipse")} />
              <ShapeMenuItem label="Line" icon={<Minus size={13} />} onClick={() => onAddShape("line")} />
            </div>
          </details>
        </div>
        <span className="mx-2 hidden h-5 w-px bg-white/10 lg:block" />
        <div className="hidden items-center gap-0.5 rounded-lg border border-line bg-panel-strong p-0.5 lg:flex">
          <Button aria-label="Zoom out" onClick={() => onZoomChange(zoom - 0.05)} size="icon" variant="ghost"><ZoomOut size={14} /></Button>
          <button className="h-7 min-w-12 px-1 text-[11px] text-muted hover:text-ink" onClick={onFit} type="button">{Math.round(zoom * 100)}%</button>
          <Button aria-label="Zoom in" onClick={() => onZoomChange(zoom + 0.05)} size="icon" variant="ghost"><ZoomIn size={14} /></Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        <Button onClick={onExport} size="sm" variant="secondary"><FileOutput size={14} /> Export</Button>
      </div>
    </header>
  );
}

function ShapeMenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted hover:bg-white/[0.07] hover:text-ink" onClick={onClick} type="button">{icon}{label}</button>;
}
