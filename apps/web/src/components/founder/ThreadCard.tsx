'use client'

import { useCallback, useEffect, useId, useRef, useState, type JSX } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import type { FounderCheckin, FounderTeamActivity, FounderThread } from '@/components/founder/types'
import { ageLabel, formatShortDay } from '@/lib/founder/client-format'

export interface ThreadCardProps {
  thread: FounderThread
  variant: 'card' | 'row'
  position?: number
  activity?: FounderTeamActivity
  onDoneNext: (thread: FounderThread) => void
  onNotToday?: (thread: FounderThread) => void
  /** May return a promise; Park stays busy until it settles. */
  onPark: (thread: FounderThread) => void | Promise<void>
  parking?: boolean
}

const NO_NEXT_ACTION = 'no next action'
const MAX_ACTIVITY_TITLES = 3
const MAX_CHECKINS = 3
const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900'
const DETAIL_LINE = 'truncate text-xs text-gray-600 dark:text-neutral-400'

function checkinLine(checkin: FounderCheckin): string {
  const detail = checkin.note || checkin.nextAction
  return [checkin.kind, formatShortDay(checkin.checkinDate), detail, checkin.source]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

interface AgeChipProps { label: string; isStale: boolean }

function AgeChip({ label, isStale }: AgeChipProps): JSX.Element {
  const tone = isStale
    ? 'bg-amber-100 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tone}`}>
      <span className="sr-only">Last touched </span>
      {label}
      {isStale ? <span className="sr-only"> (stale)</span> : null}
    </span>
  )
}

interface ThreadDetailsProps {
  id?: string
  thread: FounderThread
  activity?: FounderTeamActivity
  busy: boolean
  onDoneNext: () => void
  onNotToday?: () => void
  onPark: () => void
}

function ThreadDetails({ id, thread, activity, busy, onDoneNext, onNotToday, onPark }: ThreadDetailsProps): JSX.Element {
  const checkins = thread.recentCheckins.slice(0, MAX_CHECKINS)
  return (
    <div id={id} className="space-y-3 pt-2">
      {activity && activity.count > 0 ? (
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {`${activity.count} team ${activity.count === 1 ? 'update' : 'updates'} in 24h`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {activity.titles.slice(0, MAX_ACTIVITY_TITLES).map((title, index) => (
              <li key={`${index}-${title}`} className={DETAIL_LINE} title={title}>{`• ${title}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {checkins.length === 0 ? (
        <p className="text-xs italic text-gray-400 dark:text-neutral-500">No check-ins yet</p>
      ) : (
        <ul aria-label="Recent check-ins" className="space-y-0.5">
          {checkins.map((checkin) => {
            const line = checkinLine(checkin)
            return <li key={checkin.id} className={DETAIL_LINE} title={line}>{line}</li>
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onDoneNext} className="btn-primary px-3 py-1.5 text-sm">
          Done <span aria-hidden="true">→</span> next
          <span className="sr-only"> action for {thread.label}</span>
        </button>
        {onNotToday ? (
          <button type="button" onClick={onNotToday} className="btn-secondary px-3 py-1.5 text-sm">
            Not today
            <span className="sr-only">: move {thread.label} to the end of Top 3</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPark}
          disabled={busy}
          aria-busy={busy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-primary-300 dark:hover:bg-neutral-800 ${FOCUS_RING}`}
        >
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {busy ? 'Parking…' : 'Park'}
          <span className="sr-only"> {thread.label}</span>
        </button>
      </div>
    </div>
  )
}

export function ThreadCard(props: ThreadCardProps): JSX.Element {
  const { thread, variant, position, activity, onDoneNext, onNotToday, onPark, parking = false } = props
  const [expanded, setExpanded] = useState(false)
  const [parkPending, setParkPending] = useState(false)
  const rowRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refocusToggle = useRef(false)
  const detailsId = useId()
  const busy = parking || parkPending

  const handlePark = useCallback(async () => {
    if (busy) return
    setParkPending(true)
    try {
      await onPark(thread)
    } catch (error) {
      console.error('Park failed', error)
    } finally {
      setParkPending(false)
    }
  }, [busy, onPark, thread])

  // Collapsing removes the focused "Not today" button and the card moves, so focus
  // returns to this thread's toggle after that render has been committed.
  useEffect(() => {
    if (!refocusToggle.current) return
    refocusToggle.current = false
    const target = variant === 'row' ? summaryRef.current : toggleRef.current
    target?.focus()
  })

  // Collapse first so the card does not land at the end of Top 3 still open.
  const handleNotToday = onNotToday
    ? () => {
        refocusToggle.current = true
        setExpanded(false)
        if (rowRef.current) rowRef.current.open = false
        onNotToday(thread)
      }
    : undefined

  const age = ageLabel(thread.daysSinceTouched, thread.isStale)
  const nextAction = thread.nextAction?.trim() || null
  const waitingOnText = thread.waitingOn ? `waiting on ${thread.waitingOn}` : null
  const details = (
    <ThreadDetails
      id={detailsId}
      thread={thread}
      activity={activity}
      busy={busy}
      onDoneNext={() => onDoneNext(thread)}
      onNotToday={handleNotToday}
      onPark={() => void handlePark()}
    />
  )

  if (variant === 'row') {
    return (
      <details
        ref={rowRef}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        className="border-b border-gray-200 dark:border-neutral-800"
      >
        <summary
          ref={summaryRef}
          className={`block cursor-pointer list-none rounded-md py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-800/60 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
        >
          <span className="flex items-center gap-2">
            <ChevronRight
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-neutral-400 ${expanded ? 'rotate-90' : ''}`}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-neutral-100">
              <span className="font-bold">{thread.label}</span>
              <span aria-hidden="true" className="text-gray-400"> · </span>
              <span className="sr-only">, next: </span>
              <span className={nextAction ? '' : 'italic text-gray-400 dark:text-neutral-500'}>
                {nextAction ?? NO_NEXT_ACTION}
              </span>
            </span>
            <AgeChip label={age} isStale={thread.isStale} />
          </span>
          {waitingOnText && !expanded ? (
            <span className="block truncate pl-6 text-xs text-gray-500 dark:text-neutral-400">{waitingOnText}</span>
          ) : null}
        </summary>
        <div className="pb-3 pl-6">
          {nextAction ? (
            <p className="whitespace-pre-line break-words text-sm text-gray-900 dark:text-neutral-100">{nextAction}</p>
          ) : null}
          {waitingOnText ? (
            <p className="break-words text-xs text-gray-500 dark:text-neutral-400">{waitingOnText}</p>
          ) : null}
          {details}
        </div>
      </details>
    )
  }

  return (
    <article className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        className={`block w-full rounded-lg p-4 text-left hover:bg-gray-50 dark:hover:bg-neutral-800/60 ${FOCUS_RING}`}
      >
        <span className="flex items-center gap-2">
          {position ? (
            <span className="min-w-[0.75rem] text-xs font-medium text-gray-400 dark:text-neutral-500">
              <span className="sr-only">Top </span>
              {position}
              <span className="sr-only">:</span>
            </span>
          ) : null}
          <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-bold text-gray-900 dark:text-neutral-100">
            {thread.label}
          </span>
          <AgeChip label={age} isStale={thread.isStale} />
        </span>
        <span
          className={`mt-2 block whitespace-pre-line break-words text-lg ${
            nextAction ? 'text-gray-900 dark:text-neutral-100' : 'italic text-gray-400 dark:text-neutral-500'
          }`}
        >
          <span className="sr-only">Next: </span>
          {nextAction ?? NO_NEXT_ACTION}
        </span>
        {waitingOnText ? (
          <span className={`mt-1 block text-xs text-gray-500 dark:text-neutral-400 ${expanded ? 'break-words' : 'truncate'}`}>
            {waitingOnText}
          </span>
        ) : null}
      </button>
      {expanded ? <div className="px-4 pb-4">{details}</div> : null}
    </article>
  )
}
