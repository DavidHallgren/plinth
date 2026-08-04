import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../../lib/cn";

let closeActiveMenu: (() => void) | null = null;

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => () => {
    if (closeActiveMenu === close) closeActiveMenu = null;
  }, [close]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      closeActiveMenu?.();
      closeActiveMenu = close;
    } else if (closeActiveMenu === close) {
      closeActiveMenu = null;
    }
    setOpen(nextOpen);
  }

  return <MenuPrimitive.Root modal={false} onOpenChange={handleOpenChange} open={open}>{children}</MenuPrimitive.Root>;
}

export const DropdownMenuTrigger = MenuPrimitive.Trigger;

type DropdownMenuContentProps = Omit<ComponentProps<typeof MenuPrimitive.Popup>, "className"> & {
  align?: ComponentProps<typeof MenuPrimitive.Positioner>["align"];
  alignOffset?: number;
  className?: string;
  side?: ComponentProps<typeof MenuPrimitive.Positioner>["side"];
  sideOffset?: number;
};

export function DropdownMenuContent({ align = "end", alignOffset, side = "bottom", sideOffset = 4, className, ...props }: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-[100] outline-none"
        collisionPadding={8}
        positionMethod="fixed"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            "rounded-xl border border-white/10 bg-[#212121] p-1.5 text-ink shadow-2xl shadow-black/40 outline-none",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

type DropdownMenuItemProps = Omit<ComponentProps<typeof MenuPrimitive.Item>, "className"> & {
  className?: string;
  danger?: boolean;
};

export function DropdownMenuItem({ className, danger = false, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs outline-none data-disabled:pointer-events-none data-disabled:opacity-45",
        danger ? "text-red-200 data-highlighted:bg-red-300/10" : "text-muted data-highlighted:bg-white/[0.07] data-highlighted:text-ink",
        className,
      )}
      {...props}
    />
  );
}
