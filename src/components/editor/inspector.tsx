import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  ChevronDown,
  Eye,
  EyeOff,
  Link2,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getDevicePreset, type DevicePresetId } from "../../devices/presets";
import type { AssetMetadata, Background, ProjectFontFamily, SceneElement, Shadow } from "../../lib/schema";
import { getBuiltInFont, fontWeightRange } from "../../fonts/catalog";
import type { ResolvedScreen } from "../../scene/selectors";
import type { ElementAlignment, ElementDistribution, ElementPatch, ElementUpdate } from "../../scene/element-operations";
import type { ScreenPatch } from "../../scene/structure-operations";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FramePresetMenu } from "./frame-preset-menu";
import { FontPicker } from "./font-picker";

const selectClass = "plinth-focus-ring h-8 w-full rounded-lg border border-line bg-[#111111] px-2 text-xs text-ink outline-none focus:border-accent/70";
type InspectorProps = {
  screen: ResolvedScreen;
  assets: readonly AssetMetadata[];
  projectFonts: readonly ProjectFontFamily[];
  fontBusy: boolean;
  onChangeTextFont: (elementId: string, fontFamilyId: string, fontWeight: number, italic: boolean) => Promise<boolean>;
  onUploadFont: (file: File) => Promise<ProjectFontFamily | null>;
  onDeleteFont: (font: ProjectFontFamily) => Promise<void>;
  selectedElements: SceneElement[];
  onUpdateScreen: (patch: ScreenPatch) => void;
  onUpdateElement: (elementId: string, patch: ElementPatch) => void;
  onUpdateElements: (updates: ElementUpdate[]) => void;
  onAlignSelection: (alignment: ElementAlignment) => void;
  onDistributeSelection: (distribution: ElementDistribution) => void;
  onConvertImageToFrame: (elementId: string, presetId: DevicePresetId) => void;
  onToggleOverflow: (elementId: string, enabled: boolean) => void;
  onMoveOwnership: (elementId: string) => void;
  ownerScreenName?: string;
};

export function Inspector({ screen, assets, projectFonts, fontBusy, onChangeTextFont, onUploadFont, onDeleteFont, selectedElements, onUpdateScreen, onUpdateElement, onUpdateElements, onAlignSelection, onDistributeSelection, onConvertImageToFrame, onToggleOverflow, onMoveOwnership, ownerScreenName }: InspectorProps) {
  if (selectedElements.length === 0) {
    return <ScreenInspector assets={assets} screen={screen} onUpdate={onUpdateScreen} />;
  }
  if (selectedElements.length > 1) {
    return <MultiSelectionInspector elements={selectedElements} onAlignSelection={onAlignSelection} onDistributeSelection={onDistributeSelection} onUpdateElements={onUpdateElements} />;
  }
  const element = selectedElements[0];
  if (!element) return null;
  const resolved = screen.elements.find((candidate) => candidate.id === element.id);
  const ownedLayer = screen.layers.find((layer): layer is Extract<typeof layer, { kind: "owned" }> => layer.kind === "owned" && layer.element.id === element.id);
  const ownerScreen = resolved?.ownerScreenId === screen.id ? undefined : resolved?.ownerScreenId;
  return <ElementInspector element={element} fontBusy={fontBusy} isLinked={Boolean(resolved?.isOverflowLink)} onChangeTextFont={onChangeTextFont} onConvertImageToFrame={onConvertImageToFrame} onDeleteFont={onDeleteFont} onMoveOwnership={onMoveOwnership} onToggleOverflow={onToggleOverflow} onUpdate={onUpdateElement} onUploadFont={onUploadFont} overflowEnabled={Boolean(ownedLayer?.overflow) || screen.layers.some((layer) => layer.kind === "overflow-link" && layer.elementId === element.id)} ownerScreenName={ownerScreen ? ownerScreenName : undefined} projectFonts={projectFonts} />;
}

function ScreenInspector({ screen, assets, onUpdate }: { screen: ResolvedScreen; assets: readonly AssetMetadata[]; onUpdate: (patch: ScreenPatch) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title="Screen" detail={`${screen.width} × ${screen.height} · ${screen.deckName}`} />
      <Section title="Identity">
        <Field label="Name"><Input onChange={(event) => onUpdate({ name: event.target.value })} value={screen.name} /></Field>
        <Field label="Export name"><Input onChange={(event) => onUpdate({ exportSlug: event.target.value })} value={screen.exportSlug} /></Field>
      </Section>
      <Section title="Background">
        <BackgroundControls assets={assets} background={screen.background} onChange={(background) => onUpdate({ background })} />
      </Section>
    </div>
  );
}

function MultiSelectionInspector({ elements, onUpdateElements, onAlignSelection, onDistributeSelection }: { elements: SceneElement[]; onUpdateElements: (updates: ElementUpdate[]) => void; onAlignSelection: (alignment: ElementAlignment) => void; onDistributeSelection: (distribution: ElementDistribution) => void }) {
  const opacity = elements.every((element) => element.opacity === elements[0]?.opacity) ? elements[0]?.opacity ?? 1 : undefined;
  const locked = elements.every((element) => element.locked);
  const visible = elements.every((element) => element.visible);
  const editableCount = elements.filter((element) => !element.locked).length;
  const alignmentActions: Array<{ alignment: ElementAlignment; label: string; icon: React.ReactNode }> = [
    { alignment: "left", label: "Align left", icon: <AlignHorizontalJustifyStart size={14} /> },
    { alignment: "horizontal-center", label: "Align horizontal centers", icon: <AlignHorizontalJustifyCenter size={14} /> },
    { alignment: "right", label: "Align right", icon: <AlignHorizontalJustifyEnd size={14} /> },
    { alignment: "top", label: "Align top", icon: <AlignVerticalJustifyStart size={14} /> },
    { alignment: "vertical-center", label: "Align vertical centers", icon: <AlignVerticalJustifyCenter size={14} /> },
    { alignment: "bottom", label: "Align bottom", icon: <AlignVerticalJustifyEnd size={14} /> },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title="Selection" detail={`${elements.length} layers`} />
      <Section title="Arrange">
        <div className="grid grid-cols-3 gap-1.5">
          {alignmentActions.map(({ alignment, label, icon }) => <Button aria-label={label} disabled={editableCount < 2} key={alignment} onClick={() => onAlignSelection(alignment)} size="icon" tooltip={label} variant="secondary">{icon}</Button>)}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Button disabled={editableCount < 3} onClick={() => onDistributeSelection("horizontal")} size="sm" tooltip="Equal horizontal gaps" variant="secondary"><AlignHorizontalSpaceBetween size={14} /> Horizontal</Button>
          <Button disabled={editableCount < 3} onClick={() => onDistributeSelection("vertical")} size="sm" tooltip="Equal vertical gaps" variant="secondary"><AlignVerticalSpaceBetween size={14} /> Vertical</Button>
        </div>
        {editableCount !== elements.length ? <p className="mt-2 text-[10px] leading-4 text-muted">Locked layers are excluded. {editableCount} editable layer{editableCount === 1 ? "" : "s"} selected.</p> : null}
      </Section>
      <Section title="Common properties">
        <Field label="Opacity"><NumberField max={1} min={0} onChange={(value) => onUpdateElements(elements.map((element) => ({ id: element.id, patch: { opacity: value } })))} step={0.05} value={opacity ?? 1} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton active={visible} icon={visible ? <Eye size={13} /> : <EyeOff size={13} />} label={visible ? "Visible" : "Hidden"} onClick={() => onUpdateElements(elements.map((element) => ({ id: element.id, patch: { visible: !visible } })))} />
          <ToggleButton active={!locked} icon={locked ? <Lock size={13} /> : <Unlock size={13} />} label={locked ? "Locked" : "Editable"} onClick={() => onUpdateElements(elements.map((element) => ({ id: element.id, patch: { locked: !locked } })))} />
        </div>
      </Section>
      <p className="mt-4 text-xs leading-5 text-muted">Shift-click to edit multiple layers.</p>
    </div>
  );
}

function ElementInspector({ element, projectFonts, fontBusy, onChangeTextFont, onUploadFont, onDeleteFont, onUpdate, onConvertImageToFrame, overflowEnabled, onToggleOverflow, isLinked, ownerScreenName, onMoveOwnership }: { element: SceneElement; projectFonts: readonly ProjectFontFamily[]; fontBusy: boolean; onChangeTextFont: InspectorProps["onChangeTextFont"]; onUploadFont: (file: File) => Promise<ProjectFontFamily | null>; onDeleteFont: (font: ProjectFontFamily) => Promise<void>; onUpdate: (id: string, patch: ElementPatch) => void; onConvertImageToFrame: (elementId: string, presetId: DevicePresetId) => void; overflowEnabled: boolean; onToggleOverflow: (elementId: string, enabled: boolean) => void; isLinked: boolean; ownerScreenName?: string; onMoveOwnership: (elementId: string) => void }) {
  const update = (patch: ElementPatch) => onUpdate(element.id, patch);
  const elementTypeLabel = element.type === "device" ? "frame" : element.type;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title={element.name} detail={isLinked ? `${elementTypeLabel} · linked projection` : elementTypeLabel} />
      {isLinked ? <div className="mb-3 rounded-lg border border-accent/20 bg-accent/[0.08] px-2.5 py-2 text-[10px] leading-4 text-muted">Editing the canonical element owned by {ownerScreenName ?? "another screen"}. Changes apply to every projection.</div> : null}
      <Section title="Transform">
        <Field label="Name"><Input onChange={(event) => update({ name: event.target.value })} value={element.name} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X"><NumberField disabled={element.locked} onChange={(value) => update({ x: value })} value={element.x} /></Field>
          <Field label="Y"><NumberField disabled={element.locked} onChange={(value) => update({ y: value })} value={element.y} /></Field>
          <Field label="Width"><NumberField disabled={element.locked} min={1} onChange={(value) => update({ width: value })} value={element.width} /></Field>
          <Field label="Height"><NumberField disabled={element.locked} min={1} onChange={(value) => update({ height: value })} value={element.height} /></Field>
          <Field label="Rotation"><NumberField disabled={element.locked} max={360} min={-360} onChange={(value) => update({ rotation: value })} value={element.rotation} /></Field>
          <Field label="Opacity"><NumberField max={1} min={0} onChange={(value) => update({ opacity: value })} step={0.05} value={element.opacity} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton active={element.visible} icon={element.visible ? <Eye size={13} /> : <EyeOff size={13} />} label={element.visible ? "Visible" : "Hidden"} onClick={() => update({ visible: !element.visible })} />
          <ToggleButton active={!element.locked} icon={element.locked ? <Lock size={13} /> : <Unlock size={13} />} label={element.locked ? "Locked" : "Editable"} onClick={() => update({ locked: !element.locked })} />
          <ToggleButton active={overflowEnabled} icon={<Link2 size={13} />} label="Overflow" onClick={() => onToggleOverflow(element.id, !overflowEnabled)} />
        </div>
        {isLinked ? <Button onClick={() => onMoveOwnership(element.id)} size="sm" variant="secondary">Move ownership here</Button> : null}
      </Section>
      {element.type === "text" ? <TextControls element={element} fontBusy={fontBusy} onChangeTextFont={onChangeTextFont} onDeleteFont={onDeleteFont} onUpdate={update} onUploadFont={onUploadFont} projectFonts={projectFonts} /> : null}
      {element.type === "shape" ? <ShapeControls element={element} onUpdate={update} /> : null}
      {element.type === "device" ? <FrameControls element={element} onUpdate={update} /> : null}
      {element.type === "image" ? <ImageControls element={element} onAddFrame={(presetId) => onConvertImageToFrame(element.id, presetId)} onUpdate={update} /> : null}
    </div>
  );
}

function TextControls({ element, projectFonts, fontBusy, onChangeTextFont, onUploadFont, onDeleteFont, onUpdate }: { element: Extract<SceneElement, { type: "text" }>; projectFonts: readonly ProjectFontFamily[]; fontBusy: boolean; onChangeTextFont: InspectorProps["onChangeTextFont"]; onUploadFont: (file: File) => Promise<ProjectFontFamily | null>; onDeleteFont: (font: ProjectFontFamily) => Promise<void>; onUpdate: (patch: ElementPatch) => void }) {
  const style = element.style;
  const builtIn = style.fontFamilyId.startsWith("builtin:") ? getBuiltInFont(style.fontFamilyId as `builtin:${string}`) : undefined;
  const projectFont = projectFonts.find((font) => font.id === style.fontFamilyId);
  const defaultRange = fontWeightRange(style.fontFamilyId);
  const weightMin = projectFont ? Math.min(...projectFont.faces.map((face) => face.weightMin)) : defaultRange.min;
  const weightMax = projectFont ? Math.max(...projectFont.faces.map((face) => face.weightMax)) : defaultRange.max;
  const projectVariable = projectFont?.faces.some((face) => face.weightMin !== face.weightMax) ?? false;
  const projectWeights = projectFont ? [...new Set(projectFont.faces.flatMap((face) => [face.weightMin, face.weightMax]))].sort((left, right) => left - right) : [];
  const italicAvailable = builtIn ? builtIn.styles.includes("italic") : projectFont?.faces.some((face) => face.style === "italic" && style.fontWeight >= face.weightMin && style.fontWeight <= face.weightMax) ?? false;
  function updateStyle(values: Partial<typeof element.style>) {
    onUpdate({ style: { ...style, ...values } });
  }
  function selectFont(fontFamilyId: string): Promise<boolean> {
    const nextBuiltIn = fontFamilyId.startsWith("builtin:") ? getBuiltInFont(fontFamilyId as `builtin:${string}`) : undefined;
    const nextProject = projectFonts.find((font) => font.id === fontFamilyId);
    let fontWeight = style.fontWeight;
    if (nextBuiltIn?.weight.kind === "variable") fontWeight = Math.min(nextBuiltIn.weight.max, Math.max(nextBuiltIn.weight.min, fontWeight));
    if (nextBuiltIn?.weight.kind === "static") fontWeight = nextBuiltIn.weight.values.reduce((closest, candidate) => Math.abs(candidate - fontWeight) < Math.abs(closest - fontWeight) ? candidate : closest, nextBuiltIn.weight.values[0] ?? 400);
    if (nextProject) {
      const variableFace = nextProject.faces.find((face) => face.weightMin !== face.weightMax);
      const weights = nextProject.faces.flatMap((face) => [face.weightMin, face.weightMax]);
      fontWeight = variableFace
        ? Math.min(variableFace.weightMax, Math.max(variableFace.weightMin, fontWeight))
        : weights.reduce((closest, candidate) => Math.abs(candidate - fontWeight) < Math.abs(closest - fontWeight) ? candidate : closest, weights[0] ?? 400);
    }
    return onChangeTextFont(element.id, fontFamilyId, fontWeight, false);
  }
  return (
    <Section title="Text">
      <Field label="Content"><textarea className="plinth-focus-ring min-h-20 w-full resize-y rounded-lg border border-line bg-[#111111] px-2.5 py-2 text-xs leading-5 text-ink outline-none focus:border-accent/70" onChange={(event) => onUpdate({ text: event.target.value })} value={element.text} /></Field>
      <Field label="Font">
        <FontPicker busy={fontBusy} onChange={selectFont} onDelete={onDeleteFont} onUpload={onUploadFont} projectFonts={projectFonts} value={style.fontFamilyId} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size"><NumberField min={1} onChange={(value) => updateStyle({ fontSize: value })} value={style.fontSize} /></Field>
        <Field label="Weight">{projectFont && !projectVariable
          ? <select className={selectClass} onChange={(event) => { void onChangeTextFont(element.id, style.fontFamilyId, Number(event.target.value), false); }} value={projectWeights.includes(style.fontWeight) ? style.fontWeight : projectWeights[0]}>{projectWeights.map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select>
          : <NumberField max={weightMax} min={weightMin} onChange={(value) => { void onChangeTextFont(element.id, style.fontFamilyId, Math.round(value), style.italic ?? false); }} step={defaultRange.step} value={style.fontWeight} />}</Field>
        <Field label="Line height"><NumberField min={0.5} onChange={(value) => updateStyle({ lineHeight: value })} step={0.05} value={style.lineHeight} /></Field>
        <Field label="Letter spacing"><NumberField onChange={(value) => updateStyle({ letterSpacing: value })} step={0.5} value={style.letterSpacing} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleButton active={Boolean(style.italic)} disabled={!italicAvailable} label={italicAvailable ? "Italic" : "No italic"} onClick={() => { void onChangeTextFont(element.id, style.fontFamilyId, style.fontWeight, !style.italic); }} />
        <ToggleButton active={Boolean(style.underline)} label="Underline" onClick={() => updateStyle({ underline: !style.underline })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["left", "center", "right"] as const).map((align) => <button aria-pressed={style.align === align} className={`h-8 rounded-lg border text-xs ${style.align === align ? "border-accent/40 bg-accent/[0.12] text-accent-soft" : "border-line text-muted hover:text-ink"}`} key={align} onClick={() => updateStyle({ align })} type="button">{align}</button>)}
      </div>
      <Field label="Text color"><ColorField onChange={(color) => { if (color) updateStyle({ color }); }} value={style.color} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Background"><ColorField allowNone onChange={(backgroundColor) => updateStyle({ backgroundColor })} value={style.backgroundColor ?? ""} /></Field>
        <Field label="Radius"><NumberField min={0} onChange={(value) => updateStyle({ backgroundRadius: value })} value={style.backgroundRadius ?? 0} /></Field>
        <Field label="Padding"><NumberField min={0} onChange={(value) => updateStyle({ padding: value })} value={style.padding ?? 0} /></Field>
        <Field label="Height mode"><select className={selectClass} onChange={(event) => updateStyle({ autoHeight: event.target.value === "auto" })} value={style.autoHeight === false ? "fixed" : "auto"}><option value="auto">Auto</option><option value="fixed">Fixed</option></select></Field>
      </div>
      <ShadowControls shadow={style.shadow} onChange={(shadow) => updateStyle({ shadow })} />
    </Section>
  );
}

function ShapeControls({ element, onUpdate }: { element: Extract<SceneElement, { type: "shape" }>; onUpdate: (patch: ElementPatch) => void }) {
  return (
    <Section title="Shape">
      <Field label="Type"><select className={selectClass} onChange={(event) => onUpdate({ shape: event.target.value as Extract<typeof element.shape, string> })} value={element.shape}><option value="rectangle">Rectangle</option><option value="rounded-rectangle">Rounded rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option></select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fill"><ColorField onChange={(fill) => { if (fill) onUpdate({ fill }); }} value={element.fill} /></Field>
        <Field label="Stroke"><ColorField onChange={(stroke) => { if (stroke) onUpdate({ stroke }); }} value={element.stroke} /></Field>
        <Field label="Stroke width"><NumberField min={0} onChange={(strokeWidth) => onUpdate({ strokeWidth })} value={element.strokeWidth} /></Field>
        <Field label="Radius"><NumberField min={0} onChange={(radius) => onUpdate({ radius })} value={element.radius} /></Field>
      </div>
      <ShadowControls shadow={element.shadow} onChange={(shadow) => onUpdate({ shadow })} />
    </Section>
  );
}

function FrameControls({ element, onUpdate }: { element: Extract<SceneElement, { type: "device" }>; onUpdate: (patch: ElementPatch) => void }) {
  const preset = getDevicePreset(element.preset);
  const selectedFinish = preset?.frameFinishes?.some((finish) => finish.color === element.frameColor) ? element.frameColor : preset?.defaultFrameColor;
  return (
    <Section title="Frame">
      <Field label="Preset"><FramePresetMenu disabled={element.locked} label={preset?.label ?? "Choose frame"} onSelect={(presetId) => {
        const nextPreset = getDevicePreset(presetId);
        if (!nextPreset) return;
        const nextWidth = element.height * nextPreset.aspectRatio;
        onUpdate({
          preset: presetId,
          deviceId: presetId,
          deviceName: nextPreset.label,
          frame: presetId.includes("ipad") ? "tablet" : "phone",
          frameColor: nextPreset.defaultFrameColor,
          screenColor: nextPreset.defaultScreenColor,
          cornerRadius: null,
          screenCornerRadius: null,
          width: nextWidth,
          x: element.x + (element.width - nextWidth) / 2,
        });
      }} value={element.preset} /></Field>
      <Field label="Image"><p className="truncate rounded-lg border border-line bg-black/20 px-2 py-2 text-[11px] text-muted" title={element.screenshotPath ?? "No image selected"}>{element.screenshotPath ? assetFileName(element.screenshotPath) : "No image selected"}</p></Field>
      <div className="grid grid-cols-2 gap-2">{preset?.frameFinishes ? <Field label="Frame finish"><select className={selectClass} onChange={(event) => onUpdate({ frameColor: event.target.value })} value={selectedFinish}>{preset.frameFinishes.map((finish) => <option key={finish.color} value={finish.color}>{finish.label}</option>)}</select></Field> : <Field label="Frame color"><ColorField onChange={(frameColor) => { if (frameColor) onUpdate({ frameColor }); }} value={element.frameColor} /></Field>}<Field label="Screen color"><ColorField onChange={(screenColor) => { if (screenColor) onUpdate({ screenColor }); }} value={element.screenColor} /></Field></div>
      <Field label="Image fit"><select className={selectClass} onChange={(event) => onUpdate({ screenshotFit: event.target.value as "contain" | "cover" | "stretch" })} value={element.screenshotFit}><option value="cover">Cover / crop</option><option value="contain">Contain</option><option value="stretch">Stretch</option></select></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Focal X"><NumberField max={1} min={0} onChange={(x) => onUpdate({ screenshotPosition: { ...element.screenshotPosition, x } })} step={0.05} value={element.screenshotPosition.x} /></Field><Field label="Focal Y"><NumberField max={1} min={0} onChange={(y) => onUpdate({ screenshotPosition: { ...element.screenshotPosition, y } })} step={0.05} value={element.screenshotPosition.y} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Bezel"><select className={selectClass} onChange={(event) => onUpdate({ bezelStyle: event.target.value as "solid" | "metallic" })} value={element.bezelStyle}><option value="solid">Solid</option><option value="metallic">Metallic</option></select></Field><Field label="Outer radius"><NumberField min={0} onChange={(cornerRadius) => onUpdate({ cornerRadius })} value={element.cornerRadius ?? 0} /></Field><Field label="Screen radius"><NumberField min={0} onChange={(screenCornerRadius) => onUpdate({ screenCornerRadius })} value={element.screenCornerRadius ?? 0} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><ToggleButton active={element.showCamera} label="Camera" onClick={() => onUpdate({ showCamera: !element.showCamera })} /><ToggleButton active={element.showGlare} label="Glare" onClick={() => onUpdate({ showGlare: !element.showGlare })} /></div>
      <ShadowControls shadow={element.shadow} onChange={(shadow) => onUpdate({ shadow })} />
    </Section>
  );
}

function ImageControls({ element, onAddFrame, onUpdate }: { element: Extract<SceneElement, { type: "image" }>; onAddFrame: (presetId: DevicePresetId) => void; onUpdate: (patch: ElementPatch) => void }) {
  return (
    <Section title="Image">
      <FramePresetMenu disabled={element.locked} label="Add frame" onSelect={onAddFrame} />
      <Field label="Image"><p className="truncate rounded-lg border border-line bg-black/20 px-2 py-2 text-[11px] text-muted" title={element.assetPath}>{assetFileName(element.assetPath)}</p></Field>
      <Field label="Alt text"><Input onChange={(event) => onUpdate({ alt: event.target.value })} value={element.alt} /></Field>
      <Field label="Fit"><select className={selectClass} onChange={(event) => onUpdate({ fit: event.target.value as "contain" | "cover" | "stretch" })} value={element.fit}><option value="cover">Cover / crop</option><option value="contain">Contain</option><option value="stretch">Stretch</option></select></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Focal X"><NumberField max={1} min={0} onChange={(x) => onUpdate({ position: { ...element.position, x } })} step={0.05} value={element.position.x} /></Field><Field label="Focal Y"><NumberField max={1} min={0} onChange={(y) => onUpdate({ position: { ...element.position, y } })} step={0.05} value={element.position.y} /></Field><Field label="Corner radius"><NumberField min={0} onChange={(cornerRadius) => onUpdate({ cornerRadius })} value={element.cornerRadius} /></Field></div>
      <ShadowControls shadow={element.shadow} onChange={(shadow) => onUpdate({ shadow })} />
    </Section>
  );
}

function assetFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function BackgroundControls({ background, assets, onChange }: { background: Background; assets: readonly AssetMetadata[]; onChange: (background: Background) => void }) {
  return (
    <div className="space-y-3">
      <select className={selectClass} onChange={(event) => {
        if (event.target.value === "solid") onChange({ type: "solid", color: "#10131a" });
        if (event.target.value === "linear-gradient") onChange({ type: "linear-gradient", stops: [{ offset: 0, color: "#14182a" }, { offset: 1, color: "#8b7cff" }], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
        if (event.target.value === "radial-gradient") onChange({ type: "radial-gradient", stops: [{ offset: 0, color: "#f3c1da" }, { offset: 1, color: "#27203d" }], center: { x: 0.5, y: 0.5 }, radius: 0.85 });
        if (event.target.value === "transparent") onChange({ type: "transparent" });
        if (event.target.value === "asset" && assets[0]) onChange({ type: "asset", assetPath: assets[0].path, fit: "cover", position: { x: 0.5, y: 0.5 }, blur: 0, overlayColor: "#000000", overlayOpacity: 0, texture: null });
      }} value={background.type}>
        <option value="solid">Solid</option>
        <option value="linear-gradient">Linear gradient</option>
        <option value="radial-gradient">Radial gradient</option>
        <option disabled={assets.length === 0} value="asset">Asset{assets.length === 0 ? " (upload one first)" : ""}</option>
        <option value="transparent">Transparent</option>
      </select>
      {background.type === "solid" ? <ColorField onChange={(color) => { if (color) onChange({ ...background, color }); }} value={background.color} /> : null}
      {background.type === "linear-gradient" ? <LinearGradientControls background={background} onChange={onChange} /> : null}
      {background.type === "radial-gradient" ? <RadialGradientControls background={background} onChange={onChange} /> : null}
      {background.type === "asset" ? <AssetBackgroundControls assets={assets} background={background} onChange={onChange} /> : null}
    </div>
  );
}

function AssetBackgroundControls({ background, assets, onChange }: { background: Extract<Background, { type: "asset" }>; assets: readonly AssetMetadata[]; onChange: (background: Background) => void }) {
  const texture = background.texture;
  return (
    <div className="space-y-3">
      <Field label="Asset">
        <select className={selectClass} onChange={(event) => onChange({ ...background, assetPath: event.target.value })} value={background.assetPath}>
          {!assets.some((asset) => asset.path === background.assetPath) ? <option value={background.assetPath}>Missing · {assetFileName(background.assetPath)}</option> : null}
          {assets.map((asset) => <option key={asset.path} value={asset.path}>{asset.name} · {asset.width}×{asset.height}</option>)}
        </select>
      </Field>
      <Field label="Fit"><select className={selectClass} onChange={(event) => onChange({ ...background, fit: event.target.value as "cover" | "contain" })} value={background.fit}><option value="cover">Cover / crop</option><option value="contain">Contain</option></select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Focal X"><NumberField max={1} min={0} onChange={(x) => onChange({ ...background, position: { ...background.position, x } })} step={0.05} value={background.position.x} /></Field>
        <Field label="Focal Y"><NumberField max={1} min={0} onChange={(y) => onChange({ ...background, position: { ...background.position, y } })} step={0.05} value={background.position.y} /></Field>
      </div>
      <Field label="Blur"><NumberField max={256} min={0} onChange={(blur) => onChange({ ...background, blur })} value={background.blur} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Overlay"><ColorField onChange={(overlayColor) => { if (overlayColor) onChange({ ...background, overlayColor }); }} value={background.overlayColor} /></Field>
        <Field label="Overlay opacity"><NumberField max={1} min={0} onChange={(overlayOpacity) => onChange({ ...background, overlayOpacity })} step={0.05} value={background.overlayOpacity} /></Field>
      </div>
      <Field label="Texture">
        <select className={selectClass} onChange={(event) => onChange({
          ...background,
          texture: event.target.value === "none" ? null : { type: event.target.value as "noise" | "texture", seed: texture?.seed ?? 1, opacity: texture?.opacity ?? 0.08, scale: texture?.scale ?? 1 },
        })} value={texture?.type ?? "none"}>
          <option value="none">None</option>
          <option value="noise">Fine noise</option>
          <option value="texture">Coarse texture</option>
        </select>
      </Field>
      {texture ? <div className="grid grid-cols-3 gap-2"><Field label="Seed"><NumberField max={0xffff_ffff} min={0} onChange={(seed) => onChange({ ...background, texture: { ...texture, seed: Math.round(seed) } })} value={texture.seed} /></Field><Field label="Opacity"><NumberField max={1} min={0} onChange={(opacity) => onChange({ ...background, texture: { ...texture, opacity } })} step={0.01} value={texture.opacity} /></Field><Field label="Scale"><NumberField max={16} min={1} onChange={(scale) => onChange({ ...background, texture: { ...texture, scale: Math.round(scale) } })} value={texture.scale} /></Field></div> : null}
      <p className="text-[10px] leading-4 text-muted">The stored seed produces the same texture in the editor and every export.</p>
    </div>
  );
}

function LinearGradientControls({ background, onChange }: { background: Extract<Background, { type: "linear-gradient" }>; onChange: (background: Background) => void }) {
  const updateStop = (index: number, value: Partial<(typeof background.stops)[number]>) => onChange({ ...background, stops: background.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...value } : stop) });
  return <div className="space-y-3"><div className="space-y-2"><div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-[10px] text-muted"><span>Color / Hex</span><span>Position</span></div>{background.stops.map((stop, index) => <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2" key={`${index}-${stop.offset}`}><ColorField onChange={(color) => { if (color) updateStop(index, { color }); }} value={stop.color} /><NumberField ariaLabel={`Color stop ${index + 1} position`} max={1} min={0} onChange={(offset) => updateStop(index, { offset })} step={0.05} value={stop.offset} /></div>)}</div><div className="grid grid-cols-4 gap-2"><Field label="Start X"><NumberField onChange={(x) => onChange({ ...background, start: { ...background.start, x } })} value={background.start.x} /></Field><Field label="Start Y"><NumberField onChange={(y) => onChange({ ...background, start: { ...background.start, y } })} value={background.start.y} /></Field><Field label="End X"><NumberField onChange={(x) => onChange({ ...background, end: { ...background.end, x } })} value={background.end.x} /></Field><Field label="End Y"><NumberField onChange={(y) => onChange({ ...background, end: { ...background.end, y } })} value={background.end.y} /></Field></div></div>;
}

function RadialGradientControls({ background, onChange }: { background: Extract<Background, { type: "radial-gradient" }>; onChange: (background: Background) => void }) {
  const updateStop = (index: number, value: Partial<(typeof background.stops)[number]>) => onChange({ ...background, stops: background.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...value } : stop) });
  return <div className="space-y-3"><div className="space-y-2"><div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-[10px] text-muted"><span>Color / Hex</span><span>Position</span></div>{background.stops.map((stop, index) => <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2" key={`${index}-${stop.offset}`}><ColorField onChange={(color) => { if (color) updateStop(index, { color }); }} value={stop.color} /><NumberField ariaLabel={`Color stop ${index + 1} position`} max={1} min={0} onChange={(offset) => updateStop(index, { offset })} step={0.05} value={stop.offset} /></div>)}</div><div className="grid grid-cols-3 gap-2"><Field label="Center X"><NumberField max={1} min={0} onChange={(x) => onChange({ ...background, center: { ...background.center, x } })} value={background.center.x} /></Field><Field label="Center Y"><NumberField max={1} min={0} onChange={(y) => onChange({ ...background, center: { ...background.center, y } })} value={background.center.y} /></Field><Field label="Radius"><NumberField min={0.01} onChange={(radius) => onChange({ ...background, radius })} value={background.radius} /></Field></div></div>;
}

function ShadowControls({ shadow, onChange }: { shadow?: Shadow | null; onChange: (shadow: Shadow | null) => void }) {
  const enabled = Boolean(shadow);
  const value = shadow ?? { color: "#05060a", blur: 16, offsetX: 0, offsetY: 8, opacity: 0.24 };
  return <div className="border-t border-white/[0.07] pt-3"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-muted">Shadow</span><Button onClick={() => onChange(enabled ? null : value)} size="sm" variant={enabled ? "secondary" : "ghost"}>{enabled ? "On" : "Off"}</Button></div>{enabled ? <div className="mt-2 grid grid-cols-2 gap-2"><Field label="Color"><ColorField onChange={(color) => { if (color) onChange({ ...value, color }); }} value={value.color} /></Field><Field label="Blur"><NumberField min={0} onChange={(blur) => onChange({ ...value, blur })} value={value.blur} /></Field><Field label="X"><NumberField onChange={(offsetX) => onChange({ ...value, offsetX })} value={value.offsetX} /></Field><Field label="Y"><NumberField onChange={(offsetY) => onChange({ ...value, offsetY })} value={value.offsetY} /></Field><Field label="Opacity"><NumberField max={1} min={0} onChange={(opacity) => onChange({ ...value, opacity })} step={0.05} value={value.opacity} /></Field></div> : null}</div>;
}

function InspectorHeading({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-3"><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-0.5 text-[10px] text-muted">{detail}</p></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="group border-b border-white/[0.07] py-3" open><summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold text-ink/90"><span>{title}</span><ChevronDown className="text-muted transition group-open:rotate-180" size={14} /></summary><div className="mt-3 space-y-3">{children}</div></details>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="block text-[10px] text-muted">{label}</span>{children}</label>;
}

function NumberField({ value, onChange, min, max, step = 1, disabled = false, ariaLabel }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; ariaLabel?: string }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);

  function commit() {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onChange(Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)));
    else setDraft(String(value));
    setFocused(false);
  }

  return <Input aria-label={ariaLabel} className="h-8 rounded-lg px-2 text-xs" disabled={disabled} max={max} min={min} onBlur={commit} onChange={(event) => setDraft(event.target.value)} onFocus={() => setFocused(true)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } if (event.key === "Escape") { setDraft(String(value)); setFocused(false); } }} step={step} type="number" value={draft} />;
}

function ColorField({ value, onChange, allowNone = false }: { value: string; onChange: (value: string | null) => void; allowNone?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const colorValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return <div className="flex items-center gap-1.5"><input aria-label="Color swatch" className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} type="color" value={colorValue} /><Input className="h-8 min-w-0 rounded-lg px-2 text-xs" onChange={(event) => { setDraft(event.target.value); onChange(event.target.value || (allowNone ? null : "#ffffff")); }} value={draft} />{allowNone ? <Button aria-label="Clear color" onClick={() => { setDraft(""); onChange(null); }} size="icon" tooltip="Clear color" variant="ghost"><Trash2 size={12} /></Button> : null}</div>;
}

function ToggleButton({ active, label, icon, onClick, disabled = false }: { active: boolean; label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button aria-pressed={active} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-accent/30 bg-accent/[0.1] text-accent-soft" : "border-line text-muted hover:text-ink"}`} disabled={disabled} onClick={onClick} type="button">{icon}{label}</button>;
}
