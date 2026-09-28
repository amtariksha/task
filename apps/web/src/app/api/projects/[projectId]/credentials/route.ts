import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess, canProjectSecretAction } from '@/lib/projectSecrets/guard'
import {
  listCredentials,
  createCredential,
  logCredentialAccess,
  type CredentialType,
} from '@/lib/db/credentials'

const VALID_TYPES: CredentialType[] = ['database', 'ssh', 'ssh_key', 'firebase', 'api_key', 'encryption_key', 'other']

/** GET — list credential entries for a project (metadata only, no secret values). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'view')
  if (!auth.ok) return auth.response

  try {
    const credentials = await listCredentials(projectId)
    await logCredentialAccess(projectId, auth.user.employeeId, 'view')
    // Reading and writing are separate rights now, so tell the client which it
    // has instead of letting it discover the difference through a 403.
    const canWrite = await canProjectSecretAction(auth.user, projectId, 'write')
    return NextResponse.json({ success: true, data: credentials, canWrite })
  } catch (error) {
    console.error('Failed to list credentials:', error)
    return NextResponse.json({ success: false, error: 'Failed to list credentials' }, { status: 500 })
  }
}

/** POST — create a credential entry. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { name, type, value, metadata } = body

    if (!name || typeof name !== 'string' || !value || typeof value !== 'string') {
      return NextResponse.json({ success: false, error: 'name and value are required' }, { status: 400 })
    }
    const credType: CredentialType = VALID_TYPES.includes(type) ? type : 'other'

    const created = await createCredential(
      projectId,
      { name, type: credType, value, metadata: metadata && typeof metadata === 'object' ? metadata : {} },
      auth.user.employeeId
    )
    await logCredentialAccess(projectId, auth.user.employeeId, 'create', created.id)
    return NextResponse.json({ success: true, data: created })
  } catch (error) {
    console.error('Failed to create credential:', error)
    return NextResponse.json({ success: false, error: 'Failed to create credential' }, { status: 500 })
  }
}
