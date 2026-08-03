import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, title, description, onOpenChange, children, footer }: DialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section
        aria-describedby={description ? "dialog-description" : undefined}
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1b1b1b] p-5 shadow-2xl shadow-black/50"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink" id="dialog-title">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted" id="dialog-description">
                {description}
              </p>
            ) : null}
          </div>
          <Button aria-label="Close dialog" onClick={() => onOpenChange(false)} size="icon" variant="ghost">
            <X size={16} />
          </Button>
        </div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </section>
    </div>
  );
}
