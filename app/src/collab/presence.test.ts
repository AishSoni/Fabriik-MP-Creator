import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  CURSOR_MIN_DELTA_PCT,
  CURSOR_THROTTLE_MS,
  MAX_PRESENCE_NAME_LENGTH,
  MAX_REMOTE_SELECTED_IDS,
  PRESENCE_COLORS,
  bindPresence,
  collectRemotePresence,
  colorForId,
  createCursorBroadcaster,
  presenceNoticeMessage,
  resolveIdentity,
  sanitizeCursor,
  sanitizePresenceUser,
  sanitizeSelectedIds,
  useRemotePresence,
  type PresenceAwareness,
  type PresenceNotice,
} from './presence';

const GUEST_ID_KEY = 'fabriik-guest-id';
const GUEST_NAME_KEY = 'fabriik-guest-name';

const fakeAwareness = (
  clientID: number,
  states: Map<number, unknown>,
): PresenceAwareness => ({
  clientID,
  getStates: () => states,
  on: () => {},
  off: () => {},
});

const fakeWritableAwareness = () => {
  const order: string[] = [];
  let state: Record<string, unknown> | null = null;
  return {
    order,
    readState: () => state,
    awareness: {
      clientID: 1,
      getStates: () => new Map<number, unknown>(),
      on: () => {},
      off: () => {},
      setLocalState: (next: Record<string, unknown> | null) => {
        order.push('setLocalState');
        state = next;
      },
      setLocalStateField: (field: string, value: unknown) => {
        order.push(`field:${field}`);
        if (state) state = { ...state, [field]: value };
      },
    },
  };
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('resolveIdentity', () => {
  it('is stable across calls and derives color from the id', () => {
    const first = resolveIdentity();
    const second = resolveIdentity();
    expect(second).toEqual(first);
    expect(first.color).toBe(colorForId(first.id));
    expect(PRESENCE_COLORS).toContain(first.color);
  });

  it('reuses the identity name storage key and a session-stable id key', () => {
    sessionStorage.setItem(GUEST_NAME_KEY, 'Ada');
    const identity = resolveIdentity();
    expect(identity.name).toBe('Ada');
    expect(sessionStorage.getItem(GUEST_ID_KEY)).toBe(identity.id);
    expect(sessionStorage.getItem(GUEST_ID_KEY)).toBe(identity.id);
  });

  it('returns a deterministic palette color for a given id', () => {
    expect(colorForId('stable-id')).toBe(colorForId('stable-id'));
    expect(PRESENCE_COLORS).toContain(colorForId('stable-id'));
    expect(colorForId('')).toBe(PRESENCE_COLORS[0]);
  });
});

describe('sanitizePresenceUser', () => {
  it('rejects non-objects and states without a usable name', () => {
    expect(sanitizePresenceUser(null)).toBeNull();
    expect(sanitizePresenceUser('Ann')).toBeNull();
    expect(sanitizePresenceUser({})).toBeNull();
    expect(sanitizePresenceUser({ id: 'u1' })).toBeNull();
    expect(sanitizePresenceUser({ name: '   ' })).toBeNull();
  });

  it(`strips control characters and clamps names to ${MAX_PRESENCE_NAME_LENGTH} chars`, () => {
    const user = sanitizePresenceUser({ name: 'Bad\u0000\u001bName\u0007', id: 'u1' });
    expect(user?.name).toBe('BadName');

    const long = sanitizePresenceUser({ name: 'x'.repeat(60), id: 'u1' });
    expect(long?.name).toBe('x'.repeat(MAX_PRESENCE_NAME_LENGTH));
  });

  it('accepts only 6-digit hex colors and falls back deterministically', () => {
    const styled = sanitizePresenceUser({ name: 'Ann', id: 'u1', color: '#AABBCC' });
    expect(styled?.color).toBe('#aabbcc');

    const broken = sanitizePresenceUser({ name: 'Ann', id: 'u1', color: 'red' });
    expect(broken?.color).toBe(colorForId('u1'));
    const shortHex = sanitizePresenceUser({ name: 'Ann', id: 'u1', color: '#fff' });
    expect(shortHex?.color).toBe(colorForId('u1'));
  });

  it('clamps ids and falls back when missing', () => {
    const user = sanitizePresenceUser({ name: 'Ann', id: 'i'.repeat(100) });
    expect(user?.id).toHaveLength(64);
    const missing = sanitizePresenceUser({ name: 'Ann' });
    expect(missing?.id).toBe('unknown');
  });
});

describe('sanitizeCursor', () => {
  it('clamps to 0-100 and rounds to two decimals', () => {
    expect(sanitizeCursor({ xPct: -5, yPct: 150 })).toEqual({ xPct: 0, yPct: 100 });
    expect(sanitizeCursor({ xPct: 12.34567, yPct: 99.999 })).toEqual({
      xPct: 12.35,
      yPct: 100,
    });
  });

  it('rejects malformed cursors', () => {
    expect(sanitizeCursor(null)).toBeNull();
    expect(sanitizeCursor({ xPct: '10', yPct: 10 })).toBeNull();
    expect(sanitizeCursor({ xPct: NaN, yPct: 10 })).toBeNull();
    expect(sanitizeCursor({ xPct: Infinity, yPct: 10 })).toBeNull();
    expect(sanitizeCursor({ xPct: 10 })).toBeNull();
  });
});

describe('sanitizeSelectedIds', () => {
  it('keeps only unique strings and caps the list', () => {
    expect(sanitizeSelectedIds(['a', 'a', 'b', 1, null, 'c'])).toEqual(['a', 'b', 'c']);
    expect(sanitizeSelectedIds('a')).toEqual([]);
    const many = Array.from({ length: MAX_REMOTE_SELECTED_IDS + 50 }, (_, i) => `e${i}`);
    expect(sanitizeSelectedIds(many)).toHaveLength(MAX_REMOTE_SELECTED_IDS);
  });
});

describe('collectRemotePresence', () => {
  it('excludes the local client and returns sanitized remote entries sorted by client', () => {
    const states = new Map<number, unknown>([
      [
        1,
        {
          user: { id: 'self', name: 'Me', color: '#7868e6' },
          cursor: { xPct: 1, yPct: 2 },
          selectedIds: ['a'],
        },
      ],
      [
        7,
        {
          user: { id: 'zed', name: 'Zed', color: '#0ea5e9' },
          cursor: { xPct: 50, yPct: 60 },
          selectedIds: ['x', 'y'],
        },
      ],
      [3, { user: { id: 'amy', name: 'Amy', color: 'garbage' } }],
      [5, { cursor: { xPct: 10, yPct: 10 } }],
    ]);
    const remote = collectRemotePresence(fakeAwareness(1, states), 'self');
    expect(remote.map((entry) => entry.clientId)).toEqual([3, 7]);
    expect(remote[0]).toEqual({
      clientId: 3,
      user: { id: 'amy', name: 'Amy', color: colorForId('amy') },
      cursor: null,
      selectedIds: [],
    });
    expect(remote[1].cursor).toEqual({ xPct: 50, yPct: 60 });
    expect(remote[1].selectedIds).toEqual(['x', 'y']);
  });

  it('also drops remote states reusing the local identity id', () => {
    const states = new Map<number, unknown>([
      [9, { user: { id: 'self', name: 'Impostor' } }],
    ]);
    expect(collectRemotePresence(fakeAwareness(1, states), 'self')).toEqual([]);
  });
});

describe('useRemotePresence', () => {
  it('tracks remote awareness changes and filters the local client', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalState({
      user: { id: 'self', name: 'Me', color: '#7868e6' },
    });
    const { result, unmount } = renderHook(() => useRemotePresence(awareness, 'self'));
    expect(result.current).toEqual([]);

    const remoteDoc = new Y.Doc();
    const remote = new Awareness(remoteDoc);
    act(() => {
      const remoteState = {
        user: { id: 'zed', name: 'Zed', color: '#0ea5e9' },
        cursor: { xPct: 40, yPct: 20 },
      };
      awareness.getStates().set(remote.clientID, remoteState);
      awareness.emit('change', [{ added: [remote.clientID], updated: [], removed: [] }, 'test']);
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].user.name).toBe('Zed');
    expect(result.current[0].cursor).toEqual({ xPct: 40, yPct: 20 });

    act(() => {
      awareness.getStates().delete(remote.clientID);
      awareness.emit('change', [{ added: [], updated: [], removed: [remote.clientID] }, 'test']);
    });
    expect(result.current).toEqual([]);

    remote.destroy();
    unmount();
    awareness.destroy();
  });
});

describe('createCursorBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the first position immediately and clamps values', () => {
    const emit = vi.fn();
    const broadcaster = createCursorBroadcaster(emit);
    broadcaster.send({ xPct: -3, yPct: 120 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ xPct: 0, yPct: 100 });
  });

  it(`keeps emissions at or below one per ${CURSOR_THROTTLE_MS}ms window`, () => {
    const emit = vi.fn();
    const broadcaster = createCursorBroadcaster(emit);
    for (let i = 0; i < 100; i += 1) {
      broadcaster.send({ xPct: i, yPct: i % 50 });
      vi.advanceTimersByTime(10);
    }
    broadcaster.flush();
    const maxEmits = Math.ceil(1000 / CURSOR_THROTTLE_MS) + 1;
    expect(emit.mock.calls.length).toBeGreaterThan(0);
    expect(emit.mock.calls.length).toBeLessThanOrEqual(maxEmits);
    expect(emit.mock.calls[0][0]).toEqual({ xPct: 0, yPct: 0 });
    expect(emit.mock.calls.at(-1)?.[0]).toEqual({ xPct: 99, yPct: 49 });
  });

  it(`skips moves below the ${CURSOR_MIN_DELTA_PCT}% threshold`, () => {
    const emit = vi.fn();
    const broadcaster = createCursorBroadcaster(emit);
    broadcaster.send({ xPct: 10, yPct: 10 });
    broadcaster.flush();
    expect(emit).toHaveBeenCalledTimes(1);

    broadcaster.send({ xPct: 10.1, yPct: 10.05 });
    broadcaster.flush();
    expect(emit).toHaveBeenCalledTimes(1);

    broadcaster.send({ xPct: 10.5, yPct: 10 });
    broadcaster.flush();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1][0]).toEqual({ xPct: 10.5, yPct: 10 });
  });

  it('drops pending moves on cancel and ignores invalid cursors', () => {
    const emit = vi.fn();
    const broadcaster = createCursorBroadcaster(emit);
    broadcaster.send({ xPct: 1, yPct: 1 });
    expect(emit).toHaveBeenCalledTimes(1);

    broadcaster.send({ xPct: 50, yPct: 50 });
    broadcaster.cancel();
    vi.advanceTimersByTime(100);
    broadcaster.flush();
    expect(emit).toHaveBeenCalledTimes(1);

    broadcaster.send({ xPct: NaN, yPct: 0 });
    broadcaster.flush();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe('bindPresence', () => {
  const identity = { id: 'self', name: 'Me', color: '#7868e6' };

  it('seeds the full local state before mirroring selection changes', () => {
    const { awareness, readState } = fakeWritableAwareness();
    let selected = ['a', 'a', 'b'];
    const selectionListeners: (() => void)[] = [];
    const unbind = bindPresence({
      awareness,
      identity,
      getSelectedIds: () => selected,
      subscribeSelectedIds: (listener) => {
        selectionListeners.push(listener);
        return () => {
          selectionListeners.length = 0;
        };
      },
    });
    expect(readState()).toEqual({
      user: identity,
      cursor: null,
      selectedIds: ['a', 'b'],
    });

    selected = ['c'];
    selectionListeners.at(-1)?.();
    expect((readState() as { selectedIds: string[] }).selectedIds).toEqual(['c']);

    unbind();
    expect(selectionListeners).toHaveLength(0);
    expect(readState()).toBeNull();
  });

  it('forwards room notices and unsubscribes before clearing state', () => {
    const { awareness, order, readState } = fakeWritableAwareness();
    const notices: PresenceNotice[] = [];
    const noticeListeners: ((notice: PresenceNotice) => void)[] = [];
    let selectionUnsubscribed = false;
    const unbind = bindPresence({
      awareness,
      identity,
      getSelectedIds: () => [],
      subscribeSelectedIds: () => () => {
        selectionUnsubscribed = true;
      },
      subscribeNotices: (listener) => {
        noticeListeners.push(listener);
        return () => {
          noticeListeners.length = 0;
        };
      },
      onNotice: (notice) => notices.push(notice),
    });

    noticeListeners.at(-1)?.({ event: 'room-replaced', reason: 'import', by: 'Ada' });
    expect(notices).toEqual([{ event: 'room-replaced', reason: 'import', by: 'Ada' }]);

    unbind();
    expect(selectionUnsubscribed).toBe(true);
    expect(noticeListeners).toHaveLength(0);
    expect(order.at(-1)).toBe('setLocalState');
    expect(readState()).toBeNull();
  });
});

describe('presenceNoticeMessage', () => {
  it('maps room-replaced notices to a toast and sanitizes the actor name', () => {
    expect(
      presenceNoticeMessage({ event: 'room-replaced', reason: 'import', by: 'Ada' }),
    ).toBe('Document replaced by Ada');
    expect(presenceNoticeMessage({ event: 'room-replaced' })).toBe(
      'Document replaced by Someone',
    );
    expect(presenceNoticeMessage({ event: 'other', by: 'Ada' })).toBeNull();
    expect(
      presenceNoticeMessage({ event: 'room-replaced', by: 'X'.repeat(50) }),
    ).toBe(`Document replaced by ${'X'.repeat(MAX_PRESENCE_NAME_LENGTH)}`);
  });
});
