-- =============================================================================
-- FUTFEM_APP · Schema v1
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

-- ─── 1. leagues — master de ligas/divisiones FCF ─────────────────────────────
-- group_path = segmento de URL FCF (único por liga)
-- fcf_seasons = array de códigos de temporada FCF: ['2526', '2627']
-- active = incluir en el cron automático

CREATE TABLE IF NOT EXISTS leagues (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  short_name  TEXT        NOT NULL,
  group_path  TEXT        NOT NULL UNIQUE,
  fcf_seasons TEXT[]      NOT NULL DEFAULT '{}',
  active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. fcf_stats — estadísticas acumuladas por jugadora ─────────────────────
-- Una fila por (league_id + season + team_slug + player_fcf_name)
-- Los stats numéricos se SUMAN en cada sync (no se reemplazan)

CREATE TABLE IF NOT EXISTS fcf_stats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season          TEXT        NOT NULL,   -- '25-26' | '26-27'
  team_slug       TEXT        NOT NULL,   -- 'vic-riuprimer-refo-futbol-club-a'
  team_name       TEXT        NOT NULL,   -- 'Vic Riuprimer A'
  player_fcf_name TEXT        NOT NULL,   -- 'RIBAS CAELLES, LAURA'
  dorsal          INT,
  partidos        INT         NOT NULL DEFAULT 0,
  titular         INT         NOT NULL DEFAULT 0,
  suplente        INT         NOT NULL DEFAULT 0,
  minutos         INT         NOT NULL DEFAULT 0,
  goles           INT         NOT NULL DEFAULT 0,
  amarillas       INT         NOT NULL DEFAULT 0,
  rojas           INT         NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fcf_stats_unique UNIQUE (league_id, season, team_slug, player_fcf_name)
);

CREATE INDEX IF NOT EXISTS idx_fcf_stats_league_season
  ON fcf_stats(league_id, season);

CREATE INDEX IF NOT EXISTS idx_fcf_stats_team
  ON fcf_stats(league_id, season, team_slug);

-- ─── 3. actas_procesadas — idempotencia del sync ─────────────────────────────
-- Registra cada acta ya procesada. El script comprueba esta tabla antes de
-- volver a procesar. acta_url es globalmente única (las URLs FCF son únicas).

CREATE TABLE IF NOT EXISTS actas_procesadas (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season        TEXT        NOT NULL,
  fcf_season    TEXT        NOT NULL,   -- '2526' | '2627'
  acta_url      TEXT        NOT NULL UNIQUE,
  jornada       INT,
  local_slug    TEXT,
  visitant_slug TEXT,
  local_name    TEXT,
  visitant_name TEXT,
  players_count INT         DEFAULT 0,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actas_league_season
  ON actas_procesadas(league_id, season);

-- ─── 4. RLS — SELECT público, writes solo via service_role ───────────────────

ALTER TABLE leagues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcf_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE actas_procesadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues_public_read"          ON leagues;
DROP POLICY IF EXISTS "fcf_stats_public_read"        ON fcf_stats;
DROP POLICY IF EXISTS "actas_procesadas_public_read" ON actas_procesadas;

CREATE POLICY "leagues_public_read"
  ON leagues FOR SELECT USING (true);

CREATE POLICY "fcf_stats_public_read"
  ON fcf_stats FOR SELECT USING (true);

CREATE POLICY "actas_procesadas_public_read"
  ON actas_procesadas FOR SELECT USING (true);

-- ─── 5. Seed inicial — primera liga ──────────────────────────────────────────
-- Añadir más ligas insertando filas adicionales.
-- Para desactivar del cron: SET active = false

INSERT INTO leagues (name, short_name, group_path, fcf_seasons, active, sort_order)
VALUES (
  'Tercera Federació - Grup V',
  '3ª Fed Gr.V',
  'futbol-femeni/tercera-federacio-futbol-femeni/grup-v',
  ARRAY['2526', '2627'],
  true,
  1
)
ON CONFLICT (group_path) DO NOTHING;

-- ─── Para añadir más ligas en el futuro: ──────────────────────────────────────
-- INSERT INTO leagues (name, short_name, group_path, fcf_seasons, active, sort_order)
-- VALUES ('Nom de la Lliga', 'Abrev', 'futbol-femeni/path-fcf', ARRAY['2627'], true, 2)
-- ON CONFLICT (group_path) DO NOTHING;
