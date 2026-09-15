import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { normalizeRelativePath } from "@/lib/storage/paths";
import { readOrder, writeOrder } from "@/lib/storage/order";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const body = (await request.json()) as { path?: string; files?: string[] };
    const folder = normalizeRelativePath(body.path);
    if (!folder) {
      return NextResponse.json(
        { error: "Ordering applies inside a SKU folder." },
        { status: 400 },
      );
    }

    const requested = (body.files ?? []).filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );
    if (requested.length === 0) {
      return NextResponse.json({ error: "No order supplied" }, { status: 400 });
    }

    const storage = getStorage();
    const present = new Set(
      (await storage.list(folder))
        .filter((item) => item.type === "file")
        .map((item) => item.name),
    );

    // Only order files that are really there, and keep the list free of
    // duplicates so a position can never be ambiguous.
    const seen = new Set<string>();
    const files = requested.filter((name) => {
      if (!present.has(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });

    if (files.length === 0) {
      return NextResponse.json(
        { error: "None of those files are in this folder." },
        { status: 400 },
      );
    }

    // Anything present but unmentioned keeps its place at the end.
    for (const name of present) {
      if (!seen.has(name)) files.push(name);
    }

    await writeOrder(storage, folder, files);
    return NextResponse.json({ ok: true, files });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to save order");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const folder = normalizeRelativePath(request.nextUrl.searchParams.get("path"));
    if (!folder) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    return NextResponse.json({ files: await readOrder(getStorage(), folder) });
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to read order");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
