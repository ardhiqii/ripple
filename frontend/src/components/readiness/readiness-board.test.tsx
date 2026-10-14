// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/components/ui'
import type { ReadinessUpdate } from '@/features/readiness/readiness-data'
import { ReadinessBoard } from './readiness-board'

afterEach(() => cleanup())

const renderBoard = (updateStatus?: ReadinessUpdate) => render(
  <>
    <ReadinessBoard search={{}} onSearchChange={vi.fn()} onOpenJob={vi.fn()} updateStatus={updateStatus} />
    <Toaster />
  </>,
)

describe('ReadinessBoard', () => {
  it('keeps source freshness, slack, and confidence as separate table signals', () => {
    renderBoard()

    expect(screen.getAllByText('0d')).toHaveLength(2)
    expect(screen.getByText('4h old')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('Proposed update')).toBeInTheDocument()
  })

  it('optimistically checks a readiness item and rolls back after a rejected mutation', async () => {
    const user = userEvent.setup()
    let rejectUpdate: (reason?: unknown) => void = () => undefined
    const updateStatus = vi.fn<ReadinessUpdate>(() => new Promise<void>((_, reject) => {
      rejectUpdate = reject
    }))

    renderBoard(updateStatus)
    const checkbox = screen.getByRole('checkbox', { name: 'Mark ready-a12-test ready' })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(updateStatus).toHaveBeenCalledWith('ready-a12-test', 'ready')

    rejectUpdate(new Error('version conflict'))
    await waitFor(() => expect(checkbox).not.toBeChecked())
    expect(screen.getByRole('alert')).toHaveTextContent('Readiness update rolled back')
  })
})
