"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, Check } from "lucide-react";
import {
  SORT_KEYS,
  directionLabels,
  type SortDirection,
  type SortState,
} from "./sorting";

const MENU_WIDTH = 232;
const MENU_HEIGHT = 346;

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
        : rect.bottom + 6;
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
        className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium whitespace-nowrap ${
          open
            ? "bg-[#0e7a5c]/20 text-[#cde8df]"
            : "text-[#cfcfcf] hover:bg-[#1a1a1a] hover:text-white"
        }`}
      >
        <ArrowDownUp className="size-4" strokeWidth={1.5} />
        Sort
      </button>

      {position !== null &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-2xl bg-[#161616] py-1 ring-1 ring-[#2a2a2a] shadow-xl"
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
    <p className="px-3.5 pt-2.5 pb-1.5 text-[10px] font-medium tracking-[0.16em] text-[#6f6f6f] uppercase">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="my-1 border-t border-[#2a2a2a]" />;
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
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-[#1a1a1a] ${
        checked ? "text-white" : "text-[#cfcfcf]"
      }`}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {checked && <Check className="size-3.5 text-[#0e7a5c]" strokeWidth={2.5} />}
      </span>
      {children}
    </button>
  );
}
