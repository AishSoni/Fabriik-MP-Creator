import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ElementId } from '../types/template';
import type { Scope, Viewport } from '../types/viewport';

export type RightPanelTab = 'properties' | 'ai' | 'history' | 'code';

interface EditorState {
  activeViewport: Viewport;
  editScope: Scope;
  selectedIds: ElementId[];
  rightPanelTab: RightPanelTab;
  darkMode: boolean;
  isCompareOpen: boolean;
  toastMessage: string | null;
  setActiveViewport: (viewport: Viewport) => void;
  setEditScope: (scope: Scope) => void;
  selectOnly: (id: ElementId) => void;
  toggleSelect: (id: ElementId) => void;
  setSelection: (ids: ElementId[]) => void;
  clearSelection: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleDarkMode: () => void;
  setDarkMode: (darkMode: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setToastMessage: (message: string | null) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      activeViewport: 'desktop',
      editScope: 'all',
      selectedIds: [],
      rightPanelTab: 'properties',
      darkMode: true,
      isCompareOpen: false,
      toastMessage: null,
      setActiveViewport: (activeViewport) => set({ activeViewport }),
      setEditScope: (editScope) => set({ editScope }),
      selectOnly: (id) => set({ selectedIds: [id] }),
      toggleSelect: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((x) => x !== id)
            : [...state.selectedIds, id],
        })),
      setSelection: (selectedIds) => set({ selectedIds }),
      clearSelection: () => set({ selectedIds: [] }),
      setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      setDarkMode: (darkMode) => set({ darkMode }),
      setCompareOpen: (isCompareOpen) => set({ isCompareOpen }),
      setToastMessage: (toastMessage) => set({ toastMessage }),
    }),
    {
      name: 'fabriik-editor-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ darkMode: state.darkMode }),
    },
  ),
);
