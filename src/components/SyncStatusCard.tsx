/**
 * SyncStatusCard.tsx — SC1
 * Indicador compacte d'una línia + acordió expandible per als detalls.
 */

import { Calendar, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { cn, formatDateRelative } from '../lib/utils';
import type { ActaProcesada } from '../types';

interface SyncStatusCardProps {
  actas: ActaProcesada[];
  season: string;
  leagueName: string;
}

export default function SyncStatusCard({ actas, season, leagueName }: SyncStatusCardProps) {
  const [expanded, setExpanded] = useState(false);

  const lastSync   = actas[0]?.processed_at;
  const totalActas = actas.length;

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
    <div className="mb-4">
      {/* ── Línia compacta ───────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
        {/* Punt de color d'estat */}
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            totalActas > 0
              ? 'bg-emerald-400'
              : 'bg-neutral-300 dark:bg-neutral-600'
          )}
        />

        {totalActas > 0 ? (
          <span>
            <span className="font-semibold text-[var(--app-text)]">{totalActas}</span>{' '}
            actes · {uniqueTeams.size} equips ·{' '}
            {lastSync ? formatDateRelative(lastSync) : ''}
          </span>
        ) : (
          <span>Sense dades per a la temporada {season}</span>
        )}

        {totalActas > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="ml-auto text-brand hover:underline underline-offset-2 font-semibold shrink-0 transition-colors"
          >
            {expanded ? 'amagar' : 'detalls'}
          </button>
        )}
      </div>

      {/* ── Panell expandit (acordió) ─────────────────────────── */}
      {expanded && totalActas > 0 && (
        <div className="mt-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 text-[11px] space-y-1 animate-fade-up">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
            <RefreshCw size={11} />
            <span>
              Última sync:{' '}
              <span className="text-[var(--app-text)] font-medium">
                {formatDate(lastSync!)}
              </span>
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
      )}
    </div>
  );
}
