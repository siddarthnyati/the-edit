import '../src/lib/env.js';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

async function main() {
  const supabase = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('usage: upload-single <local-path> <storage-path>');
    process.exit(1);
  }
  const [localPath, storagePath] = args;
  const bytes = readFileSync(localPath);
  const { error } = await supabase.storage
    .from('wardrobe-basics')
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  console.log(`uploaded ${storagePath} (${bytes.length} bytes)`);
}

main().catch((e) => {
  console.error('upload failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
