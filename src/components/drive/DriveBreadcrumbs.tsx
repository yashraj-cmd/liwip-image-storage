"use client";

import { IconChevronRight } from "@tabler/icons-react";

type Crumb = { label: string; path: string };

type BreadcrumbsProps = {
  crumbs: Crumb[];
  onNavigate: (path: string) => void;
};

export function DriveBreadcrumbs({ crumbs, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="flex min-w-0 items-center text-[12px]">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.path + index} className="flex min-w-0 items-center">
            {index > 0 && (
              <IconChevronRight
                size={12}
                stroke={1.75}
                className="text-muted-foreground mx-0.5 shrink-0"
              />
            )}
            <button
              type="button"
              onClick={() => onNavigate(crumb.path)}
              className={`ks-transition hover:bg-accent truncate px-1.5 py-0.5 ${
                last ? "text-foreground font-medium" : "text-muted-foreground"
              } ${last ? "font-mono" : ""}`}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
