#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * This script runs all migration files in the database/migrations directory
 * in sequential order.
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

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n')
  
  let connection
  try {
    // Connect to database
    console.log('📡 Connecting to MySQL database...')
    console.log(`   Host: ${DB_CONFIG.host}`)
    console.log(`   Database: ${DB_CONFIG.database}`)
    console.log(`   User: ${DB_CONFIG.user}\n`)
    
    connection = await mysql.createConnection(DB_CONFIG)
    console.log('✅ Database connection successful!\n')
    
    // Get migration files
    const migrationsDir = path.join(__dirname, '..', 'database', 'migrations')
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort() // Run in alphabetical order (001, 002, 003, etc.)
    
    if (files.length === 0) {
      console.log('⚠️  No migration files found in database/migrations/')
      return
    }
    
    console.log(`📁 Found ${files.length} migration file(s):\n`)
    files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`)
    })
    console.log('')
    
    // Run each migration
    for (const file of files) {
      console.log(`⏳ Running migration: ${file}`)
      
      const filePath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf8')
      
      try {
        await connection.query(sql)
        console.log(`✅ Migration completed: ${file}\n`)
      } catch (error) {
        // Check if error is due to table/column already existing
        if (error.code === 'ER_TABLE_EXISTS_ALREADY' || 
            error.code === 'ER_DUP_FIELDNAME' ||
            error.message.includes('Duplicate column name')) {
          console.log(`⚠️  Migration skipped (already applied): ${file}`)
          console.log(`   Reason: ${error.message}\n`)
        } else {
          throw error
        }
      }
    }
    
    console.log('🎉 All migrations completed successfully!\n')
    
    // Verify the changes
    console.log('🔍 Verifying database schema...\n')
    
    // Check if projects table exists
    const [projectsTable] = await connection.query(
      "SHOW TABLES LIKE 'projects'"
    )
    if (projectsTable.length > 0) {
      console.log('✅ Projects table created')
      
      // Count projects
      const [projectCount] = await connection.query(
        'SELECT COUNT(*) as count FROM projects'
      )
      console.log(`   - ${projectCount[0].count} sample projects inserted`)
    }
    
    // Check if tasks.project_id exists
    const [tasksColumns] = await connection.query(
      "SHOW COLUMNS FROM tasks LIKE 'project_id'"
    )
    if (tasksColumns.length > 0) {
      console.log('✅ Tasks table updated with project_id column')
    }
    
    // Check if bugs columns exist
    const [bugsProjectId] = await connection.query(
      "SHOW COLUMNS FROM bugs LIKE 'project_id'"
    )
    const [bugsFeature] = await connection.query(
      "SHOW COLUMNS FROM bugs LIKE 'feature'"
    )
    const [bugsType] = await connection.query(
      "SHOW COLUMNS FROM bugs LIKE 'type'"
    )
    
    if (bugsProjectId.length > 0 && bugsFeature.length > 0 && bugsType.length > 0) {
      console.log('✅ Bugs table updated with project_id, feature, and type columns')
    }
    
    console.log('\n✨ Database schema is up to date!\n')
    
  } catch (error) {
    console.error('\n❌ Migration failed:')
    console.error(`   Error: ${error.message}`)
    console.error(`   Code: ${error.code || 'N/A'}`)
    if (error.sql) {
      console.error(`   SQL: ${error.sql.substring(0, 100)}...`)
    }
    console.error('')
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
      console.log('🔌 Database connection closed')
    }
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

