/**
 * add-league.js — Helper per inserir una nova lliga a Supabase
 * Ús: node scripts/add-league.js
 * Requereix les mateixes vars d'entorn que sync-actas.js
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const league = {
  name:           'Preferent Femení Infantil - Grup 1',
  short_name:     'Pref. Inf. Gr.1',
  group_path:     'futbol-femeni/preferent-femeni-infantil/grup-1',
  fcf_seasons:    ['2526', '2627'],
  active:         true,
  sort_order:     9,
  match_duration: 70,  // Infantil F11: 2×35 min
};

console.log('\n🔵 Inserint lliga a Supabase…');
console.log(`   ${league.name}`);
console.log(`   group_path: ${league.group_path}`);

const { data, error } = await supabase
  .from('leagues')
  .upsert(league, { onConflict: 'group_path', ignoreDuplicates: false })
  .select('id, name, short_name')
  .single();

if (error) {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
}

console.log(`\n✅ Lliga inserida/actualitzada: ${data.id}`);
console.log(`   "${data.name}" (${data.short_name})\n`);
