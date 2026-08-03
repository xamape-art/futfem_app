import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
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
import { Goal, UserRound, type LucideIcon } from 'lucide-react';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfGoal, FcfStat } from '../types';

interface Props {
  allStats: FcfStat[];
  goals: FcfGoal[];
  season: string;
  leagueName: string;
  matchDuration: number;
  minutesReliable: boolean;
  onViewTop20?: () => void;
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
        color: teamColorMap[s.team_slug] ?? '#224E77',
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
  placeholder = 'Selecciona jugadora',
}: {
  players: FcfStat[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
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
          {selected ? `${formatPlayerName(selected.player_fcf_name)} — ${selected.team_name}` : placeholder}
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

  const [idA, setIdA] = useState<string>(players[0]?.id ?? '');
  const [idB, setIdB] = useState<string>('');
  const playerA = players.find(p => p.id === idA) ?? players[0];
  const playerB = idB ? players.find(p => p.id === idB) ?? null : null;

  const BRAND = 'var(--color-brand)';
  const ACCENT = 'var(--color-accent)';

  const dataA = playerA ? buildRadarData(playerA, allStats, matchDuration, minutesReliable) : [];
  const dataB = playerB ? buildRadarData(playerB, allStats, matchDuration, minutesReliable) : null;

  if (!playerA) return null;

  const chartData = dataA.map((d, i) => ({ axis: d.axis, a: d.value, b: dataB ? dataB[i].value : undefined }));

  const statItems = (p: FcfStat) => (minutesReliable
    ? [
        { label: 'Partits', value: p.partidos },
        { label: 'Minuts', value: p.minutos },
        { label: 'Gols', value: p.goles },
        { label: `G/${matchDuration}`, value: p.minutos >= matchDuration ? ((p.goles / p.minutos) * matchDuration).toFixed(2) : '—' },
        { label: '🟨', value: p.amarillas },
        { label: '🟥', value: p.rojas },
      ]
    : [
        { label: 'Titular', value: p.titular },
        { label: 'Suplent', value: p.suplente },
        { label: 'Gols', value: p.goles },
        { label: 'G/partit', value: p.partidos > 0 ? (p.goles / p.partidos).toFixed(2) : '—' },
        { label: '🟨', value: p.amarillas },
        { label: '🟥', value: p.rojas },
      ]) as { label: string; value: string | number }[];

  const StatRow = ({ p, color }: { p: FcfStat; color: string }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="flex items-center gap-1.5 text-[12px] font-bold truncate max-w-[240px]"
        style={{ color }}
        title={`${formatPlayerName(p.player_fcf_name)} — ${p.team_name}`}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        {formatPlayerName(p.player_fcf_name)}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {statItems(p).map(it => (
          <div key={it.label} className="bg-neutral-100 dark:bg-white/10 rounded-lg px-2.5 py-1 text-center min-w-[50px]">
            <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{it.label}</div>
            <div className="text-[13px] font-bold text-[var(--app-text)] tabular-nums">{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h3 className="text-[16px] font-bold text-[var(--app-text)]">{playerB ? 'Comparativa de jugadores' : 'Perfil de jugadora'}</h3>
          <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-1">
            Percentil respecte a tota la lliga · 100 = millor que ningú
          </p>
        </div>
        <div className="flex flex-col gap-1.5 w-full sm:w-auto">
          <PlayerCombobox players={players} selectedId={idA} onSelect={setIdA} />
          <div className="flex items-center gap-1.5">
            <PlayerCombobox players={players} selectedId={idB} onSelect={setIdB} placeholder="＋ Comparar amb…" />
            {idB && (
              <button
                onClick={() => setIdB('')}
                className="shrink-0 text-neutral-400 hover:text-[var(--app-text)] px-1 text-[14px]"
                title="Treure comparació"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats de la/les jugadora/es */}
      <div className="space-y-2 mb-4">
        <StatRow p={playerA} color={BRAND} />
        {playerB && <StatRow p={playerB} color={ACCENT} />}
      </div>

      <ResponsiveContainer width="100%" height={330}>
        <RadarChart data={chartData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
          <PolarGrid stroke="#94a3b8" strokeOpacity={0.55} strokeWidth={1.25} />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 13, fontWeight: 600, fill: '#64748b' }} />
          <Radar name={formatPlayerName(playerA.player_fcf_name)} dataKey="a" stroke={BRAND} fill={BRAND} fillOpacity={playerB ? 0.15 : 0.25} strokeWidth={2} />
          {playerB && (
            <Radar name={formatPlayerName(playerB.player_fcf_name)} dataKey="b" stroke={ACCENT} fill={ACCENT} fillOpacity={0.15} strokeWidth={2} />
          )}
          <Tooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const axis = (payload[0] as { payload?: { axis?: string } })?.payload?.axis;
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="font-bold text-[var(--app-text)] mb-1">{axis}</p>
                  {payload.map((pl) => (
                    <p key={String(pl.dataKey)} className="font-semibold" style={{ color: (pl as { stroke?: string; color?: string }).stroke ?? pl.color }}>
                      {pl.name}: percentil {pl.value}
                    </p>
                  ))}
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

// ─── Capçalera de secció ──────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-4 w-1 rounded-full bg-accent shrink-0" />
      <Icon size={16} className="text-accent shrink-0" strokeWidth={2.5} />
      <h2 className="text-[14px] font-black uppercase tracking-[0.08em] text-[var(--app-text)]">{title}</h2>
      <span className="flex-1 h-px bg-[var(--card-border)]" />
    </div>
  );
}

// Mini-rànquing compacte (top 5) reutilitzable
function MiniRank({ title, rows, valueClass }: {
  title: string;
  rows: { name: string; team: string; value: string; sub?: string }[];
  valueClass: string;
}) {
  return (
    <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      <div className="px-3.5 py-2 text-[11px] font-black uppercase tracking-wide text-neutral-500 dark:text-neutral-400 border-b border-[var(--card-border)]">
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={r.name + r.team} className={cn('flex items-center gap-2.5 px-3.5 py-2', i > 0 && 'border-t border-[var(--card-border)]')}>
          <span className="w-4 text-[11px] font-bold text-neutral-400 tabular-nums shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--app-text)] truncate">{r.name}</div>
            <div className="text-[10.5px] text-neutral-500 dark:text-neutral-400 truncate">{r.team}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className={cn('text-[13px] font-black tabular-nums', valueClass)}>{r.value}</div>
            {r.sub && <div className="text-[9.5px] text-neutral-400">{r.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Anàlisi de gols (tipus + top compactes + per minut + penals) ─────────────

function GoalsAnalysis({ goals, allStats, matchDuration, minutesReliable, onViewTop20 }: {
  goals: FcfGoal[];
  allStats: FcfStat[];
  matchDuration: number;
  minutesReliable: boolean;
  onViewTop20?: () => void;
}) {
  // Distribució per minut (trams de 15' que respecten cada part: cap tram creua
  // el descans del minut matchDuration/2, p. ex. 45').
  const dist = useMemo(() => {
    const half = Math.round(matchDuration / 2);
    const STEP = 15;
    const ranges: { from: number; to: number; count: number }[] = [];
    const build = (start: number, end: number) => {
      let a = start;
      while (a < end) { const to = Math.min(a + STEP, end); ranges.push({ from: a + 1, to, count: 0 }); a = to; }
    };
    build(0, half);
    build(half, matchDuration);
    let extra = 0, sense = 0;
    for (const g of goals) {
      const m = g.minute;
      if (m == null) { sense++; continue; }
      if (m > matchDuration) { extra++; continue; }
      const r = ranges.find(x => m <= x.to) ?? ranges[ranges.length - 1];
      r.count++;
    }
    const data = ranges.map(r => ({ label: `${r.from}–${r.to}`, count: r.count }));
    if (extra > 0) data.push({ label: `${matchDuration}+`, count: extra });
    return { data, sense, half };
  }, [goals, matchDuration]);
  const maxCount = Math.max(...dist.data.map(d => d.count), 1);

  // Tipus de gol
  const types = useMemo(() => {
    let normal = 0, penal = 0, pp = 0;
    for (const g of goals) {
      if (g.goal_type === 'penal') penal++;
      else if (g.goal_type === 'pp') pp++;
      else normal++;
    }
    return { normal, penal, pp, total: goals.length };
  }, [goals]);
  const pct = (n: number) => (types.total ? Math.round((n / types.total) * 100) : 0);

  // Ranking de penals
  const penalRanking = useMemo(() => {
    const map = new Map<string, { name: string; team: string; count: number }>();
    for (const g of goals) {
      if (g.goal_type !== 'penal' || !g.player_fcf_name) continue;
      const key = `${g.player_fcf_name}|${g.team_name ?? ''}`;
      const e = map.get(key) ?? { name: formatPlayerName(g.player_fcf_name), team: g.team_name ?? '', count: 0 };
      e.count++;
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [goals]);

  // Top compactes (des de fcf_stats agregat)
  const topScorers = useMemo(() =>
    [...allStats].filter(s => s.goles > 0).sort((a, b) => b.goles - a.goles).slice(0, 5),
    [allStats]);
  const topG90 = useMemo(() =>
    [...allStats]
      .filter(s => s.goles > 0 && s.minutos >= matchDuration)
      .map(s => ({ s, g90: (s.goles / s.minutos) * matchDuration }))
      .sort((a, b) => b.g90 - a.g90)
      .slice(0, 5),
    [allStats, matchDuration]);

  return (
    <div>
      <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mb-4">
        {types.total} gols · repartiment, quan es marquen i qui transforma els penals
      </p>

      {/* Tipus de gol */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { k: 'Normal', n: types.normal, cls: 'text-emerald-600 dark:text-emerald-400' },
          { k: 'Penal', n: types.penal, cls: 'text-blue-600 dark:text-blue-400' },
          { k: 'Pròpia porta', n: types.pp, cls: 'text-red-600 dark:text-red-400' },
        ].map(t => (
          <div key={t.k} className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-xl py-3 px-2 text-center">
            <div className={cn('text-[24px] font-extrabold leading-none tabular-nums', t.cls)}>{t.n}</div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mt-1.5">{t.k}</div>
            <div className="text-[10.5px] text-neutral-400 mt-0.5 tabular-nums">{pct(t.n)}%</div>
          </div>
        ))}
      </div>

      {/* Top compactes: golejadores + G/min */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[13.5px] font-bold text-[var(--app-text)]">Màximes golejadores</h4>
          {onViewTop20 && (
            <button onClick={onViewTop20} className="text-[12px] font-bold text-accent hover:underline">
              Veure Top 20 →
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MiniRank
            title="Gols"
            valueClass="text-emerald-600 dark:text-emerald-400"
            rows={topScorers.map(s => ({ name: formatPlayerName(s.player_fcf_name), team: s.team_name, value: String(s.goles) }))}
          />
          {minutesReliable && topG90.length > 0 && (
            <MiniRank
              title={`G/${matchDuration} min`}
              valueClass="text-orange-500 dark:text-orange-400"
              rows={topG90.map(({ s, g90 }) => ({ name: formatPlayerName(s.player_fcf_name), team: s.team_name, value: g90.toFixed(2), sub: `${s.goles} gols` }))}
            />
          )}
        </div>
      </div>

      {/* Distribució per minut */}
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-[13.5px] font-bold text-[var(--app-text)]">Gols per minut</h4>
        {dist.sense > 0 && <span className="text-[11px] text-neutral-400">{dist.sense} sense minut</span>}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dist.data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#6b7280' }} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--card-border)', fillOpacity: 0.3 }}
            content={({ payload, label }) => {
              if (!payload?.length) return null;
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="font-bold text-[var(--app-text)]">Minut {label}</p>
                  <p className="text-brand font-semibold">{payload[0].value} gols</p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {dist.data.map((d, i) => (
              <Cell key={i} fill={d.count === maxCount ? 'var(--color-accent)' : 'var(--color-brand)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Ranking de penals — compacte, mitja amplada */}
      {penalRanking.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MiniRank
            title="Màximes de penal"
            valueClass="text-blue-600 dark:text-blue-400"
            rows={penalRanking.map(p => ({ name: p.name, team: p.team, value: String(p.count) }))}
          />
        </div>
      )}
    </div>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export default function Charts({ allStats, goals, season, leagueName, matchDuration, minutesReliable, onViewTop20 }: Props) {
  if (allStats.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-500 dark:text-neutral-400 text-sm">
        Sense dades per a {leagueName} · {season}
      </div>
    );
  }

  const card = 'bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm';

  return (
    <div className="space-y-8">
      <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400">
        Anàlisi visual · {leagueName} · {season} ·{' '}
        {new Set(allStats.map(s => s.team_slug)).size} equips ·{' '}
        {allStats.length} jugadores
      </p>

      {/* ── Bloc JUGADORES (primer) ── */}
      <section className="space-y-4">
        <SectionHeader icon={UserRound} title="Jugadores" />
        {minutesReliable && (
          <div className={card}>
            <ScatterMinutsGols allStats={allStats} matchDuration={matchDuration} />
          </div>
        )}
        <div className={card}>
          <RadarJugadora allStats={allStats} matchDuration={matchDuration} minutesReliable={minutesReliable} />
        </div>
      </section>

      {/* ── Bloc GOLS (només si hi ha detall de gols) ── */}
      {goals.length > 0 && (
        <section className="space-y-4">
          <SectionHeader icon={Goal} title="Gols" />
          <div className={card}>
            <GoalsAnalysis
              goals={goals}
              allStats={allStats}
              matchDuration={matchDuration}
              minutesReliable={minutesReliable}
              onViewTop20={onViewTop20}
            />
          </div>
        </section>
      )}
    </div>
  );
}
