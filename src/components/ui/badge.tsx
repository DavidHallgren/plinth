import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type BadgeTone = "neutral" | "violet" | "green" | "amber" | "red";

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: "border-white/10 bg-white/[0.05] text-muted",
    violet: "border-violet/20 bg-violet/[0.12] text-violet-soft",
    green: "border-emerald-300/20 bg-emerald-300/[0.1] text-emerald-200",
    amber: "border-amber-300/20 bg-amber-300/[0.1] text-amber-200",
    red: "border-red-300/20 bg-red-300/[0.1] text-red-200",
  };

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", toneClasses[tone], className)}
      {...props}
    />
  );
}
