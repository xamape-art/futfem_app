/**
 * scripts/sync-actas.js — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza estadísticas de jugadoras desde actas FCF → Supabase (fcf_stats).
 * Generalizado para múltiples ligas: la liga se pasa con --league.
 *
 * USO:
 *   node scripts/sync-actas.js \
 *     --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
 *     --season 2627 \
 *     [--force] [--dry-run]
 *
 *   --league <group_path>  group_path FCF de la liga (OBLIGATORIO)
 *   --season 2526|2627     Código FCF de temporada (default: 2627)
 *   --force                Reimporta actas ya procesadas
 *   --dry-run              Solo parsea, no escribe en Supabase
 *
 * VARIABLES DE ENTORNO requeridas:
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
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : def;
};

const LEAGUE_PATH = getFlag('--league', null);         // OBLIGATORIO
const FCF_SEASON  = getFlag('--season', '2627');       // '2526' | '2627'
const FORCE       = args.includes('--force');
const DRY_RUN     = args.includes('--dry-run');

// Convertir '2627' → '26-27'
const SEASON_APP = FCF_SEASON.length === 4
  ? `${FCF_SEASON.slice(0, 2)}-${FCF_SEASON.slice(2)}`
  : FCF_SEASON;

// ─── Validación inicial ────────────────────────────────────────────────────────

if (!LEAGUE_PATH) {
  console.error('\n❌ --league <group_path> es obligatorio\n');
  console.error('Ejemplo:');
  console.error('  node scripts/sync-actas.js \\');
  console.error('    --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \\');
  console.error('    --season 2627\n');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Faltan variables de entorno:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY\n');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FCF_BASE       = 'https://www.fcf.cat';
const MAX_JORNADES   = 38;   // Máximo de jornadas a intentar
const FETCH_DELAY_MS = 500;  // Pausa entre peticiones HTTP (ms)

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Utils ────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normName(name) {
  return (name || '').trim().toUpperCase().normalize('NFC');
}

function parseMinute(text) {
  const m = (text || '').replace(/[^0-9]/g, '');
  const n = parseInt(m);
  return isNaN(n) ? null : Math.min(n, 90);
}

async function safeFetch(url) {
  await sleep(FETCH_DELAY_MS);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FUTFEM-App/1.0 (dades@futfem.cat)' }
  });
  return res;
}

function log(msg)  { console.log(`  ${msg}`); }
function info(msg) { console.log(`\n🔵 ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function err(msg)  { console.log(`  ❌ ${msg}`); }

// ─── 0. Resolver liga desde Supabase ─────────────────────────────────────────

async function resolveLeague(groupPath) {
  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, group_path')
    .eq('group_path', groupPath)
    .single();

  if (error || !data) {
    err(`Liga no encontrada en Supabase: "${groupPath}"`);
    if (error) err(`Detalle: ${error.message || error.code}`);
    err('Asegúrate de haber ejecutado el SQL de inicialización y de que la liga exista en la tabla leagues.');
    process.exit(1);
  }

  return data; // { id, name, group_path }
}

// ─── 1. Calendar: obtener URLs de todas las actas del grupo ──────────────────

async function fetchCalendar(fcfSeason, groupPath) {
  info(`Buscando actas del grupo en temporada FCF ${fcfSeason}…`);
  const allActas = new Set();
  let emptyJornades = 0;

  for (let j = 1; j <= MAX_JORNADES; j++) {
    const url = `${FCF_BASE}/resultats/${fcfSeason}/${groupPath}/jornada-${j}`;
    const res  = await safeFetch(url);

    if (!res.ok) {
      log(`J${j} → HTTP ${res.status}, fin de temporada`);
      break;
    }

    const html = await res.text();

    const anyActas = /href="https:\/\/www\.fcf\.cat\/acta\//.test(html);
    if (!anyActas) {
      emptyJornades++;
      if (emptyJornades >= 3) {
        log(`J${j} → ${emptyJornades} jornadas vacías consecutivas, fin de temporada`);
        break;
      }
      log(`J${j} → sin actas (descanso o jornada futura), continuando…`);
      continue;
    }
    emptyJornades = 0;

    // Solo actas que pertenecen a este groupPath
    const re = new RegExp(
      `https://www\\.fcf\\.cat/acta/${fcfSeason}/${groupPath.replace(/\//g, '/')}/[^"]+`,
      'g'
    );
    const matches      = html.match(re) || [];
    const uniqueMatches = [...new Set(matches)];
    uniqueMatches.forEach(u => allActas.add(u));
    log(`J${j} → ${uniqueMatches.length} actas`);
  }

  const result = [...allActas];
  log(`Total: ${result.length} actas encontradas`);
  return result;
}

// ─── 2. Parse acta HTML ───────────────────────────────────────────────────────

function parseLineupTable($, table) {
  const players = [];
  $(table).find('tbody tr').each((_, row) => {
    const name   = normName($(row).find('td a').first().text());
    const dorsalT = $(row).find('.num-samarreta-acta2').first().text().trim();
    const dorsal  = parseInt(dorsalT) || null;
    if (name) players.push({ name, dorsal });
  });
  return players;
}

function parseSubsTable($, table) {
  const subs = [];
  const rows = $(table).find('tbody tr').toArray();
  let i = 0;
  while (i < rows.length) {
    const $row1    = $(rows[i]);
    const minuteTd = $row1.find('td[rowspan="2"]');
    if (minuteTd.length > 0) {
      const minute   = parseMinute(minuteTd.text());
      const surtName = normName($row1.find('td a').first().text());
      if (i + 1 < rows.length) {
        const entraName = normName($(rows[i + 1]).find('td a').first().text());
        if (surtName && entraName) {
          subs.push({ minute: minute ?? 90, surt: surtName, entra: entraName });
        }
        i += 2;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return subs;
}

function parseTargetesTable($, table) {
  const cards = [];
  $(table).find('tbody tr').each((_, row) => {
    const name   = normName($(row).find('a').first().text());
    if (!name) return;
    const groges = $(row).find('.groga-s').length;
    const rojes  = $(row).find('.roja-s').length;
    if (groges > 0 || rojes > 0) {
      cards.push({ name, groga: groges, roja: rojes });
    }
  });
  return cards;
}

function parseGolsTable($, table) {
  const goals = [];
  $(table).find('tbody tr').each((_, row) => {
    const name   = normName($(row).find('td a').first().text());
    const imgSrc = $(row).find('img.acta-escut-gol').attr('src') || '';
    if (name) goals.push({ name, imgSrc });
  });
  return goals;
}

async function parseActa(url) {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Extraer slugs de la URL — el separador varía por división:
  //   Tercera Federació → /fn/local-slug/fn/visitant-slug
  //   Preferent, etc.   → /pf/local-slug/pf/visitant-slug
  const sep = url.includes('/fn/') ? '/fn/' : url.includes('/pf/') ? '/pf/' : '/fn/';
  const slugParts    = url.split(sep);
  const localSlug    = slugParts[1] || '';
  const visitantSlug = slugParts[2] || '';

  // Nombres de equipo
  let localName    = localSlug;
  let visitantName = visitantSlug;
  $('a[href*="/equip/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const span = $(el).find('span').text().trim();
    if (!span) return;
    if (href.endsWith(`${sep}${localSlug}`))    localName    = span;
    if (href.endsWith(`${sep}${visitantSlug}`)) visitantName = span;
  });

  const jornadaMatch = html.match(/jornada-(\d+)/);
  const jornada = jornadaMatch ? parseInt(jornadaMatch[1]) : null;

  const titularsTables = $('th:contains("Titulars")').map((_, th) => $(th).closest('table')).toArray();
  const suplentsTables = $('th:contains("Suplents")').map((_, th) => $(th).closest('table')).toArray();
  const subsTables     = $('th:contains("Substitucions")').map((_, th) => $(th).closest('table')).toArray();
  const targetesTables = $('th:contains("Targetes")').map((_, th) => $(th).closest('table')).toArray();
  const golsTable      = $('th:contains("Gols")').closest('table').first();

  const localTitulars    = titularsTables[0]  ? parseLineupTable($, titularsTables[0])   : [];
  const localSuplents    = suplentsTables[0]  ? parseLineupTable($, suplentsTables[0])   : [];
  const localSubs        = subsTables[0]      ? parseSubsTable($, subsTables[0])         : [];
  const localCards       = targetesTables[0]  ? parseTargetesTable($, targetesTables[0]) : [];

  const visitantTitulars = titularsTables[1]  ? parseLineupTable($, titularsTables[1])   : [];
  const visitantSuplents = suplentsTables[1]  ? parseLineupTable($, suplentsTables[1])   : [];
  const visitantSubs     = subsTables[1]      ? parseSubsTable($, subsTables[1])         : [];
  const visitantCards    = targetesTables[1]  ? parseTargetesTable($, targetesTables[1]) : [];

  // Goles
  const allGoals         = parseGolsTable($, golsTable);
  const localPlayerNames = new Set([...localTitulars, ...localSuplents].map(p => p.name));
  const visitantPNames   = new Set([...visitantTitulars, ...visitantSuplents].map(p => p.name));

  const localGoals = {}, visitantGoals = {};
  for (const g of allGoals) {
    if (visitantPNames.has(g.name)) {
      visitantGoals[g.name] = (visitantGoals[g.name] || 0) + 1;
    } else if (localPlayerNames.has(g.name)) {
      localGoals[g.name] = (localGoals[g.name] || 0) + 1;
    } else {
      if (g.imgSrc.toLowerCase().includes(visitantSlug.substring(0, 6))) {
        visitantGoals[g.name] = (visitantGoals[g.name] || 0) + 1;
      } else {
        localGoals[g.name] = (localGoals[g.name] || 0) + 1;
      }
    }
  }

  const calcStats = (titulars, suplents, subs, cards, goals) => {
    const subsMap  = {};
    for (const s of subs) {
      subsMap[s.surt]  = { minute: s.minute, role: 'surt' };
      subsMap[s.entra] = { minute: s.minute, role: 'entra' };
    }
    const cardsMap = {};
    for (const c of cards) {
      cardsMap[c.name] = { groga: c.groga, roja: c.roja };
    }
    const result = {};
    for (const p of titulars) {
      const sub    = subsMap[p.name];
      const minutos = sub?.role === 'surt' ? sub.minute : 90;
      const card   = cardsMap[p.name] || { groga: 0, roja: 0 };
      result[p.name] = {
        dorsal: p.dorsal, partidos: 1, titular: 1, suplente: 0,
        minutos, goles: goals[p.name] || 0, amarillas: card.groga, rojas: card.roja,
      };
    }
    for (const p of suplents) {
      const sub     = subsMap[p.name];
      const entered = sub?.role === 'entra';
      const minutos = entered ? (90 - sub.minute) : 0;
      const card    = cardsMap[p.name] || { groga: 0, roja: 0 };
      result[p.name] = {
        dorsal: p.dorsal, partidos: entered ? 1 : 0, titular: 0, suplente: 1,
        minutos, goles: goals[p.name] || 0, amarillas: card.groga, rojas: card.roja,
      };
    }
    return result;
  };

  const localStats    = calcStats(localTitulars, localSuplents, localSubs, localCards, localGoals);
  const visitantStats = calcStats(visitantTitulars, visitantSuplents, visitantSubs, visitantCards, visitantGoals);

  return {
    localSlug, localName, localStats,
    visitantSlug, visitantName, visitantStats,
    jornada,
    totalPlayers: Object.keys(localStats).length + Object.keys(visitantStats).length,
  };
}

// ─── 3. Upsert a fcf_stats ────────────────────────────────────────────────────

async function upsertStats(statsMap, teamSlug, teamName, leagueId, season) {
  for (const [playerName, s] of Object.entries(statsMap)) {
    if (!playerName) continue;

    const { data: existing } = await supabase
      .from('fcf_stats')
      .select('id, partidos, titular, suplente, minutos, goles, amarillas, rojas')
      .eq('league_id', leagueId)
      .eq('season', season)
      .eq('team_slug', teamSlug)
      .eq('player_fcf_name', playerName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('fcf_stats')
        .update({
          dorsal:    s.dorsal ?? existing.dorsal,
          partidos:  existing.partidos  + s.partidos,
          titular:   existing.titular   + s.titular,
          suplente:  existing.suplente  + s.suplente,
          minutos:   existing.minutos   + s.minutos,
          goles:     existing.goles     + s.goles,
          amarillas: existing.amarillas + s.amarillas,
          rojas:     existing.rojas     + s.rojas,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) warn(`upsert update error para ${playerName}: ${error.message}`);
    } else {
      const { error } = await supabase
        .from('fcf_stats')
        .insert({
          league_id:       leagueId,
          season,
          team_slug:       teamSlug,
          team_name:       teamName,
          player_fcf_name: playerName,
          dorsal:          s.dorsal ?? null,
          partidos:        s.partidos,
          titular:         s.titular,
          suplente:        s.suplente,
          minutos:         s.minutos,
          goles:           s.goles,
          amarillas:       s.amarillas,
          rojas:           s.rojas,
        });
      if (error) warn(`insert error para ${playerName}: ${error.message}`);
    }
  }
}

// ─── 4. Marcar acta como procesada ───────────────────────────────────────────

async function markProcessed(url, meta, leagueId) {
  const { error } = await supabase
    .from('actas_procesadas')
    .insert({
      league_id:     leagueId,
      season:        SEASON_APP,
      fcf_season:    FCF_SEASON,
      acta_url:      url,
      jornada:       meta.jornada,
      local_slug:    meta.localSlug,
      visitant_slug: meta.visitantSlug,
      local_name:    meta.localName,
      visitant_name: meta.visitantName,
      players_count: meta.totalPlayers,
    })
    .select()
    .maybeSingle();

  if (error && !error.message.includes('duplicate')) {
    warn(`markProcessed error: ${error.message}`);
  }
}

// ─── 5. Comprobar si una acta ya fue procesada ────────────────────────────────

async function isAlreadyProcessed(url) {
  if (FORCE) return false;
  const { data } = await supabase
    .from('actas_procesadas')
    .select('id')
    .eq('acta_url', url)
    .maybeSingle();
  return data !== null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FUTFEM_APP · Sync Actas FCF');
  console.log(`  League:    ${LEAGUE_PATH}`);
  console.log(`  FCF_SEASON: ${FCF_SEASON}  →  App season: ${SEASON_APP}`);
  console.log(`  FORCE:     ${FORCE}`);
  console.log(`  DRY_RUN:   ${DRY_RUN}`);
  console.log('════════════════════════════════════════════════════════\n');

  // Resolver league_id desde Supabase
  const league = await resolveLeague(LEAGUE_PATH);
  console.log(`  Liga: "${league.name}" (id: ${league.id})\n`);

  // Obtener todas las actas del grupo
  const actaUrls = await fetchCalendar(FCF_SEASON, LEAGUE_PATH);

  if (actaUrls.length === 0) {
    log(`No se encontraron actas para la liga "${league.name}" en FCF_SEASON=${FCF_SEASON}.`);
    log('La temporada aún no ha comenzado o no hay partidos publicados.');
    process.exit(0);
  }

  // Procesar cada acta
  let processed = 0, skipped = 0, errors = 0;

  for (const url of actaUrls) {
    const shortUrl = url.split('/fn/').slice(1).join(' vs ');
    info(`Procesando: ${shortUrl}`);

    if (await isAlreadyProcessed(url)) {
      log('Ya procesada → skip');
      skipped++;
      continue;
    }

    try {
      const result = await parseActa(url);

      log(`Jornada ${result.jornada ?? '?'} · ${result.localName} vs ${result.visitantName}`);
      log(`Local: ${Object.keys(result.localStats).length} jug · Visitant: ${Object.keys(result.visitantStats).length} jug`);

      if (DRY_RUN) {
        for (const [name, s] of Object.entries(result.localStats)) {
          log(`  [DRY-RUN LOCAL]    ${name}: PJ=${s.partidos} TIT=${s.titular} SUP=${s.suplente} MIN=${s.minutos} G=${s.goles} TA=${s.amarillas} TR=${s.rojas}`);
        }
        for (const [name, s] of Object.entries(result.visitantStats)) {
          log(`  [DRY-RUN VISITANT] ${name}: PJ=${s.partidos} TIT=${s.titular} SUP=${s.suplente} MIN=${s.minutos} G=${s.goles} TA=${s.amarillas} TR=${s.rojas}`);
        }
        skipped++;
        continue;
      }

      if (Object.keys(result.localStats).length > 0) {
        await upsertStats(result.localStats, result.localSlug, result.localName, league.id, SEASON_APP);
      }
      if (Object.keys(result.visitantStats).length > 0) {
        await upsertStats(result.visitantStats, result.visitantSlug, result.visitantName, league.id, SEASON_APP);
      }

      await markProcessed(url, result, league.id);
      ok(`${result.totalPlayers} jugadoras guardadas`);
      processed++;

    } catch (e) {
      err(`Error procesando ${shortUrl}: ${e.message}`);
      errors++;
    }
  }

  // Resumen final
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  ✅ Procesadas: ${processed}`);
  console.log(`  ⏭️  Saltadas:   ${skipped}`);
  console.log(`  ❌ Errores:    ${errors}`);
  console.log('════════════════════════════════════════════════════════\n');

  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
