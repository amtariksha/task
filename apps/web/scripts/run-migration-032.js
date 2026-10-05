#!/usr/bin/env node

/**
 * Run Migration 032: Create Feed Feature Tables (PostgreSQL)
 * 
 * This script creates all tables required for the social feed feature
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
  console.log('🚀 Starting Migration 032: Create Feed Feature Tables\n')
  
  const pool = new Pool(PG_CONFIG)
  
  try {
    console.log('📡 Connecting to PostgreSQL database...')
    const client = await pool.connect()
    console.log('✅ Database connection successful!\n')
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/032_create_feed_tables_postgresql.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('⏳ Running migration...\n')
    
    // Execute migration
    await client.query(sql)
    
    console.log('✅ Migration completed successfully!\n')
    
    // Verify the changes
    console.log('🔍 Verifying changes...\n')
    
    // Check if feed_topics table exists
    const topicsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_topics
    `)
    console.log(`✅ feed_topics table created with ${topicsResult.rows[0].count} initial topics`)
    
    // Check if feed_posts table exists
    const postsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_posts
    `)
    console.log(`✅ feed_posts table created (${postsResult.rows[0].count} posts)`)
    
    // Check if feed_reactions table exists
    const reactionsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_reactions
    `)
    console.log(`✅ feed_reactions table created (${reactionsResult.rows[0].count} reactions)`)
    
    // Check if feed_comments table exists
    const commentsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_comments
    `)
    console.log(`✅ feed_comments table created (${commentsResult.rows[0].count} comments)`)
    
    // Check if feed_views table exists
    const viewsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_views
    `)
    console.log(`✅ feed_views table created (${viewsResult.rows[0].count} views)`)
    
    // Check if feed_post_topics table exists
    const postTopicsResult = await client.query(`
      SELECT COUNT(*) as count FROM feed_post_topics
    `)
    console.log(`✅ feed_post_topics table created (${postTopicsResult.rows[0].count} associations)`)
    
    console.log('\n✨ All feed tables created successfully!\n')
    
    client.release()
    await pool.end()
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.error('\nError details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    })
    
    await pool.end()
    process.exit(1)
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

