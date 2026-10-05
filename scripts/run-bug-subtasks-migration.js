#!/usr/bin/env node

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.')
  process.exit(1)
}

const DB_CONFIG = {
  host: 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
  port: 3306,
  user: 'u806435594_swarg',
  password: process.env.MYSQL_PASSWORD,
  database: 'task',
  ssl: {
    rejectUnauthorized: false
  },
  multipleStatements: true
}

async function runMigration() {
  console.log('🚀 Running bug subtasks migration...\n')
  
  let connection
  try {
    console.log('📡 Connecting to database...')
    connection = await mysql.createConnection(DB_CONFIG)
    console.log('✅ Connected!\n')
    
    const migrationPath = path.join(__dirname, '../apps/web/database/migrations/018_bug_subtasks_table.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('⏳ Running migration 018_bug_subtasks_table.sql...')
    await connection.query(sql)
    console.log('✅ Migration completed successfully!\n')
    
    // Verify table was created
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'bug_subtasks'"
    )
    
    if (tables.length > 0) {
      console.log('✅ bug_subtasks table created successfully')
      
      // Show table structure
      const [columns] = await connection.query("DESCRIBE bug_subtasks")
      console.log('\n📋 Table structure:')
      console.table(columns)
    } else {
      console.log('⚠️  Table not found after migration')
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    if (connection) {
      await connection.end()
      console.log('\n✅ Database connection closed')
    }
  }
}

runMigration().catch(console.error)

