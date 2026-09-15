import path from "node:path";

const INVALID_SEGMENT = /[<>:"|?*\\/]/;

export function normalizeRelativePath(input: string | null | undefined): string {
  const raw = (input ?? "").replace(/\\/g, "/").trim();
  if (!raw || raw === ".") return "";

  const segments = raw.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === ".." || INVALID_SEGMENT.test(segment)) {
      throw new Error("Invalid path");
    }
  }

  return segments.join("/");
}

export function joinRelative(...parts: string[]): string {
  return normalizeRelativePath(parts.filter(Boolean).join("/"));
}

export function resolveSafe(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);

  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    throw new Error("Path escapes storage root");
  }

  return absolute;
}

export function parentPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function isAllowedImage(mimeType: string, filename: string): boolean {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/svg+xml",
  ]);
  if (allowed.has(mimeType)) return true;

  const ext = path.extname(filename).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"].includes(ext);
}

export function mimeFromName(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export function splitName(filename: string): { base: string; ext: string } {
  const ext = path.extname(filename);
  return { base: ext ? filename.slice(0, -ext.length) : filename, ext };
}

/**
 * Walks "photo.png" -> "photo (1).png" -> "photo (2).png" until `taken`
 * reports the name is free, so an upload never silently replaces a file.
 */
export async function availableName(
  filename: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(filename))) return filename;

  const { base, ext } = splitName(filename);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!(await taken(candidate))) return candidate;
  }

  throw new Error(`Too many files named "${filename}"`);
}
