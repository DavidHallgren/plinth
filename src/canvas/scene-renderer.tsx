import type Konva from "konva";
import type { ReactNode } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { AssetMetadata, Document, GradientStop, SceneElement } from "../lib/schema";
import { getDevicePreset } from "../devices/presets";
import { deviceFrameSource } from "../devices/frame-assets";
import { calculateDeviceScreenGeometry } from "../devices/geometry";
import { AssetImageLayer, useLoadedImage } from "./image-loading";
import { konvaFontStyle } from "./text-style";
import { calculateTextAutoHeight } from "../scene/text-geometry";

export type SceneRendererProps = {
  document: Document;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selectedElementIds?: readonly string[];
  interactive?: boolean;
  register?: (id: string, node: Konva.Node | null) => void;
  onSelect?: (elementId: string, additive: boolean) => void;
  onClearSelection?: () => void;
  onGestureStart?: (label: string) => void;
  onMoveEnd?: (elementId: string, x: number, y: number) => void;
  children?: ReactNode;
};

function colorStops(stops: GradientStop[]): Array<number | string> {
  return stops.flatMap((stop) => [stop.offset, stop.color]);
}

export function backgroundProps(document: Document): Record<string, unknown> {
  if (document.background.type === "solid") return { fill: document.background.color };
  if (document.background.type === "transparent") return { fill: "transparent" };
  if (document.background.type === "linear-gradient") {
    return {
      fillLinearGradientColorStops: colorStops(document.background.stops),
      fillLinearGradientStartPoint: { x: document.background.start.x * document.width, y: document.background.start.y * document.height },
      fillLinearGradientEndPoint: { x: document.background.end.x * document.width, y: document.background.end.y * document.height },
    };
  }
  return {
    fillRadialGradientColorStops: colorStops(document.background.stops),
    fillRadialGradientStartPoint: { x: document.background.center.x * document.width, y: document.background.center.y * document.height },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: document.background.center.x * document.width, y: document.background.center.y * document.height },
    fillRadialGradientEndRadius: document.background.radius * Math.max(document.width, document.height),
  };
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

function elementPosition(document: Document, element: SceneElement) {
  const height = element.type === "text" && element.style.autoHeight !== false
    ? Math.min(document.height, calculateTextAutoHeight(element.text, element.width, element.style))
    : element.height;
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height,
    rotation: element.rotation,
    opacity: element.opacity,
  };
}

function assetFor(assets: readonly AssetMetadata[], path: string | null | undefined): AssetMetadata | undefined {
  return path ? assets.find((asset) => asset.path === path) : undefined;
}

type ElementNodeProps = {
  document: Document;
  element: SceneElement;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selected: boolean;
  interactive: boolean;
  register: (id: string, node: Konva.Node | null) => void;
  onSelect: (elementId: string, additive: boolean) => void;
  onGestureStart: (label: string) => void;
  onMoveEnd: (elementId: string, x: number, y: number) => void;
};

function ElementNode({ document, element, projectSlug, assets, selected, interactive, register, onSelect, onGestureStart, onMoveEnd }: ElementNodeProps) {
  if (!element.visible) return null;
  const draggable = interactive && !element.locked;
  const position = elementPosition(document, element);
  const handleSelect = (event: KonvaEventObject<MouseEvent>) => {
    if (!interactive) return;
    event.cancelBubble = true;
    onSelect(element.id, event.evt.shiftKey);
  };
  const handleTap = (event: KonvaEventObject<TouchEvent>) => {
    if (!interactive) return;
    event.cancelBubble = true;
    onSelect(element.id, event.evt.shiftKey);
  };
  const handleDragStart = () => {
    if (!interactive || element.locked) return;
    if (!selected) onSelect(element.id, false);
    onGestureStart("Move selection");
  };
  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    if (!interactive || element.locked) return;
    onMoveEnd(element.id, event.target.x(), event.target.y());
  };
  const baseProps = {
    ...position,
    draggable,
    listening: interactive,
    onClick: interactive ? handleSelect : undefined,
    onTap: interactive ? handleTap : undefined,
    onDragStart: interactive ? handleDragStart : undefined,
    onDragEnd: interactive ? handleDragEnd : undefined,
    ...shadowProps(element.shadow),
  };
  const registerNode = (node: Konva.Node | null) => register(element.id, node);

  if (element.type === "text") {
    const textShadow = element.style.shadow ?? element.shadow;
    const textHeight = position.height;
    return (
      <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
        <Rect
          cornerRadius={element.style.backgroundRadius ?? 0}
          fill={element.style.backgroundColor ?? "transparent"}
          height={textHeight}
          listening={false}
          width={element.width}
        />
        <Text
          align={element.style.align}
          fill={element.style.color}
          fontFamily={element.style.fontFamily}
          fontSize={element.style.fontSize}
          fontStyle={konvaFontStyle(element.style.fontWeight, element.style.italic ?? false)}
          height={textHeight}
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
    const shapeProps = { fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth };
    if (element.shape === "ellipse") {
      return (
        <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
          <Ellipse {...shapeProps} radiusX={element.width / 2} radiusY={element.height / 2} x={element.width / 2} y={element.height / 2} />
        </Group>
      );
    }
    if (element.shape === "line") {
      return (
        <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
          <Line {...shapeProps} points={[0, element.height / 2, element.width, element.height / 2]} />
        </Group>
      );
    }
    return <Rect {...baseProps} cornerRadius={element.shape === "rounded-rectangle" ? element.radius : 0} name={`element-${element.id}`} ref={registerNode} stroke={element.stroke} strokeWidth={element.strokeWidth} fill={element.fill} />;
  }

  if (element.type === "image") {
    return (
      <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
        <AssetImageLayer
          asset={assetFor(assets, element.assetPath)}
          assetPath={element.assetPath}
          cornerRadius={element.cornerRadius}
          fit={element.fit}
          height={element.height}
          label={`Missing ${element.assetPath}`}
          listening={interactive}
          position={element.position}
          projectSlug={projectSlug}
          width={element.width}
        />
      </Group>
    );
  }

  return (
    <DeviceNode
      assets={assets}
      document={document}
      element={element}
      interactive={interactive}
      name={`element-${element.id}`}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onSelect={handleSelect}
      onTap={handleTap}
      projectSlug={projectSlug}
      register={registerNode}
      selected={selected}
    />
  );
}

type DeviceNodeProps = {
  document: Document;
  element: Extract<SceneElement, { type: "device" }>;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  interactive: boolean;
  selected: boolean;
  name: string;
  register: (node: Konva.Node | null) => void;
  onSelect: (event: KonvaEventObject<MouseEvent>) => void;
  onTap: (event: KonvaEventObject<TouchEvent>) => void;
  onDragStart: () => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
};

function DeviceNode({ document, element, projectSlug, assets, interactive, selected, name, register, onSelect, onTap, onDragStart, onDragEnd }: DeviceNodeProps) {
  const preset = getDevicePreset(element.preset) ?? getDevicePreset("generic-modern-iphone");
  if (!preset) return null;
  const geometry = calculateDeviceScreenGeometry(preset, element.width, element.height, element.cornerRadius, element.screenCornerRadius);
  const frameFill = element.bezelStyle === "metallic" ? {
    fillLinearGradientColorStops: [0, "#ffffff55", 0.22, element.frameColor, 0.55, "#ffffff28", 1, element.frameColor],
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: element.width, y: element.height },
  } : { fill: element.frameColor };
  const baseProps = {
    draggable: interactive && !element.locked,
    listening: interactive,
    onClick: interactive ? onSelect : undefined,
    onTap: interactive ? onTap : undefined,
    onDragStart: interactive ? onDragStart : undefined,
    onDragEnd: interactive ? onDragEnd : undefined,
  };
  const screenshotAsset = assetFor(assets, element.screenshotPath);
  const isBrowser = element.preset === "browser-window" || element.frame === "browser";
  const frameSource = element.showCamera ? deviceFrameSource(element.preset, element.frameColor) : null;
  const frameResource = useLoadedImage(frameSource);
  const officialFrame = frameResource.status === "ready" ? frameResource.image : null;
  return (
    <Group {...elementPosition(document, element)} {...baseProps} name={name} ref={register}>
      {!officialFrame ? <Rect {...frameFill} {...shadowProps(element.shadow)} cornerRadius={geometry.outer.radius} height={element.height} width={element.width} /> : null}
      <Rect cornerRadius={geometry.screen.radius} fill={element.screenColor} height={geometry.screen.height} listening={false} width={geometry.screen.width} x={geometry.screen.x} y={geometry.screen.y} />
      <Group listening={false} x={geometry.screen.x} y={geometry.screen.y}>
        <AssetImageLayer
          asset={screenshotAsset}
          assetPath={element.screenshotPath}
          backgroundColor={element.screenColor}
          compact={!interactive}
          cornerRadius={geometry.screen.radius}
          fit={element.screenshotFit}
          height={geometry.screen.height}
          label={element.screenshotPath ? `Missing ${element.screenshotPath}` : "Add a screenshot asset"}
          position={element.screenshotPosition}
          projectSlug={projectSlug}
          width={geometry.screen.width}
        />
      </Group>
      {isBrowser ? <BrowserHeader element={element} /> : null}
      {element.showGlare ? <Rect cornerRadius={geometry.screen.radius} fillLinearGradientColorStops={[0, "#ffffff00", 0.48, "#ffffff26", 0.58, "#ffffff00"]} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: element.width, y: element.height }} height={geometry.screen.height} listening={false} opacity={0.7} width={geometry.screen.width} x={geometry.screen.x} y={geometry.screen.y} /> : null}
      {officialFrame ? <KonvaImage {...shadowProps(element.shadow)} height={element.height} image={officialFrame} listening={interactive} width={element.width} /> : null}
      {!officialFrame && element.showCamera && geometry.camera ? <CameraDefinition geometry={geometry} /> : null}
      {selected && interactive ? <Rect cornerRadius={geometry.outer.radius} dash={[8, 6]} fill="transparent" height={element.height} listening={false} stroke="#dedede" strokeWidth={2} width={element.width} /> : null}
    </Group>
  );
}

function BrowserHeader({ element }: { element: Extract<SceneElement, { type: "device" }> }) {
  const height = element.height * 0.075;
  const inset = Math.max(12, element.width * 0.035);
  return (
    <>
      <Ellipse fill="#f56f78" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset} y={height / 2} />
      <Ellipse fill="#e9b65a" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset * 2} y={height / 2} />
      <Ellipse fill="#6dc596" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset * 3} y={height / 2} />
      <Text fill="#aab1c1" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize={Math.max(8, element.width * 0.012)} listening={false} text={element.deviceName} width={element.width - inset * 4} x={inset * 4} y={height / 2 - 5} />
    </>
  );
}

function CameraDefinition({ geometry }: { geometry: ReturnType<typeof calculateDeviceScreenGeometry> }) {
  if (!geometry.camera) return null;
  if (geometry.cameraKind === "dynamic-island") {
    return <Rect cornerRadius={geometry.camera.radius} fill="#05060a" height={geometry.camera.height} listening={false} width={geometry.camera.width} x={geometry.camera.x} y={geometry.camera.y} />;
  }
  return <Ellipse fill="#05060a" listening={false} radiusX={geometry.camera.width / 2} radiusY={geometry.camera.height / 2} x={geometry.camera.x + geometry.camera.width / 2} y={geometry.camera.y + geometry.camera.height / 2} />;
}

export function SceneRenderer({ document, projectSlug, assets, selectedElementIds = [], interactive = false, register = () => undefined, onSelect = () => undefined, onClearSelection = () => undefined, onGestureStart = () => undefined, onMoveEnd = () => undefined, children }: SceneRendererProps) {
  const selectedSet = new Set(selectedElementIds);
  const orderedElements = [...document.elements].sort((left, right) => left.zIndex - right.zIndex);
  return (
    <Layer>
      <Rect {...backgroundProps(document)} height={document.height} listening={interactive} name="document-background" onClick={interactive ? onClearSelection : undefined} width={document.width} />
      {orderedElements.map((element) => (
        <ElementNode
          assets={assets}
          document={document}
          element={element}
          interactive={interactive}
          key={element.id}
          onGestureStart={onGestureStart}
          onMoveEnd={onMoveEnd}
          onSelect={onSelect}
          projectSlug={projectSlug}
          register={register}
          selected={selectedSet.has(element.id)}
        />
      ))}
      {children}
    </Layer>
  );
}
