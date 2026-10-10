// Run: npm test (node --experimental-strip-types --test)
//
// Route handlers cannot be imported here (path aliases, server-only auth), so
// this reads their source. It is a tripwire, not a proof: a handler that takes a
// caught error's text anywhere but a logging call, without first asking
// isApplicationError, fails here. It does not follow values: a message copied
// into a result object, a field other than message/stack, or the wrong branch
// of an isApplicationError test still gets past it.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = fileURLToPath(new URL('../../../app/api/', import.meta.url))
const proxySource = readFileSync(new URL('../../../proxy.ts', import.meta.url), 'utf8')

/** The proxy answers 404 for these in production, so what they print never leaves a developer's machine. */
function devOnlyRoutes() {
  const list = proxySource.match(/const DEV_ONLY_ROUTES = \[([^\]]*)\]/)
  assert.ok(list, 'DEV_ONLY_ROUTES not found in proxy.ts')
  return [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
}

const DEV_ONLY_ROUTES = devOnlyRoutes()

/** Same rule as isDevOnly() in proxy.ts: a trailing slash is a prefix, anything else an exact path. */
function isDevOnly(pathname) {
  return DEV_ONLY_ROUTES.some((route) => (route.endsWith('/') ? pathname.startsWith(route) : pathname === route))
}

function routeFiles(directory = API_ROOT) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

function apiPath(file) {
  const directory = relative(API_ROOT, file).split(sep).slice(0, -1).join('/')
  return `/api/${directory}`
}

const blank = (text) => text.replace(/[^\n]/g, ' ')
const REGEX_MAY_FOLLOW = /(?:^|[(,=:[!&|?{};]|\breturn)\s*$/
const LOG_CALL = /^(?:console|logger)\.\w+\(/

/**
 * The source with comments, string contents and whole logging calls
 * (`console.*(…)`, `logger.*(…)`) blanked out, line numbers preserved. `${…}` inside a template literal is code
 * and is kept.
 */
function codeOutsideLogging(source) {
  let position = 0

  function quoted(quote) {
    const start = position++
    while (position < source.length && source[position] !== quote) position += source[position] === '\\' ? 2 : 1
    position++
    return quote + blank(source.slice(start + 1, position - 1)) + quote
  }

  function template() {
    let out = '`'
    position++
    while (position < source.length && source[position] !== '`') {
      if (source[position] === '\\') {
        out += blank(source.slice(position, position + 2))
        position += 2
      } else if (source.startsWith('${', position)) {
        position += 2
        out += '${' + code('}') + '}'
        position++
      } else {
        out += blank(source[position++])
      }
    }
    position++
    return out + '`'
  }

  function regexLiteral() {
    const start = position++
    let inClass = false
    while (position < source.length && (inClass || source[position] !== '/') && source[position] !== '\n') {
      if (source[position] === '\\') position++
      else if (source[position] === '[') inClass = true
      else if (source[position] === ']') inClass = false
      position++
    }
    position++
    return blank(source.slice(start, position))
  }

  /** Code up to the unmatched `closer` (left unconsumed), or to the end of the file. */
  function code(closer) {
    let out = ''
    let depth = 0
    while (position < source.length) {
      const char = source[position]
      if (source.startsWith('//', position)) {
        const end = source.indexOf('\n', position)
        const stop = end === -1 ? source.length : end
        out += blank(source.slice(position, stop))
        position = stop
      } else if (source.startsWith('/*', position)) {
        const end = source.indexOf('*/', position + 2)
        const stop = end === -1 ? source.length : end + 2
        out += blank(source.slice(position, stop))
        position = stop
      } else if (char === "'" || char === '"') {
        out += quoted(char)
      } else if (char === '`') {
        out += template()
      } else if (char === '/' && REGEX_MAY_FOLLOW.test(out)) {
        out += regexLiteral()
      } else if (LOG_CALL.test(source.slice(position, position + 24)) && !/[\w.$]$/.test(out)) {
        const start = position
        position = source.indexOf('(', position) + 1
        code(')')
        position++
        out += blank(source.slice(start, position))
      } else {
        if (char === closer && depth === 0) return out
        if ('({['.includes(char)) depth++
        if (')}]'.includes(char)) depth--
        out += char
        position++
      }
    }
    return out
  }

  return code(null)
}

/** Every catch block in already-blanked code: the name it binds and the lines it spans. */
function catchBlocks(code) {
  const lineOf = (offset) => code.slice(0, offset).split('\n').length - 1
  return [...code.matchAll(/\bcatch\s*\(\s*(\w+)[^)]*\)\s*\{/g)].map((match) => {
    let end = match.index + match[0].length
    for (let depth = 1; end < code.length && depth > 0; end++) {
      if (code[end] === '{') depth++
      else if (code[end] === '}') depth--
    }
    return { name: match[1], first: lineOf(match.index), last: lineOf(end) }
  })
}

/**
 * Lines that take a caught error's text, or the whole error, outside a logging
 * call without asking isApplicationError first.
 *
 * - `error.message`, `.stack`, `String(error)`, `${error}`, `JSON.stringify(error)`
 *   and `'…' + error` count anywhere in the file, for `error`, `err` and every
 *   name a catch clause binds (so a helper that takes `error` is covered too).
 * - `{ error }`, `{ details: error }` and `const { message } = error` count
 *   inside the catch block that binds the name. `{ cause: error }` does not.
 * - Only testing the text (`/duplicate key/.test(…)`, `.message.includes(…)`) to
 *   pick a fixed answer is not taking it.
 * - A line is let through when it, or one of the two lines above it, asks
 *   `isApplicationError(error)` un-negated: the multi-line ternary a formatter
 *   produces stays legal.
 */
function errorTextReads(source) {
  const code = codeOutsideLogging(source)
  const lines = code.split('\n')
  const original = source.split('\n')
  const blocks = catchBlocks(code)
  const flagged = new Set()

  for (const name of new Set(['error', 'err', ...blocks.map((block) => block.name)])) {
    const subject = `\\b${name}\\b(?:\\s+as\\s+[^)]+\\))?\\s*\\??\\.\\s*`
    const text = new RegExp(
      `${subject}(?:message|stack|toString)\\b` +
        `|\\b(?:String|JSON\\.stringify)\\(\\s*${name}\\b` +
        `|\\$\\{\\s*${name}\\s*\\}` +
        `|\\+\\s*${name}\\b(?!\\s*[.(?])`
    )
    const whole = new RegExp(
      `[{,]\\s*${name}\\s*[,}]` +
        `|(?<!\\bcause\\s*):\\s*${name}\\s*(?:[,}]|$)` +
        `|\\{[^}]*\\b(?:message|stack)\\b[^}]*\\}\\s*=\\s*${name}\\b`
    )
    const onlyTested = new RegExp(
      `\\.test\\([^()]*\\)|${subject}message\\s*\\??\\.\\s*(?:includes|startsWith|endsWith)\\(`,
      'g'
    )
    const asked = new RegExp(`(?<!!\\s*)\\bisApplicationError\\(\\s*${name}\\s*\\)`)
    const bound = blocks.filter((block) => block.name === name)

    lines.forEach((line, index) => {
      const inItsCatch = bound.some((block) => index >= block.first && index <= block.last)
      const takes = text.test(line.replace(onlyTested, '')) || (inItsCatch && whole.test(line))
      if (takes && !lines.slice(Math.max(0, index - 2), index + 1).some((near) => asked.test(near))) flagged.add(index)
    })
  }

  return [...flagged].sort((a, b) => a - b).map((index) => `${index + 1}: ${original[index].trim()}`)
}

describe('the scan itself', () => {
  test('flags the catch block that sent database text to the browser', () => {
    const leaking = [
      '} catch (error) {',
      "  console.error('Failed to get artifact counts:', error)",
      "  const errorMessage = error instanceof Error ? error.message : 'Failed to fetch artifact counts'",
      '  return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })',
      '}',
    ].join('\n')
    assert.deepEqual(errorTextReads(leaking), [
      "3: const errorMessage = error instanceof Error ? error.message : 'Failed to fetch artifact counts'",
    ])
  })

  test('flags the other spellings: any-typed, stack, a renamed catch variable, String() and a template', () => {
    for (const line of [
      "return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })",
      'return NextResponse.json({ error: (error as Error).message }, { status: 500 })',
      'return NextResponse.json({ stack: error.stack }, { status: 500 })',
      'return NextResponse.json({ details: updateError.message }, { status: 500 })',
      'return NextResponse.json({ error: String(error) }, { status: 500 })',
      'return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 })',
      'return NextResponse.json({ error: `Failed: ${updateError.message}` }, { status: 500 })',
    ]) {
      const source = `try { work() } catch (updateError) {\n${line}\n}`
      assert.equal(errorTextReads(source).length, 1, line)
    }
  })

  test('allows logging the error, and reading it once isApplicationError has been asked', () => {
    const fine = [
      '} catch (error) {',
      "  console.error('Failed:', error instanceof Error ? { message: error.message, stack: error.stack } : error)",
      '  console.error(`Failed (${error.message})`, { nested: [error.stack] })',
      "  // error.message is 'never' sent: see describeFailure",
      "  const thrown = isApplicationError(error) ? error.message : ''",
      "  const { status, message } = describeFailure(error, 'Failed to update project', 400)",
      '  return NextResponse.json({ error: message }, { status })',
      '}',
    ].join('\n')
    assert.deepEqual(errorTextReads(fine), [])
  })

  test('flags sending the error whole: shorthand, a bare value, JSON.stringify, concatenation, destructuring', () => {
    for (const line of [
      'return NextResponse.json({ success: false, error }, { status: 500 })',
      'return NextResponse.json({ error: error }, { status: 500 })',
      'return NextResponse.json({ error: JSON.stringify(error) }, { status: 500 })',
      "return NextResponse.json({ error: 'Failed: ' + error }, { status: 500 })",
      'const { message } = error',
    ]) {
      assert.equal(errorTextReads(`try { work() } catch (error) {\n${line}\n}`).length, 1, line)
    }
  })

  test('the isApplicationError allowance covers a formatted ternary, and is refused when negated', () => {
    const formatted = [
      '} catch (error) {',
      '  const message = isApplicationError(error)',
      '    ? error.message',
      "    : 'Failed to update project'",
      '}',
    ].join('\n')
    assert.deepEqual(errorTextReads(formatted), [])

    const negated = '} catch (error) {\n  if (!isApplicationError(error)) return NextResponse.json({ error: error.message })\n}'
    assert.equal(errorTextReads(negated).length, 1)
  })

  test('leaves ordinary code alone', () => {
    const fine = [
      'const titles = posts.map((e) => e.message)',
      'try { work() } catch (error) {',
      "  logger.error({ message: error.message, stack: error.stack }, 'work failed')",
      "  throw new Error('Failed to do the work', { cause: error })",
      '}',
      'const reply = { message: body.message }',
    ].join('\n')
    assert.deepEqual(errorTextReads(fine), [])
  })

  test('reports the right line after an escaped newline in a template literal', () => {
    const source = 'const text = `one \\\ntwo`\ntry { work() } catch (error) {\n  return respond(error.message)\n}'
    assert.deepEqual(errorTextReads(source), ['4: return respond(error.message)'])
  })

  test('allows testing a driver error to pick a fixed answer, but not sending what was tested', () => {
    const classify = (line) => errorTextReads(`try { work() } catch (err) {\n${line}\n}`)
    assert.deepEqual(classify("const isDuplicate = err?.code === '23505' || /duplicate key/i.test(err?.message || '')"), [])
    assert.deepEqual(classify("if (error.message.includes('timeout')) return timedOut()"), [])
    assert.equal(classify("const sent = /duplicate key/i.test(err.message) ? err.message : 'Failed'").length, 1)
    assert.equal(classify("const sent = err.message.includes('timeout') ? err.message : 'Failed'").length, 1)
  })
})

describe('route handlers do not send the text of a caught error to the client', () => {
  const files = routeFiles()

  test('there are route handlers to check, and the dev-only list was read', () => {
    assert.ok(files.length > 50, `found only ${files.length} route files`)
    assert.ok(DEV_ONLY_ROUTES.includes('/api/diagnostic/'))
  })

  for (const file of files) {
    const path = apiPath(file)
    if (isDevOnly(path)) continue
    test(path, () => {
      const reads = errorTextReads(readFileSync(file, 'utf8'))
      assert.deepEqual(
        reads,
        [],
        `${path} reads a caught error's text outside a console call. Send the route's fixed message, ` +
          'or use describeFailure / isApplicationError from @/lib/api/client-error.'
      )
    })
  }
})

describe('handlers that answer a 4xx with a message their own code threw ask the helper', () => {
  const read = (route) => readFileSync(join(API_ROOT, route, 'route.ts'), 'utf8')

  for (const [route, calls] of [
    ['projects', ["describeFailure(error, 'Failed to create project', 400)"]],
    [
      'projects/[projectId]',
      ["describeFailure(error, 'Failed to update project', 400)", "describeFailure(error, 'Failed to delete project', 400)"],
    ],
    ['projects/[projectId]/restore', ["describeFailure(error, 'Failed to restore project', 400)"]],
  ]) {
    test(`/api/${route}`, () => {
      const source = read(route)
      assert.match(source, /import \{ describeFailure \} from '@\/lib\/api\/client-error'/)
      for (const call of calls) assert.ok(source.includes(call), `${route} must call ${call}`)
    })
  }
})
