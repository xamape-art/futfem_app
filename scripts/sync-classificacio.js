/**
 * scripts/sync-classificacio.js — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza la clasificación de una liga desde la web de la FCF → Supabase
 * (tabla fcf_classificacio). Generalizado para múltiples ligas: la liga se pasa
 * con --league (mismo group_path que sync-actas.js).
 *
 * La clasificación es un snapshot completo: cada ejecución hace upsert de todas
 * las filas (una por equipo) de la liga+temporada. Idempotente.
 *
 * USO:
 *   node scripts/sync-classificacio.js \
 *     --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
 *     --season 2627 \
 *     [--dry-run]
 *
 *   --league <group_path>  group_path FCF de la liga (OBLIGATORIO)
 *   --season 2526|2627     Código FCF de temporada (default: 2627)
 *   --dry-run              Solo parsea y muestra, no escribe en Supabase
 *
 * VARIABLES DE ENTORNO requeridas (salvo --dry-run):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Polyfill WebSocket para Node.js < 22
if (typeof globalThis.WebSocket === 'undefined') {
  const { default: ws } = await import('ws');
  globalThis.WebSocket = ws;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const LEAGUE_PATH = getFlag('--league', null);      // OBLIGATORIO
const FCF_SEASON  = getFlag('--season', '2627');    // '2526' | '2627'
const DRY_RUN     = args.includes('--dry-run');

const SEASON_APP = FCF_SEASON.length === 4
  ? `${FCF_SEASON.slice(0, 2)}-${FCF_SEASON.slice(2)}`
  : FCF_SEASON;

const FCF_BASE = 'https://www.fcf.cat';

// ─── Validación ────────────────────────────────────────────────────────────────

if (!LEAGUE_PATH) {
  console.error('\n❌ --league <group_path> es obligatorio\n');
  console.error('Ejemplo:');
  console.error('  node scripts/sync-classificacio.js \\');
  console.error('    --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \\');
  console.error('    --season 2627\n');
  process.exit(1);
}

if (!DRY_RUN && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('\n❌ Faltan variables de entorno:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY\n');
  process.exit(1);
}

// ─── Supabase (lazy: no se crea en --dry-run) ──────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

const num = (t) => {
  const n = parseInt(String(t).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
};

function log(msg)  { console.log(`  ${msg}`); }
function info(msg) { console.log(`\n🔵 ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function err(msg)  { console.log(`  ❌ ${msg}`); }

// ─── Resolver liga desde Supabase ─────────────────────────────────────────────

async function resolveLeague(groupPath) {
  const { data, error } = await getSupabase()
    .from('leagues')
    .select('id, name, group_path')
    .eq('group_path', groupPath)
    .single();

  if (error || !data) {
    err(`Liga no encontrada en Supabase: "${groupPath}"`);
    if (error) err(`Detalle: ${error.message || error.code}`);
    process.exit(1);
  }
  return data;
}

// ─── Parse clasificación ──────────────────────────────────────────────────────
// Estructura verificada en las categorías Tercera, Preferent, 1ª Div, Cadet e
// Infantil (idéntica: 23 celdas). Mapeo de columnas:
//   td[0]=posición · td[4]=punts · td[6..9]=PJ,G,E,P · td[19]=F · td[20]=C
// Se valida cada fila (pj=g+e+p y punts=3g+e) para no guardar basura si la web
// cambiara de estructura.

function parseClassificacio(html) {
  const $ = cheerio.load(html);

  let table = null;
  $('table').each((_, t) => {
    if (table) return;
    if ($(t).find('tbody tr a[href*="/equip/"]').length >= 3) table = t;
  });
  // Sin tabla = temporada aún no comenzada (la página existe pero está vacía).
  if (!table) return [];

  const rows = [];
  $(table).find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find('td');
    if (tds.length < 20) return;

    // El separador del enlace varía por categoría (/fn/, /pf/, /1f/…), así que
    // tomamos el último segmento de la URL como slug (robusto para todas).
    const equipHref = $tr.find('a[href*="/equip/"]').attr('href') || '';
    const slug = (equipHref.split('/').pop() || '').trim();
    if (!slug) return;

    const name = ($tr.find('td.tl a').first().text() || slug).replace(/\s+/g, ' ').trim();

    const posicio  = num($(tds[0]).text());
    const punts    = num($(tds[4]).text());
    const pj       = num($(tds[6]).text());
    const guanyats = num($(tds[7]).text());
    const empatats = num($(tds[8]).text());
    const perduts  = num($(tds[9]).text());
    const gf       = num($(tds[19]).text());
    const gc       = num($(tds[20]).text());

    // Coherencia estructural: PJ = G+E+P siempre. Los puntos deben ser ≤ 3·G+E
    // (pueden ser MENOS por sanciones/deducciones de la FCF, nunca más). Si no
    // cuadra, es que las columnas se han desalineado → se omite la fila.
    const coherent = pj === guanyats + empatats + perduts
      && punts <= guanyats * 3 + empatats
      && punts >= 0;
    if (!coherent) {
      warn(`Fila incoherente "${name}" (P${posicio}): PJ=${pj} G=${guanyats} E=${empatats} P=${perduts} Pts=${punts} → se omite`);
      return;
    }

    rows.push({
      season: SEASON_APP,
      team_slug: slug,
      team_name: name,
      posicio, pj, guanyats, empatats, perduts, gf, gc, punts,
      updated_at: new Date().toISOString(),
    });
  });

  return rows.sort((a, b) => a.posicio - b.posicio);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FUTFEM_APP · Sync Clasificación FCF');
  console.log(`  League:     ${LEAGUE_PATH}`);
  console.log(`  FCF_SEASON: ${FCF_SEASON}  →  App season: ${SEASON_APP}`);
  console.log(`  DRY_RUN:    ${DRY_RUN}`);
  console.log('════════════════════════════════════════════════════════\n');

  // En dry-run no tocamos Supabase (ni resolvemos league_id).
  const league = DRY_RUN ? { id: null, name: LEAGUE_PATH } : await resolveLeague(LEAGUE_PATH);

  const url = `${FCF_BASE}/classificacio/${FCF_SEASON}/${LEAGUE_PATH}`;
  info(`Descargando clasificación: ${url}`);

  const res = await fetch(url, { headers: { 'User-Agent': 'FUTFEM-App/1.0 (dades@futfem.cat)' } });
  if (!res.ok) {
    err(`HTTP ${res.status} al descargar la clasificación. ¿Temporada ${SEASON_APP} aún sin datos?`);
    process.exit(res.status === 404 ? 0 : 1);
  }

  const rows = parseClassificacio(await res.text());

  if (rows.length === 0) {
    log(`Sin filas de clasificación para "${league.name}" · ${SEASON_APP} (temporada no comenzada o web vacía).`);
    process.exit(0);
  }

  log(`${rows.length} equipos parseados:`);
  for (const r of rows) {
    log(`  ${String(r.posicio).padStart(2)}. ${r.team_name.padEnd(38)} PJ ${r.pj}  ${r.guanyats}-${r.empatats}-${r.perduts}  GF ${r.gf} GC ${r.gc} (${r.gf - r.gc >= 0 ? '+' : ''}${r.gf - r.gc})  ${r.punts} pts`);
  }

  if (DRY_RUN) {
    console.log('\n  [DRY-RUN] No se ha escrito nada en Supabase.\n');
    process.exit(0);
  }

  const payload = rows.map(r => ({ ...r, league_id: league.id }));
  const { error } = await getSupabase()
    .from('fcf_classificacio')
    .upsert(payload, { onConflict: 'league_id,season,team_slug' });

  if (error) {
    err(`Error al guardar en Supabase: ${error.message}`);
    process.exit(1);
  }

  ok(`Clasificación "${league.name}" · ${SEASON_APP} guardada (${rows.length} equipos).`);
  console.log('\n════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
