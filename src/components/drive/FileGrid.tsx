"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  IconArrowNarrowDown,
  IconArrowNarrowUp,
  IconCheck,
  IconDotsVertical,
  IconDownload,
  IconFolder,
  IconFolderSymlink,
  IconPencil,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
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

type RowActions = Pick<
  FileGridProps,
  "onSelect" | "onOpen" | "onRename" | "onDelete" | "onMove"
> & { reorder: ReorderHandlers | null };

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
const MENU_HEIGHT = 128;

/** Matches the Tailwind track definitions the cards are laid out with. */
const FOLDER_COLUMN = { min: 200, gap: 8 };
const FILE_COLUMN = { min: 168, gap: 8 };

const LIST_COLUMNS = "28px minmax(0,1fr) 140px 96px 32px";

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

  useEffect(() => {
    virtualizer.measure();
  }, [width, virtualizer]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
        <IconPhoto size={24} stroke={1.5} className="text-muted-foreground" />
        <div>
          <p className="text-[14px] font-medium">No SKU folders yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-[12px]">
            Create a folder for each SKU, open it, then add images.
          </p>
        </div>
      </div>
    );
  }

  const body = (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
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
            <RowContent
              row={row}
              selected={selected}
              showCheckboxes={showCheckboxes}
              actions={actions}
            />
          </div>
        );
      })}
    </div>
  );

  if (view === "list") {
    return (
      <div className="ring-foreground/10 min-w-0 ring-1">
        <div
          className="bg-primary text-primary-foreground grid px-2 py-2 text-[10px] font-medium tracking-[0.14em] uppercase"
          style={{ gridTemplateColumns: LIST_COLUMNS }}
        >
          <span />
          <SortHeader label="Name" sortKey="name" active={sort.key} direction={sort.direction} onSort={onSort} />
          <SortHeader label="Modified" sortKey="updatedAt" active={sort.key} direction={sort.direction} onSort={onSort} />
          <SortHeader label="Size" sortKey="size" active={sort.key} direction={sort.direction} onSort={onSort} align="right" />
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
        className={`text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.18em] uppercase ${
          row.first ? "" : "pt-4"
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
        className={`border-border ks-transition grid w-full items-center border-t px-2 py-2 text-[12px] ${
          isSelected ? "bg-primary/10" : "hover:bg-muted"
        }`}
        style={{ gridTemplateColumns: LIST_COLUMNS }}
      >
        {showCheckboxes ? (
          <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
        ) : (
          <span />
        )}
        <span className="flex min-w-0 items-center gap-2">
          <ItemIcon item={item} />
          <span className="truncate font-mono">{item.name}</span>
        </span>
        <span className="text-muted-foreground">{formatDate(item.updatedAt)}</span>
        <span className="text-muted-foreground text-right">
          {item.type === "file" ? formatBytes(item.size) : "—"}
        </span>
        <CardActions
          item={item}
          onRename={actions.onRename}
          onDelete={actions.onDelete}
          onMove={actions.onMove}
        />
      </div>
    );
  }

  if (row.kind === "folders") {
    return (
      <div
        className="grid pb-2"
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
              className={`ks-transition group flex h-8 cursor-pointer items-center gap-2 px-2 text-left text-[12px] ring-1 ${
                isSelected
                  ? "bg-primary/10 ring-primary"
                  : "bg-card ring-foreground/10 hover:bg-muted"
              }`}
            >
              {showCheckboxes && (
                <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
              )}
              <IconFolder size={14} stroke={1.75} className="text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1 truncate font-mono">{item.name}</span>
              <CardActions
                item={item}
                onRename={actions.onRename}
                onDelete={actions.onDelete}
                onMove={actions.onMove}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const reorder = actions.reorder;

  return (
    <div
      className="grid pb-2"
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
            className={`ks-transition group relative text-left ring-1 ${
              reorder && item.type === "file"
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-pointer"
            } ${isDragging ? "opacity-40" : ""} ${
              isDropTarget
                ? "ring-primary ring-2"
                : isSelected
                  ? "bg-primary/10 ring-primary"
                  : "bg-card ring-foreground/10 hover:ring-foreground/20"
            }`}
          >
            {position !== null && (
              <span
                title={`Position ${position} in the storefront gallery`}
                className="bg-primary text-primary-foreground absolute top-1 left-1 z-10 grid h-5 min-w-5 place-items-center px-1 text-[10px] font-medium tabular-nums"
              >
                {position}
              </span>
            )}
            {showCheckboxes && (
              <div className={`absolute top-1 z-10 ${position !== null ? "left-7" : "left-1"}`}>
                <SelectMark checked={isSelected} onChange={() => actions.onSelect(item, true)} />
              </div>
            )}
            <div className="absolute top-1 right-1 z-10">
              <CardActions
                item={item}
                onRename={actions.onRename}
                onDelete={actions.onDelete}
                onMove={actions.onMove}
              />
            </div>
            <div className="bg-muted relative grid aspect-[4/3] place-items-center">
              {item.type === "folder" ? (
                <IconFolder size={24} stroke={1.5} className="text-muted-foreground" />
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
            <div className="border-border flex items-center gap-1.5 border-t px-2 py-1.5">
              <ItemIcon item={item} />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{item.name}</span>
              <button
                type="button"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onDelete(item);
                }}
                className="text-muted-foreground hover:text-destructive ks-transition grid size-5 shrink-0 place-items-center"
              >
                <IconTrash size={12} stroke={1.75} />
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
  if (!row) return 40;
  if (row.kind === "section") return row.first ? 22 : 38;
  if (row.kind === "listRow") return 33;
  if (row.kind === "folders") return 32 + FOLDER_COLUMN.gap;

  const columns = row.columns || 1;
  const cardWidth = (width - FILE_COLUMN.gap * (columns - 1)) / columns;
  return (cardWidth * 3) / 4 + 30 + FILE_COLUMN.gap;
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

function SelectMark({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-label={checked ? "Deselect" : "Select"}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`ks-transition grid size-4 shrink-0 place-items-center border ${
        checked
          ? "bg-primary border-primary text-primary-foreground"
          : "border-input bg-background text-transparent hover:border-ring"
      }`}
    >
      <IconCheck size={10} stroke={3} />
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
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title="More"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        className="text-muted-foreground hover:text-foreground hover:bg-accent ks-transition grid size-6 place-items-center"
      >
        <IconDotsVertical size={14} stroke={1.75} />
      </button>
      {position !== null &&
        createPortal(
          // Rendered on <body> so neither the clipped list container nor the
          // next virtualised row can paint over it.
          <div
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="bg-popover/95 ring-foreground/10 fixed z-50 p-1 shadow-md ring-1 backdrop-blur-md"
          >
            <a
              href={item.type === "file" ? downloadUrl(item.path) : archiveUrl(item.path)}
              download={item.type === "file" ? item.name : `${item.name}.zip`}
              onClick={(event) => {
                event.stopPropagation();
                setPosition(null);
              }}
              className="text-popover-foreground hover:bg-accent hover:text-accent-foreground ks-transition flex h-7 w-full items-center gap-2 px-2 text-left text-[12px]"
            >
              <IconDownload size={14} stroke={1.75} className="text-muted-foreground" />
              {item.type === "file" ? "Download" : "Download ZIP"}
            </a>
            <MenuButton
              icon={<IconFolderSymlink size={14} stroke={1.75} />}
              onClick={() => {
                setPosition(null);
                onMove(item);
              }}
            >
              Move to
            </MenuButton>
            <MenuButton
              icon={<IconPencil size={14} stroke={1.75} />}
              onClick={() => {
                setPosition(null);
                onRename(item);
              }}
            >
              Rename
            </MenuButton>
            <MenuButton
              destructive
              icon={<IconTrash size={14} stroke={1.75} />}
              onClick={() => {
                setPosition(null);
                onDelete(item);
              }}
            >
              Delete
            </MenuButton>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuButton({
  icon,
  destructive,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`ks-transition hover:bg-accent flex h-7 w-full items-center gap-2 px-2 text-left text-[12px] ${
        destructive ? "text-destructive" : "text-popover-foreground hover:text-accent-foreground"
      }`}
    >
      <span className={destructive ? "" : "text-muted-foreground"}>{icon}</span>
      {children}
    </button>
  );
}

function ItemIcon({ item }: { item: DriveItem }) {
  if (item.type === "folder") {
    return <IconFolder size={14} stroke={1.75} className="text-muted-foreground shrink-0" />;
  }
  return <IconPhoto size={14} stroke={1.75} className="text-muted-foreground shrink-0" />;
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
      className={`flex items-center gap-1 text-[10px] font-medium tracking-[0.14em] uppercase ${
        align === "right" ? "justify-end" : ""
      } ${isActive ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
    >
      {label}
      {isActive &&
        (direction === "asc" ? (
          <IconArrowNarrowUp size={12} stroke={2} />
        ) : (
          <IconArrowNarrowDown size={12} stroke={2} />
        ))}
    </button>
  );
}
