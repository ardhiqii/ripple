import { expect, type Page } from '@playwright/test'

export async function openLocalScenario(page: Page, path: string): Promise<void> {
  await openScenario(page, path, 'A-12-base', 'A-12 / Offshore demo')
}

export async function openScenario(page: Page, path: string, scenarioId: string, label: string): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${encodeURIComponent(scenarioId)}`)
  await expect(page.getByRole('link', { name: 'Ripple home' }).getByText(label)).toBeVisible()
}
