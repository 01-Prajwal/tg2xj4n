import '@testing-library/jest-dom/vitest'

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// The app keeps the selected view in the URL hash; start every test on the default view.
beforeEach(() => {
  window.history.replaceState(null, '', '/')
})
