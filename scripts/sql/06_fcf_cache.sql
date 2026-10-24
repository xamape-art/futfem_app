-- ═════════════════════════════════════════════════════════════════════════════
-- 06 · Caché de la FCF que llena el navegador
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Desde el 23-10-2026 la FCF solo responde a navegadores: los scripts reciben
-- 403 hasta desde el PC de casa. Así que el sync de los lunes ya no lee la FCF:
-- se abre fcf.cat, se pulsa el marcador «FCF → FemStats»
-- (scripts/fcf-boton/marcador.js) y el navegador guarda aquí lo que la FCF
-- devuelve, tal cual. Los scripts leen de esta tabla a través de
-- scripts/lib/fcf-cache.mjs, sin cambiar nada de su lógica.
--
-- url  es la dirección exacta que pedía el script
--      (https://www.fcf.cat/api/competition/acta?codacta=…).
-- body es la respuesta JSON de la FCF, sin tocar.
--
-- El marcador no inicia sesión: llama a las dos funciones de abajo con la clave
-- anónima y una clave propia. Aquí solo se guarda su huella (sha256), nunca la
-- clave. Sin ella no se puede ni leer ni escribir nada.
--
-- La huella sale de: node scripts/fcf-boton/generar.js. Si cambias la clave,
-- pon aquí la nueva y vuelve a ejecutar.
--
-- Idempotente: se puede ejecutar más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fcf_cache (
  url         text        PRIMARY KEY,
  body        jsonb       NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fcf_cache IS
  'Respuestas de la API de la FCF guardadas desde el navegador (marcador FCF → FemStats). Las leen los scripts de sync.';

-- RLS activado y sin políticas: solo service_role (los scripts) y las funciones
-- de abajo llegan a la tabla.
ALTER TABLE public.fcf_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.fcf_cache_clave (
  id      integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  huella  text    NOT NULL
);
ALTER TABLE public.fcf_cache_clave ENABLE ROW LEVEL SECURITY;

INSERT INTO public.fcf_cache_clave (id, huella) VALUES (1, 'fdc60a5dd38f034436ac98c1c047a9fc2ea8b1fa1b41780c9de45988441ba58c')
  ON CONFLICT (id) DO UPDATE SET huella = EXCLUDED.huella;

CREATE OR REPLACE FUNCTION public.fcf_cache_clave_ok(clave text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fcf_cache_clave
    WHERE huella = encode(extensions.digest(clave, 'sha256'), 'hex')
  );
$$;

-- Qué hay ya guardado y de cuándo: el marcador no vuelve a pedir un acta que ya
-- tiene, y relee las recientes solo si su copia ya tiene unos días.
-- (DROP porque en una versión anterior devolvía solo la url.)
DROP FUNCTION IF EXISTS public.fcf_cache_urls(text);
CREATE FUNCTION public.fcf_cache_urls(clave text)
RETURNS TABLE (url text, fetched_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.fcf_cache_clave_ok(clave) THEN
    RAISE EXCEPTION 'clave incorrecta' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY SELECT c.url, c.fetched_at FROM public.fcf_cache c;
END;
$$;

-- filas: [{url, body}, …]. Pisa lo que hubiera: manda la última lectura.
CREATE OR REPLACE FUNCTION public.fcf_cache_subir(clave text, filas jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.fcf_cache_clave_ok(clave) THEN
    RAISE EXCEPTION 'clave incorrecta' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.fcf_cache (url, body, fetched_at)
  SELECT f->>'url', f->'body', now()
  FROM jsonb_array_elements(filas) f
  WHERE f->>'url' LIKE 'https://www.fcf.cat/api/%' AND f ? 'body'
  ON CONFLICT (url) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.fcf_cache_clave_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fcf_cache_urls(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fcf_cache_subir(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fcf_cache_urls(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fcf_cache_subir(text, jsonb) TO anon, authenticated;

COMMIT;
