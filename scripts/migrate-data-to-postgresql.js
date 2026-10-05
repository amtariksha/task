#!/usr/bin/env node

/**
 * Data Migration Script - MySQL to PostgreSQL
 * 
 * This script migrates all data from MySQL (AWS RDS) to PostgreSQL (Supabase).
 * 
 * Usage:
 *   node scripts/migrate-data-to-postgresql.js
 */

require('dotenv').config({ path: 'apps/web/.env.local' })
const mysql = require('mysql2/promise')
const { Client } = require('pg')

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.')
  process.exit(1)
}

// MySQL Configuration (source)
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'u806435594_swarg',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'task',
  ssl: { rejectUnauthorized: false }
}

// PostgreSQL Configuration (destination - Supabase)
// Point DATABASE_URL at the direct connection (port 5432), not the pooler, for bulk migration.
const PG_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}

// Tables to migrate (in order of dependencies)
const TABLES = [
  'users',
  'projects',
  'tasks',
  'subtasks',
  'bugs',
  'bug_subtasks',
  'bug_comments',
  'leave_applications',
  'wfh_applications',
  'user_notification_preferences',
  'settings',
  'activity_log'
]

/**
 * Export data from MySQL table
 */
async function exportTableData(mysqlConn, tableName) {
  console.log(`📤 Exporting data from ${tableName}...`)
  
  try {
    const [rows] = await mysqlConn.query(`SELECT * FROM ${tableName}`)
    console.log(`   ✅ Exported ${rows.length} rows from ${tableName}`)
    return rows
  } catch (error) {
    console.error(`   ❌ Error exporting ${tableName}:`, error.message)
    return []
  }
}

/**
 * Import data to PostgreSQL table (row by row for better error handling)
 */
async function importTableData(pgClient, tableName, rows) {
  if (rows.length === 0) {
    console.log(`   ⏭️  Skipping ${tableName} (no data)`)
    return
  }

  console.log(`📥 Importing ${rows.length} rows to ${tableName}...`)

  let successCount = 0
  let errorCount = 0

  for (const row of rows) {
    try {
      const columns = Object.keys(row)

      // JSON columns that need special handling
      const jsonColumns = ['support', 'daily_hours', 'timer_sessions', 'attachments', 'changes', 'value', 'metadata']

      // Build placeholders with ::jsonb cast for JSON columns
      const placeholders = columns.map((col, i) => {
        if (jsonColumns.includes(col)) {
          return `$${i + 1}::jsonb`
        }
        return `$${i + 1}`
      }).join(', ')

      const values = columns.map(col => {
        const value = row[col]

        // Handle NULL values
        if (value === null || value === undefined) {
          return null
        }

        // For JSON columns, convert to JSON string
        if (jsonColumns.includes(col)) {
          // If it's already an object/array, stringify it
          if (typeof value === 'object') {
            return JSON.stringify(value)
          }
          // If it's a string, validate it's valid JSON
          if (typeof value === 'string') {
            try {
              JSON.parse(value) // Validate
              return value
            } catch (e) {
              // If parsing fails, return null
              return null
            }
          }
        }

        return value
      })

      const insertSQL = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `

      await pgClient.query(insertSQL, values)
      successCount++

      if (successCount % 100 === 0) {
        console.log(`   📊 Progress: ${successCount}/${rows.length} rows imported...`)
      }
    } catch (rowError) {
      errorCount++
      console.error(`      ❌ Error importing row:`, rowError.message)
      if (errorCount <= 3) {
        console.error(`         Row ID:`, row.id || 'unknown')
        console.error(`         Error detail:`, rowError.detail || 'N/A')
      }
    }
  }

  console.log(`   ✅ Imported ${successCount} rows to ${tableName}`)
  if (errorCount > 0) {
    console.log(`   ⚠️  ${errorCount} rows failed to import`)
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting data migration from MySQL to PostgreSQL...\n')

  let mysqlConn
  let pgClient

  try {
    // Connect to MySQL
    console.log('🔵 Connecting to MySQL (AWS RDS)...')
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG)
    console.log('✅ Connected to MySQL\n')

    // Connect to PostgreSQL
    console.log('🔵 Connecting to PostgreSQL (Supabase)...')
    pgClient = new Client(PG_CONFIG)
    await pgClient.connect()
    console.log('✅ Connected to PostgreSQL\n')

    // Migrate data for each table
    console.log('📦 Migrating data...\n')
    
    for (const tableName of TABLES) {
      console.log(`\n--- ${tableName} ---`)
      
      // Export from MySQL
      const rows = await exportTableData(mysqlConn, tableName)
      
      // Import to PostgreSQL
      if (rows.length > 0) {
        await importTableData(pgClient, tableName, rows)
      }
    }

    // Verify row counts
    console.log('\n\n📊 Verifying row counts...\n')
    for (const tableName of TABLES) {
      try {
        const [mysqlCount] = await mysqlConn.query(`SELECT COUNT(*) as count FROM ${tableName}`)
        const pgCount = await pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`)

        const mysqlRows = mysqlCount[0].count
        const pgRows = parseInt(pgCount.rows[0].count)

        const status = mysqlRows === pgRows ? '✅' : '⚠️'
        console.log(`${status} ${tableName}: MySQL=${mysqlRows}, PostgreSQL=${pgRows}`)
      } catch (error) {
        console.log(`⏭️  ${tableName}: Skipped (table doesn't exist in MySQL)`)
      }
    }

    console.log('\n\n✅ Data migration completed successfully!')

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    throw error
  } finally {
    // Close connections
    if (mysqlConn) {
      await mysqlConn.end()
      console.log('\n🔵 MySQL connection closed')
    }
    if (pgClient) {
      await pgClient.end()
      console.log('🔵 PostgreSQL connection closed')
    }
  }
}

// Run migration
if (require.main === module) {
  migrate().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { migrate }

