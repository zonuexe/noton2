import { test, expect } from '@playwright/test'

test('IME audit: date title input survives composition and parent updates', async ({ page }) => {
  page.on('console', (m) => m.type() === 'warning' && console.log('WARN', m.text()))
  await page.goto('/auth/dev-login?returnTo=/new')
  const input = page.getByPlaceholder(/例: DAY 0、前夜祭/)
  await expect(input).toBeVisible()
  await input.evaluate((el) => ((window as any).__orig = el))

  await input.focus()
  const cdp = await page.context().newCDPSession(page)
  for (const t of ['ぜ', 'ぜん', 'ぜんや', 'ぜんやさ', 'ぜんやさい']) {
    await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
  }
  console.log('during composition value:', await input.inputValue())
  console.log('same node during composition:', await input.evaluate((el) => el === (window as any).__orig))
  await cdp.send('Input.insertText', { text: '前夜祭' })
  console.log('after commit value:', await input.inputValue())
  expect(await input.evaluate((el) => el === (window as any).__orig)).toBe(true)
  expect(await input.evaluate((el) => document.activeElement === el)).toBe(true)
  console.log('badge:', await page.locator('[data-testid^="date-row-"] span.bg-rose-500').allTextContents())

  // Consecutive typing without manual refocusing
  for (const t of ['お', 'およ', 'および']) {
    await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
  }
  await cdp.send('Input.insertText', { text: 'および' })
  console.log('after consecutive commit value:', await input.inputValue())
  expect(await input.inputValue()).toBe('前夜祭および')

  // parent-side updates: change time range, then interval, then add another date
  await page.getByRole('button', { name: /午前 \(08:00〜12:00\)/ }).click()
  expect(await input.evaluate((el) => el === (window as any).__orig)).toBe(true)
  const startInput = page.getByLabel(/の開始時刻/).first()
  console.log('row start after preset:', await startInput.inputValue())
  console.log('row count text:', await page.locator('[data-testid^="date-row-"]').first().innerText())
  await page.getByRole('button', { name: '30分刻み' }).click()
  console.log('row count text after 30min:', await page.locator('[data-testid^="date-row-"]').first().innerText())
  expect(await input.inputValue()).toBe('前夜祭および')

  // Add another date from the calendar
  const otherDay = page.locator('.grid.grid-cols-7 button:not(.bg-rose-500)').first()
  await otherDay.click()
  const origRowInput = page.locator('[data-testid^="date-row-"]').last().locator('input[type="text"]')
  expect(await origRowInput.evaluate((el) => el === (window as any).__orig)).toBe(true)
  expect(await origRowInput.inputValue()).toBe('前夜祭および')
})
