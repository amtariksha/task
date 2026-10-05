#!/usr/bin/env node

/**
 * Database Initialization Script
 * 
 * This script:
 * 1. Tests the MySQL database connection
 * 2. Optionally imports the schema
 * 3. Optionally imports sample data
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

async function testConnection() {
  console.log('🔍 Testing MySQL database connection...')
  console.log(`   Host: ${DB_CONFIG.host}`)
  console.log(`   Database: ${DB_CONFIG.database}`)
  console.log(`   User: ${DB_CONFIG.user}`)
  
  try {
    const connection = await mysql.createConnection(DB_CONFIG)
    await connection.ping()
    console.log('✅ Database connection successful!\n')
    await connection.end()
    return true
  } catch (error) {
    console.error('❌ Database connection failed:')
    console.error(`   Error: ${error.message}\n`)
    return false
  }
}

async function importSchema() {
  console.log('📋 Importing database schema...')
  
  try {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    const connection = await mysql.createConnection(DB_CONFIG)
    await connection.query(schema)
    console.log('✅ Schema imported successfully!\n')
    await connection.end()
    return true
  } catch (error) {
    console.error('❌ Schema import failed:')
    console.error(`   Error: ${error.message}\n`)
    return false
  }
}

async function importSampleData() {
  console.log('📊 Importing sample data...')
  
  try {
    const dataPath = path.join(__dirname, '..', 'database', 'sample_data.sql')
    const data = fs.readFileSync(dataPath, 'utf8')
    
    const connection = await mysql.createConnection(DB_CONFIG)
    await connection.query(data)
    console.log('✅ Sample data imported successfully!\n')
    await connection.end()
    return true
  } catch (error) {
    console.error('❌ Sample data import failed:')
    console.error(`   Error: ${error.message}\n`)
    return false
  }
}

async function verifyTables() {
  console.log('🔍 Verifying database tables...')
  
  try {
    const connection = await mysql.createConnection(DB_CONFIG)
    
    const [tables] = await connection.query('SHOW TABLES')
    console.log(`   Found ${tables.length} tables:`)
    tables.forEach(table => {
      const tableName = Object.values(table)[0]
      console.log(`   - ${tableName}`)
    })
    
    console.log('\n📊 Table row counts:')
    for (const table of tables) {
      const tableName = Object.values(table)[0]
      const [result] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`)
      console.log(`   - ${tableName}: ${result[0].count} rows`)
    }
    
    console.log('\n✅ Database verification complete!\n')
    await connection.end()
    return true
  } catch (error) {
    console.error('❌ Database verification failed:')
    console.error(`   Error: ${error.message}\n`)
    return false
  }
}

async function main() {
  console.log('=' .repeat(70))
  console.log('JSR Task Management - Database Initialization')
  console.log('=' .repeat(70))
  console.log()
  
  const args = process.argv.slice(2)
  const shouldImportSchema = args.includes('--schema')
  const shouldImportData = args.includes('--data')
  const shouldVerify = args.includes('--verify')
  
  // Test connection
  const connected = await testConnection()
  if (!connected) {
    console.log('❌ Cannot proceed without a valid database connection.')
    process.exit(1)
  }
  
  // Import schema if requested
  if (shouldImportSchema) {
    const schemaImported = await importSchema()
    if (!schemaImported) {
      console.log('⚠️  Schema import failed, but continuing...')
    }
  }
  
  // Import sample data if requested
  if (shouldImportData) {
    const dataImported = await importSampleData()
    if (!dataImported) {
      console.log('⚠️  Sample data import failed, but continuing...')
    }
  }
  
  // Verify tables if requested
  if (shouldVerify) {
    await verifyTables()
  }
  
  console.log('=' .repeat(70))
  console.log('✅ Database initialization complete!')
  console.log('=' .repeat(70))
  console.log()
  console.log('Usage:')
  console.log('  node scripts/init-database.js              # Test connection only')
  console.log('  node scripts/init-database.js --schema     # Import schema')
  console.log('  node scripts/init-database.js --data       # Import sample data')
  console.log('  node scripts/init-database.js --verify     # Verify tables')
  console.log('  node scripts/init-database.js --schema --data --verify  # All')
  console.log()
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

