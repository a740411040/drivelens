export function parseRequiredSnapshotId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const snapshotId = value.trim();
  return snapshotId ? snapshotId.slice(0, 160) : null;
}
