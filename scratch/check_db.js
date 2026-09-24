import { createClient } from '@supabase/supabase-js';

const url = 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const key = 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

const supabase = createClient(url, key);

async function checkFile() {
  console.log('--- Inspecting baseball_data for file 打撃データ（21名）2026.9.14.csv ---');
  const { data: rows } = await supabase
    .from('baseball_data')
    .select('*')
    .eq('file_name', '打撃データ（21名）2026.9.14.csv');

  console.log('Total rows for 打撃データ（21名）2026.9.14.csv:', rows?.length);
  
  if (rows && rows.length > 0) {
    const nonNullEv = rows.filter(r => r.launch_speed !== null);
    const nonNullBs = rows.filter(r => r.bat_speed !== null);
    const nonNullLa = rows.filter(r => r.launch_angle !== null);
    console.log('Rows with non-null launch_speed:', nonNullEv.length);
    console.log('Rows with non-null bat_speed:', nonNullBs.length);
    console.log('Rows with non-null launch_angle:', nonNullLa.length);
    console.log('Sample row from this file:', rows[0]);
  }
}

checkFile().catch(console.error);
