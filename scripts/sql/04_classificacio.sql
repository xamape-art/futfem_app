-- =============================================================================
-- FUTFEM_APP · Migració v4 — clasificación de liga (per league_id)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Fuente: https://www.fcf.cat/classificacio/<fcf_season>/<group_path>
-- =============================================================================

-- Snapshot semanal de la clasificación: una fila por (league_id + season + team).
-- Se refresca completo en cada sync con scripts/sync-classificacio.js.

CREATE TABLE IF NOT EXISTS fcf_classificacio (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season       TEXT        NOT NULL,                -- '25-26' | '26-27'
  team_slug    TEXT        NOT NULL,                -- 'barcelona-fc-c'
  team_name    TEXT        NOT NULL,                -- 'BARCELONA, F.C. C' (tal cual FCF)
  posicio      INT         NOT NULL,                -- posición en la tabla (1..N)
  pj           INT         NOT NULL DEFAULT 0,      -- partits jugats
  guanyats     INT         NOT NULL DEFAULT 0,      -- victòries (G)
  empatats     INT         NOT NULL DEFAULT 0,      -- empats (E)
  perduts      INT         NOT NULL DEFAULT 0,      -- derrotes (P)
  gf           INT         NOT NULL DEFAULT 0,      -- gols a favor (F)
  gc           INT         NOT NULL DEFAULT 0,      -- gols en contra (C)
  punts        INT         NOT NULL DEFAULT 0,      -- punts
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fcf_classificacio_unique UNIQUE (league_id, season, team_slug)
);

CREATE INDEX IF NOT EXISTS idx_fcf_classificacio_league_season
  ON fcf_classificacio(league_id, season, posicio);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- El script usa SERVICE_ROLE_KEY (bypass RLS). La app pública solo lee.

ALTER TABLE fcf_classificacio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcf_classificacio_public_read" ON fcf_classificacio;
CREATE POLICY "fcf_classificacio_public_read"
  ON fcf_classificacio FOR SELECT USING (true);
