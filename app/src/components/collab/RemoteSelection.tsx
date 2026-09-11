import { useMemo, type CSSProperties } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { getRoomProvider } from '../../store/templateStore';
import {
  resolveIdentity,
  useRemotePresence,
  type PresenceAwareness,
  type WritablePresenceAwareness,
} from '../../collab/presence';

export const MAX_REMOTE_SELECTION_COLORS = 3;

/**
 * First remote color becomes an outline (never touches the local selection
 * ring or the element's own css); extras layer as offset box-shadow rings.
 */
export function remoteSelectionStyle(colors: string[]): CSSProperties {
  if (colors.length === 0) return {};
  const [first, ...rest] = colors.slice(0, MAX_REMOTE_SELECTION_COLORS);
  const style: CSSProperties = {
    outline: `2px solid ${first}`,
    outlineOffset: '1px',
  };
  if (rest.length > 0) {
    style.boxShadow = rest
      .map((color, index) => `0 0 0 ${(index + 2) * 2}px ${color}`)
      .join(', ');
  }
  return style;
}

export function useRoomAwareness(): WritablePresenceAwareness | null {
  const roomActive = useEditorStore((state) => state.roomActive);
  return roomActive ? (getRoomProvider()?.awareness ?? null) : null;
}

export function useRemoteSelectionColors(
  elementId: string,
  awareness?: PresenceAwareness | null,
): string[] {
  const roomAwareness = useRoomAwareness();
  const source = awareness === undefined ? roomAwareness : awareness;
  const selfId = useMemo(() => resolveIdentity().id, []);
  const remote = useRemotePresence(source, selfId);
  return useMemo(() => {
    const colors: string[] = [];
    for (const entry of remote) {
      if (!entry.selectedIds.includes(elementId)) continue;
      if (!colors.includes(entry.user.color)) colors.push(entry.user.color);
      if (colors.length >= MAX_REMOTE_SELECTION_COLORS) break;
    }
    return colors;
  }, [remote, elementId]);
}

export function useRemoteSelectionStyle(elementId: string): CSSProperties {
  const colors = useRemoteSelectionColors(elementId);
  return useMemo(() => remoteSelectionStyle(colors), [colors]);
}
