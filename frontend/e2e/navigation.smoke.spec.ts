import { expect, test } from '@playwright/test'

import { openLocalScenario } from './helpers'

test('local scenario navigates Timeline to Readiness to Changes', async ({ page }) => {
  await openLocalScenario(page, '/timeline?from=0&to=14&groups=&vendors=')
  await expect(page.getByRole('heading', { name: 'Fleet Timeline' })).toBeVisible()

  await page.getByRole('link', { name: 'Readiness' }).click()
  await expect(page.getByRole('heading', { name: 'Readiness board' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Readiness board' })).toBeVisible()

  await page.getByRole('link', { name: 'Changes' }).click()
  await expect(page.getByRole('heading', { name: 'Change inbox' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Change inbox' })).toBeVisible()
})
