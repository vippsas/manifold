import React, { useEffect } from 'react'

export function useAutoFocus(visible: boolean, ref: React.RefObject<HTMLTextAreaElement | null>): void {
  useEffect(() => {
    if (visible) {
      // Small delay to ensure DOM is ready after modal mount
      const timer = setTimeout(() => ref.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [visible, ref])
}
