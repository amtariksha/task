#!/usr/bin/env node

/**
 * ============================================================================
 * Karmayog Remote Push Notification Test Script
 * ============================================================================
 * 
 * DESCRIPTION:
 * This script fetches the active push tokens for user 'Keval' (AM-0012) from the 
 * database and fires a test push notification to the Expo Push Service, which
 * routes it via FCM (Android) or APNs (iOS) to your device notification panel.
 * 
 * RUNNING THE SCRIPT:
 * From the project root, run:
 * $ node scripts/test-remote-push.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { maskPushToken, redactPushTokens } = require('./lib/push-token-mask');

// 1. Load env variables
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

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const targetUserId = 'AM-0012'; // Keval

    try {
        await client.connect();
        console.log('🔌 Connected to PostgreSQL');

        // Fetch active push tokens
        const res = await client.query(
            "SELECT push_token, device_type, device_id FROM push_tokens WHERE user_id = $1 AND is_active = true",
            [targetUserId]
        );

        if (res.rows.length === 0) {
            console.error(`❌ No active push tokens found for user ${targetUserId}. Make sure you are logged in on the physical device.`);
            process.exit(1);
        }

        console.log(`📱 Found ${res.rows.length} active device(s) for Keval:`);
        res.rows.forEach((row, i) => {
            console.log(`   [${i+1}] Device: ${row.device_id} (${row.device_type}) | Token: ${maskPushToken(row.push_token)}`);
        });

        // Prepare messages for the Expo Push API (which proxies to FCM/APNs)
        const messages = res.rows.map(row => ({
            to: row.push_token,
            sound: 'default',
            title: 'Karmayog System Test 🚨',
            body: `This is a remote notification in your phone's notification tray sent on ${new Date().toLocaleTimeString()}!`,
            data: {
                notificationId: `NOTIF-PUSH-TEST-${Date.now()}`,
                type: 'task',
                taskId: 'TSK-101',
                linkUrl: '/tasks/TSK-101'
            },
            channelId: 'tasks',
            priority: 'high'
        }));

        console.log(`\n🚀 Transmitting push request to Expo Push Service...`);
        const response = await fetch(EXPO_PUSH_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        if (!response.ok) {
            throw new Error(`Expo Push API HTTP Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Response received from Expo:');
        console.log(redactPushTokens(JSON.stringify(result, null, 2)));

        if (result.data && result.data[0] && result.data[0].status === 'ok') {
            console.log('\n🎉 Push notification queued successfully! Check your physical device notification panel now.');
        } else {
            console.error('\n❌ Failed to queue push notification:', redactPushTokens(JSON.stringify(result)));
        }

    } catch (err) {
        console.error('❌ Error executing push test:', err);
    } finally {
        await client.end();
    }
}

main();
