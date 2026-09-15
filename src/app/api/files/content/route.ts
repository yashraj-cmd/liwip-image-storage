import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import sharp from "sharp";
import { getStorage } from "@/lib/storage";
import { normalizeRelativePath } from "@/lib/storage/paths";
import { THUMBNAIL_WIDTHS, thumbnailPath } from "@/lib/storage/derivatives";

export const runtime = "nodejs";

const ALLOWED_WIDTHS = new Set<number>(THUMBNAIL_WIDTHS);

/** sharp cannot rasterise these, so they are always served as-is. */
const PASSTHROUGH = new Set(["image/svg+xml", "application/octet-stream"]);

/**
 * An SVG is a script-capable document, not a flat image. Served inline from
 * our own origin it would run with the viewer's session, so it is always sent
 * as an attachment with a neutral type.
 */
const NEVER_INLINE = new Set(["image/svg+xml"]);

const THUMBNAIL_HEADERS = {
  "Content-Type": "image/webp",
  "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const pathParam = request.nextUrl.searchParams.get("path") ?? "";
    const relativePath = normalizeRelativePath(pathParam);
    if (!relativePath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const widthParam = Number(request.nextUrl.searchParams.get("w"));
    const width = ALLOWED_WIDTHS.has(widthParam) ? widthParam : null;
    const download = request.nextUrl.searchParams.get("download") === "1";
    const storage = getStorage();

    // Full-size requests skip this process entirely when the driver can hand
    // out a direct URL (S3 presigned GET).
    const isSvg = relativePath.toLowerCase().endsWith(".svg");

    // SVGs skip the presigned redirect so they always pass through the
    // hardened headers below rather than rendering from the bucket origin.
    if (!width && storage.signedUrl && !isSvg) {
      const name = relativePath.split("/").pop() ?? "image";
      const url = await storage.signedUrl(relativePath, download ? name : undefined);
      if (url) return NextResponse.redirect(url, 307);
    }

    if (width) {
      const cachedPath = thumbnailPath(relativePath, width);

      // Already generated: hand the browser a direct URL, or the stored bytes.
      if (await storage.exists(cachedPath)) {
        if (storage.signedUrl) {
          const url = await storage.signedUrl(cachedPath);
          if (url) return NextResponse.redirect(url, 307);
        }
        const cached = await storage.readFile(cachedPath);
        return new NextResponse(new Uint8Array(cached.buffer), {
          headers: THUMBNAIL_HEADERS,
        });
      }

      const original = await storage.readFile(relativePath);
      if (!PASSTHROUGH.has(original.mimeType)) {
        try {
          const thumbnail = await sharp(original.buffer)
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 78 })
            .toBuffer();

          // Store it so the original is never downloaded for this size again.
          // A failure here costs speed, not correctness.
          try {
            await storage.writeFile(cachedPath, thumbnail, "image/webp");
          } catch (error) {
            console.error("Could not cache thumbnail", cachedPath, error);
          }

          return new NextResponse(new Uint8Array(thumbnail), {
            headers: THUMBNAIL_HEADERS,
          });
        } catch {
          // A file sharp cannot decode still deserves to be served as-is
          // rather than leaving a hole in the grid.
        }
      }

      return serveOriginal(original, download);
    }

    return serveOriginal(await storage.readFile(relativePath), download);
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to read file");
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

function serveOriginal(
  file: { buffer: Buffer; mimeType: string; name: string },
  download: boolean,
): NextResponse {
  const unsafe = NEVER_INLINE.has(file.mimeType);

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      // Neutral type plus nosniff stops the browser rendering (and running) it.
      "Content-Type": unsafe ? "application/octet-stream" : file.mimeType,
      "Content-Disposition": `${download || unsafe ? "attachment" : "inline"}; filename="${encodeURIComponent(file.name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=60",
    },
  });
}
