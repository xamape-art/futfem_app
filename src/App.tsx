/**
 * App.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * App pública (sin auth) para visualizar estadísticas de jugadoras de las ligas
 * femeninas de la FCF. Los datos se cargan desde Supabase con la clave anon.
 *
 * Millores UX/UI implementades:
 *  H1  — Context pill al header (lliga + temporada mentre es fa scroll)
 *  H2  — Dark mode toggle com a chip pressable + wide mode toggle
 *  N2  — View toggle com a segmented control
 *  S1  — Cercador: badge de resultats + drecera teclat '/'
 *  S2  — Resultats de cerca: millora visual dels grups
 *  L1  — Skeleton loader per a StatsTable
 *  L2  — Skeleton loader per a TopTen
 *  A1  — AllTeamsOverview: files clicables per filtrar equip
 *  P2  — Empty state amigable per a l'usuari final
 *  P3  — Footer enriquit
 *  P4  — Wide mode toggle (max-w-3xl ↔ max-w-5xl)
 *  P5  — Regió aria-live per a screen readers
 */

import { Maximize2, Minimize2, Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import CompetitionSelector from './components/CompetitionSelector';
import SeasonSelector from './components/SeasonSelector';
import { SkeletonTable, SkeletonTopTen } from './components/SkeletonTable';
import StatsTable from './components/StatsTable';
import SyncStatusCard from './components/SyncStatusCard';
import TeamSelector from './components/TeamSelector';
import TopTen from './components/TopTen';
import Charts from './components/Charts';
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
    // H2: actualitzar meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = dark ? '#121212' : '#ffffff';
  }, [dark]);

  return [dark, setDark] as const;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useDarkMode();

  // P4: Wide mode toggle
  const [wideMode, setWideMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('futfem-wide') === 'true';
  });
  useEffect(() => {
    localStorage.setItem('futfem-wide', wideMode ? 'true' : 'false');
  }, [wideMode]);

  // ── Estado de ligas ─────────────────────────────────────────────────────────
  const [leagues, setLeagues]                             = useState<League[]>([]);
  const [selectedCompetitionKey, setSelectedCompetitionKey] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId]             = useState<string | null>(null);
  const [loadingLeagues, setLoadingLeagues]               = useState(true);

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
  const [view, setView] = useState<'stats' | 'top10' | 'charts'>('stats');

  // ── Búsqueda global ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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
          setSelectedCompetitionKey(rows[0].competition_key ?? rows[0].id);
          setSelectedGroupId(null);
        }
        setLoadingLeagues(false);
      });
  }, []);

  // ── 2. Al cambiar competición: derivar temporadas ───────────────────────────

  useEffect(() => {
    if (!selectedCompetitionKey || leagues.length === 0) return;
    const cLeagues = leagues.filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey);
    if (cLeagues.length === 0) return;

    const allSeasons = new Set<string>();
    cLeagues.forEach(l => l.fcf_seasons.forEach(s => allSeasons.add(s)));
    const fcfSeasons = [...allSeasons].sort((a, b) => b.localeCompare(a));
    const appSeasons = fcfSeasons.map(fcfSeasonToApp);
    setAvailableFcfSeasons(fcfSeasons);
    setSelectedSeason(appSeasons[0] ?? '');
    setSelectedTeam(null);
    setSearchQuery('');
  }, [selectedCompetitionKey, leagues]);

  // ── 3. Al cambiar (competición, grup, temporada): cargar datos ──────────────

  useEffect(() => {
    if (!selectedCompetitionKey || !selectedSeason || leagues.length === 0) return;
    const cLeagues = leagues.filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey);
    const ids = selectedGroupId ? [selectedGroupId] : cLeagues.map(l => l.id);
    if (ids.length === 0) return;
    loadData(ids, selectedSeason);
  }, [selectedCompetitionKey, selectedGroupId, selectedSeason, leagues]);

  async function loadData(leagueIds: string[], season: string) {
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
        .in('league_id', leagueIds)
        .eq('season', season)
        .order('team_name', { ascending: true }),
      supabase
        .from('actas_procesadas')
        .select('*')
        .in('league_id', leagueIds)
        .eq('season', season)
        .order('processed_at', { ascending: false }),
    ]);

    const stats = statsData || [];
    const acts  = actasData  || [];

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

    const grouped = new Map<string, { teamName: string; players: FcfStat[] }>();
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

  // S1: Recompte de resultats de cerca
  const searchResultsCount = searchResults?.reduce((acc, g) => acc + g.players.length, 0) ?? 0;

  // S1: Drecera de teclat '/' per al cercador
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        view === 'stats'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // ── Durada del partit per a la competició seleccionada ─────────────────────

  const matchDuration = useMemo(() => {
    if (!selectedCompetitionKey) return 90;
    const cLeagues = leagues.filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey);
    return cLeagues[0]?.match_duration ?? 90;
  }, [selectedCompetitionKey, leagues]);

  // ── Lliga/competició per a display ─────────────────────────────────────────

  const displayLeague = useMemo(() => {
    if (!selectedCompetitionKey) return null;
    if (selectedGroupId) return leagues.find(l => l.id === selectedGroupId) ?? null;
    const cLeagues = leagues.filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey);
    if (cLeagues.length === 0) return null;
    const first = cLeagues[0];
    return {
      ...first,
      name:       first.competition_name ?? first.name,
      short_name: first.competition_name ?? first.short_name,
    };
  }, [selectedCompetitionKey, selectedGroupId, leagues]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const maxWidthClass = wideMode ? 'max-w-5xl' : 'max-w-3xl';

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}
    >
      {/* P5: Regió aria-live per a screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? 'Carregant estadístiques...'
          : allStats.length > 0
          ? `${allStats.length} jugadores carregades per a ${displayLeague?.name ?? ''}`
          : ''
        }
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-[var(--card-border)]"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className={cn('mx-auto px-4 h-20 flex items-center justify-between', maxWidthClass)}>
          {/* Logo + H1: context pill */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Logo FemStats (Montserrat, SVG) — canvia segons el tema */}
            <img
              src="/lockup_analytics.svg"
              alt="FemStats"
              className="h-16 w-auto shrink-0 dark:hidden"
            />
            <img
              src="/lockup_analytics_dark.svg"
              alt="FemStats"
              className="h-16 w-auto shrink-0 hidden dark:block"
            />
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-neutral-400 font-semibold ml-1 shrink-0">
              FCF · Fútbol Femení
            </span>
            {/* H1: context pill — visible mentre es fa scroll */}
            {displayLeague && selectedSeason && !loadingLeagues && (
              <span className="hidden md:flex items-center text-[10px] font-semibold text-neutral-400 bg-neutral-100 dark:bg-white/10 px-2 py-0.5 rounded-full ml-1 whitespace-nowrap shrink-0">
                {displayLeague.short_name} · {selectedSeason}
              </span>
            )}
          </div>

          {/* Controls de la dreta */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* P4: Wide mode toggle (visible només a lg+) */}
            <button
              onClick={() => setWideMode(w => !w)}
              className="hidden lg:flex items-center justify-center bg-neutral-100 dark:bg-white/10 p-1.5 rounded-lg text-neutral-400 hover:text-[var(--app-text)] transition-colors"
              title={wideMode ? 'Vista normal' : 'Vista ampliada'}
              aria-label={wideMode ? 'Vista normal' : 'Vista ampliada'}
            >
              {wideMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            {/* H2: Dark mode toggle com a chip pressable */}
            <button
              onClick={() => setDark(d => !d)}
              className="bg-neutral-100 dark:bg-white/10 p-1.5 rounded-lg text-neutral-500 hover:text-[var(--app-text)] transition-colors"
              aria-label="Canviar tema"
              title="Mode clar/fosc"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenido principal ────────────────────────────────────────────── */}
      <main className={cn('mx-auto px-4 py-6', maxWidthClass)}>

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
            {/* Competició + Grup + Temporada */}
            <CompetitionSelector
              leagues={leagues}
              selectedCompetitionKey={selectedCompetitionKey}
              selectedGroupId={selectedGroupId}
              onCompetitionChange={key => {
                setSelectedCompetitionKey(key);
                setSelectedGroupId(null);
                setSearchQuery('');
              }}
              onGroupChange={id => {
                setSelectedGroupId(id);
                setSearchQuery('');
              }}
            />
            <div className="mb-5">
              <SeasonSelector
                fcfSeasons={availableFcfSeasons}
                selected={selectedSeason}
                onChange={s => {
                  setSelectedSeason(s);
                  setSearchQuery('');
                }}
              />
            </div>

            {/* Sync status — SC1: compacte */}
            {!loading && displayLeague && (
              <SyncStatusCard
                actas={actas}
                season={selectedSeason}
                leagueName={displayLeague.name}
              />
            )}

            {/* N2: Toggle de vista com a segmented control */}
            {!loading && allStats.length > 0 && (
              <div className="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-xl p-1 gap-1 mb-5 w-fit">
                {(
                  [
                    { id: 'stats',  label: 'Estadístiques' },
                    { id: 'top10', label: '🏆 Top 20'      },
                    { id: 'charts', label: '📊 Gràfiques'  },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setView(tab.id);
                      setSearchQuery('');
                    }}
                    className={cn(
                      'px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-colors',
                      view === tab.id
                        ? 'bg-[var(--card-bg)] text-[var(--app-text)] shadow-sm'
                        : 'text-neutral-400 dark:text-neutral-500 hover:text-[var(--app-text)]'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* S1: Buscador global (solo en vista estadístiques) */}
            {view === 'stats' && (
              <div className="relative mb-4">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cercar jugadora…"
                  className={cn(
                    'w-full pl-8 py-2 text-[13px] bg-[var(--input-bg)] border border-[var(--card-border)] rounded-xl text-[var(--app-text)] placeholder-neutral-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors',
                    searchQuery && searchResultsCount > 0 ? 'pr-20' : searchQuery ? 'pr-8' : 'pr-4'
                  )}
                />
                {/* S1: Badge de recompte de resultats */}
                {searchQuery && searchResultsCount > 0 && (
                  <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded-full pointer-events-none">
                    {searchResultsCount}
                  </span>
                )}
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

            {/* L1/L2: Skeleton loader */}
            {loading && view === 'stats'  && <SkeletonTable rows={10} />}
            {loading && view === 'top10' && <SkeletonTopTen />}

            {/* Vista Top 20 */}
            {!loading && view === 'top10' && displayLeague && (
              <TopTen
                allStats={allStats}
                season={selectedSeason}
                leagueName={displayLeague.name}
                matchDuration={matchDuration}
              />
            )}

            {/* Vista Gràfiques */}
            {!loading && view === 'charts' && displayLeague && (
              <Charts
                allStats={allStats}
                season={selectedSeason}
                leagueName={displayLeague.name}
                matchDuration={matchDuration}
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
                      // S2: millora visual dels grups de resultats
                      <div className="space-y-8">
                        <p className="text-[12px] text-neutral-500">
                          <span className="text-brand font-bold">{searchResultsCount}</span>{' '}
                          resultat{searchResultsCount !== 1 ? 's' : ''}{' '}
                          en{' '}
                          <span className="font-semibold">{searchResults.length}</span>{' '}
                          equip{searchResults.length !== 1 ? 's' : ''}
                        </p>
                        {searchResults.map(group => (
                          <div key={group.teamName}>
                            {/* S2: border-l accent + badge més gran */}
                            <div className="flex items-center gap-2 mb-2 border-l-2 border-brand pl-2">
                              <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                                {group.teamName}
                              </span>
                              <span className="text-[11px] text-neutral-400">
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
                    {/* P2: Empty state amigable per a l'usuari */}
                    {allStats.length === 0 ? (
                      <div className="text-center py-16 space-y-3">
                        <div className="text-4xl">📭</div>
                        <p className="text-[15px] font-semibold text-[var(--app-text)]">
                          Sense estadístiques
                        </p>
                        <p className="text-[13px] text-neutral-400 max-w-[280px] mx-auto leading-relaxed">
                          No hi ha dades per a{' '}
                          {displayLeague?.short_name ?? ''} · {selectedSeason}.{' '}
                          Les estadístiques s'actualitzen cada dilluns.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Selector d'equip — S3: pills */}
                        <TeamSelector
                          teams={teams}
                          selected={selectedTeam}
                          onChange={setSelectedTeam}
                        />

                        {/* Tabla de stats */}
                        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                          {selectedTeam ? (
                            <>
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
                            /* A1: AllTeamsOverview amb files clicables */
                            <AllTeamsOverview
                              stats={allStats}
                              teams={teams}
                              onSelect={slug => {
                                setSelectedTeam(slug);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            />
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

      {/* P3: Footer enriquit ────────────────────────────────────────────────── */}
      <footer className="mt-12 border-t border-[var(--card-border)] py-8">
        <div className={cn('mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-6', maxWidthClass)}>
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <img
              src="/xmp-logo-light.svg"
              alt="XMP Football Analysis"
              className="h-8 dark:hidden"
            />
            <img
              src="/xmp-logo-dark.png"
              alt="XMP Football Analysis"
              className="h-8 hidden dark:block"
            />
            <p className="text-[10px] text-neutral-400">© XMP Football Analysis</p>
          </div>
          <div className="text-center sm:text-right space-y-1">
            <p className="text-[11px] text-neutral-400">
              Dades:{' '}
              <a
                href="https://www.fcf.cat"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline underline-offset-2"
              >
                FCF
              </a>{' '}
              · Federació Catalana de Futbol
            </p>
            <p className="text-[11px] text-neutral-400">
              Fútbol Femení{selectedSeason ? ` · Temporada ${selectedSeason}` : ''}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── A1: Vista resumen quan no hi ha equip seleccionat (files clicables) ──────

function AllTeamsOverview({
  stats,
  teams,
  onSelect,
}: {
  stats: FcfStat[];
  teams: TeamOption[];
  onSelect: (slug: string) => void;
}) {
  const teamSummary = teams
    .map(t => {
      const ts = stats.filter(s => s.team_slug === t.slug);
      return {
        slug: t.slug,
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
            {/* A1: columna de chevron */}
            <th className="px-2 py-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {teamSummary.map((t, i) => (
            <tr
              key={t.name}
              onClick={() => onSelect(t.slug)}
              className={cn(
                'group border-b border-[var(--card-border)] cursor-pointer transition-colors hover:bg-brand/5',
                i % 2 === 0 ? 'bg-transparent' : 'bg-neutral-50 dark:bg-[#272727]'
              )}
            >
              <td className="px-3 py-2.5 font-medium text-[var(--app-text)] max-w-[180px]">
                <span className="block truncate" title={t.name}>
                  {t.name}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-neutral-500">{t.players}</td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right font-bold',
                  t.goles > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-neutral-400'
                )}
              >
                {t.goles}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right',
                  t.amarillas > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-neutral-400'
                )}
              >
                {t.amarillas}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right',
                  t.rojas > 0
                    ? 'text-red-600 dark:text-red-400 font-bold'
                    : 'text-neutral-400'
                )}
              >
                {t.rojas}
              </td>
              {/* A1: chevron visible en hover */}
              <td className="px-2 py-2.5 text-right text-neutral-300 group-hover:text-accent transition-colors text-base leading-none">
                ›
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2.5 text-[10px] text-neutral-400">
        Clica sobre un equip per veure les jugadores.
      </p>
    </div>
  );
}
