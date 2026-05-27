/**
 * TeamSelector.tsx — S3
 * Grid de pills per seleccionar equip — substitueix el <select> natiu.
 * Mostra fins a MAX_VISIBLE equips per defecte i permet expandir.
 */

import { cn } from '../lib/utils';
import type { TeamOption } from '../types';

interface TeamSelectorProps {
  teams: TeamOption[];
  selected: string | null;
  onChange: (slug: string | null) => void;
}

const MAX_VISIBLE = 8;

export default function TeamSelector({ teams, selected, onChange }: TeamSelectorProps) {
  if (teams.length === 0) return null;

  // Ordenar alfabèticament
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  // Si hi ha equip seleccionat i no és en els primers MAX_VISIBLE, sempre el mostrem
  const selectedTeam = selected ? sorted.find(t => t.slug === selected) : null;
  const topTeams = sorted.slice(0, MAX_VISIBLE);
  const hasMore = sorted.length > MAX_VISIBLE;
  const selectedIsHidden =
    selectedTeam && !topTeams.find(t => t.slug === selected);

  // Mostrar tots sempre (la llista és prou curta per no necessitar toggle)
  const visibleTeams = sorted;

  return (
    <div className="mb-4">
      <label className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider block mb-2">
        Equip
      </label>

      {/* Pills */}
      <div className="flex flex-wrap gap-1.5">
        {/* Pill "Tots" */}
        <button
          onClick={() => onChange(null)}
          className={cn(
            'px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors',
            !selected
              ? 'bg-brand text-white border-brand'
              : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
          )}
        >
          Tots
        </button>

        {/* Pills d'equips */}
        {visibleTeams.map(t => (
          <button
            key={t.slug}
            onClick={() => onChange(t.slug)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors',
              selected === t.slug
                ? 'bg-brand text-white border-brand'
                : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
            )}
            title={t.name}
          >
            {/* Nom curt: truncar si és massa llarg */}
            <span className="inline-block max-w-[160px] truncate align-bottom">
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
