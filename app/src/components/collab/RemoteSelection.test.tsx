import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  MAX_REMOTE_SELECTION_COLORS,
  remoteSelectionStyle,
  useRemoteSelectionColors,
} from './RemoteSelection';
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

const user = (id: string, color: string) => ({ id, name: id, color });

function Probe({
  elementId,
  awareness,
}: {
  elementId: string;
  awareness: PresenceAwareness;
}) {
  const colors = useRemoteSelectionColors(elementId, awareness);
  return <span data-testid="colors">{colors.join('|')}</span>;
}

describe('remoteSelectionStyle', () => {
  it('returns no styles without remote colors', () => {
    expect(remoteSelectionStyle([])).toEqual({});
  });

  it('draws the first color as an outline offset from the element', () => {
    expect(remoteSelectionStyle(['#0ea5e9'])).toEqual({
      outline: '2px solid #0ea5e9',
      outlineOffset: '1px',
    });
  });

  it(`layers extra colors as box-shadow rings, capped at ${MAX_REMOTE_SELECTION_COLORS}`, () => {
    const style = remoteSelectionStyle(['#0ea5e9', '#f59e0b', '#ef4444', '#10b981']);
    expect(style.outline).toBe('2px solid #0ea5e9');
    expect(style.boxShadow).toBe('0 0 0 4px #f59e0b, 0 0 0 6px #ef4444');
  });
});

describe('useRemoteSelectionColors', () => {
  it('collects the colors of remote users selecting the element', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, {
      user: user('u1', '#0ea5e9'),
      selectedIds: ['hero', 'cta'],
    });
    addRemote(awareness, 2, { user: user('u2', '#f59e0b'), selectedIds: ['hero'] });

    const hero = render(<Probe elementId="hero" awareness={awareness} />);
    expect(hero.getByTestId('colors').textContent).toBe('#0ea5e9|#f59e0b');
    hero.unmount();

    const cta = render(<Probe elementId="cta" awareness={awareness} />);
    expect(cta.getByTestId('colors').textContent).toBe('#0ea5e9');
    cta.unmount();

    const none = render(<Probe elementId="footer" awareness={awareness} />);
    expect(none.getByTestId('colors').textContent).toBe('');
    none.unmount();
    awareness.destroy();
  });

  it('dedupes colors and caps the layer count', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, { user: user('u1', '#0ea5e9'), selectedIds: ['hero'] });
    addRemote(awareness, 2, { user: user('u2', '#0ea5e9'), selectedIds: ['hero'] });
    addRemote(awareness, 3, { user: user('u3', '#f59e0b'), selectedIds: ['hero'] });
    addRemote(awareness, 4, { user: user('u4', '#ef4444'), selectedIds: ['hero'] });
    addRemote(awareness, 5, { user: user('u5', '#10b981'), selectedIds: ['hero'] });

    const { getByTestId } = render(<Probe elementId="hero" awareness={awareness} />);
    const colors = getByTestId('colors').textContent?.split('|') ?? [];
    expect(colors).toHaveLength(MAX_REMOTE_SELECTION_COLORS);
    expect(colors[0]).toBe('#0ea5e9');
    awareness.destroy();
  });

  it('re-renders when a remote user changes selection', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 1, { user: user('u1', '#0ea5e9'), selectedIds: ['hero'] });
    const { getByTestId } = render(<Probe elementId="hero" awareness={awareness} />);
    expect(getByTestId('colors').textContent).toBe('#0ea5e9');

    act(() => {
      awareness.getStates().set(1, { user: user('u1', '#0ea5e9'), selectedIds: [] });
      awareness.emit('change', [{ added: [], updated: [1], removed: [] }, 'test']);
    });
    expect(getByTestId('colors').textContent).toBe('');
    awareness.destroy();
  });
});
