// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RunRegistryProvider } from '@/features/agent/run-registry'
import { RipplePanel, type RippleContext } from './ripple-panel'

afterEach(() => cleanup())

const context: RippleContext = { route: '/timeline', jobIds: ['A-12', 'D-07'], resourceIds: ['barge-01'], scheduleVersion: 4 }

function renderPanel(props: Partial<React.ComponentProps<typeof RipplePanel>> = {}) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}><RunRegistryProvider><RipplePanel open mode="submit" context={context} onOpenChange={vi.fn()} {...props} /></RunRegistryProvider></QueryClientProvider>)
}

describe('RipplePanel', () => {
  it('keeps mode and context visible, and removes context from the submit payload', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)
    renderPanel({ onSubmit })

    expect(screen.getByRole('heading', { name: 'Submit change' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Submit change' }).find((button) => button.getAttribute('aria-pressed') === 'true')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Job A-12')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Job A-12 context' }))
    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(onSubmit).toHaveBeenCalledWith({ rawText: 'Protect the test window.', context: expect.objectContaining({ jobIds: ['D-07'], resourceIds: ['barge-01'] }) })
  })

  it('keeps Ask mode read-only and does not abort when closed', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    renderPanel({ mode: 'ask', onOpenChange })

    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Why is A-12 at risk?')
    await user.click(screen.getByRole('button', { name: 'Ask Ripple' }))
    expect(screen.getByRole('status')).toHaveTextContent(/read-only answer mode/i)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(abort).not.toHaveBeenCalled()
    abort.mockRestore()
  })

  it('keeps submit failures visible and announces the loading phase', async () => {
    const user = userEvent.setup()
    let resolveSubmit!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
    const view = renderPanel({ onSubmit })

    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(screen.getByRole('status')).toHaveTextContent(/starting change investigation/i)
    expect(screen.getByRole('button', { name: 'Starting...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Starting...' })).toHaveAttribute('aria-busy', 'true')
    resolveSubmit()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

    const failedSubmit = vi.fn(async () => { throw new Error('Network unavailable.') })
    view.rerender(<QueryClientProvider client={new QueryClient()}><RunRegistryProvider><RipplePanel open mode="submit" context={context} onOpenChange={vi.fn()} onSubmit={failedSubmit} /></RunRegistryProvider></QueryClientProvider>)
    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Try again.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/network unavailable/i)
  })
})
