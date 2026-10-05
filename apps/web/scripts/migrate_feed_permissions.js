#!/usr/bin/env node

/**
 * Migration Script: Add Feed Permission to All Users
 * 
 * This script adds the 'feed' permission to all existing users' tab_permissions.
 * Run this after deploying the Feed tab feature.
 * 
 * Usage: node apps/web/scripts/migrate_feed_permissions.js
 */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.');
    process.exit(1);
}

// Database connection configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrateFeedPermissions() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting Feed permission migration...\n');

        // Get all users
        const usersResult = await client.query('SELECT employee_id, tab_permissions FROM users');
        const users = usersResult.rows;

        console.log(`📊 Found ${users.length} users to update\n`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const user of users) {
            const currentPermissions = user.tab_permissions || [];

            // Check if user already has 'feed' permission
            if (currentPermissions.includes('feed')) {
                console.log(`⏭️  Skipping ${user.employee_id} - already has 'feed' permission`);
                skippedCount++;
                continue;
            }

            // Add 'feed' to permissions
            const updatedPermissions = [...currentPermissions, 'feed'];

            // Update user
            await client.query(
                'UPDATE users SET tab_permissions = $1 WHERE employee_id = $2',
                [updatedPermissions, user.employee_id]
            );

            console.log(`✅ Updated ${user.employee_id} - added 'feed' permission`);
            updatedCount++;
        }

        console.log(`\n✨ Migration complete!`);
        console.log(`   Updated: ${updatedCount} users`);
        console.log(`   Skipped: ${skippedCount} users (already had permission)`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
migrateFeedPermissions()
    .then(() => {
        console.log('\n🎉 Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Error:', error);
        process.exit(1);
    });
