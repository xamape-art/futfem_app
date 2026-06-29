/**
 * StatsTable.tsx
 * Taula ordenable d'estadístiques de jugadoras.
 *
 * Millores implementades:
 *  D1 — Primera columna sticky (enganxosa) per a mòbil
 *  D2 — Touch targets: py-2 → py-2.5
 *  D3 — Tooltips a les capçaleres (title="...")
 *  D4 — Chips de filtre ràpid: Totes / ⚽ Golejadores / 🟨 TA / 🟥 TR
 *  D5 — Dorsal com a badge estilitzat
 *  L3 — Animació fade-up a l'arribada de dades (tbody)
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat, SortKey } from '../types';

// ─── D3: Texts complets de les capçaleres ─────────────────────────────────────

const COLUMN_TOOLTIPS: Record<SortKey, string> = {
  player_fcf_name: 'Jugadora',
  partidos:  'Partits jugats',
  titular:   'Partits de titular',
  suplente:  'Partits de suplent',
  minutos:   'Minuts totals',
  goles:     'Gols marcats',
  amarillas: 'Targetes grogues',
  rojas:     'Targetes vermelles',
};

// ─── D4: Tipus de filtre ràpid ─────────────────────────────────────────────────

type QuickFilter = 'all' | 'scorers' | 'yellow' | 'red';

// ─── Component principal ──────────────────────────────────────────────────────

export default function StatsTable({ data }: { data: FcfStat[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('partidos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // D4: aplicar filtre ràpid abans d'ordenar
  const filtered = data.filter(s => {
    if (quickFilter === 'scorers') return s.goles > 0;
    if (quickFilter === 'yellow')  return s.amarillas > 0;
    if (quickFilter === 'red')     return s.rojas > 0;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortKey] as string | number;
    const vb = b[sortKey] as string | number;
    if (typeof va === 'string') {
      return sortDir === 'asc'
        ? va.localeCompare(vb as string)
        : (vb as string).localeCompare(va);
    }
    return sortDir === 'asc'
      ? (va as number) - (vb as number)
      : (vb as number) - (va as number);
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'desc'
      ? <ChevronDown size={10} className="inline ml-0.5" />
      : <ChevronUp   size={10} className="inline ml-0.5" />;
  };

  // D1 + D3: Th amb sticky opcional i title tooltip
  const Th = ({
    col,
    label,
    right  = true,
    sticky = false,
  }: {
    col: SortKey;
    label: string;
    right?: boolean;
    sticky?: boolean;
  }) => (
    <th
      title={COLUMN_TOOLTIPS[col]}
      className={cn(
        // D2: py-2 → py-2 (th no canvia massa, el canvi important és als td)
        'px-2 py-2 text-[11px] font-black uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-[var(--app-text)]',
        right ? 'text-right' : 'text-left',
        sortKey === col
          ? 'text-[var(--app-text)]'
          : 'text-neutral-400 dark:text-neutral-500',
        // D1: sticky per a la primera columna
        sticky && 'sticky left-0 z-20 bg-[var(--card-bg)] table-sticky-col'
      )}
      onClick={() => handleSort(col)}
    >
      {label}
      <SortIcon col={col} />
    </th>
  );

  if (data.length === 0) {
    return (
      <div className="text-center py-10 text-neutral-500 text-sm">
        No hay datos disponibles
      </div>
    );
  }

  // D4: mostrar chips si hi ha prou dades
  const showFilters = data.length > 3;

  return (
    <div>
      {/* ── D4: Chips de filtre ràpid ──────────────────────── */}
      {showFilters && (
        <div className="flex gap-1.5 px-3 pt-2.5 pb-1 flex-wrap">
          {(
            [
              { key: 'all',     label: 'Totes' },
              { key: 'scorers', label: '⚽ Golejadores' },
              { key: 'yellow',  label: '🟨 TA' },
              { key: 'red',     label: '🟥 TR' },
            ] as { key: QuickFilter; label: string }[]
          ).map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={cn(
                'px-2.5 py-0.5 text-[10px] font-bold rounded-full border transition-colors',
                quickFilter === f.key
                  ? f.key === 'scorers'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                    : f.key === 'yellow'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                    : f.key === 'red'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400'
                    : 'bg-brand/10 dark:bg-brand/20 border-brand/30 text-brand'
                  : 'bg-[var(--input-bg)] border-transparent text-neutral-400 hover:border-[var(--card-border)] hover:text-neutral-600 dark:hover:text-neutral-300'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Taula ──────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--card-border)]">
              {/* D1: primera columna sticky */}
              <Th col="player_fcf_name" label="Jugadora" right={false} sticky={true} />
              <Th col="partidos"  label="PJ"  />
              <Th col="titular"   label="TIT" />
              <Th col="suplente"  label="SUP" />
              <Th col="minutos"   label="MIN" />
              <Th col="goles"     label="G"   />
              <Th col="amarillas" label="TA"  />
              <Th col="rojas"     label="TR"  />
            </tr>
          </thead>
          {/* L3: fade-up al renderitzar dades */}
          <tbody className="animate-fade-up">
            {sorted.map((s, i) => {
              const displayName = formatPlayerName(s.player_fcf_name);
              const isOdd = i % 2 !== 0;

              return (
                <tr
                  key={s.id}
                  className={cn(
                    'group border-b border-[var(--card-border)] transition-colors hover:bg-neutral-100 dark:hover:bg-white/5',
                    isOdd ? 'bg-neutral-50 dark:bg-[#272727]' : 'bg-transparent'
                  )}
                >
                  {/* D1: primera columna sticky amb bg explícit + group-hover */}
                  <td
                    className={cn(
                      'px-2 py-2.5 text-left font-medium text-[var(--app-text)] max-w-[160px]',
                      'sticky left-0 z-10 table-sticky-col transition-colors',
                      isOdd
                        ? 'bg-neutral-50 dark:bg-[#272727] group-hover:bg-neutral-100 dark:group-hover:bg-white/5'
                        : 'bg-[var(--card-bg)] group-hover:bg-neutral-100 dark:group-hover:bg-white/5'
                    )}
                  >
                    <span className="block truncate" title={displayName}>
                      {displayName}
                    </span>
                    {/* D5: Dorsal com a badge estilitzat */}
                    {s.dorsal && (
                      <span className="inline-block text-[9px] font-black px-1 mt-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-400 dark:text-neutral-500 tabular-nums leading-tight">
                        {s.dorsal}
                      </span>
                    )}
                  </td>

                  {/* D2: py-2 → py-2.5 a totes les cel·les de dades */}
                  <td className="px-2 py-2.5 text-right text-neutral-700 dark:text-neutral-300">
                    {s.partidos}
                  </td>
                  <td className="px-2 py-2.5 text-right text-neutral-700 dark:text-neutral-300">
                    {s.titular}
                  </td>
                  <td className="px-2 py-2.5 text-right text-neutral-700 dark:text-neutral-300">
                    {s.suplente}
                  </td>
                  <td className="px-2 py-2.5 text-right text-neutral-500 dark:text-neutral-400">
                    {s.minutos}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right font-bold',
                      s.goles > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                    )}
                  >
                    {s.goles}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right',
                      s.amarillas > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                    )}
                  >
                    {s.amarillas}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right',
                      s.rojas > 0
                        ? 'text-red-600 dark:text-red-400 font-bold'
                        : 'text-neutral-400 dark:text-neutral-500'
                    )}
                  >
                    {s.rojas}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Estat buit quan el filtre ràpid no té resultats */}
      {sorted.length === 0 && data.length > 0 && (
        <div className="text-center py-6 text-neutral-400 text-[12px]">
          Cap jugadora amb aquest filtre
        </div>
      )}
    </div>
  );
}
