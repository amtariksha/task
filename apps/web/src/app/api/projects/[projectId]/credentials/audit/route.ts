/**
 * Who has looked at this project's secrets.
 *
 * Every read, reveal, write and export has been logged since the vault shipped,
 * and there was no way to read the log short of SQL — so the audit trail existed
 * and nobody could use it.
 *
 * Reading it takes WRITE authority, not read: the log names who looked at what and
 * from where, which is exactly the information you would want before going after
 * someone else's secrets. Project managers, team leaders and company admins see it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess, NO_STORE_HEADERS } from '@/lib/projectSecrets/guard'
import { listCredentialAccessLog } from '@/lib/db/credentials'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const auth = await assertProjectSecretAccess(request, projectId, 'write')
  if (!auth.ok) return auth.response

  try {
    const limitParam = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100

    const entries = await listCredentialAccessLog(projectId, limit)
    return NextResponse.json({ success: true, data: entries }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Failed to read the credential access log:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to read the access log' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
