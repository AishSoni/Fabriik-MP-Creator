export const FRAME_SIZE_LIMIT_BYTES = 256 * 1024;

export function exceedsFrameSizeLimit(
  bytes: Uint8Array,
  limit: number = FRAME_SIZE_LIMIT_BYTES,
): boolean {
  return bytes.length > limit;
}
