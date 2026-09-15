"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowsSort, IconCheck } from "@tabler/icons-react";
import {
  SORT_KEYS,
  directionLabels,
  type SortDirection,
  type SortState,
} from "./sorting";

const MENU_WIDTH = 216;
const MENU_HEIGHT = 330;

export function SortMenu({
  sort,
  onChange,
}: {
  sort: SortState;
  onChange: (next: SortState) => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;
  const labels = directionLabels(sort.key);

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const top =
      window.innerHeight - rect.bottom < MENU_HEIGHT + 8
        ? Math.max(8, rect.top - MENU_HEIGHT - 4)
        : rect.bottom + 4;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPosition(null);
    }
    function close() {
      setPosition(null);
    }

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Sort"
        onClick={toggle}
        className={`ks-transition inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium whitespace-nowrap ${
          open
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <IconArrowsSort size={14} stroke={1.75} />
        Sort
      </button>

      {position !== null &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="bg-popover/95 ring-foreground/10 fixed z-50 p-1 shadow-md ring-1 backdrop-blur-md"
          >
            <Heading>Sort by</Heading>
            {SORT_KEYS.map((entry) => (
              <Row
                key={entry.key}
                checked={sort.key === entry.key}
                onClick={() => onChange({ ...sort, key: entry.key })}
              >
                {entry.label}
              </Row>
            ))}

            <Divider />
            <Heading>Sort direction</Heading>
            {(["asc", "desc"] as SortDirection[]).map((direction) => (
              <Row
                key={direction}
                checked={sort.direction === direction}
                onClick={() => onChange({ ...sort, direction })}
              >
                {labels[direction]}
              </Row>
            ))}

            <Divider />
            <Heading>Folders</Heading>
            <Row
              checked={sort.foldersFirst}
              onClick={() => onChange({ ...sort, foldersFirst: true })}
            >
              On top
            </Row>
            <Row
              checked={!sort.foldersFirst}
              onClick={() => onChange({ ...sort, foldersFirst: false })}
            >
              Mixed with files
            </Row>
          </div>,
          document.body,
        )}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-2 pt-2 pb-1 text-[10px] font-medium tracking-[0.18em] uppercase">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="border-border my-1 border-t" />;
}

function Row({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
      className={`ks-transition hover:bg-accent hover:text-accent-foreground flex h-7 w-full items-center gap-2 px-2 text-left text-[12px] ${
        checked ? "text-foreground font-medium" : "text-muted-foreground"
      }`}
    >
      <span className="grid size-3.5 shrink-0 place-items-center">
        {checked && <IconCheck size={12} stroke={2.25} className="text-primary" />}
      </span>
      {children}
    </button>
  );
}
