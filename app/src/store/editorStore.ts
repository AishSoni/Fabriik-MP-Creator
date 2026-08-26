import { create } from 'zustand';
import type { ElementId } from '../types/template';
import type { Scope, Viewport } from '../types/viewport';

export type RightPanelTab = 'properties' | 'ai' | 'history' | 'code';

interface EditorState {
  activeViewport: Viewport;
  editScope: Scope;
  selectedIds: ElementId[];
  rightPanelTab: RightPanelTab;
  setActiveViewport: (viewport: Viewport) => void;
  setEditScope: (scope: Scope) => void;
  selectOnly: (id: ElementId) => void;
  toggleSelect: (id: ElementId) => void;
  setSelection: (ids: ElementId[]) => void;
  clearSelection: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeViewport: 'desktop',
  editScope: 'all',
  selectedIds: [],
  rightPanelTab: 'properties',
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
}));
