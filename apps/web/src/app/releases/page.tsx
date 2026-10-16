'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Rocket } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ReleaseAppCard, { type ManualVersionValues } from '@/components/releases/ReleaseAppCard'
import ReleaseAppForm, { type ReleaseAppFormValues } from '@/components/releases/ReleaseAppForm'
import { getCurrentUser } from '@/lib/auth'
import type { ReleaseAppSummary } from '@/lib/releases/types'

async function api(path: string, init?: RequestInit) {
  // Send the localStorage token as well: the auth cookie expires independently of
  // the web session (same reason as the Company page).
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; app: ReleaseAppSummary }

export default function ReleasesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [apps, setApps] = useState<ReleaseAppSummary[]>([])
  const [canManage, setCanManage] = useState(false)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, status, json } = await api('/api/releases/apps')
    if (status === 401) {
      router.push('/')
      return
    }
    if (ok) {
      setApps(json.apps)
      setCanManage(json.canManage)
      setLoadError(null)
    } else {
      setLoadError(json.error || 'Failed to load releases')
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    // Releases is visible to every signed-in user — no tab permission gate.
    if (!getCurrentUser()) {
      router.push('/')
      return
    }
    setReady(true)
    load()
  }, [router, load])

  const replaceApp = (updated: ReleaseAppSummary) =>
    setApps((current) => current.map((app) => (app.appId === updated.appId ? updated : app)))

  const handleAdd = async (values: ReleaseAppFormValues) => {
    const { ok, json } = await api('/api/releases/apps', { method: 'POST', body: JSON.stringify(values) })
    if (!ok) return json.error || 'Failed to add app'
    setApps((current) => [...current, json.app].sort((a, b) => a.name.localeCompare(b.name)))
    setMode({ kind: 'list' })
    return null
  }

  const handleEdit = async (appId: number, values: ReleaseAppFormValues) => {
    const { ok, json } = await api(`/api/releases/apps/${appId}`, { method: 'PATCH', body: JSON.stringify(values) })
    if (!ok) return json.error || 'Failed to save app'
    replaceApp(json.app)
    setMode({ kind: 'list' })
    return null
  }

  const handleRemove = async (app: ReleaseAppSummary) => {
    if (!window.confirm(`Remove ${app.name} from Releases? Its version history is kept but hidden.`)) return
    const { ok, json } = await api(`/api/releases/apps/${app.appId}`, { method: 'DELETE' })
    if (!ok) {
      setLoadError(json.error || 'Failed to remove app')
      return
    }
    setApps((current) => current.filter((entry) => entry.appId !== app.appId))
  }

  const handleRefresh = async (appId: number) => {
    const { ok, json } = await api(`/api/releases/apps/${appId}/sync`, { method: 'POST' })
    if (!ok) return json.error || 'Failed to refresh versions'
    replaceApp(json.app)
    return null
  }

  const handleAddVersion = async (appId: number, values: ManualVersionValues) => {
    const { ok, json } = await api(`/api/releases/apps/${appId}/versions`, {
      method: 'POST',
      body: JSON.stringify(values),
    })
    if (!ok) return json.error || 'Failed to add version'
    replaceApp(json.app)
    return null
  }

  const handleDeleteVersion = async (appId: number, versionId: number) => {
    const { ok, json } = await api(`/api/releases/apps/${appId}/versions/${versionId}`, { method: 'DELETE' })
    if (!ok) return json.error || 'Failed to remove version'
    replaceApp(json.app)
    return null
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner h-32 w-32"></div>
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Releases</h1>
              <p className="mt-1 text-sm text-gray-600">
                The version live on the App Store and Google Play for each app, checked daily.
              </p>
            </div>
            {canManage && mode.kind === 'list' && (
              <button
                type="button"
                onClick={() => setMode({ kind: 'add' })}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5" />
                <span className="font-medium">Add app</span>
              </button>
            )}
          </div>

          {mode.kind === 'add' && (
            <ReleaseAppForm
              title="Add an app"
              submitLabel="Add app"
              onSubmit={handleAdd}
              onCancel={() => setMode({ kind: 'list' })}
            />
          )}
          {mode.kind === 'edit' && (
            <ReleaseAppForm
              key={mode.app.appId}
              title={`Edit ${mode.app.name}`}
              submitLabel="Save"
              initialValues={{
                name: mode.app.name,
                iosUrl: mode.app.iosUrl ?? '',
                androidUrl: mode.app.androidUrl ?? '',
              }}
              onSubmit={(values) => handleEdit(mode.app.appId, values)}
              onCancel={() => setMode({ kind: 'list' })}
            />
          )}

          {loadError && (
            <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {loadError}
            </p>
          )}

          {loading ? (
            <LoadingSpinner center message="Loading releases…" />
          ) : apps.length === 0 && !loadError ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-12 text-center">
              <Rocket className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-gray-900">No apps yet</h2>
              <p className="mt-1 text-sm text-gray-600">
                {canManage
                  ? 'Add an app with its App Store and Play Store links to start tracking its versions.'
                  : 'A company admin can add apps here to track their store versions.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {apps.map((app) => (
                <ReleaseAppCard
                  key={app.appId}
                  app={app}
                  canManage={canManage}
                  onRefresh={handleRefresh}
                  onAddVersion={handleAddVersion}
                  onDeleteVersion={handleDeleteVersion}
                  onEdit={(target) => {
                    setMode({ kind: 'edit', app: target })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  onRemove={handleRemove}
                />
              ))}
              <p className="text-xs text-gray-500">
                iOS history comes from the App Store. Google Play only shows the current version, so Android history
                starts when an app is added here; admins can add earlier versions by hand.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
