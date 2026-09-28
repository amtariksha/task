import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess } from '@/lib/projectSecrets/guard'
import { bulkUpsertEnvSecrets, logCredentialAccess, type SecretEnvironment } from '@/lib/db/credentials'
import { parseDotenv } from '@/lib/dotenvParse'

const ENVIRONMENTS: SecretEnvironment[] = ['development', 'staging', 'production']

function parseEnvironment(value: string | null | undefined): SecretEnvironment {
  return ENVIRONMENTS.includes(value as SecretEnvironment) ? (value as SecretEnvironment) : 'production'
}

/**
 * POST — upload a .env file (multipart 'file' + 'environment') or JSON
 * { environment, content }. Parses and upserts each key (encrypted).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  try {
    let content = ''
    let environment: SecretEnvironment = 'production'

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      environment = parseEnvironment(form.get('environment') as string | null)
      if (file && typeof file !== 'string') {
        content = await (file as File).text()
      }
    } else {
      const body = await request.json()
      content = String(body.content || '')
      environment = parseEnvironment(body.environment)
    }

    if (!content.trim()) {
      return NextResponse.json({ success: false, error: 'No .env content provided' }, { status: 400 })
    }

    const entries = parseDotenv(content)
    const count = Object.keys(entries).length
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'No valid KEY=VALUE lines found' }, { status: 400 })
    }

    const written = await bulkUpsertEnvSecrets(projectId, environment, entries, auth.user.employeeId)
    await logCredentialAccess(projectId, auth.user.employeeId, 'upload')
    return NextResponse.json({ success: true, environment, imported: written, keys: Object.keys(entries) })
  } catch (error) {
    console.error('Failed to upload .env:', error)
    return NextResponse.json({ success: false, error: 'Failed to import .env' }, { status: 500 })
  }
}
