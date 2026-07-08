/**
 * StatTiles.tsx — Prop 3
 * Fila de targetes-resum sobre la taula: dona context i valor immediat
 * (jugadores, equips, gols, partits) amb xifres grans i color de marca.
 */

import { useMemo } from 'react';
import type { ActaProcesada, FcfStat } from '../types';

interface Props {
  stats: FcfStat[];
  actas: ActaProcesada[];
  teamsCount: number;
}

function Tile({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 bg-[var(--card-bg)] border border-[var(--card-border)] border-t-2 border-t-accent/60 rounded-xl px-3 py-3 text-center">
      <div
        className={
          accent
            ? 'text-[22px] leading-none font-black text-emerald-600 dark:text-emerald-400 tabular-nums'
            : 'text-[22px] leading-none font-black text-brand dark:text-white tabular-nums'
        }
      >
        {value.toLocaleString('ca-ES')}
      </div>
      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  );
}

export default function StatTiles({ stats, actas, teamsCount }: Props) {
  const { players, goals, matches } = useMemo(() => {
    const goals = stats.reduce((sum, s) => sum + s.goles, 0);
    // Partits únics processats (una acta = un partit)
    const matches = new Set(actas.map(a => a.acta_url)).size;
    return { players: stats.length, goals, matches };
  }, [stats, actas]);

  return (
    <div className="flex gap-2 sm:gap-2.5 mb-5">
      <Tile value={players} label="Jugadores" />
      <Tile value={teamsCount} label="Equips" />
      <Tile value={goals} label="Gols" accent />
      <Tile value={matches} label="Partits" />
    </div>
  );
}
