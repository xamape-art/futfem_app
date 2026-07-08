/**
 * TeamSelector.tsx — S3
 * Grid de pills per seleccionar equip — substitueix el <select> natiu.
 * Es col·lapsa per defecte (mostra uns quants equips) i s'expandeix amb un botó,
 * per no saturar visualment quan hi ha moltes equips.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import type { TeamOption } from '../types';

interface TeamSelectorProps {
  teams: TeamOption[];
  selected: string | null;
  onChange: (slug: string | null) => void;
}

const MAX_VISIBLE = 11;

const pillClass = (active: boolean) =>
  cn(
    'px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors',
    active
      ? 'bg-brand text-white border-brand'
      : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
  );

export default function TeamSelector({ teams, selected, onChange }: TeamSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  if (teams.length === 0) return null;

  // Ordenar alfabèticament
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  const selectedTeam = selected ? sorted.find(t => t.slug === selected) : null;

  const shouldCollapse = sorted.length > MAX_VISIBLE && !expanded;
  let visibleTeams = sorted;
  if (shouldCollapse) {
    visibleTeams = sorted.slice(0, MAX_VISIBLE);
    // L'equip seleccionat sempre visible, encara que quedi fora del tall
    if (selectedTeam && !visibleTeams.some(t => t.slug === selected)) {
      visibleTeams = [...visibleTeams, selectedTeam];
    }
  }

  return (
    <div className="mb-4">
      <label className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider block mb-2">
        Equip
      </label>

      {/* Pills */}
      <div className="flex flex-wrap gap-1.5">
        {/* Pill "Tots" */}
        <button onClick={() => onChange(null)} className={pillClass(!selected)}>
          Tots
        </button>

        {/* Pills d'equips */}
        {visibleTeams.map(t => (
          <button
            key={t.slug}
            onClick={() => onChange(t.slug)}
            className={pillClass(selected === t.slug)}
            title={t.name}
          >
            <span className="inline-block max-w-[160px] truncate align-bottom">
              {t.name}
            </span>
          </button>
        ))}

        {/* Toggle expandir / col·lapsar */}
        {sorted.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-full border border-accent/40 bg-accent/[0.08] text-accent hover:bg-accent/[0.16] transition-colors"
          >
            {expanded ? (
              <>
                Veure menys
                <ChevronUp size={13} strokeWidth={2.5} />
              </>
            ) : (
              <>
                Veure tots els {sorted.length}
                <ChevronDown size={13} strokeWidth={2.5} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
