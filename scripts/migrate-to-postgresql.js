#!/usr/bin/env node

/**
 * MySQL to PostgreSQL Migration Script
 * 
 * This script:
 * 1. Exports data from MySQL (AWS RDS)
 * 2. Converts schema to PostgreSQL
 * 3. Imports schema and data to Supabase PostgreSQL
 * 
 * Usage:
 *   node scripts/migrate-to-postgresql.js
 */

require('dotenv').config({ path: 'apps/web/.env.local' })
const mysql = require('mysql2/promise')
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

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
  'role_permissions',
  'user_permissions',
  'user_notification_preferences',
  'settings',
  'activity_log'
]

/**
 * Convert MySQL schema to PostgreSQL
 */
function convertSchemaToPostgreSQL(mysqlSchema) {
  let pgSchema = mysqlSchema

  // Remove MySQL-specific comments
  pgSchema = pgSchema.replace(/-- MySQL Database Schema/g, '-- PostgreSQL Database Schema')
  pgSchema = pgSchema.replace(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/g, '')

  // Convert AUTO_INCREMENT to SERIAL
  pgSchema = pgSchema.replace(/INT AUTO_INCREMENT PRIMARY KEY/g, 'SERIAL PRIMARY KEY')
  pgSchema = pgSchema.replace(/BIGINT AUTO_INCREMENT PRIMARY KEY/g, 'BIGSERIAL PRIMARY KEY')

  // Convert DATETIME to TIMESTAMP
  pgSchema = pgSchema.replace(/DATETIME/g, 'TIMESTAMP')

  // Convert ENUM to CHECK constraints
  // This is complex, so we'll handle it manually in the schema file

  // Convert backticks to double quotes
  pgSchema = pgSchema.replace(/`/g, '"')

  // Remove ON UPDATE CURRENT_TIMESTAMP (will add triggers later)
  pgSchema = pgSchema.replace(/ON UPDATE CURRENT_TIMESTAMP/g, '')

  // Convert JSON to JSONB (better performance in PostgreSQL)
  pgSchema = pgSchema.replace(/\sJSON\s/g, ' JSONB ')
  pgSchema = pgSchema.replace(/\sJSON,/g, ' JSONB,')

  return pgSchema
}

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
 * Import data to PostgreSQL table
 */
async function importTableData(pgClient, tableName, rows) {
  if (rows.length === 0) {
    console.log(`   ⏭️  Skipping ${tableName} (no data)`)
    return
  }

  console.log(`📥 Importing ${rows.length} rows to ${tableName}...`)

  try {
    // Get column names from first row
    const columns = Object.keys(rows[0])
    
    // Build INSERT statement with placeholders
    const placeholders = rows.map((_, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) => {
        return `$${rowIndex * columns.length + colIndex + 1}`
      }).join(', ')
      return `(${rowPlaceholders})`
    }).join(', ')

    const insertSQL = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
    `

    // Flatten all values
    const values = rows.flatMap(row => columns.map(col => row[col]))

    await pgClient.query(insertSQL, values)
    console.log(`   ✅ Imported ${rows.length} rows to ${tableName}`)
  } catch (error) {
    console.error(`   ❌ Error importing to ${tableName}:`, error.message)
    
    // Try row-by-row import as fallback
    console.log(`   🔄 Trying row-by-row import...`)
    let successCount = 0
    let errorCount = 0

    for (const row of rows) {
      try {
        const columns = Object.keys(row)
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
        const values = columns.map(col => row[col])

        const insertSQL = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
        `

        await pgClient.query(insertSQL, values)
        successCount++
      } catch (rowError) {
        errorCount++
        console.error(`      ❌ Error importing row:`, rowError.message)
      }
    }

    console.log(`   📊 Row-by-row import: ${successCount} success, ${errorCount} errors`)
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting MySQL to PostgreSQL migration...\n')

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

    // Step 1: Read and convert schema
    console.log('📋 Step 1: Converting schema...')
    const mysqlSchemaPath = path.join(__dirname, '../apps/web/database/schema.sql')
    const mysqlSchema = fs.readFileSync(mysqlSchemaPath, 'utf8')
    const pgSchema = convertSchemaToPostgreSQL(mysqlSchema)
    
    // Save converted schema
    const pgSchemaPath = path.join(__dirname, '../postgres_schema.sql')
    fs.writeFileSync(pgSchemaPath, pgSchema)
    console.log(`✅ Schema converted and saved to ${pgSchemaPath}\n`)

    // Step 2: Migrate data for each table
    console.log('📦 Step 2: Migrating data...\n')
    
    for (const tableName of TABLES) {
      console.log(`\n--- ${tableName} ---`)
      
      // Export from MySQL
      const rows = await exportTableData(mysqlConn, tableName)
      
      // Import to PostgreSQL
      if (rows.length > 0) {
        await importTableData(pgClient, tableName, rows)
      }
    }

    console.log('\n\n✅ Migration completed successfully!')
    console.log('\n📊 Next steps:')
    console.log('1. Review the converted schema in postgres_schema.sql')
    console.log('2. Manually create the schema in Supabase (handle ENUMs and triggers)')
    console.log('3. Verify data integrity')
    console.log('4. Update application code to use PostgreSQL syntax')

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

module.exports = { migrate, convertSchemaToPostgreSQL }

