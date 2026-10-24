/**
 * scripts/fcf-boton/generar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rellena el marcador «FCF → FemStats» (marcador.js) con la dirección de
 * Supabase, la clave anónima, la clave propia del marcador y la lista de ligas
 * (la del matrix de .github/workflows/sync-actas.yml), y deja una página para
 * arrastrarlo a la barra de marcadores.
 *
 *   node scripts/fcf-boton/generar.js [--salida <archivo.html>]
 *
 * La clave propia vive en .env.local como FCF_MARCADOR_CLAVE. Si no está, se
 * crea y se añade. En Supabase solo va su huella (ver SQL 06), que este script
 * imprime: si cambias la clave, hay que volver a poner la huella allí.
 *
 * Al añadir una liga al workflow, vuelve a generarlo e instálalo otra vez.
 *
 * La página generada lleva la clave dentro: no se sube al repo
 * (por defecto, scripts/fcf-boton/instalar.local.html, en .gitignore).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

try { process.loadEnvFile('.env.local'); } catch {}

const args = process.argv.slice(2);
const i = args.indexOf('--salida');
const SALIDA = i >= 0 ? args[i + 1] : 'scripts/fcf-boton/instalar.local.html';

const SB = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!SB || !ANON) { console.error('❌ Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local'); process.exit(1); }

// Las ligas del sync programado: las líneas «- 'futbol-femeni/…'» del matrix.
const ligas = [...new Set(
  [...readFileSync('.github/workflows/sync-actas.yml', 'utf8').matchAll(/^\s*-\s*'(futbol-femeni\/[^']+)'/gm)].map(m => m[1])
)];
if (!ligas.length) { console.error('❌ No encuentro las ligas en .github/workflows/sync-actas.yml'); process.exit(1); }

let clave = process.env.FCF_MARCADOR_CLAVE;
if (!clave) {
  clave = randomBytes(24).toString('hex');
  appendFileSync('.env.local', `\n# Clave del marcador «FCF → FemStats» (scripts/fcf-boton). En Supabase va su huella.\nFCF_MARCADOR_CLAVE=${clave}\n`);
  console.log('🔑 Clave nueva guardada en .env.local (FCF_MARCADOR_CLAVE).');
}
const huella = createHash('sha256').update(clave).digest('hex');

const fuente = readFileSync('scripts/fcf-boton/marcador.js', 'utf8')
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')   // la cabecera no hace falta en el marcador
  .replace('__SB_URL__', SB).replace('__SB_ANON__', ANON).replace('__CLAVE__', clave)
  .replace('__LIGAS__', JSON.stringify(ligas));
const enlace = 'javascript:' + encodeURIComponent(fuente);

writeFileSync(SALIDA, `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Marcador FCF → FemStats</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
a.m{display:inline-block;padding:10px 18px;background:#4338ca;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}</style>
</head><body>
<h1>Marcador «FCF → FemStats»</h1>
<p>1. Muestra la barra de marcadores (Ctrl+Mayús+B).</p>
<p>2. Arrastra este botón a la barra:</p>
<p><a class="m" href="${enlace.replace(/"/g, '&quot;')}">FCF → FemStats</a></p>
<p>3. Cada lunes por la mañana: abre <b>www.fcf.cat</b> y pulsa el marcador. Sale un recuadro abajo a la derecha que va contando; cuando diga «Guardado», ya está. Si dice «Quedan N actas», vuelve a pulsarlo.</p>
<p>Lee ${ligas.length} ligas. Si añades una al workflow, vuelve a generar esta página e instala el marcador otra vez.</p>
<p style="color:#666">Esta página lleva la clave del marcador: no la compartas.</p>
</body></html>
`);

console.log(`✅ Página para instalarlo: ${SALIDA} (${ligas.length} ligas)`);
console.log(`   Huella para el SQL 06 (fcf_cache_clave): ${huella}`);
