# Liwip SKU Images

Standalone SKU image library for Liwip. Master folder → SKU-named subfolders → images.
Local filesystem for development, S3 for production. Not coupled to any other Liwip app.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Deploys to Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

1. **SKU Library** is the master folder (`data/sku-master` by default).
2. **New → New SKU folder** creates a folder named after the SKU.
3. Select that folder or double-click to open it, then **Add** (or drag and drop) to upload images.
4. Files are written under `<root>/<SKU>/<image>`.

Uploading an image whose name is already taken saves it as `name (1).ext` rather than
overwriting. Creating a folder or renaming onto an existing name is rejected with a 409.

### Bulk work

- **New SKU folder** accepts a pasted list (newlines, commas, tabs or semicolons) and
  creates every SKU in one call, reporting how many already existed.
- **New -> Folder upload**, or dropping folders onto the grid, recreates the folder tree as
  SKU folders and files. Non-image files in the tree are skipped rather than failing the batch.
- **Download ZIP** on any folder streams its whole tree as a zip, nested paths preserved.
- **Move to** relocates selected images or folders into another SKU folder.

## Sorting

The **Sort** menu in the toolbar sets three things, and the choice is remembered in the
browser across visits:

- **Sort by** - Name, Date modified, or File size.
- **Sort direction** - worded for whatever is being sorted: A to Z / Z to A for names,
  Newest / Oldest first for dates, Smallest / Largest first for sizes.
- **Folders** - *On top* (the default) keeps folders above files; *Mixed with files* sorts
  them together, and the grid then renders folders as tiles so every cell in a row is the
  same height.

List view column headers stay in sync with the menu: clicking one selects that key, and
clicking it again flips the direction.

Drive also offers "Date modified by me" and "Date opened by me". Those need per-user
activity tracking, which this app does not record, so they are deliberately absent rather
than faked from the file timestamp.

## Signing in

Access is by six digit code emailed to the address you type in. There is no password
and no account to create.

1. Enter your work email.
2. A code arrives by email and is valid for 10 minutes.
3. Enter it and you are in. Sessions are JWT cookies, so no database is needed.

The challenge itself is a signed, http-only cookie holding only a **hash** of the code,
so nothing readable is stored server side and no table is required. Five wrong attempts
invalidate it, and asking for a new code is rate limited to one per 30 seconds.

### Who can sign in

```
AUTH_ALLOWED_EMAILS=someone@example.com,other@example.com
AUTH_ALLOWED_DOMAINS=keystonecommerce.in
```

Set at least one. **With neither set, nobody can sign in** - a misdeployed instance locks
itself rather than opening to anyone who can receive an email. Addresses that are not on
the list get the same response as ones that are, but no code is ever sent, so the endpoint
cannot be used to discover who has access.

### Sending the codes (Gmail API)

```
AUTH_SECRET=                 # npx auth secret
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
GMAIL_OAUTH_REFRESH_TOKEN=
GMAIL_SENDER_EMAIL=tech@example.com
GMAIL_SENDER_NAME=Liwip SKU Images
```

Codes are sent with the **Gmail API**, not SMTP. The refresh token only needs
`https://www.googleapis.com/auth/gmail.send`, which permits sending and nothing else.
SMTP would have required `https://mail.google.com/`, a full read/write/delete grant over
the mailbox - far more access than sending a code needs.

The access token is refreshed automatically and cached until a minute before it expires,
so only the long-lived refresh token lives in the environment.

A plain SMTP app password still works as a fallback: set `SMTP_HOST`, `SMTP_USER` and
`SMTP_PASSWORD` and leave the OAuth values empty.

Without SMTP configured, development prints the code to the server console instead of
sending it. Production refuses to start the flow rather than falling back.

Two limits worth knowing: Gmail caps outbound mail at roughly 500 messages a day, and the
resend rate limit is per server process, so a multi-instance deployment would need a shared
store (Redis or similar) to enforce it globally.

## Storage drivers

`src/lib/storage` picks a driver from `STORAGE_DRIVER`. Both implement the same
`StorageAdapter` interface, so the API routes and UI are identical either way.

### `local` (default)

```
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=data/sku-master   # relative to the project root, or absolute
```

Local files do not persist on Vercel's serverless filesystem — development only.

### `s3`

```
STORAGE_DRIVER=s3
S3_BUCKET=liwip-sku-images
AWS_REGION=ap-south-1
S3_PREFIX=                 # optional key prefix inside the bucket
S3_SIGNED_URL_TTL=300      # seconds a presigned image URL stays valid
AWS_ACCESS_KEY_ID=         # omit both to use the default AWS provider chain
AWS_SECRET_ACCESS_KEY=
S3_ENDPOINT=               # optional, for S3-compatible storage (MinIO, R2)
```

S3 has no real directories, so a folder is a zero-byte object whose key ends in `/`.
Listing uses `Delimiter="/"`, which maps `CommonPrefixes` to folders and `Contents` to
files. Renaming a folder copies every object under the prefix and deletes the originals.

Full-size image requests are answered with a **307 redirect to a presigned GET**, so image
bytes never pass through the Next.js process.

The IAM identity needs `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and
`s3:ListBucket` on the bucket.

## Thumbnails

`/api/files/content?path=…&w=480` returns a WebP at that width. Only `96 / 240 / 480 / 960`
are accepted; SVGs pass through untouched.

The first request for a size generates it with sharp and **stores it beside the original**:

```
SKU-0014/front.jpg                     the original
SKU-0014/.thumb/480/front.jpg.webp     generated once, reused after
```

Every later request serves the stored copy - on S3 as a presigned redirect, so the bytes
never pass through the server and the multi-megabyte original is never re-downloaded.
Measured locally on a 7.9 MB source: 7.9 MB read and ~200 ms on the first request, then
16 KB and ~35 ms after.

Derivatives live inside the SKU folder so the recursive delete, rename and move the drivers
already perform carry them along and cannot orphan them. Single-file rename, move and
delete clear the stale sizes explicitly. Both drivers hide dot-prefixed segments, so
`.thumb` never appears in listings or in a downloaded zip.

## Performance

Both views are windowed with `@tanstack/react-virtual`, so only visible rows are in the
DOM. Grid columns are computed from the measured container width to match the Tailwind
track definitions in `FileGrid`.

Mutations update local state directly and roll back on failure, so nothing waits on a
full re-list.

## Not yet built

No authentication — anyone who can reach the URL can delete the library. Put it behind
access control before exposing it publicly. Deletes are permanent: there is no trash or
undo. Copy (as opposed to move) is implemented in the storage layer but not surfaced
in the UI.
