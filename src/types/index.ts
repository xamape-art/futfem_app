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
