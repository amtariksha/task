#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { maskPushToken } = require('./lib/push-token-mask');

// Load environment variables
const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    });
}

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const targetUserId = 'AM-0012'; // Keval

    try {
        await client.connect();
        
        console.log(`🔍 Querying registered push tokens for Keval (AM-0012)...`);
        
        const res = await client.query(
            'SELECT user_id, push_token, device_type, device_id, is_active, created_at, updated_at, last_used_at FROM push_tokens WHERE user_id = $1',
            [targetUserId]
        );
        
        if (res.rows.length === 0) {
            console.log("ℹ️ No push tokens found for this user in the database.");
        } else {
            console.log(`\n🔔 Registered Push Tokens (${res.rows.length}):`);
            console.table(res.rows.map((row) => ({ ...row, push_token: maskPushToken(row.push_token) })));
        }
        
    } catch (err) {
        console.error('❌ Database query failed:', err);
    } finally {
        await client.end();
    }
}

main();
