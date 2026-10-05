#!/usr/bin/env node

/**
 * Migration Script: Add start_date and end_date columns to bugs table
 *
 * This script adds the missing date columns that were added to the application
 * layer but not to the database schema.
 */

const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.')
  process.exit(1)
}

const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}

async function runMigration() {
  const pool = new Pool(DB_CONFIG)

  try {
    console.log('🔵 Connecting to PostgreSQL database...')
    const client = await pool.connect()
    console.log('✅ Connected to database')

    // Check if columns already exist
    console.log('\n🔵 Checking if columns already exist...')
    const columnsResult = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'bugs'
       AND column_name IN ('start_date', 'end_date')`
    )

    if (columnsResult.rows.length > 0) {
      console.log('⚠️  Columns already exist:', columnsResult.rows.map(c => c.column_name).join(', '))
      console.log('✅ Migration not needed - columns already present')
      client.release()
      return
    }

    // Add the columns
    console.log('\n🔵 Adding start_date and end_date columns to bugs table...')
    await client.query(`
      ALTER TABLE bugs
      ADD COLUMN start_date DATE NULL,
      ADD COLUMN end_date DATE NULL
    `)

    console.log('✅ Successfully added columns to bugs table')

    // Verify the columns were added
    console.log('\n🔵 Verifying columns...')
    const verifyResult = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'bugs'
       AND column_name IN ('start_date', 'end_date')
       ORDER BY ordinal_position`
    )

    console.log('✅ Columns verified:')
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
    })

    console.log('\n✅ Migration completed successfully!')
    client.release()

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await pool.end()
    console.log('\n🔵 Database connection closed')
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('\n✅ All done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  })

