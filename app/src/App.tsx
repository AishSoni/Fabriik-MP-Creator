import { useEffect } from 'react';
import { EditorShell } from './components/shell/EditorShell';
import { attachRoomProvider } from './store/templateStore';
import { useEditorStore } from './store/editorStore';
import { getCollabHost, roomFromUrl } from './collab/room';
import { trackEvent } from './analytics/track';
import { useRoomAnalytics } from './analytics/useRoomAnalytics';

export default function App() {
  useRoomAnalytics();
  useEffect(() => {
    const room = roomFromUrl();
    if (!room) return;
    attachRoomProvider(getCollabHost(), room, { role: 'join' });
    useEditorStore.getState().setRoomActive(true);
    useEditorStore.getState().setToastMessage('Joined shared room');
    trackEvent('room_joined');
  }, []);
  return <EditorShell />;
}
