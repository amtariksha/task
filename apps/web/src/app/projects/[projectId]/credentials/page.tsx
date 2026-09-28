'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

type CredentialType = 'database' | 'ssh' | 'ssh_key' | 'firebase' | 'api_key' | 'encryption_key' | 'other'
type Environment = 'development' | 'staging' | 'production'

interface CredentialSummary {
  id: number
  name: string
  type: CredentialType
  metadata: Record<string, unknown>
  updatedAt: string
}
interface EnvSecret {
  id: number
  key: string
  value?: string
}

const CRED_TYPES: CredentialType[] = ['database', 'ssh', 'ssh_key', 'firebase', 'api_key', 'encryption_key', 'other']
const ENVIRONMENTS: Environment[] = ['development', 'staging', 'production']

async function api(path: string, init?: RequestInit) {
  // Send the localStorage token: the auth cookie expires independently of the
  // web session; without this the page 401s and bounces to the dashboard.
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

export default function ProjectCredentialsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = String(params.projectId)

  const [tab, setTab] = useState<'credentials' | 'env'>('credentials')
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState('')
  // Reading a project's secrets no longer implies being allowed to change them:
  // only a project manager, team leader or company admin may write.
  const [canWrite, setCanWrite] = useState(false)

  // Credentials state
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [newCred, setNewCred] = useState({ name: '', type: 'other' as CredentialType, value: '', note: '' })
  const [savingCred, setSavingCred] = useState(false)

  // Env state
  const [environment, setEnvironment] = useState<Environment>('production')
  const [envSecrets, setEnvSecrets] = useState<EnvSecret[]>([])
  const [newEnv, setNewEnv] = useState({ key: '', value: '' })
  const [envFileText, setEnvFileText] = useState('')
  const [showEnvValues, setShowEnvValues] = useState(false)

  const loadCredentials = useCallback(async () => {
    const { ok, status, json } = await api(`/api/projects/${projectId}/credentials`)
    if (status === 401) { router.push('/'); return }
    if (status === 403) { setForbidden(true); return }
    if (ok) {
      setCredentials(json.data || [])
      setCanWrite(Boolean(json.canWrite))
    } else setError(json.error || 'Failed to load credentials')
  }, [projectId, router])

  const loadEnv = useCallback(async () => {
    const { ok, status, json } = await api(`/api/projects/${projectId}/env?environment=${environment}&reveal=${showEnvValues}`)
    if (status === 403) { setForbidden(true); return }
    if (ok) {
      setEnvSecrets(json.data || [])
      setCanWrite(Boolean(json.canWrite))
    }
  }, [projectId, environment, showEnvValues])

  useEffect(() => { loadCredentials() }, [loadCredentials])
  useEffect(() => { if (tab === 'env') loadEnv() }, [tab, loadEnv])

  const revealCredential = async (id: number) => {
    if (revealed[id] !== undefined) {
      setRevealed((r) => { const n = { ...r }; delete n[id]; return n })
      return
    }
    const { ok, json } = await api(`/api/projects/${projectId}/credentials/${id}`)
    if (ok) setRevealed((r) => ({ ...r, [id]: json.data.value }))
    else setError(json.error || 'Failed to reveal credential')
  }

  const addCredential = async () => {
    if (!newCred.name.trim() || !newCred.value.trim()) return
    setSavingCred(true)
    setError('')
    const { ok, json } = await api(`/api/projects/${projectId}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCred.name.trim(),
        type: newCred.type,
        value: newCred.value,
        metadata: newCred.note ? { note: newCred.note } : {},
      }),
    })
    setSavingCred(false)
    if (ok) {
      setNewCred({ name: '', type: 'other', value: '', note: '' })
      loadCredentials()
    } else setError(json.error || 'Failed to add credential')
  }

  const deleteCredential = async (id: number) => {
    if (!confirm('Delete this credential?')) return
    const { ok, json } = await api(`/api/projects/${projectId}/credentials/${id}`, { method: 'DELETE' })
    if (ok) loadCredentials()
    else setError(json.error || 'Failed to delete credential')
  }

  const addEnv = async () => {
    if (!newEnv.key.trim()) return
    setError('')
    const { ok, json } = await api(`/api/projects/${projectId}/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment, key: newEnv.key.trim(), value: newEnv.value }),
    })
    if (ok) { setNewEnv({ key: '', value: '' }); loadEnv() }
    else setError(json.error || 'Failed to add variable')
  }

  const deleteEnv = async (key: string) => {
    const { ok, json } = await api(`/api/projects/${projectId}/env?environment=${environment}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (ok) loadEnv()
    else setError(json.error || 'Failed to delete variable')
  }

  const uploadEnvFile = async () => {
    if (!envFileText.trim()) return
    const { ok, json } = await api(`/api/projects/${projectId}/env/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment, content: envFileText }),
    })
    if (ok) { setEnvFileText(''); alert(`Imported ${json.imported} key(s)`); loadEnv() }
    else alert(json.error || 'Import failed')
  }

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setEnvFileText(String(reader.result || ''))
    reader.readAsText(file)
  }

  if (forbidden) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-xl font-semibold text-gray-900">Credentials</h1>
        <p className="mt-4 text-gray-600">You don’t have access to this project’s credentials. Ask an admin or a project member for access.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Credentials</h1>
          <p className="text-sm text-gray-500">Encrypted secrets & environment variables for <span className="font-mono">{projectId}</span></p>
        </div>
        <button onClick={() => router.push(`/projects/${projectId}`)} className="text-sm text-indigo-600 hover:underline">← Back to project</button>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {(['credentials', 'env'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'credentials' ? 'Credentials' : 'Environment Variables'}
          </button>
        ))}
      </div>

      {tab === 'credentials' && (
        <div className="space-y-6">
          {/* Add credential — writers only */}
          {canWrite && (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Add credential</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="border rounded px-3 py-2 text-sm" placeholder="Name (e.g. Production DB)" value={newCred.name} onChange={(e) => setNewCred({ ...newCred, name: e.target.value })} />
              <select className="border rounded px-3 py-2 text-sm" value={newCred.type} onChange={(e) => setNewCred({ ...newCred, type: e.target.value as CredentialType })}>
                {CRED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea className="border rounded px-3 py-2 text-sm sm:col-span-2 font-mono" rows={3} placeholder="Secret value (password, key, connection string, JSON…)" value={newCred.value} onChange={(e) => setNewCred({ ...newCred, value: e.target.value })} />
              <input className="border rounded px-3 py-2 text-sm sm:col-span-2" placeholder="Note (optional, not encrypted)" value={newCred.note} onChange={(e) => setNewCred({ ...newCred, note: e.target.value })} />
            </div>
            <button onClick={addCredential} disabled={savingCred} className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-60">{savingCred ? 'Saving…' : 'Add credential'}</button>
          </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {credentials.length === 0 && <p className="text-sm text-gray-500">No credentials stored yet.</p>}
            {credentials.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-gray-400">{c.type}</span>
                    {typeof c.metadata?.note === 'string' && <p className="text-xs text-gray-500 mt-1">{c.metadata.note as string}</p>}
                  </div>
                  <div className="flex gap-3 text-sm">
                    <button onClick={() => revealCredential(c.id)} className="text-indigo-600 hover:underline">{revealed[c.id] !== undefined ? 'Hide' : 'Reveal'}</button>
                    {canWrite && <button onClick={() => deleteCredential(c.id)} className="text-rose-600 hover:underline">Delete</button>}
                  </div>
                </div>
                {revealed[c.id] !== undefined && (
                  <pre className="mt-3 p-3 bg-gray-900 text-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">{revealed[c.id]}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'env' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Environment</label>
            <select className="border rounded px-3 py-2 text-sm" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
              {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button onClick={() => setShowEnvValues((v) => !v)} className="ml-auto text-sm text-indigo-600 hover:underline">{showEnvValues ? 'Hide values' : 'Show values'}</button>
            {canWrite && <a href={`/api/projects/${projectId}/env/export?environment=${environment}`} className="text-sm text-indigo-600 hover:underline">Export .env</a>}
          </div>

          {/* Upload .env — writers only */}
          {canWrite && (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Upload .env</h2>
            <input type="file" accept=".env,text/plain" onChange={onFilePicked} className="text-sm mb-2 block" />
            <textarea className="border rounded px-3 py-2 text-sm w-full font-mono" rows={4} placeholder={'KEY=value\nANOTHER_KEY=value'} value={envFileText} onChange={(e) => setEnvFileText(e.target.value)} />
            <button onClick={uploadEnvFile} className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Import to {environment}</button>
          </div>
          )}

          {/* Add single key — writers only */}
          {canWrite && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="border rounded px-3 py-2 text-sm flex-1 font-mono" placeholder="KEY" value={newEnv.key} onChange={(e) => setNewEnv({ ...newEnv, key: e.target.value })} />
            <input className="border rounded px-3 py-2 text-sm flex-1 font-mono" placeholder="value" value={newEnv.value} onChange={(e) => setNewEnv({ ...newEnv, value: e.target.value })} />
            <button onClick={addEnv} className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900">Add</button>
          </div>
          )}

          {/* List */}
          <div className="rounded-lg border border-gray-200 divide-y">
            {envSecrets.length === 0 && <p className="text-sm text-gray-500 p-4">No variables for {environment}.</p>}
            {envSecrets.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm gap-3">
                <span className="font-mono text-gray-800 shrink-0">{s.key}</span>
                <div className="flex items-center gap-3 min-w-0">
                  {s.value !== undefined ? (
                    <>
                      <span className="font-mono text-gray-700 truncate max-w-[260px]" title={s.value}>{s.value}</span>
                      <button onClick={() => navigator.clipboard?.writeText(s.value || '')} className="text-indigo-600 hover:underline shrink-0">Copy</button>
                    </>
                  ) : (
                    <span className="font-mono text-gray-400">••••••••</span>
                  )}
                  {canWrite && <button onClick={() => deleteEnv(s.key)} className="text-rose-600 hover:underline shrink-0">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
