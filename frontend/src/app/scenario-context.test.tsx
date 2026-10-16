// @vitest-environment jsdom

import { QueryClient } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScenarioProvider, useScenario } from './scenario-context'

describe('ScenarioProvider', () => {
  it('defaults to A-12 and removes the prior scenario cache on a valid switch', () => {
    const client = new QueryClient()
    client.setQueryData(['scenario', 'A-12-base', 'schedule'], { scenario: 'A-12-base' })
    client.setQueryData(['scenario', 'fleet-scale', 'schedule'], { scenario: 'fleet-scale' })
    const view = renderHook(() => useScenario(), {
      wrapper: ({ children }) => <ScenarioProvider queryClient={client} availableScenarioIds={['A-12-base', 'fleet-scale']}>{children}</ScenarioProvider>,
    })

    expect(view.result.current.scenarioId).toBe('A-12-base')
    act(() => { expect(view.result.current.selectScenario('fleet-scale')).toBe(true) })
    expect(view.result.current.scenarioId).toBe('fleet-scale')
    expect(client.getQueryData(['scenario', 'A-12-base', 'schedule'])).toBeUndefined()
    expect(client.getQueryData(['scenario', 'fleet-scale', 'schedule'])).toBeUndefined()
  })

  it('surfaces blank and unknown scenarios without changing the active context', () => {
    const view = renderHook(() => useScenario(), {
      wrapper: ({ children }) => <ScenarioProvider>{children}</ScenarioProvider>,
    })

    act(() => { expect(view.result.current.selectScenario('')).toBe(false) })
    expect(view.result.current.error).toMatchObject({ status: 404, code: 'unknown_scenario' })
    expect(view.result.current.scenarioId).toBe('A-12-base')
    act(() => { expect(view.result.current.selectScenario('fleet-scale')).toBe(false) })
    expect(view.result.current.error).toMatchObject({ status: 404, code: 'unknown_scenario' })
  })
})
