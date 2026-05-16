import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Observe an element's content-box width and return the latest value.
 * Use to drive responsive layouts where CSS media queries don't apply
 * (e.g. a dock panel that resizes independently of the viewport).
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(): {
  ref: RefObject<T>
  width: number
} {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}
