// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { eventInboxFixture } from '@/features/events/events-data'
import { NewChangeSheet } from './new-change-sheet'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const baseProps = {
  onOpenChange: vi.fn(),
  onDirtyChange: vi.fn(),
  onCreated: vi.fn(),
  onCorrectionSaved: vi.fn(),
  onStartInvestigation: vi.fn(async () => undefined),
}

describe('NewChangeSheet', () => {
  it('protects a non-empty pasted draft and does not render file upload', async () => {
    const user = userEvent.setup()
    render(<NewChangeSheet {...baseProps} open />)

    expect(screen.getByRole('textbox', { name: 'Pasted message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await user.type(screen.getByRole('textbox', { name: 'Pasted message' }), 'Weather window changed for D-07.')
    await waitFor(() => expect(baseProps.onDirtyChange).toHaveBeenLastCalledWith(true))
  })

  it('keeps failed extraction out of investigation and plan review', () => {
    const failed = eventInboxFixture.find((item) => item.lifecycle === 'failed')
    expect(failed).toBeDefined()
    render(<NewChangeSheet {...baseProps} open initialEvent={failed} />)

    expect(screen.getByText(/cannot enter plan review/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start investigation' })).not.toBeInTheDocument()
  })

  it('keeps submission failure visible with the pasted draft intact', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'database_unavailable', message: 'database unavailable' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    render(<NewChangeSheet {...baseProps} open />)

    const input = screen.getByRole('textbox', { name: 'Pasted message' })
    await user.type(input, 'Weather window changed for D-07.')
    await user.click(screen.getByRole('button', { name: 'Create and read change' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/change could not be submitted/i)
    expect(input).toHaveValue('Weather window changed for D-07.')
  })

  it('names the draft discard alert and its destructive action explicitly', async () => {
    const user = userEvent.setup()
    render(<NewChangeSheet {...baseProps} open />)

    await user.type(screen.getByRole('textbox', { name: 'Pasted message' }), 'Weather window changed for D-07.')
    await user.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)

    expect(screen.getByRole('alertdialog', { name: 'Keep this draft?' })).toHaveAccessibleDescription('The pasted message has not been submitted.')
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument()
  })
})
