'use client'

import { useState, type JSX } from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import type { FounderCheckin } from '@/components/founder/types'

export interface ClaudeNotesProps {
  note: FounderCheckin | null
}

function formatCheckinTime(createdAt: string): string | null {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ClaudeNotes({ note }: ClaudeNotesProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)

  if (note === null) return null

  const checkinTime = formatCheckinTime(note.createdAt)
  const body = note.note?.trim() ?? ''

  return (
    <section
      aria-label="Claude's notes"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-neutral-800/60 [&::-webkit-details-marker]:hidden">
          <Bot aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-gray-500 dark:text-neutral-400" />
          <span className="flex-1 text-sm font-medium text-gray-700 dark:text-neutral-300">Claude&apos;s notes</span>
          {checkinTime ? (
            <span className="text-xs text-gray-400 dark:text-neutral-500">
              <span className="sr-only">written at </span>
              {checkinTime}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform dark:text-neutral-500 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </summary>
        <div className="border-t border-gray-200 px-4 pb-4 dark:border-neutral-800">
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[13px] leading-[19px] text-gray-900 dark:text-neutral-100">
            {body.length > 0 ? body : 'No note text.'}
          </pre>
          {checkinTime ? (
            <p className="mt-2 text-xs text-gray-400 dark:text-neutral-500">{`Check-in at ${checkinTime}`}</p>
          ) : null}
        </div>
      </details>
    </section>
  )
}
