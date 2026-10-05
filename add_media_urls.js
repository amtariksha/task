const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    await client.query('ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS media_urls JSONB');
    console.log('Added media_urls column to feed_posts');
    await client.end();
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
