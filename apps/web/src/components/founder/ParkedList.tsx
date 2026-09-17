'use client'

import { useId, useMemo, useRef, useState, type JSX } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import { RotateCcw } from 'lucide-react'
import { FOUNDER_RESUME_POINTS, UPDATE_FOUNDER_RESUME_POINT } from '@/lib/founder-queries'
import type { FounderResumePointsQueryData, FounderThread } from './types'

const UNPARK_ERROR = 'Could not unpark the thread.'
const LOAD_ERROR = 'Could not load parked threads.'

interface ResumePointsVariables {
  includeParked: boolean
}

interface UpdateResumePointData {
  updateFounderResumePoint: FounderThread
}

interface UpdateResumePointVariables {
  id: string
  isActive: boolean
}

export interface ParkedListProps {
  onChanged: () => void
}

interface ParkedRowProps {
  thread: FounderThread
  unparking: boolean
  busy: boolean
  onUnpark: (thread: FounderThread) => void
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function ParkedRow({ thread, unparking, busy, onUnpark }: ParkedRowProps): JSX.Element {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-gray-900 dark:text-gray-100">{thread.label}</p>
        <p
          className={
            thread.nextAction
              ? 'mt-0.5 break-words text-sm text-gray-600 dark:text-gray-400'
              : 'mt-0.5 text-sm italic text-gray-500 dark:text-gray-500'
          }
        >
          {thread.nextAction ?? 'no next action'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onUnpark(thread)}
        aria-label={`Unpark ${thread.label}`}
        aria-disabled={busy || undefined}
        aria-busy={unparking}
        className="btn-secondary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {unparking ? 'Unparking…' : 'Unpark'}
      </button>
    </li>
  )
}

export function ParkedList({ onChanged }: ParkedListProps): JSX.Element {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [unparkingId, setUnparkingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const { data, loading, error, refetch } = useQuery<FounderResumePointsQueryData, ResumePointsVariables>(
    FOUNDER_RESUME_POINTS,
    { variables: { includeParked: true }, fetchPolicy: 'cache-and-network' },
  )
  const [updateResumePoint] = useMutation<UpdateResumePointData, UpdateResumePointVariables>(
    UPDATE_FOUNDER_RESUME_POINT,
  )

  const threads = data?.founderResumePoints
  const parked = useMemo(
    () => (Array.isArray(threads) ? threads.filter((thread) => !thread.isActive) : []),
    [threads],
  )

  const reload = async (): Promise<void> => {
    try {
      await refetch()
    } catch (caught: unknown) {
      setErrorMessage(errorText(caught, LOAD_ERROR))
    }
  }

  const handleUnpark = async (thread: FounderThread): Promise<void> => {
    if (unparkingId !== null) return
    setUnparkingId(thread.id)
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const result = await updateResumePoint({ variables: { id: thread.id, isActive: true } })
      if (result.error || !result.data?.updateFounderResumePoint) {
        setErrorMessage(result.error?.message || UNPARK_ERROR)
        return
      }
      setStatusMessage(`Unparked ${thread.label}`)
      // The row disappears, so keep keyboard focus inside the section.
      headingRef.current?.focus()
      onChanged()
      await reload()
    } catch (caught: unknown) {
      setErrorMessage(errorText(caught, UNPARK_ERROR))
    } finally {
      setUnparkingId(null)
    }
  }

  const renderBody = (): JSX.Element => {
    if (!Array.isArray(threads)) {
      if (error && !loading) {
        return (
          <div role="alert" className="flex flex-wrap items-center gap-3 py-2 text-sm text-red-600 dark:text-red-400">
            <span>{error.message || LOAD_ERROR}</span>
            <button type="button" onClick={() => void reload()} className="btn-secondary px-3 py-1.5 text-sm">
              Retry
            </button>
          </div>
        )
      }
      return (
        <p className="flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="loading-spinner h-4 w-4" aria-hidden="true" />
          Loading parked threads…
        </p>
      )
    }
    if (parked.length === 0) {
      return <p className="py-2 text-sm text-gray-600 dark:text-gray-400">No parked threads.</p>
    }
    return (
      <ul
        aria-labelledby={headingId}
        className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {parked.map((thread) => (
          <ParkedRow
            key={thread.id}
            thread={thread}
            unparking={unparkingId === thread.id}
            busy={unparkingId !== null}
            onUnpark={(target) => void handleUnpark(target)}
          />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby={headingId} aria-busy={loading && !Array.isArray(threads)}>
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="mb-2 rounded text-sm font-semibold uppercase tracking-wide text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400"
      >
        Parked threads
      </h2>
      {error && Array.isArray(threads) ? (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {error.message || LOAD_ERROR}
        </p>
      ) : null}
      {errorMessage && errorMessage !== error?.message ? (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      ) : null}
      {renderBody()}
      <p role="status" aria-live="polite" className={statusMessage ? 'mt-2 text-sm text-green-700 dark:text-green-400' : ''}>
        {statusMessage ?? ''}
      </p>
    </section>
  )
}
