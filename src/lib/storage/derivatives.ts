import path from "node:path";
import { joinRelative, parentPath } from "./paths";
import type { StorageAdapter } from "./types";

/** Widths the grid and list views ask for. Anything else is rejected. */
export const THUMBNAIL_WIDTHS = [96, 240, 480, 960] as const;

/** Hidden from listings because both drivers skip dot-prefixed segments. */
export const DERIVATIVE_DIR = ".thumb";

/**
 * Derivatives live beside the original, inside the same SKU folder, so the
 * recursive delete/rename/move the drivers already do carries them along and
 * they can never be orphaned by a folder operation.
 *
 *   SKU-0014/front.jpg  ->  SKU-0014/.thumb/480/front.jpg.webp
 */
export function thumbnailPath(relativePath: string, width: number): string {
  const name = path.basename(relativePath);
  return joinRelative(parentPath(relativePath), DERIVATIVE_DIR, String(width), `${name}.webp`);
}

/** True when any segment of the path is a hidden one, such as .thumb. */
export function isHiddenPath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => segment.startsWith("."));
}

/**
 * Single-file operations (rename, move, delete) only touch the file itself, so
 * its derivatives have to be cleared explicitly or they go stale.
 */
export async function clearDerivatives(
  storage: StorageAdapter,
  relativePath: string,
): Promise<void> {
  await Promise.all(
    THUMBNAIL_WIDTHS.map(async (width) => {
      try {
        await storage.delete(thumbnailPath(relativePath, width));
      } catch {
        // Nothing cached at this width, which is the common case.
      }
    }),
  );
}
