/**
 * scripts/sync-actas-api.js — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza estadísticas de jugadoras desde la API JSON de la FCF → Supabase
 * (fcf_stats + fcf_goals). Sustituye al scraping HTML de sync-actas.js, que
 * quedó roto cuando la FCF rehízo su web en Next.js (agosto 2026).
 *
 * USO:
 *   node scripts/sync-actas-api.js \
 *     --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
 *     --season 2627 \
 *     [--dry-run] [--verbose]
 *
 *   --league <group_path>  group_path FCF de la liga (OBLIGATORIO)
 *   --season 2627|2728…    Código FCF de temporada (default: 2627)
 *   --dry-run              Solo calcula e informa, no escribe en Supabase
 *   --verbose              Detalla eventos que no se han podido atribuir
 *
 * VARIABLES DE ENTORNO requeridas:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * ─── DECISIONES DE DISEÑO ─────────────────────────────────────────────────────
 *
 * 1. TEMPORADA 25-26 CONGELADA: el script se NIEGA a ejecutarse sobre ella.
 *    Ver FROZEN_SEASONS. Candado duro, sin flag que lo desactive.
 *
 * 2. SOLO EL PROXY www.fcf.cat/api/competition. Desde septiembre de 2026
 *    backend.fcf.cat responde 403 al acceso directo.
 *
 * 3. ENLACE POR ID. El acta trae el `id` de cada jugadora en jugadores_* y el
 *    del cuerpo técnico en tecnicos_*; goles, tarjetas y sustituciones apuntan a
 *    ese id. (Hasta septiembre de 2026 la API no lo publicaba y había que
 *    reconstruirlo; ya no hace falta.)
 *
 * 4. RECONSTRUCCIÓN COMPLETA E IDEMPOTENTE en cada ejecución: se recalcula la
 *    temporada entera desde las actas y se reemplazan sus filas. Volver a
 *    ejecutarlo nunca duplica datos, y un acta corregida por la FCF se propaga
 *    sola. Por eso NO existe --force.
 *
 * 5. LAS SUPLENTES QUE NO JUEGAN SE CONSERVAN (suplente=1, partidos=0,
 *    minutos=0), como hacía el scraper viejo y como están los datos de la 25/26.
 *    Así una tarjeta vista en el banquillo no se pierde.
 *
 * 6. Una liga aún no publicada por la FCF NO es un error ni un "fin de
 *    temporada": sale con código 0 sin tocar nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// Polyfill WebSocket para Node.js < 22
if (typeof globalThis.WebSocket === 'undefined') {
  const { default: ws } = await import('ws');
  globalThis.WebSocket = ws;
}

// ─── Temporadas congeladas ────────────────────────────────────────────────────
// Datos ya scrapeados y verificados que NO se deben volver a importar nunca.
// Decisión explícita del usuario. No añadir un flag para saltárselo.
const FROZEN_SEASONS = new Set(['25-26']);

// Un gol en propia puerta NO se le cuenta como gol a la jugadora que lo marca
// (sí se guarda en fcf_goals con goal_type='pp', y suma al marcador del rival).
const COUNT_OWN_GOALS_AS_PLAYER_GOALS = false;

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const getFlag = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const LEAGUE_PATH = getFlag('--league', null);   // OBLIGATORIO
const FCF_SEASON  = getFlag('--season', '2627');
const DRY_RUN     = args.includes('--dry-run');
const VERBOSE     = args.includes('--verbose');

// '2627' → '26-27'
const SEASON_APP = FCF_SEASON.length === 4
  ? `${FCF_SEASON.slice(0, 2)}-${FCF_SEASON.slice(2)}`
  : FCF_SEASON;

// ─── Config API ───────────────────────────────────────────────────────────────

const API            = 'https://www.fcf.cat/api/competition';
const ACTA_URL_BASE  = 'https://www.fcf.cat/ca/competicio/acta'; // URL pública, para actas_procesadas
const DISCIPLINA_FEM = '19308237';  // Futbol Femení
const USER_AGENT     = 'Mozilla/5.0 (compatible; FUTFEM-App/2.1; dades@futfem.cat)';
const CONCURRENCY    = 4;
const RETRIES        = 4;
const TIMEOUT_MS     = 20000;

// ─── Utils ────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg)  { console.log(`  ${msg}`); }
function info(msg) { console.log(`\n🔵 ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function err(msg)  { console.log(`  ❌ ${msg}`); }

/** Normaliza un nombre de persona para usarlo como clave. */
function normName(name) {
  return (name || '')
    .trim()
    .toUpperCase()
    .normalize('NFC')
    .replace(/\s*,\s*/g, ', ')   // "LEE , PARKER" → "LEE, PARKER"
    .replace(/\s+/g, ' ');
}

/**
 * Slug estilo FCF: sin acentos, minúsculas, no-alfanumérico → guion. Los
 * puntos y apóstrofos se ELIMINAN: "AEM, S.E. B" → "aem-se-b", que es la
 * convención de los team_slug ya guardados.
 */
function slugify(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function apiGet(path) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(1000 * attempt);
    }
  }
  throw new Error(`GET ${path}: ${lastErr.message}`);
}

/** Ejecuta tasks con concurrencia limitada, preservando el orden. */
async function pool(items, fn, concurrency = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

// ─── CANDADO: temporadas congeladas ───────────────────────────────────────────
// Se comprueba al arrancar, antes de tocar red o BD, y OTRA VEZ dentro de cada
// función que escribe. La redundancia es intencionada.

function assertNotFrozen(season = SEASON_APP) {
  if (FROZEN_SEASONS.has(season) || FROZEN_SEASONS.has(FCF_SEASON)) {
    console.error(`\n🔒 PROHIBIDO: la temporada ${season} está CONGELADA.`);
    console.error('   Sus datos ya están importados y verificados; volver a importarlos');
    console.error('   los sobrescribiría. Este candado no tiene flag para desactivarlo.');
    console.error(`   Temporadas congeladas: ${[...FROZEN_SEASONS].join(', ')}\n`);
    process.exit(1);
  }
}

/** Valida CLI + entorno. Dentro de main() para que el módulo se pueda importar. */
function assertUsable() {
  if (!LEAGUE_PATH) {
    console.error('\n❌ --league <group_path> es obligatorio\n');
    console.error('Ejemplo:');
    console.error('  node scripts/sync-actas-api.js \\');
    console.error('    --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \\');
    console.error('    --season 2627\n');
    process.exit(1);
  }
  assertNotFrozen();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\n❌ Faltan variables de entorno:');
    console.error('   SUPABASE_URL');
    console.error('   SUPABASE_SERVICE_ROLE_KEY\n');
    process.exit(1);
  }
}

// Se crea solo si hay credenciales, para que el módulo se pueda importar en
// tests sin entorno. assertUsable() garantiza que existe antes de cualquier uso.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ─── 0. Resolver liga en Supabase ─────────────────────────────────────────────

async function resolveLeague(groupPath) {
  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, group_path, match_duration, track_goals')
    .eq('group_path', groupPath)
    .single();

  if (error || !data) {
    err(`Liga no encontrada en Supabase: "${groupPath}"`);
    if (error) err(`Detalle: ${error.message || error.code}`);
    process.exit(1);
  }
  return data;
}

// ─── 1. Resolver grupId de la API a partir del group_path ─────────────────────
// group_path = 'futbol-femeni/<slug-competicio>/<slug-grup>'. Slugificar las
// labels de la API reproduce exactamente esos slugs (verificado 32/32 ligas).

async function resolveGrupId(groupPath, fcfSeason) {
  const [, compSlug, grupSlug] = groupPath.split('/');

  const seasonLabel = `20${fcfSeason.slice(0, 2)}-20${fcfSeason.slice(2)}`;
  const temporadas  = await apiGet('temporadas');
  const temporada   = temporadas.find(t => t.label === seasonLabel);
  if (!temporada) {
    err(`La FCF no conoce la temporada ${seasonLabel}.`);
    process.exit(1);
  }

  const comps = await apiGet(`competicions?temporada=${temporada.value}&disciplinaId=${DISCIPLINA_FEM}`);
  const comp  = (comps || []).find(c => slugify(c.label) === compSlug);
  if (!comp) {
    return { notPublished: `la competición "${compSlug}" aún no está publicada para ${seasonLabel}` };
  }

  const grupos = await apiGet(`grupos?competicioId=${comp.value}`);
  const grupo  = (grupos || []).find(g => slugify(g.label) === grupSlug);
  if (!grupo) {
    return { notPublished: `el grupo "${grupSlug}" de "${compSlug}" aún no está publicado para ${seasonLabel}` };
  }

  return { grupId: grupo.value, competicioId: comp.value, label: `${comp.label} · ${grupo.label}` };
}

// ─── 2. Descargar actas cerradas del grupo ────────────────────────────────────

async function fetchActas(grupId) {
  const partidos = await apiGet(`partidos?grupId=${grupId}`);
  const all      = Object.values(partidos || {}).flat();
  const closed   = all.filter(m => String(m.CERRADA) === '1');

  log(`${all.length} partidos en el calendario · ${closed.length} con acta cerrada`);
  if (closed.length === 0) return { actas: [], total: all.length };

  const actas = await pool(closed, async m => {
    try {
      const acta = await apiGet(`acta?codacta=${m.CODACTA}`);  // ¡'codacta' en minúsculas!
      return {
        ...acta,
        _jornada: parseInt(m.JORNADA) || null,
        // El nombre de `partidos` lleva el sufijo del filial ("AEM, S.E. B");
        // el de la cabecera del acta no.
        _nombreCasa:  m.NOMBRE_CASA,
        _nombreFuera: m.NOMBRE_FUERA,
      };
    } catch (e) {
      warn(`acta ${m.CODACTA}: ${e.message}`);
      return null;
    }
  });

  return { actas: actas.filter(Boolean), total: all.length };
}

// ─── 3. Cálculo de la temporada ───────────────────────────────────────────────

const SIDES = [
  ['local',     'CODEQUIPO_CASA'],
  ['visitante', 'CODEQUIPO_FUERA'],
];

/**
 * El delegado puede colarse en jugadores_* con dorsal 0; y cualquiera que esté
 * en tecnicos_* es cuerpo técnico, no jugadora.
 */
function isPlayer(acta, side, p) {
  if (String(p.dorsal) === '0') return false;
  const staff = acta[`tecnicos_equipo_${side}`] ?? [];
  return !staff.some(t =>
    (t.id != null && String(t.id) === String(p.id)) || normName(t.nombre) === normName(p.nombre)
  );
}

const GOAL_TYPE = { 100: 'normal', 101: 'penal', 102: 'pp' };

/** "100" amarilla; "101" roja (directa o doble amarilla). Otro código → se avisa. */
const isRedCard = t => String(t.tipo_tarjeta) !== '100' || t.segunda_amarilla != null;

function computeSeason(actas, league) {
  const DUR = league.match_duration || 90;
  const clampMin = v => Math.min(Math.max(Number.isFinite(v) ? v : DUR, 0), DUR);

  const stats      = new Map();   // `${team_slug}|${player}` → fila
  const goalRows   = [];
  const teamNames  = new Map();   // codequipo → { slug, name }
  const unresolved = { goles: [], tarjetas: [] };
  const unknownCardCodes = new Set();
  let totalGoles = 0, totalTarjetas = 0, staffCards = 0;

  // codequipo → slug/nombre, a partir del nombre con sufijo de `partidos`.
  for (const a of actas) {
    for (const [side, teamKey] of SIDES) {
      const code = a[teamKey];
      const name = (side === 'local'
        ? (a._nombreCasa  ?? a.equipo_local?.NOMBRE_EQUIPO)
        : (a._nombreFuera ?? a.equipo_visitante?.NOMBRE_EQUIPO)) ?? '';
      if (code && !teamNames.has(code)) teamNames.set(code, { slug: slugify(name), name: name.trim().replace(/\s+/g, ' ') });
    }
  }
  // Dos equipos del mismo grupo con el mismo slug → se desempata con el codequipo.
  const bySlug = new Map();
  for (const [code, t] of teamNames) (bySlug.get(t.slug) ?? bySlug.set(t.slug, []).get(t.slug)).push(code);
  for (const [slug, codes] of bySlug) {
    if (codes.length > 1) {
      warn(`slug "${slug}" compartido por ${codes.length} equipos del grupo → se desempata con el codequipo`);
      for (const code of codes) teamNames.get(code).slug = `${slug}-${code}`;
    }
  }

  const rowFor = (code, player) => {
    const team = teamNames.get(code);
    const key  = `${team.slug}|${player}`;
    if (!stats.has(key)) {
      stats.set(key, {
        team_slug: team.slug, team_name: team.name, player_fcf_name: player,
        dorsal: null, partidos: 0, titular: 0, suplente: 0,
        minutos: 0, goles: 0, amarillas: 0, rojas: 0,
      });
    }
    return stats.get(key);
  };

  for (const a of actas) {
    const rosters = {};   // side → Map(id → nombre normalizado)

    for (const [side, teamKey] of SIDES) {
      const code    = a[teamKey];
      const players = (a[`jugadores_equipo_${side}`] ?? []).filter(p => isPlayer(a, side, p));
      const byId    = new Map(players.map(p => [String(p.id), normName(p.nombre)]));
      const staffIds = new Set((a[`tecnicos_equipo_${side}`] ?? []).filter(t => t.id != null).map(t => String(t.id)));
      rosters[side] = byId;

      const subs  = a[`sustituciones_equipo_${side}`] ?? [];
      const entra = new Map(subs.map(s => [String(s.id_jugador_entra), clampMin(parseInt(s.minuto))]));
      const sale  = new Map(subs.map(s => [String(s.id_jugador_sale),  clampMin(parseInt(s.minuto))]));

      // Una expulsada deja de jugar en el minuto de la roja, aunque el acta no
      // la registre como sustituida.
      const redAt = new Map();
      for (const t of a[`tarjetas_equipo_${side}`] ?? []) {
        if (!['100', '101'].includes(String(t.tipo_tarjeta))) unknownCardCodes.add(String(t.tipo_tarjeta));
        if (!isRedCard(t)) continue;
        const id = String(t.id_jugador), m = clampMin(parseInt(t.minuto));
        redAt.set(id, Math.min(redAt.get(id) ?? m, m));
      }

      // Partidos / titularidades / minutos
      for (const p of players) {
        const id   = String(p.id);
        const row  = rowFor(code, normName(p.nombre));
        row.dorsal = parseInt(p.dorsal) || row.dorsal;

        const exits  = [sale.get(id), redAt.get(id)].filter(v => v != null);
        const exitAt = exits.length ? Math.min(...exits) : DUR;

        if (p.titular === '1') {
          row.partidos++;
          row.titular++;
          row.minutos += exitAt;
        } else {
          // Suplente: se conserva aunque no salga al campo (sus tarjetas de
          // banquillo cuentan). Solo suma partido y minutos si entró.
          row.suplente++;
          if (entra.has(id)) {
            row.partidos++;
            row.minutos += Math.max(0, exitAt - entra.get(id));
          }
        }
      }

      // Tarjetas: se cuentan a la jugadora haya jugado o no.
      for (const t of a[`tarjetas_equipo_${side}`] ?? []) {
        totalTarjetas++;
        const id = String(t.id_jugador);
        if (byId.has(id)) {
          const row = rowFor(code, byId.get(id));
          if (isRedCard(t)) row.rojas++; else row.amarillas++;
        } else if (staffIds.has(id)) {
          staffCards++;   // tarjeta al cuerpo técnico: no es de jugadora
        } else {
          unresolved.tarjetas.push(`acta ${a.CODACTA} ${side} id ${id} min ${t.minuto}`);
        }
      }
    }

    // ── Goles. Un gol vive en el array del equipo de la JUGADORA, pero si es en
    //    propia puerta (tipo_gol 102) cuenta para el rival.
    const events = [];
    for (const [side, teamKey] of SIDES) {
      const scorerCode = a[teamKey];
      const rivalCode  = a[side === 'local' ? 'CODEQUIPO_FUERA' : 'CODEQUIPO_CASA'];
      for (const g of a[`goles_equipo_${side}`] ?? []) {
        const type = GOAL_TYPE[g.tipo_gol] ?? 'normal';
        const min  = parseInt(g.minuto);
        events.push({
          minute:     Number.isFinite(min) ? min : null,
          type,
          scorerCode,
          creditCode: type === 'pp' ? rivalCode : scorerCode,
          side:       type === 'pp' ? (side === 'local' ? 'visitante' : 'local') : side,
          name:       rosters[side].get(String(g.id_jugador)) ?? null,
          id:         String(g.id_jugador),
          acta:       a.CODACTA,
        });
      }
    }

    events.sort((x, y) => (x.minute ?? 999) - (y.minute ?? 999));
    let home = 0, away = 0;
    for (const e of events) {
      totalGoles++;
      if (e.side === 'local') home++; else away++;

      if (!e.name) {
        unresolved.goles.push(`acta ${e.acta} id ${e.id} min ${e.minute}`);
      } else if (e.type !== 'pp' || COUNT_OWN_GOALS_AS_PLAYER_GOALS) {
        rowFor(e.scorerCode, e.name).goles++;
      }

      if (league.track_goals) {
        const credited = teamNames.get(e.creditCode);
        goalRows.push({
          jornada:         a._jornada,
          team_slug:       credited?.slug ?? null,
          team_name:       credited?.name ?? null,
          player_fcf_name: e.name,
          minute:          e.minute,
          minute_raw:      e.minute != null ? `${e.minute}'` : null,
          goal_type:       e.type,
          marcador:        `${home} - ${away}`,
          acta_url:        `${ACTA_URL_BASE}/${a.CODACTA}`,
        });
      }
    }
  }

  if (unknownCardCodes.size) warn(`códigos de tarjeta no documentados (contados como roja): ${[...unknownCardCodes].join(', ')}`);

  return { rows: [...stats.values()], goalRows, unresolved, staffCards, totalGoles, totalTarjetas, teamNames };
}

// ─── 4. Escritura en Supabase ─────────────────────────────────────────────────

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function writeStats(rows, league) {
  assertNotFrozen();

  const payload = rows.map(r => ({
    league_id: league.id,
    season:    SEASON_APP,
    ...r,
    updated_at: new Date().toISOString(),
  }));

  for (const batch of chunk(payload, 500)) {
    const { error } = await supabase
      .from('fcf_stats')
      .upsert(batch, { onConflict: 'league_id,season,team_slug,player_fcf_name' });
    if (error) { err(`upsert fcf_stats: ${error.message}`); process.exit(1); }
  }
  ok(`${payload.length} filas de fcf_stats escritas`);

  // Purgar filas obsoletas por diferencia, no borrando primero: la app nunca
  // ve la temporada vacía aunque la ejecución se corte a medias.
  const keep = new Set(rows.map(r => `${r.team_slug}|${r.player_fcf_name}`));
  const { data: existing, error: selErr } = await supabase
    .from('fcf_stats')
    .select('id, team_slug, player_fcf_name')
    .eq('league_id', league.id)
    .eq('season', SEASON_APP);
  if (selErr) { warn(`no se pudo comprobar filas obsoletas: ${selErr.message}`); return; }

  const stale = (existing ?? []).filter(r => !keep.has(`${r.team_slug}|${r.player_fcf_name}`)).map(r => r.id);
  if (stale.length) {
    for (const batch of chunk(stale, 200)) {
      const { error } = await supabase.from('fcf_stats').delete().in('id', batch);
      if (error) warn(`purga de obsoletos: ${error.message}`);
    }
    log(`${stale.length} filas obsoletas eliminadas`);
  }
}

async function writeGoals(goalRows, league) {
  assertNotFrozen();
  if (!league.track_goals) return;

  const { error: delErr } = await supabase
    .from('fcf_goals')
    .delete()
    .eq('league_id', league.id)
    .eq('season', SEASON_APP);
  if (delErr) { err(`limpiando fcf_goals: ${delErr.message}`); process.exit(1); }

  if (!goalRows.length) return;
  const payload = goalRows.map(g => ({ league_id: league.id, season: SEASON_APP, ...g }));
  for (const batch of chunk(payload, 500)) {
    const { error } = await supabase.from('fcf_goals').insert(batch);
    if (error) { err(`insert fcf_goals: ${error.message}`); process.exit(1); }
  }
  ok(`${payload.length} goles en fcf_goals`);
}

async function markProcessed(actas, league, teamNames) {
  assertNotFrozen();

  const rows = actas.map(a => ({
    league_id:     league.id,
    season:        SEASON_APP,
    fcf_season:    FCF_SEASON,
    acta_url:      `${ACTA_URL_BASE}/${a.CODACTA}`,
    jornada:       a._jornada,
    local_slug:    teamNames.get(a.CODEQUIPO_CASA)?.slug ?? null,
    visitant_slug: teamNames.get(a.CODEQUIPO_FUERA)?.slug ?? null,
    local_name:    teamNames.get(a.CODEQUIPO_CASA)?.name ?? null,
    visitant_name: teamNames.get(a.CODEQUIPO_FUERA)?.name ?? null,
    players_count: (a.jugadores_equipo_local?.length ?? 0) + (a.jugadores_equipo_visitante?.length ?? 0),
  }));

  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from('actas_procesadas')
      .upsert(batch, { onConflict: 'acta_url', ignoreDuplicates: true });
    if (error) warn(`actas_procesadas: ${error.message}`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  assertUsable();

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FUTFEM_APP · Sync Actas FCF (API JSON)');
  console.log(`  League:     ${LEAGUE_PATH}`);
  console.log(`  FCF_SEASON: ${FCF_SEASON}  →  App season: ${SEASON_APP}`);
  console.log(`  DRY_RUN:    ${DRY_RUN}`);
  console.log(`  Congeladas: ${[...FROZEN_SEASONS].join(', ')}`);
  console.log('════════════════════════════════════════════════════════');

  const league = await resolveLeague(LEAGUE_PATH);
  log(`Liga: "${league.name}" · ${league.match_duration || 90} min · track_goals=${league.track_goals}`);

  info('Resolviendo grupId en la API…');
  const grp = await resolveGrupId(LEAGUE_PATH, FCF_SEASON);
  if (grp.notPublished) {
    log(`${grp.notPublished}.`);
    log('No es un error: las categorías base y Segona se publican más tarde. Nada que sincronizar.');
    process.exit(0);
  }
  ok(`${grp.label} → grupId ${grp.grupId}`);

  info('Descargando actas cerradas…');
  const { actas, total } = await fetchActas(grp.grupId);
  if (actas.length === 0) {
    log('Todavía no hay ninguna acta cerrada en este grupo. Nada que sincronizar.');
    process.exit(0);
  }
  ok(`${actas.length} actas descargadas`);

  info('Calculando…');
  const result = computeSeason(actas, league);

  const pct = (n, t) => (t === 0 ? '100.0' : ((100 * (t - n)) / t).toFixed(1));
  log(`${result.rows.length} jugadoras · ${result.totalGoles} goles · ${result.totalTarjetas} tarjetas (${result.staffCards} al cuerpo técnico)`);
  log(`atribución: goles ${pct(result.unresolved.goles.length, result.totalGoles)}% · tarjetas ${pct(result.unresolved.tarjetas.length, result.totalTarjetas - result.staffCards)}%`);
  if (result.unresolved.goles.length)    warn(`${result.unresolved.goles.length} goles sin atribuir`);
  if (result.unresolved.tarjetas.length) warn(`${result.unresolved.tarjetas.length} tarjetas sin atribuir`);
  if (VERBOSE) [...result.unresolved.goles, ...result.unresolved.tarjetas].forEach(u => log(`  sin atribuir: ${u}`));

  if (DRY_RUN) {
    info('DRY-RUN · no se escribe nada.');
    const top = [...result.rows].sort((x, y) => y.goles - x.goles || y.minutos - x.minutos).slice(0, 10);
    for (const r of top) {
      log(`  ${r.team_slug} · ${r.player_fcf_name}: PJ=${r.partidos} TIT=${r.titular} SUP=${r.suplente} MIN=${r.minutos} G=${r.goles} TA=${r.amarillas} TR=${r.rojas}`);
    }
    console.log('\n════════════════════════════════════════════════════════\n');
    return;
  }

  info('Escribiendo en Supabase…');
  await writeStats(result.rows, league);
  await writeGoals(result.goalRows, league);
  await markProcessed(actas, league, result.teamNames);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  ✅ ${league.name} · ${SEASON_APP}`);
  console.log(`     ${actas.length}/${total} actas · ${result.rows.length} jugadoras · ${result.totalGoles} goles`);
  console.log('════════════════════════════════════════════════════════\n');
}

// ─── Entrada ──────────────────────────────────────────────────────────────────
// Solo se ejecuta si se invoca directamente; así computeSeason (puro) se puede
// importar para verificar el cálculo sin arrancar el sync.

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop()
);

if (invokedDirectly) {
  main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
}

export { computeSeason, fetchActas, resolveGrupId, isPlayer, normName, slugify, FROZEN_SEASONS };
