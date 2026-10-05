const mysql = require('mysql2/promise');

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.');
  process.exit(1);
}

async function fixConstraint() {
  const connection = await mysql.createConnection({
    host: 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
    user: 'u806435594_swarg',
    password: process.env.MYSQL_PASSWORD,
    database: 'task',
    multipleStatements: true
  });

  try {
    console.log('Connected to database');
    
    // Check current constraints
    const [constraints] = await connection.query("SHOW CREATE TABLE settings");
    console.log('\n📋 Current settings table structure:');
    console.log(constraints[0]['Create Table']);
    
    // Drop the incorrect unique constraint and add the correct one
    console.log('\n🔧 Fixing unique constraint...');
    await connection.query(`
      ALTER TABLE settings 
      DROP INDEX unique_setting;
    `);
    console.log('✅ Dropped old unique_setting constraint');
    
    await connection.query(`
      ALTER TABLE settings 
      ADD UNIQUE KEY unique_setting (setting_type, setting_value);
    `);
    console.log('✅ Added new unique_setting constraint on (setting_type, setting_value)');
    
    // Verify
    const [newConstraints] = await connection.query("SHOW CREATE TABLE settings");
    console.log('\n📋 Updated settings table structure:');
    console.log(newConstraints[0]['Create Table']);
    
  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await connection.end();
    console.log('\nDatabase connection closed');
  }
}

fixConstraint().catch(console.error);

