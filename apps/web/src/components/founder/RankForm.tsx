'use client'

import { useCallback, useEffect, useId, useRef, useState, type JSX, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, X, type LucideIcon } from 'lucide-react'
import { FOUNDER_RESUME_POINTS, FOUNDER_START, UPDATE_FOUNDER_RANKS } from '@/lib/founder-queries'
import { moveItem, orderForChips } from '@/lib/founder/client-format'
import type { FounderResumePointsQueryData, FounderThread } from './types'

const SAVE_ERROR = 'Could not save ranks.'
const LOAD_ERROR = 'Could not load threads.'
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const ICON_BUTTON = 'rounded-md p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-300 dark:hover:bg-neutral-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-40'
const MUTED_TEXT = 'text-sm text-gray-500 dark:text-gray-400'
const POSITION_BADGE = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary/20 dark:text-primary-300'

interface RankLists { ranked: FounderThread[]; unranked: FounderThread[] }
interface UpdateRanksData { updateFounderRanks: Array<{ id: string; rank: number | null }> }
interface UpdateRanksVariables { orderedIds: string[] }
interface ResumePointsVariables { includeParked: boolean }

export interface RankFormProps { open: boolean; onClose: () => void; onSaved: () => void }

function splitByRank(threads: FounderThread[]): RankLists {
  const ordered = orderForChips(threads.filter((thread) => thread.isActive))
  return { ranked: ordered.filter((item) => item.rank !== null), unranked: ordered.filter((item) => item.rank === null) }
}

const errorText = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback)

/** Moves focus into the dialog, traps Tab, locks page scroll and restores focus on close. */
function useModalFocus(dialogRef: RefObject<HTMLDivElement | null>, onEscape: () => void) {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [dialogRef])

  return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape()
    }
    if (event.key !== 'Tab' || !dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return
    const [first, last] = [focusable[0], focusable[focusable.length - 1]]
    const atEdge = event.shiftKey ? document.activeElement === first || document.activeElement === dialog : document.activeElement === last
    if (!atEdge) return
    event.preventDefault()
    const wrapTo = event.shiftKey ? last : first
    wrapTo.focus()
  }, [dialogRef, onEscape])
}

interface IconButtonProps { label: string; icon: LucideIcon; inactive?: boolean; transferId?: string; onClick: () => void }

// aria-disabled instead of disabled keeps keyboard focus on the button when its row reaches the top or bottom.
function IconButton({ label, icon: Icon, inactive = false, transferId, onClick }: IconButtonProps): JSX.Element {
  return (
    <button type="button" aria-label={label} title={label} aria-disabled={inactive || undefined}
      data-transfer-id={transferId} onClick={inactive ? undefined : onClick} className={ICON_BUTTON}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

interface RankRowProps { thread: FounderThread; position?: number; children: ReactNode }

function RankRow({ thread, position, children }: RankRowProps): JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-1 dark:border-neutral-800 dark:bg-neutral-900">
      {position !== undefined ? <span aria-hidden="true" className={POSITION_BADGE}>{position}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-gray-900 dark:text-gray-100">{thread.label}</p>
        <p className={thread.nextAction ? 'break-words text-sm text-gray-600 dark:text-gray-400' : 'text-sm italic text-gray-500'}>
          {thread.nextAction ?? 'no next action'}
        </p>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </li>
  )
}

interface RankListsViewProps { lists: RankLists; onMove: (index: number, direction: -1 | 1) => void; onTransfer: (thread: FounderThread, toRanked: boolean) => void }

function RankListsView({ lists, onMove, onTransfer }: RankListsViewProps): JSX.Element {
  const unrankedId = useId()
  const lastIndex = lists.ranked.length - 1
  return (
    <>
      {lists.ranked.length === 0 ? <p className={MUTED_TEXT}>Nothing ranked yet. Rank a thread from the list below.</p> : (
        <ol aria-label="Ranked threads" className="flex flex-col gap-2">
          {lists.ranked.map((thread, index) => (
            <RankRow key={thread.id} thread={thread} position={index + 1}>
              <IconButton label={`Move ${thread.label} up from position ${index + 1}`} icon={ArrowUp} inactive={index === 0} onClick={() => onMove(index, -1)} />
              <IconButton label={`Move ${thread.label} down from position ${index + 1}`} icon={ArrowDown} inactive={index === lastIndex} onClick={() => onMove(index, 1)} />
              <IconButton label={`Unrank ${thread.label}`} icon={ChevronsDown} transferId={thread.id} onClick={() => onTransfer(thread, false)} />
            </RankRow>
          ))}
        </ol>
      )}
      <div className="my-4 flex items-center gap-3">
        <hr className="flex-1 border-gray-200 dark:border-neutral-800" />
        <h3 id={unrankedId} className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Unranked</h3>
        <hr className="flex-1 border-gray-200 dark:border-neutral-800" />
      </div>
      {lists.unranked.length === 0 ? <p className={MUTED_TEXT}>Every active thread is ranked.</p> : (
        <ul aria-labelledby={unrankedId} className="flex flex-col gap-2">
          {lists.unranked.map((thread) => (
            <RankRow key={thread.id} thread={thread}>
              <IconButton label={`Rank ${thread.label}`} icon={ChevronsUp} transferId={thread.id} onClick={() => onTransfer(thread, true)} />
            </RankRow>
          ))}
        </ul>
      )}
    </>
  )
}

function RankDialog({ onClose, onSaved }: Omit<RankFormProps, 'open'>): JSX.Element {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const pendingFocusId = useRef<string | null>(null)
  const [lists, setLists] = useState<RankLists | null>(null)
  const [dirty, setDirty] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, loading, error, refetch } = useQuery<FounderResumePointsQueryData, ResumePointsVariables>(FOUNDER_RESUME_POINTS, {
    variables: { includeParked: false }, fetchPolicy: 'network-only',
  })
  const [saveRanks, { loading: saving }] = useMutation<UpdateRanksData, UpdateRanksVariables>(UPDATE_FOUNDER_RANKS, {
    refetchQueries: [{ query: FOUNDER_START }],
  })

  const threads = data?.founderResumePoints
  // Seed once per open: later refetches must not wipe the order being edited.
  if (lists === null && Array.isArray(threads)) setLists(splitByRank(threads))

  // Escape and backdrop clicks must not throw away an unsaved order; nothing closes mid-save, or a failure would go unseen.
  const requestClose = useCallback(() => { if (!dirty && !saving) onClose() }, [dirty, saving, onClose])
  const closeUnlessSaving = (): void => { if (!saving) onClose() }
  const handleKeyDown = useModalFocus(dialogRef, requestClose)

  // A thread moved between lists is a new element, so put focus back on its button.
  useEffect(() => {
    const targetId = pendingFocusId.current
    if (targetId === null || !dialogRef.current) return
    pendingFocusId.current = null
    const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('[data-transfer-id]'))
    buttons.find((button) => button.dataset.transferId === targetId)?.focus()
  }, [lists])

  const applyChange = (next: RankLists, message: string): void => {
    setLists(next)
    setDirty(true)
    setAnnouncement(message)
  }

  const moveRanked = (index: number, direction: -1 | 1): void => {
    if (!lists) return
    const ranked = moveItem(lists.ranked, index, direction)
    if (ranked === lists.ranked) return
    applyChange({ ...lists, ranked }, `${lists.ranked[index].label} moved to position ${index + direction + 1}`)
  }

  const transfer = (thread: FounderThread, toRanked: boolean): void => {
    if (!lists) return
    const ranked = lists.ranked.filter((item) => item.id !== thread.id)
    const unranked = lists.unranked.filter((item) => item.id !== thread.id)
    pendingFocusId.current = thread.id
    // Ranking appends to the end; unranking puts the thread at the top of the unranked list.
    if (toRanked) applyChange({ ranked: [...ranked, thread], unranked }, `${thread.label} ranked at position ${ranked.length + 1}`)
    else applyChange({ ranked, unranked: [thread, ...unranked] }, `${thread.label} unranked`)
  }

  const handleSave = async (): Promise<void> => {
    if (!lists || saving) return
    setErrorMessage(null)
    try {
      const result = await saveRanks({ variables: { orderedIds: lists.ranked.map((thread) => thread.id) } })
      if (result.error) {
        setErrorMessage(result.error.message || SAVE_ERROR)
        return
      }
      onSaved()
      onClose()
    } catch (caught: unknown) {
      setErrorMessage(errorText(caught, SAVE_ERROR))
    }
  }

  const retryLoad = (): void => {
    refetch().catch((caught: unknown) => setErrorMessage(errorText(caught, LOAD_ERROR)))
  }

  const isEmpty = lists !== null && lists.ranked.length === 0 && lists.unranked.length === 0
  let body = <p className={`flex items-center gap-2 ${MUTED_TEXT}`}><span className="loading-spinner h-5 w-5" aria-hidden="true" />Loading threads…</p>
  if (lists !== null) {
    body = isEmpty ? <p className={MUTED_TEXT}>No active threads to rank.</p> : <RankListsView lists={lists} onMove={moveRanked} onTransfer={transfer} />
  } else if (error && !loading) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-600 dark:text-red-400">
        <span>{error.message || LOAD_ERROR}</span>
        <button type="button" onClick={retryLoad} className="btn-secondary px-3 py-1.5 text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-[100000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); requestClose() } }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleKeyDown}
        className="flex max-h-[90vh] w-full max-w-[720px] flex-col rounded-t-xl bg-white shadow-xl focus:outline-none dark:bg-neutral-900 sm:rounded-xl">
        <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rank threads</h2>
          <button type="button" onClick={closeUnlessSaving} aria-disabled={saving || undefined} aria-label="Close rank threads without saving" className={ICON_BUTTON}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-busy={lists === null && loading}>{body}</div>
        <footer className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 dark:border-neutral-800">
          <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
          {errorMessage ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeUnlessSaving} aria-disabled={saving || undefined} className="btn-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-50">{dirty ? 'Cancel' : 'Close'}</button>
            <button type="button" onClick={() => void handleSave()} disabled={lists === null || isEmpty}
              aria-disabled={saving || undefined} aria-busy={saving}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait aria-disabled:opacity-70">
              {saving ? 'Saving…' : 'Save ranks'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function RankForm({ open, onClose, onSaved }: RankFormProps): JSX.Element | null {
  // Mounting only while open gives each open a fresh network-only load and a fresh seed.
  if (!open) return null
  return <RankDialog onClose={onClose} onSaved={onSaved} />
}
