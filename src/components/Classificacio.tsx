/**
 * Classificacio.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista de clasificación de liga (una tabla por grupo). Datos oficiales FCF
 * guardados en fcf_classificacio. Diseño alineado con StatsTable/AllTeamsOverview
 * (ordenable, tokens brand/accent, filas alternas, hint d'ordenació).
 *
 * Nota: la FCF pinta los colores de zona (ascens/descens) en el navegador con
 * JS, no en el HTML, así que no son scrapeables. La tabla se muestra neutra.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ChevronDown, ChevronsUpDown, ChevronUp, MousePointerClick } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import type { ClassificacioRow, League } from '../types';

type SortKey = 'posicio' | 'team_name' | 'pj' | 'guanyats' | 'empatats' | 'perduts' | 'gf' | 'gc' | 'dg' | 'punts';

// ─── Tabla de un grupo ────────────────────────────────────────────────────────

function GroupTable({ rows, onTeamClick }: { rows: ClassificacioRow[]; onTeamClick?: (slug: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('posicio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // posición y nombre ascendente por defecto; el resto descendente
      setSortDir(key === 'posicio' || key === 'team_name' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const val = (r: ClassificacioRow): number | string =>
      sortKey === 'dg' ? r.gf - r.gc :
      sortKey === 'team_name' ? r.team_name :
      (r[sortKey] as number);
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [rows, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="inline ml-0.5 text-neutral-400 dark:text-neutral-500" />;
    return sortDir === 'desc'
      ? <ChevronDown size={13} className="inline ml-0.5 text-accent" strokeWidth={2.5} />
      : <ChevronUp   size={13} className="inline ml-0.5 text-accent" strokeWidth={2.5} />;
  };

  const Th = ({ col, label, left = false, title }: { col: SortKey; label: string; left?: boolean; title?: string }) => (
    <th
      onClick={() => handleSort(col)}
      title={title}
      className={cn(
        'px-2 py-2 text-[11px] font-black uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-[var(--app-text)]',
        left ? 'text-left' : 'text-right',
        sortKey === col ? 'text-[var(--app-text)]' : 'text-neutral-500 dark:text-neutral-400'
      )}
    >
      {label}<SortIcon col={col} />
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[440px]">
        <thead>
          <tr className="border-b border-[var(--card-border)]">
            <Th col="posicio"   label="#"   left title="Posició" />
            <Th col="team_name" label="Equip" left />
            <Th col="pj"        label="PJ"  title="Partits jugats" />
            <Th col="guanyats"  label="G"   title="Guanyats" />
            <Th col="empatats"  label="E"   title="Empatats" />
            <Th col="perduts"   label="P"   title="Perduts" />
            <Th col="gf"        label="GF"  title="Gols a favor" />
            <Th col="gc"        label="GC"  title="Gols en contra" />
            <Th col="dg"        label="DG"  title="Diferència de gols" />
            <Th col="punts"     label="Pts" title="Punts" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const dg = r.gf - r.gc;
            const isOdd = i % 2 !== 0;
            return (
              <tr
                key={r.id}
                onClick={onTeamClick ? () => onTeamClick(r.team_slug) : undefined}
                className={cn(
                  'group border-b border-[var(--card-border)] transition-colors hover:bg-brand/5',
                  onTeamClick && 'cursor-pointer',
                  isOdd ? 'bg-neutral-50 dark:bg-[#272727]' : 'bg-transparent'
                )}
              >
                <td className="px-2 py-2.5 text-left font-bold tabular-nums text-neutral-500 dark:text-neutral-400 w-8">{r.posicio}</td>
                <td className="px-2 py-2.5 text-left font-semibold text-[var(--app-text)] max-w-[200px]">
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="block truncate" title={r.team_name}>{r.team_name}</span>
                    {onTeamClick && (
                      <span className="shrink-0 text-neutral-300 group-hover:text-accent transition-colors text-base leading-none">›</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-800 dark:text-neutral-200">{r.pj}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-800 dark:text-neutral-200">{r.guanyats}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-800 dark:text-neutral-200">{r.empatats}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-800 dark:text-neutral-200">{r.perduts}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.gf}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-red-500 dark:text-red-400">{r.gc}</td>
                <td className={cn(
                  'px-2 py-2.5 text-right tabular-nums font-medium',
                  dg > 0 ? 'text-emerald-600 dark:text-emerald-400' : dg < 0 ? 'text-red-500 dark:text-red-400' : 'text-neutral-500'
                )}>{dg > 0 ? '+' : ''}{dg}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-black text-[15px] text-brand dark:text-white">{r.punts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Classificacio({
  rows,
  leagues,
  season,
  leagueName,
  onTeamClick,
}: {
  rows: ClassificacioRow[];
  leagues: League[];
  season: string;
  leagueName: string;
  onTeamClick?: (slug: string) => void;
}) {
  // Agrupar por league_id (una tabla por grupo). Ordenar grupos por sort_order.
  const groups = useMemo(() => {
    const byLeague = new Map<string, ClassificacioRow[]>();
    for (const r of rows) {
      if (!byLeague.has(r.league_id)) byLeague.set(r.league_id, []);
      byLeague.get(r.league_id)!.push(r);
    }
    const meta = new Map(leagues.map(l => [l.id, l]));
    return [...byLeague.entries()]
      .map(([leagueId, groupRows]) => ({
        leagueId,
        name: meta.get(leagueId)?.short_name ?? meta.get(leagueId)?.name ?? '',
        sortOrder: meta.get(leagueId)?.sort_order ?? 999,
        rows: groupRows,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [rows, leagues]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <div className="text-5xl">📋</div>
        <p className="text-[16px] font-bold text-[var(--app-text)]">Encara no hi ha classificació per a {season}</p>
        <p className="text-[13.5px] text-neutral-500 dark:text-neutral-400 max-w-[340px] mx-auto leading-relaxed">
          {leagueName} · {season}. La classificació s'actualitza cada dilluns amb les dades oficials de la FCF.
        </p>
      </div>
    );
  }

  const lastSync = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at);
  const days = Math.floor((Date.now() - new Date(lastSync).getTime()) / 86_400_000);
  const showGroupNames = groups.length > 1;

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400">
        Classificació oficial · {leagueName} · {season}
        {days >= 0 ? ` · actualitzada fa ${days} ${days === 1 ? 'dia' : 'dies'}` : ''}
      </p>

      {groups.map(g => (
        <div key={g.leagueId}>
          {showGroupNames && (
            <div className="flex items-center gap-2 mb-2 border-l-2 border-brand pl-2">
              <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                {g.name}
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{g.rows.length} equips</span>
            </div>
          )}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
            <GroupTable rows={g.rows} onTeamClick={onTeamClick} />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-300">
        <span className="flex items-center gap-1.5">
          <ChevronsUpDown size={15} className="text-accent" strokeWidth={2.5} />
          Clica una columna per ordenar
        </span>
        {onTeamClick && (
          <span className="flex items-center gap-1.5">
            <MousePointerClick size={15} className="text-accent" strokeWidth={2.5} />
            Clica un equip per veure les jugadores
          </span>
        )}
      </div>
    </div>
  );
}
