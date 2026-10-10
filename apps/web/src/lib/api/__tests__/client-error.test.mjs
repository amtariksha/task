// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { describeFailure, isApplicationError } from '../client-error.ts'

/** The shape node-postgres raises: pg-protocol's DatabaseError, an Error subclass carrying the server's fields. */
class DatabaseError extends Error {
  constructor(message, fields) {
    super(message)
    this.name = 'error'
    Object.assign(this, { length: 120, severity: 'ERROR', ...fields })
  }
}

/** What GET /api/projects/[projectId]/users/[employeeId]/artifacts sent to the browser. */
const anyAllError = () =>
  new DatabaseError('op ANY/ALL (array) requires array on right side', {
    code: '42809',
    position: '312',
    file: 'parse_oper.c',
    routine: 'make_scalar_array_op',
  })

const uniqueViolation = () =>
  new DatabaseError('duplicate key value violates unique constraint "projects_company_id_project_name_key"', {
    code: '23505',
    detail: 'Key (company_id, project_name)=(c1, Atlas) already exists.',
    schema: 'public',
    table: 'projects',
    constraint: 'projects_company_id_project_name_key',
  })

/** Node attaches these to a plain Error when the database host is unreachable. */
const connectionRefused = () =>
  Object.assign(new Error('connect ECONNREFUSED 10.0.4.17:5432'), {
    errno: -111,
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '10.0.4.17',
    port: 5432,
  })

const notOurs = [
  ['a node-postgres error', anyAllError],
  ['a unique violation naming the table and constraint', uniqueViolation],
  ['a connection error naming the database host', connectionRefused],
  ['a TypeError from a bug in the handler', () => new TypeError("Cannot read properties of undefined (reading 'rows')")],
  ['a SyntaxError from a malformed request body', () => new SyntaxError('Unexpected token } in JSON at position 41')],
  ['an AggregateError', () => new AggregateError([connectionRefused()], 'All promises were rejected')],
  ['a thrown string', () => 'relation "projects" does not exist'],
  ['a thrown object that only looks like an error', () => ({ message: 'column "assigned_to" does not exist' })],
  ['null', () => null],
  ['undefined', () => undefined],
  ['an Error with no message', () => new Error('')],
]

describe('isApplicationError — is this an error the app raised on purpose?', () => {
  test('a bare Error thrown by the data layer is', () => {
    assert.equal(isApplicationError(new Error('Cannot delete project with sub-projects. Delete sub-projects first.')), true)
  })

  test('wrapping a driver error keeps the message the app wrote', () => {
    const wrapped = new Error('Failed to create setting', { cause: uniqueViolation() })
    assert.equal(isApplicationError(wrapped), true)
  })

  for (const [name, make] of notOurs) {
    test(`${name} is not`, () => {
      assert.equal(isApplicationError(make()), false)
    })
  }
})

describe('describeFailure — what a catch block answers', () => {
  test('a message the handler threw itself goes out with its 4xx', () => {
    assert.deepEqual(describeFailure(new Error('Project name is required'), 'Failed to create project', 400), {
      status: 400,
      message: 'Project name is required',
    })
    assert.deepEqual(describeFailure(new Error('User not found'), 'Failed to fetch user', 404), {
      status: 404,
      message: 'User not found',
    })
  })

  for (const [name, make] of notOurs) {
    test(`${name} becomes a 500 with the route's fixed message`, () => {
      const failure = describeFailure(make(), 'Failed to update project', 400)
      assert.deepEqual(failure, { status: 500, message: 'Failed to update project' })
    })
  }

  test('nothing from a database error reaches the client', () => {
    for (const make of [anyAllError, uniqueViolation, connectionRefused]) {
      const sent = JSON.stringify(describeFailure(make(), 'Failed to fetch artifact counts', 400))
      assert.doesNotMatch(sent, /ANY\/ALL|constraint|projects_|company_id|ECONNREFUSED|10\.0\.4\.17|42809|23505/)
    }
  })

  test('a 5xx never carries a caught message, even one the app wrote', () => {
    for (const status of [500, 502, 503]) {
      assert.deepEqual(describeFailure(new Error('Failed to retrieve created project'), 'Failed to create project', status), {
        status: 500,
        message: 'Failed to create project',
      })
    }
  })

  test('a status that is not an error status is not honoured', () => {
    for (const status of [200, 302, 399, 600, Number.NaN]) {
      assert.deepEqual(describeFailure(new Error('Project name is required'), 'Failed to create project', status), {
        status: 500,
        message: 'Failed to create project',
      })
    }
  })
})
