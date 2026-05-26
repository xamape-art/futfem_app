/**
 * TopTen.tsx — FUTFEM_APP
 * Top 10 jugadoras por categoría dentro de una liga+temporada.
 * Usa los datos ya cargados en App (allStats) — sin llamadas extra a Supabase.
 */

import { cn } from '../lib/utils';
import { formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

// ─── Configuración de categorías ─────────────────────────────────────────────

interface Category {
  key: keyof FcfStat;
  label: string;
  icon: string;
  color: string;        // Tailwind text color para el valor
  bgColor: string;      // Tailwind bg para el header de la card
  emptyText: string;    // Texto si no hay datos
}

const CATEGORIES: Category[] = [
  {
    key: 'goles',
    label: 'Golejadores',
    icon: '⚽',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'from-emerald-500 to-emerald-700',
    emptyText: 'Cap gol marcat',
  },
  {
    key: 'minutos',
    label: 'Més minuts',
    icon: '⏱️',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'from-blue-500 to-blue-700',
    emptyText: 'Sense minuts',
  },
  {
    key: 'titular',
    label: 'Més titularitats',
    icon: '🔵',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'from-indigo-500 to-indigo-700',
    emptyText: 'Sense titularitats',
  },
  {
    key: 'suplente',
    label: 'Més suplències',
    icon: '🟡',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'from-amber-500 to-amber-600',
    emptyText: 'Sense suplències',
  },
  {
    key: 'amarillas',
    label: 'Targetes grogues',
    icon: '🟨',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'from-yellow-500 to-yellow-600',
    emptyText: 'Cap targeta groga',
  },
  {
    key: 'rojas',
    label: 'Targetes vermellas',
    icon: '🟥',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'from-red-500 to-red-700',
    emptyText: 'Cap targeta vermella',
  },
];

// ─── Medallas para el podio ───────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

const rankStyle = (rank: number) => {
  if (rank === 1) return 'text-yellow-500 font-black text-base';
  if (rank === 2) return 'text-gray-400 font-black text-sm';
  if (rank === 3) return 'text-amber-600 font-black text-sm';
  return 'text-neutral-400 font-bold text-xs';
};

// ─── Card de una categoría ────────────────────────────────────────────────────

function CategoryCard({
  category,
  data,
}: {
  category: Category;
  data: FcfStat[];
}) {
  // Top 10: filtrar valor > 0, ordenar desc, tomar 10
  const top10 = [...data]
    .filter(s => (s[category.key] as number) > 0)
    .sort((a, b) => (b[category.key] as number) - (a[category.key] as number))
    .slice(0, 10);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* Header degradado */}
      <div className={cn('bg-gradient-to-r px-4 py-3 flex items-center gap-2', category.bgColor)}>
        <span className="text-xl">{category.icon}</span>
        <span className="text-white font-black text-sm uppercase tracking-wider">
          {category.label}
        </span>
      </div>

      {/* Lista */}
      <div className="divide-y divide-[var(--card-border)]">
        {top10.length === 0 ? (
          <div className="px-4 py-6 text-center text-neutral-400 text-sm">
            {category.emptyText}
          </div>
        ) : (
          top10.map((player, i) => {
            const rank  = i + 1;
            const value = player[category.key] as number;
            const name  = formatPlayerName(player.player_fcf_name);

            return (
              <div
                key={player.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]',
                  rank === 1 && 'bg-yellow-50/60 dark:bg-yellow-900/10'
                )}
              >
                {/* Posición */}
                <div className={cn('w-6 text-center shrink-0', rankStyle(rank))}>
                  {rank <= 3 ? MEDALS[rank - 1] : rank}
                </div>

                {/* Nombre + equipo */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-semibold text-[var(--app-text)] truncate"
                    title={name}
                  >
                    {name}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate" title={player.team_name}>
                    {player.team_name}
                  </div>
                </div>

                {/* Valor */}
                <div className={cn('text-lg font-black shrink-0', category.color)}>
                  {value}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface TopTenProps {
  allStats: FcfStat[];
  season: string;
  leagueName: string;
}

export default function TopTen({ allStats, season, leagueName }: TopTenProps) {
  if (allStats.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-400 text-sm">
        Sense dades per a {leagueName} · {season}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] text-neutral-400 mb-5">
        Top 10 jugadores · {leagueName} · {season} ·{' '}
        {new Set(allStats.map(s => s.team_slug)).size} equips ·{' '}
        {allStats.length} jugadores
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map(cat => (
          <CategoryCard key={cat.key as string} category={cat} data={allStats} />
        ))}
      </div>
    </div>
  );
}
