/**
 * PlayerCard.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Ficha modal d'una jugadora, oberta en triar-la al cercador global. Mostra les
 * seves dades (sense "hero": les 6 estadístiques en igualtat) i ofereix saltar
 * a la seva llista (amb la fila ressaltada) o veure tot el seu equip.
 */

import { ArrowRight, Info, Users, X } from 'lucide-react';
import { useEffect } from 'react';
import { formatPlayerName } from '../lib/utils';
import type { SearchHit } from './GlobalPlayerSearch';

interface Props {
  hit: SearchHit;
  leagueLabel: string;      // p. ex. "1ª Div Infantil · Gr.1"
  minutesPublished: boolean; // si la categoria publica el minut dels canvis
  onClose: () => void;
  onViewList: () => void;
  onViewTeam: () => void;
}

export default function PlayerCard({
  hit,
  leagueLabel,
  minutesPublished,
  onClose,
  onViewList,
  onViewTeam,
}: Props) {
  // Tancar amb Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = formatPlayerName(hit.player_fcf_name);
  const golsPerPartit = hit.partidos > 0
    ? (hit.goles / hit.partidos).toFixed(1).replace('.', ',')
    : null;
  const pctTitular = hit.partidos > 0
    ? Math.round((hit.titular / hit.partidos) * 100)
    : null;

  const tiles: { n: number; k: string; cls?: string }[] = [
    { n: hit.partidos, k: 'Partits' },
    { n: hit.titular,  k: 'Titular' },
    { n: hit.suplente, k: 'Suplent' },
    { n: hit.goles,    k: 'Gols',      cls: hit.goles > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400' },
    { n: hit.amarillas, k: 'Grogues',  cls: hit.amarillas > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400' },
    { n: hit.rojas,    k: 'Vermelles', cls: hit.rojas > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-400' },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${name}`}
    >
      <div
        className="w-full max-w-[420px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[22px] shadow-2xl overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Capçalera de marca */}
        <div
          className="relative px-5 pt-5 pb-[18px] text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-dark))' }}
        >
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-[30px] h-[30px] grid place-items-center rounded-[9px] bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Tancar"
          >
            <X size={15} />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="w-[52px] h-[52px] shrink-0 grid place-items-center rounded-full bg-white/15 border-2 border-white/45 text-[22px] font-extrabold tabular-nums">
              {hit.dorsal ?? '–'}
            </div>
            <div className="min-w-0">
              <div className="text-[19px] font-extrabold leading-tight tracking-tight truncate" title={name}>
                {name}
              </div>
              <div className="text-[12.5px] opacity-90 mt-0.5 truncate" title={hit.team_name}>
                {hit.team_name}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3.5">
            <span className="text-[10.5px] font-bold bg-white/15 px-2.5 py-1 rounded-full">{leagueLabel}</span>
            <span className="text-[10.5px] font-bold bg-white/15 px-2.5 py-1 rounded-full">{hit.season}</span>
          </div>
        </div>

        {/* Cos */}
        <div className="px-[18px] pt-5 pb-5">
          {/* Sub-línia fina de dades derivades */}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-neutral-500 dark:text-neutral-400 mb-4 px-0.5">
            {golsPerPartit !== null && (
              <span><b className="text-[var(--app-text)] font-extrabold">{golsPerPartit}</b> gols/partit</span>
            )}
            {pctTitular !== null && (
              <span><b className="text-[var(--app-text)] font-extrabold">{pctTitular}%</b> titular</span>
            )}
          </div>

          {/* 6 estadístiques en igualtat */}
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map(t => (
              <div key={t.k} className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-[14px] py-[15px] px-2.5 text-center">
                <div className={`text-[24px] font-extrabold leading-none tabular-nums ${t.cls ?? 'text-[var(--app-text)]'}`}>{t.n}</div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mt-1.5">{t.k}</div>
              </div>
            ))}
          </div>

          {/* Nota: minuts no publicats en aquesta categoria */}
          {!minutesPublished && (
            <div className="flex items-start gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 mt-3.5 px-0.5 leading-snug">
              <Info size={13} className="shrink-0 mt-px" />
              <span>En aquesta categoria la FCF no publica el minut dels canvis; per això no es mostren els minuts.</span>
            </div>
          )}

          {/* Accions */}
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={onViewList}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-[13px] font-bold bg-brand text-white border border-brand hover:brightness-110 transition"
            >
              Veure a la llista <ArrowRight size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={onViewTeam}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-3 text-[13px] font-bold bg-[var(--input-bg)] text-[var(--app-text)] border border-[var(--card-border)] hover:border-brand transition-colors"
            >
              <Users size={15} strokeWidth={2.5} /> Veure l'equip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
