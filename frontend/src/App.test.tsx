import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App'
import { buildPresets } from './lib/selection'
import * as fx from './test/fixtures'

const ROUTES: [string, unknown][] = [
  ['/api/health', fx.health],
  ['/api/series', fx.series],
  ['/api/metrics', fx.metrics],
  ['/api/decision/backtest', fx.backtest],
  ['/api/decision', fx.decision],
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

async function openAccuracy() {
  await userEvent.click(await screen.findByRole('tab', { name: /Forecast accuracy/ }))
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
    await openAccuracy()
    expect(await screen.findByText(/over-estimated wind by/)).toBeInTheDocument()
    const tiles = screen.getByRole('region', { name: 'Accuracy summary' })
    expect(within(tiles).getByText('2.00 GW')).toBeInTheDocument() // MAE
    expect(within(tiles).getByText('−2.00 GW')).toBeInTheDocument() // bias
    expect(within(tiles).getByText('2 / 2 h')).toBeInTheDocument()
  })

  it('reveals the lead-time slider and refetches in horizon mode', async () => {
    const fetchSpy = mockApi()
    renderApp()
    await openAccuracy()
    await screen.findByText(/over-estimated wind by/)
    expect(screen.queryByLabelText('Published at least')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Fixed lead time' }))
    expect(screen.getByLabelText('Published at least')).toBeInTheDocument()
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes('mode=horizon') && String(u).includes('h=24')),
    ).toBe(true)
  })

  it('switches a chart to its table view', async () => {
    mockApi()
    renderApp()
    await openAccuracy()
    await screen.findByText(/over-estimated wind by/)
    const mainCard = screen.getByRole('heading', { name: 'Wind generation: actual vs forecast' })
      .closest('section')!
    await userEvent.click(within(mainCard).getByRole('button', { name: 'Show table' }))
    expect(screen.getByRole('columnheader', { name: 'Reliable (P10)' })).toBeInTheDocument()
  })

  it('opens on the plan view and switches views with the tabs', async () => {
    mockApi()
    renderApp()
    const plan = await screen.findByRole('tab', { name: /Plan tomorrow/ })
    expect(plan).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/is the run published at/)).toBeVisible()
    await openAccuracy()
    expect(screen.getByRole('tab', { name: /Forecast accuracy/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(window.location.hash).toBe('#accuracy')
    expect(screen.queryByText(/is the run published at/)).not.toBeVisible()
  })

  it('reports an unavailable API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"detail":"Snapshot incomplete"}', { status: 503 }),
    )
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot incomplete')
  })
})

describe("Plan tomorrow's purchase", () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the latest run and the purchase quantities at decision time', async () => {
    mockApi()
    renderApp()
    expect(await screen.findByText(/is the run published at/)).toHaveTextContent(
      'run published at 09:30',
    )
    expect(screen.getByText(/arrives after the 11:00 auction closes/)).toBeInTheDocument()
    const tiles = screen.getByRole('region', { name: 'Purchase summary' })
    expect(within(tiles).getByText('22 GWh')).toBeInTheDocument() // forecast
    expect(within(tiles).getByText('14 GWh')).toBeInTheDocument() // count on
    expect(within(tiles).getByText('8 GWh')).toBeInTheDocument() // extra cover
    expect(screen.getByText(/89.4%/)).toBeInTheDocument() // backtest hit rate
  })

  it('hides hindsight until asked, and refetches on new settings', async () => {
    const fetchSpy = mockApi()
    renderApp()
    await screen.findByText(/is the run published at/)
    expect(screen.queryByText('What actually happened')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Show what actually happened'))
    expect(screen.getByText('What actually happened')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '95%' }))
    await userEvent.selectOptions(screen.getByLabelText('Decision time (UK)'), '09:00')
    const urls = fetchSpy.mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => u.includes('/api/decision?') && u.includes('confidence=0.95'))).toBe(true)
    expect(urls.some((u) => u.includes('decision_time=2026-01-31T09%3A00%3A00Z'))).toBe(true)
  })
})

describe('helpers', () => {
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
