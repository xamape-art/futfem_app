/**
 * SyncStatusCard.tsx
 * Tarjeta de estado del sync automático.
 * Adaptado de DatosSection.tsx (ATClub) — sin lógica de equipo propio.
 */

import { Calendar, Database, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ActaProcesada } from '../types';

interface SyncStatusCardProps {
  actas: ActaProcesada[];
  season: string;
  leagueName: string;
}

export default function SyncStatusCard({ actas, season, leagueName }: SyncStatusCardProps) {
  const lastSync = actas[0]?.processed_at;
  const totalActas = actas.length;

  // Equipos únicos que han aparecido en las actas procesadas
  const uniqueTeams = new Set<string>();
  for (const a of actas) {
    if (a.local_slug)    uniqueTeams.add(a.local_slug);
    if (a.visitant_slug) uniqueTeams.add(a.visitant_slug);
  }

  // Próxima sync automática: siguiente lunes 10:00 UTC
  const nextSync = (() => {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Dom, 1=Lun
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + daysUntilMonday);
    next.setUTCHours(10, 0, 0, 0);
    return next;
  })();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDateShort = (d: Date) =>
    d.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="mb-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-brand" />
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--app-text)]">
            Sync FCF · {season}
          </span>
        </div>
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full',
            totalActas > 0
              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-[var(--card-border)]'
          )}
        >
          {totalActas > 0 ? `${totalActas} actes · ${uniqueTeams.size} equips` : 'Sense dades'}
        </span>
      </div>

      {totalActas > 0 ? (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
            <RefreshCw size={11} />
            <span>
              Última sync:{' '}
              <span className="text-[var(--app-text)] font-medium">{formatDate(lastSync!)}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
            <Calendar size={11} />
            <span>
              Pròxima auto:{' '}
              <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                {formatDateShort(nextSync)}
              </span>
            </span>
          </div>
          <div className="text-neutral-400 dark:text-neutral-500">
            {leagueName} ·{' '}
            <button
              className="text-brand hover:underline underline-offset-2"
              onClick={() => {
                const log = actas
                  .slice(0, 10)
                  .map(
                    a =>
                      `J${a.jornada ?? '?'}: ${a.local_name ?? a.local_slug} vs ${a.visitant_name ?? a.visitant_slug} (${a.players_count ?? 0} jug.)`
                  )
                  .join('\n');
                alert(`Darreres actes processades:\n\n${log}`);
              }}
            >
              Veure log
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-neutral-500">
          ⏳ No hi ha dades per a la temporada {season}. Executa el script de sincronització.
        </div>
      )}
    </div>
  );
}
