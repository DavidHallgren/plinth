import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-violet text-[#0c0d10] shadow-[0_8px_24px_rgba(157,140,255,0.2)] hover:bg-violet-soft",
  secondary: "border border-line bg-panel-strong text-ink hover:border-white/20 hover:bg-white/[0.08]",
  ghost: "text-muted hover:bg-white/[0.06] hover:text-ink",
  danger: "border border-red-400/20 bg-red-400/[0.08] text-red-200 hover:bg-red-400/[0.16]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-xs",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-sm",
  icon: "h-9 w-9 rounded-lg p-0",
};

export function Button({ className, variant = "secondary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "plinth-focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
