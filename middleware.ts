/**
 * middleware.ts — FUTFEM_APP · Protecció per contrasenya (Vercel Edge Middleware)
 * ─────────────────────────────────────────────────────────────────────────────
 * S'executa a l'edge ABANS de servir res. Si hi ha SITE_PASSWORD configurada,
 * demana autenticació HTTP Basic per a TOTES les rutes (inclosos els assets,
 * perquè no es serveixi ni el JS amb la clau anon de Supabase sense contrasenya).
 *
 * Configuració (Vercel → Project → Settings → Environment Variables):
 *   SITE_PASSWORD   (obligatòria per activar la protecció)
 *   SITE_USER       (opcional, per defecte "femstats")
 *
 * Si SITE_PASSWORD no està definida, el middleware deixa passar (no bloqueja),
 * per no quedar-se fora abans de configurar-la.
 *
 * Nota: en desenvolupament local (vite) aquest middleware NO s'executa; només
 * actua al desplegament de Vercel.
 */

import { next } from '@vercel/edge';

export const config = {
  // Totes les rutes.
  matcher: '/:path*',
};

export default function middleware(request: Request) {
  const PASS = process.env.SITE_PASSWORD;
  if (!PASS) return next(); // protecció desactivada mentre no hi hagi contrasenya

  const USER = process.env.SITE_USER || 'femstats';
  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try { decoded = atob(encoded); } catch { decoded = ''; }
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === USER && pass === PASS) return next();
  }

  return new Response('Accés restringit — cal contrasenya.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="FemStats", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
