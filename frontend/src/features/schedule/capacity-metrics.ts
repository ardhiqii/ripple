import type { TimelineCapacityReport, TimelineRange, TimelineResource } from './types'

export interface CapacityMetric {
  label: string
  value: number | null
  display: string
  barPercent: number
  overflow: number
  eligiblePointCount: number
  units: readonly string[]
  scope: string
  visibleRange: string
  explanation: string
}

export interface CapacityMetrics {
  fleet: CapacityMetric
  groups: CapacityMetric[]
  resources: Array<{ resourceId: string; metric: CapacityMetric }>
}

export function calculateCapacityMetrics(
  resources: readonly TimelineResource[],
  reports: readonly TimelineCapacityReport[],
  range: TimelineRange,
  scopeLabel = 'all active resources',
): CapacityMetrics {
  const activeResources = resources.filter((resource) => resource.active !== false)
  const resourcePoints = activeResources.flatMap((resource) => pointsFor(resource, reports, range))
  const resourceMetrics = activeResources.map((resource) => ({
    resourceId: resource.id,
    metric: buildResourceMetric(resource.name, pointsFor(resource, reports, range), range),
  }))
  const groups = [...new Set(activeResources.map((resource) => resource.group))]
    .map((group) => buildGroupMetric(group, activeResources.filter((resource) => resource.group === group), reports, range))

  return {
    fleet: buildFleetMetric(resourcePoints, range, scopeLabel),
    groups,
    resources: resourceMetrics,
  }
}

function buildFleetMetric(points: CapacityPoint[], range: TimelineRange, scopeLabel: string) {
  const normalized = points.map((point) => point.capacity > 0 ? (point.used / point.capacity) * 100 : null).filter((value): value is number => value !== null)
  const value = normalized.length ? normalized.reduce((total, current) => total + current, 0) / normalized.length : null
  return metric('Average planned load across resources', value, points.reduce((total, point) => total + point.overflow, 0), points.length, ['mixed capacity units'], 'Average of eligible resource-day load percentages; unlike capacity units are not summed.', `${scopeLabel}; ${points.length ? 'normalized resource-days' : 'no eligible points'}`, range)
}

function buildGroupMetric(group: string, resources: readonly TimelineResource[], reports: readonly TimelineCapacityReport[], range: TimelineRange): CapacityMetric {
  const points = resources.flatMap((resource) => pointsFor(resource, reports, range))
  const units = [...new Set(points.map((point) => point.unit))]
  if (units.length > 1) {
    return metric(group, null, points.reduce((total, point) => total + point.overflow, 0), points.length, units, 'Mixed capacity units are not aggregated; split the group by unit for a physical ratio.', 'mixed capacity units', range)
  }
  const capacity = points.reduce((total, point) => total + point.capacity, 0)
  const used = points.reduce((total, point) => total + point.used, 0)
  const unit = units[0] ? [units[0]] : []
  return metric(group, capacity > 0 ? (used / capacity) * 100 : null, points.reduce((total, point) => total + point.overflow, 0), points.length, unit, unit.length ? `Planned load ratio for ${unit[0]} capacity points in the visible range.` : 'No capacity data for this range.', unit.length ? `${group}; unit ${unit[0]}` : group, range)
}

function buildResourceMetric(label: string, points: CapacityPoint[], range: TimelineRange): CapacityMetric {
  const capacity = points.reduce((total, point) => total + point.capacity, 0)
  const used = points.reduce((total, point) => total + point.used, 0)
  const units = [...new Set(points.map((point) => point.unit))]
  return metric(label, capacity > 0 ? (used / capacity) * 100 : null, points.reduce((total, point) => total + point.overflow, 0), points.length, units, units.length ? `Planned load ratio for ${units.join(', ')} capacity points in the visible range.` : 'No capacity data for this range.', `${label}; resource denominator`, range)
}

interface CapacityPoint {
  used: number
  capacity: number
  overflow: number
  unit: string
}

function pointsFor(resource: TimelineResource, reports: readonly TimelineCapacityReport[], range: TimelineRange): CapacityPoint[] {
  const report = reports.find((candidate) => candidate.resourceId === resource.id)
  return (report?.points ?? [])
    .filter((point) => point.day >= range.from && point.day <= range.to && point.capacity > 0)
    .map((point) => ({ used: point.used, capacity: point.capacity, overflow: point.overflow, unit: report?.unit ?? '' }))
}

function metric(label: string, value: number | null, overflow: number, eligiblePointCount: number, units: readonly string[], explanation: string, scope: string, range: TimelineRange): CapacityMetric {
  return {
    label,
    value,
    display: value === null ? '—' : `${formatPercent(value)}%`,
    barPercent: value === null ? 0 : Math.min(100, Math.max(0, value)),
    overflow,
    eligiblePointCount,
    units,
    scope,
    visibleRange: `D+${range.from}–D+${range.to}`,
    explanation: eligiblePointCount ? explanation : 'No capacity data for this range.',
  }
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}
