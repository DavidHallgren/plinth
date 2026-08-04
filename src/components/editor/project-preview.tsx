import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GripVertical } from "lucide-react";
import { Stage } from "react-konva";
import type { AssetMetadata } from "../../lib/schema";
import type { ResolvedScreen } from "../../scene/selectors";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { Button } from "../ui/button";

type ProjectPreviewProps = {
  assets: readonly AssetMetadata[];
  screens: ResolvedScreen[];
  projectSlug: string;
  onOpenScreen: (screenId: string) => void;
  onMoveScreen: (screenId: string, direction: -1 | 1) => void;
  onReorderScreen: (screenId: string, targetIndex: number) => void;
};

export function previewScreenZoom(screenHeight: number, viewportHeight: number): number {
  const availableHeight = Math.max(120, viewportHeight - 112);
  return Math.min(1, availableHeight / Math.max(1, screenHeight));
}

export function ProjectPreview({ assets, screens, projectSlug, onOpenScreen, onMoveScreen, onReorderScreen }: ProjectPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportHeight(viewport.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-[#101010]" ref={viewportRef}>
      <div className="plinth-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative z-10 flex h-full min-w-max items-center gap-6 px-8 py-6">
        {screens.map((screen, index) => {
          const zoom = previewScreenZoom(screen.height, viewportHeight);
          const width = screen.width * zoom;
          const height = screen.height * zoom;
          return (
            <article
              className="group flex shrink-0 flex-col gap-2"
              draggable
              key={screen.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-plinth-screen", screen.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const draggedId = event.dataTransfer.getData("application/x-plinth-screen");
                if (draggedId && draggedId !== screen.id) onReorderScreen(draggedId, index);
              }}
            >
              <div className="flex h-8 items-center gap-2 text-xs">
                <GripVertical className="cursor-grab text-muted/40" size={14} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink/85">{screen.name}</span>
                <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button aria-label={`Move ${screen.name} left`} disabled={index === 0} onClick={() => onMoveScreen(screen.id, -1)} size="icon" tooltip={`Move ${screen.name} left`} variant="ghost"><ArrowLeft size={13} /></Button>
                  <Button aria-label={`Move ${screen.name} right`} disabled={index === screens.length - 1} onClick={() => onMoveScreen(screen.id, 1)} size="icon" tooltip={`Move ${screen.name} right`} variant="ghost"><ArrowRight size={13} /></Button>
                </div>
              </div>
              <button
                aria-label={`Open ${screen.name}`}
                className="plinth-focus-ring overflow-hidden border border-white/15 bg-[#1a1a1a] text-left shadow-2xl shadow-black/50 transition hover:border-accent/60 focus:border-accent/70"
                onClick={() => onOpenScreen(screen.id)}
                style={{ height: height + 2, width: width + 2 }}
                type="button"
              >
                <Stage height={height} listening={false} scaleX={zoom} scaleY={zoom} width={width}>
                  <SceneRenderer assets={assets} document={screen} projectSlug={projectSlug} />
                </Stage>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
