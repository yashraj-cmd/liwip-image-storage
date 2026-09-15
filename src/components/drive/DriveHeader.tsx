"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Grid2x2, List as ListIcon, Search } from "lucide-react";

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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-7">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6f6f6f]">
          Product media
        </p>
        <h1 className="mt-0.5 text-[17px] font-medium tracking-tight text-white">
          {masterLabel}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`flex h-10 w-[300px] items-center gap-2.5 rounded-full px-4 ring-1 transition-[box-shadow,background-color] duration-300 ${
            focused
              ? "bg-[#141414] ring-[#0e7a5c]/60 shadow-[0_0_0_4px_rgba(14,122,92,0.15)]"
              : "bg-[#111111] ring-[#2a2a2a]"
          }`}
        >
          <Search className="size-4 shrink-0 text-[#8a8a8a]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search SKUs or files"
            className="h-full w-full bg-transparent text-[13px] text-[#f4f4f4] outline-none placeholder:text-[#6f6f6f]"
          />
        </div>
        <div className="flex h-10 items-center gap-1 rounded-full bg-[#111111] p-1 ring-1 ring-[#2a2a2a]">
          <ViewSegment
            label="List view"
            active={view === "list"}
            onClick={() => onViewChange("list")}
          >
            <ListIcon className="size-4" strokeWidth={1.5} />
          </ViewSegment>
          <ViewSegment
            label="Grid view"
            active={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            <Grid2x2 className="size-4" strokeWidth={1.5} />
          </ViewSegment>
        </div>
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
      className={`grid h-8 w-9 place-items-center rounded-full ${
        active
          ? "bg-[#0e7a5c] text-white"
          : "text-[#9a9a9a] hover:bg-[#1a1a1a] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
