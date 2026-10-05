import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getUserData } from '../../utils/secureStorage'
import { logger } from '../../utils/debugLogger'
import {
  draftStorageKey, isEmptyDraft, parseStoredDraft, toStoredDraft,
  type BrainDumpDraft, type DraftStatus,
} from '../../utils/brainDump'

const AUTOSAVE_DELAY_MS = 700
const EMPTY_DRAFT: BrainDumpDraft = { text: '', review: null }

export interface BrainDumpDraftHandle {
  draft: BrainDumpDraft
  /** False until the stored draft has been read; nothing is written before then. */
  ready: boolean
  status: DraftStatus
  update: (change: (current: BrainDumpDraft) => BrainDumpDraft) => void
  /** Call only after a successful save: no later write, including the unmount flush, can bring it back. */
  clear: () => Promise<void>
}

interface StoredRead { key: string | null; draft: BrainDumpDraft | null }

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// AsyncStorage directly rather than the storage helper, whose get() returns null on a failed read:
// treating that as "no draft" would let the first keystroke overwrite the real one.
async function readStoredDraft(): Promise<StoredRead> {
  const user = await getUserData<{ employeeId?: string }>()
  if (!user?.employeeId) return { key: null, draft: null }
  const key = draftStorageKey(user.employeeId)
  const raw = await AsyncStorage.getItem(key)
  return { key, draft: raw === null ? null : parseStoredDraft(parseJson(raw)) }
}

/**
 * The Brain dump draft, kept per employee in AsyncStorage. Saved shortly after each change and
 * flushed when the app goes to the background or the screen unmounts, because a PIN lock, a
 * company switch or the Start notification can unmount the screen without a back press.
 */
export function useBrainDumpDraft(): BrainDumpDraftHandle {
  const [draft, setDraft] = useState<BrainDumpDraft>(EMPTY_DRAFT)
  const [status, setStatus] = useState<DraftStatus>('loading')
  const keyRef = useRef<string | null>(null)
  const latestRef = useRef<BrainDumpDraft>(EMPTY_DRAFT)
  const dirtyRef = useRef(false)
  const clearedRef = useRef(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setStatusIfMounted = useCallback((next: DraftStatus) => {
    if (mountedRef.current) setStatus(next)
  }, [])

  const persist = useCallback(async () => {
    timerRef.current = null
    const key = keyRef.current
    if (!key || clearedRef.current || !dirtyRef.current) return
    dirtyRef.current = false
    const value = latestRef.current
    try {
      if (isEmptyDraft(value)) await AsyncStorage.removeItem(key)
      else await AsyncStorage.setItem(key, JSON.stringify(toStoredDraft(value, new Date())))
      if (!dirtyRef.current) setStatusIfMounted('saved')
    } catch (error: unknown) {
      dirtyRef.current = true
      logger.warn('Founder', 'Could not save the brain dump draft', error)
      setStatusIfMounted('failed')
    }
  }, [setStatusIfMounted])

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    void persist()
  }, [persist])

  useEffect(() => {
    let cancelled = false
    readStoredDraft()
      .then(({ key, draft: stored }) => {
        if (cancelled) return
        keyRef.current = key
        if (stored) {
          latestRef.current = stored
          setDraft(stored)
        }
        setStatus(key ? (stored ? 'saved' : 'idle') : 'unavailable')
      })
      .catch((error: unknown) => {
        logger.warn('Founder', 'Could not read the brain dump draft', error)
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') flush()
    })
    return () => {
      subscription.remove()
      mountedRef.current = false
      flush()
    }
  }, [flush])

  const update = useCallback((change: (current: BrainDumpDraft) => BrainDumpDraft) => {
    const next = change(latestRef.current)
    latestRef.current = next
    setDraft(next)
    if (!keyRef.current || clearedRef.current) return
    dirtyRef.current = true
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persist()
    }, AUTOSAVE_DELAY_MS)
  }, [persist])

  const clear = useCallback(async () => {
    clearedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const key = keyRef.current
    if (!key) return
    try {
      await AsyncStorage.removeItem(key)
    } catch (error: unknown) {
      logger.warn('Founder', 'Could not clear the saved brain dump draft', error)
    }
  }, [])

  return { draft, ready: status !== 'loading', status, update, clear }
}
