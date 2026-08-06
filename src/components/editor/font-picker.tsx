import { Check, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { BUILT_IN_FONTS, quotedFontCssFamily } from "../../fonts/catalog";
import type { ProjectFontFamily } from "../../lib/schema";

type Props = {
  value: string;
  projectFonts: readonly ProjectFontFamily[];
  busy: boolean;
  onChange: (fontFamilyId: string) => Promise<boolean>;
  onUpload: (file: File) => Promise<ProjectFontFamily | null>;
  onDelete: (font: ProjectFontFamily) => Promise<void>;
};

export function FontPicker({ value, projectFonts, busy, onChange, onUpload, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = projectFonts.find((font) => font.id === value)?.name ?? BUILT_IN_FONTS.find((font) => font.id === value)?.name ?? "Inter";
  const matches = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const bundled = useMemo(() => BUILT_IN_FONTS.filter((font) => matches(font.name)), [query]);
  const local = useMemo(() => projectFonts.filter((font) => matches(font.name)), [projectFonts, query]);
  const disabled = busy || choosing;

  async function choose(fontFamilyId: string): Promise<void> {
    setChoosing(true);
    try {
      if (await onChange(fontFamilyId)) setOpen(false);
    } finally {
      setChoosing(false);
    }
  }

  return <Popover.Root onOpenChange={setOpen} open={open}>
    <Popover.Trigger className="plinth-focus-ring flex h-8 w-full items-center justify-between rounded-lg border border-line bg-[#111111] px-2 text-xs text-ink"><span style={fontPreviewStyle(value)}>{current}</span><span className="text-muted">⌄</span></Popover.Trigger>
    <Popover.Portal><Popover.Positioner align="end" className="z-[100] outline-none" collisionPadding={8} positionMethod="fixed" sideOffset={4}><Popover.Popup className="w-[250px] rounded-xl border border-line bg-[#171717] p-2 shadow-2xl outline-none">
      <label className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-2"><Search className="text-muted" size={13} /><input autoFocus className="h-8 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search fonts" value={query} /></label>
      <div className="mt-2 max-h-72 overflow-y-auto">
        {local.length > 0 ? <FontGroup label="Project fonts">{local.map((font) => <FontChoice action={<button aria-label={`Remove ${font.name}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-white/[0.06] hover:text-red-300" disabled={disabled} onClick={() => void onDelete(font)} type="button"><Trash2 size={12} /></button>} disabled={disabled} id={font.id} key={font.id} name={font.name} onChoose={() => { void choose(font.id); }} selected={value === font.id} />)}</FontGroup> : null}
        <FontGroup label="Bundled fonts">{bundled.map((font) => <FontChoice disabled={disabled} id={font.id} key={font.id} name={font.name} onChoose={() => { void choose(font.id); }} selected={value === font.id} />)}</FontGroup>
        {local.length + bundled.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted">No matching fonts</p> : null}
      </div>
      <button className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line text-xs text-muted hover:text-ink" disabled={disabled} onClick={() => inputRef.current?.click()} type="button"><Upload size={13} />{disabled ? "Working…" : "Add project font"}</button>
      <input accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file).then((font) => { if (font) void choose(font.id); }); event.target.value = ""; }} ref={inputRef} type="file" />
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}

function FontGroup({ label, children }: { label: string; children: ReactNode }) { return <div><p className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</p><div className="space-y-0.5">{children}</div></div>; }

function fontPreviewStyle(id: string): { fontFamily: string } {
  return { fontFamily: quotedFontCssFamily(id) };
}

function FontChoice({ action, disabled, id, name, selected, onChoose }: { action?: ReactNode; disabled: boolean; id: string; name: string; selected: boolean; onChoose: () => void }) {
  return <div className={`flex h-9 w-full items-center rounded-lg px-1 hover:bg-white/[0.06] ${selected ? "bg-accent/[0.1] text-accent-soft" : "text-ink"}`}>
    <button aria-pressed={selected} className="min-w-0 flex-1 truncate px-1.5 text-left text-sm disabled:opacity-60" disabled={disabled} onClick={onChoose} style={fontPreviewStyle(id)} type="button">{name}</button>
    {action}
    <span aria-hidden="true" className="grid w-7 shrink-0 place-items-center">{selected ? <Check size={14} strokeWidth={2.5} /> : null}</span>
  </div>;
}
