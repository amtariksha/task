const mysql = require('mysql2/promise');

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.');
  process.exit(1);
}

async function checkUsers() {
  const connection = await mysql.createConnection({
    host: 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
    user: 'u806435594_swarg',
    password: process.env.MYSQL_PASSWORD,
    database: 'task'
  });

  try {
    console.log('Connected to database');
    
    const [users] = await connection.query("SELECT employee_id, name, role FROM users ORDER BY employee_id");
    
    console.log('\n📊 Users in database:');
    console.table(users);
    
  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await connection.end();
    console.log('\nDatabase connection closed');
  }
}

checkUsers().catch(console.error);

