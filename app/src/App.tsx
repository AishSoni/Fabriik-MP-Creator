import { useEffect } from 'react';
import { EditorShell } from './components/shell/EditorShell';
import { attachRoomProvider } from './store/templateStore';
import { useEditorStore } from './store/editorStore';
import { getCollabHost, roomFromUrl } from './collab/room';

export default function App() {
  useEffect(() => {
    const room = roomFromUrl();
    if (!room) return;
    attachRoomProvider(getCollabHost(), room, { role: 'join' });
    useEditorStore.getState().setRoomActive(true);
    useEditorStore.getState().setToastMessage('Joined shared room');
  }, []);
  return <EditorShell />;
}
