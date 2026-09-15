import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "node:path";
import { joinRelative, mimeFromName, normalizeRelativePath, parentPath } from "./paths";
import { isHiddenPath } from "./derivatives";
import type { FilePayload, StorageAdapter, StorageItem } from "./types";

/**
 * Folders do not exist in S3, so a folder is a zero-byte object whose key ends
 * in "/". Listing with Delimiter="/" then gives CommonPrefixes as folders and
 * Contents as files, which maps one-to-one onto the local driver's behaviour.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly signedUrlTtl: number;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error(
        "S3_BUCKET is not set. Configure S3 or use STORAGE_DRIVER=local.",
      );
    }

    this.bucket = bucket;
    this.prefix = normalizePrefix(process.env.S3_PREFIX ?? "");
    this.signedUrlTtl = Number(process.env.S3_SIGNED_URL_TTL ?? 300);

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.client = new S3Client({
      region: process.env.AWS_REGION ?? "ap-south-1",
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      // Fall through to the default provider chain (IAM role, shared config)
      // when explicit keys are absent.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  private key(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    return this.prefix ? `${this.prefix}${normalized}` : normalized;
  }

  /**
   * Listing prefix for a folder. The root is just the configured prefix: this.prefix
   * already ends in "/", so appending another one would match nothing.
   */
  private listPrefix(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    return normalized ? `${this.prefix}${normalized}/` : this.prefix;
  }

  private toRelative(key: string): string {
    return this.prefix && key.startsWith(this.prefix)
      ? key.slice(this.prefix.length)
      : key;
  }

  async list(relativePath: string): Promise<StorageItem[]> {
    const prefix = this.listPrefix(relativePath);

    const folders: StorageItem[] = [];
    const files: StorageItem[] = [];
    let token: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: "/",
          ContinuationToken: token,
        }),
      );

      for (const common of page.CommonPrefixes ?? []) {
        if (!common.Prefix) continue;
        const relative = this.toRelative(common.Prefix).replace(/\/$/, "");
        const name = relative.split("/").pop() ?? "";
        if (!name || name.startsWith(".")) continue;
        folders.push({
          name,
          path: relative,
          type: "folder",
          size: 0,
          updatedAt: new Date(0).toISOString(),
        });
      }

      for (const object of page.Contents ?? []) {
        if (!object.Key || object.Key.endsWith("/")) continue;
        const relative = this.toRelative(object.Key);
        const name = relative.split("/").pop() ?? "";
        if (!name || name.startsWith(".")) continue;
        files.push({
          name,
          path: relative,
          type: "file",
          size: object.Size ?? 0,
          updatedAt: (object.LastModified ?? new Date(0)).toISOString(),
          mimeType: mimeFromName(name),
        });
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return [...folders, ...files].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  async mkdir(relativePath: string): Promise<StorageItem> {
    const key = `${this.key(relativePath)}/`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: "" }),
    );

    return {
      name: relativePath.split("/").pop() ?? relativePath,
      path: normalizeRelativePath(relativePath),
      type: "folder",
      size: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  async writeFile(
    relativePath: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StorageItem> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return {
      name: path.basename(relativePath),
      path: normalizeRelativePath(relativePath),
      type: "file",
      size: buffer.byteLength,
      updatedAt: new Date().toISOString(),
      mimeType,
    };
  }

  async delete(relativePath: string): Promise<void> {
    const key = this.key(relativePath);
    const children = await this.listAllKeys(`${key}/`);
    const keys = [
      key,
      `${key}/`,
      ...children.map((object) => object.Key).filter((value): value is string => Boolean(value)),
    ];

    for (let index = 0; index < keys.length; index += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.slice(index, index + 1000).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
  }

  async rename(relativePath: string, newName: string): Promise<StorageItem> {
    const from = this.key(relativePath);
    const parent = parentPath(relativePath);
    const destination = parent ? `${parent}/${newName}` : newName;
    const to = this.key(destination);
    const isFolder = await this.isFolder(relativePath);

    if (isFolder) {
      for (const child of await this.listAllKeys(`${from}/`)) {
        if (!child.Key) continue;
        await this.copy(child.Key, `${to}/${child.Key.slice(from.length + 1)}`);
      }
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: `${to}/`, Body: "" }),
      );
    } else {
      await this.copy(from, to);
    }

    await this.delete(relativePath);

    return {
      name: newName,
      path: destination,
      type: isFolder ? "folder" : "file",
      size: 0,
      updatedAt: new Date().toISOString(),
      mimeType: isFolder ? undefined : mimeFromName(newName),
    };
  }

  async transfer(
    relativePath: string,
    destinationParent: string,
    mode: "move" | "copy",
  ): Promise<StorageItem> {
    const from = this.key(relativePath);
    const name = relativePath.split("/").pop() ?? relativePath;
    const destination = joinRelative(destinationParent, name);
    const to = this.key(destination);
    const isFolder = await this.isFolder(relativePath);

    if (isFolder) {
      for (const child of await this.listAllKeys(`${from}/`)) {
        if (!child.Key) continue;
        await this.copy(child.Key, `${to}/${child.Key.slice(from.length + 1)}`);
      }
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: `${to}/`, Body: "" }),
      );
    } else {
      await this.copy(from, to);
    }

    if (mode === "move") await this.delete(relativePath);

    return {
      name,
      path: destination,
      type: isFolder ? "folder" : "file",
      size: 0,
      updatedAt: new Date().toISOString(),
      mimeType: isFolder ? undefined : mimeFromName(name),
    };
  }

  async listRecursive(relativePath: string): Promise<StorageItem[]> {
    const objects = await this.listAllKeys(this.listPrefix(relativePath));

    return objects
      .filter((object) => object.Key && !object.Key.endsWith("/"))
      .map((object) => {
        const relative = this.toRelative(object.Key!);
        const name = relative.split("/").pop() ?? "";
        return {
          name,
          path: relative,
          type: "file" as const,
          size: object.Size ?? 0,
          updatedAt: (object.LastModified ?? new Date(0)).toISOString(),
          mimeType: mimeFromName(name),
        };
      })
      // A hidden segment anywhere in the key (.thumb/...) must not surface.
      .filter((item) => !isHiddenPath(item.path));
  }

  async readFile(relativePath: string): Promise<FilePayload> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) }),
    );

    const name = path.basename(relativePath);
    const body = result.Body;
    if (!body) throw new Error("File is empty");

    return {
      buffer: Buffer.from(await body.transformToByteArray()),
      mimeType: result.ContentType ?? mimeFromName(name),
      name,
    };
  }

  async exists(relativePath: string): Promise<boolean> {
    if (!relativePath) return true;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) }),
      );
      return true;
    } catch {
      return this.isFolder(relativePath);
    }
  }

  async signedUrl(relativePath: string, downloadName?: string): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        ...(downloadName
          ? {
              ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadName)}"`,
            }
          : {}),
      }),
      { expiresIn: this.signedUrlTtl },
    );
  }

  private async isFolder(relativePath: string): Promise<boolean> {
    const page = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${this.key(relativePath)}/`,
        MaxKeys: 1,
      }),
    );
    return (page.KeyCount ?? 0) > 0;
  }

  private async copy(from: string, to: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: encodeURI(`${this.bucket}/${from}`),
        Key: to,
      }),
    );
  }

  private async listAllKeys(prefix: string): Promise<_Object[]> {
    const objects: _Object[] = [];
    let token: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      objects.push(...(page.Contents ?? []));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return objects;
  }
}

function normalizePrefix(value: string): string {
  const trimmed = value.replace(/^\/+|\/+$/g, "").trim();
  return trimmed ? `${trimmed}/` : "";
}
