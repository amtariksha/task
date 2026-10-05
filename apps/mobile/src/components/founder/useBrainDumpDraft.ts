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
  /**
   * After a successful save, as the screen closes: `remaining` (the rows left out of the save)
   * replaces the stored draft, and later updates are ignored so nothing the closing screen still
   * shows is written back. A draft another Brain dump screen stored since this one last read or
   * wrote it is newer, and is kept instead.
   */
  finishSave: (remaining: BrainDumpDraft) => Promise<void>
}

interface StoredRead { key: string | null; raw: string | null; draft: BrainDumpDraft | null }

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
  if (!user?.employeeId) return { key: null, raw: null, draft: null }
  const key = draftStorageKey(user.employeeId)
  const raw = await AsyncStorage.getItem(key)
  return { key, raw, draft: raw === null ? null : parseStoredDraft(parseJson(raw)) }
}

/** Resolves to what is stored now: the written value, or null when the draft was empty and removed. */
async function writeDraft(key: string, value: BrainDumpDraft): Promise<string | null> {
  if (isEmptyDraft(value)) {
    await AsyncStorage.removeItem(key)
    return null
  }
  const raw = JSON.stringify(toStoredDraft(value, new Date()))
  await AsyncStorage.setItem(key, raw)
  return raw
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
  const finishedRef = useRef(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What this screen last read or wrote: anything else in storage was written by another Brain dump screen.
  const lastRawRef = useRef<string | null>(null)
  // Writes run one after another, so lastRawRef always ends on the latest one.
  const writingRef = useRef<Promise<void>>(Promise.resolve())

  const setStatusIfMounted = useCallback((next: DraftStatus) => {
    if (mountedRef.current) setStatus(next)
  }, [])

  const persist = useCallback((): Promise<void> => {
    timerRef.current = null
    const key = keyRef.current
    if (!key || !dirtyRef.current) return writingRef.current
    dirtyRef.current = false
    const value = latestRef.current
    const write = async () => {
      try {
        lastRawRef.current = await writeDraft(key, value)
        if (!dirtyRef.current) setStatusIfMounted('saved')
      } catch (error: unknown) {
        dirtyRef.current = true
        logger.warn('Founder', 'Could not save the brain dump draft', error)
        setStatusIfMounted('failed')
      }
    }
    writingRef.current = writingRef.current.then(write)
    return writingRef.current
  }, [setStatusIfMounted])

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    void persist()
  }, [persist])

  useEffect(() => {
    let cancelled = false
    readStoredDraft()
      .then(({ key, raw, draft: stored }) => {
        if (cancelled) return
        keyRef.current = key
        lastRawRef.current = raw
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
    if (finishedRef.current) return
    const next = change(latestRef.current)
    latestRef.current = next
    setDraft(next)
    if (!keyRef.current) return
    dirtyRef.current = true
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persist()
    }, AUTOSAVE_DELAY_MS)
  }, [persist])

  const finishSave = useCallback(async (remaining: BrainDumpDraft) => {
    finishedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    latestRef.current = remaining
    dirtyRef.current = false
    const key = keyRef.current
    if (!key) return
    try {
      await writingRef.current
      // AsyncStorage has no compare-and-set; the window between this read and the write is a few milliseconds.
      const stored = await AsyncStorage.getItem(key)
      if (stored !== null && stored !== lastRawRef.current) {
        logger.info('Founder', 'Brain dump: kept the newer draft another Brain dump screen stored during the save')
        return
      }
      lastRawRef.current = await writeDraft(key, remaining)
    } catch (error: unknown) {
      logger.warn('Founder', 'Could not update the brain dump draft after the save', error)
      // The unmount or background flush tries again; an empty remainder only leaves saved rows behind.
      dirtyRef.current = !isEmptyDraft(remaining)
    }
  }, [])

  return { draft, ready: status !== 'loading', status, update, finishSave }
}
