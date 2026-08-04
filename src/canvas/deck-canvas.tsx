import type Konva from "konva";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Stage, Transformer } from "react-konva";
import type { AssetMetadata, Deck } from "../lib/schema";
import type { ResolvedScreen } from "../scene/selectors";
import { projectionKey } from "../scene/overflow";
import { SceneRenderer } from "./scene-renderer";

export type CanvasTransform = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type DeckFitMode = "deck" | "focused-screen" | "screen-width";

const CANVAS_PADDING = 32;
const SCREEN_GAP = 6;
const SCREEN_REVEAL_THRESHOLD = 0.25;

export function horizontalVisibilityRatio(screenLeft: number, screenWidth: number, viewportLeft: number, viewportWidth: number): number {
  if (screenWidth <= 0 || viewportWidth <= 0) return 0;
  const visibleLeft = Math.max(screenLeft, viewportLeft);
  const visibleRight = Math.min(screenLeft + screenWidth, viewportLeft + viewportWidth);
  return Math.max(0, visibleRight - visibleLeft) / screenWidth;
}

export function shouldRevealScreenHorizontally(screenLeft: number, screenWidth: number, viewportLeft: number, viewportWidth: number): boolean {
  return horizontalVisibilityRatio(screenLeft, screenWidth, viewportLeft, viewportWidth) < SCREEN_REVEAL_THRESHOLD;
}

export function shouldBeginCanvasPan(button: number, modifiers: { altKey: boolean; shiftKey: boolean }): boolean {
  return button === 1 || modifiers.altKey;
}

export function fitDeckZoom(deckWidth: number, deckHeight: number, screenCount: number, viewportWidth: number, viewportHeight: number): number {
  const gapWidth = Math.max(0, screenCount - 1) * SCREEN_GAP;
  const availableWidth = Math.max(120, viewportWidth - CANVAS_PADDING * 2 - gapWidth);
  const availableHeight = Math.max(120, viewportHeight - CANVAS_PADDING * 2);
  return Math.min(1, availableWidth / Math.max(1, deckWidth * Math.max(1, screenCount)), availableHeight / Math.max(1, deckHeight));
}

export function fitFocusedScreenZoom(deckWidth: number, deckHeight: number, viewportWidth: number, viewportHeight: number): number {
  const availableWidth = Math.max(120, viewportWidth - CANVAS_PADDING * 2);
  const availableHeight = Math.max(120, viewportHeight - CANVAS_PADDING * 2);
  return Math.min(1, availableWidth / Math.max(1, deckWidth), availableHeight / Math.max(1, deckHeight));
}

export function fitScreenWidthZoom(deckWidth: number, viewportWidth: number): number {
  const availableWidth = Math.max(120, viewportWidth - CANVAS_PADDING * 2);
  return Math.min(1, availableWidth / Math.max(1, deckWidth));
}

type DeckCanvasProps = {
  deck: Deck;
  screens: readonly ResolvedScreen[];
  focusedScreenId: string;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selectedElementIds: readonly string[];
  zoom: number;
  fitRequest: string;
  fitMode: DeckFitMode;
  revealScreenRequest: number;
  onFitZoom: (zoom: number) => void;
  onFocusScreen: (screenId: string) => void;
  onSelect: (targetScreenId: string, elementId: string, additive: boolean) => void;
  onClearSelection: (targetScreenId: string) => void;
  onGestureStart: (label: string, targetScreenId: string) => void;
  onMoveEnd: (targetScreenId: string, elementId: string, x: number, y: number) => void;
  onTransformEnd: (targetScreenId: string, transforms: CanvasTransform[]) => void;
};

const MIN_TRANSFORM_SIZE = 8;

export function DeckCanvas({ deck, screens, focusedScreenId, projectSlug, assets, selectedElementIds, zoom, fitRequest, fitMode, revealScreenRequest, onFitZoom, onFocusScreen, onSelect, onClearSelection, onGestureStart, onMoveEnd, onTransformEnd }: DeckCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const totalWidth = deck.width * Math.max(1, screens.length);
  const scaledWidth = totalWidth * zoom + Math.max(0, screens.length - 1) * SCREEN_GAP;
  const scaledHeight = deck.height * zoom;
  const focusedIndex = Math.max(0, screens.findIndex((screen) => screen.id === focusedScreenId));
  const focusedScreen = screens[focusedIndex] ?? screens[0];
  const focusedElements = focusedScreen?.elements ?? [];
  const lockedElementIds = useMemo(() => new Set(focusedElements.filter((element) => element.locked).map((element) => element.id)), [focusedElements]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!viewportSize.width || !viewportSize.height) return;
    const nextZoom = fitMode === "focused-screen"
      ? fitFocusedScreenZoom(deck.width, deck.height, viewportSize.width, viewportSize.height)
      : fitMode === "screen-width"
        ? fitScreenWidthZoom(deck.width, viewportSize.width)
        : fitDeckZoom(deck.width, deck.height, screens.length, viewportSize.width, viewportSize.height);
    onFitZoom(nextZoom);
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport || fitMode === "deck") return;
      const screenWidth = deck.width * nextZoom;
      const screenLeft = CANVAS_PADDING + focusedIndex * (screenWidth + SCREEN_GAP);
      viewport.scrollTo({ left: Math.max(0, screenLeft - (viewport.clientWidth - screenWidth) / 2), top: Math.max(0, (deck.height * nextZoom - viewport.clientHeight) / 2), behavior: "smooth" });
    });
  }, [deck.height, deck.width, fitMode, fitRequest, focusedIndex, onFitZoom, screens.length, viewportSize.height, viewportSize.width]);

  useLayoutEffect(() => {
    if (!revealScreenRequest || !viewportSize.width || !viewportSize.height) return;
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const canvasFrame = frameRef.current;
      if (!viewport || !canvasFrame) return;
      const screenWidth = deck.width * zoom;
      const viewportBounds = viewport.getBoundingClientRect();
      const frameBounds = canvasFrame.getBoundingClientRect();
      const screenLeft = frameBounds.left + canvasFrame.clientLeft + focusedIndex * (screenWidth + SCREEN_GAP);
      if (!shouldRevealScreenHorizontally(screenLeft, screenWidth, viewportBounds.left, viewport.clientWidth)) return;
      const screenLeftInContent = viewport.scrollLeft + screenLeft - (viewportBounds.left + viewport.clientLeft);
      viewport.scrollTo({ left: Math.max(0, screenLeftInContent - (viewport.clientWidth - screenWidth) / 2), top: Math.max(0, (deck.height * zoom - viewport.clientHeight) / 2), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [deck.height, deck.width, focusedIndex, revealScreenRequest, viewportSize.height, viewportSize.width, zoom]);

  useLayoutEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedElementIds
      .filter((id) => !lockedElementIds.has(id))
      .map((id) => nodeRefs.current.get(projectionKey(focusedScreenId, id)))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [focusedScreenId, focusedElements, lockedElementIds, selectedElementIds]);

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!shouldBeginCanvasPan(event.button, event)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !viewport) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };

  const transformer = focusedScreen ? (
    <Transformer
      anchorCornerRadius={4}
      anchorFill="#f5f5f5"
      anchorSize={8}
      anchorStroke="#b0b0b0"
      borderDash={[5, 4]}
      borderStroke="#cccccc"
      boundBoxFunc={(oldBox, newBox) => newBox.width < MIN_TRANSFORM_SIZE || newBox.height < MIN_TRANSFORM_SIZE ? oldBox : newBox}
      enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
      keepRatio={false}
      onTransformStart={() => { if ((transformerRef.current?.nodes().length ?? 0) > 0) onGestureStart("Resize selection", focusedScreenId); }}
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
        onTransformEnd(focusedScreenId, transforms);
      }}
      ref={transformerRef}
      rotateEnabled
      rotateAnchorOffset={28}
      rotationSnaps={[0, 90, 180, 270]}
      rotationSnapTolerance={4}
    />
  ) : null;

  return (
    <div className="relative flex min-h-0 flex-1 overflow-auto bg-[#101010]" onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} ref={viewportRef}>
      <div className="plinth-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative z-10 flex min-h-full min-w-full">
        <div className="relative m-auto shrink-0" style={{ height: scaledHeight + CANVAS_PADDING * 2, width: scaledWidth + CANVAS_PADDING * 2 }}>
          <div className="absolute" ref={frameRef} style={{ height: scaledHeight, left: CANVAS_PADDING, top: CANVAS_PADDING, width: scaledWidth }}>
            <Stage
              height={scaledHeight}
              onMouseDown={(event) => {
                if (event.target === event.target.getStage()) onClearSelection(focusedScreenId);
              }}
              scaleX={zoom}
              scaleY={zoom}
              width={scaledWidth}
            >
              {screens.map((screen, index) => (
                <SceneRenderer
                  assets={assets}
                  interactive
                  key={screen.id}
                  offsetX={index * (deck.width + SCREEN_GAP / zoom)}
                  onClearSelection={(targetScreenId) => { onFocusScreen(targetScreenId); onClearSelection(targetScreenId); }}
                  onGestureStart={onGestureStart}
                  onMoveEnd={onMoveEnd}
                  onSelect={(targetScreenId, elementId, additive) => { onFocusScreen(targetScreenId); onSelect(targetScreenId, elementId, additive); }}
                  projectSlug={projectSlug}
                  register={(targetScreenId, elementId, node) => {
                    const key = projectionKey(targetScreenId, elementId);
                    if (node) nodeRefs.current.set(key, node);
                    else nodeRefs.current.delete(key);
                  }}
                  screen={screen}
                  selectedElementIds={selectedElementIds}
                  targetScreenId={screen.id}
                >
                  {screen.id === focusedScreenId ? transformer : null}
                </SceneRenderer>
              ))}
            </Stage>
            <div className="pointer-events-none absolute inset-0">
              {screens.map((screen, index) => (
                <div
                  className={`absolute border ${screen.id === focusedScreenId ? "border-white" : "border-white/25"}`}
                  key={`screen-outline-${screen.id}`}
                  style={{
                    height: scaledHeight,
                    left: index * (deck.width * zoom + SCREEN_GAP),
                    width: deck.width * zoom,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
