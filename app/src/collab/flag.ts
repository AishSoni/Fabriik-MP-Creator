/**
 * Migration flag for the Yjs pipeline (P2). When OFF the store runs the
 * legacy immer pipeline; when ON dispatch/undo/restore route through the
 * app Y.Doc via the command adapter and the projection pushes state back.
 * Defaults to OFF until the migration completes.
 */
let enabled = false;

export function isYdocPipeline(): boolean {
  return enabled;
}

export function setYdocPipeline(value: boolean): void {
  enabled = value;
}
