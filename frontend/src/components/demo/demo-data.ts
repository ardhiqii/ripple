import { createElement, type ReactNode } from 'react'

export type DemoMode = 'live' | 'recorded'
export type DemoScenarioId = 'A-12-base' | 'A-12-constrained' | 'D-07-disruption'
export type DemoScenarioState = 'seeded' | 'modified'

export interface DemoScenario {
  id: DemoScenarioId
  title: string
  eyebrow: string
  summary: string
  learningGoal: string
  message: string
  expectedPath: readonly string[]
  resetImpact: string
  startPath: string
  pairRole?: 'baseline' | 'constrained'
}

export const demoScenarioFixtures: readonly DemoScenario[] = [
  {
    id: 'A-12-base',
    title: 'A-12 base request',
    eyebrow: 'Core scenario',
    summary: 'Move the A-12 test window while protecting the barge handoff.',
    learningGoal: 'See how a clean operational request becomes an evidence-backed plan.',
    message: 'Move the A-12 test window to D+5 after the vendor confirmation.',
    expectedPath: ['Extract the request', 'Check readiness and policy', 'Review feasible schedule options', 'Approve only after acknowledgement'],
    resetImpact: 'Prototype schedule, readiness, events, plans, and decisions return to the A-12 seed state.',
    startPath: '/changes',
    pairRole: 'baseline',
  },
  {
    id: 'A-12-constrained',
    title: 'A-12 constrained pair',
    eyebrow: 'Comparison scenario',
    summary: 'Add the test-bay sentence and compare the resulting lever path.',
    learningGoal: 'Understand which constraint changes extraction, solver attempts, and recommendation.',
    message: 'Move A-12 to D+5, but the test bay is not ready until D+7.',
    expectedPath: ['Extract the added constraint', 'Rule out unsafe levers', 'Compare solver verdicts', 'Inspect the changed recommendation'],
    resetImpact: 'The comparison uses the same A-12 seed data with the constrained request layered on top.',
    startPath: '/decisions/202',
    pairRole: 'constrained',
  },
  {
    id: 'D-07-disruption',
    title: 'D-07 disruption',
    eyebrow: 'Disruption scenario',
    summary: 'Review a weather-window disruption and its constrained recovery path.',
    learningGoal: 'Trace how a disruption becomes a reviewable plan without silently changing the schedule.',
    message: 'The D-07 weather window may close on D+6; protect the cargo transfer sequence.',
    expectedPath: ['Classify the disruption', 'Check affected readiness items', 'Review recovery options', 'Keep schedule writes behind approval'],
    resetImpact: 'Prototype schedule, readiness, events, plans, and decisions return to the D-07 seed state.',
    startPath: '/changes',
  },
] as const

export interface DemoRecordedStatus {
  state: 'ready' | 'running' | 'complete' | 'failed'
  label: string
  detail: string
  runId?: string
}

export interface DemoResetResult {
  ok: boolean
  scenarioId?: string
  seedVersion?: string
  message?: string
  healthDetail?: string
}

export interface DemoComparisonSide {
  scenarioId: DemoScenarioId
  label: string
  request: string
}

export interface DemoComparisonSlotProps {
  side: 'baseline' | 'constrained'
  scenario: DemoComparisonSide
}

export interface DemoComparisonSlots {
  eventContext: (props: DemoComparisonSlotProps) => ReactNode
  planReview: (props: DemoComparisonSlotProps) => ReactNode
  runTrace: (props: DemoComparisonSlotProps) => ReactNode
}

export type DemoDifferenceKind = 'extraction' | 'lever-set' | 'solver' | 'verdict' | 'recommendation'

export interface DemoComparisonDifference {
  id: string
  kind: DemoDifferenceKind
  label: string
  baseline: string
  constrained: string
}

export interface DemoPairComparisonProps {
  baseline: DemoComparisonSide
  constrained: DemoComparisonSide
  differences: readonly DemoComparisonDifference[]
  slots: DemoComparisonSlots
  onClose?: () => void
}

export const a12ComparisonFixtures: DemoPairComparisonProps = {
  baseline: { scenarioId: 'A-12-base', label: 'Baseline request', request: 'Move the A-12 test window to D+5 after vendor confirmation.' },
  constrained: { scenarioId: 'A-12-constrained', label: 'Constrained request', request: 'Move A-12 to D+5, but the test bay is not ready until D+7.' },
  differences: [
    { id: 'extraction', kind: 'extraction', label: 'Extraction', baseline: 'Move A-12 to D+5', constrained: 'Move A-12 to D+5; test bay ready D+7' },
    { id: 'lever-set', kind: 'lever-set', label: 'Available lever set', baseline: 'Move test window', constrained: 'Hold until readiness clears' },
    { id: 'solver', kind: 'solver', label: 'Solver attempts', baseline: '3 feasible candidates', constrained: '2 candidates ruled out' },
    { id: 'verdict', kind: 'verdict', label: 'Verdict', baseline: 'Feasible', constrained: 'Conditionally feasible' },
    { id: 'recommendation', kind: 'recommendation', label: 'Recommendation', baseline: 'Move to D+5', constrained: 'Hold until D+7' },
  ],
  slots: {
    eventContext: ({ scenario }) => createElement('div', { className: 'grid gap-1 text-xs' }, createElement('strong', { className: 'text-ink' }, scenario.label), createElement('span', { className: 'text-muted' }, scenario.request)),
    planReview: ({ side }) => createElement('div', { className: 'text-xs text-muted' }, side === 'baseline' ? 'A-12 option set is ready for review.' : 'Readiness condition is visible before approval.'),
    runTrace: ({ side }) => createElement('div', { className: 'text-xs text-muted' }, `Recorded ${side} trace is available for inspection.`),
  },
}
