import type { ActualBasis, Filters, SelectionMode, Window } from '../api/types'
import { addDays, dateToIso, fmtDay, isoToDate } from '../lib/format'
import { SLIDER_MAX_H, buildPresets } from '../lib/selection'

interface Props {
  filters: Filters
  defaultWindow: Window
  onChange: (f: Filters) => void
}

export function Controls({ filters, defaultWindow, onChange }: Props) {
  const presets = buildPresets(defaultWindow)
  const fromDate = isoToDate(filters.from)
  const toDate = isoToDate(filters.to)
  const lastDay = addDays(toDate, -1)
  const minDate = isoToDate(defaultWindow.start)
  const maxDate = addDays(isoToDate(defaultWindow.end), -1)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  return (
    <section className="filters" aria-label="Filters">
      <div className="field">
        <span className="field-label">Delivery days</span>
        <div className="field-row">
          <div className="segmented" role="group" aria-label="Date presets">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={p.from === fromDate && p.to === toDate}
                title={`${fmtDay(dateToIso(p.from))} – ${fmtDay(dateToIso(addDays(p.to, -1)))}`}
                onClick={() => set({ from: dateToIso(p.from), to: dateToIso(p.to) })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            className="input"
            type="date"
            aria-label="First delivery day"
            value={fromDate}
            min={minDate}
            max={lastDay}
            onChange={(e) => e.target.value && set({ from: dateToIso(e.target.value) })}
          />
          <span className="hint">to</span>
          <input
            className="input"
            type="date"
            aria-label="Last delivery day"
            value={lastDay}
            min={fromDate}
            max={maxDate}
            onChange={(e) =>
              e.target.value && set({ to: dateToIso(addDays(e.target.value, 1)) })
            }
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label">Forecast used</span>
        <div className="segmented" role="group" aria-label="Forecast selection">
          {(
            [
              ['dayahead', 'Day-ahead (11:00 D‑1)'],
              ['horizon', 'Fixed lead time'],
            ] as [SelectionMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={filters.mode === mode}
              onClick={() => set({ mode })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filters.mode === 'horizon' && (
        <div className="field">
          <label className="field-label" htmlFor="horizon">
            Published at least
          </label>
          <div className="field-row">
            <input
              id="horizon"
              className="slider"
              type="range"
              min={0}
              max={SLIDER_MAX_H}
              step={1}
              value={filters.horizonH}
              onChange={(e) => set({ horizonH: Number(e.target.value) })}
            />
            <span className="slider-value">{filters.horizonH} h</span>
            <span className="hint">before the hour</span>
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="basis">
          Actual compared as
        </label>
        <select
          id="basis"
          className="select"
          value={filters.basis}
          onChange={(e) => set({ basis: e.target.value as ActualBasis })}
        >
          <option value="point">Half-hour on the hour</option>
          <option value="hour_mean">Hourly average</option>
        </select>
      </div>
    </section>
  )
}
