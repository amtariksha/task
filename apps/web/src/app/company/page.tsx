'use client'

/**
 * Company admin page.
 *
 * The company tier of the authorization model had server support and no UI, so a
 * company_admin had no way to add anyone to their company or hand the role on.
 * This is that page: the company's details, and its people with their roles.
 *
 * Per-company departments, roles and bug types are edited on the existing
 * Settings > Dropdowns page, which writes rows stamped with the acting company —
 * linked from here rather than reimplemented.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import { getCurrentUser } from '@/lib/auth'

interface Company {
  companyId: string
  name: string
  code: string
  logoUrl?: string
  status: 'active' | 'inactive'
}

interface CompanyMember {
  employeeId: string
  name: string
  email: string
  department: string | null
  globalRole: string
  status: string
  companyRole: 'company_admin' | 'member'
  isDefault: boolean
  isPlatformAdmin: boolean
}

interface DirectoryUser {
  employeeId: string
  name: string
  email: string
  status: string
}

async function api(path: string, init?: RequestInit) {
  // Send the localStorage token as well: the auth cookie expires independently of
  // the web session, and without it the page 401s and bounces to the dashboard.
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

export default function CompanyPage() {
  const router = useRouter()

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [myEmployeeId, setMyEmployeeId] = useState('')

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Details form
  const [editName, setEditName] = useState('')
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active')

  // Add-member form
  const [addEmployeeId, setAddEmployeeId] = useState('')
  const [addRole, setAddRole] = useState<'company_admin' | 'member'>('member')

  /** Only an admin of this company may change anything here. */
  const iAmAdmin = useMemo(() => {
    const me = members.find((m) => m.employeeId === myEmployeeId)
    return me?.companyRole === 'company_admin' || me?.isPlatformAdmin === true
  }, [members, myEmployeeId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const user = getCurrentUser()
    if (!user) {
      router.push('/')
      return
    }
    setMyEmployeeId(user.employeeId)

    // The acting company comes from the session, so this page always shows the
    // company the switcher is currently pointing at.
    const mine = await api('/api/companies')
    if (mine.status === 401) {
      router.push('/')
      return
    }
    const memberships: Array<Company & { isDefault?: boolean }> = mine.json?.data || []
    const active =
      memberships.find((c) => c.companyId === (user as { companyId?: string }).companyId) ||
      memberships.find((c) => c.isDefault) ||
      memberships[0]

    if (!active) {
      setForbidden(true)
      setLoading(false)
      return
    }

    setCompanyId(active.companyId)

    const [detail, memberList, users] = await Promise.all([
      api(`/api/companies/${active.companyId}`),
      api(`/api/companies/${active.companyId}/members`),
      api('/api/users?includeInactive=true'),
    ])

    if (detail.status === 403 || memberList.status === 403) {
      setForbidden(true)
      setLoading(false)
      return
    }

    if (detail.ok && detail.json?.data) {
      const c: Company = detail.json.data
      setCompany(c)
      setEditName(c.name)
      setEditLogoUrl(c.logoUrl || '')
      setEditStatus(c.status)
    } else {
      setError(detail.json?.error || 'Could not load this company.')
    }

    if (memberList.ok) setMembers(memberList.json?.data || [])
    else setError((prev) => prev || memberList.json?.error || 'Could not load the member list.')

    if (users.ok) setDirectory(users.json?.data || [])

    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  const applyMemberResult = (json: { success?: boolean; data?: CompanyMember[]; error?: string }, ok: boolean, fallback: string) => {
    if (ok && json?.success) {
      setMembers(json.data || [])
      setError('')
      return true
    }
    setError(json?.error || fallback)
    return false
  }

  const handleSaveDetails = async () => {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    const { ok, json } = await api(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), logoUrl: editLogoUrl.trim(), status: editStatus }),
    })
    setBusy(false)
    if (ok && json?.success) {
      setCompany(json.data)
      setError('')
      setNotice('Company details saved.')
    } else {
      setError(json?.error || 'Could not save the company details.')
    }
  }

  const handleAddMember = async () => {
    if (!companyId || !addEmployeeId.trim()) return
    setBusy(true)
    setNotice('')
    const { ok, json } = await api(`/api/companies/${companyId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: addEmployeeId.trim(), companyRole: addRole }),
    })
    setBusy(false)
    if (applyMemberResult(json, ok, 'Could not add that person.')) {
      setAddEmployeeId('')
      setAddRole('member')
      setNotice('Member added.')
    }
  }

  const handleRoleChange = async (employeeId: string, companyRole: 'company_admin' | 'member') => {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    const { ok, json } = await api(`/api/companies/${companyId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, companyRole }),
    })
    setBusy(false)
    if (applyMemberResult(json, ok, 'Could not change that role.')) {
      setNotice(`${employeeId} is now a ${companyRole === 'company_admin' ? 'company admin' : 'member'}.`)
    }
  }

  const handleRemove = async (employeeId: string, name: string) => {
    if (!companyId) return
    if (!confirm(`Remove ${name} from ${company?.name || 'this company'}? Their user account is not deleted.`)) return
    setBusy(true)
    setNotice('')
    const { ok, json } = await api(`/api/companies/${companyId}/members?employeeId=${encodeURIComponent(employeeId)}`, {
      method: 'DELETE',
    })
    setBusy(false)
    if (applyMemberResult(json, ok, 'Could not remove that person.')) {
      setNotice(`${name} removed from the company.`)
    }
  }

  /** People who are not in this company yet — the only sensible candidates. */
  const candidates = useMemo(() => {
    const inCompany = new Set(members.map((m) => m.employeeId))
    return directory.filter((u) => !inCompany.has(u.employeeId) && u.status === 'active')
  }, [directory, members])

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="max-w-5xl mx-auto p-8 text-gray-500">Loading…</div>
      </>
    )
  }

  if (forbidden) {
    return (
      <>
        <Navbar />
        <div className="max-w-3xl mx-auto p-8">
          <h1 className="text-xl font-semibold text-gray-900">Company</h1>
          <p className="mt-4 text-gray-600">
            You don’t belong to a company yet, so there is nothing to manage here. Ask a platform
            administrator to add you.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company?.name || 'Company'}</h1>
            <p className="text-sm text-gray-500">
              <span className="font-mono">{company?.companyId}</span> · employee IDs start{' '}
              <span className="font-mono">{company?.code}-0001</span>
            </p>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
        {notice && <p className="mb-4 text-sm text-emerald-700">{notice}</p>}

        {!iAmAdmin && (
          <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You’re a member of this company. Only a company admin can change its details or its people.
          </p>
        )}

        {/* Details */}
        <section className="rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Name</span>
              <input
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-50"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={!iAmAdmin}
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Logo URL</span>
              <input
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-50"
                placeholder="https://…"
                value={editLogoUrl}
                onChange={(e) => setEditLogoUrl(e.target.value)}
                disabled={!iAmAdmin}
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Status</span>
              <select
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-50"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                disabled={!iAmAdmin}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Code (employee-ID prefix)</span>
              <input
                className="w-full border rounded px-3 py-2 text-sm bg-gray-50 font-mono"
                value={company?.code || ''}
                readOnly
              />
              <span className="mt-1 block text-xs text-gray-500">
                Changing this renumbers nobody, so only a platform admin can.
              </span>
            </label>
          </div>
          {iAmAdmin && (
            <button
              onClick={handleSaveDetails}
              disabled={busy || !editName.trim()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> Save details
            </button>
          )}
        </section>

        {/* Members */}
        <section className="rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">
            People ({members.length})
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Company membership is what makes this company’s projects, people and settings visible. A
            company admin can add users, edit settings and manage projects — only here.
          </p>

          {iAmAdmin && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <select
                className="border rounded px-3 py-2 text-sm flex-1"
                value={addEmployeeId}
                onChange={(e) => setAddEmployeeId(e.target.value)}
              >
                <option value="">Select someone to add…</option>
                {candidates.map((u) => (
                  <option key={u.employeeId} value={u.employeeId}>
                    {u.name} ({u.employeeId})
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as 'company_admin' | 'member')}
              >
                <option value="member">Member</option>
                <option value="company_admin">Company admin</option>
              </select>
              <button
                onClick={handleAddMember}
                disabled={busy || !addEmployeeId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900 disabled:opacity-60"
              >
                <UserPlus className="w-4 h-4" /> Add
              </button>
            </div>
          )}

          <div className="divide-y border rounded">
            {members.length === 0 && (
              <p className="p-4 text-sm text-gray-500">Nobody belongs to this company yet.</p>
            )}
            {members.map((m) => (
              <div key={m.employeeId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.name}
                    {m.employeeId === myEmployeeId && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                    {m.isPlatformAdmin && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-indigo-600">
                        <ShieldCheck className="w-3 h-3" /> platform admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    <span className="font-mono">{m.employeeId}</span> · {m.email}
                    {m.department ? ` · ${m.department}` : ''}
                    {m.status !== 'active' ? ' · inactive' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {iAmAdmin ? (
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={m.companyRole}
                      onChange={(e) =>
                        handleRoleChange(m.employeeId, e.target.value as 'company_admin' | 'member')
                      }
                      disabled={busy}
                    >
                      <option value="member">Member</option>
                      <option value="company_admin">Company admin</option>
                    </select>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {m.companyRole === 'company_admin' ? 'Company admin' : 'Member'}
                    </span>
                  )}
                  {iAmAdmin && (
                    <button
                      onClick={() => handleRemove(m.employeeId, m.name)}
                      disabled={busy}
                      className="text-rose-600 hover:underline text-xs disabled:opacity-60"
                      title="Remove from this company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What else belongs to a company */}
        <section className="rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">This company’s own lists</h2>
          <p className="text-xs text-gray-500 mb-3">
            Departments, roles, priorities and bug types are per company: a row you add here
            overrides the platform default for this company only, and leaves every other company
            alone.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/settings/dropdowns" className="text-indigo-600 hover:underline">
              Departments, roles &amp; dropdowns →
            </Link>
            <Link href="/feed-topics" className="text-indigo-600 hover:underline">
              Feed topics →
            </Link>
            <Link href="/users" className="text-indigo-600 hover:underline">
              Add a user →
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
