import type { DriveItem } from "@/lib/drive";

export type SortKey = "position" | "name" | "updatedAt" | "size";
export type SortDirection = "asc" | "desc";

export type SortState = {
  key: SortKey;
  direction: SortDirection;
  foldersFirst: boolean;
};

export const DEFAULT_SORT: SortState = {
  key: "name",
  direction: "asc",
  foldersFirst: true,
};

export const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: "position", label: "Manual order" },
  { key: "name", label: "Name" },
  { key: "updatedAt", label: "Date modified" },
  { key: "size", label: "File size" },
];

/** Direction wording only makes sense relative to what is being sorted. */
export function directionLabels(key: SortKey): { asc: string; desc: string } {
  if (key === "position") return { asc: "First to last", desc: "Last to first" };
  if (key === "updatedAt") return { asc: "Oldest first", desc: "Newest first" };
  if (key === "size") return { asc: "Smallest first", desc: "Largest first" };
  return { asc: "A to Z", desc: "Z to A" };
}

export function sortItems(items: DriveItem[], sort: SortState): DriveItem[] {
  const sign = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    if (sort.foldersFirst && a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }

    let comparison = 0;
    if (sort.key === "position") {
      // Unplaced files (a fresh upload) sort after everything with a position.
      const left = a.position ?? Number.MAX_SAFE_INTEGER;
      const right = b.position ?? Number.MAX_SAFE_INTEGER;
      comparison = left - right;
    } else if (sort.key === "name") {
      comparison = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    } else if (sort.key === "size") {
      comparison = a.size - b.size;
    } else {
      comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }

    // Ties fall back to name so the order never jitters between renders.
    return comparison !== 0 ? comparison * sign : a.name.localeCompare(b.name);
  });
}

const STORAGE_KEY = "sku-sort";

export function loadSort(): SortState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    return {
      key: SORT_KEYS.some((entry) => entry.key === parsed.key)
        ? (parsed.key as SortKey)
        : DEFAULT_SORT.key,
      direction: parsed.direction === "desc" ? "desc" : "asc",
      foldersFirst: parsed.foldersFirst !== false,
    };
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSort(sort: SortState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // Private windows and blocked storage are not worth failing over.
  }
}
