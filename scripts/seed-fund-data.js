/**
 * Seed fund_nav_data table in Supabase from fund_data.txt
 *
 * Before running, create the table in Supabase SQL editor:
 *
 * CREATE TABLE fund_nav_data (
 *   id BIGSERIAL PRIMARY KEY,
 *   date DATE NOT NULL UNIQUE,
 *   fund_nav NUMERIC(12,7) NOT NULL,
 *   sp500_nav NUMERIC(12,7) NOT NULL
 * );
 *
 * CREATE INDEX idx_fund_nav_date ON fund_nav_data (date);
 *
 * Then run: node scripts/seed-fund-data.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  const raw = fs.readFileSync(path.resolve(__dirname, '../fund_data.txt'), 'utf-8');
  const lines = raw.trim().split('\n').slice(1); // skip header

  const rows = lines.map(line => {
    const [dateStr, fundNav, sp500Nav] = line.split('\t');
    // Parse M/D/YYYY to YYYY-MM-DD
    const [m, d, y] = dateStr.split('/');
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return {
      date,
      fund_nav: parseFloat(fundNav.replace(/[$,]/g, '')),
      sp500_nav: parseFloat(sp500Nav.replace(/[$,]/g, '')),
    };
  });

  console.log(`Seeding ${rows.length} rows...`);

  // Upsert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('fund_nav_data')
      .upsert(batch, { onConflict: 'date' });

    if (error) {
      console.error('Error at batch', i, error);
      process.exit(1);
    }
    console.log(`  Inserted ${Math.min(i + 100, rows.length)} / ${rows.length}`);
  }

  console.log('Done!');
}

seed();
