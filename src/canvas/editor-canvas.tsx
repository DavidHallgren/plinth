import type Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Document, GradientStop, SceneElement } from "../lib/schema";
import { konvaFontStyle } from "./text-style";

type CanvasTransform = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type EditorCanvasProps = {
  document: Document;
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

function colorStops(stops: GradientStop[]): Array<number | string> {
  return stops.flatMap((stop) => [stop.offset, stop.color]);
}

function shadowProps(shadow: SceneElement["shadow"]): Record<string, unknown> {
  if (!shadow) return {};
  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowOpacity: shadow.opacity,
  };
}

function elementPosition(element: SceneElement) {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    opacity: element.opacity,
  };
}

type ElementNodeProps = {
  element: SceneElement;
  selected: boolean;
  register: (id: string, node: Konva.Node | null) => void;
  onSelect: (elementId: string, additive: boolean) => void;
  onGestureStart: (label: string) => void;
  onMoveEnd: (elementId: string, x: number, y: number) => void;
};

function ElementNode({ element, selected, register, onSelect, onGestureStart, onMoveEnd }: ElementNodeProps) {
  if (!element.visible) return null;
  const draggable = !element.locked;
  const position = elementPosition(element);
  const handleSelect = (event: KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true;
    onSelect(element.id, event.evt.shiftKey);
  };
  const handleTap = (event: KonvaEventObject<TouchEvent>) => {
    event.cancelBubble = true;
    onSelect(element.id, event.evt.shiftKey);
  };
  const handleDragStart = () => {
    if (element.locked) return;
    if (!selected) onSelect(element.id, false);
    onGestureStart("Move selection");
  };
  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    if (element.locked) return;
    onMoveEnd(element.id, event.target.x(), event.target.y());
  };
  const baseProps = {
    ...position,
    draggable,
    onClick: handleSelect,
    onTap: handleTap,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    opacity: position.opacity,
    ...shadowProps(element.shadow),
  };

  if (element.type === "text") {
    const textShadow = element.style.shadow ?? element.shadow;
    return (
      <Group {...baseProps} ref={(node) => register(element.id, node)} name={`element-${element.id}`}>
        <Rect
          cornerRadius={element.style.backgroundRadius ?? 0}
          fill={element.style.backgroundColor ?? "transparent"}
          height={element.height}
          listening={false}
          width={element.width}
        />
        <Text
          align={element.style.align}
          fill={element.style.color}
          fontFamily={element.style.fontFamily}
          fontSize={element.style.fontSize}
          fontStyle={konvaFontStyle(element.style.fontWeight, element.style.italic ?? false)}
          height={element.height}
          letterSpacing={element.style.letterSpacing}
          lineHeight={element.style.lineHeight}
          padding={element.style.padding ?? 0}
          text={element.text}
          textDecoration={element.style.underline ? "underline" : undefined}
          verticalAlign="middle"
          width={element.width}
          {...shadowProps(textShadow)}
        />
      </Group>
    );
  }

  if (element.type === "shape") {
    const shapeProps = {
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    };
    if (element.shape === "ellipse") {
      return (
        <Group {...baseProps} ref={(node) => register(element.id, node)} name={`element-${element.id}`}>
          <Ellipse
            {...shapeProps}
            radiusX={element.width / 2}
            radiusY={element.height / 2}
            x={element.width / 2}
            y={element.height / 2}
          />
        </Group>
      );
    }
    if (element.shape === "line") {
      return (
        <Group {...baseProps} ref={(node) => register(element.id, node)} name={`element-${element.id}`}>
          <Line {...shapeProps} points={[0, element.height / 2, element.width, element.height / 2]} />
        </Group>
      );
    }
    return (
      <Rect
        {...baseProps}
        cornerRadius={element.shape === "rounded-rectangle" ? element.radius : 0}
        fill={element.fill}
        name={`element-${element.id}`}
        ref={(node) => register(element.id, node)}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
      />
    );
  }

  if (element.type === "device") {
    const radius = Math.min(48, element.width * 0.07, element.height * 0.07);
    const headerHeight = Math.min(58, Math.max(24, element.height * 0.08));
    const inset = Math.max(12, Math.min(34, element.width * 0.035));
    return (
      <Group {...baseProps} ref={(node) => register(element.id, node)} name={`element-${element.id}`}>
        <Rect cornerRadius={radius} fill={element.frameColor} height={element.height} width={element.width} />
        <Rect
          cornerRadius={Math.max(4, radius - 5)}
          fill={element.screenColor}
          height={Math.max(1, element.height - headerHeight - inset)}
          x={inset}
          y={headerHeight}
          width={Math.max(1, element.width - inset * 2)}
        />
        <Ellipse fill="#f56f78" radiusX={4} radiusY={4} x={inset + 14} y={headerHeight / 2} />
        <Ellipse fill="#e9b65a" radiusX={4} radiusY={4} x={inset + 28} y={headerHeight / 2} />
        <Ellipse fill="#6dc596" radiusX={4} radiusY={4} x={inset + 42} y={headerHeight / 2} />
        <Text
          fill="#1b2030"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize={Math.max(12, Math.round(element.width * 0.018))}
          fontStyle="bold"
          text="DEVICE PLACEHOLDER"
          width={element.width - inset * 2}
          x={inset}
          y={headerHeight + Math.min(110, element.height * 0.16)}
        />
        <Text
          fill="#59647a"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize={Math.max(10, Math.round(element.width * 0.012))}
          text={element.deviceName}
          width={element.width - inset * 2}
          x={inset}
          y={headerHeight + Math.min(150, element.height * 0.23)}
        />
      </Group>
    );
  }

  return (
    <Group {...baseProps} ref={(node) => register(element.id, node)} name={`element-${element.id}`}>
      <Rect dash={[10, 8]} fill="#161a24" height={element.height} stroke="#777f99" strokeWidth={2} width={element.width} />
      <Text fill="#b5bbcc" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize={18} text="ASSET PLACEHOLDER" width={element.width} y={element.height / 2 - 10} align="center" />
    </Group>
  );
}

export function EditorCanvas({
  document,
  selectedElementIds,
  zoom,
  fitRequest,
  onFitZoom,
  onSelect,
  onClearSelection,
  onGestureStart,
  onMoveEnd,
  onTransformEnd,
}: EditorCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const selectedSet = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedElementIds
      .filter((id) => document.elements.find((element) => element.id === id)?.locked !== true)
      .map((id) => nodeRefs.current.get(id))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, document.elements]);

  useEffect(() => {
    if (fitRequest === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(120, viewport.clientWidth - 64);
    const availableHeight = Math.max(120, viewport.clientHeight - 64);
    onFitZoom(Math.min(1, availableWidth / document.width, availableHeight / document.height));
  }, [document.height, document.width, fitRequest, onFitZoom]);

  const backgroundProps = document.background.type === "solid" ? { fill: document.background.color } : document.background.type === "transparent" ? { fill: "#ffffff" } : document.background.type === "linear-gradient" ? {
    fillLinearGradientColorStops: colorStops(document.background.stops),
    fillLinearGradientStartPoint: { x: document.background.start.x * document.width, y: document.background.start.y * document.height },
    fillLinearGradientEndPoint: { x: document.background.end.x * document.width, y: document.background.end.y * document.height },
  } : {
    fillRadialGradientColorStops: colorStops(document.background.stops),
    fillRadialGradientStartPoint: { x: document.background.center.x * document.width, y: document.background.center.y * document.height },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: document.background.center.x * document.width, y: document.background.center.y * document.height },
    fillRadialGradientEndRadius: document.background.radius * Math.max(document.width, document.height),
  };

  const orderedElements = [...document.elements].sort((left, right) => left.zIndex - right.zIndex);
  const scaledWidth = document.width * zoom;
  const scaledHeight = document.height * zoom;
  const lockedElementIds = new Set(document.elements.filter((element) => element.locked).map((element) => element.id));

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
            <Layer>
              <Rect {...backgroundProps} height={document.height} listening name="document-background" onClick={onClearSelection} onMouseDown={onClearSelection} width={document.width} />
              {orderedElements.map((element) => (
                <ElementNode
                  element={element}
                  key={element.id}
                  onGestureStart={onGestureStart}
                  onMoveEnd={onMoveEnd}
                  onSelect={onSelect}
                  register={(id, node) => {
                    if (node) nodeRefs.current.set(id, node);
                    else nodeRefs.current.delete(id);
                  }}
                  selected={selectedSet.has(element.id)}
                />
              ))}
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
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
