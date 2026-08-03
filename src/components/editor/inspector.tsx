import { ChevronDown, Lock, Unlock, Eye, EyeOff, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Background, Document, SceneElement, Shadow, TextElement } from "../../lib/schema";
import type { DocumentPatch, ElementPatch, ElementUpdate } from "../../scene/operations";
import { APP_STORE_PRESETS } from "../../scene/presets";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const selectClass = "plinth-focus-ring h-8 w-full rounded-lg border border-line bg-[#0f1218] px-2 text-xs text-ink outline-none focus:border-violet/70";
const FONT_OPTIONS = [
  "Inter, ui-sans-serif, system-ui, sans-serif",
  "SF Pro Display, Inter, ui-sans-serif, sans-serif",
  "SF Pro Text, Inter, ui-sans-serif, sans-serif",
  "Arial, Helvetica, sans-serif",
  "Georgia, serif",
  "ui-monospace, SFMono-Regular, Menlo, monospace",
];

type InspectorProps = {
  document: Document;
  selectedElements: SceneElement[];
  onUpdateDocument: (patch: DocumentPatch) => void;
  onUpdateElement: (elementId: string, patch: ElementPatch) => void;
  onUpdateElements: (updates: ElementUpdate[]) => void;
};

export function Inspector({ document, selectedElements, onUpdateDocument, onUpdateElement, onUpdateElements }: InspectorProps) {
  if (selectedElements.length === 0) {
    return <DocumentInspector document={document} onUpdate={onUpdateDocument} />;
  }
  if (selectedElements.length > 1) {
    return <MultiSelectionInspector elements={selectedElements} onUpdateElements={onUpdateElements} />;
  }
  const element = selectedElements[0];
  if (!element) return null;
  return <ElementInspector element={element} onUpdate={onUpdateElement} />;
}

function DocumentInspector({ document, onUpdate }: { document: Document; onUpdate: (patch: DocumentPatch) => void }) {
  function changePreset(value: string) {
    if (value === "custom") {
      onUpdate({ preset: "custom" });
      return;
    }
    const preset = APP_STORE_PRESETS.find((candidate) => candidate.id === value);
    if (preset) onUpdate({ preset: preset.id, width: preset.width, height: preset.height });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title="Document" detail={`${document.width} × ${document.height}`} />
      <Section title="Identity">
        <Field label="Name"><Input onChange={(event) => onUpdate({ name: event.target.value })} value={document.name} /></Field>
        <Field label="Export name"><Input onChange={(event) => onUpdate({ exportSlug: event.target.value })} value={document.exportSlug} /></Field>
        <Field label="Preset">
          <select className={selectClass} onChange={(event) => changePreset(event.target.value)} value={APP_STORE_PRESETS.some((preset) => preset.id === document.preset) ? document.preset : "custom"}>
            {APP_STORE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            <option value="custom">Custom size</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width"><NumberField min={1} onChange={(value) => onUpdate({ width: value, preset: "custom" })} value={document.width} /></Field>
          <Field label="Height"><NumberField min={1} onChange={(value) => onUpdate({ height: value, preset: "custom" })} value={document.height} /></Field>
        </div>
      </Section>
      <Section title="Background">
        <BackgroundControls background={document.background} onChange={(background) => onUpdate({ background })} />
      </Section>
      <Section title="Notes">
        <textarea aria-label="Notes" className="plinth-focus-ring min-h-20 w-full resize-y rounded-lg border border-line bg-[#0f1218] px-2.5 py-2 text-xs leading-5 text-ink outline-none focus:border-violet/70" onChange={(event) => onUpdate({ notes: event.target.value })} value={document.notes} />
      </Section>
    </div>
  );
}

function MultiSelectionInspector({ elements, onUpdateElements }: { elements: SceneElement[]; onUpdateElements: (updates: ElementUpdate[]) => void }) {
  const opacity = elements.every((element) => element.opacity === elements[0]?.opacity) ? elements[0]?.opacity ?? 1 : undefined;
  const locked = elements.every((element) => element.locked);
  const visible = elements.every((element) => element.visible);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title="Selection" detail={`${elements.length} layers`} />
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

function ElementInspector({ element, onUpdate }: { element: SceneElement; onUpdate: (id: string, patch: ElementPatch) => void }) {
  const update = (patch: ElementPatch) => onUpdate(element.id, patch);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <InspectorHeading title={element.name} detail={element.type} />
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
        </div>
      </Section>
      {element.type === "text" ? <TextControls element={element} onUpdate={update} /> : null}
      {element.type === "shape" ? <ShapeControls element={element} onUpdate={update} /> : null}
      {element.type === "device" ? <DeviceControls element={element} onUpdate={update} /> : null}
      {element.type === "image" ? <ImageControls element={element} onUpdate={update} /> : null}
    </div>
  );
}

function TextControls({ element, onUpdate }: { element: TextElement; onUpdate: (patch: ElementPatch) => void }) {
  const style = element.style;
  function updateStyle(values: Partial<TextElement["style"]>) {
    onUpdate({ style: { ...style, ...values } });
  }
  return (
    <Section title="Text">
      <Field label="Content"><textarea className="plinth-focus-ring min-h-20 w-full resize-y rounded-lg border border-line bg-[#0f1218] px-2.5 py-2 text-xs leading-5 text-ink outline-none focus:border-violet/70" onChange={(event) => onUpdate({ text: event.target.value })} value={element.text} /></Field>
      <Field label="Font">
        <select className={selectClass} onChange={(event) => updateStyle({ fontFamily: event.target.value })} value={style.fontFamily}>
          {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font.split(",")[0]}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size"><NumberField min={1} onChange={(value) => updateStyle({ fontSize: value })} value={style.fontSize} /></Field>
        <Field label="Weight"><NumberField max={900} min={100} onChange={(value) => updateStyle({ fontWeight: Math.round(value / 100) * 100 })} step={100} value={style.fontWeight} /></Field>
        <Field label="Line height"><NumberField min={0.5} onChange={(value) => updateStyle({ lineHeight: value })} step={0.05} value={style.lineHeight} /></Field>
        <Field label="Letter spacing"><NumberField onChange={(value) => updateStyle({ letterSpacing: value })} step={0.5} value={style.letterSpacing} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleButton active={Boolean(style.italic)} label="Italic" onClick={() => updateStyle({ italic: !style.italic })} />
        <ToggleButton active={Boolean(style.underline)} label="Underline" onClick={() => updateStyle({ underline: !style.underline })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["left", "center", "right"] as const).map((align) => <button aria-pressed={style.align === align} className={`h-8 rounded-lg border text-xs ${style.align === align ? "border-violet/40 bg-violet/[0.12] text-violet-soft" : "border-line text-muted hover:text-ink"}`} key={align} onClick={() => updateStyle({ align })} type="button">{align}</button>)}
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

function DeviceControls({ element, onUpdate }: { element: Extract<SceneElement, { type: "device" }>; onUpdate: (patch: ElementPatch) => void }) {
  return (
    <Section title="Device frame">
      <Field label="Preset"><select className={selectClass} onChange={(event) => onUpdate({ preset: event.target.value as Extract<typeof element.preset, string> })} value={element.preset}><option value="iphone-17-pro-max">iPhone 17 Pro Max</option><option value="iphone-17-pro">iPhone 17 Pro</option><option value="generic-modern-iphone">Generic modern iPhone</option><option value="generic-modern-ipad">Generic modern iPad</option><option value="browser-window">Browser window</option></select></Field>
      <Field label="Screenshot"><p className="truncate rounded-lg border border-line bg-black/20 px-2 py-2 text-[11px] text-muted" title={element.screenshotPath ?? "No screenshot selected"}>{element.screenshotPath ? assetFileName(element.screenshotPath) : "No screenshot selected"}</p></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Frame color"><ColorField onChange={(frameColor) => { if (frameColor) onUpdate({ frameColor }); }} value={element.frameColor} /></Field><Field label="Screen color"><ColorField onChange={(screenColor) => { if (screenColor) onUpdate({ screenColor }); }} value={element.screenColor} /></Field></div>
      <Field label="Screenshot fit"><select className={selectClass} onChange={(event) => onUpdate({ screenshotFit: event.target.value as "contain" | "cover" | "stretch" })} value={element.screenshotFit}><option value="cover">Cover / crop</option><option value="contain">Contain</option><option value="stretch">Stretch</option></select></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Focal X"><NumberField max={1} min={0} onChange={(x) => onUpdate({ screenshotPosition: { ...element.screenshotPosition, x } })} step={0.05} value={element.screenshotPosition.x} /></Field><Field label="Focal Y"><NumberField max={1} min={0} onChange={(y) => onUpdate({ screenshotPosition: { ...element.screenshotPosition, y } })} step={0.05} value={element.screenshotPosition.y} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Bezel"><select className={selectClass} onChange={(event) => onUpdate({ bezelStyle: event.target.value as "solid" | "metallic" })} value={element.bezelStyle}><option value="solid">Solid</option><option value="metallic">Metallic</option></select></Field><Field label="Outer radius"><NumberField min={0} onChange={(cornerRadius) => onUpdate({ cornerRadius })} value={element.cornerRadius ?? 0} /></Field><Field label="Screen radius"><NumberField min={0} onChange={(screenCornerRadius) => onUpdate({ screenCornerRadius })} value={element.screenCornerRadius ?? 0} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><ToggleButton active={element.showCamera} label="Camera" onClick={() => onUpdate({ showCamera: !element.showCamera })} /><ToggleButton active={element.showGlare} label="Glare" onClick={() => onUpdate({ showGlare: !element.showGlare })} /></div>
      <ShadowControls shadow={element.shadow} onChange={(shadow) => onUpdate({ shadow })} />
    </Section>
  );
}

function ImageControls({ element, onUpdate }: { element: Extract<SceneElement, { type: "image" }>; onUpdate: (patch: ElementPatch) => void }) {
  return (
    <Section title="Image">
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

function BackgroundControls({ background, onChange }: { background: Background; onChange: (background: Background) => void }) {
  return (
    <div className="space-y-3">
      <select className={selectClass} onChange={(event) => {
        if (event.target.value === "solid") onChange({ type: "solid", color: "#10131a" });
        if (event.target.value === "linear-gradient") onChange({ type: "linear-gradient", stops: [{ offset: 0, color: "#14182a" }, { offset: 1, color: "#8b7cff" }], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
        if (event.target.value === "radial-gradient") onChange({ type: "radial-gradient", stops: [{ offset: 0, color: "#f3c1da" }, { offset: 1, color: "#27203d" }], center: { x: 0.5, y: 0.5 }, radius: 0.85 });
        if (event.target.value === "transparent") onChange({ type: "transparent" });
      }} value={background.type}>
        <option value="solid">Solid</option>
        <option value="linear-gradient">Linear gradient</option>
        <option value="radial-gradient">Radial gradient</option>
        <option value="transparent">Transparent</option>
      </select>
      {background.type === "solid" ? <ColorField onChange={(color) => { if (color) onChange({ ...background, color }); }} value={background.color} /> : null}
      {background.type === "linear-gradient" ? <LinearGradientControls background={background} onChange={onChange} /> : null}
      {background.type === "radial-gradient" ? <RadialGradientControls background={background} onChange={onChange} /> : null}
    </div>
  );
}

function LinearGradientControls({ background, onChange }: { background: Extract<Background, { type: "linear-gradient" }>; onChange: (background: Background) => void }) {
  const updateStop = (index: number, value: Partial<(typeof background.stops)[number]>) => onChange({ ...background, stops: background.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...value } : stop) });
  return <div className="space-y-3"><div className="space-y-2">{background.stops.map((stop, index) => <div className="grid grid-cols-[1fr_62px] gap-2" key={`${index}-${stop.offset}`}><ColorField onChange={(color) => { if (color) updateStop(index, { color }); }} value={stop.color} /><NumberField ariaLabel={`Color stop ${index + 1} position`} max={1} min={0} onChange={(offset) => updateStop(index, { offset })} step={0.05} value={stop.offset} /></div>)}</div><p className="text-[10px] text-muted">Direction</p><div className="grid grid-cols-4 gap-2"><NumberField ariaLabel="Start X" onChange={(x) => onChange({ ...background, start: { ...background.start, x } })} value={background.start.x} /><NumberField ariaLabel="Start Y" onChange={(y) => onChange({ ...background, start: { ...background.start, y } })} value={background.start.y} /><NumberField ariaLabel="End X" onChange={(x) => onChange({ ...background, end: { ...background.end, x } })} value={background.end.x} /><NumberField ariaLabel="End Y" onChange={(y) => onChange({ ...background, end: { ...background.end, y } })} value={background.end.y} /></div></div>;
}

function RadialGradientControls({ background, onChange }: { background: Extract<Background, { type: "radial-gradient" }>; onChange: (background: Background) => void }) {
  const updateStop = (index: number, value: Partial<(typeof background.stops)[number]>) => onChange({ ...background, stops: background.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...value } : stop) });
  return <div className="space-y-3"><div className="space-y-2">{background.stops.map((stop, index) => <div className="grid grid-cols-[1fr_62px] gap-2" key={`${index}-${stop.offset}`}><ColorField onChange={(color) => { if (color) updateStop(index, { color }); }} value={stop.color} /><NumberField ariaLabel={`Color stop ${index + 1} position`} max={1} min={0} onChange={(offset) => updateStop(index, { offset })} step={0.05} value={stop.offset} /></div>)}</div><p className="text-[10px] text-muted">Center and radius</p><div className="grid grid-cols-3 gap-2"><NumberField ariaLabel="Center X" max={1} min={0} onChange={(x) => onChange({ ...background, center: { ...background.center, x } })} value={background.center.x} /><NumberField ariaLabel="Center Y" max={1} min={0} onChange={(y) => onChange({ ...background, center: { ...background.center, y } })} value={background.center.y} /><NumberField ariaLabel="Radius" min={0.01} onChange={(radius) => onChange({ ...background, radius })} value={background.radius} /></div></div>;
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
  return <div className="flex items-center gap-1.5"><input aria-label="Color swatch" className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} type="color" value={colorValue} /><Input className="h-8 min-w-0 rounded-lg px-2 text-xs" onChange={(event) => { setDraft(event.target.value); onChange(event.target.value || (allowNone ? null : "#ffffff")); }} value={draft} />{allowNone ? <Button aria-label="Clear color" onClick={() => { setDraft(""); onChange(null); }} size="icon" variant="ghost"><Trash2 size={12} /></Button> : null}</div>;
}

function ToggleButton({ active, label, icon, onClick }: { active: boolean; label: string; icon?: React.ReactNode; onClick: () => void }) {
  return <button aria-pressed={active} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[11px] ${active ? "border-violet/30 bg-violet/[0.1] text-violet-soft" : "border-line text-muted hover:text-ink"}`} onClick={onClick} type="button">{icon}{label}</button>;
}
