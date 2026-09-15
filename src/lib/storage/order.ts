import { joinRelative } from "./paths";
import type { StorageAdapter } from "./types";

/** Hidden like .thumb, so it never shows in listings or downloaded zips. */
export const ORDER_FILE = ".order.json";

type OrderDocument = {
  version: 1;
  /** Filenames, in the order the storefront should show them. */
  files: string[];
  updatedAt: string;
};

function orderPath(folder: string): string {
  return joinRelative(folder, ORDER_FILE);
}

/**
 * The manifest stores filenames rather than renaming the images, so a reorder
 * is one small write and every image URL stays valid forever. Renaming to
 * 01-, 02- prefixes would rewrite every object and break links the storefront
 * may already have cached.
 */
export async function readOrder(
  storage: StorageAdapter,
  folder: string,
): Promise<string[]> {
  try {
    const file = await storage.readFile(orderPath(folder));
    const parsed = JSON.parse(file.buffer.toString("utf8")) as Partial<OrderDocument>;
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files.filter((name): name is string => typeof name === "string");
  } catch {
    // No manifest yet, or unreadable: fall back to no explicit order.
    return [];
  }
}

export async function writeOrder(
  storage: StorageAdapter,
  folder: string,
  files: string[],
): Promise<void> {
  const document: OrderDocument = {
    version: 1,
    files,
    updatedAt: new Date().toISOString(),
  };

  await storage.writeFile(
    orderPath(folder),
    Buffer.from(JSON.stringify(document, null, 2), "utf8"),
    "application/json",
  );
}

/**
 * Positions for the files actually present. Anything in the manifest that no
 * longer exists is ignored; anything new sorts after the ordered ones, so an
 * upload never silently jumps to the front of a product gallery.
 */
export function applyPositions<T extends { name: string; type: string }>(
  items: T[],
  order: string[],
): (T & { position?: number })[] {
  if (order.length === 0) return items;

  const index = new Map(order.map((name, at) => [name, at]));
  return items.map((item) =>
    item.type === "file" && index.has(item.name)
      ? { ...item, position: index.get(item.name) }
      : item,
  );
}
