'use client'

import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  Apple,
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react'
import type {
  ReleaseAppSummary,
  ReleasePlatform,
  ReleasePlatformSummary,
  ReleaseVersionEntry,
} from '@/lib/releases/types'

export interface ManualVersionValues {
  platform: ReleasePlatform
  version: string
  releasedAt: string
  notes: string
}

interface ReleaseAppCardProps {
  app: ReleaseAppSummary
  canManage: boolean
  /** Each resolves to an error message to show, or null on success. */
  onRefresh: (appId: number) => Promise<string | null>
  onAddVersion: (appId: number, values: ManualVersionValues) => Promise<string | null>
  onDeleteVersion: (appId: number, versionId: number) => Promise<string | null>
  onEdit: (app: ReleaseAppSummary) => void
  onRemove: (app: ReleaseAppSummary) => void
}

const PLATFORM_META: Record<ReleasePlatform, { label: string; store: string; Icon: typeof Apple }> = {
  ios: { label: 'iOS', store: 'App Store', Icon: Apple },
  android: { label: 'Android', store: 'Play Store', Icon: Smartphone },
}

function formatDate(iso: string | null): string | null {
  return iso ? format(new Date(iso), 'd MMM yyyy') : null
}

/** The store's date when there is one; otherwise when this dashboard first saw the version. */
function versionDate(entry: ReleaseVersionEntry): string {
  return formatDate(entry.releasedAt) ?? `first seen ${formatDate(entry.firstSeenAt)}`
}

function VersionBlock({ label, entry, emphasis }: { label: string; entry: ReleaseVersionEntry | null; emphasis: boolean }) {
  const sizeClass = emphasis ? 'text-2xl font-bold' : 'text-lg font-semibold'
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      {entry ? (
        <>
          <div className={`${sizeClass} ${emphasis ? 'text-gray-900' : 'text-gray-700'} tabular-nums`}>{entry.version}</div>
          <div className="text-xs text-gray-500">{versionDate(entry)}</div>
        </>
      ) : (
        <div className={`${sizeClass} text-gray-300`}>—</div>
      )}
    </div>
  )
}

function AddVersionForm({
  platform,
  onSubmit,
  onCancel,
}: {
  platform: ReleasePlatform
  onSubmit: (values: ManualVersionValues) => Promise<string | null>
  onCancel: () => void
}) {
  const [values, setValues] = useState<ManualVersionValues>({ platform, version: '', releasedAt: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputClass =
    'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values.version.trim()) return
    setSaving(true)
    setError(null)
    const message = await onSubmit(values)
    setSaving(false)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`version-${platform}`} className="block text-xs font-medium text-gray-600 mb-1">Version</label>
          <input
            id={`version-${platform}`}
            value={values.version}
            onChange={(e) => setValues({ ...values, version: e.target.value })}
            className={inputClass}
            placeholder="1.4.0"
            required
          />
        </div>
        <div>
          <label htmlFor={`date-${platform}`} className="block text-xs font-medium text-gray-600 mb-1">Released on</label>
          <input
            id={`date-${platform}`}
            type="date"
            value={values.releasedAt}
            onChange={(e) => setValues({ ...values, releasedAt: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`notes-${platform}`} className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <input
          id={`notes-${platform}`}
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
          className={inputClass}
          placeholder="Optional"
          maxLength={4000}
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !values.version.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-black rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add version'}
        </button>
      </div>
    </form>
  )
}

function PlatformPanel({
  platform,
  summary,
  canManage,
  onAddVersion,
  onDeleteVersion,
}: {
  platform: ReleasePlatform
  summary: ReleasePlatformSummary
  canManage: boolean
  onAddVersion: (values: ManualVersionValues) => Promise<string | null>
  onDeleteVersion: (versionId: number) => Promise<string | null>
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { label, store, Icon } = PLATFORM_META[platform]

  const handleDelete = async (entry: ReleaseVersionEntry) => {
    if (!window.confirm(`Remove ${label} ${entry.version} from the history?`)) return
    setDeleteError(await onDeleteVersion(entry.id))
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4" aria-label={`${label} versions`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {label}
        </h3>
        <a
          href={summary.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
        >
          {store}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <VersionBlock label="Current" entry={summary.current} emphasis />
        <VersionBlock label="Previous" entry={summary.previous} emphasis={false} />
      </div>

      {summary.syncError && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{summary.syncError}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          disabled={summary.history.length === 0}
          aria-expanded={showHistory}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300"
        >
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          History ({summary.history.length})
        </button>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Add past version
          </button>
        )}
      </div>

      {adding && (
        <AddVersionForm
          platform={platform}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const message = await onAddVersion(values)
            if (!message) {
              setAdding(false)
              setShowHistory(true)
            }
            return message
          }}
        />
      )}

      {showHistory && summary.history.length > 0 && (
        <ol className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {summary.history.map((entry) => (
            <li key={entry.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 tabular-nums">
                  {entry.version}
                  {entry.source === 'manual' && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                      Manual
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
                  {versionDate(entry)}
                  {canManage && entry.source === 'manual' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`Remove ${label} ${entry.version}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
              {entry.notes && (
                <p className="mt-0.5 text-xs text-gray-600 whitespace-pre-line line-clamp-3">{entry.notes}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {deleteError && <p role="alert" className="mt-2 text-xs text-red-700">{deleteError}</p>}
    </section>
  )
}

export default function ReleaseAppCard({
  app,
  canManage,
  onRefresh,
  onAddVersion,
  onDeleteVersion,
  onEdit,
  onRemove,
}: ReleaseAppCardProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError(await onRefresh(app.appId))
    setRefreshing(false)
  }

  return (
    <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {app.iconUrl ? (
            // Store-hosted icons (mzstatic / play-lh); next/image would need both CDNs allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.iconUrl} alt="" className="h-12 w-12 rounded-xl border border-gray-100 shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-gray-100 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{app.name}</h2>
            <p className="text-xs text-gray-500">
              {app.lastSyncedAt
                ? `Checked ${formatDistanceToNow(new Date(app.lastSyncedAt), { addSuffix: true })}`
                : 'Not checked yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => onEdit(app)}
                className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                aria-label={`Edit ${app.name}`}
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(app)}
                className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100"
                aria-label={`Remove ${app.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {refreshError && (
        <p role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
          {refreshError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['ios', 'android'] as const).map((platform) => {
          const summary = app[platform]
          if (!summary) return null
          return (
            <PlatformPanel
              key={platform}
              platform={platform}
              summary={summary}
              canManage={canManage}
              onAddVersion={(values) => onAddVersion(app.appId, values)}
              onDeleteVersion={(versionId) => onDeleteVersion(app.appId, versionId)}
            />
          )
        })}
      </div>
    </article>
  )
}
