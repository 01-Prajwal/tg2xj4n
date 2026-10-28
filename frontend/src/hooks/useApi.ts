import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import type { DecisionParams, Filters } from '../api/types'

// The data is a frozen snapshot, so responses never go stale.
const STATIC = { staleTime: Infinity, placeholderData: keepPreviousData } as const

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal), staleTime: Infinity })

export const useSeries = (f: Filters | null) =>
  useQuery({
    queryKey: ['series', f],
    queryFn: ({ signal }) => api.series(f!, signal),
    enabled: f !== null,
    ...STATIC,
  })

export const useMetrics = (f: Filters | null) =>
  useQuery({
    queryKey: ['metrics', f],
    queryFn: ({ signal }) => api.metrics(f!, signal),
    enabled: f !== null,
    ...STATIC,
  })

export const useDecision = (p: DecisionParams) =>
  useQuery({
    queryKey: ['decision', p],
    queryFn: ({ signal }) => api.decision(p, signal),
    ...STATIC,
  })

export const useBacktest = (p: Omit<DecisionParams, 'decisionTime'>, decisionHour: number) =>
  useQuery({
    queryKey: ['backtest', p.confidence, p.lookbackDays, p.basis, decisionHour],
    queryFn: ({ signal }) => api.backtest({ ...p, decisionHour }, signal),
    ...STATIC,
  })
