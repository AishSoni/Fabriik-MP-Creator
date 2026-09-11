import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import {
  resolveIdentity,
  useRemotePresence,
  type PresenceAwareness,
  type PresenceUser,
} from '../../collab/presence';

export const MAX_VISIBLE_AVATARS = 4;

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.replace(/[^0-9a-z]/gi, '').charAt(0))
    .filter(Boolean)
    .join('');
  return initials.toUpperCase() || '?';
}

export interface AvatarStackProps {
  awareness: PresenceAwareness | null;
  self?: PresenceUser;
}

export function AvatarStack({ awareness, self }: AvatarStackProps) {
  const identity = self ?? resolveIdentity();
  const remote = useRemotePresence(awareness, identity.id);
  const entries = useMemo(
    () => [
      { key: `self-${identity.id}`, user: identity },
      ...remote.map((entry) => ({ key: `remote-${entry.clientId}`, user: entry.user })),
    ],
    [identity, remote],
  );
  if (!awareness) return null;

  const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = entries.length - visible.length;

  return (
    <div
      data-testid="avatar-stack"
      aria-label={`${entries.length} people in this room`}
      className="hidden items-center sm:flex"
    >
      {visible.map(({ key, user }, index) => (
        <span
          key={key}
          data-testid={`presence-avatar-${user.id}`}
          title={user.name}
          aria-label={user.name}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/70 text-[10px] font-bold text-white shadow-sm',
            index > 0 && '-ml-1.5',
          )}
          style={{ backgroundColor: user.color }}
        >
          {initialsFor(user.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          data-testid="avatar-overflow"
          title={`${overflow} more`}
          className="-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white/70 bg-white/15 px-1 text-[10px] font-bold text-white"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
