import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { publicMessage } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import {
  availableName,
  isAllowedImage,
  joinRelative,
  mimeFromName,
  normalizeRelativePath,
} from "@/lib/storage/paths";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;

    const form = await request.formData();
    const parent = normalizeRelativePath(String(form.get("path") ?? ""));

    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    // A folder upload sends one relative path per file ("SKU-001/front.png"),
    // so the SKU folders are recreated underneath the current folder.
    const relativePaths = form
      .getAll("relativePaths")
      .map((value) => String(value));
    const carriesFolders = relativePaths.some((value) => value.includes("/"));

    // Loose images need a SKU folder; a folder upload brings its own.
    if (!parent && !carriesFolders) {
      return NextResponse.json(
        { error: "Select a SKU folder before adding images." },
        { status: 400 },
      );
    }

    const storage = getStorage();
    const items = [];
    const renamed: { from: string; to: string }[] = [];
    const skipped: string[] = [];
    const folders = new Set<string>();

    for (const [index, file] of files.entries()) {
      const mimeType = file.type || mimeFromName(file.name);
      if (!isAllowedImage(mimeType, file.name)) {
        // A dropped folder routinely carries stray files; skip rather than
        // failing the whole batch.
        if (carriesFolders) {
          skipped.push(file.name);
          continue;
        }
        return NextResponse.json(
          { error: `${file.name} is not a supported image.` },
          { status: 400 },
        );
      }

      const relative = relativePaths[index] ?? file.name;
      const segments = relative.split("/").filter((part) => part && part !== "." && part !== "..");
      const fileName = segments.pop() ?? file.name;
      const targetFolder = joinRelative(parent, segments.join("/"));
      if (segments.length > 0) folders.add(targetFolder);

      // Never silently replace an existing image: "photo.png" becomes
      // "photo (1).png" when the name is already taken.
      const name = await availableName(fileName, (candidate) =>
        storage.exists(joinRelative(targetFolder, candidate)),
      );
      if (name !== fileName) renamed.push({ from: fileName, to: name });

      const buffer = Buffer.from(await file.arrayBuffer());
      items.push(await storage.writeFile(joinRelative(targetFolder, name), buffer, mimeType));
    }

    return NextResponse.json(
      { items, renamed, skipped, folders: folders.size },
      { status: 201 },
    );
  } catch (error) {
    console.error("Request failed", error);
    const message = publicMessage(error, "Failed to upload");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
