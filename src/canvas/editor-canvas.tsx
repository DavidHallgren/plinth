import type Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Stage, Transformer } from "react-konva";
import type { AssetMetadata, Document } from "../lib/schema";
import { SceneRenderer } from "./scene-renderer";

export type CanvasTransform = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type EditorCanvasProps = {
  document: Document;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selectedElementIds: readonly string[];
  zoom: number;
  fitRequest: number;
  onFitZoom: (zoom: number) => void;
  onSelect: (elementId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onGestureStart: (label: string) => void;
  onMoveEnd: (elementId: string, x: number, y: number) => void;
  onTransformEnd: (transforms: CanvasTransform[]) => void;
};

const MIN_TRANSFORM_SIZE = 8;

export function EditorCanvas({ document, projectSlug, assets, selectedElementIds, zoom, fitRequest, onFitZoom, onSelect, onClearSelection, onGestureStart, onMoveEnd, onTransformEnd }: EditorCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedElementIds
      .filter((id) => document.elements.find((element) => element.id === id)?.locked !== true)
      .map((id) => nodeRefs.current.get(id))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [document.elements, selectedElementIds]);

  useEffect(() => {
    if (fitRequest === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(120, viewport.clientWidth - 64);
    const availableHeight = Math.max(120, viewport.clientHeight - 64);
    onFitZoom(Math.min(1, availableWidth / document.width, availableHeight / document.height));
  }, [document.height, document.width, fitRequest, onFitZoom]);

  const scaledWidth = document.width * zoom;
  const scaledHeight = document.height * zoom;
  const lockedElementIds = useMemo(() => new Set(document.elements.filter((element) => element.locked).map((element) => element.id)), [document.elements]);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#0e1016]" ref={viewportRef}>
      <div className="plinth-grid absolute inset-0 opacity-40" />
      <div className="relative z-10 flex min-h-full min-w-full items-center justify-center overflow-auto p-8">
        <div className="relative shrink-0 rounded-[14px] border border-white/15 bg-[#141821] shadow-2xl shadow-black/50" style={{ height: scaledHeight + 2, width: scaledWidth + 2 }}>
          <Stage
            height={scaledHeight}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) onClearSelection();
            }}
            scaleX={zoom}
            scaleY={zoom}
            width={scaledWidth}
          >
            <SceneRenderer
              assets={assets}
              document={document}
              interactive
              onClearSelection={onClearSelection}
              onGestureStart={onGestureStart}
              onMoveEnd={onMoveEnd}
              onSelect={onSelect}
              projectSlug={projectSlug}
              register={(id, node) => {
                if (node) nodeRefs.current.set(id, node);
                else nodeRefs.current.delete(id);
              }}
              selectedElementIds={selectedElementIds}
            >
              <Transformer
                anchorCornerRadius={4}
                anchorFill="#f4f2ff"
                anchorSize={8}
                anchorStroke="#9d8cff"
                borderDash={[5, 4]}
                borderStroke="#b6a9ff"
                boundBoxFunc={(oldBox, newBox) => newBox.width < MIN_TRANSFORM_SIZE || newBox.height < MIN_TRANSFORM_SIZE ? oldBox : newBox}
                enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
                keepRatio={false}
                onTransformStart={() => {
                  if ((transformerRef.current?.nodes().length ?? 0) > 0) onGestureStart("Resize selection");
                }}
                onTransformEnd={() => {
                  const nodes = (transformerRef.current?.nodes() ?? []).filter((node) => !lockedElementIds.has(node.name().replace(/^element-/, "")));
                  if (nodes.length === 0) return;
                  const transforms = nodes.map((node) => ({
                    id: node.name().replace(/^element-/, ""),
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(MIN_TRANSFORM_SIZE, Math.abs(node.width() * node.scaleX())),
                    height: Math.max(MIN_TRANSFORM_SIZE, Math.abs(node.height() * node.scaleY())),
                    rotation: node.rotation(),
                  }));
                  nodes.forEach((node) => node.scale({ x: 1, y: 1 }));
                  onTransformEnd(transforms);
                }}
                ref={transformerRef}
                rotateEnabled
                rotateAnchorOffset={28}
                rotationSnaps={[0, 90, 180, 270]}
                rotationSnapTolerance={4}
              />
            </SceneRenderer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
