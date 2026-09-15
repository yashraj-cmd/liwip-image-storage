import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import path from "node:path";
import { getStorage } from "@/lib/storage";
import { joinRelative, normalizeRelativePath, parentPath } from "@/lib/storage/paths";
import { clearDerivatives } from "@/lib/storage/derivatives";
import { applyPositions, readOrder } from "@/lib/storage/order";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const pathParam = request.nextUrl.searchParams.get("path") ?? "";
    const relativePath = normalizeRelativePath(pathParam);
    const storage = getStorage();
    const items = await storage.list(relativePath);

    // Inside a SKU folder, attach the manual order the storefront uses.
    const order = relativePath ? await readOrder(storage, relativePath) : [];
    return NextResponse.json({
      path: relativePath,
      items: applyPositions(items, order),
      ordered: order.length > 0,
    });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to list files");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const body = (await request.json()) as { path?: string; name?: string };
    const relativePath = normalizeRelativePath(body.path);
    const rawName = (body.name ?? "").trim();
    if (!relativePath || !rawName) {
      return NextResponse.json({ error: "Path and name are required" }, { status: 400 });
    }

    const currentName = relativePath.split("/").pop() ?? "";
    const currentExt = path.extname(currentName);
    const nextExt = path.extname(rawName);
    const nextName = !nextExt && currentExt ? `${rawName}${currentExt}` : rawName;
    normalizeRelativePath(nextName);

    const storage = getStorage();

    if (nextName !== currentName) {
      // rename() overwrites on both drivers, so guard the destination first.
      const destination = joinRelative(parentPath(relativePath), nextName);
      if (await storage.exists(destination)) {
        return NextResponse.json(
          { error: `"${nextName}" already exists here.` },
          { status: 409 },
        );
      }
    }

    // Cached thumbnails are keyed by filename, so the old ones are now stale.
    await clearDerivatives(storage, relativePath);

    const item = await storage.rename(relativePath, nextName);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to rename");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const body = (await request.json()) as { path?: string; paths?: string[] };
    const targets = (body.paths ?? (body.path ? [body.path] : []))
      .map((itemPath) => normalizeRelativePath(itemPath))
      .filter(Boolean);

    if (targets.length === 0) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const storage = getStorage();
    for (const target of targets) {
      await clearDerivatives(storage, target);
      await storage.delete(target);
    }
    return NextResponse.json({ ok: true, count: targets.length });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to delete");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
