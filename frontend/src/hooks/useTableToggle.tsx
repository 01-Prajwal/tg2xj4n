import { useState, type ReactNode } from 'react'

/** Chart/table switch: returns the current mode and the toggle button to render. */
export function useTableToggle(): [boolean, ReactNode] {
  const [asTable, setAsTable] = useState(false)
  const toggle = (
    <button type="button" className="link-btn" onClick={() => setAsTable((v) => !v)}>
      {asTable ? 'Show chart' : 'Show table'}
    </button>
  )
  return [asTable, toggle]
}
