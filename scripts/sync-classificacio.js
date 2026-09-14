/**
 * scripts/sync-classificacio.js — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza la clasificación de una liga desde la API JSON de la FCF → Supabase
 * (tabla fcf_classificacio). Sustituye al raspado del HTML, que murió cuando la
 * FCF rehízo su web en Next.js (agosto 2026): la ruta vieja da 307 → 404 y el
 * script antiguo lo tomaba por "temporada sin datos" y salía en verde.
 *
 * La clasificación es un snapshot completo: cada ejecución reemplaza las filas
 * de la liga+temporada. Idempotente.
 *
 * USO:
 *   node scripts/sync-classificacio.js \
 *     --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
 *     --season 2627 \
 *     [--dry-run]
 *
 *   --league <group_path>  group_path FCF de la liga (OBLIGATORIO)
 *   --season 2627|2728…    Código FCF de temporada (default: 2627)
 *   --dry-run              Solo descarga y muestra, no escribe en Supabase
 *
 * VARIABLES DE ENTORNO requeridas (salvo --dry-run):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
// Mismo slug y misma resolución de grupo que el sync de actas: así los
// team_slug de la clasificación y de fcf_stats son idénticos y el clic en un
// equipo de la tabla lleva a sus jugadoras.
import { slugify, resolveGrupId, FROZEN_SEASONS } from './sync-actas-api.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const LEAGUE_PATH = getFlag('--league', null);      // OBLIGATORIO
const FCF_SEASON  = getFlag('--season', '2627');
const DRY_RUN     = args.includes('--dry-run');

const SEASON_APP = FCF_SEASON.length === 4
  ? `${FCF_SEASON.slice(0, 2)}-${FCF_SEASON.slice(2)}`
  : FCF_SEASON;

const API        = 'https://www.fcf.cat/api/competition';
const USER_AGENT = 'Mozilla/5.0 (compatible; FUTFEM-App/2.1; dades@futfem.cat)';

// ─── Utils ────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg)  { console.log(`  ${msg}`); }
function info(msg) { console.log(`\n🔵 ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function err(msg)  { console.log(`  ❌ ${msg}`); }

async function apiGet(path) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < 4) await sleep(1000 * attempt);
    }
  }
  throw new Error(`GET ${path}: ${lastErr.message}`);
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/** "3.00" → 3 */
const toInt = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? Math.round(x) : 0;
};

/**
 * played/won/drawn/lost NO son números: son DOS cifras pegadas —casa y fuera—
 * con las dos mitades del mismo ancho. "1111" = 11 + 11 = 22 jugados; "10" en
 * la J1 es 1 + 0, no diez. Leerlo con parseInt da una tabla falsa que además
 * pasa el control de coherencia (10 = 0 + 0 + 10). Los goles NO van partidos.
 *
 * Si la longitud es impar, el formato ha cambiado y adivinar dónde partir
 * ("110" ¿es 1+10 o 11+0?) sería inventarse la tabla: se devuelve NaN.
 */
function homePlusAway(v) {
  const s = String(v ?? '').trim();
  if (s === '') return 0;
  if (!/^\d+$/.test(s) || s.length % 2 !== 0) return NaN;
  const half = s.length / 2;
  return parseInt(s.slice(0, half), 10) + parseInt(s.slice(half), 10);
}

function parseClassificacio(payload, season) {
  const data = Array.isArray(payload) ? payload : (payload?.data ?? []);
  const rows = [];
  const rejected = [];

  for (const e of data) {
    const name = (e.team?.name || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    const posicio  = toInt(e.position);
    const punts    = toInt(e.points);
    const pj       = homePlusAway(e.played);
    const guanyats = homePlusAway(e.won);
    const empatats = homePlusAway(e.drawn);
    const perduts  = homePlusAway(e.lost);
    const gf       = toInt(e.goalsFor);
    const gc       = toInt(e.goalsAgainst);

    if ([pj, guanyats, empatats, perduts].some(Number.isNaN)) {
      rejected.push(`"${name}": played/won/drawn/lost ilegibles (${e.played}/${e.won}/${e.drawn}/${e.lost})`);
      continue;
    }
    // Necesario pero NO suficiente (una lectura mal partida puede cuadrar
    // consigo misma): PJ = G+E+P, y puntos nunca por encima de 3·G+E (por
    // debajo sí, la FCF sanciona).
    if (!(pj === guanyats + empatats + perduts && punts <= guanyats * 3 + empatats && punts >= 0)) {
      rejected.push(`"${name}": incoherente PJ=${pj} G=${guanyats} E=${empatats} P=${perduts} Pts=${punts}`);
      continue;
    }

    rows.push({
      season,
      team_slug: slugify(name),
      team_name: name,
      posicio, pj, guanyats, empatats, perduts, gf, gc, punts,
    });
  }

  return { rows: rows.sort((a, b) => a.posicio - b.posicio), rejected };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!LEAGUE_PATH) {
    console.error('\n❌ --league <group_path> es obligatorio\n');
    process.exit(1);
  }
  if (FROZEN_SEASONS.has(SEASON_APP)) {
    console.error(`\n🔒 PROHIBIDO: la temporada ${SEASON_APP} está CONGELADA. No se recalcula su clasificación.\n`);
    process.exit(1);
  }
  if (!DRY_RUN && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('\n❌ Faltan variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY\n');
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FUTFEM_APP · Sync Clasificación FCF (API JSON)');
  console.log(`  League:     ${LEAGUE_PATH}`);
  console.log(`  FCF_SEASON: ${FCF_SEASON}  →  App season: ${SEASON_APP}`);
  console.log(`  DRY_RUN:    ${DRY_RUN}`);
  console.log('════════════════════════════════════════════════════════');

  info('Resolviendo grupId en la API…');
  const grp = await resolveGrupId(LEAGUE_PATH, FCF_SEASON);
  if (grp.notPublished) {
    log(`${grp.notPublished}. Nada que sincronizar.`);
    process.exit(0);
  }
  ok(`${grp.label} → grupId ${grp.grupId}`);

  const { rows, rejected } = parseClassificacio(await apiGet(`classificacio?grupId=${grp.grupId}`), SEASON_APP);

  for (const r of rejected) warn(`fila omitida · ${r}`);
  if (rejected.length) {
    // Una tabla a medias miente: si falta algún equipo no se escribe nada.
    err(`${rejected.length} fila(s) no se han podido leer: la API ha cambiado de formato. No se escribe nada.`);
    process.exit(1);
  }
  if (rows.length === 0) {
    log('La clasificación aún está vacía (temporada sin partidos jugados). Nada que sincronizar.');
    process.exit(0);
  }

  log(`${rows.length} equipos:`);
  for (const r of rows) {
    const dg = r.gf - r.gc;
    log(`  ${String(r.posicio).padStart(2)}. ${r.team_name.padEnd(38)} PJ ${r.pj}  ${r.guanyats}-${r.empatats}-${r.perduts}  GF ${r.gf} GC ${r.gc} (${dg >= 0 ? '+' : ''}${dg})  ${r.punts} pts`);
  }

  if (DRY_RUN) {
    console.log('\n  [DRY-RUN] No se ha escrito nada en Supabase.\n');
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: league, error: lgErr } = await supabase
    .from('leagues').select('id, name').eq('group_path', LEAGUE_PATH).single();
  if (lgErr || !league) {
    err(`Liga no encontrada en Supabase: "${LEAGUE_PATH}"`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('fcf_classificacio')
    .upsert(rows.map(r => ({ ...r, league_id: league.id, updated_at: now })), { onConflict: 'league_id,season,team_slug' });
  if (error) {
    err(`Error al guardar en Supabase: ${error.message}`);
    process.exit(1);
  }

  // Equipos que ya no están en la tabla (retirados, cambio de nombre) → fuera.
  const keep = new Set(rows.map(r => r.team_slug));
  const { data: existing } = await supabase
    .from('fcf_classificacio').select('id, team_slug').eq('league_id', league.id).eq('season', SEASON_APP);
  const stale = (existing ?? []).filter(r => !keep.has(r.team_slug)).map(r => r.id);
  if (stale.length) {
    await supabase.from('fcf_classificacio').delete().in('id', stale);
    log(`${stale.length} fila(s) obsoleta(s) eliminada(s)`);
  }

  ok(`Clasificación "${league.name}" · ${SEASON_APP} guardada (${rows.length} equipos).`);
  console.log('\n════════════════════════════════════════════════════════\n');
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop()
);
if (invokedDirectly) {
  main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
}

export { parseClassificacio, homePlusAway };
