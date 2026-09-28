import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess, canProjectSecretAction, NO_STORE_HEADERS } from '@/lib/projectSecrets/guard'
import {
  listEnvSecrets,
  upsertEnvSecret,
  deleteEnvSecret,
  logCredentialAccess,
  type SecretEnvironment,
} from '@/lib/db/credentials'

const ENVIRONMENTS: SecretEnvironment[] = ['development', 'staging', 'production']

function parseEnvironment(value: string | null): SecretEnvironment {
  return ENVIRONMENTS.includes(value as SecretEnvironment) ? (value as SecretEnvironment) : 'production'
}

/** GET — list env secrets for ?environment=… . Values decrypted only with ?reveal=true. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const environment = parseEnvironment(request.nextUrl.searchParams.get('environment'))
  const reveal = request.nextUrl.searchParams.get('reveal') === 'true'

  const auth = await assertProjectSecretAccess(request, projectId, reveal ? 'reveal' : 'view')
  if (!auth.ok) return auth.response

  try {
    const secrets = await listEnvSecrets(projectId, environment, reveal)
    await logCredentialAccess(projectId, auth.user.employeeId, reveal ? 'reveal' : 'view')
    const canWrite = await canProjectSecretAction(auth.user, projectId, 'write')
    return NextResponse.json(
      { success: true, data: secrets, canWrite },
      reveal ? { headers: NO_STORE_HEADERS } : undefined
    )
  } catch (error) {
    console.error('Failed to list env secrets:', error)
    return NextResponse.json({ success: false, error: 'Failed to list env secrets' }, { status: 500 })
  }
}

/** POST — upsert a single env secret { environment, key, value }. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const environment = parseEnvironment(body.environment)
    const key = String(body.key || '').trim()
    const value = typeof body.value === 'string' ? body.value : ''

    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) {
      return NextResponse.json({ success: false, error: 'Invalid env key' }, { status: 400 })
    }

    await upsertEnvSecret(projectId, environment, key, value, auth.user.employeeId)
    await logCredentialAccess(projectId, auth.user.employeeId, 'update')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to upsert env secret:', error)
    return NextResponse.json({ success: false, error: 'Failed to save env secret' }, { status: 500 })
  }
}

/** DELETE — remove an env secret ?environment=…&key=… . */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  const environment = parseEnvironment(request.nextUrl.searchParams.get('environment'))
  const key = String(request.nextUrl.searchParams.get('key') || '').trim()
  if (!key) {
    return NextResponse.json({ success: false, error: 'key is required' }, { status: 400 })
  }

  try {
    const ok = await deleteEnvSecret(projectId, environment, key)
    if (!ok) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    await logCredentialAccess(projectId, auth.user.employeeId, 'delete')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete env secret:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete env secret' }, { status: 500 })
  }
}
