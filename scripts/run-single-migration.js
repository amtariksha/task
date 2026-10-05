#!/usr/bin/env node

/**
 * Run a single migration file
 * Usage: node scripts/run-single-migration.js <migration-file-name>
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.')
  process.exit(1)
}

// Database configuration
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'u806435594_swarg',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'task',
  ssl: {
    rejectUnauthorized: false
  },
  multipleStatements: true
}

async function runMigration(filename) {
  console.log('🚀 Running single migration...\n')
  
  let connection
  try {
    // Connect to database
    console.log('📡 Connecting to MySQL database...')
    console.log(`   Host: ${DB_CONFIG.host}`)
    console.log(`   Database: ${DB_CONFIG.database}`)
    console.log(`   User: ${DB_CONFIG.user}\n`)
    
    connection = await mysql.createConnection(DB_CONFIG)
    console.log('✅ Database connection successful!\n')
    
    // Read migration file
    const migrationsDir = path.join(__dirname, '..', 'database', 'migrations')
    const filePath = path.join(migrationsDir, filename)
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Migration file not found: ${filename}`)
      process.exit(1)
    }
    
    console.log(`⏳ Running migration: ${filename}`)
    
    const sql = fs.readFileSync(filePath, 'utf8')
    
    try {
      await connection.query(sql)
      console.log(`✅ Migration completed successfully!\n`)
    } catch (error) {
      // Check if error is due to table/column already existing
      if (error.code === 'ER_TABLE_EXISTS_ALREADY' || 
          error.code === 'ER_DUP_FIELDNAME' ||
          error.code === 'ER_DUP_ENTRY' ||
          error.message.includes('Duplicate column name') ||
          error.message.includes('already exists')) {
        console.log(`⚠️  Migration skipped (already applied): ${filename}`)
        console.log(`   Reason: ${error.message}\n`)
      } else {
        throw error
      }
    }
    
    console.log('✅ Migration process complete!\n')
    
  } catch (error) {
    console.error('❌ Migration failed:')
    console.error(`   Error: ${error.message}`)
    if (error.code) {
      console.error(`   Code: ${error.code}`)
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

// Get filename from command line arguments
const filename = process.argv[2]

if (!filename) {
  console.error('❌ Please provide a migration filename')
  console.error('Usage: node scripts/run-single-migration.js <migration-file-name>')
  console.error('Example: node scripts/run-single-migration.js 004_add_settings_table.sql')
  process.exit(1)
}

runMigration(filename)

