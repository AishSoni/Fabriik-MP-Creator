import { useMemo, type CSSProperties } from 'react';
import {
  resolveIdentity,
  useRemotePresence,
  type PresenceAwareness,
  type PresenceCursor,
  type RemotePresence,
} from '../../collab/presence';
import { useRoomAwareness } from './RemoteSelection';

/**
 * Document-space percentages position the cursor inside the overlay, which is
 * sized to the active device frame — the same `%` lands at the right spot on
 * desktop, tablet, and mobile without ever broadcasting screen pixels.
 */
export function cursorPositionStyle(cursor: PresenceCursor): CSSProperties {
  return { left: `${cursor.xPct}%`, top: `${cursor.yPct}%` };
}

interface CursorsOverlayProps {
  /** Test/integration injection; defaults to the active room awareness. */
  awareness?: PresenceAwareness | null;
}

type CursorPresence = RemotePresence & { cursor: PresenceCursor };

export function CursorsOverlay({ awareness }: CursorsOverlayProps) {
  const roomAwareness = useRoomAwareness();
  const source = awareness === undefined ? roomAwareness : awareness;
  const selfId = useMemo(() => resolveIdentity().id, []);
  const remote = useRemotePresence(source, selfId);
  const cursors = useMemo(
    () => remote.filter((entry): entry is CursorPresence => entry.cursor !== null),
    [remote],
  );

  if (!source) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="cursors-overlay"
    >
      {cursors.map((entry) => (
        <div
          key={entry.clientId}
          className="absolute"
          style={cursorPositionStyle(entry.cursor)}
          data-testid={`remote-cursor-${entry.user.id}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={entry.user.color}
            className="drop-shadow-[0_1px_2px_rgba(14,14,16,0.35)]"
            data-testid={`remote-cursor-arrow-${entry.user.id}`}
          >
            <path d="M4.8 2.7a1 1 0 0 0-1.3 1.3l6.3 16.4a1 1 0 0 0 1.8.1l2.6-5.9 5.9-2.6a1 1 0 0 0-.1-1.8L4.8 2.7Z" />
          </svg>
          <span
            className="absolute left-3.5 top-4 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 text-white shadow-sm"
            style={{ backgroundColor: entry.user.color }}
            data-testid={`remote-cursor-name-${entry.user.id}`}
          >
            {entry.user.name}
          </span>
        </div>
      ))}
    </div>
  );
}
