/**
 * scripts/fcf-boton/marcador.js — el marcador «FCF → FemStats»
 * ─────────────────────────────────────────────────────────────────────────────
 * Desde el 23-10-2026 la FCF solo responde a navegadores. Este marcador se
 * pulsa con www.fcf.cat abierto: el navegador lee la API de la FCF —igual que
 * la lee la propia web al navegar— y guarda las respuestas en Supabase
 * (fcf_cache, SQL 06). El sync de los lunes lee de ahí.
 *
 * Pide exactamente las mismas direcciones que sync-actas-api.js y
 * sync-classificacio.js, para cada liga de LIGAS:
 *   · temporadas, competiciones y grupos (para resolver el grupId)
 *   · partidos y clasificación de cada grupo
 *   · las actas cerradas que no estén guardadas, y las de los últimos
 *     DIAS_RELEER días otra vez si su copia tiene más de HORAS_COPIA horas,
 *     por si la FCF ha corregido alguna
 *
 * Son 32 ligas: para no llamar la atención de la FCF, cada pulsación trae como
 * mucho MAX_ACTAS actas, una tras otra y con pausa. Lo que falte lo trae la
 * siguiente pulsación (el recuadro lo dice). Va guardando a trozos, así que
 * cerrar la pestaña a medias no pierde lo ya leído.
 *
 * Si la web de la FCF no deja enviar a otra dirección, descarga un archivo
 * fcf-AAAA-MM-DD.json: se sube con  node scripts/fcf-boton/subir-archivo.js <archivo>
 *
 * No se instala tal cual: lleva __SB_URL__, __SB_ANON__, __CLAVE__ y __LIGAS__,
 * que rellena scripts/fcf-boton/generar.js (las ligas salen del workflow).
 * Al cambiar de temporada, TEMPORADA nueva aquí y en el workflow.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(async () => {
  const SB = '__SB_URL__', ANON = '__SB_ANON__', CLAVE = '__CLAVE__';
  const LIGAS = __LIGAS__;
  const TEMPORADA = '2627';
  const DISCIPLINA_FEM = '19308237';       // Futbol Femení (igual que sync-actas-api.js)
  const MAX_ACTAS = 400;
  const DIAS_RELEER = 15;
  const HORAS_COPIA = 72;
  const PAUSA_MS = 700;
  const BASE = 'https://www.fcf.cat';
  const API = '/api/competition';

  if (location.origin !== BASE) { alert('Abre www.fcf.cat y pulsa el marcador allí.'); return; }
  if (window.__fcfFemStats) return;
  window.__fcfFemStats = true;

  const caja = document.createElement('div');
  caja.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:14px 16px;'
    + 'background:#1e1b4b;color:#fff;font:14px/1.4 system-ui,sans-serif;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);white-space:pre-line';
  document.body.appendChild(caja);
  const decir = t => { caja.textContent = 'FCF → FemStats\n' + t; };
  const cerrar = () => { window.__fcfFemStats = false; setTimeout(() => caja.remove(), 20000); };

  // Igual que slugify() de sync-actas-api.js: con él se casan group_path y labels.
  const slugify = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’.]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const rpc = async (f, cuerpo) => {
    const r = await fetch(`${SB}/rest/v1/rpc/${f}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: CLAVE, ...cuerpo }),
    });
    if (!r.ok) throw new Error(`Supabase ${f}: HTTP ${r.status} ${await r.text()}`);
    return r.json();
  };
  const pausa = ms => new Promise(r => setTimeout(r, ms));

  let sinConexion = false, subidas = 0;
  const pendientes = [], todas = [];
  // Sube a trozos de 10 (un acta pesa decenas de KB). Sin conexión, todo va al archivo.
  const subir = async (forzar = false) => {
    while (!sinConexion && pendientes.length && (forzar || pendientes.length >= 10)) {
      const trozo = pendientes.splice(0, 10);
      try { subidas += await rpc('fcf_cache_subir', { filas: trozo }); }
      catch (e) {
        if (/clave incorrecta/.test(e.message)) throw e;
        sinConexion = true;
      }
    }
  };
  const leer = async ruta => {
    await pausa(PAUSA_MS);
    const r = await fetch(BASE + API + ruta, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${API}${ruta} → HTTP ${r.status}`);
    const body = await r.json();
    const fila = { url: BASE + API + ruta, body };
    pendientes.push(fila); todas.push(fila);
    await subir();
    return body;
  };

  try {
    // Qué hay ya guardado. Si la web no deja hablar con Supabase, se sigue igual
    // y al final se descarga el archivo.
    let guardadas = new Map();
    try { guardadas = new Map((await rpc('fcf_cache_urls', {})).map(f => [f.url, Date.parse(f.fetched_at)])); }
    catch (e) {
      if (/clave incorrecta/.test(e.message)) throw new Error('La clave del marcador no vale: vuelve a generarlo.');
      sinConexion = true;
    }

    decir('Temporadas y competiciones…');
    const etiqueta = `20${TEMPORADA.slice(0, 2)}-20${TEMPORADA.slice(2)}`;
    const temporada = (await leer('/temporadas')).find(t => t.label === etiqueta);
    if (!temporada) throw new Error(`La FCF no conoce la temporada ${etiqueta}.`);
    const comps = await leer(`/competicions?temporada=${temporada.value}&disciplinaId=${DISCIPLINA_FEM}`) || [];

    const gruposDe = new Map(), grupIds = [], sinPublicar = [];
    for (const [i, liga] of LIGAS.entries()) {
      decir(`Ligas: ${i + 1} de ${LIGAS.length}`);
      const [, compSlug, grupSlug] = liga.split('/');
      const comp = comps.find(c => slugify(c.label) === compSlug);
      if (!comp) { sinPublicar.push(liga); continue; }
      if (!gruposDe.has(comp.value)) gruposDe.set(comp.value, await leer(`/grupos?competicioId=${comp.value}`) || []);
      const grupo = gruposDe.get(comp.value).find(g => slugify(g.label) === grupSlug);
      if (!grupo) { sinPublicar.push(liga); continue; }
      grupIds.push(grupo.value);
    }

    const partidos = [];
    for (const [i, g] of grupIds.entries()) {
      decir(`Partidos y clasificación: ${i + 1} de ${grupIds.length}`);
      partidos.push(...Object.values(await leer(`/partidos?grupId=${g}`) || {}).flat());
      await leer(`/classificacio?grupId=${g}`);
    }

    const ahora = Date.now();
    const urlActa = p => `${BASE}${API}/acta?codacta=${p.CODACTA}`;
    const faltan = [], releer = [];
    for (const p of partidos) {
      if (String(p.CERRADA) !== '1' || !p.CODACTA) continue;
      const copia = guardadas.get(urlActa(p));
      if (copia === undefined) faltan.push(p);
      else if (Date.parse(String(p.COMIENZO1).replace(' ', 'T')) >= ahora - DIAS_RELEER * 864e5
        && copia < ahora - HORAS_COPIA * 36e5) releer.push(p);
    }
    // Primero las que faltan: sin ellas el sync de esa liga no escribe.
    const cola = [...faltan, ...releer];
    const tanda = cola.slice(0, MAX_ACTAS);
    for (const [i, p] of tanda.entries()) {
      decir(`Actas: ${i + 1} de ${tanda.length}` + (cola.length > tanda.length ? ` (quedan ${cola.length - tanda.length} para otra pulsación)` : ''));
      await leer(`/acta?codacta=${p.CODACTA}`);
    }

    const resto = cola.length - tanda.length;
    const resumen = `${grupIds.length} liga(s), ${tanda.length} acta(s) leídas.`
      + (sinPublicar.length ? `\n${sinPublicar.length} liga(s) aún sin publicar en la FCF.` : '')
      + (resto ? `\n⏳ Quedan ${resto} acta(s): vuelve a pulsar el marcador.` : '\nYa puede correr el sync.');
    decir('Guardando en FemStats…');
    await subir(true);
    if (!sinConexion) {
      decir(`✅ Guardado: ${subidas} respuesta(s).\n${resumen}`);
      cerrar();
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(todas)], { type: 'application/json' }));
    a.download = `fcf-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    decir(`⬇️ La FCF no deja enviar a FemStats desde su web, así que se ha descargado ${a.download}.\n${resumen}\n`
      + 'Súbelo con: node scripts/fcf-boton/subir-archivo.js <archivo>');
    cerrar();
  } catch (e) {
    // Lo leído hasta aquí no se pierde.
    try { await subir(true); } catch {}
    decir(`❌ ${e.message}` + (subidas ? `\n(${subidas} respuesta(s) ya guardadas)` : ''));
    cerrar();
  }
})();
