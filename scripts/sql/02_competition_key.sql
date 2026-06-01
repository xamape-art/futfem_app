-- =============================================================================
-- FUTFEM_APP · Migració v2 — competition_key / competition_name
-- Agrupa lligues del mateix tipus en una "competició" per al selector de 2 nivells.
-- Executar a: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

-- 1. Afegir columnes (idempotent)
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS competition_key  TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS competition_name TEXT;

-- 2. Actualitzar les lligues conegudes
--    Si tens altres lligues, afegeix UPDATEs seguint el mateix patró.

UPDATE leagues SET competition_key = 'tercera-federacio',   competition_name = 'Tercera Federació'
WHERE group_path LIKE '%tercera-federacio%';

UPDATE leagues SET competition_key = 'primera-cadet-f11',   competition_name = '1ª Div Cadet F11'
WHERE group_path LIKE '%primera-divisio-femeni-cadet-f11%';

UPDATE leagues SET competition_key = 'segona-cadet-f11',    competition_name = '2ª Div Cadet F11'
WHERE group_path LIKE '%segona-divisio-femeni-cadet-f11%';

-- 3. Consulta per veure totes les lligues i completar les que faltin
--    Copia el resultat i afegeix UPDATEs per a les lligues sense competition_key.
SELECT sort_order, short_name, group_path, competition_key, competition_name
FROM leagues
ORDER BY sort_order;

-- Plantilla per a les lligues restants:
-- UPDATE leagues SET competition_key = 'clau-unica', competition_name = 'Nom Visible'
-- WHERE group_path LIKE '%el-teu-path%';
