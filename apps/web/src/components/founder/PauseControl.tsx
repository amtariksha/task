'use client'

import { useId, useRef, useState, type FormEvent, type JSX } from 'react'
import { useMutation } from '@apollo/client/react'
import { BellOff, BellRing } from 'lucide-react'
import { UPDATE_FOUNDER_START_SETTINGS } from '@/lib/founder-queries'
import { isPauseActive, pausedText } from '@/lib/founder/client-format'
import type { FounderStartSettings } from './types'

const FALLBACK_ERROR = 'Could not update the Start pause.'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface UpdateSettingsData {
  updateFounderStartSettings: FounderStartSettings
}

interface UpdateSettingsVariables {
  pausedUntil: string | null
}

export interface PauseControlProps {
  pausedUntil: string | null
  todayIst: string
  onChanged: () => void
}

function draftFor(pausedUntil: string | null, todayIst: string): string {
  return pausedUntil !== null && isPauseActive(pausedUntil, todayIst) ? pausedUntil : ''
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR
}

export function PauseControl({ pausedUntil, todayIst, onChanged }: PauseControlProps): JSX.Element {
  const headingId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(() => draftFor(pausedUntil, todayIst))
  // The saved value, shown until the parent's refetch delivers it through props.
  const [savedPausedUntil, setSavedPausedUntil] = useState<string | null | undefined>(undefined)
  const [syncedFrom, setSyncedFrom] = useState({ pausedUntil, todayIst })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [updateSettings, { loading: saving }] = useMutation<UpdateSettingsData, UpdateSettingsVariables>(
    UPDATE_FOUNDER_START_SETTINGS,
  )

  if (syncedFrom.pausedUntil !== pausedUntil || syncedFrom.todayIst !== todayIst) {
    setSyncedFrom({ pausedUntil, todayIst })
    setSavedPausedUntil(undefined)
    setDraft(draftFor(pausedUntil, todayIst))
  }

  const currentPausedUntil = savedPausedUntil === undefined ? pausedUntil : savedPausedUntil
  const pauseActive = currentPausedUntil !== null && isPauseActive(currentPausedUntil, todayIst)

  const savePausedUntil = async (nextPausedUntil: string | null): Promise<void> => {
    if (saving) return
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const result = await updateSettings({ variables: { pausedUntil: nextPausedUntil } })
      const settings = result.data?.updateFounderStartSettings
      if (result.error || !settings) {
        setErrorMessage(result.error?.message || FALLBACK_ERROR)
        return
      }
      setSavedPausedUntil(settings.pausedUntil)
      setDraft(draftFor(settings.pausedUntil, todayIst))
      setStatusMessage(settings.pausedUntil ? pausedText(settings.pausedUntil) : 'Start push resumed')
      if (nextPausedUntil === null) inputRef.current?.focus()
      onChanged()
    } catch (caught: unknown) {
      setErrorMessage(errorText(caught))
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!ISO_DATE.test(draft)) {
      setErrorMessage('Pick a date to pause until.')
      return
    }
    if (draft < todayIst) {
      setErrorMessage('Pick today or a later date.')
      return
    }
    void savePausedUntil(draft)
  }

  const StateIcon = pauseActive ? BellOff : BellRing

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
        Pause Start
      </h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
        <StateIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {pauseActive && currentPausedUntil ? pausedText(currentPausedUntil) : 'The daily Start push is on.'}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="min-w-0 sm:w-56">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Pause the Start push until
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="date"
            min={todayIst}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setErrorMessage(null)
              setStatusMessage(null)
            }}
            readOnly={saving}
            className="input-field dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={draft === ''}
            aria-disabled={saving || undefined}
            aria-busy={saving}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait aria-disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {pauseActive ? (
            <button
              type="button"
              onClick={() => void savePausedUntil(null)}
              aria-disabled={saving || undefined}
              className="btn-secondary aria-disabled:cursor-wait aria-disabled:opacity-70"
            >
              Clear pause
            </button>
          ) : null}
        </div>
      </form>
      {errorMessage ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className={statusMessage ? 'mt-2 text-sm text-green-700 dark:text-green-400' : ''}>
        {statusMessage ?? ''}
      </p>
    </section>
  )
}
