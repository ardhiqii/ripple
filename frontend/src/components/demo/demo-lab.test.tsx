// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { a12ComparisonFixture, a12ScenarioFixtures } from '@/features/demo/demo-data'
import { recordedDemoFixtures } from '@/features/demo/demo-recorded'
import { DemoLab } from './demo-lab'

afterEach(() => cleanup())

const scenarios = Object.values(a12ScenarioFixtures)

function renderLab(overrides: Partial<ComponentProps<typeof DemoLab>> = {}) {
  return render(<DemoLab scenarios={scenarios} selectedScenarioId="A-12-base" mode="recorded" comparison={a12ComparisonFixture} onSelectScenario={vi.fn()} onRunScenario={vi.fn()} onRunRecorded={vi.fn()} onComparePair={vi.fn()} onReset={vi.fn()} {...overrides} />)
}

describe('DemoLab', () => {
  it('runs scenarios and recorded paths without a text composer', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    const onRecorded = vi.fn()
    renderLab({ onRunScenario: onRun, onRunRecorded: onRecorded })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Run scenario' })[0]!)
    await user.click(screen.getAllByRole('button', { name: 'Run recorded' })[0]!)
    expect(onRun).toHaveBeenCalledWith('A-12-base')
    expect(onRecorded).toHaveBeenCalledWith('A-12-base')
  })

  it('requires explicit reset confirmation and locks while pending', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    const view = renderLab({ onReset, resetPending: true })
    await user.click(screen.getByRole('button', { name: 'Reset all demo data' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    view.rerender(<DemoLab scenarios={scenarios} selectedScenarioId="A-12-base" mode="recorded" comparison={a12ComparisonFixture} onSelectScenario={vi.fn()} onRunScenario={vi.fn()} onRunRecorded={vi.fn()} onComparePair={vi.fn()} onReset={onReset} />)
    await user.click(screen.getByRole('button', { name: 'Reset all demo data' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Reset all demo data?')
    await user.click(screen.getByRole('button', { name: 'Keep current state' }))
    expect(onReset).not.toHaveBeenCalled()
  })

  it('renders recorded public events and explicit pair differences', async () => {
    const user = userEvent.setup()
    const onCompare = vi.fn()
    renderLab({ recordedFixture: recordedDemoFixtures['A-12-base'], onComparePair: onCompare })
    expect(screen.getByRole('region', { name: 'Recorded public trace' })).toHaveTextContent('Recorded A-12 base run started.')
    await user.click(screen.getByRole('button', { name: 'Compare A-12 pair' }))
    expect(onCompare).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toHaveTextContent('Changed')
    expect(screen.getByRole('dialog')).toHaveTextContent('expedite_vendor_test')
  })
})
