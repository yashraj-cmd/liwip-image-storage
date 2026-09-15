"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconFolder,
  IconFolderPlus,
  IconFolderSymlink,
  IconLoader2,
  IconPhoto,
  IconPhotoPlus,
  IconSquare,
  IconSquareCheck,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { DriveBreadcrumbs } from "./DriveBreadcrumbs";
import { DriveHeader } from "./DriveHeader";
import { DriveSidebar } from "./DriveSidebar";
import { FileGrid, REORDER_MIME, type ReorderHandlers } from "./FileGrid";
import { apiFetch, contentUrl, parseSkuList, type DriveItem } from "@/lib/drive";
import {
  DEFAULT_SORT,
  loadSort,
  saveSort,
  sortItems,
  type SortKey,
  type SortState,
} from "./sorting";
import { SortMenu } from "./SortMenu";
import {
  dropHasDirectory,
  entriesFromDrop,
  entriesFromInput,
  type UploadEntry,
} from "./folderUpload";

export type DriveUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type DriveAppProps = {
  masterLabel: string;
  user: DriveUser;
};

type PendingDelete = { paths: string[]; label?: string; type?: "folder" | "file" };

export function DriveApp({ masterLabel, user }: DriveAppProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [items, setItems] = useState<DriveItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameItem, setRenameItem] = useState<DriveItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [preview, setPreview] = useState<DriveItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [moveTargets, setMoveTargets] = useState<PendingDelete | null>(null);
  const [destinations, setDestinations] = useState<DriveItem[]>([]);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [overPath, setOverPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const crumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    const trail = [{ label: masterLabel, path: "" }];
    parts.forEach((part, index) => {
      trail.push({ label: part, path: parts.slice(0, index + 1).join("/") });
    });
    return trail;
  }, [currentPath, masterLabel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((item) => item.name.toLowerCase().includes(q))
      : items;
    return sortItems(matched, sort);
  }, [items, query, sort]);

  function applySort(next: SortState) {
    setSort(next);
    saveSort(next);
  }

  /** Clicking a list column header picks that key, or flips it if already active. */
  function toggleSort(key: SortKey) {
    applySort(
      key === sort.key
        ? { ...sort, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { ...sort, key, direction: "asc" },
    );
  }

  const pendingSkus = useMemo(() => parseSkuList(folderName), [folderName]);
  const selectedItems = items.filter((item) => selectedPaths.includes(item.path));
  const singleFolder =
    selectedItems.length === 1 && selectedItems[0].type === "folder"
      ? selectedItems[0]
      : null;
  const uploadTarget = singleFolder ? singleFolder.path : currentPath;
  const canAddImages = Boolean(uploadTarget);
  const atMaster = currentPath === "";
  const allSelected = filtered.length > 0 && filtered.every((item) => selectedPaths.includes(item.path));

  async function load(path = currentPath) {
    // Navigating faster than the network can answer would otherwise let an
    // earlier folder's response overwrite the one being shown.
    const request = (requestRef.current += 1);
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = (await response.json()) as {
        items?: DriveItem[];
        error?: string;
        ordered?: boolean;
      };
      if (request !== requestRef.current) return;
      if (!response.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items ?? []);
      // A folder with a saved gallery order opens in that order, since it is
      // what the storefront will show. The stored preference is left alone.
      if (data.ordered) {
        setSort((current) => ({ ...current, key: "position", direction: "asc" }));
      }
      setSelectedPaths([]);
      setSelectionMode(false);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    // Fetching the folder listing is exactly the external-system sync effects exist for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    // Reading the stored preference has to wait for the client, so the server
    // render and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSort(loadSort());
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openItem(item: DriveItem) {
    if (item.type === "folder") {
      setCurrentPath(item.path);
      return;
    }
    setPreview(item);
  }

  async function createFolder() {
    // One name or a pasted list of SKUs, separated by newlines or commas.
    const names = parseSkuList(folderName);
    if (names.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/files/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: currentPath, names }),
      });
      const data = (await response.json()) as {
        error?: string;
        items?: DriveItem[];
        skipped?: string[];
      };
      if (!response.ok) throw new Error(data.error || "Could not create folder");

      const created = data.items ?? [];
      const skipped = data.skipped ?? [];
      if (names.length > 1 || skipped.length > 0) {
        setNotice(
          `Created ${created.length} SKU folder${created.length === 1 ? "" : "s"}` +
            (skipped.length > 0 ? `, skipped ${skipped.length} that already existed.` : "."),
        );
      }

      setFolderModal(false);
      setFolderName("");
      // The API hands back the new folders, so no round trip is needed.
      setItems((current) => sortItems([...current, ...created], sort));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(entries: UploadEntry[], isFolderUpload = false) {
    // A folder upload creates its own SKU folders, so the master folder is a
    // valid target for it even though loose images are not allowed there.
    const target = isFolderUpload ? uploadTarget || currentPath : uploadTarget;
    if (!isFolderUpload && !canAddImages) {
      setError("Open or select a SKU folder first, then add images.");
      return;
    }
    if (entries.length === 0) return;

    const form = new FormData();
    form.set("path", target);
    entries.forEach((entry) => {
      form.append("files", entry.file);
      form.append("relativePaths", isFolderUpload ? entry.relativePath : entry.file.name);
    });

    setBusy(true);
    setError(null);
    setNotice(null);
    setUploadPercent(0);
    try {
      const data = await uploadWithProgress(form, setUploadPercent);
      const renamed = data.renamed ?? [];
      const skipped = data.skipped ?? [];
      const parts: string[] = [];

      if (isFolderUpload) {
        parts.push(
          `Uploaded ${data.items?.length ?? 0} images into ${data.folders ?? 0} SKU folders.`,
        );
      }
      if (renamed.length > 0) {
        parts.push(
          renamed.length === 1
            ? `"${renamed[0].from}" already existed, saved as "${renamed[0].to}".`
            : `${renamed.length} images already existed and were saved under new names.`,
        );
      }
      if (skipped.length > 0) {
        parts.push(`Skipped ${skipped.length} unsupported file${skipped.length === 1 ? "" : "s"}.`);
      }
      if (parts.length > 0) setNotice(parts.join(" "));

      if (isFolderUpload) {
        await load(currentPath);
      } else if (singleFolder && singleFolder.path !== currentPath) {
        setCurrentPath(singleFolder.path);
      } else {
        // The API returns the stored items, so merge them in place.
        const uploaded = data.items ?? [];
        setItems((current) => {
          const byPath = new Map(current.map((item) => [item.path, item]));
          uploaded.forEach((item) => byPath.set(item.path, item));
          return sortItems([...byPath.values()], sort);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadPercent(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleSelect(item: DriveItem, additive: boolean) {
    // Once checkboxes are showing, a plain click toggles that one item. Without
    // this, clicking a card after "Select all" would throw the whole selection
    // away and keep only the card just clicked.
    const toggling = additive || selectionMode;

    setSelectedPaths((current) => {
      if (toggling) {
        return current.includes(item.path)
          ? current.filter((path) => path !== item.path)
          : [...current, item.path];
      }
      return current.length === 1 && current[0] === item.path ? [] : [item.path];
    });
  }

  /**
   * Reordering only applies to the images inside a SKU folder, which is what
   * the storefront renders as a product gallery.
   */
  const canReorder = !atMaster && filtered.some((item) => item.type === "file");

  async function persistOrder(ordered: DriveItem[]) {
    const files = ordered.filter((item) => item.type === "file").map((item) => item.name);
    if (files.length === 0) return;

    const snapshot = items;
    // Renumber locally first so badges update on drop, not after the round trip.
    setItems(
      ordered.map((item, index) =>
        item.type === "file" ? { ...item, position: index } : item,
      ),
    );
    applySort({ ...sort, key: "position", direction: "asc" });

    try {
      const response = await apiFetch("/api/files/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, files }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the order");
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof Error ? err.message : "Could not save the order");
    }
  }

  function handleReorderDrop(target: DriveItem) {
    const from = filtered.findIndex((item) => item.path === draggingPath);
    const to = filtered.findIndex((item) => item.path === target.path);
    setDraggingPath(null);
    setOverPath(null);
    if (from < 0 || to < 0 || from === to) return;

    const next = [...filtered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(next);
  }

  const reorderHandlers: ReorderHandlers | null = canReorder
    ? {
        draggingPath,
        overPath,
        onDragStart: (item) => setDraggingPath(item.path),
        onDragOver: (item) => setOverPath(item.path),
        onDragEnd: () => {
          setDraggingPath(null);
          setOverPath(null);
        },
        onDrop: handleReorderDrop,
      }
    : null;

  function clearSelection() {
    setSelectedPaths([]);
    setSelectionMode(false);
  }

  // "Select all" is also what turns the checkboxes on; clearing hides them again.
  function toggleSelectAll() {
    if (allSelected) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
    setSelectedPaths(filtered.map((item) => item.path));
  }

  function requestDelete(
    paths: string[],
    label?: string,
    type?: "folder" | "file",
  ) {
    if (paths.length === 0) return;
    setPendingDelete({ paths, label, type });
  }

  async function confirmDelete() {
    const paths = pendingDelete?.paths ?? [];
    if (paths.length === 0) return;

    // Drop the rows straight away and put them back if the server disagrees.
    const snapshot = items;
    const removing = new Set(paths);
    setItems((current) => current.filter((item) => !removing.has(item.path)));
    setSelectedPaths((current) => current.filter((path) => !removing.has(path)));
    setPreview(null);
    setPendingDelete(null);
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Delete failed");
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function renameCurrent() {
    if (!renameItem) return;
    const target = renameItem;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: renameItem.path, name }),
      });
      const data = (await response.json()) as { error?: string; item?: DriveItem };
      if (!response.ok) throw new Error(data.error || "Rename failed");

      const renamed = data.item;
      if (renamed) {
        setItems((current) =>
          sortItems(
            current.map((item) => (item.path === target.path ? renamed : item)),
            sort,
          ),
        );
      }
      setRenameItem(null);
      setRenameValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  function requestMove(paths: string[], label?: string) {
    if (paths.length === 0) return;
    setMoveTargets({ paths, label });
    void loadDestinations();
  }

  async function loadDestinations() {
    try {
      const response = await apiFetch("/api/files?path=");
      const data = (await response.json()) as { items?: DriveItem[] };
      setDestinations((data.items ?? []).filter((item) => item.type === "folder"));
    } catch {
      setDestinations([]);
    }
  }

  async function moveTo(destination: string) {
    const paths = moveTargets?.paths ?? [];
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths, destination, mode: "move" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Move failed");

      const moved = new Set(paths);
      setItems((current) => current.filter((item) => !moved.has(item.path)));
      setSelectedPaths([]);
      setMoveTargets(null);
      setNotice(
        `Moved ${paths.length} item${paths.length === 1 ? "" : "s"} into ${destination}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <DriveSidebar
          masterLabel={masterLabel}
          user={user}
          newOpen={newOpen}
          canUpload={canAddImages}
          onToggleNew={() => setNewOpen((open) => !open)}
          onCloseNew={() => setNewOpen(false)}
          onHome={() => setCurrentPath("")}
          onNewFolder={() => {
            setNewOpen(false);
            setFolderModal(true);
          }}
          onUpload={() => {
            setNewOpen(false);
            fileInputRef.current?.click();
          }}
          onUploadFolder={() => {
            setNewOpen(false);
            folderInputRef.current?.click();
          }}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <DriveHeader
            masterLabel={masterLabel}
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
          />

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-4">
            <div className="min-w-0">
              {!atMaster && (
                <DriveBreadcrumbs crumbs={crumbs} onNavigate={setCurrentPath} />
              )}
              <div
                className="flex min-h-8 min-w-0 items-center gap-1.5"
              >
                {selectedPaths.length > 0 && (
                  <button
                    type="button"
                    title="Clear selection"
                    aria-label="Clear selection"
                    onClick={clearSelection}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground ks-transition grid size-5 shrink-0 place-items-center"
                  >
                    <IconX size={14} stroke={1.75} />
                  </button>
                )}
                <p className="text-muted-foreground line-clamp-1 text-[12px]">
                  {selectedPaths.length > 0
                    ? `${selectedPaths.length} selected`
                    : atMaster
                      ? "Create a SKU folder, open it, then add images when you are ready."
                      : "Images added here stay with this SKU."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedPaths.length > 0 && (
                <button
                  type="button"
                  onClick={() => requestMove(selectedPaths)}
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground ks-transition inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium whitespace-nowrap"
                >
                  <IconFolderSymlink size={14} stroke={1.75} />
                  Move
                </button>
              )}
              {selectedPaths.length > 0 && (
                <button
                  type="button"
                  onClick={() => requestDelete(selectedPaths)}
                  className="text-destructive hover:bg-destructive/10 ks-transition inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium whitespace-nowrap"
                >
                  <IconTrash size={14} stroke={1.75} />
                  Delete {selectedPaths.length}
                </button>
              )}
              {filtered.length > 0 && <SortMenu sort={sort} onChange={applySort} />}
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground ks-transition inline-flex h-8 min-w-[96px] items-center justify-center gap-1.5 px-2 text-[12px] font-medium whitespace-nowrap"
                >
                  {allSelected ? (
                    <IconSquareCheck size={14} stroke={1.75} />
                  ) : (
                    <IconSquare size={14} stroke={1.75} />
                  )}
                  {allSelected ? "Clear" : "Select all"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFolderModal(true)}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground ks-transition inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium whitespace-nowrap"
              >
                <IconFolderPlus size={14} stroke={1.75} />
                {atMaster ? "New SKU" : "New folder"}
              </button>
              <button
                type="button"
                disabled={!canAddImages}
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary text-primary-foreground ks-transition inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium whitespace-nowrap hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <IconLoader2 size={14} stroke={1.75} className="animate-spin" /> : <IconPhotoPlus size={14} stroke={1.75} />}
                Add
              </button>
            </div>
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mx-6 mb-3 border px-3 py-2 text-[12px]">
              {error}
            </div>
          )}

          {notice && (
            <div className="border-primary/30 bg-primary/10 text-foreground mx-6 mb-3 border px-3 py-2 text-[12px]">
              {notice}
            </div>
          )}

          {uploadPercent !== null && (
            <div className="bg-card ring-foreground/10 mx-6 mb-3 px-3 py-2 ring-1">
              <div className="flex items-center justify-between text-[12px]">
                <span>
                  {uploadPercent < 100 ? "Uploading images" : "Saving images"}
                </span>
                <span className="text-muted-foreground tabular-nums">{uploadPercent}%</span>
              </div>
              <div className="bg-muted mt-2 h-1 overflow-hidden">
                <div
                  className="bg-primary h-full transition-[width] duration-150"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            onClick={(event) => {
              // Anything that is not a card counts as tapping outside.
              if ((event.target as HTMLElement).closest("[data-card]")) return;
              if (selectedPaths.length > 0 || selectionMode) clearSelection();
            }}
            className={`h-[calc(100%-4rem)] overflow-auto px-6 pb-6 ${dragOver ? "bg-primary/5" : ""}`}
            onDragOver={(event) => {
              // An image being dragged to a new position is not an upload.
              if (event.dataTransfer.types.includes(REORDER_MIME)) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              if (event.dataTransfer.types.includes(REORDER_MIME)) {
                setDragOver(false);
                return;
              }
              event.preventDefault();
              setDragOver(false);
              const transfer = event.dataTransfer;
              // Dropping folders recreates them as SKU folders.
              if (dropHasDirectory(transfer)) {
                void entriesFromDrop(transfer).then((entries) =>
                  uploadFiles(entries, true),
                );
              } else {
                void uploadFiles(entriesFromInput(transfer.files));
              }
            }}
          >
            {loading ? (
              <div className="text-muted-foreground flex h-64 items-center justify-center">
                <IconLoader2 size={20} stroke={1.75} className="animate-spin" />
              </div>
            ) : (
              <FileGrid
                reorder={reorderHandlers}
                scrollRef={scrollRef}
                items={filtered}
                selectedPaths={selectedPaths}
                showCheckboxes={selectionMode}
                view={view}
                onSelect={toggleSelect}
                onOpen={openItem}
                sort={sort}
                onSort={toggleSort}
                onMove={(item) => requestMove([item.path], item.name)}
                onRename={(item) => {
                  setRenameItem(item);
                  setRenameValue(
                    item.type === "file" ? item.name.replace(/\.[^.]+$/, "") : item.name,
                  );
                }}
                onDelete={(item) => requestDelete([item.path], item.name, item.type)}
              />
            )}
          </div>
        </main>
        </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void uploadFiles(entriesFromInput(event.target.files));
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        // Non-standard but supported everywhere this app runs.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            void uploadFiles(entriesFromInput(event.target.files), true);
          }
        }}
      />

      {folderModal && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 p-4 backdrop-blur-sm">
          <div className="bg-popover ring-foreground/10 w-full max-w-sm p-4 shadow-md ring-1">
            <h2 className="text-[14px] font-medium tracking-tight">New SKU folder</h2>
            <p className="text-muted-foreground mt-1 text-[12px] leading-5">
              Name it after the SKU, for example{" "}
              <span className="text-foreground font-mono">SKU-1044</span>. Paste a list to
              create many at once.
            </p>
            <textarea
              autoFocus
              rows={pendingSkus.length > 1 ? 5 : 1}
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && pendingSkus.length <= 1) {
                  event.preventDefault();
                  void createFolder();
                }
              }}
              placeholder="SKU name, or one per line"
              className="border-input focus:ring-ring/50 placeholder:text-muted-foreground mt-4 w-full resize-none border bg-transparent px-2 py-1.5 font-mono text-[12px] leading-5 outline-none focus:ring-1"
            />
            {pendingSkus.length > 1 && (
              <p className="text-muted-foreground mt-2 text-[12px]">
                {pendingSkus.length} SKU folders will be created.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFolderModal(false);
                  setFolderName("");
                }}
                className="border-input hover:bg-accent ks-transition h-8 border px-3 text-[12px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || pendingSkus.length === 0}
                onClick={() => void createFolder()}
                className="bg-primary text-primary-foreground ks-transition h-8 px-3 text-[12px] font-medium hover:opacity-90 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {moveTargets && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 p-4 backdrop-blur-sm">
          <div className="bg-popover ring-foreground/10 w-full max-w-sm p-4 shadow-md ring-1">
            <h2 className="text-[14px] font-medium tracking-tight">
              Move {moveTargets.paths.length === 1
                ? moveTargets.label ?? "1 item"
                : `${moveTargets.paths.length} items`}
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px] leading-5">
              Pick the SKU folder to move into.
            </p>

            <div className="ring-foreground/10 mt-4 max-h-56 overflow-auto ring-1">
              <button
                type="button"
                disabled={busy || currentPath === ""}
                onClick={() => void moveTo("")}
                className="hover:bg-accent ks-transition disabled:text-muted-foreground flex h-8 w-full items-center gap-2 px-2 text-left text-[12px] disabled:hover:bg-transparent"
              >
                <IconPhoto size={14} stroke={1.75} className="text-muted-foreground" />
                {masterLabel}
              </button>
              {destinations
                .filter((folder) => !moveTargets.paths.includes(folder.path))
                .map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    disabled={busy || folder.path === currentPath}
                    onClick={() => void moveTo(folder.path)}
                    className="border-border hover:bg-accent ks-transition disabled:text-muted-foreground flex h-8 w-full items-center gap-2 border-t px-2 text-left text-[12px] disabled:hover:bg-transparent"
                  >
                    <IconFolder size={14} stroke={1.75} className="text-muted-foreground" />
                    {folder.name}
                  </button>
                ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMoveTargets(null)}
                className="border-input hover:bg-accent ks-transition h-8 border px-3 text-[12px] font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 p-4 backdrop-blur-sm">
          <div className="bg-popover ring-foreground/10 w-full max-w-sm p-4 shadow-md ring-1">
            <h2 className="text-[14px] font-medium tracking-tight">
              {pendingDelete.paths.length > 1
                ? `Delete ${pendingDelete.paths.length} items?`
                : pendingDelete.type === "folder"
                  ? "Delete this SKU folder?"
                  : "Delete this image?"}
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px] leading-5">
              {pendingDelete.paths.length > 1 ? (
                "Folders are removed with everything inside them. This cannot be undone."
              ) : (
                <>
                  <span className="text-foreground font-mono">
                    {pendingDelete.label ?? pendingDelete.paths[0]}
                  </span>
                  {pendingDelete.type === "folder"
                    ? " and every image inside it will be removed."
                    : " will be removed."}{" "}
                  This cannot be undone.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setPendingDelete(null)}
                className="border-input hover:bg-accent ks-transition h-8 border px-3 text-[12px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
                className="bg-destructive ks-transition inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? (
                  <IconLoader2 size={14} stroke={1.75} className="animate-spin" />
                ) : (
                  <IconTrash size={14} stroke={1.75} />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {renameItem && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 p-4 backdrop-blur-sm">
          <div className="bg-popover ring-foreground/10 w-full max-w-sm p-4 shadow-md ring-1">
            <h2 className="text-[14px] font-medium tracking-tight">Rename</h2>
            <p className="text-muted-foreground mt-1 text-[12px] leading-5">
              {renameItem.type === "file"
                ? "File extension is kept automatically."
                : "This will rename the SKU folder."}
            </p>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameCurrent();
              }}
              className="border-input focus:ring-ring/50 placeholder:text-muted-foreground mt-4 h-8 w-full border bg-transparent px-2 font-mono text-[12px] outline-none focus:ring-1"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameItem(null);
                  setRenameValue("");
                }}
                className="border-input hover:bg-accent ks-transition h-8 border px-3 text-[12px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !renameValue.trim()}
                onClick={() => void renameCurrent()}
                className="bg-primary text-primary-foreground ks-transition h-8 px-3 text-[12px] font-medium hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-background/95 fixed inset-0 z-40 flex flex-col backdrop-blur-sm">
          <div className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
            <p className="truncate font-mono text-[12px]">{preview.name}</p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground ks-transition grid size-8 place-items-center"
            >
              <IconX size={16} stroke={1.75} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contentUrl(preview.path)}
              alt={preview.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

type UploadResponse = {
  items?: DriveItem[];
  renamed?: { from: string; to: string }[];
  skipped?: string[];
  folders?: number;
};

/**
 * fetch() cannot report upload progress, so the one place that sends bytes
 * uses XHR instead.
 */
function uploadWithProgress(
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files/upload");

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status === 401) {
        // Hard navigation on purpose, as in apiFetch.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
        return;
      }

      let data: UploadResponse & { error?: string } = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        data = {};
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || "Upload failed"));
      }
    };

    request.onerror = () => reject(new Error("Upload failed"));
    request.onabort = () => reject(new Error("Upload cancelled"));
    request.send(form);
  });
}
