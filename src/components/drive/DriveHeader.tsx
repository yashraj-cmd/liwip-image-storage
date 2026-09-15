"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  IconLayoutGrid,
  IconList,
  IconMoon,
  IconSearch,
  IconSun,
} from "@tabler/icons-react";
import { useTheme } from "@/components/theme/ThemeProvider";

type HeaderProps = {
  masterLabel: string;
  query: string;
  onQueryChange: (value: string) => void;
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
};

export function DriveHeader({
  masterLabel,
  query,
  onQueryChange,
  view,
  onViewChange,
}: HeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { resolved, toggle } = useTheme();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="border-border bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-6">
      <h1 className="text-[14px] font-medium tracking-tight">{masterLabel}</h1>

      <div className="flex items-center gap-2">
        <div className="border-input focus-within:ring-ring/50 ks-transition flex h-8 w-[280px] items-center gap-2 border px-2 focus-within:ring-1">
          <IconSearch size={14} stroke={1.75} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search SKUs or files"
            className="placeholder:text-muted-foreground h-full w-full bg-transparent text-[12px] outline-none"
          />
        </div>

        <div className="border-input flex h-8 items-center border">
          <ViewSegment label="List view" active={view === "list"} onClick={() => onViewChange("list")}>
            <IconList size={14} stroke={1.75} />
          </ViewSegment>
          <ViewSegment label="Grid view" active={view === "grid"} onClick={() => onViewChange("grid")}>
            <IconLayoutGrid size={14} stroke={1.75} />
          </ViewSegment>
        </div>

        <button
          type="button"
          title="Toggle theme (d)"
          aria-label="Toggle theme"
          onClick={toggle}
          className="border-input text-muted-foreground hover:text-foreground hover:bg-accent grid size-8 place-items-center border transition-transform duration-300"
        >
          {resolved === "dark" ? (
            <IconSun size={14} stroke={1.75} />
          ) : (
            <IconMoon size={14} stroke={1.75} />
          )}
        </button>
      </div>
    </header>
  );
}

function ViewSegment({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`ks-transition grid h-full w-8 place-items-center ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
