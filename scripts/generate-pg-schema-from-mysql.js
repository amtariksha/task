#!/usr/bin/env node

require('dotenv').config({ path: 'apps/web/.env.local' })
const mysql = require('mysql2/promise')
const fs = require('fs')

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

function mysqlTypeToPg(mysqlType) {
  // Convert MySQL type to PostgreSQL type
  const type = mysqlType.toLowerCase()
  
  if (type.includes('int')) return 'INTEGER'
  if (type.includes('varchar')) {
    const match = mysqlType.match(/varchar\((\d+)\)/)
    return match ? `VARCHAR(${match[1]})` : 'VARCHAR(255)'
  }
  if (type.includes('text')) return 'TEXT'
  if (type.includes('timestamp')) return 'TIMESTAMP'
  if (type.includes('datetime')) return 'TIMESTAMP'
  if (type.includes('date')) return 'DATE'
  if (type.includes('time')) return 'TIME'
  if (type.includes('decimal')) {
    const match = mysqlType.match(/decimal\((\d+),(\d+)\)/)
    return match ? `DECIMAL(${match[1]},${match[2]})` : 'DECIMAL(10,2)'
  }
  if (type.includes('tinyint(1)')) return 'BOOLEAN'
  if (type.includes('bigint')) return 'BIGINT'
  if (type.includes('json')) return 'JSONB'
  if (type.includes('enum')) {
    // Extract enum values
    const match = mysqlType.match(/enum\((.*)\)/)
    if (match) {
      const values = match[1].split(',').map(v => v.trim().replace(/'/g, "''"))
      return `VARCHAR(100) CHECK (COLUMN_NAME IN (${match[1]}))`
    }
  }
  
  return 'TEXT' // fallback
}

function getDefaultValue(defaultVal, type) {
  if (!defaultVal || defaultVal === 'null' || defaultVal === 'NULL') return null
  if (defaultVal === 'CURRENT_TIMESTAMP') return 'CURRENT_TIMESTAMP'
  if (type.includes('BOOLEAN')) {
    return defaultVal === '1' || defaultVal === 'true' ? 'true' : 'false'
  }
  if (type.includes('INTEGER') || type.includes('DECIMAL') || type.includes('BIGINT')) {
    return defaultVal
  }
  return `'${defaultVal}'`
}

async function generateSchema() {
  const conn = await mysql.createConnection(MYSQL_CONFIG)
  
  let schema = `-- PostgreSQL Schema Generated from MySQL
-- Generated: ${new Date().toISOString()}
-- Source: ${MYSQL_CONFIG.database}@${MYSQL_CONFIG.host}

-- Drop existing tables
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS user_notification_preferences CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS bug_comments CASCADE;
DROP TABLE IF EXISTS bug_subtasks CASCADE;
DROP TABLE IF EXISTS bugs CASCADE;
DROP TABLE IF EXISTS wfh_applications CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE;
DROP TABLE IF EXISTS subtasks CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

`
  
  // Get all tables
  const [tables] = await conn.query("SHOW TABLES WHERE Tables_in_task NOT LIKE '%_old'")
  
  for (const tableRow of tables) {
    const tableName = Object.values(tableRow)[0]
    console.log(`Processing table: ${tableName}`)
    
    schema += `\n-- Table: ${tableName}\n`
    schema += `CREATE TABLE ${tableName} (\n`
    
    const [columns] = await conn.query(`DESCRIBE ${tableName}`)
    const columnDefs = []
    const indexes = []
    
    for (const col of columns) {
      let pgType = mysqlTypeToPg(col.Type)
      let colDef = `    ${col.Field} `
      
      // Handle SERIAL for auto_increment
      if (col.Extra === 'auto_increment') {
        colDef += 'SERIAL PRIMARY KEY'
      } else {
        // Replace COLUMN_NAME placeholder in CHECK constraint
        pgType = pgType.replace('COLUMN_NAME', col.Field)
        colDef += pgType
        
        // NOT NULL
        if (col.Null === 'NO' && col.Key !== 'PRI') {
          colDef += ' NOT NULL'
        }
        
        // DEFAULT
        const defaultVal = getDefaultValue(col.Default, pgType)
        if (defaultVal && !col.Extra.includes('DEFAULT_GENERATED')) {
          colDef += ` DEFAULT ${defaultVal}`
        } else if (col.Extra.includes('DEFAULT_GENERATED') && col.Default === 'CURRENT_TIMESTAMP') {
          colDef += ' DEFAULT CURRENT_TIMESTAMP'
        }
        
        // UNIQUE
        if (col.Key === 'UNI') {
          colDef += ' UNIQUE'
        }
      }
      
      columnDefs.push(colDef)
    }
    
    schema += columnDefs.join(',\n')
    schema += `\n);\n`
    
    // Add indexes
    const [indexResults] = await conn.query(`SHOW INDEX FROM ${tableName}`)
    const indexMap = new Map()
    
    for (const idx of indexResults) {
      if (idx.Key_name === 'PRIMARY' || idx.Non_unique === 0) continue // Skip primary and unique
      
      if (!indexMap.has(idx.Key_name)) {
        indexMap.set(idx.Key_name, [])
      }
      indexMap.get(idx.Key_name).push(idx.Column_name)
    }
    
    for (const [indexName, columns] of indexMap) {
      schema += `CREATE INDEX ${indexName} ON ${tableName} (${columns.join(', ')});\n`
    }
  }
  
  // Add triggers for updated_at
  schema += `\n-- Trigger function for updated_at\n`
  schema += `CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';\n\n`
  
  for (const tableRow of tables) {
    const tableName = Object.values(tableRow)[0]
    const [columns] = await conn.query(`DESCRIBE ${tableName}`)
    const hasUpdatedAt = columns.some(col => col.Field === 'updated_at')
    
    if (hasUpdatedAt) {
      schema += `CREATE TRIGGER update_${tableName}_updated_at BEFORE UPDATE ON ${tableName}
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n`
    }
  }
  
  await conn.end()
  
  // Write to file
  fs.writeFileSync('postgres_schema_from_mysql.sql', schema)
  console.log('\n✅ PostgreSQL schema generated: postgres_schema_from_mysql.sql')
}

generateSchema().catch(console.error)

