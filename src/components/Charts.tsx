import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

interface Props {
  allStats: FcfStat[];
  season: string;
  leagueName: string;
  matchDuration: number;
  minutesReliable: boolean;
}

// ─── Scatter: Minuts vs Gols ──────────────────────────────────────────────────

const TEAM_COLORS = [
  '#7c3aed','#059669','#dc2626','#2563eb','#d97706',
  '#db2777','#0891b2','#65a30d','#c2410c','#4338ca',
  '#0d9488','#9333ea','#ea580c','#16a34a','#9f1239',
  '#1d4ed8','#b45309','#0e7490','#6d28d9','#374151',
];

function ScatterMinutsGols({ allStats, matchDuration }: { allStats: FcfStat[]; matchDuration: number }) {
  const teamColorMap = useMemo(() => {
    const teams = [...new Set(allStats.map(s => s.team_slug))].sort();
    const map: Record<string, string> = {};
    teams.forEach((slug, i) => { map[slug] = TEAM_COLORS[i % TEAM_COLORS.length]; });
    return map;
  }, [allStats]);

  const data = useMemo(() =>
    allStats
      .filter(s => s.minutos >= matchDuration && s.goles > 0)
      .map(s => ({
        x: s.minutos,
        y: s.goles,
        name: formatPlayerName(s.player_fcf_name),
        team: s.team_name,
        partits: s.partidos,
        gx: ((s.goles / s.minutos) * matchDuration).toFixed(2),
        color: teamColorMap[s.team_slug] ?? '#1A3A5C',
        id: s.id,
      })),
    [allStats, matchDuration, teamColorMap]
  );

  // Línia de referència G/matchDuration = 1.0
  const maxMin = Math.max(...data.map(d => d.x), 200);
  const refY = Math.round(maxMin / matchDuration);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-neutral-500 dark:text-neutral-400 text-sm">
        Sense jugadores amb ≥{matchDuration} min i gols marcats
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[16px] font-bold text-[var(--app-text)]">Minuts jugats vs Gols</h3>
          <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-1">
            Cada punt és una jugadora (≥{matchDuration} min) · La línia diagonal = 1 gol cada {matchDuration} min
          </p>
        </div>
        <span className="text-[12.5px] font-semibold text-neutral-500 dark:text-neutral-400 shrink-0">{data.length} jugadores</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Minuts"
            label={{ value: 'Minuts jugats', position: 'insideBottom', offset: -10, fontSize: 13, fill: '#6b7280' }}
            tick={{ fontSize: 12.5, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Gols"
            label={{ value: 'Gols', angle: -90, position: 'insideLeft', offset: 10, fontSize: 13, fill: '#6b7280' }}
            tick={{ fontSize: 12.5, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          {/* Línia de referència G/90 = 1.0 */}
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxMin, y: refY }]}
            stroke="#d1d5db"
            strokeDasharray="4 3"
            label={{ value: `1 G/${matchDuration}`, position: 'insideTopRight', fontSize: 12, fill: '#6b7280' }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="font-bold text-[var(--app-text)] mb-1">{d.name}</p>
                  <p className="truncate max-w-[180px] font-semibold" style={{ color: d.color }}>{d.team}</p>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{d.y} gols</span>
                    <span className="text-blue-500 font-semibold">{d.x} min</span>
                    <span className="text-orange-500 font-semibold">{d.gx} G/{matchDuration}</span>
                  </div>
                  <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">{d.partits} partits</p>
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              return <circle cx={cx} cy={cy} r={5} fill={payload.color} fillOpacity={0.8} />;
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Radar: Perfil de jugadora ────────────────────────────────────────────────

// Rang percentil (0-100): quin % de la lliga té un valor inferior a `value`.
// Amb midrank per als empats. Monòton i sense saturació: 0.87 i 1.36 G/90
// donen valors diferents segons la seva posició real dins la distribució.
function percentileRank(allVals: number[], value: number): number {
  const n = allVals.length;
  if (n === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of allVals) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return Math.round(((below + equal / 2) / n) * 100);
}

// Eixos amb minuts fiables (Tercera Federació)
const RADAR_AXES_FULL = [
  { key: 'disponibilitat', label: 'Disponibilitat', invert: false },
  { key: 'goleig',        label: 'Definició',      invert: false },
  { key: 'participacio',  label: 'Participació',   invert: false },
  { key: 'consistencia',  label: 'Consistència',   invert: false },
  { key: 'disciplina',    label: 'Disciplina',     invert: true  },
];

// Eixos només amb dades verificables (sense minuts): titularitats, gols/partit…
const RADAR_AXES_BASIC = [
  { key: 'participacio', label: 'Participació', invert: false },
  { key: 'titularitat',  label: 'Titularitat',  invert: false },
  { key: 'golejadora',   label: 'Definició',    invert: false },
  { key: 'disciplina',   label: 'Disciplina',   invert: true  },
];

function buildRadarData(player: FcfStat, allStats: FcfStat[], matchDuration: number, minutesReliable: boolean) {
  if (minutesReliable) {
    const vals = buildRadarValuesFull(allStats, matchDuration);
    const playerVals = {
      disponibilitat: player.partidos > 0 ? player.minutos / player.partidos : 0,
      goleig:         player.minutos >= matchDuration ? (player.goles / player.minutos) * matchDuration : 0,
      participacio:   player.partidos,
      consistencia:   player.partidos > 0 ? Math.min(player.minutos / (player.partidos * matchDuration), 1) : 0,
      disciplina:     player.partidos > 0 ? (player.amarillas + player.rojas * 3) / player.partidos : 0,
    };
    return RADAR_AXES_FULL.map(axis => {
      const rank = percentileRank(vals[axis.key as keyof typeof vals], playerVals[axis.key as keyof typeof playerVals]);
      return { axis: axis.label, value: axis.invert ? 100 - rank : rank };
    });
  }

  const vals = buildRadarValuesBasic(allStats);
  const app = player.titular + player.suplente; // convocatòries
  const playerVals = {
    participacio: app,
    titularitat:  app > 0 ? player.titular / app : 0,
    golejadora:   player.partidos > 0 ? player.goles / player.partidos : 0,
    disciplina:   app > 0 ? (player.amarillas + player.rojas * 3) / app : 0,
  };
  return RADAR_AXES_BASIC.map(axis => {
    const rank = percentileRank(vals[axis.key as keyof typeof vals], playerVals[axis.key as keyof typeof playerVals]);
    return { axis: axis.label, value: axis.invert ? 100 - rank : rank };
  });
}

function buildRadarValuesFull(allStats: FcfStat[], matchDuration: number) {
  const rows = allStats.filter(s => s.partidos > 0);
  return {
    disponibilitat: rows.map(s => s.partidos > 0 ? s.minutos / s.partidos : 0),
    goleig:         rows.map(s => s.minutos >= matchDuration ? (s.goles / s.minutos) * matchDuration : 0),
    participacio:   rows.map(s => s.partidos),
    consistencia:   rows.map(s => s.partidos > 0 ? Math.min(s.minutos / (s.partidos * matchDuration), 1) : 0),
    disciplina:     rows.map(s => s.partidos > 0 ? (s.amarillas + s.rojas * 3) / s.partidos : 0),
  };
}

function buildRadarValuesBasic(allStats: FcfStat[]) {
  const rows = allStats.filter(s => (s.titular + s.suplente) > 0);
  return {
    participacio: rows.map(s => s.titular + s.suplente),
    titularitat:  rows.map(s => { const a = s.titular + s.suplente; return a > 0 ? s.titular / a : 0; }),
    golejadora:   rows.map(s => s.partidos > 0 ? s.goles / s.partidos : 0),
    disciplina:   rows.map(s => { const a = s.titular + s.suplente; return a > 0 ? (s.amarillas + s.rojas * 3) / a : 0; }),
  };
}

// ─── Combobox amb cerca + filtre d'equip ─────────────────────────────────────

function PlayerCombobox({
  players,
  selectedId,
  onSelect,
}: {
  players: FcfStat[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = players.find(p => p.id === selectedId);

  // Tanca en click fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Equips únics
  const teams = useMemo(() => {
    const seen = new Set<string>();
    const list: { slug: string; name: string }[] = [];
    for (const p of players) {
      if (!seen.has(p.team_slug)) {
        seen.add(p.team_slug);
        list.push({ slug: p.team_slug, name: p.team_name });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  // Jugadores filtrades
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return players.filter(p => {
      const matchTeam = !teamFilter || p.team_slug === teamFilter;
      const matchQuery = !q ||
        p.player_fcf_name.toLowerCase().includes(q) ||
        p.team_name.toLowerCase().includes(q);
      return matchTeam && matchQuery;
    }).slice(0, 50);
  }, [players, query, teamFilter]);

  return (
    <div ref={ref} className="relative w-full max-w-[340px] shrink-0">
      {/* Input */}
      <button
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="w-full flex items-center justify-between gap-2 text-[13px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-[var(--app-text)] hover:border-brand transition-colors text-left"
      >
        <span className="truncate">
          {selected ? `${formatPlayerName(selected.player_fcf_name)} — ${selected.team_name}` : 'Selecciona jugadora'}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Cerca */}
          <div className="p-2 border-b border-[var(--card-border)]">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cercar jugadora o equip..."
              className="w-full text-[12px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-[var(--app-text)] placeholder-neutral-400 focus:outline-none focus:border-brand"
            />
          </div>

          {/* Filtre d'equips */}
          <div className="relative border-b border-[var(--card-border)]">
            <div className="flex flex-wrap gap-1.5 px-2 py-2">
              <button
                onClick={() => setTeamFilter('')}
                className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                  !teamFilter
                    ? 'bg-brand text-white border-brand'
                    : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
                }`}
              >
                Tots
              </button>
              {teams.map(t => (
                <button
                  key={t.slug}
                  onClick={() => setTeamFilter(t.slug === teamFilter ? '' : t.slug)}
                  title={t.name}
                  className={`shrink-0 max-w-[110px] truncate px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                    teamFilter === t.slug
                      ? 'bg-brand text-white border-brand'
                      : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Llista de jugadores */}
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-neutral-500 dark:text-neutral-400">Sense resultats</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 hover:bg-brand/5 transition-colors border-b border-[var(--card-border)] last:border-0 ${
                    p.id === selectedId ? 'bg-brand/10' : ''
                  }`}
                >
                  <div className="text-[12px] font-semibold text-[var(--app-text)] truncate">
                    {formatPlayerName(p.player_fcf_name)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{p.team_name}</span>
                    <span className="text-[10px] text-neutral-500 shrink-0">{p.partidos}P</span>
                    {p.goles > 0 && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">{p.goles}G</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Radar de jugadora ────────────────────────────────────────────────────────

function RadarJugadora({ allStats, matchDuration, minutesReliable }: { allStats: FcfStat[]; matchDuration: number; minutesReliable: boolean }) {
  const players = useMemo(() =>
    [...allStats]
      .filter(s => (s.titular + s.suplente) > 0)
      .sort((a, b) => b.goles - a.goles || b.titular - a.titular),
    [allStats]
  );

  const [selectedId, setSelectedId] = useState<string>(players[0]?.id ?? '');
  const player = players.find(p => p.id === selectedId) ?? players[0];

  if (!player) return null;

  const radarData = buildRadarData(player, allStats, matchDuration, minutesReliable);

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h3 className="text-[16px] font-bold text-[var(--app-text)]">Perfil de jugadora</h3>
          <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-1">
            Percentil respecte a tota la lliga · 100 = millor que ningú
          </p>
        </div>
        <PlayerCombobox
          players={players}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Info de la jugadora seleccionada */}
      <div className="flex flex-wrap gap-2.5 mb-4">
        {(
          (minutesReliable
            ? [
                { label: 'Equip',    value: player.team_name, wide: true },
                { label: 'Partits',  value: player.partidos },
                { label: 'Minuts',   value: player.minutos },
                { label: 'Gols',     value: player.goles },
                { label: `G/${matchDuration}`, value: player.minutos >= matchDuration ? ((player.goles / player.minutos) * matchDuration).toFixed(2) : '—' },
                { label: '🟨 TA',    value: player.amarillas },
                { label: '🟥 TR',    value: player.rojas },
              ]
            : [
                { label: 'Equip',    value: player.team_name, wide: true },
                { label: 'Titular',  value: player.titular },
                { label: 'Suplent',  value: player.suplente },
                { label: 'Gols',     value: player.goles },
                { label: 'G/partit', value: player.partidos > 0 ? (player.goles / player.partidos).toFixed(2) : '—' },
                { label: '🟨 TA',    value: player.amarillas },
                { label: '🟥 TR',    value: player.rojas },
              ]) as { label: string; value: string | number; wide?: boolean }[]
        ).map(item => (
          <div
            key={item.label}
            className={cn(
              'bg-neutral-100 dark:bg-white/10 rounded-lg px-3 py-2',
              item.wide ? 'text-left flex-1 min-w-[150px] max-w-[300px]' : 'text-center'
            )}
          >
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{item.label}</div>
            <div className={cn('text-[14px] font-bold text-[var(--app-text)]', item.wide && 'truncate')}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={330}>
        <RadarChart data={radarData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
          <PolarGrid stroke="#94a3b8" strokeOpacity={0.55} strokeWidth={1.25} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 13, fontWeight: 600, fill: '#64748b' }}
          />
          <Radar
            dataKey="value"
            stroke="var(--color-brand)"
            fill="var(--color-brand)"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0];
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="font-bold text-[var(--app-text)]">{d.payload.axis}</p>
                  <p className="text-brand font-semibold">Percentil {d.value}</p>
                  <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">Millor que el {d.value}% de la lliga</p>
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {(minutesReliable
          ? [
              { label: 'Disponibilitat', desc: 'Minuts per partit jugat' },
              { label: 'Definició',     desc: `Gols per ${matchDuration} minuts jugats (G/${matchDuration})` },
              { label: 'Participació',  desc: 'Total de partits jugats a la lliga' },
              { label: 'Consistència',  desc: `Minuts jugats sobre el total disponible (partits × ${matchDuration})` },
              { label: 'Disciplina',    desc: 'Menys targetes = valor més alt' },
            ]
          : [
              { label: 'Participació', desc: 'Convocatòries (titular + suplent)' },
              { label: 'Titularitat',  desc: 'Proporció de partits com a titular' },
              { label: 'Definició',    desc: 'Gols per partit jugat (titular)' },
              { label: 'Disciplina',   desc: 'Menys targetes = valor més alt' },
            ]
        ).map(item => (
          <div key={item.label} className="flex items-baseline gap-1.5">
            <span className="text-[12.5px] font-bold text-brand shrink-0">{item.label}:</span>
            <span className="text-[12.5px] text-neutral-500 dark:text-neutral-400">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export default function Charts({ allStats, season, leagueName, matchDuration, minutesReliable }: Props) {
  if (allStats.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-500 dark:text-neutral-400 text-sm">
        Sense dades per a {leagueName} · {season}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400">
        Anàlisi visual · {leagueName} · {season} ·{' '}
        {new Set(allStats.map(s => s.team_slug)).size} equips ·{' '}
        {allStats.length} jugadores
      </p>

      {/* El scatter minuts/gols només té sentit amb minuts reals (Tercera Federació) */}
      {minutesReliable && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
          <ScatterMinutsGols allStats={allStats} matchDuration={matchDuration} />
        </div>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
        <RadarJugadora allStats={allStats} matchDuration={matchDuration} minutesReliable={minutesReliable} />
      </div>
    </div>
  );
}
