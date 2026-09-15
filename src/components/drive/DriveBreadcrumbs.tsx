"use client";

import { ChevronRight } from "lucide-react";

type Crumb = { label: string; path: string };

type BreadcrumbsProps = {
  crumbs: Crumb[];
  onNavigate: (path: string) => void;
};

export function DriveBreadcrumbs({ crumbs, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="flex min-w-0 items-center text-[14px]">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.path + index} className="flex min-w-0 items-center">
            {index > 0 && (
              <ChevronRight className="mx-0.5 size-3.5 shrink-0 text-[#6f6f6f]" strokeWidth={1.5} />
            )}
            <button
              type="button"
              onClick={() => onNavigate(crumb.path)}
              className={`truncate rounded-full px-2.5 py-1 hover:bg-[#1a1a1a] ${
                last ? "font-medium text-white" : "text-[#9a9a9a]"
              }`}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
