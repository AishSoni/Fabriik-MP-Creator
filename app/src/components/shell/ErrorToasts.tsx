import { useEffect, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';

export function ErrorToasts() {
  const lastErrors = useTemplateStore((s) => s.lastErrors);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (lastErrors.length > 0) setDismissed(null);
  }, [lastErrors]);

  if (lastErrors.length === 0 || dismissed !== null) return null;
  const signature = lastErrors.map((e) => e.message).join('|');
  if (signature === dismissed) return null;

  return (
    <div
      role="alert"
      className="mx-4 mt-2 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
    >
      <ul className="list-disc pl-4">
        {lastErrors.slice(0, 3).map((error, i) => (
          <li key={i}>
            <span className="font-semibold">{error.code}</span>: {error.message}
          </li>
        ))}
        {lastErrors.length > 3 && <li>…and {lastErrors.length - 3} more</li>}
      </ul>
      <button
        type="button"
        onClick={() => setDismissed(signature)}
        className="cursor-pointer rounded px-2 py-0.5 font-medium hover:bg-red-100"
      >
        Dismiss
      </button>
    </div>
  );
}
