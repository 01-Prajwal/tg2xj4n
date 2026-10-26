import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App'
import { buildPresets, worstHour } from './lib/selection'
import * as fx from './test/fixtures'

const ROUTES: [string, unknown][] = [
  ['/api/health', fx.health],
  ['/api/series', fx.series],
  ['/api/metrics/by-hour', fx.byHour],
  ['/api/metrics/by-horizon', fx.byHorizon],
  ['/api/metrics', fx.metrics],
  ['/api/forecast-vintages', fx.vintages],
]

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const hit = ROUTES.find(([path]) => url.startsWith(path))
    return hit
      ? new Response(JSON.stringify(hit[1]), { status: 200 })
      : new Response('{"detail":"not found"}', { status: 404 })
  })
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the headline and stat tiles for the default day-ahead view', async () => {
    mockApi()
    renderApp()
    expect(await screen.findByText(/over-estimated wind by/)).toBeInTheDocument()
    const tiles = screen.getByRole('region', { name: 'Accuracy summary' })
    expect(within(tiles).getByText('2.00 GW')).toBeInTheDocument() // MAE
    expect(within(tiles).getByText('−2.00 GW')).toBeInTheDocument() // bias
    expect(within(tiles).getByText('2 / 2 h')).toBeInTheDocument()
  })

  it('reveals the lead-time slider and refetches in horizon mode', async () => {
    const fetchSpy = mockApi()
    renderApp()
    await screen.findByText(/over-estimated wind by/)
    expect(screen.queryByLabelText('Published at least')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Fixed lead time' }))
    expect(screen.getByLabelText('Published at least')).toBeInTheDocument()
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes('mode=horizon') && String(u).includes('h=24')),
    ).toBe(true)
  })

  it('drills into the worst hour by default', async () => {
    const fetchSpy = mockApi()
    renderApp()
    await screen.findByText(/At the 11:00 cutoff the trader saw/)
    expect(
      fetchSpy.mock.calls.some(([u]) =>
        String(u).includes('forecast-vintages?target=2026-01-02T01%3A00%3A00Z'),
      ),
    ).toBe(true)
  })

  it('switches a chart to its table view', async () => {
    mockApi()
    renderApp()
    await screen.findByText(/over-estimated wind by/)
    const [mainToggle] = screen.getAllByRole('button', { name: 'Show table' })
    await userEvent.click(mainToggle!)
    expect(screen.getByRole('columnheader', { name: 'Reliable (P10)' })).toBeInTheDocument()
  })

  it('reports an unavailable API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"detail":"Snapshot incomplete"}', { status: 503 }),
    )
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot incomplete')
  })
})

describe('helpers', () => {
  it('picks the hour with the largest absolute error', () => {
    expect(worstHour(fx.series.points)).toBe('2026-01-02T01:00:00Z')
    expect(worstHour([])).toBeNull()
  })

  it('splits the window into a full-period preset and weeks', () => {
    const presets = buildPresets(fx.health.default_window)
    expect(presets.map((p) => p.label)).toEqual([
      'Full period',
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
      'Week 5',
    ])
    expect(presets.at(-1)).toMatchObject({ from: '2026-01-30', to: '2026-02-02' })
  })
})
