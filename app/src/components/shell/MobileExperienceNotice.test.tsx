import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { MobileExperienceNotice } from './MobileExperienceNotice';
import { useEditorStore } from '../../store/editorStore';
import { attachRoomProvider, getRoomProvider, isRoomActive } from '../../store/templateStore';

vi.mock('../../store/templateStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/templateStore')>();
  return {
    ...actual,
    attachRoomProvider: vi.fn(),
    getRoomProvider: vi.fn(),
    isRoomActive: vi.fn(),
  };
});

const mockAttach = vi.mocked(attachRoomProvider);
const mockGetProvider = vi.mocked(getRoomProvider);
const mockIsActive = vi.mocked(isRoomActive);

interface FakeAwareness {
  clientID: number;
  states: Map<number, unknown>;
  listeners: Set<() => void>;
  getStates: () => Map<number, unknown>;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
}

function createFakeAwareness(): FakeAwareness {
  const listeners = new Set<() => void>();
  const states = new Map<number, unknown>();
  return {
    clientID: 1,
    states,
    listeners,
    getStates: () => states,
    on: (_event: string, listener: () => void) => {
      listeners.add(listener);
    },
    off: (_event: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
}

function emitAwarenessChange(awareness: FakeAwareness) {
  for (const listener of [...awareness.listeners]) listener();
}

function remotePeerState() {
  return {
    user: { id: 'pc-peer', name: 'PC', color: '#0ea5e9' },
    cursor: null,
    selectedIds: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  useEditorStore.getState().setToastMessage(null);
  useEditorStore.getState().setRoomActive(false);
  mockAttach.mockReset();
  mockGetProvider.mockReset();
  mockIsActive.mockReset();
  mockIsActive.mockReturnValue(false);
  mockGetProvider.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MobileExperienceNotice', () => {
  it('copies the current URL and confirms via toast', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onContinue = vi.fn();

    render(<MobileExperienceNotice onContinue={onContinue} />);

    expect(screen.getByTestId('mobile-experience-notice')).toHaveTextContent('Best experienced on PC');

    await user.click(screen.getByTestId('mobile-share-button'));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(useEditorStore.getState().toastMessage).toBe('Link copied — open it on a PC');
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('dismisses when continuing anyway', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(<MobileExperienceNotice onContinue={onContinue} />);
    await user.click(screen.getByTestId('mobile-continue-button'));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('creates a live room, copies its link, and shows the blocking waiting screen', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const awareness = createFakeAwareness();
    mockAttach.mockReturnValue({ awareness } as never);
    mockGetProvider.mockReturnValue({ awareness } as never);
    const onContinue = vi.fn();

    render(<MobileExperienceNotice onContinue={onContinue} />);
    await user.click(screen.getByTestId('mobile-live-room-button'));

    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledWith(expect.any(String), expect.any(String), { role: 'create' });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('room='));
    expect(useEditorStore.getState().roomActive).toBe(true);

    const waiting = screen.getByTestId('mobile-live-waiting');
    expect(waiting).toHaveTextContent('Waiting for your PC to join');
    expect(waiting).toHaveTextContent('Open this exact link on your PC');
    expect(screen.getByTestId('mobile-live-url')).toHaveTextContent('room=');
    // The waiting screen replaces the prompt and blocks the page.
    expect(screen.queryByTestId('mobile-experience-notice')).not.toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('dismisses the waiting screen as soon as a second device joins', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const awareness = createFakeAwareness();
    mockAttach.mockReturnValue({ awareness } as never);
    mockGetProvider.mockReturnValue({ awareness } as never);
    const onContinue = vi.fn();

    render(<MobileExperienceNotice onContinue={onContinue} />);
    await user.click(screen.getByTestId('mobile-live-room-button'));
    expect(screen.getByTestId('mobile-live-waiting')).toBeInTheDocument();

    awareness.states.set(2, remotePeerState());
    await act(async () => {
      emitAwarenessChange(awareness);
    });

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().toastMessage).toBe('PC connected — edits sync live on both devices');
  });

  it('cancelling the wait returns to the prompt and keeps the room for later', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const awareness = createFakeAwareness();
    mockAttach.mockReturnValue({ awareness } as never);
    mockGetProvider.mockReturnValue({ awareness } as never);
    const onContinue = vi.fn();

    render(<MobileExperienceNotice onContinue={onContinue} />);
    await user.click(screen.getByTestId('mobile-live-room-button'));
    expect(screen.getByTestId('mobile-live-waiting')).toBeInTheDocument();

    await user.click(screen.getByTestId('mobile-live-cancel-button'));

    // Back to the prompt; the room stays active so it can be rejoined.
    expect(screen.queryByTestId('mobile-live-waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-experience-notice')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
    expect(mockAttach).toHaveBeenCalledTimes(1);

    // Re-entering reuses the existing room instead of creating a new one.
    mockIsActive.mockReturnValue(true);
    await user.click(screen.getByTestId('mobile-live-room-button'));
    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenLastCalledWith(window.location.href);
    expect(screen.getByTestId('mobile-live-waiting')).toBeInTheDocument();
  });
});
