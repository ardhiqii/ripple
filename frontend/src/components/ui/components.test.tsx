// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Badge, Button, Dialog, DialogContent, DialogTitle, DialogTrigger, Input, Label, Sheet, SheetContent, SheetTitle, SheetTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Toaster, toast } from './index'

afterEach(() => toast.dismiss())

describe('customized control primitives', () => {
  it('covers primary, secondary, destructive, disabled, focus, and loading button states', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Button variant="primary">Run checks</Button>
        <Button variant="secondary">Review</Button>
        <Button variant="destructive">Remove</Button>
        <Button disabled>Unavailable</Button>
        <Button loading>Saving</Button>
      </div>,
    )

    expect(screen.getByRole('button', { name: 'Run checks' })).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'Review' })).toHaveClass('bg-surface')
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('bg-danger')
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true')

    await user.tab()
    expect(screen.getByRole('button', { name: 'Run checks' })).toHaveFocus()
  })

  it('associates labels and exposes invalid field state', () => {
    render(
      <div>
        <Label htmlFor="well-name">Well name</Label>
        <Input id="well-name" aria-invalid="true" />
        <Textarea aria-label="Notes" />
        <Badge variant="warning">Needs review</Badge>
      </div>,
    )

    expect(screen.getByLabelText('Well name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toHaveClass('bg-warning-subtle')
  })

  it('opens a modal dialog and switches tabs with keyboard-safe semantics', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Dialog>
          <DialogTrigger asChild><Button variant="primary">Open details</Button></DialogTrigger>
          <DialogContent>
            <DialogTitle>Details</DialogTitle>
            <p>Operational context</p>
          </DialogContent>
        </Dialog>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="checks">Checks</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview panel</TabsContent>
          <TabsContent value="checks">Checks panel</TabsContent>
        </Tabs>
      </>,
    )

    expect(screen.getByText('Overview panel')).toBeVisible()
    expect(screen.getByText('Checks panel')).not.toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Checks' }))
    expect(screen.getByText('Checks panel')).toBeVisible()
    expect(screen.getByText('Overview panel')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Open details' }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Details')
  })

  it('returns focus to dialog and sheet triggers after close', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Dialog>
          <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
          <DialogContent><DialogTitle>Dialog</DialogTitle><Button>Dialog action</Button></DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild><Button>Open sheet</Button></SheetTrigger>
          <SheetContent><SheetTitle>Sheet</SheetTitle><Button>Sheet action</Button></SheetContent>
        </Sheet>
      </>,
    )

    const dialogTrigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(dialogTrigger)
    await user.keyboard('{Escape}')
    expect(dialogTrigger).toHaveFocus()

    const sheetTrigger = screen.getByRole('button', { name: 'Open sheet' })
    await user.click(sheetTrigger)
    await user.keyboard('{Escape}')
    expect(sheetTrigger).toHaveFocus()
  })

  it('returns focus to controlled dialog invokers', async () => {
    const user = userEvent.setup()
    function ControlledDialog() {
      const [open, setOpen] = useState(false)
      return <>
        <Button onClick={() => setOpen(true)}>Open controlled dialog</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent><DialogTitle>Controlled dialog</DialogTitle></DialogContent>
        </Dialog>
      </>
    }

    render(<ControlledDialog />)
    const trigger = screen.getByRole('button', { name: 'Open controlled dialog' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('wraps keyboard focus inside an open dialog surface', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild><Button>Open focus dialog</Button></DialogTrigger>
        <DialogContent><DialogTitle>Focus dialog</DialogTitle><Button>First action</Button></DialogContent>
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: 'Open focus dialog' }))
    const action = screen.getByRole('button', { name: 'First action' })
    action.focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.tab()
    expect(action).toHaveFocus()
  })

  it('returns focus to a controlled alert-dialog invoker', async () => {
    const user = userEvent.setup()
    function ControlledAlertDialog() {
      const [open, setOpen] = useState(false)
      return <>
        <Button onClick={() => setOpen(true)}>Open alert dialog</Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent><AlertDialogTitle>Warning</AlertDialogTitle><AlertDialogDescription>Confirm the action.</AlertDialogDescription><AlertDialogCancel>Cancel</AlertDialogCancel></AlertDialogContent>
        </AlertDialog>
      </>
    }

    render(<ControlledAlertDialog />)
    const trigger = screen.getByRole('button', { name: 'Open alert dialog' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(trigger).toHaveFocus()
  })

  it('renders semantic toast feedback', () => {
    render(<Toaster />)
    act(() => { toast.success('Schedule saved', { duration: Infinity, description: 'Version 12 is ready.' }) })
    expect(screen.getByRole('status')).toHaveTextContent('Schedule saved')
    expect(screen.getByText('Version 12 is ready.')).toBeInTheDocument()
  })
})
