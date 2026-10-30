// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * サーバー側で生成した JSON を HTML の data 属性へ埋め込むためのシリアライザ。
 *
 * Hono JSX は属性値をエスケープするが、将来の変更や別コンテキストへの流用に備えて
 * `</script>` や HTML 特殊文字になり得る文字を Unicode エスケープしておく。
 * JSON.parse() は `\u003c` 等を正しく復元できる。
 */
export function serializeForHtmlAttribute(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
