// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { RunRegistryProvider, useRunRegistry } from './run-registry'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

function RegistryProbe() {
  const { activeRuns, registerRun, updateRun } = useRunRegistry()
  return <div><output>{activeRuns.map((run) => `${run.runId}:${run.status}`).join(',')}</output><button type="button" onClick={() => registerRun({ runId: 'run-1', eventId: 'event-1', status: 'queued', startedAt: '2026-10-13T10:00:00Z' })}>Register</button><button type="button" onClick={() => updateRun('run-1', { status: 'streaming' })}>Stream</button></div>
}

describe('run registry', () => {
  it('keeps active-run discoverability while the UI navigates', async () => {
    const user = userEvent.setup()
    render(<RunRegistryProvider><RegistryProbe /></RunRegistryProvider>)

    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByRole('status')).toHaveTextContent('run-1:queued')
    await user.click(screen.getByRole('button', { name: 'Stream' }))
    expect(screen.getByRole('status')).toHaveTextContent('run-1:streaming')
  })
})
