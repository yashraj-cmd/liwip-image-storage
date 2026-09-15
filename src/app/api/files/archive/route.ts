import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { getStorage } from "@/lib/storage";
import { normalizeRelativePath } from "@/lib/storage/paths";
import { isHiddenPath } from "@/lib/storage/derivatives";

export const runtime = "nodejs";

/** Belt and braces against an accidental request for the entire library. */
const MAX_FILES = 5000;

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const pathParam = request.nextUrl.searchParams.get("path") ?? "";
    const relativePath = normalizeRelativePath(pathParam);
    if (!relativePath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const storage = getStorage();
    // Cached thumbnails are an implementation detail; they never go in a zip.
    const files = (await storage.listRecursive(relativePath)).filter(
      (file) => !isHiddenPath(file.path),
    );

    if (files.length === 0) {
      return NextResponse.json({ error: "This folder has no images." }, { status: 404 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `This folder holds more than ${MAX_FILES} images.` },
        { status: 413 },
      );
    }

    const folderName = relativePath.split("/").pop() ?? "images";
    // Images are already compressed, so storing beats deflating them again.
    const archive = new ZipArchive({ zlib: { level: 0 } });

    void (async () => {
      try {
        for (const file of files) {
          const payload = await storage.readFile(file.path);
          archive.append(payload.buffer, {
            name: file.path.slice(relativePath.length + 1) || file.name,
            date: new Date(file.updatedAt),
          });
        }
        await archive.finalize();
      } catch (error) {
        archive.abort();
        console.error("Failed to build archive", error);
      }
    })();

    return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to build archive");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
