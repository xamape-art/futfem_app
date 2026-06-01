/**
 * TopTen.tsx — FUTFEM_APP
 * Top 20 jugadoras per categoria dins d'una liga+temporada.
 *
 * Millores implementades:
 *  R1 — Jerarquia visual del podi (rang 1 > rang 2-3 > rang 4-10 > rang 11-20)
 *  R2 — Badge de comptador de jugadores al header de cada card
 *  R3 — Cards plegables: mostra top 5 per defecte, expandible a 20
 *  L3 — Animació fade-up al grid
 */

import { useState } from 'react';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

// ─── Configuració de categories ───────────────────────────────────────────────

interface Category {
  key: keyof FcfStat;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  emptyText: string;
  secondaryKey?: keyof FcfStat;
  secondaryLabel?: string;
  computedValue?: (s: FcfStat) => number;
  formatValue?: (v: number) => string;
  sortAsc?: boolean;
  valueLabel?: string;
  extraFilter?: (s: FcfStat) => boolean;
}

function buildCategories(matchDuration: number): Category[] {
  return [
  {
    key: 'goles',
    label: 'Golejadores',
    icon: '⚽',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'from-emerald-500 to-emerald-700',
    emptyText: 'Cap gol marcat',
  },
  {
    key: 'goles',
    label: `G/${matchDuration} min`,
    icon: '⚡',
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'from-orange-500 to-orange-600',
    emptyText: `Cap jugadora amb ≥${matchDuration} min i gols marcats`,
    computedValue: (s) => Math.round((s.goles / s.minutos) * matchDuration * 100) / 100,
    formatValue: (v) => v.toFixed(2),
    sortAsc: false,
    valueLabel: `G/${matchDuration}`,
    secondaryKey: 'goles',
    secondaryLabel: 'gols',
    extraFilter: (s) => s.minutos >= matchDuration,
  },
  {
    key: 'minutos',
    label: 'Més minuts/titular',
    icon: '⏱️',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'from-blue-500 to-blue-700',
    emptyText: 'Sense minuts',
    secondaryKey: 'titular',
    secondaryLabel: 'tit.',
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
    label: 'Targetes vermelles',
    icon: '🟥',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'from-red-500 to-red-700',
    emptyText: 'Cap targeta vermella',
  },
  ];
}

// ─── Medalles per al podi ─────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

// R1: Estil de la posició per rang
const rankNumStyle = (rank: number) => {
  if (rank === 1) return 'text-yellow-500 font-black text-base';
  if (rank === 2) return 'text-gray-400 font-black text-sm';
  if (rank === 3) return 'text-amber-600 font-black text-sm';
  return 'text-neutral-400 font-bold text-xs';
};

// R1: Padding i mida de text per rang
const rankRowStyle = (rank: number) => {
  if (rank === 1) return 'py-3.5';
  if (rank <= 3)  return 'py-3';
  if (rank <= 10) return 'py-2.5';
  return 'py-2';
};

const rankNameStyle = (rank: number) =>
  rank === 1
    ? 'text-[14px] font-bold'
    : rank <= 3
    ? 'text-[13px] font-semibold'
    : rank >= 11
    ? 'text-[12px] text-neutral-500 dark:text-neutral-400 font-medium'
    : 'text-[13px] font-semibold';

const rankValueStyle = (rank: number) =>
  rank === 1
    ? 'text-base font-black'
    : rank <= 3
    ? 'text-sm font-black'
    : rank >= 11
    ? 'text-xs font-bold'
    : 'text-sm font-black';

const rankTeamStyle = (rank: number) =>
  rank >= 11 ? 'text-[10px] text-neutral-400' : 'text-[11px] text-neutral-400';

// ─── Card d'una categoria ─────────────────────────────────────────────────────

const INITIAL_SHOW = 5;

function CategoryCard({
  category,
  data,
}: {
  category: Category;
  data: FcfStat[];
}) {
  // R3: estat de plegat/desplegat
  const [showAll, setShowAll] = useState(false);

  const getValue = (s: FcfStat): number =>
    category.computedValue ? category.computedValue(s) : (s[category.key] as number);

  const top20 = [...data]
    .filter(s =>
      (s[category.key] as number) > 0 &&
      (!category.extraFilter || category.extraFilter(s))
    )
    .sort((a, b) =>
      category.sortAsc
        ? getValue(a) - getValue(b)
        : getValue(b) - getValue(a)
    )
    .slice(0, 20);

  // R3: elements visibles
  const visibleItems = showAll ? top20 : top20.slice(0, INITIAL_SHOW);
  const hiddenCount  = top20.length - INITIAL_SHOW;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* ── R2: Header amb badge de comptador ─────────────── */}
      <div className={cn('bg-gradient-to-r px-4 py-3 flex items-center gap-2', category.bgColor)}>
        <span className="text-xl">{category.icon}</span>
        <span className="text-white font-black text-xs uppercase tracking-wide whitespace-nowrap">
          {category.label}
        </span>
        {/* R2: badge amb el total de jugadores al rànquing */}
        {top20.length > 0 && (
          <span className="ml-auto bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
            {top20.length}
          </span>
        )}
      </div>

      {/* ── Llista ────────────────────────────────────────── */}
      {top20.length === 0 ? (
        <div className="px-4 py-6 text-center text-neutral-400 text-sm">
          {category.emptyText}
        </div>
      ) : (
        <>
          {visibleItems.map((player, i) => {
            const rank  = i + 1;
            const value = getValue(player);
            const name  = formatPlayerName(player.player_fcf_name);

            return (
              <div key={player.id}>
                {/* R1: Separador visual entre podi (top 3) i la resta */}
                {rank === 4 && (
                  <div className="h-px bg-[var(--card-border)] mx-3 my-0.5" />
                )}
                <div
                  className={cn(
                    'flex items-center gap-3 px-4 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03] border-b border-[var(--card-border)]',
                    // R1: padding per rang
                    rankRowStyle(rank),
                    // R1: fons destacat per al primer lloc
                    rank === 1 && 'bg-yellow-50/60 dark:bg-yellow-900/10'
                  )}
                >
                  {/* Posició / medalla */}
                  <div className={cn('w-6 text-center shrink-0', rankNumStyle(rank))}>
                    {rank <= 3 ? MEDALS[rank - 1] : rank}
                  </div>

                  {/* Nom + equip */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'leading-tight text-[var(--app-text)]',
                        rankNameStyle(rank)
                      )}
                      title={name}
                    >
                      {name}
                    </div>
                    <div
                      className={cn('truncate', rankTeamStyle(rank))}
                      title={player.team_name}
                    >
                      {player.team_name}
                    </div>
                  </div>

                  {/* Valor principal + secundari / etiqueta */}
                  <div className="shrink-0 text-right">
                    <div className={cn('leading-tight', category.color, rankValueStyle(rank))}>
                      {category.formatValue ? category.formatValue(value) : value}
                    </div>
                    {category.valueLabel && (
                      <div className="text-[10px] text-neutral-400 leading-tight">
                        {category.valueLabel}
                      </div>
                    )}
                    {category.secondaryKey && (
                      <div className="text-[10px] text-neutral-400 leading-tight">
                        {player[category.secondaryKey] as number}{' '}
                        {category.secondaryLabel ?? ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* R3: Botó show more / show less */}
          {top20.length > INITIAL_SHOW && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full px-4 py-2 text-[11px] font-semibold text-brand border-t border-[var(--card-border)] hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors text-left"
            >
              {showAll
                ? '↑ Mostrar menys'
                : `Veure els ${top20.length} →`}
              {!showAll && hiddenCount > 0 && (
                <span className="ml-1 text-[10px] font-normal text-neutral-400">
                  (+{hiddenCount})
                </span>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

interface TopTenProps {
  allStats: FcfStat[];
  season: string;
  leagueName: string;
  matchDuration: number;
}

export default function TopTen({ allStats, season, leagueName, matchDuration }: TopTenProps) {
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
        Top 20 jugadores · {leagueName} · {season} ·{' '}
        {new Set(allStats.map(s => s.team_slug)).size} equips ·{' '}
        {allStats.length} jugadores
      </p>

      {/* L3: fade-up al grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
        {buildCategories(matchDuration).map((cat, i) => (
          <CategoryCard key={`${cat.key}-${i}`} category={cat} data={allStats} />
        ))}
      </div>
    </div>
  );
}
