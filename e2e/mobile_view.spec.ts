// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { test, expect } from '@playwright/test'

test.describe('スマートフォン（モバイルビューポート）のE2Eテスト', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 13 相当

  test('モバイル画面でもイベント作成とタイムライン表示が崩れず操作できること', async ({ page }) => {
    // 1. モバイルで開発用ログイン
    await page.goto('/auth/dev-login?returnTo=/new')
    await expect(page).toHaveURL(/\/new/)

    // 2. モバイルでの入力
    await page.getByPlaceholder(/プロジェクト定例MTG/).fill('モバイル表示確認イベント')
    await page.getByPlaceholder(/山田太郎、幹事/).fill('モバイル主催者')

    // 3. カレンダーから日付を選択
    const dateButtons = page.locator('button:has-text("10"), button:has-text("15"), button:has-text("20")')
    await dateButtons.first().click()

    // 4. プリセット追加
    await page.getByRole('button', { name: /日中 \(10:00〜19:00\)/ }).click()

    // 5. 作成ボタンをクリック
    const submitButton = page.getByRole('button', { name: /日程調整表を作成する/ })
    await submitButton.click()

    // 6. 作成完了画面からイベント詳細へ
    const goToEventLink = page.getByRole('link', { name: 'イベントページへ移動する' })
    await expect(goToEventLink).toBeVisible()
    await goToEventLink.click()

    // 7. イベント画面でタイムラインコンテナが横スクロール対応（overflow-x-auto）になっていることを検証
    const scrollContainer = page.locator('.overflow-x-auto').first()
    await expect(scrollContainer).toBeVisible()

    // 横スクロールの存在確認（スクロール幅がクライアント幅以上であること）
    const isScrollable = await scrollContainer.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(isScrollable).toBe(true)

    // 8. 回答フォームもモバイルで正常に表示され操作できること
    const answerForm = page.locator('#answer-form-section')
    await expect(answerForm).toBeVisible()
    await answerForm.getByPlaceholder(/たなか、田中/).fill('モバイルスズキ')

    // 予定を登録
    await answerForm.getByRole('button', { name: /予定を登録する/ }).click()

    // 登録完了の反映確認
    await expect(answerForm.getByRole('heading', { name: /回答を編集する/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'モバイルスズキ' }).first()).toBeVisible()
  })
})
