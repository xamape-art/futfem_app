/**
 * SplashScreen.tsx
 * Intro d'entrada: logo FemStats + totals globals (suma de TOTES les dades
 * recollides) amb comptador animat. Es mostra uns segons i es fon cap a l'app.
 */

import { useEffect, useState } from 'react';
import { fetchAllPaginated, supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Totals {
  players: number;
  teams: number;
  goals: number;
  matches: number;
}

// Comptador animat 0 → target (ease-out cubic)
function useCountUp(target: number, run: boolean, duration = 1100): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    // Respecta la preferència de moviment reduït
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return val;
}

function SplashTile({
  value,
  label,
  ready,
  accent = false,
}: {
  value: number;
  label: string;
  ready: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl px-2 py-4 text-center shadow-sm">
      <div
        className={cn(
          'flex items-center justify-center text-[22px] sm:text-[28px] font-black tabular-nums leading-none whitespace-nowrap',
          accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand dark:text-white'
        )}
      >
        {ready ? (
          value.toLocaleString('ca-ES')
        ) : (
          <span className="inline-block h-4 w-9 rounded-full bg-neutral-200 dark:bg-white/10 animate-pulse" />
        )}
      </div>
      <div className="mt-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  );
}

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [leaving, setLeaving] = useState(false);

  // ── Carregar totals globals (totes les lligues i temporades) ────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stats, actas] = await Promise.all([
        fetchAllPaginated<{ goles: number | null; team_slug: string }>((from, to) =>
          supabase.from('fcf_stats').select('goles, team_slug').range(from, to)
        ),
        fetchAllPaginated<{ acta_url: string }>((from, to) =>
          supabase.from('actas_procesadas').select('acta_url').range(from, to)
        ),
      ]);
      if (cancelled) return;
      const goals = stats.reduce((sum, r) => sum + (r.goles ?? 0), 0);
      const teams = new Set(stats.map(r => r.team_slug)).size;
      const matches = new Set(actas.map(a => a.acta_url)).size;
      setTotals({ players: stats.length, teams, goals, matches });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Temporització ───────────────────────────────────────────────────────────
  // Quan arriben les dades: es fa el count-up (~1,1s) i es mantenen visibles
  // una estona abans del fade. Així no es veuen 0 esperant ni marxa massa aviat.
  useEffect(() => {
    if (totals === null) return;
    const HOLD = 2000; // count-up + temps de lectura dels totals
    const t1 = setTimeout(() => setLeaving(true), HOLD);
    const t2 = setTimeout(() => onDone(), HOLD + 900); // fade-out de 900ms
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [totals, onDone]);

  // Límit de seguretat: si les dades no arriben mai, marxa igualment
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 6500);
    const t2 = setTimeout(() => onDone(), 6500 + 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  const ready = totals !== null;
  const players = useCountUp(totals?.players ?? 0, ready);
  const teams = useCountUp(totals?.teams ?? 0, ready);
  const goals = useCountUp(totals?.goals ?? 0, ready);
  const matches = useCountUp(totals?.matches ?? 0, ready);

  return (
    <div
      role="status"
      aria-label="Carregant FemStats"
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 px-4 transition-opacity duration-[900ms] ease-out',
        leaving ? 'opacity-0' : 'opacity-100'
      )}
      style={{ background: 'var(--app-bg)' }}
    >
      {/* Logo — entrada suau */}
      <img
        src="/lockup_analytics.svg"
        alt="FemStats"
        className="h-20 sm:h-24 w-auto animate-fade-up dark:hidden"
      />
      <img
        src="/lockup_analytics_dark.svg"
        alt="FemStats"
        className="h-20 sm:h-24 w-auto animate-fade-up hidden dark:block"
      />

      {/* Totals globals */}
      <div className="flex gap-2.5 sm:gap-3.5 w-full max-w-[460px] animate-fade-up">
        <SplashTile value={players} label="Jugadores" ready={ready} />
        <SplashTile value={teams} label="Equips" ready={ready} />
        <SplashTile value={goals} label="Gols" accent ready={ready} />
        <SplashTile value={matches} label="Partits" ready={ready} />
      </div>
    </div>
  );
}
