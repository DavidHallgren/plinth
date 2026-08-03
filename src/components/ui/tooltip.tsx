import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

type TooltipContentProps = Omit<ComponentProps<typeof TooltipPrimitive.Popup>, "className"> & {
  className?: string;
  sideOffset?: number;
};

export function TooltipContent({ className, sideOffset = 6, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner className="z-[100]" sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          className={cn(
            "w-max max-w-xs rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/40",
            className,
          )}
          data-slot="tooltip-content"
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
