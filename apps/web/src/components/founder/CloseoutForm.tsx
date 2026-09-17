'use client'

import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import type { FormEvent, JSX, KeyboardEvent, MouseEvent } from 'react'
import { useMutation } from '@apollo/client/react'
import { Check, X } from 'lucide-react'
import { CREATE_FOUNDER_CLOSEOUT } from '@/lib/founder-queries'
import type { FounderCloseoutEntryInput, FounderThread } from './types'
import {
  FOCUS_RING, FIELD_LABEL_CLASS, MAX_LABEL_LENGTH, MAX_TEXT_LENGTH, NEW_LABEL_FOCUS_KEY, buildChipItems, buildCloseoutEntries,
  chipClass, chipDisplayLabel, closeoutReducer, emptyCloseoutDraft, hasTypedInput, initialCloseoutState, trapTab,
} from './closeout-helpers'
import type { CloseoutChipItem, CloseoutEntryDraft } from './closeout-helpers'

export interface CloseoutFormProps {
  open: boolean
  threads: FounderThread[]
  preselectedId: string | null
  onClose: () => void
  onSaved: (savedCount: number) => void
}

interface CloseoutMutationData { createFounderCloseout: FounderThread[] }
interface CloseoutMutationVars { entries: FounderCloseoutEntryInput[] }
type InputRef = (element: HTMLElement | null) => void

export function CloseoutForm({ open, threads, preselectedId, onClose, onSaved }: CloseoutFormProps): JSX.Element | null {
  const [state, dispatch] = useReducer(closeoutReducer, null, () => initialCloseoutState([], null))
  const [wasOpen, setWasOpen] = useState(false)
  const [createCloseout, { loading: saving }] = useMutation<CloseoutMutationData, CloseoutMutationVars>(CREATE_FOUNDER_CLOSEOUT)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef(new Map<string, HTMLElement>())
  const baseId = useId()

  // Reset while rendering (not in an effect) so a reopened form never paints the previous session.
  // Keyed on `open` only: a background refetch of `threads` must not wipe what was typed.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) dispatch({ type: 'reset', threads, preselectedId })
  }

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open])

  // Declared after the open effect so a requested field wins over the dialog container.
  useEffect(() => {
    if (open && state.focus) inputRefs.current.get(state.focus.key)?.focus()
  }, [open, state.focus])

  const chipItems = useMemo(() => buildChipItems(threads, state.pendingLabels), [threads, state.pendingLabels])
  const selectedItems = chipItems.filter((item) => state.selectedKeys.includes(item.key))
  const canSave = selectedItems.length > 0 && !saving
  const dismissable = !saving && !hasTypedInput(state, threads)

  const registerInput = (key: string): InputRef => (element) => {
    if (element) inputRefs.current.set(key, element)
    else inputRefs.current.delete(key)
  }
  const editDraft = (item: CloseoutChipItem, patch: Partial<CloseoutEntryDraft>): void => dispatch({ type: 'editDraft', item, patch })
  const addNewLabel = (): void => dispatch({ type: 'addNewLabel', threads })

  const requestDismiss = (): void => {
    if (dismissable) onClose()
    else if (!saving) dispatch({ type: 'setNotice', message: 'You have typed a close-out. Use Cancel to discard it.' })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestDismiss()
    } else if (event.key === 'Tab' && dialogRef.current) {
      trapTab(event, dialogRef.current)
    }
  }

  // preventDefault keeps focus inside the dialog when the backdrop is pressed but the form stays open.
  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) { event.preventDefault(); requestDismiss() }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSave) return
    const entries = buildCloseoutEntries(selectedItems, state.drafts)
    dispatch({ type: 'setError', message: null })
    try {
      const result = await createCloseout({ variables: { entries } })
      if (result.error) {
        dispatch({ type: 'setError', message: result.error.message })
        return
      }
      onSaved(entries.length)
      onClose()
    } catch (error) {
      console.error('Close-out save failed:', error)
      dispatch({ type: 'setError', message: error instanceof Error ? error.message : 'Could not save the close-out.' })
    }
  }

  if (!open) return null

  const titleId = `${baseId}-title`
  const newInputId = `${baseId}-new`
  return (
    <div className="modal-backdrop fixed inset-0 z-[100000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${baseId}-desc`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-xl bg-white shadow-xl focus:outline-none dark:bg-neutral-900 sm:rounded-xl"
      >
        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col" noValidate>
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-neutral-700">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">Close out</h2>
              <p id={`${baseId}-desc`} className="text-sm text-gray-600 dark:text-gray-400">Pick what you touched, then set each next step.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close without saving" className={`rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-neutral-800 ${FOCUS_RING}`}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">Threads you touched</legend>
              <div className="flex flex-wrap gap-2">
                {chipItems.map((item) => {
                  const selected = state.selectedKeys.includes(item.key)
                  return (
                    <button key={item.key} type="button" aria-pressed={selected} onClick={() => dispatch({ type: 'toggle', key: item.key })} className={chipClass(selected)}>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                      {chipDisplayLabel(item)}
                    </button>
                  )
                })}
                <button type="button" aria-expanded={state.showNewInput} aria-controls={state.showNewInput ? newInputId : undefined} onClick={() => dispatch({ type: 'openNewInput' })} className={chipClass(false)}>
                  + new
                </button>
              </div>
            </fieldset>
            {chipItems.length === 0 ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">No active threads yet. Use + new to add one.</p> : null}
            {state.showNewInput ? (
              <div id={newInputId} className="mt-3 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${newInputId}-label`} className={FIELD_LABEL_CLASS}>New thread</label>
                  <input
                    id={`${newInputId}-label`}
                    ref={registerInput(NEW_LABEL_FOCUS_KEY)}
                    type="text"
                    maxLength={MAX_LABEL_LENGTH}
                    value={state.newLabel}
                    onChange={(event) => dispatch({ type: 'editNewLabel', value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      addNewLabel()
                    }}
                    className="input-field mt-1"
                  />
                </div>
                <button type="button" onClick={addNewLabel} disabled={!state.newLabel.trim()} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Add
                </button>
              </div>
            ) : null}
            {selectedItems.map((item) => (
              <CloseoutEntry
                key={item.key}
                item={item}
                draft={state.drafts[item.key] ?? emptyCloseoutDraft(item.thread)}
                inputRef={registerInput(item.key)}
                onChange={editDraft}
              />
            ))}
          </div>
          <footer className="border-t border-gray-200 px-5 py-3 dark:border-neutral-700">
            {state.errorMessage ? (
              <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{state.errorMessage}</p>
            ) : null}
            <p role="status" aria-live="polite" className="text-sm text-gray-600 dark:text-gray-400">{state.notice ?? ''}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={selectedItems.length === 0} aria-disabled={saving || undefined} aria-busy={saving} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait aria-disabled:opacity-70">
                {saving ? 'Saving…' : selectedItems.length > 0 ? `Save (${selectedItems.length})` : 'Save'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

interface CloseoutEntryProps {
  item: CloseoutChipItem
  draft: CloseoutEntryDraft
  inputRef: InputRef
  onChange: (item: CloseoutChipItem, patch: Partial<CloseoutEntryDraft>) => void
}

function CloseoutEntry({ item, draft, inputRef, onChange }: CloseoutEntryProps): JSX.Element {
  const id = useId()
  return (
    <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-700">
      <fieldset>
        <legend className="break-words text-sm font-semibold text-gray-900 dark:text-white">{chipDisplayLabel(item)}</legend>
        <label htmlFor={`${id}-next`} className={FIELD_LABEL_CLASS}>Next action</label>
        <textarea
          id={`${id}-next`} ref={inputRef} rows={2} maxLength={MAX_TEXT_LENGTH} value={draft.nextAction}
          placeholder={item.thread?.nextAction || 'One physical step'}
          onChange={(event) => onChange(item, { nextAction: event.target.value })}
          className="input-field mt-1 resize-y"
        />
        {draft.showDetails ? (
          <>
            <label htmlFor={`${id}-note`} className={FIELD_LABEL_CLASS}>What happened (optional)</label>
            <textarea
              id={`${id}-note`} rows={2} maxLength={MAX_TEXT_LENGTH} value={draft.note} autoFocus
              onChange={(event) => onChange(item, { note: event.target.value })}
              className="input-field mt-1 resize-y"
            />
            <label htmlFor={`${id}-waiting`} className={FIELD_LABEL_CLASS}>Waiting on (optional, clear to remove)</label>
            <input
              id={`${id}-waiting`} type="text" maxLength={MAX_TEXT_LENGTH} value={draft.waitingOn}
              onChange={(event) => onChange(item, { waitingOn: event.target.value })}
              className="input-field mt-1"
            />
          </>
        ) : (
          <button type="button" onClick={() => onChange(item, { showDetails: true })} className={`mt-1 rounded text-sm font-medium text-primary-700 hover:underline dark:text-primary-300 ${FOCUS_RING}`}>
            + details
          </button>
        )}
      </fieldset>
    </div>
  )
}
