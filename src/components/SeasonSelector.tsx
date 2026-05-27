/**
 * SeasonSelector.tsx
 * Pills de selección de temporada derivadas de league.fcf_seasons.
 */

import { cn } from '../lib/utils';
import { fcfSeasonToApp } from '../lib/utils';

interface SeasonSelectorProps {
  fcfSeasons: string[];   // ['2627', '2526']
  selected: string;       // '26-27'
  onChange: (season: string) => void;
}

export default function SeasonSelector({ fcfSeasons, selected, onChange }: SeasonSelectorProps) {
  if (fcfSeasons.length <= 1) return null; // Sin selector si solo hay una temporada

  // Ordenar descendente (más reciente primero)
  const seasons = [...fcfSeasons]
    .sort((a, b) => b.localeCompare(a))
    .map(fcfSeasonToApp);

  // N3: role + aria-label/aria-pressed per a accessibilitat
  return (
    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl p-1" role="group" aria-label="Selector de temporada">
      {seasons.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-label={`Temporada ${s}`}
          aria-pressed={selected === s}
          className={cn(
            'px-3 py-1 text-[11px] font-black rounded-md transition-colors',
            selected === s
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
              : 'text-neutral-400 dark:text-neutral-500 hover:text-[var(--app-text)]'
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
