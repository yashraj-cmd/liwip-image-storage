import { access, cp, mkdir, readdir, readFile, rename as fsRename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { joinRelative, mimeFromName, parentPath, resolveSafe } from "./paths";
import type { StorageAdapter, StorageItem } from "./types";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root: string) {}

  private async ensureRoot() {
    await mkdir(this.root, { recursive: true });
  }

  async list(relativePath: string): Promise<StorageItem[]> {
    await this.ensureRoot();
    const dir = resolveSafe(this.root, relativePath);
    const entries = await readdir(dir, { withFileTypes: true });

    const items = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith("."))
        .map(async (entry) => {
          const itemPath = path.join(dir, entry.name);
          const info = await stat(itemPath);
          const itemRelative = relativePath
            ? `${relativePath}/${entry.name}`
            : entry.name;

          const item: StorageItem = {
            name: entry.name,
            path: itemRelative.replace(/\\/g, "/"),
            type: entry.isDirectory() ? "folder" : "file",
            size: info.size,
            updatedAt: info.mtime.toISOString(),
            mimeType: entry.isDirectory() ? undefined : mimeFromName(entry.name),
          };
          return item;
        }),
    );

    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  async mkdir(relativePath: string): Promise<StorageItem> {
    await this.ensureRoot();
    const dir = resolveSafe(this.root, relativePath);
    await mkdir(dir, { recursive: true });
    const info = await stat(dir);
    const name = path.basename(dir);

    return {
      name,
      path: relativePath,
      type: "folder",
      size: 0,
      updatedAt: info.mtime.toISOString(),
    };
  }

  async writeFile(
    relativePath: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StorageItem> {
    await this.ensureRoot();
    const filePath = resolveSafe(this.root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    const info = await stat(filePath);

    return {
      name: path.basename(filePath),
      path: relativePath,
      type: "file",
      size: info.size,
      updatedAt: info.mtime.toISOString(),
      mimeType,
    };
  }

  async delete(relativePath: string): Promise<void> {
    await this.ensureRoot();
    const target = resolveSafe(this.root, relativePath);
    await rm(target, { recursive: true, force: true });
  }

  async exists(relativePath: string): Promise<boolean> {
    if (!relativePath) return true;
    try {
      await access(resolveSafe(this.root, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async transfer(
    relativePath: string,
    destinationParent: string,
    mode: "move" | "copy",
  ): Promise<StorageItem> {
    await this.ensureRoot();
    const from = resolveSafe(this.root, relativePath);
    const info = await stat(from);
    const name = path.basename(relativePath);
    const destination = joinRelative(destinationParent, name);
    const to = resolveSafe(this.root, destination);

    await mkdir(path.dirname(to), { recursive: true });
    if (mode === "copy") {
      await cp(from, to, { recursive: true });
    } else {
      await fsRename(from, to);
    }

    const next = await stat(to);
    return {
      name,
      path: destination,
      type: info.isDirectory() ? "folder" : "file",
      size: next.size,
      updatedAt: next.mtime.toISOString(),
      mimeType: info.isDirectory() ? undefined : mimeFromName(name),
    };
  }

  async listRecursive(relativePath: string): Promise<StorageItem[]> {
    await this.ensureRoot();
    const files: StorageItem[] = [];

    const walk = async (current: string) => {
      for (const item of await this.list(current)) {
        if (item.type === "folder") {
          await walk(item.path);
        } else {
          files.push(item);
        }
      }
    };

    await walk(relativePath);
    return files;
  }

  async rename(relativePath: string, newName: string): Promise<StorageItem> {
    await this.ensureRoot();
    const from = resolveSafe(this.root, relativePath);
    const info = await stat(from);
    const parent = parentPath(relativePath);
    const destination = parent ? `${parent}/${newName}` : newName;
    const to = resolveSafe(this.root, destination);
    await fsRename(from, to);
    const next = await stat(to);

    return {
      name: newName,
      path: destination,
      type: info.isDirectory() ? "folder" : "file",
      size: next.size,
      updatedAt: next.mtime.toISOString(),
      mimeType: info.isDirectory() ? undefined : mimeFromName(newName),
    };
  }

  async readFile(relativePath: string) {
    await this.ensureRoot();
    const filePath = resolveSafe(this.root, relativePath);
    const buffer = await readFile(filePath);
    return {
      buffer,
      mimeType: mimeFromName(filePath),
      name: path.basename(filePath),
    };
  }
}
