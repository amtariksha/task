// State, payload and small UI helpers for the web close-out form. Mirrors
// apps/mobile/src/components/founder/FounderCloseoutSheet.tsx and FounderCloseoutEntry.tsx.

import type { KeyboardEvent } from 'react'
import { orderForChips } from '@/lib/founder/client-format'
import type { FounderCloseoutEntryInput, FounderThread } from './types'

export const MAX_LABEL_LENGTH = 120
export const MAX_TEXT_LENGTH = 2000
export const NEW_LABEL_FOCUS_KEY = '__new_label__'

/** One chip: an existing thread, or a pending new thread (thread === null). */
export interface CloseoutChipItem {
  key: string
  label: string
  thread: FounderThread | null
}

export interface CloseoutEntryDraft {
  nextAction: string
  note: string
  waitingOn: string
  showDetails: boolean
}

/** A fresh object per request, so re-requesting the same key still moves focus. */
export interface CloseoutFocusRequest {
  key: string
}

export interface CloseoutFormState {
  selectedKeys: string[]
  pendingLabels: string[]
  drafts: Readonly<Record<string, CloseoutEntryDraft>>
  newLabel: string
  showNewInput: boolean
  focus: CloseoutFocusRequest | null
  errorMessage: string | null
  notice: string | null
}

export type CloseoutAction =
  | { type: 'reset'; threads: FounderThread[]; preselectedId: string | null }
  | { type: 'toggle'; key: string }
  | { type: 'editDraft'; item: CloseoutChipItem; patch: Partial<CloseoutEntryDraft> }
  | { type: 'openNewInput' }
  | { type: 'editNewLabel'; value: string }
  | { type: 'addNewLabel'; threads: FounderThread[] }
  | { type: 'setError'; message: string | null }
  | { type: 'setNotice'; message: string | null }

export const pendingKey = (label: string): string => `new:${label.toLowerCase()}`

const sameLabel = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export function emptyCloseoutDraft(thread: FounderThread | null): CloseoutEntryDraft {
  return { nextAction: '', note: '', waitingOn: thread?.waitingOn ?? '', showDetails: false }
}

export function chipDisplayLabel(item: CloseoutChipItem): string {
  return item.thread ? item.label : `${item.label} (new)`
}

export function initialCloseoutState(threads: FounderThread[], preselectedId: string | null): CloseoutFormState {
  const preselected = preselectedId ? threads.find((thread) => thread.id === preselectedId) : undefined
  return {
    selectedKeys: preselected ? [preselected.id] : [],
    pendingLabels: [],
    drafts: {},
    newLabel: '',
    showNewInput: false,
    focus: preselected ? { key: preselected.id } : null,
    errorMessage: null,
    notice: null,
  }
}

function selectKey(state: CloseoutFormState, key: string): CloseoutFormState {
  const selectedKeys = state.selectedKeys.includes(key) ? state.selectedKeys : [...state.selectedKeys, key]
  return { ...state, selectedKeys, focus: { key } }
}

function addNewLabel(state: CloseoutFormState, threads: FounderThread[]): CloseoutFormState {
  const label = state.newLabel.trim().slice(0, MAX_LABEL_LENGTH)
  if (!label) return state
  const existing = threads.find((thread) => sameLabel(thread.label, label))
  const alreadyPending = state.pendingLabels.some((pending) => sameLabel(pending, label))
  const pendingLabels = existing || alreadyPending ? state.pendingLabels : [...state.pendingLabels, label]
  const cleared = { ...state, pendingLabels, newLabel: '', showNewInput: false }
  return selectKey(cleared, existing ? existing.id : pendingKey(label))
}

export function closeoutReducer(state: CloseoutFormState, action: CloseoutAction): CloseoutFormState {
  switch (action.type) {
    case 'reset':
      return initialCloseoutState(action.threads, action.preselectedId)
    case 'toggle':
      // Deselecting keeps the draft, so re-selecting restores what was typed.
      return state.selectedKeys.includes(action.key)
        ? { ...state, selectedKeys: state.selectedKeys.filter((key) => key !== action.key), focus: null }
        : selectKey(state, action.key)
    case 'editDraft': {
      const previous = state.drafts[action.item.key] ?? emptyCloseoutDraft(action.item.thread)
      return { ...state, notice: null, drafts: { ...state.drafts, [action.item.key]: { ...previous, ...action.patch } } }
    }
    case 'openNewInput':
      return { ...state, showNewInput: true, focus: { key: NEW_LABEL_FOCUS_KEY } }
    case 'editNewLabel':
      return { ...state, newLabel: action.value.slice(0, MAX_LABEL_LENGTH) }
    case 'addNewLabel':
      return addNewLabel(state, action.threads)
    case 'setError':
      return { ...state, errorMessage: action.message }
    case 'setNotice':
      return { ...state, notice: action.message }
  }
}

export function buildChipItems(threads: FounderThread[], pendingLabels: string[]): CloseoutChipItem[] {
  return [
    ...orderForChips(threads).map((thread) => ({ key: thread.id, label: thread.label, thread })),
    ...pendingLabels.map((label) => ({ key: pendingKey(label), label, thread: null })),
  ]
}

/** waitingOn is sent only when changed, so an untouched field never overwrites what the server has. */
export function buildCloseoutEntry(item: CloseoutChipItem, draft: CloseoutEntryDraft): FounderCloseoutEntryInput {
  const nextAction = draft.nextAction.trim()
  const note = draft.note.trim()
  const waitingOn = draft.waitingOn.trim()
  const originalWaitingOn = (item.thread?.waitingOn ?? '').trim()
  return {
    ...(item.thread ? { resumePointId: item.thread.id } : { label: item.label }),
    ...(nextAction ? { nextAction } : {}),
    ...(note ? { note } : {}),
    ...(waitingOn !== originalWaitingOn ? { waitingOn: waitingOn || null } : {}),
  }
}

export function buildCloseoutEntries(
  items: CloseoutChipItem[],
  drafts: Readonly<Record<string, CloseoutEntryDraft>>,
): FounderCloseoutEntryInput[] {
  return items.map((item) => buildCloseoutEntry(item, drafts[item.key] ?? emptyCloseoutDraft(item.thread)))
}

/** True when closing would throw away something the founder typed (selection alone does not count). */
export function hasTypedInput(state: CloseoutFormState, threads: FounderThread[]): boolean {
  if (state.pendingLabels.length > 0 || state.newLabel.trim() !== '') return true
  return Object.entries(state.drafts).some(([key, draft]) => {
    const originalWaitingOn = threads.find((thread) => thread.id === key)?.waitingOn ?? ''
    return draft.nextAction.trim() !== '' || draft.note.trim() !== '' || draft.waitingOn.trim() !== originalWaitingOn.trim()
  })
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]'
export const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900'
export const FIELD_LABEL_CLASS = 'mt-2 block text-xs font-medium text-gray-700 dark:text-gray-300'

export function chipClass(selected: boolean): string {
  const tone = selected
    ? 'border-primary-300 bg-primary-100 font-semibold text-primary-800 dark:border-primary-500 dark:bg-primary/20 dark:text-primary-200'
    : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200'
  return `inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-left text-sm break-words ${tone} ${FOCUS_RING}`
}

/** Keeps Tab / Shift+Tab inside the modal dialog. */
export function trapTab(event: KeyboardEvent<HTMLElement>, container: HTMLElement): void {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
