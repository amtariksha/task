const fs = require('fs')
const path = require('path')

// Manual .env parsing
const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local')
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            const key = match[1].trim()
            const value = match[2].trim().replace(/^["']|["']$/g, '') // Remove quotes
            if (!process.env[key]) {
                process.env[key] = value
            }
        }
    })
}

// Require pg from root node_modules
const pgPath = path.join(__dirname, '..', 'node_modules', 'pg')
const { Client } = require(pgPath)

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.')
    process.exit(1)
}

async function runMigration() {
    // Use connection pooler with SSL
    const connectionString = process.env.DATABASE_URL

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    })

    try {
        await client.connect()
        console.log('✅ Connected to PostgreSQL database')

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'apps', 'web', 'database', 'migrations', '037_create_attendance_requests_table.sql')
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

        console.log('\n🔄 Running migration 037: Create attendance_requests table...\n')

        // Execute migration
        await client.query(migrationSQL)

        console.log('✅ Migration 037 completed successfully!')
        console.log('\nChanges made:')
        console.log('  - Created attendance_requests table')
        console.log('  - Created enums for request type and status')
        console.log('  - Added foreign keys and indexes')

    } catch (error) {
        console.error('❌ Migration failed:', error.message)
        console.error('\nFull error:', error)
        process.exit(1)
    } finally {
        await client.end()
        console.log('\n✅ Database connection closed')
    }
}

runMigration()
