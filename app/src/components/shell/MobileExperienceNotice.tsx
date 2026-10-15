import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { attachRoomProvider, getRoomProvider, isRoomActive } from '../../store/templateStore';
import { getCollabHost, newRoomId, shareUrlFor, writeRoomToUrl } from '../../collab/room';
import { collectRemotePresence, resolveIdentity } from '../../collab/presence';
import { trackEvent } from '../../analytics/track';
import { cn } from '../../lib/cn';

interface MobileExperienceNoticeProps {
  onContinue: () => void;
}

async function copyUrlToClipboard(url: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function MobileExperienceNotice({ onContinue }: MobileExperienceNoticeProps) {
  const darkMode = useEditorStore((s) => s.darkMode);
  const setToastMessage = useEditorStore((s) => s.setToastMessage);
  const setRoomActive = useEditorStore((s) => s.setRoomActive);
  const [copied, setCopied] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const handleShare = async () => {
    const ok = await copyUrlToClipboard(window.location.href);
    setCopied(ok);
    setToastMessage(ok ? 'Link copied — open it on a PC' : 'Copy failed — copy the address bar URL');
    if (ok) {
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleLiveRoom = async () => {
    let url: string;
    if (isRoomActive()) {
      url = window.location.href;
    } else {
      const room = newRoomId();
      attachRoomProvider(getCollabHost(), room, { role: 'create' });
      writeRoomToUrl(room);
      setRoomActive(true);
      trackEvent('share_created');
      url = shareUrlFor(room);
    }
    const ok = await copyUrlToClipboard(url);
    setToastMessage(
      ok ? 'Live room ready — link copied, open it on a PC' : 'Live room ready — copy the link shown',
    );
    setLiveUrl(url);
  };

  const handleCopyLiveLink = async () => {
    if (!liveUrl) return;
    const ok = await copyUrlToClipboard(liveUrl);
    setToastMessage(ok ? 'Live link copied — open it on your PC' : 'Copy failed — copy the link shown above');
  };

  // Waiting overlay: block input until a second device joins the live room.
  useEffect(() => {
    if (!liveUrl) return;
    const provider = getRoomProvider();
    const awareness = provider?.awareness;
    if (!awareness) return;
    const selfId = resolveIdentity().id;
    const hasPeer = () => collectRemotePresence(awareness, selfId).length > 0;
    const handlePeerJoined = () => {
      setToastMessage('PC connected — edits sync live on both devices');
      onContinue();
    };
    if (hasPeer()) {
      handlePeerJoined();
      return;
    }
    const onChange = () => {
      if (hasPeer()) handlePeerJoined();
    };
    awareness.on('change', onChange);
    return () => {
      awareness.off('change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUrl]);

  if (liveUrl) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Waiting for your PC to join the live room"
        data-testid="mobile-live-waiting"
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      >
        <div
          className={cn(
            'w-full max-w-md rounded-2xl border p-4 shadow-floating backdrop-blur-xl',
            darkMode ? 'border-[#262629] bg-[#1E1E20]/95 text-[#FDFBF7]' : 'border-[#E7E5E0] bg-white/95 text-[#0E0E10]',
          )}
        >
          <p className="text-sm font-semibold">Waiting for your PC to join…</p>
          <p className={cn('mt-1 text-[13px] leading-5', darkMode ? 'text-[#B8B8BE]' : 'text-[#5B5B60]')}>
            Open this exact link on your PC. As soon as it joins, this waiting screen disappears and your
            canvas stays live on both devices — edits on either side appear on the other in realtime.
          </p>
          <p
            data-testid="mobile-live-url"
            className={cn(
              'mt-2 rounded-lg border px-3 py-2 font-mono text-[11px] leading-5 break-all select-all',
              darkMode ? 'border-[#333336] bg-black/30 text-[#D8D8DE]' : 'border-stone bg-surface-muted text-ink',
            )}
          >
            {liveUrl}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-testid="mobile-live-copy-button"
              onClick={() => void handleCopyLiveLink()}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]',
                darkMode ? 'bg-paper text-ink hover:bg-surface' : 'bg-ink text-white hover:bg-ink-soft',
              )}
            >
              Copy link
            </button>
            <button
              type="button"
              data-testid="mobile-live-cancel-button"
              onClick={() => setLiveUrl(null)}
              className={cn(
                'inline-flex cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
                darkMode
                  ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
                  : 'border-stone bg-surface text-ink hover:bg-paper',
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mobile-experience-notice"
      className="pointer-events-none fixed inset-x-3 bottom-20 z-[70] flex justify-center sm:bottom-16"
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-md rounded-2xl border p-4 shadow-floating backdrop-blur-xl',
          darkMode ? 'border-[#262629] bg-[#1E1E20]/95 text-[#FDFBF7]' : 'border-[#E7E5E0] bg-white/95 text-[#0E0E10]',
        )}
      >
        <p className="text-sm font-semibold">Best experienced on PC</p>
        <p className={cn('mt-1 text-[13px] leading-5', darkMode ? 'text-[#B8B8BE]' : 'text-[#5B5B60]')}>
          This editor has a large interface with two sidebars. For the full experience, please open this page on a
          desktop — or create a live room and open its link on your PC to keep both devices in sync.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="mobile-share-button"
            onClick={() => void handleShare()}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]',
              darkMode ? 'bg-paper text-ink hover:bg-surface' : 'bg-ink text-white hover:bg-ink-soft',
            )}
          >
            {copied ? 'Copied!' : 'Share link'}
          </button>
          <button
            type="button"
            data-testid="mobile-live-room-button"
            onClick={() => void handleLiveRoom()}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              darkMode
                ? 'border-accent bg-accent text-white hover:brightness-110'
                : 'border-accent bg-accent text-white hover:brightness-95',
            )}
          >
            Live room
          </button>
          <button
            type="button"
            data-testid="mobile-continue-button"
            onClick={onContinue}
            className={cn(
              'inline-flex cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              darkMode
                ? 'border-ink-muted bg-surface-dark-raised text-paper hover:bg-surface-dark-muted'
                : 'border-stone bg-surface text-ink hover:bg-paper',
            )}
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
