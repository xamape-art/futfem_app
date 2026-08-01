-- =============================================================================
-- FUTFEM_APP · Migració v5 — detall de gols (minut + tipus) per lliga
-- Executar a: Supabase Dashboard → SQL Editor → New query
-- Font: taula "Gols" de cada acta FCF (minut, escut d'equip, jugadora, tipus).
-- =============================================================================

-- Un gol per fila. S'omple des de scripts/sync-actas.js (només per a lligues amb
-- leagues.track_goals = true). Idempotent: abans d'inserir, s'esborren els gols
-- d'aquella acta (per acta_url).

CREATE TABLE IF NOT EXISTS fcf_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season          TEXT        NOT NULL,               -- '25-26' | '26-27'
  jornada         INT,
  team_slug       TEXT,
  team_name       TEXT,                               -- 'BARCELONA, F.C. C'
  player_fcf_name TEXT,                               -- 'RIUS VILLAMANA, MARIA'
  minute          INT,                                -- minut numèric (per ordenar/agrupar)
  minute_raw      TEXT,                               -- "70'", "45+2'"
  goal_type       TEXT        NOT NULL DEFAULT 'normal', -- 'normal' | 'penal' | 'pp'
  marcador        TEXT,                               -- "1 - 0"
  acta_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fcf_goals_league_season ON fcf_goals(league_id, season);
CREATE INDEX IF NOT EXISTS idx_fcf_goals_acta          ON fcf_goals(acta_url);

-- Opt-in per lliga: quines lligues guarden el detall de gols.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS track_goals BOOLEAN NOT NULL DEFAULT false;

-- Activar-ho a Tercera Federació · Grup V.
UPDATE leagues SET track_goals = true
WHERE group_path = 'futbol-femeni/tercera-federacio-futbol-femeni/grup-v';

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE fcf_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcf_goals_public_read" ON fcf_goals;
CREATE POLICY "fcf_goals_public_read"
  ON fcf_goals FOR SELECT USING (true);
