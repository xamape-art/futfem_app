/**
 * scripts/fcf-boton/subir-archivo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan B del marcador «FCF → FemStats»: si la web de la FCF no le deja enviar a
 * Supabase, el marcador descarga fcf-AAAA-MM-DD.json y esto lo guarda en
 * fcf_cache (SQL 06), igual que lo habría hecho él.
 *
 *   node scripts/fcf-boton/subir-archivo.js <archivo.json>
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try { process.loadEnvFile('.env.local'); } catch {}

const archivo = process.argv[2];
if (!archivo) { console.error('Uso: node scripts/fcf-boton/subir-archivo.js <archivo.json>'); process.exit(1); }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL || !KEY) { console.error('❌ Faltan credenciales en .env.local'); process.exit(1); }
const supabase = createClient(URL, KEY);

const filas = JSON.parse(readFileSync(archivo, 'utf8'))
  .filter(f => typeof f?.url === 'string' && f.url.startsWith('https://www.fcf.cat/api/') && f.body !== undefined);
if (!filas.length) { console.error('❌ El archivo no trae ninguna respuesta de la FCF.'); process.exit(1); }

const ahora = new Date().toISOString();
for (let k = 0; k < filas.length; k += 20) {
  const trozo = filas.slice(k, k + 20).map(f => ({ url: f.url, body: f.body, fetched_at: ahora }));
  const { error } = await supabase.from('fcf_cache').upsert(trozo, { onConflict: 'url' });
  if (error) { console.error(`❌ ${error.message}`); process.exit(1); }
}
console.log(`✅ ${filas.length} respuesta(s) guardadas en fcf_cache. Ya puede correr el sync.`);
