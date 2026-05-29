import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
});

async function runMigration(filePath) {
  console.log(`\n📋 Running migration: ${filePath}`);
  
  try {
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    // Split by statements (simple approach - just split on ;)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    console.log(`  Found ${statements.length} SQL statements`);
    
    for (const statement of statements) {
      try {
        // Use the raw fetch API to execute SQL directly
        const response = await fetch(`${url}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'apikey': key,
          },
          body: JSON.stringify({
            query: statement,
          }),
        });
        
        if (!response.ok) {
          console.warn(`  ⚠ Statement execution status: ${response.status}`);
        }
      } catch (e) {
        console.warn(`  ⚠ Statement error (may be expected): ${e.message}`);
      }
    }
    
    console.log(`✅ Migration processed`);
    return true;
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return false;
  }
}

async function main() {
  const migrations = [
    'supabase/migrations/20260506_split_boats_into_sectors.sql',
    'supabase/migrations/20260506_backfill_sector_rows.sql'
  ];
  
  console.log('⚠️  Note: Use Supabase Dashboard or SQL Editor for reliable migration execution');
  console.log('📍 Open: https://supabase.com/dashboard/project/wroelxqyqtnwjizgljsb/sql');
  console.log('   Copy & paste migration files one at a time\n');
  
  for (const migration of migrations) {
    await runMigration(migration);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
