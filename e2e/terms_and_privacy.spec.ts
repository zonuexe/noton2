// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { test, expect } from '@playwright/test'

test.describe('利用規約・プライバシーポリシー画面のE2Eテスト', () => {
  test('トップページから利用規約およびプライバシーポリシーに遷移できること', async ({ page }) => {
    // 1. トップページへアクセス
    await page.goto('/')
    await expect(page).toHaveTitle(/noton2/)

    // 2. フッターの「利用規約」リンクをクリック
    const termsLink = page.getByRole('link', { name: '利用規約', exact: true })
    await expect(termsLink).toBeVisible()
    await expect(termsLink).toHaveAttribute('rel', 'terms-of-service')
    await termsLink.click()

    // 3. 利用規約ページに遷移したことを確認
    await expect(page).toHaveURL(/\/terms/)
    await expect(page.getByRole('heading', { name: '利用規約', exact: true })).toBeVisible()

    // 定義語 dfn の存在確認
    const dfnTerms = page.locator('dfn', { hasText: '本規約' })
    await expect(dfnTerms).toBeVisible()
    const dfnOrganizer = page.locator('dfn', { hasText: '主催者' })
    await expect(dfnOrganizer).toBeVisible()
    const dfnParticipant = page.locator('dfn', { hasText: '参加者' })
    await expect(dfnParticipant).toBeVisible()

    // 4. フッターの「プライバシーポリシー」リンクをクリック
    const privacyLink = page.getByRole('link', { name: 'プライバシーポリシー', exact: true })
    await expect(privacyLink).toBeVisible()
    await expect(privacyLink).toHaveAttribute('rel', 'privacy-policy')
    await privacyLink.click()

    // 5. プライバシーポリシーページに遷移したことを確認
    await expect(page).toHaveURL(/\/privacy/)
    await expect(page.getByRole('heading', { name: 'プライバシーポリシー', exact: true })).toBeVisible()

    // 定義語 dfn の存在確認
    const dfnService = page.locator('dfn', { hasText: '本サービス' })
    await expect(dfnService).toBeVisible()
  })

  test('検索エンジン向けクロール制御・robots設定が正しく反映されていること', async ({ page, request }) => {
    // 1. /robots.txt が取得でき、許可・拒否ルールが設定されていること
    const robotsRes = await request.get('/robots.txt')
    expect(robotsRes.status()).toBe(200)
    const robotsText = await robotsRes.text()
    expect(robotsText).toContain('User-agent: *')
    expect(robotsText).toContain('Allow: /$')
    expect(robotsText).toContain('Allow: /terms')
    expect(robotsText).toContain('Allow: /privacy')
    expect(robotsText).toContain('Disallow: /')

    // 2. トップページ: index, follow
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')

    // 3. 利用規約: index, follow
    await page.goto('/terms')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')

    // 4. プライバシーポリシー: index, follow
    await page.goto('/privacy')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')

    // 5. 新規作成画面: noindex, nofollow
    await page.goto('/new')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  })
})
