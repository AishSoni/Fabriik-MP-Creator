import { useEffect, useMemo, useRef } from 'react';
import { resolveIdentity, useRemotePresence } from '../collab/presence';
import { useRoomAwareness } from '../components/collab/RemoteSelection';
import { trackEvent } from './track';

/**
 * Reports approximate multiplayer session size to Umami.
 * Fires `room_heartbeat` (players = remote peers + self) whenever the
 * player count changes — enough to derive "avg players per session".
 * Rough by design: client-side, lossy, fine for hobby stats.
 */
export function useRoomAnalytics(): void {
  const awareness = useRoomAwareness();
  const selfId = useMemo(() => resolveIdentity().id, []);
  const remote = useRemotePresence(awareness, selfId);
  const players = awareness ? remote.length + 1 : 0;
  const lastReported = useRef(0);

  useEffect(() => {
    if (players === 0) {
      lastReported.current = 0;
      return;
    }
    if (players === lastReported.current) return;
    lastReported.current = players;
    trackEvent('room_heartbeat', { players });
  }, [players]);
}
