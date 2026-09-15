/**
 * Browsers expose dropped folders through webkitGetAsEntry, and folder <input>
 * elements through webkitRelativePath. Both are normalised here into
 * { file, relativePath } pairs the upload route accepts.
 */

export type UploadEntry = { file: File; relativePath: string };

/** Files picked through an <input webkitdirectory> element. */
export function entriesFromInput(files: FileList | File[]): UploadEntry[] {
  return Array.from(files).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

/** True when the drop carries at least one directory. */
export function dropHasDirectory(transfer: DataTransfer): boolean {
  return Array.from(transfer.items).some(
    (item) => item.webkitGetAsEntry()?.isDirectory ?? false,
  );
}

/** Walks dropped folders depth-first, keeping each file's path inside the drop. */
export async function entriesFromDrop(transfer: DataTransfer): Promise<UploadEntry[]> {
  const roots = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (roots.length === 0) return entriesFromInput(transfer.files);

  const collected: UploadEntry[] = [];
  for (const root of roots) {
    await walk(root, "", collected);
  }
  return collected;
}

async function walk(
  entry: FileSystemEntry,
  prefix: string,
  collected: UploadEntry[],
): Promise<void> {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File | null>((resolve) => {
      fileEntry.file(resolve, () => resolve(null));
    });
    if (file) collected.push({ file, relativePath });
    return;
  }

  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most 100 entries per call, so keep going until empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0) break;
    for (const child of batch) {
      await walk(child, relativePath, collected);
    }
  }
}
