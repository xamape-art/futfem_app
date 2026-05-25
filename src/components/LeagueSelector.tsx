/**
 * LeagueSelector.tsx
 * Pills de selección de liga/competición.
 * Se oculta si solo hay una liga activa (auto-seleccionada).
 */

import { cn } from '../lib/utils';
import type { League } from '../types';

interface LeagueSelectorProps {
  leagues: League[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

export default function LeagueSelector({ leagues, selectedId, onChange }: LeagueSelectorProps) {
  // Solo mostrar si hay más de una liga
  if (leagues.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {leagues.map(l => (
        <button
          key={l.id}
          onClick={() => onChange(l.id)}
          className={cn(
            'px-4 py-1.5 text-[12px] font-semibold rounded-full border transition-colors',
            selectedId === l.id
              ? 'bg-brand text-white border-brand'
              : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
          )}
        >
          {l.short_name}
        </button>
      ))}
    </div>
  );
}
