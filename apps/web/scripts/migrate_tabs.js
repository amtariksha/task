const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.');
    process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

const client = new Client({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to database');

        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tab_permissions JSONB DEFAULT NULL;');
        console.log('Migration successful: Added tab_permissions column');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
