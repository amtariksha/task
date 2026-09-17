import { NextRequest, NextResponse } from 'next/server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '@/graphql/schema'
import { resolvers, createContext } from '@/graphql/resolvers'
import { verifyToken } from '@/lib/auth-server'

const isDevelopment = process.env.NODE_ENV === 'development'

// Development request logging must never print credentials; `t` is the founder
// ingest token (scripts/founder/founder-ingest.sh).
const SECRET_VARIABLE_KEY = /^t$|^otp|token|secret|password/i
const redactedVariablesJson = (variables: unknown): string =>
  JSON.stringify(variables, (key, value) => (key && SECRET_VARIABLE_KEY.test(key) ? '<redacted>' : value), 2)

// Create Apollo Server instance
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Schema introspection is a map of every type and field for an attacker.
  // Enabled in development only — it was unconditionally on.
  introspection: process.env.NODE_ENV !== 'production',
  formatError: (formattedError, error) => {
    // Log the full error in development for debugging
    if (isDevelopment) {
      try {
        console.error('GraphQL Error Details:', {
          message: formattedError.message,
          path: formattedError.path,
          extensions: formattedError.extensions,
          originalError: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error
        })
      } catch (logError) {
        console.error('Error logging GraphQL error:', logError)
        console.error('Original error:', formattedError.message)
      }
    }
    return formattedError
  },
  includeStacktraceInErrorResponses: isDevelopment
})

// Start server once
let serverStarted = false
async function ensureServerStarted() {
  if (!serverStarted) {
    await server.start()
    serverStarted = true
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let operationName = 'Unknown'

  try {
    await ensureServerStarted()

    const body = await request.json()
    operationName = body.operationName || 'UnnamedOperation'

    // Log incoming GraphQL request in development
    if (isDevelopment) {
      console.log('\n' + '='.repeat(80))
      console.log(`🚀 [GraphQL Server] Incoming ${body.query?.trim().startsWith('mutation') ? 'MUTATION' : 'QUERY'}: ${operationName}`)
      console.log(`⏱️  Timestamp: ${new Date().toISOString()}`)
      if (body.variables && Object.keys(body.variables).length > 0) {
        console.log('🔧 Variables:', redactedVariablesJson(body.variables))
      }
      console.log('='.repeat(80) + '\n')
    }

    // Extract user from token (cookie or Authorization header)
    let user = null

    // Check Authorization header first (for mobile/API)
    const authHeader = request.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      user = verifyToken(token)
    }

    // Check cookie (for web)
    if (!user) {
      const tokenCookie = request.cookies.get('token')
      if (tokenCookie) {
        user = verifyToken(tokenCookie.value)
      }
    }

    const context = { ...createContext(), user }

    let response
    try {
      response = await server.executeOperation(
        {
          query: body.query,
          variables: body.variables,
          operationName: body.operationName
        },
        { contextValue: context }
      )
    } catch (executionError: any) {
      // Handle errors that occur during GraphQL execution
      const duration = Date.now() - startTime
      console.error('\n' + '💥'.repeat(40))
      console.error(`💥 [GraphQL Server] ${operationName} CRASHED in ${duration}ms`)
      console.error('Error:', executionError instanceof Error ? {
        name: executionError.name,
        message: executionError.message,
        stack: executionError.stack
      } : executionError)
      console.error('💥'.repeat(40) + '\n')

      return NextResponse.json(
        {
          errors: [{
            message: executionError.message || 'Internal server error',
            extensions: {
              code: 'INTERNAL_SERVER_ERROR'
            }
          }]
        },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime

    if (response.body.kind === 'single') {
      const result = response.body.singleResult

      // Log response in development
      if (isDevelopment) {
        if (result.errors && result.errors.length > 0) {
          console.error('\n' + '❌'.repeat(40))
          console.error(`❌ [GraphQL Server] ${operationName} FAILED in ${duration}ms`)
          // Safely serialize errors - GraphQL errors may not have toJSON method
          try {
            console.error('Errors:', JSON.stringify(result.errors, null, 2))
          } catch (serializationError) {
            console.error('Errors (raw):', result.errors)
          }
          console.error('❌'.repeat(40) + '\n')
        } else {
          console.log('\n' + '✅'.repeat(40))
          console.log(`✅ [GraphQL Server] ${operationName} completed in ${duration}ms`)
          console.log('✅'.repeat(40) + '\n')
        }
      }

      return NextResponse.json(result, {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    }

    return NextResponse.json(
      { errors: [{ message: 'Incremental delivery not supported' }] },
      { status: 400 }
    )
  } catch (error: any) {
    const duration = Date.now() - startTime

    if (isDevelopment) {
      console.error('\n' + '💥'.repeat(40))
      console.error(`💥 [GraphQL Server] ${operationName} CRASHED in ${duration}ms`)
      console.error('Error:', error)
      console.error('Stack:', error.stack)
      console.error('💥'.repeat(40) + '\n')
    } else {
      console.error(`[GraphQL Error] ${operationName}:`, error.message)
    }

    return NextResponse.json(
      { errors: [{ message: error?.message || 'Internal server error' }] },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Return GraphQL Playground HTML in development
  if (process.env.NODE_ENV === 'development') {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>GraphQL Playground</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
  <link rel="shortcut icon" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/favicon.png" />
  <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    window.addEventListener('load', function (event) {
      GraphQLPlayground.init(document.getElementById('root'), {
        endpoint: '/api/graphql',
        settings: {
          'request.credentials': 'same-origin'
        }
      })
    })
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html'
        }
      }
    )
  }

  return NextResponse.json(
    { message: 'GraphQL endpoint. Use POST to execute queries.' },
    { status: 200 }
  )
}

