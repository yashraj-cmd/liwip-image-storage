import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { joinRelative, normalizeRelativePath } from "@/lib/storage/paths";
import { clearDerivatives } from "@/lib/storage/derivatives";
import type { StorageItem } from "@/lib/storage/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const body = (await request.json()) as {
      paths?: string[];
      destination?: string;
      mode?: "move" | "copy";
    };

    const mode = body.mode === "copy" ? "copy" : "move";
    const destination = normalizeRelativePath(body.destination);
    const targets = (body.paths ?? [])
      .map((item) => normalizeRelativePath(item))
      .filter(Boolean);

    if (targets.length === 0) {
      return NextResponse.json({ error: "Nothing to move" }, { status: 400 });
    }
    if (!destination) {
      return NextResponse.json(
        { error: "Pick a SKU folder to move into." },
        { status: 400 },
      );
    }

    for (const target of targets) {
      if (target === destination) {
        return NextResponse.json(
          { error: "A folder cannot be moved into itself." },
          { status: 400 },
        );
      }
      // Moving SKU-01 into SKU-01/sub would otherwise orphan the folder.
      if (destination.startsWith(`${target}/`)) {
        return NextResponse.json(
          { error: "A folder cannot be moved inside itself." },
          { status: 400 },
        );
      }
    }

    const storage = getStorage();
    const items: StorageItem[] = [];

    for (const target of targets) {
      const name = target.split("/").pop() ?? target;
      if (await storage.exists(joinRelative(destination, name))) {
        return NextResponse.json(
          { error: `"${name}" already exists in the destination folder.` },
          { status: 409 },
        );
      }
      if (mode === "move") await clearDerivatives(storage, target);
      items.push(await storage.transfer(target, destination, mode));
    }

    return NextResponse.json({ items, mode });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to move");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
