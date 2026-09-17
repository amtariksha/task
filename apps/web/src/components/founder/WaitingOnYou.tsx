'use client'

import { useId, type JSX } from 'react'
import Link from 'next/link'
import { Bug, CheckCircle2, ChevronRight } from 'lucide-react'
import type { FounderWaitingItem } from '@/components/founder/types'
import { dueLabel } from '@/lib/founder/client-format'

export interface WaitingOnYouProps {
  items: FounderWaitingItem[]
  todayIst: string
}

const DETAIL_ROUTE: Readonly<Record<FounderWaitingItem['kind'], string>> = Object.freeze({
  task: '/tasks',
  bug: '/bugs',
})

function detailHref(item: FounderWaitingItem): string {
  return `${DETAIL_ROUTE[item.kind]}/${encodeURIComponent(item.id)}`
}

interface WaitingRowProps {
  item: FounderWaitingItem
  todayIst: string
}

function WaitingRow({ item, todayIst }: WaitingRowProps): JSX.Element {
  const title = item.title.trim()
  const projectName = item.projectName?.trim() || null
  const due = dueLabel(item.dueDate, todayIst)
  const isOverdue = item.dueDate !== null && item.dueDate < todayIst
  const KindIcon = item.kind === 'bug' ? Bug : CheckCircle2

  return (
    <li>
      <Link
        href={detailHref(item)}
        className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-neutral-800/60"
      >
        <KindIcon
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 ${item.kind === 'bug' ? 'text-red-500 dark:text-red-400' : 'text-primary'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900 dark:text-neutral-100" title={title}>
            <span className="sr-only">Open {item.kind} </span>
            {`${item.id} · ${title}`}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs">
            {projectName ? (
              <span className="min-w-0 truncate text-gray-600 dark:text-neutral-400">{projectName}</span>
            ) : null}
            <span
              className={`shrink-0 ${
                isOverdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-neutral-500'
              }`}
            >
              {due}
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-gray-400 dark:text-neutral-500" />
      </Link>
    </li>
  )
}

export function WaitingOnYou({ items, todayIst }: WaitingOnYouProps): JSX.Element | null {
  const headingId = useId()

  if (items.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400"
      >
        Waiting on you
      </h2>
      <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        {items.map((item) => (
          <WaitingRow key={`${item.kind}-${item.id}`} item={item} todayIst={todayIst} />
        ))}
      </ul>
    </section>
  )
}
