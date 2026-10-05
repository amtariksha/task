#!/usr/bin/env node

/**
 * Test Supabase Connection
 * 
 * This script tests different Supabase connection methods to find which one works.
 * Run this locally to verify connectivity before deploying to Vercel.
 */

const { Client } = require('pg')
const dns = require('dns').promises

// SECURITY: never hardcode DB credentials. Provide via environment variables.
const SUPABASE_HOST = process.env.SUPABASE_HOST
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD

if (!SUPABASE_HOST || !SUPABASE_PASSWORD) {
  console.error('Set SUPABASE_HOST and SUPABASE_PASSWORD environment variables before running this script.')
  process.exit(1)
}

// Connection strings to test
const CONNECTION_STRINGS = {
  'Transaction Pooler (Port 6543)': `postgresql://postgres:${SUPABASE_PASSWORD}@${SUPABASE_HOST}:6543/postgres?pgbouncer=true`,
  'Session Pooler (Port 5432)': `postgresql://postgres:${SUPABASE_PASSWORD}@${SUPABASE_HOST}:5432/postgres`,
  'Alternative IPv4 Pooler (Port 6543) - RECOMMENDED FOR VERCEL': `postgresql://postgres.rbckjkdohzbclomrufrx:${SUPABASE_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  'Alternative IPv4 Pooler (Port 5432)': `postgresql://postgres.rbckjkdohzbclomrufrx:${SUPABASE_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
}

async function testDNS() {
  console.log('\n🔍 Testing DNS Resolution...\n')
  
  try {
    const addresses = await dns.resolve4(SUPABASE_HOST)
    console.log(`✅ DNS Resolution Successful: ${SUPABASE_HOST}`)
    console.log(`   IPv4 Addresses: ${addresses.join(', ')}`)
    return true
  } catch (error) {
    console.error(`❌ DNS Resolution Failed: ${SUPABASE_HOST}`)
    console.error(`   Error: ${error.message}`)
    return false
  }
}

async function testConnection(name, connectionString) {
  console.log(`\n🔌 Testing: ${name}`)
  console.log(`   Connection: ${connectionString.replace(/:[^:@]+@/, ':****@')}`)
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  })

  try {
    await client.connect()
    console.log(`   ✅ Connection successful!`)
    
    const result = await client.query('SELECT version()')
    console.log(`   ✅ Query successful!`)
    console.log(`   PostgreSQL Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`)
    
    await client.end()
    return true
  } catch (error) {
    console.error(`   ❌ Connection failed: ${error.message}`)
    if (error.code) {
      console.error(`   Error Code: ${error.code}`)
    }
    return false
  }
}

async function main() {
  console.log('=' .repeat(80))
  console.log('🧪 SUPABASE CONNECTION TEST')
  console.log('=' .repeat(80))
  
  // Test DNS first
  const dnsWorks = await testDNS()
  
  if (!dnsWorks) {
    console.log('\n⚠️  DNS resolution failed. This could mean:')
    console.log('   1. Supabase project is paused (check dashboard)')
    console.log('   2. Network connectivity issues')
    console.log('   3. DNS propagation delay')
    console.log('\n💡 Solution: Log in to https://supabase.com/dashboard and restore your project')
    return
  }
  
  // Test each connection method
  console.log('\n' + '='.repeat(80))
  console.log('🔌 TESTING CONNECTION METHODS')
  console.log('='.repeat(80))
  
  const results = {}
  
  for (const [name, connectionString] of Object.entries(CONNECTION_STRINGS)) {
    results[name] = await testConnection(name, connectionString)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second between tests
  }
  
  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 SUMMARY')
  console.log('='.repeat(80))
  
  const workingMethods = Object.entries(results).filter(([_, works]) => works)
  const failedMethods = Object.entries(results).filter(([_, works]) => !works)
  
  if (workingMethods.length > 0) {
    console.log('\n✅ Working Connection Methods:')
    workingMethods.forEach(([name]) => console.log(`   - ${name}`))
    
    console.log('\n💡 Recommended for Vercel:')
    if (results['Transaction Pooler (Port 6543)']) {
      console.log('   Use: Transaction Pooler (Port 6543)')
      console.log('   DATABASE_URL=postgresql://postgres:PASSWORD@db.rbckjkdohzbclomrufrx.supabase.co:6543/postgres?pgbouncer=true')
    } else if (results['Session Pooler (Port 5432)']) {
      console.log('   Use: Session Pooler (Port 5432)')
      console.log('   DATABASE_URL=postgresql://postgres:PASSWORD@db.rbckjkdohzbclomrufrx.supabase.co:5432/postgres')
    }
  }
  
  if (failedMethods.length > 0) {
    console.log('\n❌ Failed Connection Methods:')
    failedMethods.forEach(([name]) => console.log(`   - ${name}`))
  }
  
  console.log('\n' + '='.repeat(80))
}

main().catch(console.error)

