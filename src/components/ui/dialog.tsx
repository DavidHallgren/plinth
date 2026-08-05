import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

const openDialogIds: string[] = [];

export function Dialog({ open, title, description, onOpenChange, children, footer, className, bodyClassName, footerClassName }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) {
      return;
    }

    openDialogIds.push(titleId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openDialogIds.at(-1) === titleId) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const index = openDialogIds.lastIndexOf(titleId);
      if (index >= 0) openDialogIds.splice(index, 1);
    };
  }, [onOpenChange, open, titleId]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn("w-full max-w-md rounded-2xl border border-white/10 bg-[#1b1b1b] p-5 shadow-2xl shadow-black/50", className)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <Button aria-label="Close dialog" onClick={() => onOpenChange(false)} size="icon" tooltip="Close dialog" variant="ghost">
            <X size={16} />
          </Button>
        </div>
        <div className={cn("mt-5", bodyClassName)}>{children}</div>
        {footer ? <div className={cn("mt-5 flex justify-end gap-2", footerClassName)}>{footer}</div> : null}
      </section>
    </div>
  );
}
