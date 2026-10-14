// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DemoLab } from '@/components/demo/demo-lab'
import {
  a12ComparisonFixture,
  a12ScenarioFixtures,
  DEMO_SCENARIO_IDS,
} from '@/features/demo/demo-data'
import { recordedDemoFixtures } from '@/features/demo/demo-recorded'

afterEach(() => cleanup())

const constrainedScenario = a12ScenarioFixtures[DEMO_SCENARIO_IDS.constrained]
const constrainedRecording = recordedDemoFixtures[DEMO_SCENARIO_IDS.constrained]
const scenarios = Object.values(a12ScenarioFixtures)

function renderConstrainedPair() {
  return render(
    <DemoLab
      scenarios={scenarios}
      selectedScenarioId={DEMO_SCENARIO_IDS.constrained}
      mode="recorded"
      comparison={a12ComparisonFixture}
      recordedFixture={constrainedRecording}
      onSelectScenario={vi.fn()}
      onRunScenario={vi.fn()}
      onRunRecorded={vi.fn()}
      onComparePair={vi.fn()}
      onReset={vi.fn()}
    />,
  )
}

describe('INT-04 A-12 constrained recorded pair', () => {
  it('keeps the vendor sentence visible and attributes the ruled-out lever to it', () => {
    const vendorSentence = 'FYI the vendor says the test bay is full until Thursday.'

    expect(constrainedScenario.message).toContain(vendorSentence)
    expect(constrainedScenario.preview.expectedPath).toContain(
      'Rule out expedite_vendor_test from the available lever set.',
    )
    expect(constrainedRecording.modelOutput).toMatchObject({
      levers_ruled_out: [{ lever: 'expedite_vendor_test', target: 'A-12 test bay' }],
    })

    renderConstrainedPair()
    expect(screen.getByText(constrainedScenario.message)).toBeVisible()
    expect(screen.getByRole('region', { name: 'Recorded public trace' })).toHaveTextContent(
      'The constrained vendor sentence ruled out expedite_vendor_test.',
    )
  })

  it('records that the constrained trace found no earlier feasible option', () => {
    const summaries = constrainedRecording.events.map((event) => {
      const publicPayload = event.public
      return typeof publicPayload === 'object' && publicPayload !== null && !Array.isArray(publicPayload)
        ? (publicPayload as { summary?: unknown }).summary
        : undefined
    })

    expect(summaries).toContain('No earlier feasible recovery option is available.')
    expect(a12ComparisonFixture.constrained.solver.outcome).toBe(
      'No earlier feasible path exists without moving the fixed B-05 job.',
    )
    expect(a12ComparisonFixture.constrained.recommendation).toBe(
      'Keep A-12 at D+9; the faster path would violate the B-05 lock.',
    )
  })

  it('names extraction, lever-set, solver, verdict, and recommendation differences', async () => {
    const user = userEvent.setup()
    renderConstrainedPair()

    await user.click(screen.getByRole('button', { name: 'Compare A-12 pair' }))

    const dialog = screen.getByRole('dialog')
    expect(a12ComparisonFixture.diffs.every((diff) => diff.changed)).toBe(true)
    expect(a12ComparisonFixture.diffs.map((diff) => diff.label)).toEqual([
      'Extraction',
      'Available lever set',
      'Ruled-out levers',
      'Solver attempts',
      'Solver outcome',
      'Verdict',
      'Recommendation',
    ])
    for (const label of a12ComparisonFixture.diffs.map((diff) => diff.label)) {
      expect(dialog).toHaveTextContent(label)
    }
    expect(dialog).toHaveTextContent('expedite_vendor_test')
    expect(dialog).toHaveTextContent('No earlier feasible path exists')
    expect(dialog).toHaveTextContent('D+9')
  })
})
