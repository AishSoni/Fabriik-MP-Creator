import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { CursorsOverlay } from './CursorsOverlay';
import type { PresenceAwareness } from '../../collab/presence';

const makeAwareness = (): Awareness => new Awareness(new Y.Doc());

const addRemote = (
  awareness: Awareness,
  clientId: number,
  state: Record<string, unknown>,
): void => {
  awareness.getStates().set(clientId, state);
  awareness.emit('change', [{ added: [clientId], updated: [], removed: [] }, 'test']);
};

const user = (id: string, color: string, name = id) => ({ id, name, color });

function Frame({
  awareness,
  width,
}: {
  awareness: PresenceAwareness;
  width: number;
}) {
  return (
    <div style={{ width }}>
      <CursorsOverlay awareness={awareness} />
    </div>
  );
}

describe('CursorsOverlay', () => {
  it('renders nothing without an awareness source', () => {
    const { queryByTestId } = render(<CursorsOverlay awareness={null} />);
    expect(queryByTestId('cursors-overlay')).toBeNull();
  });

  it('renders an arrow and name pill per remote cursor in document percentages', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, {
      user: user('u1', '#0ea5e9'),
      cursor: { xPct: 25, yPct: 50 },
    });
    addRemote(awareness, 2, {
      user: user('u2', '#f59e0b'),
      cursor: { xPct: 75, yPct: 10 },
    });

    const { getByTestId } = render(<CursorsOverlay awareness={awareness} />);
    const first = getByTestId('remote-cursor-u1').style;
    expect(first.left).toBe('25%');
    expect(first.top).toBe('50%');
    const second = getByTestId('remote-cursor-u2').style;
    expect(second.left).toBe('75%');
    expect(second.top).toBe('10%');

    expect(getByTestId('remote-cursor-name-u1').textContent).toBe('u1');
    expect(getByTestId('remote-cursor-name-u1').style.backgroundColor).toBe(
      'rgb(14, 165, 233)',
    );
    expect(getByTestId('remote-cursor-arrow-u1').getAttribute('fill')).toBe('#0ea5e9');
    awareness.destroy();
  });

  it('keeps the same document-space cursor across desktop and mobile frames', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, {
      user: user('u1', '#0ea5e9'),
      cursor: { xPct: 50, yPct: 25 },
    });

    const desktop = render(<Frame awareness={awareness} width={1440} />);
    const desktopStyle = desktop.getByTestId('remote-cursor-u1').style;
    expect(desktopStyle.left).toBe('50%');
    expect(desktopStyle.top).toBe('25%');
    expect((parseFloat(desktopStyle.left) / 100) * 1440).toBe(720);
    desktop.unmount();

    const mobile = render(<Frame awareness={awareness} width={375} />);
    const mobileStyle = mobile.getByTestId('remote-cursor-u1').style;
    expect(mobileStyle.left).toBe('50%');
    expect(mobileStyle.top).toBe('25%');
    expect((parseFloat(mobileStyle.left) / 100) * 375).toBe(187.5);
    mobile.unmount();
    awareness.destroy();
  });

  it('sanitizes untrusted hints and skips invalid or cursor-less peers', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, {
      user: user('u1', '#0ea5e9', '  He\u0000ro  '),
      cursor: { xPct: 250, yPct: -10 },
    });
    addRemote(awareness, 2, { user: user('u2', '#f59e0b') });
    addRemote(awareness, 3, { user: { id: '', name: '' }, cursor: { xPct: 1, yPct: 2 } });
    addRemote(awareness, 4, { user: user('u4', '#ef4444'), cursor: 'nope' });

    const { getByTestId, queryByTestId } = render(<CursorsOverlay awareness={awareness} />);
    const cursor = getByTestId('remote-cursor-u1').style;
    expect(cursor.left).toBe('100%');
    expect(cursor.top).toBe('0%');
    expect(getByTestId('remote-cursor-name-u1').textContent).toBe('Hero');
    expect(queryByTestId('remote-cursor-u2')).toBeNull();
    expect(queryByTestId('remote-cursor-u4')).toBeNull();
    awareness.destroy();
  });

  it('follows cursor moves and removes disconnected users', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, {
      user: user('u1', '#0ea5e9'),
      cursor: { xPct: 10, yPct: 10 },
    });
    const { getByTestId, queryByTestId } = render(<CursorsOverlay awareness={awareness} />);
    expect(getByTestId('remote-cursor-u1').style.left).toBe('10%');

    act(() => {
      awareness.getStates().set(1, {
        user: user('u1', '#0ea5e9'),
        cursor: { xPct: 60, yPct: 30 },
      });
      awareness.emit('change', [{ added: [], updated: [1], removed: [] }, 'test']);
    });
    expect(getByTestId('remote-cursor-u1').style.left).toBe('60%');

    act(() => {
      awareness.getStates().delete(1);
      awareness.emit('change', [{ added: [], updated: [], removed: [1] }, 'test']);
    });
    expect(queryByTestId('remote-cursor-u1')).toBeNull();
    awareness.destroy();
  });
});
