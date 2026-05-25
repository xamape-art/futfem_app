/**
 * StatsTable.tsx
 * Tabla ordenable de estadísticas de jugadoras.
 * Extraído y generalizado de DatosSection.tsx (ATClub).
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import { formatPlayerName } from '../lib/utils';
import type { FcfStat, SortKey } from '../types';

export default function StatsTable({ data }: { data: FcfStat[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('partidos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    const va = a[sortKey] as string | number;
    const vb = b[sortKey] as string | number;
    if (typeof va === 'string') {
      return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    }
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'desc'
      ? <ChevronDown size={10} className="inline ml-0.5" />
      : <ChevronUp size={10} className="inline ml-0.5" />;
  };

  const Th = ({
    col,
    label,
    right = true,
  }: {
    col: SortKey;
    label: string;
    right?: boolean;
  }) => (
    <th
      className={cn(
        'px-2 py-1.5 text-[11px] font-black uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-[var(--app-text)]',
        right ? 'text-right' : 'text-left',
        sortKey === col ? 'text-[var(--app-text)]' : 'text-neutral-400 dark:text-neutral-500'
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[var(--card-border)]">
            <Th col="player_fcf_name" label="Jugadora" right={false} />
            <Th col="partidos"  label="PJ"  />
            <Th col="titular"   label="TIT" />
            <Th col="suplente"  label="SUP" />
            <Th col="minutos"   label="MIN" />
            <Th col="goles"     label="G"   />
            <Th col="amarillas" label="TA"  />
            <Th col="rojas"     label="TR"  />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const displayName = formatPlayerName(s.player_fcf_name);
            return (
              <tr
                key={s.id}
                className={cn(
                  'border-b border-[var(--card-border)] transition-colors hover:bg-neutral-100 dark:hover:bg-white/5',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-neutral-50 dark:bg-white/[0.03]'
                )}
              >
                <td className="px-2 py-2 text-left font-medium text-[var(--app-text)] max-w-[160px]">
                  <span className="block truncate" title={displayName}>
                    {displayName}
                  </span>
                  {s.dorsal && (
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                      #{s.dorsal}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-neutral-700 dark:text-neutral-300">
                  {s.partidos}
                </td>
                <td className="px-2 py-2 text-right text-neutral-700 dark:text-neutral-300">
                  {s.titular}
                </td>
                <td className="px-2 py-2 text-right text-neutral-700 dark:text-neutral-300">
                  {s.suplente}
                </td>
                <td className="px-2 py-2 text-right text-neutral-500 dark:text-neutral-400">
                  {s.minutos}
                </td>
                <td
                  className={cn(
                    'px-2 py-2 text-right font-bold',
                    s.goles > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-neutral-400 dark:text-neutral-500'
                  )}
                >
                  {s.goles}
                </td>
                <td
                  className={cn(
                    'px-2 py-2 text-right',
                    s.amarillas > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-neutral-400 dark:text-neutral-500'
                  )}
                >
                  {s.amarillas}
                </td>
                <td
                  className={cn(
                    'px-2 py-2 text-right',
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
  );
}
