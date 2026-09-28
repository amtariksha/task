import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess } from '@/lib/projectSecrets/guard'
import { listEnvSecrets, logCredentialAccess, type SecretEnvironment } from '@/lib/db/credentials'
import { serializeDotenv } from '@/lib/dotenvParse'

const ENVIRONMENTS: SecretEnvironment[] = ['development', 'staging', 'production']

function parseEnvironment(value: string | null): SecretEnvironment {
  return ENVIRONMENTS.includes(value as SecretEnvironment) ? (value as SecretEnvironment) : 'production'
}

/** GET — download all env secrets for ?environment=… as a .env file. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  // 'export' pulls every value for an environment at once, so it takes the same
  // authority as changing them.
  const auth = await assertProjectSecretAccess(request, projectId, 'export')
  if (!auth.ok) return auth.response

  const environment = parseEnvironment(request.nextUrl.searchParams.get('environment'))

  try {
    const secrets = await listEnvSecrets(projectId, environment, true)
    const map: Record<string, string> = {}
    for (const s of secrets) map[s.key] = s.value ?? ''

    await logCredentialAccess(projectId, auth.user.employeeId, 'export')

    return new NextResponse(serializeDotenv(map), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename=".env.${environment}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to export .env:', error)
    return NextResponse.json({ success: false, error: 'Failed to export .env' }, { status: 500 })
  }
}
