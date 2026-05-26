/**
 * App.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * App pública (sin auth) para visualizar estadísticas de jugadoras de las ligas
 * femeninas de la FCF. Los datos se cargan desde Supabase con la clave anon.
 *
 * Flujo de datos:
 *   mount → cargar leagues → auto-select primera liga activa
 *   cambio de liga → derivar temporadas → auto-select primera temporada
 *   cambio de (liga, temporada) → cargar allStats + actas en paralelo
 *   cambio de equipo → filtrar allStats en memoria (sin llamada extra a BD)
 *   búsqueda → filtrar allStats en memoria (useMemo)
 */

import { Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import LeagueSelector from './components/LeagueSelector';
import SeasonSelector from './components/SeasonSelector';
import StatsTable from './components/StatsTable';
import SyncStatusCard from './components/SyncStatusCard';
import TeamSelector from './components/TeamSelector';
import TopTen from './components/TopTen';
import { supabase } from './lib/supabase';
import { cn, fcfSeasonToApp } from './lib/utils';
import type { ActaProcesada, FcfStat, League, TeamOption } from './types';

// ─── Dark mode helper ─────────────────────────────────────────────────────────

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('futfem-theme') === 'dark' ||
      (!localStorage.getItem('futfem-theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('futfem-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, setDark] as const;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useDarkMode();

  // ── Estado de ligas ─────────────────────────────────────────────────────────
  const [leagues, setLeagues]               = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  // ── Temporada activa ────────────────────────────────────────────────────────
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [availableFcfSeasons, setAvailableFcfSeasons] = useState<string[]>([]);

  // ── Datos ───────────────────────────────────────────────────────────────────
  const [allStats, setAllStats]         = useState<FcfStat[]>([]);
  const [actas, setActas]               = useState<ActaProcesada[]>([]);
  const [teams, setTeams]               = useState<TeamOption[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamStats, setTeamStats]       = useState<FcfStat[]>([]);
  const [loading, setLoading]           = useState(false);

  // ── Vista activa ────────────────────────────────────────────────────────────
  const [view, setView] = useState<'stats' | 'top10'>('stats');

  // ── Búsqueda global ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── 1. Cargar ligas al montar ───────────────────────────────────────────────

  useEffect(() => {
    supabase
      .from('leagues')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const rows = data || [];
        setLeagues(rows);
        if (rows.length > 0) {
          setSelectedLeagueId(rows[0].id);
        }
        setLoadingLeagues(false);
      });
  }, []);

  // ── 2. Al cambiar liga: derivar temporadas ──────────────────────────────────

  useEffect(() => {
    if (!selectedLeagueId) return;
    const league = leagues.find(l => l.id === selectedLeagueId);
    if (!league) return;

    const fcfSeasons = [...league.fcf_seasons].sort((a, b) => b.localeCompare(a));
    const appSeasons = fcfSeasons.map(fcfSeasonToApp);
    setAvailableFcfSeasons(fcfSeasons);
    setSelectedSeason(appSeasons[0] ?? '');
    setSelectedTeam(null);
    setSearchQuery('');
  }, [selectedLeagueId, leagues]);

  // ── 3. Al cambiar (liga, temporada): cargar datos ───────────────────────────

  useEffect(() => {
    if (!selectedLeagueId || !selectedSeason) return;
    loadData(selectedLeagueId, selectedSeason);
  }, [selectedLeagueId, selectedSeason]);

  async function loadData(leagueId: string, season: string) {
    setLoading(true);
    setView('stats');
    setAllStats([]);
    setTeams([]);
    setTeamStats([]);
    setActas([]);
    setSelectedTeam(null);

    const [{ data: statsData }, { data: actasData }] = await Promise.all([
      supabase
        .from('fcf_stats')
        .select('*')
        .eq('league_id', leagueId)
        .eq('season', season)
        .order('team_name', { ascending: true }),
      supabase
        .from('actas_procesadas')
        .select('*')
        .eq('league_id', leagueId)
        .eq('season', season)
        .order('processed_at', { ascending: false }),
    ]);

    const stats = statsData || [];
    const acts  = actasData  || [];

    // Deduplicar equipos desde los stats (sin llamada extra a BD)
    const seen  = new Set<string>();
    const tList: TeamOption[] = [];
    for (const s of stats) {
      if (!seen.has(s.team_slug)) {
        seen.add(s.team_slug);
        tList.push({ slug: s.team_slug, name: s.team_name });
      }
    }

    setAllStats(stats);
    setTeams(tList);
    setActas(acts);
    setLoading(false);
  }

  // ── 4. Al cambiar equipo: filtrar en memoria ────────────────────────────────

  useEffect(() => {
    if (!selectedTeam) {
      setTeamStats([]);
    } else {
      setTeamStats(
        allStats
          .filter(s => s.team_slug === selectedTeam)
          .sort((a, b) => b.partidos - a.partidos)
      );
    }
  }, [selectedTeam, allStats]);

  // ── 5. Búsqueda global (memo) ───────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const matching = allStats.filter(s =>
      s.player_fcf_name.toLowerCase().includes(q)
    );

    // Agrupar por equipo
    const grouped = new Map<
      string,
      { teamName: string; players: FcfStat[] }
    >();
    for (const s of matching) {
      if (!grouped.has(s.team_slug)) {
        grouped.set(s.team_slug, { teamName: s.team_name, players: [] });
      }
      grouped.get(s.team_slug)!.players.push(s);
    }

    return [...grouped.values()].sort((a, b) =>
      a.teamName.localeCompare(b.teamName)
    );
  }, [searchQuery, allStats]);

  // ── Liga seleccionada (objeto) ──────────────────────────────────────────────

  const selectedLeague = leagues.find(l => l.id === selectedLeagueId) ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-[var(--card-border)]"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-black tracking-tight text-brand">
              FUTFEM
            </span>
            <span className="text-lg font-black tracking-tight text-[var(--app-text)] opacity-40">
              APP
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-neutral-400 font-semibold ml-1">
              FCF · Fútbol Femení
            </span>
          </div>
          <button
            onClick={() => setDark(d => !d)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-[var(--app-text)] transition-colors"
            aria-label="Cambiar tema"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* ── Contenido principal ────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-6">

        {/* Cargando ligas */}
        {loadingLeagues && (
          <div className="text-center py-20 text-neutral-400 text-sm animate-pulse">
            Carregant lligues…
          </div>
        )}

        {/* Sin ligas activas */}
        {!loadingLeagues && leagues.length === 0 && (
          <div className="text-center py-20 text-neutral-400 text-sm">
            No hi ha lligues configurades. Executa el SQL d'inicialització a Supabase.
          </div>
        )}

        {/* Contenido principal */}
        {!loadingLeagues && leagues.length > 0 && (
          <>
            {/* Liga + Temporada */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <LeagueSelector
                leagues={leagues}
                selectedId={selectedLeagueId}
                onChange={id => {
                  setSelectedLeagueId(id);
                  setSearchQuery('');
                }}
              />
              <SeasonSelector
                fcfSeasons={availableFcfSeasons}
                selected={selectedSeason}
                onChange={s => {
                  setSelectedSeason(s);
                  setSearchQuery('');
                }}
              />
            </div>

            {/* Sync status */}
            {!loading && selectedLeague && (
              <SyncStatusCard
                actas={actas}
                season={selectedSeason}
                leagueName={selectedLeague.name}
              />
            )}

            {/* Toggle de vista */}
            {!loading && allStats.length > 0 && (
              <div className="flex gap-1.5 mb-5">
                {(
                  [
                    { id: 'stats',  label: 'Estadístiques' },
                    { id: 'top10', label: '🏆 Top 20'      },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setView(tab.id);
                      setSearchQuery('');
                    }}
                    className={cn(
                      'px-3.5 py-1.5 text-[12px] font-semibold rounded-full border transition-colors',
                      view === tab.id
                        ? 'bg-brand text-white border-brand'
                        : 'bg-[var(--card-bg)] text-neutral-500 border-[var(--card-border)] hover:border-brand hover:text-brand'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Buscador global (solo en vista estadístiques) */}
            {view === 'stats' && (
            <div className="relative mb-4">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cercar jugadora…"
                className="w-full pl-8 pr-8 py-2 text-[13px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-xl text-[var(--app-text)] placeholder-neutral-400 focus:outline-none focus:border-brand transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[var(--app-text)] transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            )}

            {/* Loading stats */}
            {loading && (
              <div className="text-center py-16 text-neutral-400 text-sm animate-pulse">
                Carregant estadístiques…
              </div>
            )}

            {/* Vista Top 10 */}
            {!loading && view === 'top10' && selectedLeague && (
              <TopTen
                allStats={allStats}
                season={selectedSeason}
                leagueName={selectedLeague.name}
              />
            )}

            {/* Vista Estadístiques */}
            {!loading && view === 'stats' && (
              <>
                {/* ── Panel búsqueda ──────────────────────────────────────── */}
                {searchResults !== null && (
                  <div className="mb-4">
                    {searchResults.length === 0 ? (
                      <div className="text-center py-10 text-neutral-400 text-sm">
                        Sense resultats per a{' '}
                        <span className="font-bold">«{searchQuery}»</span>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <p className="text-[11px] text-neutral-500">
                          {searchResults.reduce((acc, g) => acc + g.players.length, 0)} resultat
                          {searchResults.reduce((acc, g) => acc + g.players.length, 0) !== 1 ? 's' : ''}{' '}
                          en {searchResults.length} equip
                          {searchResults.length !== 1 ? 's' : ''}
                        </p>
                        {searchResults.map(group => (
                          <div key={group.teamName}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                                {group.teamName}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                {group.players.length} jugadora
                                {group.players.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                              <StatsTable data={group.players} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Vista normal (sin búsqueda) ─────────────────────────── */}
                {searchResults === null && (
                  <>
                    {/* Sin datos */}
                    {allStats.length === 0 ? (
                      <div className="text-center py-16 text-neutral-500 text-sm space-y-2">
                        <p>Sense dades per a la temporada {selectedSeason}</p>
                        <p className="text-[11px] text-neutral-400">
                          Executa el script:{' '}
                          <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-mono text-[11px]">
                            node scripts/sync-actas.js --league ... --season XXXX
                          </code>
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Selector de equipo */}
                        <TeamSelector
                          teams={teams}
                          selected={selectedTeam}
                          onChange={setSelectedTeam}
                        />

                        {/* Tabla de stats */}
                        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                          {selectedTeam ? (
                            <>
                              {/* Cabecera del equipo seleccionado */}
                              <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
                                <span className="text-[12px] font-bold text-[var(--app-text)]">
                                  {teams.find(t => t.slug === selectedTeam)?.name ?? selectedTeam}
                                </span>
                                <span className="text-[11px] text-neutral-400">
                                  {teamStats.length} jugadores ·{' '}
                                  {actas.filter(
                                    a =>
                                      a.local_slug === selectedTeam ||
                                      a.visitant_slug === selectedTeam
                                  ).length}{' '}
                                  partits
                                </span>
                              </div>
                              <StatsTable data={teamStats} />
                            </>
                          ) : (
                            /* Vista resumen: todos los equipos */
                            <AllTeamsOverview stats={allStats} teams={teams} />
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="text-center py-8 space-y-4">
        <p className="text-[11px] text-neutral-400">
          Dades: FCF · Federació Catalana de Futbol · Fútbol Femení
        </p>
        <div className="flex justify-center">
          {/* Logo mode clar */}
          <img
            src="/xmp-logo-light.svg"
            alt="XMP Football Analysis"
            className="h-16 dark:hidden"
          />
          {/* Logo mode fosc */}
          <img
            src="/xmp-logo-dark.png"
            alt="XMP Football Analysis"
            className="h-16 hidden dark:block"
          />
        </div>
      </footer>
    </div>
  );
}

// ─── Vista resumen cuando no hay equipo seleccionado ─────────────────────────

function AllTeamsOverview({
  stats,
  teams,
}: {
  stats: FcfStat[];
  teams: TeamOption[];
}) {
  // Agregar por equipo
  const teamSummary = teams
    .map(t => {
      const ts = stats.filter(s => s.team_slug === t.slug);
      return {
        name: t.name,
        players: ts.length,
        partidos: Math.max(...ts.map(s => s.partidos), 0),
        goles: ts.reduce((sum, s) => sum + s.goles, 0),
        amarillas: ts.reduce((sum, s) => sum + s.amarillas, 0),
        rojas: ts.reduce((sum, s) => sum + s.rojas, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[var(--card-border)]">
            <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider text-neutral-400">
              Equip
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider text-neutral-400">
              Jug.
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider text-neutral-400">
              G
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider text-neutral-400">
              TA
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider text-neutral-400">
              TR
            </th>
          </tr>
        </thead>
        <tbody>
          {teamSummary.map((t, i) => (
            <tr
              key={t.name}
              className={cn(
                'border-b border-[var(--card-border)]',
                i % 2 === 0 ? 'bg-transparent' : 'bg-neutral-50 dark:bg-white/[0.03]'
              )}
            >
              <td className="px-3 py-2 font-medium text-[var(--app-text)] max-w-[180px]">
                <span className="block truncate" title={t.name}>
                  {t.name}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-neutral-500">{t.players}</td>
              <td
                className={cn(
                  'px-3 py-2 text-right font-bold',
                  t.goles > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-neutral-400'
                )}
              >
                {t.goles}
              </td>
              <td
                className={cn(
                  'px-3 py-2 text-right',
                  t.amarillas > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-neutral-400'
                )}
              >
                {t.amarillas}
              </td>
              <td
                className={cn(
                  'px-3 py-2 text-right',
                  t.rojas > 0
                    ? 'text-red-600 dark:text-red-400 font-bold'
                    : 'text-neutral-400'
                )}
              >
                {t.rojas}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2.5 text-[10px] text-neutral-400">
        Selecciona un equip al desplegable de dalt per veure les jugadores.
      </p>
    </div>
  );
}
