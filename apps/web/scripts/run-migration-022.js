#!/usr/bin/env node

/**
 * Run Migration 022: Add task name field (PostgreSQL)
 * 
 * This script adds the 'name' column to the tasks table in PostgreSQL
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.')
  process.exit(1)
}

// PostgreSQL Configuration (Supabase)
const PG_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}

async function runMigration() {
  console.log('🚀 Starting Migration 022: Add task name field\n')
  
  const pool = new Pool(PG_CONFIG)
  
  try {
    console.log('📡 Connecting to PostgreSQL database...')
    const client = await pool.connect()
    console.log('✅ Database connection successful!\n')
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/022_add_task_name_field_postgresql.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('⏳ Running migration...\n')
    
    // Execute migration
    const result = await client.query(sql)
    
    console.log('✅ Migration completed successfully!\n')
    
    // Verify the changes
    console.log('🔍 Verifying changes...\n')
    
    // Check if name column exists
    const columnCheck = await client.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'name'
    `)
    
    if (columnCheck.rows.length > 0) {
      const col = columnCheck.rows[0]
      console.log('✅ Column "name" exists:')
      console.log(`   - Type: ${col.data_type}`)
      console.log(`   - Max Length: ${col.character_maximum_length}`)
      console.log(`   - Nullable: ${col.is_nullable}`)
    } else {
      console.log('❌ Column "name" not found!')
    }
    
    // Check index
    const indexCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'tasks' AND indexname = 'idx_tasks_name'
    `)
    
    if (indexCheck.rows.length > 0) {
      console.log('✅ Index "idx_tasks_name" exists')
    } else {
      console.log('❌ Index "idx_tasks_name" not found!')
    }
    
    // Sample data
    const sampleData = await client.query(`
      SELECT task_id, name, SUBSTRING(description, 1, 50) as description_preview
      FROM tasks
      LIMIT 5
    `)
    
    console.log('\n📊 Sample tasks with name field:')
    sampleData.rows.forEach(row => {
      console.log(`   ${row.task_id}: ${row.name}`)
    })
    
    // Count tasks
    const countResult = await client.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(name) as tasks_with_name
      FROM tasks
    `)
    
    const counts = countResult.rows[0]
    console.log(`\n📈 Statistics:`)
    console.log(`   Total tasks: ${counts.total_tasks}`)
    console.log(`   Tasks with name: ${counts.tasks_with_name}`)
    
    client.release()
    console.log('\n🎉 Migration 022 completed successfully!\n')
    
  } catch (error) {
    console.error('❌ Migration failed:')
    console.error(error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the migration
runMigration()

