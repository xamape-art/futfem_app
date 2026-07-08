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

import { BarChart3, ChevronDown, ChevronsUpDown, ChevronUp, Info, LayoutList, Maximize2, Minimize2, MousePointerClick, Moon, Search, Sun, Trophy, X } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import CompetitionSelector from './components/CompetitionSelector';
import SeasonSelector from './components/SeasonSelector';
import { SkeletonTable, SkeletonTopTen } from './components/SkeletonTable';
import SplashScreen from './components/SplashScreen';
import StatsTable from './components/StatsTable';
import StatTiles from './components/StatTiles';
import SyncStatusCard from './components/SyncStatusCard';
import TeamSelector from './components/TeamSelector';
import TopTen from './components/TopTen';
import Charts from './components/Charts';
import { fetchAllPaginated, supabase } from './lib/supabase';
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

  // Splash d'intro (logo + totals globals) que es fon cap a l'app
  const [showSplash, setShowSplash] = useState(true);
  // Panell "Sobre FemStats"
  const [showAbout, setShowAbout] = useState(false);
  useEffect(() => {
    if (!showAbout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAbout(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAbout]);

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
  // Prop 1: temporades (format app) que realment tenen dades a fcf_stats
  const [seasonsWithData, setSeasonsWithData] = useState<Set<string>>(new Set());

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
    setSelectedTeam(null);
    setSearchQuery('');
    // Netegem la selecció mentre esbrinem quina temporada té dades (evita
    // carregar dades d'una temporada equivocada i el flaix d'estat buit).
    setSelectedSeason('');

    // Prop 1: consultem quines temporades tenen dades i seleccionem per defecte
    // la més recent amb dades (no la 26-27 buida). Comptador HEAD → sense
    // transferència de files, 2-3 consultes ràpides.
    let cancelled = false;
    const ids = cLeagues.map(l => l.id);
    (async () => {
      const checks = await Promise.all(
        appSeasons.map(async appS => {
          const { count } = await supabase
            .from('fcf_stats')
            .select('id', { count: 'exact', head: true })
            .in('league_id', ids)
            .eq('season', appS);
          return { appS, has: (count ?? 0) > 0 };
        })
      );
      if (cancelled) return;
      const withData = new Set(checks.filter(c => c.has).map(c => c.appS));
      setSeasonsWithData(withData);
      // Temporada més recent amb dades; si cap en té, la més recent disponible.
      const best = appSeasons.find(s => withData.has(s)) ?? appSeasons[0] ?? '';
      setSelectedSeason(best);
    })();

    return () => {
      cancelled = true;
    };
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

    // Paginat: superem el límit de 1000 files de PostgREST perquè les lligues
    // grans (p. ex. 1ª Div Femenina) carreguin TOTES les jugadores.
    const [stats, acts] = await Promise.all([
      fetchAllPaginated<FcfStat>((from, to) =>
        supabase
          .from('fcf_stats')
          .select('*')
          .in('league_id', leagueIds)
          .eq('season', season)
          .order('team_name', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<ActaProcesada>((from, to) =>
        supabase
          .from('actas_procesadas')
          .select('*')
          .in('league_id', leagueIds)
          .eq('season', season)
          .order('processed_at', { ascending: false })
          .range(from, to)
      ),
    ]);

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

  // Prop 2: temporada més recent amb dades (per al CTA de l'estat buit)
  const newestSeasonWithData = useMemo(() => {
    const appSeasons = [...availableFcfSeasons]
      .sort((a, b) => b.localeCompare(a))
      .map(fcfSeasonToApp);
    return appSeasons.find(s => seasonsWithData.has(s)) ?? null;
  }, [availableFcfSeasons, seasonsWithData]);

  // ── Durada del partit per a la competició seleccionada ─────────────────────

  const matchDuration = useMemo(() => {
    if (!selectedCompetitionKey) return 90;
    const cLeagues = leagues.filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey);
    return cLeagues[0]?.match_duration ?? 90;
  }, [selectedCompetitionKey, leagues]);

  // Fiabilitat dels minuts: la FCF només publica el minut dels canvis a Tercera
  // Federació. A la resta de categories, titulars = partit sencer i suplents = 0,
  // així que els minuts (i el G/90) no són reals. Ho detectem des de les dades
  // carregades perquè s'auto-ajusti a lligues futures.
  const minutesReliable = useMemo(() => {
    if (allStats.length === 0) return true;
    const subsWithMin = allStats.filter(s => s.suplente > 0 && s.titular === 0 && s.minutos > 0).length;
    const partialStarters = allStats.filter(
      s => s.titular > 0 && s.minutos > 0 && s.minutos < matchDuration
    ).length;
    return subsWithMin + partialStarters >= 5;
  }, [allStats, matchDuration]);

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
      {/* Intro splash amb totals globals */}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {/* Panell "Sobre FemStats" */}
      {showAbout && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Sobre FemStats"
        >
          <div
            className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-neutral-400 hover:text-[var(--app-text)] hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Tancar"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 text-accent shrink-0">
                <Info size={18} />
              </span>
              <h2 className="text-[17px] font-bold text-[var(--app-text)]">Sobre FemStats</h2>
            </div>

            <p className="text-[13.5px] text-neutral-600 dark:text-neutral-300 leading-relaxed mb-3">
              FemStats recull i mostra les estadístiques de les competicions de futbol
              femení de la <b>Federació Catalana de Futbol (FCF)</b>: partits, gols,
              targetes, titularitats i minuts. Les dades s'actualitzen automàticament
              cada setmana a partir de les actes oficials.
            </p>
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Nota: els minuts jugats només estan disponibles a les categories on la FCF
              publica el detall dels canvis.
            </p>
          </div>
        </div>
      )}

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
        className="sticky top-0 z-50 border-b border-[var(--card-border)] relative"
        style={{ background: 'var(--header-bg)' }}
      >
        {/* Accent de marca: fina línia taronja a la base de la capçalera */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/70 to-transparent pointer-events-none" />
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
            {/* H1: context pill — visible mentre es fa scroll */}
            {displayLeague && selectedSeason && !loadingLeagues && (
              <span className="hidden md:flex items-center text-[11px] font-bold text-neutral-500 dark:text-neutral-300 bg-neutral-100 dark:bg-white/10 px-2.5 py-1 rounded-full ml-1 whitespace-nowrap shrink-0">
                {displayLeague.short_name} · {selectedSeason}
              </span>
            )}
          </div>

          {/* Controls de la dreta */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botó "Sobre FemStats" */}
            <button
              onClick={() => setShowAbout(true)}
              className="flex items-center gap-1.5 bg-accent/10 text-accent font-bold text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-accent/20 transition-colors"
              aria-label="Sobre FemStats"
              title="Sobre FemStats"
            >
              <Info size={16} strokeWidth={2.5} />
              <span className="hidden sm:inline">Info</span>
            </button>

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

        {/* Línia d'introducció: què és l'app (una sola línia) */}
        <p className="text-center text-[13px] leading-snug mt-3 mb-5 max-w-[780px] mx-auto">
          <span className="text-[16.5px] font-bold text-neutral-700 dark:text-neutral-200">
            Estadístiques del futbol femení català
          </span>
          <span className="text-neutral-400 dark:text-neutral-500"> · </span>
          <span className="text-neutral-500 dark:text-neutral-400">dades oficials de la </span>
          <a
            href="https://www.fcf.cat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent font-semibold hover:underline underline-offset-2"
          >
            FCF
          </a>
          <span className="text-neutral-400 dark:text-neutral-500"> · </span>
          <span className="text-neutral-500 dark:text-neutral-400">actualitzades cada dilluns</span>
        </p>

        {/* Cargando ligas */}
        {loadingLeagues && (
          <div className="text-center py-20 text-neutral-500 dark:text-neutral-400 text-sm animate-pulse">
            Carregant lligues…
          </div>
        )}

        {/* Sin ligas activas */}
        {!loadingLeagues && leagues.length === 0 && (
          <div className="text-center py-20 text-neutral-500 dark:text-neutral-400 text-sm">
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
                seasonsWithData={seasonsWithData}
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

            {/* Prop 3: Resum ràpid (stat tiles) */}
            {!loading && allStats.length > 0 && (
              <StatTiles stats={allStats} actas={actas} teamsCount={teams.length} />
            )}

            {/* Avís: minuts no fiables en aquesta categoria */}
            {!loading && allStats.length > 0 && !minutesReliable && (
              <div className="flex items-start gap-2 mb-5 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                <Info size={15} className="shrink-0 mt-0.5" />
                <span>
                  En aquesta categoria la FCF no publica el minut dels canvis. Es
                  mostren només les dades verificables (titularitats, gols i
                  targetes); els <b>minuts</b> i el <b>G/{matchDuration}</b> no es mostren.
                </span>
              </div>
            )}

            {/* N2: Toggle de vista com a segmented control */}
            {!loading && allStats.length > 0 && (
              <div className="relative flex items-stretch bg-neutral-100 dark:bg-neutral-800/60 border border-[var(--card-border)] rounded-2xl p-1.5 mb-6 shadow-[0_10px_30px_rgba(16,32,60,0.18)]">
                {/* Indicador lliscant (pestanya activa) */}
                <div
                  aria-hidden="true"
                  className="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-brand shadow-md transition-transform duration-300 ease-out"
                  style={{
                    width: 'calc((100% - 12px) / 3)',
                    transform: `translateX(calc(${view === 'stats' ? 0 : view === 'top10' ? 1 : 2} * 100%))`,
                  }}
                />
                {(
                  [
                    { id: 'stats',  label: 'Estadístiques', icon: LayoutList },
                    { id: 'top10', label: 'Top 20',        icon: Trophy     },
                    { id: 'charts', label: 'Gràfiques',     icon: BarChart3  },
                  ] as const
                ).map(tab => {
                  const TabIcon = tab.icon;
                  const active = view === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setView(tab.id);
                        setSearchQuery('');
                      }}
                      className={cn(
                        'relative z-10 flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2.5 sm:py-3 text-[13px] sm:text-[14px] font-bold transition-colors',
                        active
                          ? 'text-white'
                          : 'text-neutral-500 dark:text-neutral-300 hover:text-[var(--app-text)]'
                      )}
                    >
                      <TabIcon size={16} strokeWidth={2.5} className="shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* S1: Buscador global (només en vista estadístiques i amb dades) */}
            {view === 'stats' && !loading && allStats.length > 0 && (
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
                minutesReliable={minutesReliable}
              />
            )}

            {/* Vista Gràfiques */}
            {!loading && view === 'charts' && displayLeague && (
              <Charts
                allStats={allStats}
                season={selectedSeason}
                leagueName={displayLeague.name}
                matchDuration={matchDuration}
                minutesReliable={minutesReliable}
              />
            )}

            {/* Vista Estadístiques */}
            {!loading && view === 'stats' && (
              <>
                {/* ── Panel búsqueda ──────────────────────────────────────── */}
                {searchResults !== null && (
                  <div className="mb-4">
                    {searchResults.length === 0 ? (
                      <div className="text-center py-10 text-neutral-500 dark:text-neutral-400 text-sm">
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
                              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {group.players.length} jugadora
                                {group.players.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                              <StatsTable data={group.players} showMinutes={minutesReliable} />
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
                      // Prop 2: estat buit útil, amb acció cap a la temporada amb dades
                      <div className="text-center py-16 space-y-4">
                        <div className="text-5xl">📭</div>
                        <div className="space-y-1.5">
                          <p className="text-[16px] font-bold text-[var(--app-text)]">
                            Encara no hi ha dades per a {selectedSeason}
                          </p>
                          <p className="text-[13.5px] text-neutral-500 dark:text-neutral-400 max-w-[320px] mx-auto leading-relaxed">
                            {displayLeague?.short_name ?? ''} · {selectedSeason}.{' '}
                            Les estadístiques s'actualitzen cada dilluns.
                          </p>
                        </div>
                        {/* CTA cap a la temporada més recent amb dades */}
                        {newestSeasonWithData && newestSeasonWithData !== selectedSeason && (
                          <button
                            onClick={() => {
                              setSelectedSeason(newestSeasonWithData);
                              setSearchQuery('');
                            }}
                            className="inline-flex items-center gap-1.5 bg-accent text-white font-bold text-[13px] px-5 py-2.5 rounded-xl shadow-sm hover:brightness-95 active:scale-[.98] transition"
                          >
                            Veure la temporada {newestSeasonWithData}
                            <span aria-hidden="true">→</span>
                          </button>
                        )}
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
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {teamStats.length} jugadores ·{' '}
                                  {actas.filter(
                                    a =>
                                      a.local_slug === selectedTeam ||
                                      a.visitant_slug === selectedTeam
                                  ).length}{' '}
                                  partits
                                </span>
                              </div>
                              <StatsTable data={teamStats} showMinutes={minutesReliable} />
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
          <div className="flex items-center gap-3">
            <img
              src="/xmp-logo-light.svg"
              alt="XMP Football Analysis"
              className="h-11 dark:hidden"
            />
            <img
              src="/xmp-logo-dark.png"
              alt="XMP Football Analysis"
              className="h-11 hidden dark:block"
            />
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">© {new Date().getFullYear()} XMP Football Analysis</p>
          </div>
          <div className="text-center sm:text-right space-y-1">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
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
          </div>
        </div>
      </footer>

      <Analytics />
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
  type TeamSortKey = 'name' | 'players' | 'goles' | 'amarillas' | 'rojas';
  const [sortKey, setSortKey] = useState<TeamSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: TeamSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

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
    .sort((a, b) => {
      if (sortKey === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const va = a[sortKey];
      const vb = b[sortKey];
      return sortDir === 'asc' ? va - vb : vb - va;
    });

  // Capçalera ordenable amb glif ⇅ / direcció
  const ThSort = ({ col, label, left = false }: { col: TeamSortKey; label: string; left?: boolean }) => (
    <th
      onClick={() => handleSort(col)}
      className={cn(
        'px-3 py-2 text-[11px] font-black uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-[var(--app-text)]',
        left ? 'text-left' : 'text-right',
        sortKey === col ? 'text-[var(--app-text)]' : 'text-neutral-500 dark:text-neutral-400'
      )}
    >
      {label}
      {sortKey === col ? (
        sortDir === 'desc'
          ? <ChevronDown size={13} className="inline ml-0.5 text-accent" strokeWidth={2.5} />
          : <ChevronUp size={13} className="inline ml-0.5 text-accent" strokeWidth={2.5} />
      ) : (
        <ChevronsUpDown size={13} className="inline ml-0.5 text-neutral-400 dark:text-neutral-500" />
      )}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[var(--card-border)]">
            <ThSort col="name" label="Equip" left />
            <ThSort col="players" label="Jug." />
            <ThSort col="goles" label="G" />
            <ThSort col="amarillas" label="TA" />
            <ThSort col="rojas" label="TR" />
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-3 mt-1 border-t border-[var(--card-border)] text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-300">
        <span className="flex items-center gap-1.5">
          <ChevronsUpDown size={15} className="text-accent" strokeWidth={2.5} />
          Clica una columna per ordenar
        </span>
        <span className="flex items-center gap-1.5">
          <MousePointerClick size={15} className="text-accent" strokeWidth={2.5} />
          Clica un equip per veure les jugadores
        </span>
      </div>
    </div>
  );
}
