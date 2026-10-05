#!/usr/bin/env node

require('dotenv').config({ path: 'apps/web/.env.local' })
const mysql = require('mysql2/promise')

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD is not set. Export it and re-run.')
  process.exit(1)
}

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'u806435594_swarg',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'task',
  ssl: { rejectUnauthorized: false }
}

async function getSchema() {
  const conn = await mysql.createConnection(MYSQL_CONFIG)
  
  // Get all tables
  const [tables] = await conn.query('SHOW TABLES')
  
  for (const tableRow of tables) {
    const tableName = Object.values(tableRow)[0]
    console.log(`\n=== ${tableName} ===`)
    
    const [columns] = await conn.query(`DESCRIBE ${tableName}`)
    console.table(columns)
  }
  
  await conn.end()
}

getSchema().catch(console.error)

