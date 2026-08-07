import type Konva from "konva";
import { useMemo, type ReactNode } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { AssetMetadata, GradientStop } from "../lib/schema";
import { getDevicePreset } from "../devices/presets";
import { deviceFrameSource } from "../devices/frame-assets";
import { calculateDeviceScreenGeometry } from "../devices/geometry";
import { AssetImageLayer, useLoadedImage } from "./image-loading";
import { konvaFontStyle } from "./text-style";
import { calculateTextAutoHeight } from "../scene/text-geometry";
import type { ResolvedElement } from "../scene/overflow";
import type { ResolvedScreen } from "../scene/selectors";
import { createBackgroundTextureTile } from "./background-texture";
import { fontCssFamily } from "../fonts/catalog";

export type SceneContentsProps = {
  screen: ResolvedScreen;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selectedElementIds?: readonly string[];
  interactive?: boolean;
  compact?: boolean;
  targetScreenId?: string;
  offsetX?: number;
  offsetY?: number;
  register?: (targetScreenId: string, elementId: string, node: Konva.Node | null) => void;
  onSelect?: (targetScreenId: string, elementId: string, additive: boolean) => void;
  onClearSelection?: (targetScreenId: string) => void;
  onGestureStart?: (label: string, targetScreenId: string) => void;
  onMoveEnd?: (targetScreenId: string, elementId: string, x: number, y: number) => void;
  children?: ReactNode;
};

export type SceneRendererProps = SceneContentsProps;

function colorStops(stops: GradientStop[]): Array<number | string> {
  return stops.flatMap((stop) => [stop.offset, stop.color]);
}

export function backgroundProps(screen: ResolvedScreen): Record<string, unknown> {
  if (screen.background.type === "solid") return { fill: screen.background.color };
  if (screen.background.type === "transparent") return { fill: "transparent" };
  if (screen.background.type === "linear-gradient") {
    return {
      fillLinearGradientColorStops: colorStops(screen.background.stops),
      fillLinearGradientStartPoint: { x: screen.background.start.x * screen.width, y: screen.background.start.y * screen.height },
      fillLinearGradientEndPoint: { x: screen.background.end.x * screen.width, y: screen.background.end.y * screen.height },
    };
  }
  if (screen.background.type === "asset") return {};
  return {
    fillRadialGradientColorStops: colorStops(screen.background.stops),
    fillRadialGradientStartPoint: { x: screen.background.center.x * screen.width, y: screen.background.center.y * screen.height },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: screen.background.center.x * screen.width, y: screen.background.center.y * screen.height },
    fillRadialGradientEndRadius: screen.background.radius * Math.max(screen.width, screen.height),
  };
}

function ScreenBackground({ screen, projectSlug, assets, interactive, compact, targetScreenId, onClearSelection }: { screen: ResolvedScreen; projectSlug: string; assets: readonly AssetMetadata[]; interactive: boolean; compact: boolean; targetScreenId: string; onClearSelection: (targetScreenId: string) => void }) {
  const texture = screen.background.type === "asset" ? screen.background.texture : null;
  const textureTile = useMemo(() => texture ? createBackgroundTextureTile(texture) : null, [texture]);
  const interactionProps = {
    listening: interactive,
    name: `screen-background-${targetScreenId}`,
    onClick: interactive ? () => onClearSelection(targetScreenId) : undefined,
  };

  if (screen.background.type !== "asset") {
    return <Rect {...backgroundProps(screen)} {...interactionProps} height={screen.height} width={screen.width} />;
  }

  const background = screen.background;
  return (
    <Group>
      <AssetImageLayer
        asset={assetFor(assets, background.assetPath)}
        assetPath={background.assetPath}
        blur={background.blur}
        cachePixelRatio={compact ? Math.min(1, 160 / Math.max(screen.width, screen.height)) : 1}
        compact={compact}
        cornerRadius={0}
        fit={background.fit}
        height={screen.height}
        label={`Missing background ${background.assetPath}`}
        position={background.position}
        projectSlug={projectSlug}
        width={screen.width}
      />
      {background.overlayOpacity > 0 ? <Rect fill={background.overlayColor} height={screen.height} listening={false} opacity={background.overlayOpacity} width={screen.width} /> : null}
      {texture && textureTile ? (
        <Rect
          fillPatternImage={textureTile as unknown as HTMLImageElement}
          fillPatternRepeat="repeat"
          fillPatternScaleX={texture.scale}
          fillPatternScaleY={texture.scale}
          height={screen.height}
          listening={false}
          opacity={texture.opacity}
          width={screen.width}
        />
      ) : null}
      {interactive ? <Rect fill="#000000" height={screen.height} opacity={0.001} width={screen.width} {...interactionProps} /> : null}
    </Group>
  );
}

function shadowProps(shadow: ResolvedElement["shadow"]): Record<string, unknown> {
  if (!shadow) return {};
  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowOpacity: shadow.opacity,
  };
}

function elementPosition(screen: ResolvedScreen, element: ResolvedElement) {
  const height = element.type === "text" && element.style.autoHeight !== false
    ? Math.min(screen.height, calculateTextAutoHeight(element.text, element.width, element.style))
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
  screen: ResolvedScreen;
  element: ResolvedElement;
  projectSlug: string;
  assets: readonly AssetMetadata[];
  selected: boolean;
  interactive: boolean;
  targetScreenId: string;
  register: (targetScreenId: string, elementId: string, node: Konva.Node | null) => void;
  onSelect: (targetScreenId: string, elementId: string, additive: boolean) => void;
  onGestureStart: (label: string, targetScreenId: string) => void;
  onMoveEnd: (targetScreenId: string, elementId: string, x: number, y: number) => void;
};

function ElementNode({ screen, element, projectSlug, assets, selected, interactive, targetScreenId, register, onSelect, onGestureStart, onMoveEnd }: ElementNodeProps) {
  if (!element.visible) return null;
  const draggable = interactive && !element.locked;
  const position = elementPosition(screen, element);
  const handleSelect = (event: KonvaEventObject<MouseEvent>) => {
    if (!interactive) return;
    event.cancelBubble = true;
    onSelect(targetScreenId, element.id, event.evt.shiftKey);
  };
  const handleTap = (event: KonvaEventObject<TouchEvent>) => {
    if (!interactive) return;
    event.cancelBubble = true;
    onSelect(targetScreenId, element.id, event.evt.shiftKey);
  };
  const handleDragStart = () => {
    if (!interactive || element.locked) return;
    if (!selected) onSelect(targetScreenId, element.id, false);
    onGestureStart("Move selection", targetScreenId);
  };
  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    if (!interactive || element.locked) return;
    onMoveEnd(targetScreenId, element.id, event.target.x(), event.target.y());
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
  const registerNode = (node: Konva.Node | null) => register(targetScreenId, element.id, node);

  if (element.type === "text") {
    const textShadow = element.style.shadow ?? element.shadow;
    const textHeight = position.height;
    return (
      <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
        <Rect cornerRadius={element.style.backgroundRadius ?? 0} fill={element.style.backgroundColor ?? "transparent"} height={textHeight} listening={false} width={element.width} />
        <Text
          align={element.style.align}
          fill={element.style.color}
          fontFamily={fontCssFamily(element.style.fontFamilyId)}
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
      return <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}><Ellipse {...shapeProps} radiusX={element.width / 2} radiusY={element.height / 2} x={element.width / 2} y={element.height / 2} /></Group>;
    }
    if (element.shape === "line") {
      return <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}><Line {...shapeProps} points={[0, element.height / 2, element.width, element.height / 2]} /></Group>;
    }
    return <Rect {...baseProps} cornerRadius={element.shape === "rounded-rectangle" ? element.radius : 0} name={`element-${element.id}`} ref={registerNode} stroke={element.stroke} strokeWidth={element.strokeWidth} fill={element.fill} />;
  }

  if (element.type === "image") {
    return (
      <Group {...baseProps} name={`element-${element.id}`} ref={registerNode}>
        <AssetImageLayer asset={assetFor(assets, element.assetPath)} assetPath={element.assetPath} cornerRadius={element.cornerRadius} fit={element.fit} height={element.height} label={`Missing ${element.assetPath}`} listening={interactive} position={element.position} projectSlug={projectSlug} width={element.width} />
      </Group>
    );
  }

  return (
    <DeviceNode
      assets={assets}
      element={element}
      interactive={interactive}
      name={`element-${element.id}`}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onSelect={handleSelect}
      onTap={handleTap}
      projectSlug={projectSlug}
      register={registerNode}
      screen={screen}
      selected={selected}
    />
  );
}

type DeviceNodeProps = {
  screen: ResolvedScreen;
  element: Extract<ResolvedElement, { type: "device" }>;
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

function DeviceNode({ screen, element, projectSlug, assets, interactive, selected, name, register, onSelect, onTap, onDragStart, onDragEnd }: DeviceNodeProps) {
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
    <Group {...elementPosition(screen, element)} {...baseProps} name={name} ref={register}>
      {!officialFrame ? <Rect {...frameFill} {...shadowProps(element.shadow)} cornerRadius={geometry.outer.radius} height={element.height} width={element.width} /> : null}
      <Rect cornerRadius={geometry.screen.radius} fill={element.screenColor} height={geometry.screen.height} listening={false} width={geometry.screen.width} x={geometry.screen.x} y={geometry.screen.y} />
      <Group listening={false} x={geometry.screen.x} y={geometry.screen.y}>
        <AssetImageLayer asset={screenshotAsset} assetPath={element.screenshotPath} backgroundColor={element.screenColor} compact={!interactive} cornerRadius={geometry.screen.radius} fit={element.screenshotFit} height={geometry.screen.height} label={element.screenshotPath ? `Missing ${element.screenshotPath}` : "Add a screenshot asset"} position={element.screenshotPosition} projectSlug={projectSlug} width={geometry.screen.width} />
      </Group>
      {isBrowser ? <BrowserHeader element={element} /> : null}
      {element.showGlare ? <Rect cornerRadius={geometry.screen.radius} fillLinearGradientColorStops={[0, "#ffffff00", 0.48, "#ffffff26", 0.58, "#ffffff00"]} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: element.width, y: element.height }} height={geometry.screen.height} listening={false} opacity={0.7} width={geometry.screen.width} x={geometry.screen.x} y={geometry.screen.y} /> : null}
      {officialFrame ? <KonvaImage {...shadowProps(element.shadow)} height={element.height} image={officialFrame} listening={interactive} width={element.width} /> : null}
      {!officialFrame && element.showCamera && geometry.camera ? <CameraDefinition geometry={geometry} /> : null}
      {selected && interactive ? <Rect cornerRadius={geometry.outer.radius} dash={[8, 6]} fill="transparent" height={element.height} listening={false} stroke="#dedede" strokeWidth={2} width={element.width} /> : null}
    </Group>
  );
}

function BrowserHeader({ element }: { element: Extract<ResolvedElement, { type: "device" }> }) {
  const height = element.height * 0.075;
  const inset = Math.max(12, element.width * 0.035);
  return <>
    <Ellipse fill="#f56f78" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset} y={height / 2} />
    <Ellipse fill="#e9b65a" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset * 2} y={height / 2} />
    <Ellipse fill="#6dc596" radiusX={Math.max(2, element.width * 0.008)} radiusY={Math.max(2, element.width * 0.008)} x={inset * 3} y={height / 2} />
    <Text fill="#aab1c1" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize={Math.max(8, element.width * 0.012)} listening={false} text={element.deviceName} width={element.width - inset * 4} x={inset * 4} y={height / 2 - 5} />
  </>;
}

function CameraDefinition({ geometry }: { geometry: ReturnType<typeof calculateDeviceScreenGeometry> }) {
  if (!geometry.camera) return null;
  if (geometry.cameraKind === "dynamic-island") return <Rect cornerRadius={geometry.camera.radius} fill="#05060a" height={geometry.camera.height} listening={false} width={geometry.camera.width} x={geometry.camera.x} y={geometry.camera.y} />;
  return <Ellipse fill="#05060a" listening={false} radiusX={geometry.camera.width / 2} radiusY={geometry.camera.height / 2} x={geometry.camera.x + geometry.camera.width / 2} y={geometry.camera.y + geometry.camera.height / 2} />;
}

export function SceneContents({ screen, projectSlug, assets, selectedElementIds = [], interactive = false, compact = false, targetScreenId = screen.id, offsetX = 0, offsetY = 0, register = () => undefined, onSelect = () => undefined, onClearSelection = () => undefined, onGestureStart = () => undefined, onMoveEnd = () => undefined, children }: SceneContentsProps) {
  const selectedSet = new Set(selectedElementIds);
  const orderedElements = [...screen.elements].sort((left, right) => left.renderOrder - right.renderOrder);
  return (
    <Group clipX={0} clipY={0} clipWidth={screen.width} clipHeight={screen.height} x={offsetX} y={offsetY}>
      <ScreenBackground assets={assets} compact={compact} interactive={interactive} onClearSelection={onClearSelection} projectSlug={projectSlug} screen={screen} targetScreenId={targetScreenId} />
      {orderedElements.map((element) => (
        <ElementNode
          assets={assets}
          element={element}
          interactive={interactive}
          key={`${targetScreenId}:${element.id}`}
          onGestureStart={onGestureStart}
          onMoveEnd={onMoveEnd}
          onSelect={onSelect}
          projectSlug={projectSlug}
          register={register}
          screen={screen}
          selected={selectedSet.has(element.id)}
          targetScreenId={targetScreenId}
        />
      ))}
      {children}
    </Group>
  );
}

export function SceneRenderer(props: SceneRendererProps) {
  return <Layer><SceneContents {...props} /></Layer>;
}
