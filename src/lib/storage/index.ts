import path from "node:path";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();

/** Label for the master folder, shown in the sidebar and breadcrumbs. */
export const MASTER_FOLDER_NAME = process.env.MASTER_FOLDER_NAME ?? "SKU Images";

const DEFAULT_LOCAL_ROOT = "data/sku-master";

function configuredLocalRoot(): string {
  return process.env.LOCAL_STORAGE_ROOT?.trim() || DEFAULT_LOCAL_ROOT;
}

export function localStorageRoot(): string {
  const configured = configuredLocalRoot();
  if (configured === DEFAULT_LOCAL_ROOT) {
    return path.join(process.cwd(), "data", "sku-master");
  }
  if (path.isAbsolute(configured)) return configured;
  // A configured root is resolved at runtime, so it must not drag the whole
  // project into Turbopack's file trace.
  return path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

let cached: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!cached) {
    cached =
      STORAGE_DRIVER === "s3"
        ? new S3StorageAdapter()
        : new LocalStorageAdapter(localStorageRoot());
  }
  return cached;
}
