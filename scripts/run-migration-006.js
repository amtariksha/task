const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.');
  process.exit(1);
}

async function runMigration() {
  const connection = await mysql.createConnection({
    host: 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
    user: 'u806435594_swarg',
    password: process.env.MYSQL_PASSWORD,
    database: 'task',
    multipleStatements: true
  });

  try {
    console.log('Connected to database');
    
    const migrationPath = path.join(__dirname, '../database/migrations/006_add_status_settings_and_update_bugs_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration 006...');
    await connection.query(sql);
    
    console.log('✅ Migration 006 completed successfully!');
    
    // Verify settings were added
    const [settings] = await connection.query(
      "SELECT setting_type, setting_value, display_order FROM settings WHERE setting_type IN ('task_status', 'bug_status', 'bug_type') ORDER BY setting_type, display_order"
    );
    
    console.log('\n📊 Settings added:');
    console.table(settings);
    
    // Verify bugs table schema
    const [bugsSchema] = await connection.query("DESCRIBE bugs");
    console.log('\n📋 Bugs table schema (relevant columns):');
    const relevantColumns = bugsSchema.filter(col => 
      ['severity', 'priority', 'status', 'category', 'platform'].includes(col.Field)
    );
    console.table(relevantColumns);
    
    // Verify tasks table schema
    const [tasksSchema] = await connection.query("DESCRIBE tasks");
    console.log('\n📋 Tasks table schema (status column):');
    const statusColumn = tasksSchema.filter(col => col.Field === 'status');
    console.table(statusColumn);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
    console.log('\nDatabase connection closed');
  }
}

runMigration().catch(console.error);

