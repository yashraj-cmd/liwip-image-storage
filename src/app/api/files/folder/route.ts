import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { joinRelative, normalizeRelativePath } from "@/lib/storage/paths";
import type { StorageItem } from "@/lib/storage/types";

export const runtime = "nodejs";

const MAX_BULK = 500;

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const body = (await request.json()) as {
      parent?: string;
      name?: string;
      names?: string[];
    };

    // One name or a pasted list; both take the same path through here.
    const names = Array.from(
      new Set(
        (body.names ?? (body.name ? [body.name] : []))
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );

    if (names.length === 0) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }
    if (names.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Create at most ${MAX_BULK} SKU folders at a time.` },
        { status: 400 },
      );
    }

    const parent = normalizeRelativePath(body.parent);
    const storage = getStorage();
    const created: StorageItem[] = [];
    const skipped: string[] = [];

    for (const name of names) {
      const relativePath = joinRelative(parent, name);
      // mkdir is recursive, so without this check an existing SKU would
      // report success and quietly do nothing.
      if (await storage.exists(relativePath)) {
        skipped.push(name);
        continue;
      }
      created.push(await storage.mkdir(relativePath));
    }

    // A single name that already exists is a plain error, as before.
    if (created.length === 0 && names.length === 1) {
      return NextResponse.json(
        { error: `"${names[0]}" already exists here.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ items: created, skipped }, { status: 201 });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to create folder");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
