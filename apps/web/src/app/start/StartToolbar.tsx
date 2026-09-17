'use client'

import type { Dispatch, JSX, SetStateAction } from 'react'
import { Archive, CheckCheck, ListOrdered, Plus, RefreshCw } from 'lucide-react'

export interface StartToolbarToggles {
  showAdd: boolean
  showParked: boolean
}

export interface StartToolbarProps {
  toggles: StartToolbarToggles
  refreshing: boolean
  addRegionId: string
  parkedRegionId: string
  onCloseout: () => void
  onRank: () => void
  onToggle: Dispatch<SetStateAction<StartToolbarToggles>>
  onRefresh: () => void
}

const BUTTON = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm'
const ICON = 'h-4 w-4'

export function StartToolbar(props: StartToolbarProps): JSX.Element {
  const { toggles, refreshing, addRegionId, parkedRegionId, onCloseout, onRank, onToggle, onRefresh } = props
  const toggle = (key: keyof StartToolbarToggles) => () =>
    onToggle((current) => ({ ...current, [key]: !current[key] }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onCloseout} className={`btn-primary ${BUTTON}`}>
        <CheckCheck className={ICON} aria-hidden="true" />
        Close-out
      </button>
      <button type="button" onClick={onRank} className={`btn-secondary ${BUTTON}`}>
        <ListOrdered className={ICON} aria-hidden="true" />
        Rank threads
      </button>
      <button
        type="button"
        onClick={toggle('showAdd')}
        aria-expanded={toggles.showAdd}
        aria-controls={toggles.showAdd ? addRegionId : undefined}
        className={`btn-secondary ${BUTTON}`}
      >
        <Plus className={ICON} aria-hidden="true" />
        Add thread
      </button>
      <button
        type="button"
        onClick={toggle('showParked')}
        aria-expanded={toggles.showParked}
        aria-controls={toggles.showParked ? parkedRegionId : undefined}
        className={`btn-secondary ${BUTTON}`}
      >
        <Archive className={ICON} aria-hidden="true" />
        {toggles.showParked ? 'Hide parked' : 'Show parked'}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-busy={refreshing}
        className={`btn-secondary ${BUTTON} disabled:cursor-wait disabled:opacity-60`}
      >
        <RefreshCw className={`${ICON} ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
