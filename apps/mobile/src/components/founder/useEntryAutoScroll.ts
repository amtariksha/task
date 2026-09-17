import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native'

interface Band { top: number; height: number }

export interface EntryAutoScroll {
  scrollRef: RefObject<ScrollView | null>
  onViewportLayout: (event: LayoutChangeEvent) => void
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  entryLayoutHandler: (key: string) => (event: LayoutChangeEvent) => void
}

const EDGE_GAP = 8

/**
 * iOS does not scroll a ScrollView to a newly focused input, so once the keyboard has settled
 * this nudges the focused entry into the visible part of the (now shorter) sheet. It scrolls
 * only as far as needed, so the chips above stay reachable for the next tap.
 */
export function useEntryAutoScroll(focusKey: string | null, focusNonce: number | null, delayMs: number): EntryAutoScroll {
  const scrollRef = useRef<ScrollView>(null)
  const viewportHeight = useRef(0)
  const scrollY = useRef(0)
  const bands = useRef<Readonly<Record<string, Band>>>({})

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height
  }, [])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y
  }, [])

  const entryLayoutHandler = useCallback((key: string) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout
    bands.current = { ...bands.current, [key]: { top: y, height } }
  }, [])

  useEffect(() => {
    if (focusKey === null || focusNonce === null) return
    const handle = setTimeout(() => {
      const band = bands.current[focusKey]
      const viewport = viewportHeight.current
      if (!band || viewport <= 0) return
      const bandBottom = band.top + Math.min(band.height, viewport)
      if (band.top < scrollY.current) {
        scrollRef.current?.scrollTo({ y: Math.max(band.top - EDGE_GAP, 0), animated: true })
      } else if (bandBottom > scrollY.current + viewport) {
        scrollRef.current?.scrollTo({ y: bandBottom - viewport + EDGE_GAP, animated: true })
      }
    }, delayMs)
    return () => clearTimeout(handle)
  }, [focusKey, focusNonce, delayMs])

  return { scrollRef, onViewportLayout, onScroll, entryLayoutHandler }
}
