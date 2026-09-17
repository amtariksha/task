'use client'

import { useId, type JSX } from 'react'
import { CheckCheck } from 'lucide-react'
import { ThreadCard } from '@/components/founder/ThreadCard'
import type { FounderTeamActivity, FounderThread } from '@/components/founder/types'

export interface StartThreadSectionsProps {
  top3: FounderThread[]
  accordion: FounderThread[]
  parkingId: string | null
  activityFor: (threadId: string) => FounderTeamActivity | undefined
  onCloseout: (preselectedId: string | null) => void
  onDoneNext: (thread: FounderThread) => void
  onNotToday: (thread: FounderThread) => void
  onPark: (thread: FounderThread) => Promise<void>
}

const HEADING = 'mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400'
const MUTED = 'text-sm text-gray-500 dark:text-neutral-400'

export function StartThreadSections(props: StartThreadSectionsProps): JSX.Element {
  const { top3, accordion, parkingId, activityFor, onCloseout, onDoneNext, onNotToday, onPark } = props
  const top3HeadingId = useId()
  const otherHeadingId = useId()

  if (top3.length === 0 && accordion.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className={MUTED}>No threads yet — close out what you worked on to start.</p>
        <button type="button" onClick={() => onCloseout(null)} className="btn-primary inline-flex items-center gap-1.5">
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Close-out
        </button>
      </div>
    )
  }

  return (
    <>
      <section aria-labelledby={top3HeadingId}>
        <h2 id={top3HeadingId} className={HEADING}>Top 3</h2>
        {top3.length === 0 ? (
          <p className={MUTED}>Rank threads and set next actions to fill your Top 3.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {top3.map((thread, index) => (
              <li key={thread.id}>
                <ThreadCard
                  thread={thread} variant="card" position={index + 1} activity={activityFor(thread.id)}
                  onDoneNext={onDoneNext} onNotToday={onNotToday} onPark={onPark} parking={parkingId === thread.id}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
      {accordion.length > 0 ? (
        <section aria-labelledby={otherHeadingId}>
          <h2 id={otherHeadingId} className={HEADING}>Other threads</h2>
          <div className="rounded-lg border border-gray-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900 [&>details:last-child]:border-b-0">
            {accordion.map((thread) => (
              <ThreadCard
                key={thread.id} thread={thread} variant="row" activity={activityFor(thread.id)}
                onDoneNext={onDoneNext} onPark={onPark} parking={parkingId === thread.id}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
