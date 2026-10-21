import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

type Position = { left: number; top: number }

/** Scroll policy for BrowserRouter, shared by links and programmatic navigation. */
export function RouteScroll() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const previous = useRef(location)
  const positions = useRef(new Map<string, Position>())

  useLayoutEffect(() => {
    const changedPath = previous.current.pathname !== location.pathname
    previous.current = location
    // Native hash links can reuse a history state key; distinguish their URLs.
    const entryKey = `${location.key}:${location.pathname}${location.search}${location.hash}`
    const saved = navigationType === 'POP' ? positions.current.get(entryKey) : undefined
    let waiting = true
    let resize: ResizeObserver | undefined
    let mutations: MutationObserver | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    function stopWaiting() {
      waiting = false
      resize?.disconnect()
      mutations?.disconnect()
      clearTimeout(timeout)
    }

    function remember() {
      if (waiting) return
      const entries = positions.current
      entries.set(entryKey, { left: window.scrollX, top: window.scrollY })
      // Bound memory without changing browser history or native reload restoration.
      if (entries.size > 100) entries.delete(entries.keys().next().value!)
    }

    function restore() {
      if (!waiting) return
      if (saved) {
        window.scrollTo({ ...saved, behavior: 'instant' })
        // Loading skeletons can be shorter than the page we are returning to.
        if (Math.abs(window.scrollY - saved.top) > 1) return
      } else if (location.hash) {
        let id = location.hash.slice(1)
        try { id = decodeURIComponent(id) } catch { /* Preserve malformed fragments. */ }
        const target = document.getElementById(id) ?? document.getElementsByName(id)[0]
        if (!target) return
        target.scrollIntoView({ behavior: 'instant', block: 'start' })
      } else if (navigationType === 'PUSH' || (navigationType === 'REPLACE' && changedPath)) {
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
      }
      // Unknown POP entries retain browser-native restoration. Query-only REPLACE
      // (catalog filters) stays in place instead of jumping away from the controls.
      stopWaiting()
    }

    function userScroll(event: Event) {
      if (event instanceof KeyboardEvent &&
          !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return
      stopWaiting()
    }

    restore()
    if (waiting) {
      // Covers asynchronous data, lazy routes and image-driven layout growth.
      resize = new ResizeObserver(restore)
      resize.observe(document.body)
      mutations = new MutationObserver(restore)
      mutations.observe(document.body, { childList: true, subtree: true })
      timeout = setTimeout(stopWaiting, 10_000)
    }
    window.addEventListener('scroll', remember, { passive: true })
    const intentEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    for (const type of intentEvents) window.addEventListener(type, userScroll, { passive: true })
    return () => {
      stopWaiting()
      window.removeEventListener('scroll', remember)
      for (const type of intentEvents) window.removeEventListener(type, userScroll)
    }
  }, [location, navigationType])

  return null
}
