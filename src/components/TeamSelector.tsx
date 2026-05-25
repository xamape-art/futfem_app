/**
 * TeamSelector.tsx
 * Select estilizado para elegir un equipo dentro de la liga+temporada.
 */

import { ChevronDown } from 'lucide-react';
import type { TeamOption } from '../types';

interface TeamSelectorProps {
  teams: TeamOption[];
  selected: string | null;
  onChange: (slug: string | null) => void;
  placeholder?: string;
}

export default function TeamSelector({
  teams,
  selected,
  onChange,
  placeholder = 'Tots els equips…',
}: TeamSelectorProps) {
  if (teams.length === 0) return null;

  // Ordenar alfabéticamente
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mb-4">
      <label className="text-[11px] text-neutral-500 uppercase font-bold tracking-wider block mb-1.5">
        Equip
      </label>
      <div className="relative">
        <select
          className="w-full bg-[var(--input-bg)] border border-[var(--card-border)] text-[var(--app-text)] text-sm rounded-xl px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-brand transition-colors"
          value={selected || ''}
          onChange={e => onChange(e.target.value || null)}
        >
          <option value="">{placeholder}</option>
          {sorted.map(t => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
        />
      </div>
    </div>
  );
}
