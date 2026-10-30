// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Context } from 'hono'

/** クライアントの入力不備として安全に返せる HTTP エラー */
export class RequestError extends Error {
  readonly status: 400 | 413 | 415 | 429

  constructor(message: string, status: 400 | 413 | 415 | 429 = 400) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

/** JSON リクエストボディの上限 (500 枠 + コメント等を十分に収容できるサイズ) */
const MAX_JSON_BODY_BYTES = 1_000_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * JSON ボディを安全に読み取る。
 * - Content-Type が application/json でない場合は 415
 * - ボディが大きすぎる場合は 413
 * - 壊れた JSON は 400
 */
export async function readJson(c: Context): Promise<unknown> {
  const contentType = c.req.header('content-type') || ''
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new RequestError('Content-Type は application/json を指定してください', 415)
  }

  const lengthHeader = c.req.header('content-length')
  const contentLength = lengthHeader ? Number(lengthHeader) : Number.NaN
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new RequestError('リクエストボディが大きすぎます', 413)
  }

  const text = await c.req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    throw new RequestError('リクエストボディが大きすぎます', 413)
  }
  if (!text.trim()) {
    throw new RequestError('リクエストボディが空です', 400)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new RequestError('JSON の形式が正しくありません', 400)
  }
}

/**
 * ボディが任意の DELETE 等で使用する。
 * ボディが存在しない場合は null を返し、存在する場合は通常の JSON 検証を行う。
 */
export async function readOptionalJson(c: Context): Promise<unknown | null> {
  // Content-Length / Transfer-Encoding はプロキシやテスト環境で付与されないことがあるため、
  // 実際のリクエストボディの有無で判定する。
  if (!c.req.raw.body) return null
  return readJson(c)
}
