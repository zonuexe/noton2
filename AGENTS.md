# AGENTS.md

noton2 の開発方針および実装時の注意事項。

## テキスト入力（IME / 日本語入力）と状態バインディングのガイドライン

Vue Vapor mode や JSX において、日本語 IME 入力（未確定文字列・変換中）が中断・リセットされる問題を防ぐための設計指針です。

### 1. 手動の `value` + `onInput` を避け、`v-model` を使用する
- **理由**: Vue Vapor の `v-model` は内部（`vModelTextInit` / `vModelTextUpdate`）で `compositionstart` / `compositionend` イベントおよび `target.composing` フラグを監視しており、IME 変換中の親・状態更新スキップを自動的かつネイティブに行います。
- **ルール**: `<input>` や `<textarea>` の双方向バインディングには、手動の `value={val.value}` + `onInput={(e) => val.value = e.target.value}` ではなく、常に `v-model={val.value}` を使用してください。手動の debounce や独自の IME イベントハンドラを独自実装する必要はありません。

### 2. 動的リスト内の入力欄は子コンポーネントへ分離する
- **理由**: リスト要素（例: `selectedDates.value.map(...)`）の内部に直接 `<input>` を配置し、その入力によって親の配列やオブジェクト状態を更新すると、親のレンダリングエフェクトが再評価され、リスト内の `<input>` DOM ノードそのものが再生成されて OS の IME 変換バッファが強制破棄されます。
- **ルール**:
  - リスト項目ごとに入力欄を持つ場合は、行単位を独立した Vapor コンポーネント（`defineVaporComponent`）に切り出してください。
  - 親から各項目に一意な `key` を付与してレンダリングし、子コンポーネント内では `computed`（getter/setter）を用いて `v-model` を `emit('update:xxx')` に接続します。
  - これにより親の状態が更新されても入力中の `<input>` DOM ノードが保持され、IME 変換が中断されません。

### 3. 親コンポーネントの派生状態は `watch` や `computed` で整合性を保つ
- 入力値の変更に伴って親側の別状態（例: スロット配列 `slots`）の同期が必要な場合は、入力ハンドラで命令的に再生成するのではなく、`watch` や `computed` でリアクティブに追従させ、UI レンダリングと状態ロジックを分離してください。
