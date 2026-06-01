-- =============================================================================
-- FUTFEM_APP · Migració v3 — match_duration per lliga
-- Afegeix la durada real del partit (minuts) a cada lliga.
-- Executar a: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS match_duration INT NOT NULL DEFAULT 90;

-- Lligues Cadet F11 → 2 parts de 40 min = 80 min
UPDATE leagues SET match_duration = 80
WHERE group_path LIKE '%cadet%';

-- La resta (Tercera Fed, Preferent, Primera Divisió sènior/juvenil) → 90 min
-- ja queden a 90 pel DEFAULT.

-- Verifica:
SELECT short_name, group_path, match_duration
FROM leagues
ORDER BY sort_order;
