#!/usr/bin/env node

/**
 * Check if parent_task_id and parent_dev_id columns exist
 */

const { Pool } = require('pg')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it (the value lives in apps/web/.env.local) and re-run.')
  process.exit(1)
}

const PG_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}

async function checkColumns() {
  console.log('🔍 Checking for parent columns...\n')
  
  const pool = new Pool(PG_CONFIG)
  
  try {
    const client = await pool.connect()
    
    // Check tasks.parent_task_id
    const tasksCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'parent_task_id'
    `)
    
    if (tasksCheck.rows.length > 0) {
      console.log('✅ tasks.parent_task_id exists')
      console.log(`   Type: ${tasksCheck.rows[0].data_type}`)
      console.log(`   Nullable: ${tasksCheck.rows[0].is_nullable}`)
    } else {
      console.log('❌ tasks.parent_task_id does NOT exist')
    }
    
    // Check bugs.parent_dev_id
    const bugsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bugs' AND column_name = 'parent_dev_id'
    `)
    
    if (bugsCheck.rows.length > 0) {
      console.log('✅ bugs.parent_dev_id exists')
      console.log(`   Type: ${bugsCheck.rows[0].data_type}`)
      console.log(`   Nullable: ${bugsCheck.rows[0].is_nullable}`)
    } else {
      console.log('❌ bugs.parent_dev_id does NOT exist')
    }
    
    // Check indexes
    const tasksIndexCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'tasks' AND indexname = 'idx_tasks_parent_task_id'
    `)
    
    if (tasksIndexCheck.rows.length > 0) {
      console.log('✅ idx_tasks_parent_task_id index exists')
    } else {
      console.log('❌ idx_tasks_parent_task_id index does NOT exist')
    }
    
    const bugsIndexCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'bugs' AND indexname = 'idx_bugs_parent_dev_id'
    `)
    
    if (bugsIndexCheck.rows.length > 0) {
      console.log('✅ idx_bugs_parent_dev_id index exists')
    } else {
      console.log('❌ idx_bugs_parent_dev_id index does NOT exist')
    }
    
    client.release()
    console.log('\n✅ Check complete!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

checkColumns()

