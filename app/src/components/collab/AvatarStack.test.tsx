import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { AvatarStack, initialsFor } from './AvatarStack';
import { colorForId, sanitizePresenceUser, type PresenceUser } from '../../collab/presence';

const self: PresenceUser = { id: 'self', name: 'Ada Lovelace', color: '#7868e6' };

const makeAwareness = (): Awareness => new Awareness(new Y.Doc());

const addRemote = (
  awareness: Awareness,
  clientId: number,
  state: Record<string, unknown>,
): void => {
  awareness.getStates().set(clientId, state);
  awareness.emit('change', [{ added: [clientId], updated: [], removed: [] }, 'test']);
};

describe('initialsFor', () => {
  it('takes up to two alphanumeric initials', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL');
    expect(initialsFor('Guest-AB12')).toBe('G');
    expect(initialsFor('  ')).toBe('?');
    expect(initialsFor('zoe')).toBe('Z');
  });
});

describe('AvatarStack', () => {
  it('renders nothing without an active awareness', () => {
    const { container } = render(<AvatarStack awareness={null} self={self} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the local identity, sanitized remotes, and an overflow chip', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 11, {
      user: { id: 'u1', name: 'Zed\u0000', color: '#0ea5e9' },
    });
    addRemote(awareness, 12, { user: { id: 'u2', name: 'Amy', color: 'not-a-color' } });
    addRemote(awareness, 13, { user: { id: 'u3', name: 'Bob' } });
    addRemote(awareness, 14, { user: { id: 'u4', name: 'Cid' } });
    addRemote(awareness, 15, { user: { id: 'u5', name: 'Dana' } });
    addRemote(awareness, 16, { cursor: { xPct: 1, yPct: 1 } });

    const { getByTestId, getAllByTestId, getByText } = render(
      <AvatarStack awareness={awareness} self={self} />,
    );

    expect(getByTestId('avatar-stack')).toBeInTheDocument();
    expect(getAllByTestId(/^presence-avatar/)).toHaveLength(4);
    expect(getByText('AL')).toBeInTheDocument();
    expect(getByText('+2')).toBeInTheDocument();

    const amy = getByTestId('presence-avatar-u2');
    expect(amy).toHaveStyle({ backgroundColor: colorForId('u2') });
    expect(amy).toHaveAttribute('title', 'Amy');

    const zed = getByTestId('presence-avatar-u1');
    expect(zed).toHaveAttribute('title', 'Zed');
    expect(zed).toHaveStyle({ backgroundColor: '#0ea5e9' });

    awareness.destroy();
  });

  it('drops removed remote users from the stack', () => {
    const awareness = makeAwareness();
    addRemote(awareness, 21, { user: { id: 'u1', name: 'Zed' } });
    const { queryByTestId, getAllByTestId } = render(
      <AvatarStack awareness={awareness} self={self} />,
    );
    expect(getAllByTestId(/^presence-avatar/)).toHaveLength(2);

    act(() => {
      awareness.getStates().delete(21);
      awareness.emit('change', [{ added: [], updated: [], removed: [21] }, 'test']);
    });
    expect(queryByTestId('presence-avatar-u1')).toBeNull();
    expect(getAllByTestId(/^presence-avatar/)).toHaveLength(1);

    awareness.destroy();
  });

  it('keeps unsanitized user payloads out of the DOM', () => {
    expect(sanitizePresenceUser({ name: 'Zed\u0000<script>' })).toMatchObject({
      name: 'Zed<script>',
    });
  });
});
