import { useMemo, useState } from 'react';
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
}

// ─── Scatter: Minuts vs Gols ──────────────────────────────────────────────────

const MIN_MINUTS = 90;

function ScatterMinutsGols({ allStats }: { allStats: FcfStat[] }) {
  const data = useMemo(() =>
    allStats
      .filter(s => s.minutos >= MIN_MINUTS && s.goles > 0)
      .map(s => ({
        x: s.minutos,
        y: s.goles,
        name: formatPlayerName(s.player_fcf_name),
        team: s.team_name,
        partits: s.partidos,
        g90: ((s.goles / s.minutos) * 90).toFixed(2),
        id: s.id,
      })),
    [allStats]
  );

  // Línia de referència G/90 = 1.0: y = x/90
  const maxMin = Math.max(...data.map(d => d.x), 200);
  const refY = Math.round(maxMin / 90);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-neutral-400 text-sm">
        Sense jugadores amb ≥{MIN_MINUTS} min i gols marcats
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[13px] font-bold text-[var(--app-text)]">Minuts jugats vs Gols</h3>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Cada punt és una jugadora (≥{MIN_MINUTS} min) · La línia diagonal = 1 gol cada 90 min
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
            label={{ value: '1 G/90', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
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
                    <span className="text-orange-500 font-semibold">{d.g90} G/90</span>
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

const RADAR_AXES = [
  { key: 'disponibilitat', label: 'Disponibilitat', invert: false },
  { key: 'goleig',        label: 'Goleig G/90',    invert: false },
  { key: 'participacio',  label: 'Participació',   invert: false },
  { key: 'consistencia',  label: 'Consistència',   invert: false },
  { key: 'disciplina',    label: 'Disciplina',     invert: true  },
];

function buildRadarData(player: FcfStat, allStats: FcfStat[]) {
  const withMinutes = allStats.filter(s => s.partidos > 0);

  const vals = {
    disponibilitat: withMinutes.map(s => s.partidos > 0 ? s.minutos / s.partidos : 0),
    goleig:         withMinutes.map(s => s.minutos >= 90 ? (s.goles / s.minutos) * 90 : 0),
    participacio:   withMinutes.map(s => s.partidos),
    consistencia:   withMinutes.map(s => s.partidos > 0 ? s.titular / s.partidos : 0),
    disciplina:     withMinutes.map(s => {
      const pen = s.amarillas * 1 + s.rojas * 3;
      return s.partidos > 0 ? pen / s.partidos : 0;
    }),
  };

  const playerVals = {
    disponibilitat: player.partidos > 0 ? player.minutos / player.partidos : 0,
    goleig:         player.minutos >= 90 ? (player.goles / player.minutos) * 90 : 0,
    participacio:   player.partidos,
    consistencia:   player.partidos > 0 ? player.titular / player.partidos : 0,
    disciplina:     player.partidos > 0
      ? (player.amarillas * 1 + player.rojas * 3) / player.partidos
      : 0,
  };

  return RADAR_AXES.map(axis => {
    const raw = normalize(
      playerVals[axis.key as keyof typeof playerVals],
      Math.min(...vals[axis.key as keyof typeof vals]),
      Math.max(...vals[axis.key as keyof typeof vals])
    );
    return { axis: axis.label, value: axis.invert ? 100 - raw : raw };
  });
}

function RadarJugadora({ allStats }: { allStats: FcfStat[] }) {
  const players = useMemo(() =>
    [...allStats]
      .filter(s => s.partidos > 0)
      .sort((a, b) => b.goles - a.goles || b.minutos - a.minutos),
    [allStats]
  );

  const [selectedId, setSelectedId] = useState<string>(players[0]?.id ?? '');
  const player = players.find(p => p.id === selectedId) ?? players[0];

  if (!player) return null;

  const radarData = buildRadarData(player, allStats);

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h3 className="text-[13px] font-bold text-[var(--app-text)]">Perfil de jugadora</h3>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Valors normalitzats (0–100) respecte a tota la lliga
          </p>
        </div>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="text-[12px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg px-2 py-1 text-[var(--app-text)] focus:outline-none focus:border-brand max-w-[200px] shrink-0"
        >
          {players.map(p => (
            <option key={p.id} value={p.id}>
              {formatPlayerName(p.player_fcf_name)}
            </option>
          ))}
        </select>
      </div>

      {/* Info de la jugadora seleccionada */}
      <div className="flex flex-wrap gap-3 mb-3">
        {[
          { label: 'Equip',    value: player.team_name },
          { label: 'Partits',  value: player.partidos },
          { label: 'Minuts',   value: player.minutos },
          { label: 'Gols',     value: player.goles },
          { label: 'G/90',     value: player.minutos >= 90 ? ((player.goles / player.minutos) * 90).toFixed(2) : '—' },
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
          { label: 'Goleig G/90',   desc: 'Gols per 90 minuts jugats' },
          { label: 'Participació',  desc: 'Total de partits jugats a la lliga' },
          { label: 'Consistència',  desc: 'Ratio de partits jugant de titular' },
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

export default function Charts({ allStats, season, leagueName }: Props) {
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
        <ScatterMinutsGols allStats={allStats} />
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
        <RadarJugadora allStats={allStats} />
      </div>
    </div>
  );
}
