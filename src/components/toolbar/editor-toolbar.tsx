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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

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
  onDefaultZoom: () => void;
  onFitDeck: () => void;
  onFitScreenWidth: () => void;
  onExport: () => void;
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
  onDefaultZoom,
  onFitDeck,
  onFitScreenWidth,
  onExport,
}: EditorToolbarProps) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.08] bg-[#141414] px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button aria-label="Back to projects" onClick={onBack} size="icon" tooltip="Back to projects" variant="ghost"><ArrowLeft size={16} /></Button>
        <div className="hidden h-6 w-px bg-white/10 sm:block" />
        <p className="max-w-[260px] truncate text-xs font-semibold text-ink">{projectName}</p>
        <Button aria-label="Edit project" onClick={onRenameProject} size="icon" tooltip="Edit project" variant="ghost"><Pencil size={14} /></Button>
      </div>

      <div className="hidden min-w-0 items-center gap-1 justify-self-center md:flex">
        <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo} size="icon" tooltip="Undo" variant="ghost"><Undo2 size={15} /></Button>
        <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo} size="icon" tooltip="Redo" variant="ghost"><Redo2 size={15} /></Button>
        <span className="mx-2 h-5 w-px bg-white/10" />
        <Button onClick={onOpenAssets} size="sm" variant="secondary"><Images size={14} /> Assets</Button>
        <Button onClick={onAddText} size="sm" variant="secondary"><Type size={14} /> Text</Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="group plinth-focus-ring flex h-8 items-center gap-1 rounded-lg border border-line bg-panel-strong px-2.5 text-xs font-medium text-ink hover:bg-white/[0.08]"><Square size={13} /> Shape <ChevronDown className="transition group-data-[popup-open]:rotate-180" size={13} /></DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <ShapeMenuItem label="Rectangle" icon={<Square size={13} />} onClick={() => onAddShape("rectangle")} />
            <ShapeMenuItem label="Rounded rectangle" icon={<Square className="rounded" size={13} />} onClick={() => onAddShape("rounded-rectangle")} />
            <ShapeMenuItem label="Ellipse" icon={<Circle size={13} />} onClick={() => onAddShape("ellipse")} />
            <ShapeMenuItem label="Line" icon={<Minus size={13} />} onClick={() => onAddShape("line")} />
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-2 hidden h-5 w-px bg-white/10 lg:block" />
        <div className="hidden h-8 items-center gap-0.5 rounded-lg border border-line bg-panel-strong p-0.5 lg:flex">
          <Button aria-label="Zoom out" className="h-7 w-7 rounded-md" onClick={() => onZoomChange(zoom - 0.05)} size="icon" tooltip="Zoom out" variant="ghost"><ZoomOut size={14} /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Zoom options" className="group plinth-focus-ring flex h-7 min-w-16 items-center justify-center gap-1 px-1 text-[11px] text-muted hover:text-ink">
              {Math.round(zoom * 100)}% <ChevronDown className="transition group-data-[popup-open]:rotate-180" size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-40">
              <ZoomMenuItem label="Fit screen (Default)" onClick={onDefaultZoom} />
              <ZoomMenuItem label="Fit deck" onClick={onFitDeck} />
              <ZoomMenuItem label="Fit screen width" onClick={onFitScreenWidth} />
              <ZoomMenuItem label="25%" onClick={() => onZoomChange(0.25)} />
              <ZoomMenuItem label="50%" onClick={() => onZoomChange(0.5)} />
              <ZoomMenuItem label="100%" onClick={() => onZoomChange(1)} />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button aria-label="Zoom in" className="h-7 w-7 rounded-md" onClick={() => onZoomChange(zoom + 0.05)} size="icon" tooltip="Zoom in" variant="ghost"><ZoomIn size={14} /></Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        <Button onClick={onExport} size="sm" variant="secondary"><FileOutput size={14} /> Export</Button>
      </div>
    </header>
  );
}

function ShapeMenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <DropdownMenuItem onClick={onClick}>{icon}{label}</DropdownMenuItem>;
}

function ZoomMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return <DropdownMenuItem onClick={onClick}>{label}</DropdownMenuItem>;
}
