/**
 * GlobalPlayerSearch.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Cercador global de jugadores: busca a TOTES les lligues i temporades des de la
 * pàgina principal (independent de la competició seleccionada). En triar un
 * resultat, l'app navega a la lliga/grup/temporada d'aquesta jugadora i la
 * ressalta a la seva llista d'estadístiques.
 *
 * La cerca ataca directament fcf_stats amb ilike (≈9k files, ~130 ms), amb
 * debounce i descartant respostes obsoletes.
 */

import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat, League } from '../types';

const MIN_CHARS   = 2;
const DEBOUNCE_MS = 250;
const FETCH_LIMIT = 80;   // marge per ordenar al client
const SHOW_LIMIT  = 30;   // resultats visibles

export interface SearchHit {
  league_id: string;
  season: string;
  team_slug: string;
  team_name: string;
  player_fcf_name: string;
  goles: number;
  partidos: number;
}

interface Props {
  leagues: League[];
  onSelect: (hit: SearchHit) => void;
}

export default function GlobalPlayerSearch({ leagues, onSelect }: Props) {
  const [q, setQ]             = useState('');
  const [results, setResults] = useState<FcfStat[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);

  const boxRef  = useRef<HTMLDivElement>(null);
  const reqRef  = useRef(0);   // id de petició per descartar respostes obsoletes

  // Mapa league_id → etiqueta visible (competició · grup)
  const leagueLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leagues) {
      const g = l.group_path.match(/grup-(\w+)$/);
      const comp = l.competition_name ?? l.short_name;
      m.set(l.id, g ? `${comp} · Gr.${g[1].toUpperCase()}` : comp);
    }
    return m;
  }, [leagues]);

  // ── Cerca amb debounce ──────────────────────────────────────────────────────
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const reqId = ++reqRef.current;
    const handle = setTimeout(async () => {
      // Permet cercar per cognom + nom encara que hi hagi text entremig:
      // "blasi julia" → "%blasi%julia%"
      const pattern = '%' + query.replace(/\s+/g, '%') + '%';
      const { data } = await supabase
        .from('fcf_stats')
        .select('league_id,season,team_slug,team_name,player_fcf_name,goles,partidos')
        .ilike('player_fcf_name', pattern)
        .limit(FETCH_LIMIT);

      if (reqId !== reqRef.current) return;  // resposta obsoleta
      setResults((data as FcfStat[]) ?? []);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [q]);

  // ── Ordenació client: coincidència pel començament primer, després més PJ ────
  const sortedResults = useMemo(() => {
    if (!results) return null;
    const needle = q.trim().toLowerCase();
    return [...results]
      .sort((a, b) => {
        const aStarts = a.player_fcf_name.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.player_fcf_name.toLowerCase().startsWith(needle) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.partidos - a.partidos;
      })
      .slice(0, SHOW_LIMIT);
  }, [results, q]);

  // ── Tancar el desplegable en clicar fora ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const clear = () => {
    setQ('');
    setResults(null);
    setOpen(false);
  };

  const pick = (hit: FcfStat) => {
    onSelect({
      league_id:       hit.league_id,
      season:          hit.season,
      team_slug:       hit.team_slug,
      team_name:       hit.team_name,
      player_fcf_name: hit.player_fcf_name,
      goles:           hit.goles,
      partidos:        hit.partidos,
    });
    clear();
  };

  const showDropdown = open && q.trim().length >= MIN_CHARS;
  const totalFound   = results?.length ?? 0;

  return (
    <div ref={boxRef} className="relative mb-4">
      {/* Input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
        />
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Cerca una jugadora a totes les lligues…"
          className="w-full pl-10 pr-10 py-3 text-[14px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl text-[var(--app-text)] placeholder-neutral-400 shadow-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
        />
        {loading ? (
          <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand animate-spin" />
        ) : q ? (
          <button
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[var(--app-text)] transition-colors"
            aria-label="Esborrar cerca"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* Desplegable de resultats */}
      {showDropdown && (
        <div className="absolute z-40 mt-2 w-full max-h-[60vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl">
          {loading && !sortedResults ? (
            <div className="px-4 py-6 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              Cercant…
            </div>
          ) : !sortedResults || sortedResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              Sense resultats per a <span className="font-bold">«{q.trim()}»</span>
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)]">
                {totalFound > SHOW_LIMIT
                  ? `${SHOW_LIMIT}+ resultats · afina la cerca`
                  : `${totalFound} resultat${totalFound !== 1 ? 's' : ''}`}
              </div>
              <ul>
                {sortedResults.map((hit, i) => (
                  <li key={`${hit.league_id}-${hit.season}-${hit.team_slug}-${hit.player_fcf_name}-${i}`}>
                    <button
                      onClick={() => pick(hit)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-brand/5 border-b border-[var(--card-border)] last:border-b-0 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--app-text)] truncate">
                          {formatPlayerName(hit.player_fcf_name)}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {hit.team_name} · {leagueLabel.get(hit.league_id) ?? '—'} · {hit.season}
                        </div>
                      </div>
                      {hit.goles > 0 && (
                        <span className="shrink-0 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {hit.goles} G
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">
                        {hit.partidos} PJ
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
