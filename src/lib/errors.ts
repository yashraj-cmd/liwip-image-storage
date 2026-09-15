/**
 * Node and the AWS SDK put absolute paths, bucket names and key prefixes into
 * error messages. Those are useful in the server log and nowhere near the
 * client, so only messages this app raised on purpose are passed through.
 */
const SAFE_MESSAGES = new Set([
  "Invalid path",
  "Path escapes storage root",
  "File is empty",
]);

export function publicMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (SAFE_MESSAGES.has(error.message)) return error.message;
  if (error.message.startsWith("Too many files named ")) return error.message;
  return fallback;
}
