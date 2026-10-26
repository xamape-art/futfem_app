/**
 * scripts/lib/fcf-cache.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Hace que los scripts de sync lean la FCF desde Supabase (fcf_cache) en vez de
 * desde fcf.cat.
 *
 * Desde el 23-10-2026 la FCF solo responde a navegadores: node, curl y pwsh
 * reciben 403 hasta desde casa. La tabla la llena el navegador con el marcador
 * «FCF → FemStats» (scripts/fcf-boton/marcador.js; ver el SQL 06).
 *
 * No toca ningún script: sustituye el fetch global, y solo para las direcciones
 * https://www.fcf.cat/api/…; todo lo demás (Supabase incluido) sale como siempre.
 * Se carga con NODE_OPTIONS:
 *
 *   $env:NODE_OPTIONS = '--import=./scripts/lib/fcf-cache.mjs'   (pwsh)
 *   NODE_OPTIONS=--import=./scripts/lib/fcf-cache.mjs            (bash)
 *
 * Pide fila a fila (no la tabla entera): el workflow lanza un job por liga, y
 * cada uno solo necesita sus actas.
 *
 * Lo que no esté en la tabla responde 404 y lo dice en la consola con su
 * dirección: es que no se pulsó el marcador (o quedaron actas para otra
 * pulsación), no que la FCF haya cambiado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
try { process.loadEnvFile('.env.local'); } catch {}

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PREFIJO = 'https://www.fcf.cat/api/';
// Más viejo que esto, se avisa: el marcador se pulsa el lunes por la mañana.
const AVISO_HORAS = 72;

const fetchOriginal = globalThis.fetch;
const memo = new Map();
let avisado = false;

async function consultar(filtro) {
  if (!SB_URL || !SB_KEY) throw new Error('fcf-cache: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetchOriginal(`${SB_URL}/rest/v1/fcf_cache?${filtro}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`fcf-cache: no se pudo leer fcf_cache (HTTP ${r.status}). ¿Está ejecutado el SQL 06?`);
  return r.json();
}

async function avisarSiVieja() {
  if (avisado) return;
  avisado = true;
  const [ultima] = await consultar('select=fetched_at&order=fetched_at.desc&limit=1');
  if (!ultima) { console.log('⚠️  fcf-cache: la caché está vacía. Pulsa el marcador «FCF → FemStats» en fcf.cat.'); return; }
  const horas = (Date.now() - Date.parse(ultima.fetched_at)) / 36e5;
  if (horas > AVISO_HORAS) console.log(`⚠️  fcf-cache: lo último del marcador tiene ${Math.round(horas / 24)} día(s). Púlsalo en fcf.cat para traer lo nuevo.`);
}

async function buscar(url) {
  if (!memo.has(url)) {
    memo.set(url, consultar(`select=body&url=eq.${encodeURIComponent(url)}`).then(f => f[0] ?? null));
  }
  return memo.get(url);
}

globalThis.fetch = async (entrada, opciones) => {
  const url = typeof entrada === 'string' ? entrada : entrada?.url ?? String(entrada);
  if (!url.startsWith(PREFIJO)) return fetchOriginal(entrada, opciones);
  await avisarSiVieja();
  const fila = await buscar(url);
  if (!fila) {
    console.log(`⚠️  fcf-cache: no está guardado ${url}`);
    console.log('    Pulsa el marcador «FCF → FemStats» en fcf.cat y vuelve a lanzar.');
    return new Response('{}', { status: 404, statusText: 'No está en fcf_cache' });
  }
  return new Response(JSON.stringify(normalizar(url, fila.body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

/**
 * Los partidos, siempre en el formato de siempre: { "1": [...], ..., "26": [...] }.
 *
 * Desde el 26-10-2026 la FCF los manda como { jornada: {…}, partidos: { "1": [...] } }.
 * sync-actas-api.js hace Object.values(…).flat() y con el formato nuevo salían dos
 * objetos que no son partidos: ninguna acta cerrada y «nada que sincronizar». Se
 * arregla aquí, en un solo sitio, y se planta si tampoco reconoce el formato.
 */
function normalizar(url, body) {
  if (!url.includes('/api/competition/partidos?') || !body || typeof body !== 'object') return body;
  const jornadas = body.partidos ?? body;
  if (!Object.values(jornadas).some(v => Array.isArray(v))) {
    throw new Error(`fcf-cache: ${url} no trae jornadas reconocibles. ¿Ha vuelto a cambiar el formato de la FCF?`);
  }
  return jornadas;
}
