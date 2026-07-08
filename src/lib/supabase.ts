import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('FUTFEM_APP: faltan variables de entorno Supabase. Revisa .env.local');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Supabase/PostgREST retorna un màxim de 1000 files per consulta. Aquesta funció
 * pagina amb range() cridant `buildQuery` amb un rang nou fins a recollir-les
 * totes, perquè els comptadors i les taules siguin exactes (no capats a 1000).
 */
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
