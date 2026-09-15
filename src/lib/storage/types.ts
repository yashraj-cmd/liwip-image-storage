export type StorageItemType = "folder" | "file";

export type StorageItem = {
  name: string;
  path: string;
  type: StorageItemType;
  size: number;
  updatedAt: string;
  mimeType?: string;
  /** Manual storefront position, when the folder has an order manifest. */
  position?: number;
};

export type FilePayload = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

export interface StorageAdapter {
  list(relativePath: string): Promise<StorageItem[]>;
  mkdir(relativePath: string): Promise<StorageItem>;
  writeFile(
    relativePath: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StorageItem>;
  delete(relativePath: string): Promise<void>;
  rename(relativePath: string, newName: string): Promise<StorageItem>;
  readFile(relativePath: string): Promise<FilePayload>;
  /** True when a file or folder already lives at this path. */
  exists(relativePath: string): Promise<boolean>;
  /** Move or copy an item into another folder, keeping its name. */
  transfer(
    relativePath: string,
    destinationParent: string,
    mode: "move" | "copy",
  ): Promise<StorageItem>;
  /** Every file at or below this path, for archiving. */
  listRecursive(relativePath: string): Promise<StorageItem[]>;
  /**
   * Optional direct-download URL. Drivers that can hand the browser a URL
   * (S3 presigned GET) return one so bytes skip the Node process entirely.
   * Drivers that cannot return null and the content route streams instead.
   */
  signedUrl?(relativePath: string, downloadName?: string): Promise<string | null>;
}
