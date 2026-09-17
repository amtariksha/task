'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import { FOUNDER_START, UPDATE_FOUNDER_RESUME_POINT } from '@/lib/founder-queries'
import { applyNotToday, istDateString } from '@/lib/founder/client-format'
import type {
  FounderStart,
  FounderStartQueryData,
  FounderTeamActivity,
  FounderThread,
} from '@/components/founder/types'

export interface UseFounderStartResult {
  start: FounderStart | undefined
  top3: FounderThread[]
  accordion: FounderThread[]
  todayIst: string
  loading: boolean
  isStale: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  markNotToday: (threadId: string) => void
  activityFor: (threadId: string) => FounderTeamActivity | undefined
  parkThread: (thread: FounderThread) => Promise<void>
  parkingId: string | null
  statusMessage: string | null
  /** Additive to the shared contract: lets the page style and announce the status. */
  statusIsError: boolean
  refreshing: boolean
  /** Why the Start on screen could not be refreshed (errorMessage covers the no-Start case). */
  refreshError: string | null
}

interface ParkThreadData {
  updateFounderResumePoint: FounderThread | null
}

interface ParkThreadVariables {
  id: string
  isActive: boolean
}

interface NotTodayState {
  date: string
  ids: string[]
}

interface HookStatus {
  text: string
  isError: boolean
}

const LOAD_ERROR = 'Could not load Start.'
const PARK_ERROR = 'Could not park the thread.'
const EMPTY_THREADS: FounderThread[] = []
const NO_IDS: string[] = []
const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000
const MIDNIGHT_GRACE_MS = 5_000

function msUntilNextIstMidnight(now: Date): number {
  return DAY_MS - ((now.getTime() + IST_OFFSET_MS) % DAY_MS) + MIDNIGHT_GRACE_MS
}

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

export function useFounderStart({ enabled }: { enabled: boolean }): UseFounderStartResult {
  const { data, previousData, loading: requestInFlight, error, refetch } = useQuery<FounderStartQueryData>(
    FOUNDER_START,
    { skip: !enabled, fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true },
  )
  const [updateResumePoint] = useMutation<ParkThreadData, ParkThreadVariables>(UPDATE_FOUNDER_RESUME_POINT)

  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null)
  const [notToday, setNotToday] = useState<NotTodayState>({ date: '', ids: [] })
  const [parkingId, setParkingId] = useState<string | null>(null)
  const [status, setStatus] = useState<HookStatus | null>(null)
  // A ref, not state: two quick clicks land before a re-render could disable the button.
  const parksInFlight = useRef<readonly string[]>([])

  // With errorPolicy 'all' a failed network fetch can clear `data`; keep the last good Start on screen.
  const start = data?.founderStart ?? previousData?.founderStart
  const todayIst = start?.date ?? istDateString(new Date())

  // A newer Start from any fetch supersedes an earlier failed refresh.
  const freshGeneratedAt = data?.founderStart?.generatedAt
  useEffect(() => {
    if (freshGeneratedAt) setRefreshFailure(null)
  }, [freshGeneratedAt])

  const notTodayIds = notToday.date === todayIst ? notToday.ids : NO_IDS

  // Applied one id at a time, in the order they were marked, so the latest "Not today" lands last.
  const top3 = useMemo(
    () => notTodayIds.reduce((ordered, id) => applyNotToday(ordered, [id]), start?.top3 ?? EMPTY_THREADS),
    [start?.top3, notTodayIds],
  )

  const activityByThread = useMemo(
    () => new Map((start?.teamActivity ?? []).map((activity) => [activity.resumePointId, activity])),
    [start?.teamActivity],
  )

  const activityFor = useCallback(
    (threadId: string): FounderTeamActivity | undefined => activityByThread.get(threadId),
    [activityByThread],
  )

  const markNotToday = useCallback(
    (threadId: string) => {
      setNotToday((previous) => {
        const ids = previous.date === todayIst ? previous.ids.filter((id) => id !== threadId) : []
        return { date: todayIst, ids: [...ids, threadId] }
      })
    },
    [todayIst],
  )

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = await refetch()
      setRefreshFailure(result.error ? result.error.message || LOAD_ERROR : null)
    } catch (caught: unknown) {
      setRefreshFailure(errorText(caught, LOAD_ERROR))
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // Nothing re-renders an open tab when the IST date changes, so yesterday's Start
  // (and its "Not today" order) would stay up with no stale banner. Re-check at
  // IST midnight and whenever the tab comes back into view.
  const startDate = start?.date
  useEffect(() => {
    if (!enabled || !startDate) return undefined
    const refreshIfNewDay = (): void => {
      if (document.visibilityState === 'visible' && istDateString(new Date()) !== startDate) void refresh()
    }
    const timer = window.setTimeout(refreshIfNewDay, msUntilNextIstMidnight(new Date()))
    document.addEventListener('visibilitychange', refreshIfNewDay)
    window.addEventListener('focus', refreshIfNewDay)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshIfNewDay)
      window.removeEventListener('focus', refreshIfNewDay)
    }
  }, [enabled, startDate, refresh])

  const parkThread = useCallback(
    async (thread: FounderThread): Promise<void> => {
      if (parksInFlight.current.includes(thread.id)) return
      parksInFlight.current = [...parksInFlight.current, thread.id]
      setParkingId(thread.id)
      setStatus(null)
      try {
        const result = await updateResumePoint({ variables: { id: thread.id, isActive: false } })
        if (result.error || !result.data?.updateFounderResumePoint) {
          setStatus({ text: result.error?.message || PARK_ERROR, isError: true })
          return
        }
        setStatus({ text: `Parked ${thread.label}`, isError: false })
        // Awaited so the card stays busy until the list without it lands; a failed refetch shows the stale banner.
        await refresh()
      } catch (caught: unknown) {
        setStatus({ text: errorText(caught, PARK_ERROR), isError: true })
      } finally {
        parksInFlight.current = parksInFlight.current.filter((id) => id !== thread.id)
        setParkingId((current) => (current === thread.id ? null : current))
      }
    },
    [updateResumePoint, refresh],
  )

  const queryFailure = error ? error.message || LOAD_ERROR : null
  const failure = refreshFailure ?? queryFailure
  // cache-and-network paints a cached Start at once; yesterday's must not pass for today's while the fetch runs.
  const isEarlierDay = start !== undefined && start.date < istDateString(new Date())

  return {
    start,
    top3,
    accordion: start?.accordion ?? EMPTY_THREADS,
    todayIst,
    loading: enabled && !start && requestInFlight,
    isStale: Boolean(start) && (failure !== null || isEarlierDay),
    errorMessage: start ? null : failure,
    refresh,
    markNotToday,
    activityFor,
    parkThread,
    parkingId,
    statusMessage: status?.text ?? null,
    statusIsError: status?.isError ?? false,
    refreshing,
    refreshError: start ? failure : null,
  }
}
