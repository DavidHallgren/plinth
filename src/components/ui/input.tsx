import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "plinth-focus-ring h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-accent/70",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "plinth-focus-ring min-h-24 w-full resize-y rounded-xl border border-line bg-black/20 px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-muted/60 focus:border-accent/70",
        className,
      )}
      {...props}
    />
  );
}
