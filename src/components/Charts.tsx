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
import { formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

interface Props {
  allStats: FcfStat[];
  season: string;
  leagueName: string;
  matchDuration: number;
}

// ─── Scatter: Minuts vs Gols ──────────────────────────────────────────────────

function ScatterMinutsGols({ allStats, matchDuration }: { allStats: FcfStat[]; matchDuration: number }) {
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
        id: s.id,
      })),
    [allStats, matchDuration]
  );

  // Línia de referència G/matchDuration = 1.0
  const maxMin = Math.max(...data.map(d => d.x), 200);
  const refY = Math.round(maxMin / matchDuration);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-neutral-400 text-sm">
        Sense jugadores amb ≥{matchDuration} min i gols marcats
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[13px] font-bold text-[var(--app-text)]">Minuts jugats vs Gols</h3>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Cada punt és una jugadora (≥{matchDuration} min) · La línia diagonal = 1 gol cada {matchDuration} min
          </p>
        </div>
        <span className="text-[11px] text-neutral-400 shrink-0">{data.length} jugadores</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Minuts"
            label={{ value: 'Minuts jugats', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#9ca3af' }}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Gols"
            label={{ value: 'Gols', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#9ca3af' }}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          {/* Línia de referència G/90 = 1.0 */}
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxMin, y: refY }]}
            stroke="#d1d5db"
            strokeDasharray="4 3"
            label={{ value: `1 G/${matchDuration}`, position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="font-bold text-[var(--app-text)] mb-1">{d.name}</p>
                  <p className="text-neutral-400 truncate max-w-[180px]">{d.team}</p>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{d.y} gols</span>
                    <span className="text-blue-500 font-semibold">{d.x} min</span>
                    <span className="text-orange-500 font-semibold">{d.gx} G/{matchDuration}</span>
                  </div>
                  <p className="text-neutral-400 mt-0.5">{d.partits} partits</p>
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            fill="#7c3aed"
            fillOpacity={0.7}
            r={5}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Radar: Perfil de jugadora ────────────────────────────────────────────────

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.round(((value - min) / (max - min)) * 100);
}

// Percentil p (0-100) d'un array per evitar que outliers distorsionin l'escala
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p / 100);
  return sorted[idx];
}

const RADAR_AXES = [
  { key: 'disponibilitat', label: 'Disponibilitat', invert: false },
  { key: 'goleig',        label: 'Goleig',         invert: false },
  { key: 'participacio',  label: 'Participació',   invert: false },
  { key: 'consistencia',  label: 'Consistència',   invert: false },
  { key: 'disciplina',    label: 'Disciplina',     invert: true  },
];

function buildRadarData(player: FcfStat, allStats: FcfStat[], matchDuration: number) {
  const vals = buildRadarValues(allStats, matchDuration);

  const playerVals = {
    disponibilitat: player.partidos > 0 ? player.minutos / player.partidos : 0,
    goleig:         player.minutos >= matchDuration ? (player.goles / player.minutos) * matchDuration : 0,
    participacio:   player.partidos,
    consistencia:   player.partidos > 0 ? Math.min(player.minutos / (player.partidos * matchDuration), 1) : 0,
    disciplina:     player.partidos > 0
      ? (player.amarillas * 1 + player.rojas * 3) / player.partidos
      : 0,
  };

  return RADAR_AXES.map(axis => {
    const allVals = vals[axis.key as keyof typeof vals];
    const min = percentile(allVals, 5);   // ignora el 5% inferior
    const max = percentile(allVals, 95);  // ignora el 5% superior (outliers)
    const raw = Math.min(normalize(
      playerVals[axis.key as keyof typeof playerVals],
      min,
      max
    ), 100);
    return { axis: axis.label, value: axis.invert ? 100 - raw : raw };
  });
}

function buildRadarValues(allStats: FcfStat[], matchDuration: number) {
  const withMinutes = allStats.filter(s => s.partidos > 0);
  return {
    disponibilitat: withMinutes.map(s => s.partidos > 0 ? s.minutos / s.partidos : 0),
    goleig:         withMinutes.map(s => s.minutos >= matchDuration ? (s.goles / s.minutos) * matchDuration : 0),
    participacio:   withMinutes.map(s => s.partidos),
    consistencia:   withMinutes.map(s => s.partidos > 0 ? Math.min(s.minutos / (s.partidos * matchDuration), 1) : 0),
    disciplina:     withMinutes.map(s => {
      const pen = s.amarillas * 1 + s.rojas * 3;
      return s.partidos > 0 ? pen / s.partidos : 0;
    }),
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
    <div ref={ref} className="relative w-full max-w-[280px] shrink-0">
      {/* Input */}
      <button
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="w-full flex items-center justify-between gap-2 text-[12px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-[var(--app-text)] hover:border-brand transition-colors text-left"
      >
        <span className="truncate">
          {selected ? `${formatPlayerName(selected.player_fcf_name)} — ${selected.team_name}` : 'Selecciona jugadora'}
        </span>
        <span className="text-neutral-400 shrink-0">{open ? '▲' : '▼'}</span>
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
          <div className="flex gap-1.5 overflow-x-auto px-2 py-1.5 border-b border-[var(--card-border)] scrollbar-none">
            <button
              onClick={() => setTeamFilter('')}
              className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                !teamFilter
                  ? 'bg-brand text-white border-brand'
                  : 'bg-[var(--card-bg)] text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
              }`}
            >
              Tots
            </button>
            {teams.map(t => (
              <button
                key={t.slug}
                onClick={() => setTeamFilter(t.slug === teamFilter ? '' : t.slug)}
                className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                  teamFilter === t.slug
                    ? 'bg-brand text-white border-brand'
                    : 'bg-[var(--card-bg)] text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Llista de jugadores */}
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-neutral-400">Sense resultats</p>
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
                    <span className="text-[10px] text-neutral-400 truncate">{p.team_name}</span>
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

function RadarJugadora({ allStats, matchDuration }: { allStats: FcfStat[]; matchDuration: number }) {
  const players = useMemo(() =>
    [...allStats]
      .filter(s => s.partidos > 0)
      .sort((a, b) => b.goles - a.goles || b.minutos - a.minutos),
    [allStats]
  );

  const [selectedId, setSelectedId] = useState<string>(players[0]?.id ?? '');
  const player = players.find(p => p.id === selectedId) ?? players[0];

  if (!player) return null;

  const radarData = buildRadarData(player, allStats, matchDuration);

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h3 className="text-[13px] font-bold text-[var(--app-text)]">Perfil de jugadora</h3>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Valors normalitzats (0–100) respecte a tota la lliga
          </p>
        </div>
        <PlayerCombobox
          players={players}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Info de la jugadora seleccionada */}
      <div className="flex flex-wrap gap-3 mb-3">
        {[
          { label: 'Equip',    value: player.team_name },
          { label: 'Partits',  value: player.partidos },
          { label: 'Minuts',   value: player.minutos },
          { label: 'Gols',     value: player.goles },
          { label: `G/${matchDuration}`, value: player.minutos >= matchDuration ? ((player.goles / player.minutos) * matchDuration).toFixed(2) : '—' },
          { label: '🟨 TA',    value: player.amarillas },
          { label: '🟥 TR',    value: player.rojas },
        ].map(item => (
          <div key={item.label} className="bg-neutral-100 dark:bg-white/10 rounded-lg px-2.5 py-1.5 text-center">
            <div className="text-[10px] text-neutral-400">{item.label}</div>
            <div className="text-[12px] font-bold text-[var(--app-text)] truncate max-w-[120px]">{item.value}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="var(--card-border)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
          />
          <Radar
            dataKey="value"
            stroke="#7c3aed"
            fill="#7c3aed"
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
                  <p className="text-brand font-semibold">{d.value} / 100</p>
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {[
          { label: 'Disponibilitat', desc: 'Minuts per partit jugat' },
          { label: 'Goleig',        desc: `Gols per ${matchDuration} minuts jugats (G/${matchDuration})` },
          { label: 'Participació',  desc: 'Total de partits jugats a la lliga' },
          { label: 'Consistència',  desc: `Minuts jugats sobre el total disponible (partits × ${matchDuration})` },
          { label: 'Disciplina',    desc: 'Menys targetes = valor més alt' },
        ].map(item => (
          <div key={item.label} className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-brand shrink-0">{item.label}:</span>
            <span className="text-[11px] text-neutral-400">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export default function Charts({ allStats, season, leagueName, matchDuration }: Props) {
  if (allStats.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-400 text-sm">
        Sense dades per a {leagueName} · {season}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-neutral-400">
        Anàlisi visual · {leagueName} · {season} ·{' '}
        {new Set(allStats.map(s => s.team_slug)).size} equips ·{' '}
        {allStats.length} jugadores
      </p>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
        <ScatterMinutsGols allStats={allStats} matchDuration={matchDuration} />
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
        <RadarJugadora allStats={allStats} matchDuration={matchDuration} />
      </div>
    </div>
  );
}
