'use client'

import { useState } from 'react'
import { Save, X } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export interface ReleaseAppFormValues {
  name: string
  iosUrl: string
  androidUrl: string
}

interface ReleaseAppFormProps {
  title: string
  submitLabel: string
  initialValues?: ReleaseAppFormValues
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (values: ReleaseAppFormValues) => Promise<string | null>
  onCancel: () => void
}

const EMPTY: ReleaseAppFormValues = { name: '', iosUrl: '', androidUrl: '' }

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm'

export default function ReleaseAppForm({
  title,
  submitLabel,
  initialValues = EMPTY,
  onSubmit,
  onCancel,
}: ReleaseAppFormProps) {
  const [values, setValues] = useState<ReleaseAppFormValues>(initialValues)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !saving && (values.iosUrl.trim() !== '' || values.androidUrl.trim() !== '')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    const message = await onSubmit(values)
    setSaving(false)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-600 mb-4">
        Paste the store links. Versions are read from the stores, and the name and icon are filled in if you leave
        them blank.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="release-app-name" className="block text-sm font-medium text-gray-700 mb-1">
            App name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="release-app-name"
            type="text"
            value={values.name}
            maxLength={120}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            className={inputClass}
            placeholder="Taken from the store if left blank"
          />
        </div>
        <div>
          <label htmlFor="release-app-ios" className="block text-sm font-medium text-gray-700 mb-1">
            App Store link
          </label>
          <input
            id="release-app-ios"
            type="url"
            inputMode="url"
            value={values.iosUrl}
            onChange={(e) => setValues({ ...values, iosUrl: e.target.value })}
            className={inputClass}
            placeholder="https://apps.apple.com/in/app/your-app/id1234567890"
          />
        </div>
        <div>
          <label htmlFor="release-app-android" className="block text-sm font-medium text-gray-700 mb-1">
            Play Store link
          </label>
          <input
            id="release-app-android"
            type="url"
            inputMode="url"
            value={values.androidUrl}
            onChange={(e) => setValues({ ...values, androidUrl: e.target.value })}
            className={inputClass}
            placeholder="https://play.google.com/store/apps/details?id=com.example.app"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
        >
          <X className="h-4 w-4 inline mr-2" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 inline-flex items-center"
        >
          {saving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4 mr-2" />}
          <span className={saving ? 'ml-2' : ''}>{saving ? 'Reading the stores…' : submitLabel}</span>
        </button>
      </div>
    </form>
  )
}
