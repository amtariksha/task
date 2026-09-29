import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getUserByEmployeeId, updateUser } from '@/lib/db/users'
import { getDefaultCompanyId } from '@/lib/db/companies'
import { emailService } from '@/lib/email/service'
import { requireRole } from '@/lib/auth-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    // Admin-only: this emails a user's login credentials.
    const auth = await requireRole(request, ['admin', 'top_management'])
    if (!auth.ok) return auth.response

    const { employeeId } = await params

    // Optional: the caller may supply the password to email (e.g. the create-user
    // flow, where the admin just chose one). Without it we generate a new
    // temporary password — stored hashes cannot be reversed for emailing.
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const suppliedPassword =
      typeof body?.password === 'string' && body.password.trim() ? body.password : null

    if (!employeeId) {
      return NextResponse.json({
        success: false,
        error: 'Employee ID is required'
      }, { status: 400 })
    }

    // Get user details
    const user = await getUserByEmployeeId(employeeId)

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    if (!user.email) {
      return NextResponse.json({
        success: false,
        error: 'User email not found'
      }, { status: 400 })
    }

    // Check the email service BEFORE touching the password. Rotating first meant
    // that if SMTP was down we had already replaced the user's password with a
    // random string nobody would ever receive, locking them out silently.
    const isAvailable = await emailService.isAvailableAsync()
    if (!isAvailable) {
      return NextResponse.json({
        success: false,
        error: 'Email service is not available'
      }, { status: 503 })
    }

    // The password we email must always be the one that is stored, so write it
    // back either way. On create the admin's chosen password is supplied and is
    // preserved (previously it was silently replaced, so the new user's first
    // login always failed). A manual resend has no plaintext to recover, so a
    // fresh temporary password is generated instead.
    const tempPassword = suppliedPassword || randomBytes(12).toString('base64url').slice(0, 12)
    await updateUser(employeeId, { password: tempPassword } as any)

    // Get manager details if available
    let managerName = undefined
    if (user.managerId) {
      const manager = await getUserByEmployeeId(user.managerId)
      managerName = manager?.name
    }

    // Brand the mail with the recipient's OWN company, not the platform default:
    // this is usually the first email they ever get from the product.
    const recipientCompanyId = await getDefaultCompanyId(employeeId).catch(() => null)

    const emailResult = await emailService.sendUserCredentialsEmail({
      userEmail: user.email,
      userName: user.name,
      employeeId: user.employeeId,
      temporaryPassword: tempPassword,
      department: user.department || 'Not specified',
      role: user.role || 'Employee',
      manager: managerName,
      companyId: recipientCompanyId,
    })

    if (emailResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Credentials email sent successfully',
        data: {
          emailSent: true,
          recipient: user.email,
          messageId: emailResult.messageId
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        error: `Failed to send email: ${emailResult.message}`
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Failed to send credentials email:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to send credentials email'
    }, { status: 500 })
  }
}
