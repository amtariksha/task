import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess, NO_STORE_HEADERS } from '@/lib/projectSecrets/guard'
import {
  getCredentialValue,
  updateCredential,
  deleteCredential,
  logCredentialAccess,
  type CredentialType,
} from '@/lib/db/credentials'

const VALID_TYPES: CredentialType[] = ['database', 'ssh', 'ssh_key', 'firebase', 'api_key', 'encryption_key', 'other']

/** GET — reveal a single credential's decrypted value (audited). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'reveal')
  if (!auth.ok) return auth.response

  const credId = Number(id)
  if (!Number.isInteger(credId)) {
    return NextResponse.json({ success: false, error: 'Invalid credential id' }, { status: 400 })
  }

  try {
    const credential = await getCredentialValue(projectId, credId)
    if (!credential) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    await logCredentialAccess(projectId, auth.user.employeeId, 'reveal', credId)
    // A decrypted secret must never sit in a shared cache or a proxy.
    return NextResponse.json({ success: true, data: credential }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Failed to reveal credential:', error)
    return NextResponse.json({ success: false, error: 'Failed to reveal credential' }, { status: 500 })
  }
}

/** PUT — update a credential entry. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  const credId = Number(id)
  if (!Number.isInteger(credId)) {
    return NextResponse.json({ success: false, error: 'Invalid credential id' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const patch: { name?: string; type?: CredentialType; value?: string; metadata?: Record<string, unknown> } = {}
    if (typeof body.name === 'string') patch.name = body.name
    if (VALID_TYPES.includes(body.type)) patch.type = body.type
    if (typeof body.value === 'string') patch.value = body.value
    if (body.metadata && typeof body.metadata === 'object') patch.metadata = body.metadata

    const updated = await updateCredential(projectId, credId, patch)
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    await logCredentialAccess(projectId, auth.user.employeeId, 'update', credId)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update credential:', error)
    return NextResponse.json({ success: false, error: 'Failed to update credential' }, { status: 500 })
  }
}

/** DELETE — soft-delete a credential entry. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params
  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  const credId = Number(id)
  if (!Number.isInteger(credId)) {
    return NextResponse.json({ success: false, error: 'Invalid credential id' }, { status: 400 })
  }

  try {
    const ok = await deleteCredential(projectId, credId)
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    await logCredentialAccess(projectId, auth.user.employeeId, 'delete', credId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete credential:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete credential' }, { status: 500 })
  }
}
