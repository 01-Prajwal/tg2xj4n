import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import type { Filters } from '../api/types'

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

export const useByHour = (f: Filters | null) =>
  useQuery({
    queryKey: ['by-hour', f],
    queryFn: ({ signal }) => api.byHour(f!, signal),
    enabled: f !== null,
    ...STATIC,
  })

export const useByHorizon = (f: Filters | null, maxH: number) =>
  useQuery({
    queryKey: ['by-horizon', f?.from, f?.to, f?.basis, maxH],
    queryFn: ({ signal }) => api.byHorizon(f!, maxH, signal),
    enabled: f !== null,
    ...STATIC,
  })

export const useVintages = (target: string | null, basis: Filters['basis']) =>
  useQuery({
    queryKey: ['vintages', target, basis],
    queryFn: ({ signal }) => api.vintages(target!, basis, signal),
    enabled: target !== null,
    ...STATIC,
  })
