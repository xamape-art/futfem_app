/**
 * SeasonSelector.tsx
 * Pills de selección de temporada derivadas de league.fcf_seasons.
 * Prop 1: marca visualment les temporades sense dades.
 */

import { cn } from '../lib/utils';
import { fcfSeasonToApp } from '../lib/utils';

interface SeasonSelectorProps {
  fcfSeasons: string[];        // ['2627', '2526']
  selected: string;            // '26-27'
  seasonsWithData: Set<string>; // temporades (format app) amb dades reals
  onChange: (season: string) => void;
}

export default function SeasonSelector({ fcfSeasons, selected, seasonsWithData, onChange }: SeasonSelectorProps) {
  if (fcfSeasons.length <= 1) return null; // Sin selector si solo hay una temporada

  // Ordenar descendente (más reciente primero)
  const seasons = [...fcfSeasons]
    .sort((a, b) => b.localeCompare(a))
    .map(fcfSeasonToApp);

  // N3: role + aria-label/aria-pressed per a accessibilitat
  return (
    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl p-1" role="group" aria-label="Selector de temporada">
      {seasons.map(s => {
        const empty = !seasonsWithData.has(s);
        const active = selected === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            aria-label={`Temporada ${s}${empty ? ' (sense dades)' : ''}`}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-black rounded-lg transition-colors',
              active
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-[var(--app-text)]'
            )}
          >
            {s}
            {/* Prop 1: punt indicador — verd si té dades, buit si no */}
            {empty ? (
              <span
                className="text-[8px] font-bold uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
                title="Sense dades encara"
              >
                ·buida
              </span>
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                title="Amb dades"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
