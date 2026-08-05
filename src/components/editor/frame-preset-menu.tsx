import { Check, ChevronDown, Frame as FrameIcon, RefreshCw } from "lucide-react";
import { EDITABLE_DEVICE_PRESETS, type DevicePresetId } from "../../devices/presets";
import { cn } from "../../lib/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

type SelectedFrameAction = {
  frameName: string;
  onSelect: () => void;
};

type FramePresetMenuProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  onSelect: (presetId: DevicePresetId) => void;
  selectedFrameAction?: SelectedFrameAction;
  value?: DevicePresetId | null;
};

const FRAME_PRESET_GROUPS = [...new Set(EDITABLE_DEVICE_PRESETS.map((preset) => preset.category))].map((category) => ({
  category,
  label: category === "Generic" ? "Other frames" : category,
  presets: EDITABLE_DEVICE_PRESETS.filter((preset) => preset.category === category),
}));

export function FramePresetMenu({ ariaLabel, className, disabled = false, label, onSelect, selectedFrameAction, value }: FramePresetMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel ?? label}
        className={cn("group plinth-focus-ring flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-line bg-panel-strong px-2 text-xs font-medium text-ink hover:border-white/20 hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-45", className)}
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5"><FrameIcon className="shrink-0" size={13} /><span className="truncate">{label}</span></span><ChevronDown className="shrink-0 transition group-data-[popup-open]:rotate-180" size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[min(24rem,calc(100dvh-2rem))] w-56 overflow-y-auto">
        {selectedFrameAction ? <>
          <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">Selected frame</p>
          <DropdownMenuItem onClick={selectedFrameAction.onSelect}><RefreshCw size={13} /><span className="min-w-0"><span className="block">Replace image</span><span className="block truncate text-[10px] text-muted">{selectedFrameAction.frameName}</span></span></DropdownMenuItem>
          <div className="my-1 h-px bg-white/[0.08]" />
        </> : null}
        {FRAME_PRESET_GROUPS.map((group) => <div key={group.category}><p className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{group.label}</p>{group.presets.map((preset) => <DropdownMenuItem key={preset.id} onClick={() => onSelect(preset.id)}><FrameIcon className="shrink-0" size={13} /><span className="min-w-0 flex-1 truncate">{preset.label}</span>{value === preset.id ? <Check className="shrink-0 text-accent-soft" size={13} /> : null}</DropdownMenuItem>)}</div>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
