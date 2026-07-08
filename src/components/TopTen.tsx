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

import { ArrowRightLeft, ChevronDown, ChevronUp, Clock, Goal, RectangleVertical, Zap, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

// ─── Configuració de categories ───────────────────────────────────────────────

interface Category {
  key: keyof FcfStat;
  label: string;
  icon: LucideIcon;
  color: string;
  iconColor: string;   // color de la icona dins el badge blanc
  bgColor: string;
  fillIcon?: boolean;  // icona plena (per a targetes grogues/vermelles)
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
    icon: Goal,
    color: 'text-emerald-600 dark:text-emerald-400',
    iconColor: 'text-emerald-600',
    bgColor: 'from-emerald-400 to-emerald-600',
    emptyText: 'Cap gol marcat',
  },
  {
    key: 'goles',
    label: `G/${matchDuration} min`,
    icon: Zap,
    color: 'text-orange-500 dark:text-orange-400',
    iconColor: 'text-orange-600',
    bgColor: 'from-orange-400 to-orange-600',
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
    icon: Clock,
    color: 'text-blue-600 dark:text-blue-400',
    iconColor: 'text-blue-600',
    bgColor: 'from-blue-400 to-blue-600',
    emptyText: 'Sense minuts',
    secondaryKey: 'titular',
    secondaryLabel: 'tit.',
  },
  {
    key: 'suplente',
    label: 'Més suplències',
    icon: ArrowRightLeft,
    color: 'text-amber-600 dark:text-amber-400',
    iconColor: 'text-amber-600',
    bgColor: 'from-amber-400 to-amber-600',
    emptyText: 'Sense suplències',
  },
  {
    key: 'amarillas',
    label: 'Targetes grogues',
    icon: RectangleVertical,
    color: 'text-yellow-600 dark:text-yellow-400',
    iconColor: 'text-yellow-500',
    bgColor: 'from-yellow-400 to-yellow-600',
    fillIcon: true,
    emptyText: 'Cap targeta groga',
  },
  {
    key: 'rojas',
    label: 'Targetes vermelles',
    icon: RectangleVertical,
    color: 'text-red-600 dark:text-red-400',
    iconColor: 'text-red-600',
    bgColor: 'from-red-400 to-red-600',
    fillIcon: true,
    emptyText: 'Cap targeta vermella',
  },
  ];
}

// ─── Badge de posició metàl·lic (or / plata / bronze) ─────────────────────────

const PODIUM_STYLE: Record<number, string> = {
  1: 'bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-600 text-amber-950 ring-white/50',
  2: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 text-slate-800 ring-white/50',
  3: 'bg-gradient-to-br from-orange-200 via-amber-500 to-amber-800 text-white ring-white/40',
};

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <div className="w-6 h-6 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400 text-[11px] font-bold shrink-0 tabular-nums">
        {rank}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-black shrink-0 tabular-nums shadow-sm ring-1 ring-inset',
        PODIUM_STYLE[rank]
      )}
    >
      {rank}
    </div>
  );
}

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
  rank >= 11
    ? 'text-[10px] text-neutral-500 dark:text-neutral-400'
    : 'text-[11px] text-neutral-500 dark:text-neutral-400';

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

  const Icon = category.icon;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* ── R2: Header amb icona en badge blanc + comptador ─── */}
      <div className={cn('bg-gradient-to-r px-4 py-3 flex items-center gap-2.5', category.bgColor)}>
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm shrink-0">
          <Icon
            size={16}
            strokeWidth={2.5}
            className={category.iconColor}
            fill={category.fillIcon ? 'currentColor' : 'none'}
          />
        </span>
        <span className="flex-1 min-w-0 truncate text-white font-black text-xs uppercase tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">
          {category.label}
        </span>
        {/* R2: badge amb el total de jugadores al rànquing */}
        {top20.length > 0 && (
          <span className="shrink-0 ml-1 bg-black/25 text-white text-[10px] font-bold px-2 py-0.5 rounded-full [text-shadow:0_1px_1px_rgba(0,0,0,0.2)]">
            {top20.length}
          </span>
        )}
      </div>

      {/* ── Llista ────────────────────────────────────────── */}
      {top20.length === 0 ? (
        <div className="px-4 py-6 text-center text-neutral-500 dark:text-neutral-400 text-sm">
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
                  {/* Posició / medalla metàl·lica */}
                  <RankBadge rank={rank} />

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
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                        {category.valueLabel}
                      </div>
                    )}
                    {category.secondaryKey && (
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                        {player[category.secondaryKey] as number}{' '}
                        {category.secondaryLabel ?? ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* R3: Botó show more / show less — CTA de peu destacada */}
          {top20.length > INITIAL_SHOW && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-[13px] font-bold text-accent bg-accent/[0.07] hover:bg-accent/[0.14] border-t border-[var(--card-border)] transition-colors"
            >
              {showAll ? (
                <>
                  Mostrar menys
                  <ChevronUp size={15} strokeWidth={2.5} />
                </>
              ) : (
                <>
                  Veure les {top20.length} jugadores
                  <ChevronDown size={15} strokeWidth={2.5} />
                  {hiddenCount > 0 && (
                    <span className="ml-0.5 bg-accent/15 text-accent text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                      +{hiddenCount}
                    </span>
                  )}
                </>
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
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-5">
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
