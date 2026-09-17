'use client'

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from 'react'
import { useMutation } from '@apollo/client/react'
import { Plus } from 'lucide-react'
import { CREATE_FOUNDER_RESUME_POINT } from '@/lib/founder-queries'
import type { FounderThread } from './types'

// Matches MAX_LABEL in src/graphql/founder-resolvers.ts.
const LABEL_MAX_LENGTH = 120
const FALLBACK_ERROR = 'Could not add the thread.'

interface CreateResumePointData {
  createFounderResumePoint: FounderThread
}

interface CreateResumePointVariables {
  label: string
}

export interface AddThreadFormProps {
  onCreated: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR
}

export function AddThreadForm({ onCreated }: AddThreadFormProps): JSX.Element {
  const headingId = useId()
  const inputId = useId()
  const counterId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [createThread, { loading: saving }] = useMutation<CreateResumePointData, CreateResumePointVariables>(
    CREATE_FOUNDER_RESUME_POINT,
  )

  const trimmedLabel = label.trim()
  const canAdd = trimmedLabel.length > 0 && !saving

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setLabel(event.target.value)
    setStatusMessage(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canAdd) return
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const result = await createThread({ variables: { label: trimmedLabel } })
      const created = result.data?.createFounderResumePoint
      if (result.error || !created) {
        setErrorMessage(result.error?.message || FALLBACK_ERROR)
        return
      }
      setLabel('')
      inputRef.current?.focus()
      setStatusMessage(`Thread added: ${created.label}`)
      onCreated()
    } catch (caught: unknown) {
      setErrorMessage(errorText(caught))
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
        Add thread
      </h2>
      <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Thread label
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={label}
            onChange={handleChange}
            maxLength={LABEL_MAX_LENGTH}
            readOnly={saving}
            required
            aria-describedby={counterId}
            autoComplete="off"
            className="input-field dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={trimmedLabel.length === 0}
          aria-disabled={saving || undefined}
          aria-busy={saving}
          className="btn-primary inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait aria-disabled:opacity-70"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>
      <p id={counterId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {trimmedLabel.length}/{LABEL_MAX_LENGTH} characters
      </p>
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
