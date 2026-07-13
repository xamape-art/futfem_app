// ─── Tipos compartidos — FUTFEM_APP ──────────────────────────────────────────

export interface League {
  id: string;
  name: string;
  short_name: string;
  group_path: string;
  fcf_seasons: string[];   // ['2526', '2627']
  active: boolean;
  sort_order: number;
  created_at: string;
  competition_key: string | null;   // agrupa grups d'una mateixa competició
  competition_name: string | null;  // nom visible de la competició
  match_duration: number;           // durada del partit en minuts (80 o 90)
}

export interface FcfStat {
  id: string;
  league_id: string;
  season: string;           // '25-26' | '26-27'
  team_slug: string;
  team_name: string;
  player_fcf_name: string;  // 'RIBAS CAELLES, LAURA'
  dorsal: number | null;
  partidos: number;
  titular: number;
  suplente: number;
  minutos: number;
  goles: number;
  amarillas: number;
  rojas: number;
  updated_at: string;
}

export interface ClassificacioRow {
  id: string;
  league_id: string;
  season: string;           // '25-26' | '26-27'
  team_slug: string;
  team_name: string;        // 'BARCELONA, F.C. C'
  posicio: number;
  pj: number;
  guanyats: number;
  empatats: number;
  perduts: number;
  gf: number;
  gc: number;
  punts: number;
  updated_at: string;
}

export interface ActaProcesada {
  id: string;
  league_id: string;
  season: string;
  acta_url: string;
  jornada: number | null;
  local_slug: string | null;
  visitant_slug: string | null;
  local_name: string | null;
  visitant_name: string | null;
  players_count: number | null;
  processed_at: string;
}

export type SortKey =
  | 'player_fcf_name'
  | 'partidos'
  | 'titular'
  | 'suplente'
  | 'minutos'
  | 'goles'
  | 'amarillas'
  | 'rojas';

export interface TeamOption {
  slug: string;
  name: string;
}
