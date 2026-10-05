// Quick script to check settings table data
const mysql = require('mysql2/promise');

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.');
  process.exit(1);
}

const DB_CONFIG = {
  host: 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
  port: 3306,
  user: 'u806435594_swarg',
  password: process.env.MYSQL_PASSWORD,
  database: 'task',
  ssl: {
    rejectUnauthorized: false
  }
};

async function checkSettings() {
  const connection = await mysql.createConnection(DB_CONFIG);
  
  try {
    const [rows] = await connection.execute('SELECT id, `key`, value, metadata FROM settings ORDER BY id');
    
    console.log('\n=== Settings Table Data ===\n');
    
    rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`Key: ${row.key}`);
      console.log(`Value (raw): ${row.value}`);
      console.log(`Value type: ${typeof row.value}`);
      
      // Try to parse value
      try {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        console.log(`Value (parsed): ${JSON.stringify(parsed)}`);
      } catch (e) {
        console.log(`❌ ERROR parsing value: ${e.message}`);
      }
      
      console.log(`Metadata (raw): ${row.metadata}`);
      console.log('---\n');
    });
    
  } finally {
    await connection.end();
  }
}

checkSettings().catch(console.error);

