import { useState } from 'react';

export interface CommittingDraft {
  value: string;
  isDirty: boolean;
  onChange: (next: string) => void;
  commit: () => void;
  reset: () => void;
}

export function useCommittingDraft(source: string, onCommit: (next: string) => void): CommittingDraft {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? source,
    isDirty: draft !== null && draft !== source,
    onChange: (next) => setDraft(next),
    commit: () => {
      if (draft !== null && draft !== source) onCommit(draft);
      setDraft(null);
    },
    reset: () => setDraft(null),
  };
}
