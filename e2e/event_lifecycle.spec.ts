// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { test, expect } from '@playwright/test'

test.describe('イベントライフサイクルと回答登録のE2Eテスト', () => {
  test('イベント作成から参加者回答、集計表への即時反映までの一連フローが正常に動作すること', async ({
    page,
  }) => {
    // 1. 開発用テストログインを行い、イベント作成画面 (/new) へアクセス
    await page.goto('/auth/dev-login?returnTo=/new')
    await expect(page).toHaveURL(/\/new/)

    // 2. 基本情報の入力
    const titleInput = page.getByPlaceholder(/プロジェクト定例MTG/)
    await titleInput.fill('E2E自動テスト定例MTG')

    const organizerInput = page.getByPlaceholder(/山田太郎、幹事/)
    await organizerInput.fill('主催者Dev')

    // 3. 初期状態で今日の日付が選択されているため、プリセットボタンで候補枠を一括追加
    const presetButton = page.getByRole('button', { name: /日中 \(10:00〜19:00\)/ })
    await expect(presetButton).toBeVisible()
    await presetButton.click()

    // 3-1. 日程名候補「前夜祭」ボタンをクリックして日程名を設定
    const zenyaButton = page.getByRole('button', { name: '前夜祭' })
    await expect(zenyaButton).toBeVisible()
    await zenyaButton.click()

    // 4. 作成ボタン（全9コマ追加されていること）をクリック
    const submitCreateButton = page.getByRole('button', { name: /日程調整表を作成する（全 9 コマ）/ })
    await expect(submitCreateButton).toBeEnabled()
    await submitCreateButton.click()

    // 6. 作成完了画面が表示されたことを確認
    await expect(page.getByRole('heading', { name: '日程調整表を作成しました！' })).toBeVisible()
    await expect(page.getByText('参加者に送るURL')).toBeVisible()

    // 「イベントページへ移動する」リンクをクリックしてイベント詳細へ
    const goToEventLink = page.getByRole('link', { name: 'イベントページへ移動する' })
    await expect(goToEventLink).toBeVisible()
    await goToEventLink.click()

    // 7. 生成されたイベント詳細画面 (/events/:id) へ遷移したことを確認
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+/)
    await expect(page.getByRole('heading', { name: 'E2E自動テスト定例MTG' })).toBeVisible()
    await expect(page.getByText('主催者Dev')).toBeVisible()

    // 「みんなの予定」集計表の初期表示を確認
    await expect(page.getByText('みんなの予定')).toBeVisible()

    // 集計表および回答フォームに日程名「前夜祭」が表示されていることを検証
    await expect(page.getByText('前夜祭').first()).toBeVisible()

    // 7. 回答フォームへスクロール & 参加者名入力
    const answerForm = page.locator('#answer-form-section')
    await expect(answerForm).toBeVisible()

    const nameInput = answerForm.getByPlaceholder(/たなか、田中/)
    await nameInput.fill('参加者アリス')

    const commentInput = answerForm.getByPlaceholder(/10分ほど遅れるかもしれません/)
    await commentInput.fill('よろしくお願いします！')

    // 8. タイムラインのセル操作（順次切替 & 一括操作）
    // 「全枠一括: すべて◯」ボタンをクリック
    const setAllOkButton = answerForm.getByRole('button', { name: 'すべて◯' })
    await setAllOkButton.click()

    // 最初のスロットセルをクリックして ◯ -> △ にトグル切替されることを確認
    const firstCell = answerForm.locator('[data-slot-id]').first()
    await expect(firstCell).toBeVisible()
    // 初期状態は ◯ (•)
    await expect(firstCell).toHaveText('•')

    // クリックで △ (▲) に変化
    await firstCell.click()
    await expect(firstCell).toHaveText('▲')

    // もう一度クリックで ✕ (×) に変化
    await firstCell.click()
    await expect(firstCell).toHaveText('×')

    // 9. 「予定を登録する」ボタンをクリックして送信
    const submitResponseButton = answerForm.getByRole('button', { name: /予定を登録する/ })
    await submitResponseButton.click()

    // 10. 送信完了後、フォームが「回答を編集する」状態に切り替わることを確認
    await expect(answerForm.getByRole('heading', { name: /回答を編集する/ })).toBeVisible()

    // 11. 「みんなの予定」集計表に「参加者アリス」が反映されていることを検証
    await expect(page.getByRole('button', { name: '参加者アリス' }).first()).toBeVisible()

    // コメント一覧に反映されていることを確認
    await expect(page.getByText('よろしくお願いします！')).toBeVisible()

    // 12. 主催者による「日程確定」機能の動作確認
    const confirmMenuButton = page.getByRole('button', { name: /日程を確定する/ })
    await expect(confirmMenuButton).toBeVisible()
    await confirmMenuButton.click()

    // 最初の候補枠を「この日時に決定する」で確定
    const decideSlotButton = page.getByRole('button', { name: /この日時に決定する/ }).first()
    await expect(decideSlotButton).toBeVisible()

    // window.alert を自動承諾
    page.once('dialog', (dialog) => dialog.accept())
    await decideSlotButton.click()

    // 確定バナーが表示されることを確認
    await expect(page.getByText('開催日時が決定しました！')).toBeVisible()
    await expect(page.getByText('🎉 開催決定')).toBeVisible()
  })
})
