/**
 * SkeletonTable.tsx — L1 + L2
 * Skeleton loaders animats per a StatsTable i TopTen.
 * Evita layout shift i dona feedback visual de càrrega.
 */

// ─── L1: Skeleton per a la taula d'estadístiques ─────────────────────────────

export function SkeletonTable({ rows = 10 }: { rows?: number }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden animate-pulse">
      {/* Capçalera de la taula */}
      <div className="flex gap-2 items-center px-3 py-2 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
        <div className="h-2.5 w-28 bg-neutral-200 dark:bg-neutral-700 rounded" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded ml-auto"
            style={{ width: `${16 + (i % 3) * 6}px` }}
          />
        ))}
      </div>

      {/* Files */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--card-border)]"
          style={{ opacity: 1 - i * (0.06) }}
        >
          {/* Nom */}
          <div className="flex flex-col gap-1 w-36 shrink-0">
            <div
              className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded"
              style={{ width: `${90 + (i % 5) * 14}px` }}
            />
            <div className="h-2 w-8 bg-neutral-100 dark:bg-neutral-800 rounded" />
          </div>
          {/* Columnes numèriques */}
          {Array.from({ length: 7 }).map((_, j) => (
            <div
              key={j}
              className="h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded ml-auto"
              style={{ width: `${14 + (j % 3) * 4}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── L2: Skeleton per al grid de Top 20 ──────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden animate-pulse">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 bg-neutral-200 dark:bg-neutral-700">
        <div className="w-6 h-6 rounded bg-white/20" />
        <div className="h-3 w-28 bg-white/20 rounded" />
      </div>
      {/* Files de skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--card-border)]"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <div className="w-5 h-5 bg-neutral-200 dark:bg-neutral-700 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-1">
            <div
              className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded"
              style={{ width: `${80 + (i % 4) * 20}px` }}
            />
            <div className="h-2 w-20 bg-neutral-100 dark:bg-neutral-800 rounded" />
          </div>
          <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-700 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTopTen() {
  return (
    <div>
      <div className="h-3 w-64 bg-neutral-200 dark:bg-neutral-700 rounded mb-5 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
