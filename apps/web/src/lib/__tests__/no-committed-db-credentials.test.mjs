// Run: npm test (node --experimental-strip-types --test)
//
// The production database password was committed to this public repo as a
// `process.env.DATABASE_URL || '<url>'` fallback and as `password: '...'` in
// script configs. This scans every tracked file so a pasted-back credential
// fails here instead of shipping. Local .env files are gitignored, so they are
// never scanned; a committed one would be.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_SCANNED_BYTES = 2_000_000

/** scheme://user:password@host — the shape every leaked copy had. */
const CREDENTIAL_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/[^\s:@/'"`]*:([^\s@'"`]+)@([^\s/:'"`?]+)/g

/** ?password=... in a JDBC-style or query-string connection URL. */
const PASSWORD_PARAM = /[?&;]password=([^&;\s'"`#]+)/gi

/** `password: '...'` (optionally behind env fallbacks) in a DB client config. */
const PASSWORD_LITERAL = /(?:^[ \t]*|[{,(][ \t]*)['"]?password['"]?[ \t]*:[ \t]*(?:(?:process\.env\.\w+|process\.env\[[^\]]+\])[ \t]*(?:\|\||\?\?)[ \t]*)*(['"`])([^'"`\n]+)\1/gm
const DB_DRIVER = /require\(['"](?:pg|mysql2?(?:\/promise)?)['"]\)|from ['"](?:pg|mysql2?(?:\/promise)?)['"]|new (?:Pool|Client)\(/
const CODE_FILE = /\.(?:[cm]?js|tsx?)$/

/** MYSQL_PASSWORD=..., PGPASSWORD=..., compose `- POSTGRES_PASSWORD=...` and YAML `DB_PASS: ...`. */
const DB_PASSWORD_ASSIGNMENT = /^[ \t]*(?:-[ \t]+|\$[ \t]+)?(?:export[ \t]+)?(?:MYSQL|PG|POSTGRES|DB|DATABASE|SUPABASE(?:_DB)?)(?:_ROOT)?_?PASS(?:WORD)?[ \t]*[=:][ \t]*['"]?([^\s'"#]+)/gm

/** The mysql/mysqldump `-p<secret>` form, and `--password <secret>` style flags. */
const MYSQL_CLI_PASSWORD = /\bmysql(?:dump|admin)?\b[^\n]*?[ \t]-p(?![\s[<$])([^\s'"`]+)/g
const PASSWORD_FLAG = /--password[= ]['"]?([^\s'"`]+)/g

/** Hosts that can never be the production database: loopback and single-label compose service names. */
function isLocalHost(host) {
  return !host.includes('.') || /^(?:127\.\d+\.\d+\.\d+|0\.0\.0\.0|host\.docker\.internal)$/.test(host)
}

const PLACEHOLDER_HINT = 'Placeholders such as PASSWORD, [YOUR-PASSWORD], <password>, ${VAR}, $VAR, *** or changeme are allowed.'

function isPlaceholder(value) {
  return /^(?:\[[^\]]*\]|<[^>]*>|\$\{[^}]*\}|\$\w+|\{\{[^}]*\}\}|\*+|\.{3}|…|x{3,}|changeme|redacted|pass|[a-z_-]*password[a-z_-]*)$/i.test(value)
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function trackedTextFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .flatMap((file) => {
      const path = join(root, file)
      try {
        if (statSync(path).size > MAX_SCANNED_BYTES) return []
        const bytes = readFileSync(path)
        return bytes.subarray(0, 8000).includes(0) ? [] : [{ file, text: bytes.toString('utf8') }]
      } catch {
        return [] // deleted in the working tree but still in the index
      }
    })
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function hitsFor(file, text, pattern, valueGroup, label, isAllowed = isPlaceholder) {
  return [...text.matchAll(pattern)]
    .filter((match) => !isAllowed(match[valueGroup], match))
    .map((match) => `${file}:${lineOf(text, match.index)} ${label}`)
}

/** Locations only — never the matched value, so a failure does not re-leak it. */
function findCommittedCredentials({ file, text }) {
  const isDbCode = CODE_FILE.test(file) && DB_DRIVER.test(text)
  return [
    ...hitsFor(file, text, CREDENTIAL_URL, 1, 'credential in connection URL', (password, match) => isPlaceholder(password) || isLocalHost(match[2])),
    ...hitsFor(file, text, PASSWORD_PARAM, 1, 'password in connection URL parameters'),
    ...(isDbCode ? hitsFor(file, text, PASSWORD_LITERAL, 2, 'password literal in DB config') : []),
    ...hitsFor(file, text, DB_PASSWORD_ASSIGNMENT, 1, 'DB password assignment'),
    ...hitsFor(file, text, MYSQL_CLI_PASSWORD, 1, 'password on a mysql command line'),
    ...hitsFor(file, text, PASSWORD_FLAG, 1, 'password command-line flag'),
  ]
}

describe('findCommittedCredentials', () => {
  const scan = (text, file = 'scripts/x.js') => findCommittedCredentials({ file, text })
  // Fixtures are assembled at runtime so this file's own source never matches the scan below.
  const url = (scheme, user, password, host) => `${scheme}://${user}:${password}@${host}`
  const mysqlConfig = (password) => [`const mysql = require('mysql2/promise')`, `const c = { user: 'u', password: process.env.MYSQL_PASSWORD || '${password}' }`].join('\n')

  test('flags the env-fallback shape that leaked', () => {
    const text = `const db = process.env.DATABASE_URL || '${url('postgresql', 'postgres.ref', 's3cr%40t', 'aws-1.pooler.supabase.com:6543/postgres')}'`
    assert.deepEqual(scan(text), ['scripts/x.js:1 credential in connection URL'])
  })

  test('flags a password literal in a pg or mysql config', () => {
    assert.deepEqual(scan(mysqlConfig('hunter22')), ['scripts/x.js:2 password literal in DB config'])
  })

  test('never echoes the secret it found', () => {
    const [hit] = scan(url('postgres', 'u', 'topsecretvalue', 'db.example.com/x'), 'README.md')
    assert.ok(hit && !hit.includes('topsecretvalue'))
  })

  test('flags a literal behind a chain of env fallbacks, with or without quoted keys', () => {
    const chained = (password) => [`const { Pool } = require('pg')`, `const c = { "password": process.env.DB_PASSWORD || process.env['MYSQL_PASSWORD'] || '${password}' }`].join('\n')
    assert.deepEqual(scan(chained('hunter22')), ['scripts/x.js:2 password literal in DB config'])
    assert.deepEqual(scan(chained('')), [])
  })

  test('flags command-line, compose, YAML and query-string forms', () => {
    const pw = 'hunter22'
    const lines = [
      `mysqldump -u admin -p${pw} task > backup.sql`,
      `psql --password=${pw} -h db.example.com`,
      `jdbc:postgresql://db.example.com:5432/app?user=app&password=${pw}`,
      url('redis', '', pw, 'cache.example.com:6379'),
    ]
    const assignments = [`- POSTGRES_PASSWORD=${pw}`, `DB_PASS: ${pw}`, `$ PGPASSWORD=${pw} psql`, `MYSQL_ROOT_PASSWORD=${pw}`]
    assert.equal(scan(lines.join('\n'), 'docs/ops.md').length, 4)
    assert.equal(scan(assignments.join('\n'), 'docker-compose.yml').length, 4)
  })

  test('flags a DB password assignment in docs', () => {
    const text = ['```env', 'MYSQL_HOST=HOST', `MYSQL_PASSWORD=${'hunter22'}`, '```'].join('\n')
    assert.deepEqual(scan(text, 'apps/web/database/README.md'), ['apps/web/database/README.md:3 DB password assignment'])
  })

  test('allows placeholders, env interpolation and local dev databases', () => {
    const text = [
      url('postgresql', 'USER', 'PASSWORD', 'HOST:6543/postgres'),
      url('postgresql', 'postgres', '[YOUR-PASSWORD]', 'db.ref.supabase.co:5432/postgres'),
      url('postgresql', 'postgres.<project_ref>', '<password>', 'aws-1.pooler.supabase.com:6543/postgres'),
      url('postgresql', 'postgres', '${SUPABASE_PASSWORD}', '${SUPABASE_HOST}:6543/postgres'),
      url('postgresql', 'postgres', 'postgres', 'localhost:5432/jsr_dev'),
      url('postgres', 'postgres', 'postgres', 'db:5432/app'),
      url('postgres', 'app', 'secret1', 'host.docker.internal:5432/app'),
      'MYSQL_PASSWORD=PASSWORD',
      'MYSQL_PASSWORD=your-mysql-password',
      'DB_PASSWORD=changeme',
      'export PGPASSWORD="$SUPABASE_DB_PASSWORD"',
      'mysqldump -u USER -p[PASSWORD] task > backup.sql',
      'mysql -u root -p task',
      'mkdir -p apps/web/.next && cp -pr src dist',
    ].join('\n')
    assert.deepEqual(scan(text, 'DEPLOYMENT_GUIDE.md'), [])
  })

  test('ignores password literals outside DB client code', () => {
    assert.deepEqual(scan("aria-label={show ? 'Hide password' : 'Show password'}", 'LoginForm.tsx'), [])
    assert.deepEqual(scan(`const { Pool } = require('pg')\nconst label = show ? 'Hide password' : 'Show password'`), [])
    assert.deepEqual(scan(mysqlConfig('hunter22'), 'API_REFERENCE.md'), [])
  })
})

describe('tracked files', () => {
  const root = repoRoot()

  test('contain no database credentials', { skip: root ? false : 'not a git checkout' }, () => {
    const hits = trackedTextFiles(root).flatMap(findCommittedCredentials)
    assert.deepEqual(hits, [], `Move these to apps/web/.env.local or the hosting env, then rotate the password: it is already public. ${PLACEHOLDER_HINT}`)
  })
})
