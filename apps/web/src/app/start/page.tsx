'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@apollo/client/react'
import Navbar from '@/components/layout/Navbar'
import { getCurrentUser } from '@/lib/auth'
import { ME_IS_FOUNDER } from '@/lib/founder-queries'
import { useFounderStart } from '@/hooks/useFounderStart'
import { AddThreadForm } from '@/components/founder/AddThreadForm'
import { ClaudeNotes } from '@/components/founder/ClaudeNotes'
import { CloseoutForm } from '@/components/founder/CloseoutForm'
import { ParkedList } from '@/components/founder/ParkedList'
import { PauseControl } from '@/components/founder/PauseControl'
import { RankForm } from '@/components/founder/RankForm'
import { WaitingOnYou } from '@/components/founder/WaitingOnYou'
import type { FounderThread } from '@/components/founder/types'
import {
  closeoutFlagText, formatDayLabel, isPauseActive, pausedText, startHeader, todayIst as currentIstDate,
} from '@/lib/founder/client-format'
import { StartThreadSections } from './StartThreadSections'
import { StartToolbar, type StartToolbarToggles } from './StartToolbar'

type GateState = 'checking' | 'founder' | 'denied' | 'error'
interface MeIsFounderData { me: { employeeId: string; isFounder: boolean | null } | null }
interface PageStatus { text: string; isError: boolean }
interface CloseoutState { open: boolean; preselectedId: string | null }

const AUTH_ERROR = /FORBIDDEN|UNAUTHENTICATED/i
const NOTICE = 'rounded-lg px-3 py-2 text-sm'

/** Founder check against the server; localStorage alone must never reveal founder data. */
function useFounderGate(hasUser: boolean): { gate: GateState; gateError: string | null; retry: () => void } {
  const { data, loading, error, refetch } = useQuery<MeIsFounderData>(ME_IS_FOUNDER, {
    skip: !hasUser, fetchPolicy: 'network-only', notifyOnNetworkStatusChange: true,
  })
  const retry = useCallback(() => {
    refetch().catch((caught: unknown) => console.error('Founder check failed', caught))
  }, [refetch])
  if (!hasUser || loading) return { gate: 'checking', gateError: null, retry }
  if (data?.me?.isFounder === true) return { gate: 'founder', gateError: null, retry }
  if (error && !AUTH_ERROR.test(error.message)) return { gate: 'error', gateError: error.message, retry }
  return { gate: data || error ? 'denied' : 'checking', gateError: null, retry }
}

function staleBannerText(oldDate: string | null, refreshError: string | null): string {
  if (oldDate) return `Showing the Start for ${formatDayLabel(oldDate)} — today’s hasn’t loaded yet.`
  return `Couldn’t refresh — showing the last loaded Start.${refreshError ? ` (${refreshError})` : ''}`
}

function Spinner({ label }: { label: string }): JSX.Element {
  return (
    <div role="status" className="flex justify-center py-10">
      <span className="loading-spinner h-8 w-8" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export default function StartPage(): JSX.Element {
  const router = useRouter()
  const [hasUser, setHasUser] = useState(false)
  useEffect(() => {
    if (!getCurrentUser()) {
      router.push('/')
      return
    }
    setHasUser(true)
  }, [router])

  const { gate, gateError, retry } = useFounderGate(hasUser)
  useEffect(() => {
    if (gate === 'denied') router.push('/dashboard')
  }, [gate, router])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Navbar />
      <main className="mx-auto w-full max-w-[720px] px-4 py-6">
        {gate === 'founder' ? <FounderStartView /> : null}
        {gate === 'checking' ? <Spinner label="Checking access" /> : null}
        {gate === 'error' ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{gateError}</p>
            <button type="button" onClick={retry} className="btn-secondary">Retry</button>
          </div>
        ) : null}
      </main>
    </div>
  )
}

function FounderStartView(): JSX.Element {
  const {
    start, top3, accordion, todayIst, loading, isStale, errorMessage, refresh, markNotToday, activityFor,
    parkThread, parkingId, statusMessage, statusIsError, refreshing, refreshError,
  } = useFounderStart({ enabled: true })
  const addRegionId = useId()
  const parkedRegionId = useId()
  const parkedRef = useRef<HTMLDivElement>(null)
  const [toggles, setToggles] = useState<StartToolbarToggles>({ showAdd: false, showParked: false })
  const [closeout, setCloseout] = useState<CloseoutState>({ open: false, preselectedId: null })
  const [rankOpen, setRankOpen] = useState(false)
  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null)
  // The hook keeps its last park message; show it only while a park is the latest action.
  const [showParkStatus, setShowParkStatus] = useState(false)
  // Remounting the parked list makes it pick up a thread parked from a card.
  const [parkedListKey, setParkedListKey] = useState(0)

  const realToday = currentIstDate()
  const oldDate = start && start.date < realToday ? start.date : null
  // Server order, not the "Not today" order: the form orders its chips by rank itself.
  const closeoutThreads = useMemo<FounderThread[]>(() => (start ? [...start.top3, ...start.accordion] : []), [start])
  const status: PageStatus | null = showParkStatus
    ? (statusMessage ? { text: statusMessage, isError: statusIsError } : null)
    : pageStatus
  const announce = useCallback((next: PageStatus | null) => {
    setShowParkStatus(false)
    setPageStatus(next)
  }, [])

  useEffect(() => {
    if (toggles.showParked) parkedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [toggles.showParked])

  const openCloseout = useCallback((preselectedId: string | null) => setCloseout({ open: true, preselectedId }), [])
  const closeCloseout = useCallback(() => setCloseout((current) => ({ ...current, open: false })), [])
  const handleDoneNext = useCallback((thread: FounderThread) => openCloseout(thread.id), [openCloseout])
  const handleCloseoutSaved = useCallback((savedCount: number) => {
    announce({ text: `Close-out saved for ${savedCount} ${savedCount === 1 ? 'thread' : 'threads'}.`, isError: false })
    setParkedListKey((key) => key + 1)
    void refresh()
  }, [announce, refresh])
  const handleRankSaved = useCallback(() => announce({ text: 'Ranks saved.', isError: false }), [announce])
  const handleNotToday = useCallback((thread: FounderThread) => {
    markNotToday(thread.id)
    announce({ text: `${thread.label} moved to the end of Top 3 for today.`, isError: false })
  }, [announce, markNotToday])
  const handlePark = useCallback(async (thread: FounderThread) => {
    setShowParkStatus(true)
    await parkThread(thread)
    setParkedListKey((key) => key + 1)
  }, [parkThread])
  const handleRefresh = useCallback(() => {
    announce(null)
    void refresh()
  }, [announce, refresh])
  const handleChanged = useCallback(() => void refresh(), [refresh])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{startHeader(todayIst)}</h1>
      {/* One flex child: the live regions stay mounted (so they announce) without adding empty gaps. */}
      <div>
        <StartToolbar
          toggles={toggles} refreshing={refreshing} addRegionId={addRegionId} parkedRegionId={parkedRegionId}
          onCloseout={() => openCloseout(null)} onRank={() => setRankOpen(true)} onToggle={setToggles} onRefresh={handleRefresh}
        />
        <div aria-live="polite" role="status" className={status && !status.isError ? `mt-3 ${NOTICE} bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300` : ''}>
          {status && !status.isError ? status.text : ''}
        </div>
        <div role="alert" className={status?.isError ? `mt-3 ${NOTICE} bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300` : ''}>
          {status?.isError ? status.text : ''}
        </div>
      </div>
      {toggles.showAdd ? <div id={addRegionId}><AddThreadForm onCreated={handleChanged} /></div> : null}
      {isStale ? (
        <p className={`${NOTICE} bg-amber-50 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>
          {staleBannerText(oldDate, refreshError)}
        </p>
      ) : null}
      {start?.closeoutOverdue ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{closeoutFlagText(start.lastCloseoutDate)}</p>
      ) : null}
      {start?.pausedUntil && isPauseActive(start.pausedUntil, realToday) ? (
        <p className="text-sm text-gray-600 dark:text-neutral-400">{pausedText(start.pausedUntil)}</p>
      ) : null}
      {start ? (
        <details>
          <summary className="w-fit cursor-pointer rounded text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-neutral-300 dark:hover:text-neutral-100">
            Pause Start push
          </summary>
          <div className="pt-2"><PauseControl pausedUntil={start.pausedUntil} todayIst={realToday} onChanged={handleChanged} /></div>
        </details>
      ) : null}
      {loading ? <Spinner label="Loading Start" /> : null}
      {!start && !loading && errorMessage ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="btn-secondary disabled:opacity-50">
            Retry
          </button>
        </div>
      ) : null}
      {start ? (
        <>
          <StartThreadSections
            top3={top3} accordion={accordion} parkingId={parkingId} activityFor={activityFor}
            onCloseout={openCloseout} onDoneNext={handleDoneNext} onNotToday={handleNotToday} onPark={handlePark}
          />
          <WaitingOnYou items={start.waitingOnMe} todayIst={realToday} />
          <ClaudeNotes note={start.claudeNotes} />
        </>
      ) : null}
      {toggles.showParked ? (
        <div id={parkedRegionId} ref={parkedRef} className="scroll-mt-4">
          <ParkedList key={parkedListKey} onChanged={handleChanged} />
        </div>
      ) : null}
      <CloseoutForm
        open={closeout.open} threads={closeoutThreads} preselectedId={closeout.preselectedId}
        onClose={closeCloseout} onSaved={handleCloseoutSaved}
      />
      <RankForm open={rankOpen} onClose={() => setRankOpen(false)} onSaved={handleRankSaved} />
    </div>
  )
}
