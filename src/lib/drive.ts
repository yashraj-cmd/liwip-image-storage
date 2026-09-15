export type DriveItemType = "folder" | "file";

export type DriveItem = {
  name: string;
  path: string;
  type: DriveItemType;
  size: number;
  updatedAt: string;
  mimeType?: string;
  /** Manual storefront position, when the folder has an order manifest. */
  position?: number;
};

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  // S3 has no folder timestamps, so those arrive as the epoch.
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function contentUrl(itemPath: string, width?: number): string {
  const query = `path=${encodeURIComponent(itemPath)}`;
  return `/api/files/content?${width ? `${query}&w=${width}` : query}`;
}

export function downloadUrl(itemPath: string): string {
  return `/api/files/content?path=${encodeURIComponent(itemPath)}&download=1`;
}

export function archiveUrl(folderPath: string): string {
  return `/api/files/archive?path=${encodeURIComponent(folderPath)}`;
}

/** Splits a pasted SKU list on newlines, commas, tabs or semicolons. */
export function parseSkuList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\r\n,;\t]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

/** Any 401 means the session lapsed, so bounce to the sign-in page. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === 401 && typeof window !== "undefined") {
    const target = `${window.location.pathname}${window.location.search}`;
    // A hard navigation on purpose: it re-runs middleware and drops the stale
    // client state that belonged to the expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?callbackUrl=${encodeURIComponent(target)}`;
  }

  return response;
}
