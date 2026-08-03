import { createPlinthIconPaths, PLINTH_ICON_VIEW_BOX } from "../../lib/plinth-icon";
import { cn } from "../../lib/cn";

type PlinthMarkProps = {
  className?: string;
  title?: string;
};

const paths = createPlinthIconPaths();

export function PlinthMark({ className, title }: PlinthMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      viewBox={`0 0 ${PLINTH_ICON_VIEW_BOX} ${PLINTH_ICON_VIEW_BOX}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect fill="#97ff7d" height="60" rx="13" width="60" x="2" y="2" />
      <g fill="#000000">
        {paths.map((path) => <path d={path} key={path} />)}
      </g>
    </svg>
  );
}
