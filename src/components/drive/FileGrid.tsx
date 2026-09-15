"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Folder,
  FolderInput,
  ImageIcon,
  Images,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  archiveUrl,
  contentUrl,
  downloadUrl,
  formatBytes,
  formatDate,
  type DriveItem,
} from "@/lib/drive";
import type { SortDirection, SortKey, SortState } from "./sorting";

type FileGridProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  items: DriveItem[];
  selectedPaths: string[];
  /** Checkboxes stay hidden until "Select all" turns selection mode on. */
  showCheckboxes: boolean;
  view: "grid" | "list";
  onSelect: (item: DriveItem, additive: boolean) => void;
  onOpen: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onMove: (item: DriveItem) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  /** Present only where manual ordering applies: files inside a SKU folder. */
  reorder: ReorderHandlers | null;
};

type RowActions = Pick<FileGridProps, "onSelect" | "onOpen" | "onRename" | "onDelete" | "onMove"> & {
  reorder: ReorderHandlers | null;
};

/** Internal drags carry this type so an OS file drop is never mistaken for one. */
export const REORDER_MIME = "application/x-sku-reorder";

export type ReorderHandlers = {
  draggingPath: string | null;
  overPath: string | null;
  onDragStart: (item: DriveItem) => void;
  onDragOver: (item: DriveItem) => void;
  onDragEnd: () => void;
  onDrop: (item: DriveItem) => void;
};

/** Portal-rendered row menu, sized here so it can be positioned before paint. */
const MENU_WIDTH = 160;
const MENU_HEIGHT = 152;

/** Matches the Tailwind track definitions the cards are laid out with. */
const FOLDER_COLUMN = { min: 220, gap: 12 };
const FILE_COLUMN = { min: 176, gap: 16 };

type VirtualRow =
  | { kind: "section"; key: string; label: string; first: boolean }
  | { kind: "folders"; key: string; items: DriveItem[]; columns: number }
  | { kind: "files"; key: string; items: DriveItem[]; columns: number; start: number }
  | { kind: "listRow"; key: string; item: DriveItem };

export function FileGrid({
  scrollRef,
  items,
  selectedPaths,
  showCheckboxes,
  view,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  sort,
  onSort,
  reorder,
}: FileGridProps) {
  const selected = new Set(selectedPaths);
  const actions: RowActions = { onSelect, onOpen, onRename, onDelete, onMove, reorder };
  const [width, containerRef] = useContainerWidth();

  const rows = buildRows(items, view, width, sort.foldersFirst);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRow(rows[index], width),
    getItemKey: (index) => rows[index].key,
    overscan: 6,
  });

  // Row heights depend on column width, so remeasure when the pane resizes.
  useEffect(() => {
    virtualizer.measure();
  }, [width, virtualizer]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-28 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-[#0e7a5c]/15 ring-1 ring-[#0e7a5c]/30">
          <Images className="size-7 text-[#0e7a5c]" strokeWidth={1.25} />
        </div>
        <div>
          <p className="text-[16px] font-medium tracking-tight text-[#f4f4f4]">
            No SKU folders yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-6 text-[#9a9a9a]">
            Create a folder for each SKU, open it, then add images.
          </p>
        </div>
      </div>
    );
  }

  const body = (
    <div ref={containerRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <RowContent row={row} selected={selected} showCheckboxes={showCheckboxes} actions={actions} />
          </div>
        );
      })}
    </div>
  );

  if (view === "list") {
    return (
      <div className="min-w-0 overflow-hidden rounded-2xl ring-1 ring-[#2a2a2a]">
        <div className="grid grid-cols-[36px_minmax(0,1fr)_160px_120px_88px] bg-[#0e7a5c]/20 px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#cde8df]">
          <span />
          <SortHeader label="Name" sortKey="name" active={sort.key} direction={sort.direction} onSort={onSort} />
          <SortHeader label="Modified" sortKey="updatedAt" active={sort.key} direction={sort.direction} onSort={onSort} />
          <SortHeader label="File size" sortKey="size" active={sort.key} direction={sort.direction} onSort={onSort} align="right" />
          <span />
        </div>
        {body}
      </div>
    );
  }

  return body;
}

function RowContent({
  row,
  selected,
  showCheckboxes,
  actions,
}: {
  row: VirtualRow;
  selected: Set<string>;
  showCheckboxes: boolean;
  actions: RowActions;
}) {
  if (row.kind === "section") {
    return (
      <h2
        className={`mb-4 px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#6f6f6f] ${
          row.first ? "" : "pt-6"
        }`}
      >
        {row.label}
      </h2>
    );
  }

  if (row.kind === "listRow") {
    const item = row.item;
    const isSelected = selected.has(item.path);
    return (
      <div
        data-card
        onClick={(event) => actions.onSelect(item, event.metaKey || event.ctrlKey)}
        onDoubleClick={() => actions.onOpen(item)}
        className={`grid w-full grid-cols-[36px_minmax(0,1fr)_160px_120px_88px] items-center border-t border-[#1c1c1c] px-3 py-2.5 text-[13px] ${
          isSelected ? "bg-[#0e7a5c]/20 text-white" : "text-[#e8e8e8] hover:bg-[#161616]"
        }`}
      >
        {showCheckboxes ? (
          <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
        ) : (
          <span />
        )}
        <span className="flex min-w-0 items-center gap-3">
          <ItemIcon item={item} />
          <span className="truncate">{item.name}</span>
        </span>
        <span className="text-[#9a9a9a]">{formatDate(item.updatedAt)}</span>
        <span className="text-right text-[#9a9a9a]">
          {item.type === "file" ? formatBytes(item.size) : "—"}
        </span>
        <CardActions item={item} onRename={actions.onRename} onDelete={actions.onDelete} onMove={actions.onMove} />
      </div>
    );
  }

  if (row.kind === "folders") {
    return (
      <div
        className="grid pb-3"
        style={{
          gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))`,
          gap: FOLDER_COLUMN.gap,
        }}
      >
        {row.items.map((item) => {
          const isSelected = selected.has(item.path);
          return (
            <div
              key={item.path}
              data-card
              onClick={(event) => actions.onSelect(item, event.metaKey || event.ctrlKey)}
              onDoubleClick={() => actions.onOpen(item)}
              className={`group relative flex h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 text-left text-[13px] ring-1 ${
                isSelected
                  ? "bg-[#0e7a5c]/20 text-white ring-[#0e7a5c]/50"
                  : "bg-[#141414] text-[#f0f0f0] ring-[#2a2a2a] hover:bg-[#1a1a1a] hover:ring-[#3a3a3a]"
              }`}
            >
              {showCheckboxes && (
                <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
              )}
              <span className="grid size-8 place-items-center rounded-full bg-[#e85d04]/15">
                <Folder className="size-4 text-[#e85d04]" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <CardActions item={item} onRename={actions.onRename} onDelete={actions.onDelete} onMove={actions.onMove} />
            </div>
          );
        })}
      </div>
    );
  }

  const reorder = actions.reorder;

  return (
    <div
      className="grid pb-4"
      style={{
        gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))`,
        gap: FILE_COLUMN.gap,
      }}
    >
      {row.items.map((item) => {
        const isSelected = selected.has(item.path);
        const isDragging = reorder?.draggingPath === item.path;
        const isDropTarget =
          Boolean(reorder?.draggingPath) &&
          reorder?.overPath === item.path &&
          reorder?.draggingPath !== item.path;
        // The badge reflects the SAVED storefront position, not where the card
        // happens to sit in the current sort, so it never misleads.
        const position =
          reorder && item.type === "file" && item.position !== undefined
            ? item.position + 1
            : null;
        return (
          <div
            key={item.path}
            data-card
            draggable={Boolean(reorder) && item.type === "file"}
            onDragStart={(event) => {
              if (!reorder || item.type !== "file") return;
              // A custom type marks this as an internal reorder, so the grid's
              // upload drop handler knows to ignore it.
              event.dataTransfer.setData(REORDER_MIME, item.path);
              event.dataTransfer.effectAllowed = "move";
              reorder.onDragStart(item);
            }}
            onDragOver={(event) => {
              if (!reorder || !reorder.draggingPath) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              reorder.onDragOver(item);
            }}
            onDrop={(event) => {
              if (!reorder || !reorder.draggingPath) return;
              event.preventDefault();
              event.stopPropagation();
              reorder.onDrop(item);
            }}
            onDragEnd={() => reorder?.onDragEnd()}
            onClick={(event) => actions.onSelect(item, event.metaKey || event.ctrlKey)}
            onDoubleClick={() => actions.onOpen(item)}
            className={`group relative overflow-hidden rounded-2xl text-left ring-1 transition-opacity ${
              reorder && item.type === "file" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
            } ${isDragging ? "opacity-40" : ""} ${
              isDropTarget
                ? "ring-2 ring-[#0e7a5c]"
                : isSelected
                  ? "bg-[#0e7a5c]/20 ring-[#0e7a5c]/50"
                  : "bg-[#141414] ring-[#2a2a2a] hover:ring-[#3a3a3a]"
            }`}
          >
            {position !== null && (
              <span
                title={`Position ${position} in the storefront gallery`}
                className="absolute top-2 left-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-[#0e7a5c] px-1.5 text-[12px] font-semibold text-white tabular-nums"
              >
                {position}
              </span>
            )}
            {showCheckboxes && (
              <div className={`absolute top-2 z-10 ${position !== null ? "left-10" : "left-2"}`}>
                <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
              </div>
            )}
            <div className="absolute top-2 right-2 z-10">
              <CardActions item={item} onRename={actions.onRename} onDelete={actions.onDelete} onMove={actions.onMove} />
            </div>
            <div className="relative grid aspect-[4/3] place-items-center bg-[#0a0a0a]">
              {item.type === "folder" ? (
                // Reached only with "Mixed with files", where every tile in a
                // row has to be the same height.
                <span className="grid size-12 place-items-center rounded-2xl bg-[#e85d04]/15">
                  <Folder className="size-6 text-[#e85d04]" strokeWidth={1.5} />
                </span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={contentUrl(item.path, 480)}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-3">
              <ItemIcon item={item} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#e8e8e8]">{item.name}</span>
              <button
                type="button"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onDelete(item);
                }}
                className="grid size-7 shrink-0 place-items-center rounded-full text-[#cfcfcf] hover:bg-[#2a1212] hover:text-[#f0b4b4]"
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildRows(
  items: DriveItem[],
  view: "grid" | "list",
  width: number,
  foldersFirst: boolean,
): VirtualRow[] {
  if (view === "list") {
    return items.map((item) => ({ kind: "listRow", key: item.path, item }));
  }

  // Mixed with files: one grid in sort order, folders shown as tiles so every
  // cell in a row is the same height.
  if (!foldersFirst) {
    const columns = columnsFor(width, FILE_COLUMN);
    return chunk(items, columns).map((group, index) => ({
      kind: "files",
      key: `mixed:${index}`,
      items: group,
      columns,
      start: index * columns,
    }));
  }

  const folders = items.filter((item) => item.type === "folder");
  const files = items.filter((item) => item.type === "file");
  const rows: VirtualRow[] = [];

  if (folders.length > 0) {
    const columns = columnsFor(width, FOLDER_COLUMN);
    rows.push({ kind: "section", key: "section:folders", label: "Folders", first: true });
    chunk(folders, columns).forEach((group, index) => {
      rows.push({ kind: "folders", key: `folders:${index}`, items: group, columns });
    });
  }

  if (files.length > 0) {
    const columns = columnsFor(width, FILE_COLUMN);
    rows.push({
      kind: "section",
      key: "section:files",
      label: "Files",
      first: folders.length === 0,
    });
    chunk(files, columns).forEach((group, index) => {
      rows.push({
        kind: "files",
        key: `files:${index}`,
        items: group,
        columns,
        start: index * columns,
      });
    });
  }

  return rows;
}

function estimateRow(row: VirtualRow, width: number): number {
  if (!row) return 60;
  if (row.kind === "section") return row.first ? 32 : 56;
  if (row.kind === "listRow") return 45;
  if (row.kind === "folders") return 56 + FOLDER_COLUMN.gap;

  const columns = row.columns || 1;
  const cardWidth = (width - FILE_COLUMN.gap * (columns - 1)) / columns;
  // 4:3 thumbnail plus the filename strip beneath it.
  return (cardWidth * 3) / 4 + 44 + FILE_COLUMN.gap;
}

function columnsFor(width: number, track: { min: number; gap: number }): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + track.gap) / (track.min + track.gap)));
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

/**
 * A callback ref, not a RefObject: the grid unmounts while the folder is empty,
 * so the observer has to re-attach whenever the node appears.
 */
function useContainerWidth(): [number, (node: HTMLDivElement | null) => void] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    // ResizeObserver delivers an initial observation on observe(), so the
    // first width arrives without measuring here.
    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return [width, setNode];
}

function SelectMark({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={checked ? "Deselect" : "Select"}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`grid size-5 shrink-0 place-items-center rounded-md ring-1 ${
        checked
          ? "bg-[#0e7a5c] text-white ring-[#0e7a5c]"
          : "bg-[#0a0a0a]/70 text-transparent ring-[#5a5a5a] hover:ring-[#9a9a9a]"
      }`}
    >
      <Check className="size-3" strokeWidth={2.5} />
    </button>
  );
}

function CardActions({
  item,
  onRename,
  onDelete,
  onMove,
}: {
  item: DriveItem;
  onRename: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onMove: (item: DriveItem) => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Flip above the button when there is no room beneath it.
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
    // The menu is fixed to the viewport, so any scroll would detach it.
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
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title="More"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        className="grid size-8 place-items-center rounded-full text-[#cfcfcf] hover:bg-[#1a1a1a] hover:text-white"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </button>
      {position !== null &&
        createPortal(
          // Rendered on <body> so neither the clipped list container nor the
          // next virtualised row can paint over it.
          <div
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-2xl bg-[#161616] py-1 ring-1 ring-[#2a2a2a] shadow-xl"
          >
          <a
            href={item.type === "file" ? downloadUrl(item.path) : archiveUrl(item.path)}
            download={item.type === "file" ? item.name : `${item.name}.zip`}
            onClick={(event) => {
              event.stopPropagation();
              setPosition(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#e8e8e8] hover:bg-[#1a1a1a]"
          >
            <Download className="size-3.5" strokeWidth={1.5} />
            {item.type === "file" ? "Download" : "Download ZIP"}
          </a>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPosition(null);
              onMove(item);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#e8e8e8] hover:bg-[#1a1a1a]"
          >
            <FolderInput className="size-3.5" strokeWidth={1.5} />
            Move to
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPosition(null);
              onRename(item);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#e8e8e8] hover:bg-[#1a1a1a]"
          >
            <Pencil className="size-3.5" strokeWidth={1.5} />
            Rename
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPosition(null);
              onDelete(item);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#f0b4b4] hover:bg-[#2a1212]"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
            Delete
          </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ItemIcon({ item }: { item: DriveItem }) {
  if (item.type === "folder") {
    return <Folder className="size-4 shrink-0 text-[#e85d04]" strokeWidth={1.5} />;
  }
  return <ImageIcon className="size-4 shrink-0 text-[#0e7a5c]" strokeWidth={1.5} />;
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const isActive = active === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] hover:text-white ${
        align === "right" ? "justify-end" : ""
      } ${isActive ? "text-white" : "text-[#cde8df]"}`}
    >
      {label}
      {isActive &&
        (direction === "asc" ? (
          <ArrowUp className="size-3" strokeWidth={2} />
        ) : (
          <ArrowDown className="size-3" strokeWidth={2} />
        ))}
    </button>
  );
}
