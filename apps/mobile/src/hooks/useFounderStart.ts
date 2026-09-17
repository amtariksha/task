import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import { FOUNDER_START, UPDATE_FOUNDER_RESUME_POINT } from '../config/founder-queries'
import { useToast } from '../contexts/ToastContext'
import { useNetworkStatus } from './useNetworkStatus'
import { applyNotToday, istDateString } from '../utils/founderFormat'
import type {
  FounderStart,
  FounderStartQueryData,
  FounderTeamActivity,
  FounderThread,
} from '../types/founder'

export interface UseFounderStartResult {
  start: FounderStart | undefined
  top3: FounderThread[]
  accordion: FounderThread[]
  todayIst: string
  loading: boolean
  refreshing: boolean
  isStale: boolean
  errorMessage: string | null
  refresh: () => Promise<void>
  markNotToday: (threadId: string) => void
  activityFor: (threadId: string) => FounderTeamActivity | undefined
  parkThread: (thread: FounderThread) => Promise<void>
}

interface ParkThreadData {
  updateFounderResumePoint: FounderThread
}

interface ParkThreadVariables {
  id: string
  isActive: boolean
}

interface NotTodayState {
  date: string
  ids: string[]
}

const LOAD_ERROR = 'Could not load Start.'
const PARK_ERROR = 'Could not park the thread.'
const EMPTY_THREADS: FounderThread[] = []
const NO_IDS: string[] = []
const NO_ID_SET: ReadonlySet<string> = new Set()

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

export function useFounderStart(): UseFounderStartResult {
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only an explicit false means offline,
  // otherwise the stale banner flashes on every cold start.
  const isOffline = isConnected === false || isInternetReachable === false

  const { data, previousData, loading: requestInFlight, error, refetch } = useQuery<FounderStartQueryData>(
    FOUNDER_START,
    { fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true },
  )
  const [updateResumePoint] = useMutation<ParkThreadData, ParkThreadVariables>(UPDATE_FOUNDER_RESUME_POINT, {
    refetchQueries: [FOUNDER_START],
  })

  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null)
  const [notToday, setNotToday] = useState<NotTodayState>({ date: '', ids: [] })
  // A parked card stays on screen until the refetch lands, so repeat taps are ignored until then.
  const parksInFlight = useRef<ReadonlySet<string>>(NO_ID_SET)
  const parkedAwaitingRefresh = useRef<ReadonlySet<string>>(NO_ID_SET)

  // With errorPolicy 'all' a failed network fetch can clear `data`; keep the last good Start on screen.
  const start = data?.founderStart ?? previousData?.founderStart
  const todayIst = start?.date ?? istDateString(new Date())

  // A newer Start from any fetch (e.g. a mutation's refetchQueries) supersedes an earlier failed refresh.
  const freshGeneratedAt = data?.founderStart?.generatedAt
  useEffect(() => {
    if (!freshGeneratedAt) return
    setRefreshFailure(null)
    parkedAwaitingRefresh.current = NO_ID_SET
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

  const parkThread = useCallback(
    async (thread: FounderThread): Promise<void> => {
      if (parksInFlight.current.has(thread.id) || parkedAwaitingRefresh.current.has(thread.id)) return
      parksInFlight.current = new Set([...parksInFlight.current, thread.id])
      try {
        const result = await updateResumePoint({ variables: { id: thread.id, isActive: false } })
        if (result.error || !result.data?.updateFounderResumePoint) {
          showToast(result.error?.message ?? PARK_ERROR, 'error')
          return
        }
        parkedAwaitingRefresh.current = new Set([...parkedAwaitingRefresh.current, thread.id])
        showToast(`Parked ${thread.label}`, 'success')
      } catch (caught: unknown) {
        showToast(errorText(caught, PARK_ERROR), 'error')
      } finally {
        parksInFlight.current = new Set([...parksInFlight.current].filter((id) => id !== thread.id))
      }
    },
    [updateResumePoint, showToast],
  )

  const queryFailure = error ? error.message || LOAD_ERROR : null
  const failure = refreshFailure ?? queryFailure
  // cache-and-network paints the persisted Start at once; yesterday's must not pass for today's while the fetch runs.
  const isEarlierDay = start !== undefined && start.date < istDateString(new Date())

  return {
    start,
    top3,
    accordion: start?.accordion ?? EMPTY_THREADS,
    todayIst,
    loading: !start && requestInFlight,
    refreshing,
    isStale: Boolean(start) && (failure !== null || isOffline || isEarlierDay),
    errorMessage: start ? null : failure,
    refresh,
    markNotToday,
    activityFor,
    parkThread,
  }
}
