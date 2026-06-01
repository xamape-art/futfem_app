import { cn } from '../lib/utils';
import type { League } from '../types';

interface Props {
  leagues: League[];
  selectedCompetitionKey: string | null;
  selectedGroupId: string | null;
  onCompetitionChange: (key: string) => void;
  onGroupChange: (id: string | null) => void;
}

function groupLabel(league: League): string {
  const m = league.group_path.match(/grup-(\d+)$/);
  return m ? `Gr.${m[1]}` : league.short_name;
}

export default function CompetitionSelector({
  leagues,
  selectedCompetitionKey,
  selectedGroupId,
  onCompetitionChange,
  onGroupChange,
}: Props) {
  if (leagues.length <= 1) return null;

  // Competitions úniques preservant sort_order
  const seen = new Set<string>();
  const competitions: { key: string; name: string }[] = [];
  for (const l of leagues) {
    const key = l.competition_key ?? l.id;
    if (!seen.has(key)) {
      seen.add(key);
      competitions.push({ key, name: l.competition_name ?? l.short_name });
    }
  }

  // Grups de la competició seleccionada
  const groups = leagues
    .filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mb-3 space-y-2">
      {/* Fila de competicions — wrap per mostrar-les totes */}
      <div className="flex flex-wrap gap-2">
        {competitions.map(c => (
          <button
            key={c.key}
            onClick={() => onCompetitionChange(c.key)}
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-1.5 text-[12px] font-semibold rounded-full border transition-colors',
              selectedCompetitionKey === c.key
                ? 'bg-brand text-white border-brand'
                : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand hover:text-brand'
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Fila de grups — només si hi ha més d'un grup */}
      {groups.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => onGroupChange(null)}
            className={cn(
              'shrink-0 whitespace-nowrap px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors',
              selectedGroupId === null
                ? 'bg-brand/15 text-brand border-brand/40'
                : 'bg-[var(--card-bg)] text-neutral-400 border-[var(--card-border)] hover:border-brand/50 hover:text-brand'
            )}
          >
            Tots els grups
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => onGroupChange(g.id)}
              className={cn(
                'shrink-0 whitespace-nowrap px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors',
                selectedGroupId === g.id
                  ? 'bg-brand/15 text-brand border-brand/40'
                  : 'bg-[var(--card-bg)] text-neutral-400 border-[var(--card-border)] hover:border-brand/50 hover:text-brand'
              )}
            >
              {groupLabel(g)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
