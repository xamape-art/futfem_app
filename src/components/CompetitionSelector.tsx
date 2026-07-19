import { Layers } from 'lucide-react';
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

// Prop 5: categoritzar competicions per família (Sènior / Base) per poder-les
// agrupar i fer el selector més escanejable.
type Category = 'senior' | 'base';

function categoryOf(name: string): Category {
  return /cadet|juvenil|infantil|alev|benjam/i.test(name) ? 'base' : 'senior';
}

const CATEGORY_LABEL: Record<Category, string> = {
  senior: 'Sènior',
  base: 'Base',
};

export default function CompetitionSelector({
  leagues,
  selectedCompetitionKey,
  selectedGroupId,
  onCompetitionChange,
  onGroupChange,
}: Props) {
  if (leagues.length <= 1) return null;

  // Competitions úniques preservant sort_order, amb el nombre de grups de cada una
  const competitions: { key: string; name: string; groupCount: number }[] = [];
  const compIndex = new Map<string, number>();
  for (const l of leagues) {
    const key = l.competition_key ?? l.id;
    if (!compIndex.has(key)) {
      compIndex.set(key, competitions.length);
      competitions.push({ key, name: l.competition_name ?? l.short_name, groupCount: 0 });
    }
    competitions[compIndex.get(key)!].groupCount++;
  }

  // Grups de la competició seleccionada
  const groups = leagues
    .filter(l => (l.competition_key ?? l.id) === selectedCompetitionKey)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Prop 5: agrupar competicions per categoria, preservant l'ordre original
  const categorized: { cat: Category; items: typeof competitions }[] = [];
  for (const c of competitions) {
    const cat = categoryOf(c.name);
    let bucket = categorized.find(b => b.cat === cat);
    if (!bucket) {
      bucket = { cat, items: [] };
      categorized.push(bucket);
    }
    bucket.items.push(c);
  }
  // Ordre fix: Sènior primer, després Base
  categorized.sort((a, b) => (a.cat === 'senior' ? -1 : 1) - (b.cat === 'senior' ? -1 : 1));
  const showCategoryLabels = categorized.length > 1;
  const selectedComp = competitions.find(c => c.key === selectedCompetitionKey);

  const groupPillClass = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors',
      active
        ? 'bg-brand/15 text-brand border-brand/40'
        : 'bg-[var(--card-bg)] text-neutral-500 dark:text-neutral-400 border-[var(--card-border)] hover:border-brand/50 hover:text-brand'
    );

  return (
    <div className="mb-4">
      {/* Fila de competicions — agrupades per categoria (Prop 5) */}
      <div className="space-y-2.5">
        {categorized.map(bucket => {
          const holdsSelected = bucket.items.some(c => c.key === selectedCompetitionKey);
          return (
            <div key={bucket.cat}>
              {showCategoryLabels && (
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500 mb-1.5 pl-0.5">
                  {CATEGORY_LABEL[bucket.cat]}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {bucket.items.map(c => (
                  <button
                    key={c.key}
                    onClick={() => onCompetitionChange(c.key)}
                    className={cn(
                      'shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold rounded-full border transition-colors',
                      selectedCompetitionKey === c.key
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-[var(--card-bg)] text-neutral-600 dark:text-neutral-300 border-[var(--card-border)] hover:border-brand hover:text-brand'
                    )}
                  >
                    {c.name}
                    {c.groupCount > 1 && (
                      <span
                        title={`${c.groupCount} grups`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[11.5px] font-black leading-none',
                          selectedCompetitionKey === c.key
                            ? 'bg-white/25 text-white'
                            : 'bg-brand/10 text-brand'
                        )}
                      >
                        <Layers size={13} strokeWidth={2.5} />
                        {c.groupCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Selector de grups — enganxat a la competició seleccionada */}
              {holdsSelected && groups.length > 1 && (
                <div className="mt-2.5 ml-1.5 rounded-r-lg border-l-2 border-accent/60 bg-accent/[0.10] pl-3 pr-2.5 py-2.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Tria un grup de <span className="text-accent">{selectedComp?.name}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => onGroupChange(null)}
                      className={cn(
                        groupPillClass(selectedGroupId === null),
                        // Pulsa mentre no s'ha triat cap grup concret, per indicar
                        // que hi ha més opcions; s'atura en escollir-ne un.
                        selectedGroupId === null && 'animate-pulse-hint'
                      )}
                    >
                      Tots els grups
                    </button>
                    {groups.map(g => (
                      <button
                        key={g.id}
                        onClick={() => onGroupChange(g.id)}
                        className={groupPillClass(selectedGroupId === g.id)}
                      >
                        {groupLabel(g)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
