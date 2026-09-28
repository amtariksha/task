/**
 * Live authorization checks for the security fixes in fix/security-correctness.
 *
 * These exercise the real routes against the real database, because inspection
 * repeatedly missed things that a request found immediately. Every check here is
 * READ-ONLY or expects a refusal — nothing in this script modifies data.
 *
 * Usage:
 *   cd apps/web
 *   npx next build && npx next start -p 3999 &
 *   node ../../scripts/verify-authz.cjs            # expects apps/web/.env.local
 *
 * The employee, project and application IDs below are from the current
 * deployment; adjust ACTORS and the ids if you run this elsewhere. Tokens are
 * minted with the deployment's own JWT_SECRET, so this only works where you
 * already have it.
 *
 * Not covered here, because doing it would change live data — run these against
 * a staging copy:
 *   - POST /api/{leaves,wfh}/[id]/approve on your OWN application  -> expect 403
 *   - GraphQL updateBug / deleteBug as a stranger                  -> expect FORBIDDEN
 *   - GraphQL approveAttendanceRequest on your own correction       -> expect FORBIDDEN
 *   - DELETE then POST /restore on a real project                   -> expect 200, 200
 */
const fs = require('fs'); const jwt = require('jsonwebtoken')
const env = fs.readFileSync(require('path').join(__dirname, '..', 'apps', 'web', '.env.local'), 'utf8')
const val = k => { const m = env.match(new RegExp('^'+k+'=(.*)$','m')); return m ? m[1].replace(/^["']|["']$/g,'') : null }
const SECRET = val('JWT_SECRET')
const BASE = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3999'

const token = (employeeId, role, companyId, isPlatformAdmin = false) =>
  jwt.sign({ employeeId, role, name: employeeId, companyId, isPlatformAdmin }, SECRET, { expiresIn: '10m' })

const ACTORS = {
  platformAdmin: token('AM-0001', 'top_management', 'COMP-001', true),
  projectMember: token('AM-0005', 'management', 'COMP-001'),       // member of PRJ-001, owns the WFH
  leaveOwner:    token('AM-0012', 'top_management', 'COMP-001'),   // member of PRJ-001, owns the leave
  outsider:      token('AM-0017', 'employee', 'COMP-001'),         // not on PRJ-001, no reports
  otherCompany:  token('AM-0017', 'admin', 'COMP-999'),            // admin of a company that owns nothing here
}

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')) }
}

async function req(path, actor, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + ACTORS[actor], ...(init.headers || {}) },
  })
  let body = null
  try { body = await res.json() } catch { body = null }
  return { status: res.status, headers: res.headers, body }
}

;(async () => {
  console.log('\nS14 — /api/users must never be shared-cached')
  {
    const r = await req('/api/users', 'projectMember')
    const cc = r.headers.get('cache-control') || ''
    check('200 for a signed-in user', r.status === 200, 'got ' + r.status)
    // Next 16 replaces the handler's Cache-Control with `no-store, max-age=0` on
    // every dynamic route in this build, so the assertion is on the effect that
    // matters: nothing may store this response.
    check('Cache-Control forbids storing the response', /no-store/.test(cc), cc)
  }

  console.log('\nS2 — GET /api/wfh/[id] exists and is owner-scoped')
  {
    const id = 'WFH-1782139236405-4x26bebjv' // belongs to AM-0005
    const owner = await req('/api/wfh/' + id, 'projectMember')
    check('owner gets 200 (was 405: no handler)', owner.status === 200, 'got ' + owner.status)
    const stranger = await req('/api/wfh/' + id, 'outsider')
    check('stranger gets 403', stranger.status === 403, 'got ' + stranger.status + ' ' + JSON.stringify(stranger.body))
    const missing = await req('/api/wfh/WFH-does-not-exist', 'platformAdmin')
    check('unknown id gets 404', missing.status === 404, 'got ' + missing.status)
  }

  console.log('\nS3 — GET /api/leaves/[id] is guarded')
  {
    const id = 'LEAVE-1780946533528-3y1lld1a9' // belongs to AM-0012
    const owner = await req('/api/leaves/' + id, 'leaveOwner')
    check('owner gets 200', owner.status === 200, 'got ' + owner.status)
    const stranger = await req('/api/leaves/' + id, 'outsider')
    check('stranger gets 403 (was unguarded 200)', stranger.status === 403, 'got ' + stranger.status)
  }

  console.log('\nS4 — project DELETE with no body, 404 before 403')
  {
    const r = await req('/api/projects/PRJ-DOES-NOT-EXIST', 'outsider', { method: 'DELETE' })
    check('no body is not a 400', r.status !== 400, 'got ' + r.status + ' ' + JSON.stringify(r.body))
    check('missing project is 404, not 403', r.status === 404, 'got ' + r.status)
  }

  console.log('\nS12 — project secrets: tenant boundary and write separation')
  {
    const list = await req('/api/projects/PRJ-001/credentials', 'projectMember')
    check('a project member may list', list.status === 200, 'got ' + list.status + ' ' + JSON.stringify(list.body))
    check('the list reports canWrite', list.body && typeof list.body.canWrite === 'boolean',
      JSON.stringify(list.body && Object.keys(list.body)))
    check('a plain member may NOT write', list.body && list.body.canWrite === false,
      'canWrite=' + (list.body && list.body.canWrite))

    const outsiderList = await req('/api/projects/PRJ-001/credentials', 'outsider')
    check('a non-member is denied the list', outsiderList.status === 403, 'got ' + outsiderList.status)

    const crossCompany = await req('/api/projects/PRJ-001/credentials', 'otherCompany')
    check('an admin of another company is denied', crossCompany.status === 403,
      'got ' + crossCompany.status + ' ' + JSON.stringify(crossCompany.body))

    const crossReveal = await req('/api/projects/PRJ-001/env?environment=production&reveal=true', 'otherCompany')
    check('an admin of another company cannot reveal env values', crossReveal.status === 403,
      'got ' + crossReveal.status)

    const crossExport = await req('/api/projects/PRJ-001/env/export?environment=production', 'otherCompany')
    check('an admin of another company cannot export .env', crossExport.status === 403,
      'got ' + crossExport.status)

    const memberExport = await req('/api/projects/PRJ-001/env/export?environment=production', 'projectMember')
    check('a plain member cannot bulk-export either', memberExport.status === 403,
      'got ' + memberExport.status)

    const managerList = await req('/api/projects/PRJ-001/credentials', 'platformAdmin')
    check('the project manager / platform admin may write', managerList.body && managerList.body.canWrite === true,
      'canWrite=' + (managerList.body && managerList.body.canWrite))
  }

  console.log('\nS13 — a revealed secret is never cacheable')
  {
    const r = await req('/api/projects/PRJ-001/env?environment=production&reveal=true', 'platformAdmin')
    const cc = r.headers.get('cache-control') || ''
    // 500 here is local config only: ENCRYPTION_KEY is empty in this .env.local, so
    // decryption throws AFTER authorization has passed. What matters is that an
    // authorized caller is not refused.
    check('an authorized caller is not refused', r.status !== 403 && r.status !== 404, 'got ' + r.status)
    check('reveal is no-store', /no-store/.test(cc), cc)
    const plain = await req('/api/projects/PRJ-001/env?environment=production', 'platformAdmin')
    check('a name-only listing does not leak values',
      plain.status === 200 && Array.isArray(plain.body?.data) &&
        plain.body.data.every(s => s.value === undefined || s.value === null),
      JSON.stringify(plain.body?.data?.[0]))
  }

  console.log('\nS15 — /api/projects is scoped to the caller')
  {
    const member = await req('/api/projects?type=main', 'projectMember')
    const outsider = await req('/api/projects?type=main', 'outsider')
    // AM-0017 is a member of exactly one project (PRJ-037).
    check('a project member sees their projects', member.status === 200 && Array.isArray(member.body), 'got ' + member.status)
    check('a user sees only the projects they are assigned to',
      outsider.status === 200 && Array.isArray(outsider.body) && outsider.body.length === 1 &&
        outsider.body[0].projectId === 'PRJ-037',
      'got ' + outsider.status + ' ' + JSON.stringify((outsider.body || []).map(p => p.projectId)))
    const wrongCompany = await req('/api/projects?type=main', 'otherCompany')
    check('a session in another company sees none of these projects',
      wrongCompany.status === 200 && Array.isArray(wrongCompany.body) && wrongCompany.body.length === 0,
      'len=' + (Array.isArray(wrongCompany.body) ? wrongCompany.body.length : '?'))
  }

  console.log('\nS14 — settings are private and company-keyed')
  {
    const r = await req('/api/settings?dropdowns=true', 'projectMember')
    const cc = r.headers.get('cache-control') || ''
    check('dropdowns return 200', r.status === 200, 'got ' + r.status)
    check('settings are not publicly cacheable', !/public/.test(cc), cc || '(no header)')
  }

  console.log('\nS9 — leave and WFH lists are scoped')
  {
    const outsider = await req('/api/leaves', 'outsider')
    check('a user with no reports sees only their own leave',
      outsider.status === 200 && (outsider.body?.data || []).every(l => l.employeeId === 'AM-0017'),
      'got ' + outsider.status + ' n=' + (outsider.body?.data || []).length)
    const outsiderWfh = await req('/api/wfh', 'outsider')
    check('same for WFH',
      outsiderWfh.status === 200 && (outsiderWfh.body?.data || []).every(w => w.employeeId === 'AM-0017'),
      'n=' + (outsiderWfh.body?.data || []).length)
  }

  console.log('\nS16 — feed topics are company-filtered')
  {
    const own = await req('/api/feed/topics', 'projectMember')
    const other = await req('/api/feed/topics', 'otherCompany')
    check('own company sees its topics', own.status === 200 && (own.body?.data || []).length > 0,
      'n=' + (own.body?.data || []).length)
    check('another company sees none of them',
      other.status === 200 && (other.body?.data || []).length === 0,
      'n=' + (other.body?.data || []).length)
  }

  console.log('\nS6 — GraphQL sessions carry company claims')
  {
    const res = await fetch(BASE + '/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ACTORS.platformAdmin },
      body: JSON.stringify({ query: '{ __type(name: "User") { fields { name } } }' }),
    })
    const body = await res.json().catch(() => null)
    const fields = (body?.data?.__type?.fields || []).map(f => f.name)
    // Introspection is production-disabled, so fall back to querying the fields.
    if (fields.length) {
      check('User type exposes companyId', fields.includes('companyId'), fields.join(','))
      check('User type exposes isPlatformAdmin', fields.includes('isPlatformAdmin'), '')
    } else {
      const res2 = await fetch(BASE + '/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ACTORS.platformAdmin },
        body: JSON.stringify({ query: 'query { users { employeeId companyId isPlatformAdmin } }' }),
      })
      const b2 = await res2.json().catch(() => null)
      const unknownField = JSON.stringify(b2?.errors || '').match(/Cannot query field/)
      check('companyId/isPlatformAdmin are queryable on User', !unknownField,
        JSON.stringify(b2?.errors?.[0]?.message || '').slice(0, 160))
    }
  }

  console.log('\nDashboard data must not hand over every tenant\u2019s people')
  {
    // ?includeUsers=true used to bypass the role check entirely and return
    // getAllUsers() - every employee of every company - to any signed-in caller.
    const own = await req('/api/dashboard-data?includeUsers=true', 'projectMember')
    check('a non-admin may still ask for the user list', own.status === 200, 'got ' + own.status)
    const users = own.body?.data?.users || []
    check('the list is company-scoped, not the whole deployment',
      users.length > 0 && users.every(u => u.employeeId && u.employeeId.startsWith('AM-')),
      'n=' + users.length)
    const foreign = await req('/api/dashboard-data?includeUsers=true', 'otherCompany')
    check('a session in another company gets none of this company\u2019s people',
      foreign.status === 200 && (foreign.body?.data?.users || []).length === 0,
      'n=' + (foreign.body?.data?.users || []).length)
  }

  console.log('\nProject membership is a privilege, not self-service')
  {
    // Re-assigning someone who is ALREADY a member is a no-op, so this probes the
    // guard without changing data even if the guard were missing.
    const r = await req('/api/projects/PRJ-001/users', 'outsider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 'AM-0005' }),
    })
    check('a non-manager cannot add members (was completely unguarded)',
      r.status === 403, 'got ' + r.status + ' ' + JSON.stringify(r.body))
    const patch = await req('/api/projects/PRJ-001/users', 'outsider', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 'AM-0005', role: 'manager' }),
    })
    check('a non-manager cannot promote a member to manager',
      patch.status === 403, 'got ' + patch.status)
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2) })
