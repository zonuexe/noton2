# AGENTS.md

noton2 の開発方針および実装時の注意事項。

## テキスト入力（IME / 日本語入力）と状態バインディングのガイドライン

Vue Vapor mode や JSX において、日本語 IME 入力（未確定文字列・変換中）が中断・リセットされる問題を防ぐための設計指針です。

### 1. 手動の `value` + `onInput` を避け、`v-model` を使用する
- **理由**: Vue Vapor の `v-model` は内部（`vModelTextInit` / `vModelTextUpdate`）で `compositionstart` / `compositionend` イベントおよび `target.composing` フラグを監視しており、IME 変換中の親・状態更新スキップを自動的かつネイティブに行います。
- **ルール**: `<input>` や `<textarea>` の双方向バインディングには、手動の `value={val.value}` + `onInput={(e) => val.value = e.target.value}` ではなく、常に `v-model={val.value}` を使用してください。手動の debounce や独自の IME イベントハンドラを独自実装する必要はありません。

### 2. 動的リスト内の入力欄は子コンポーネントへ分離し、`<VaporFor>` とインラインPropsを使用する
- **理由**:
  - JSX の `{list.value.map(...)}` は内部で `_setNodes` にコンパイルされ、配列に対する Keyed Reconciliation（差分再利用）を行いません。リアクティブ依存が変化するとリスト全体がアンマウント＆全再生成され、DOMノード・IME変換・フォーカスが失われます。
  - ループ内でローカル変数（例: `const range = dateRanges.value[key]`）を定義して展開すると、親のリスト全体のレンダリングエフェクトが `dateRanges.value` に依存してしまいます。その結果、子コンポーネントが文字入力時に emit して親の `dateRanges.value` を更新した瞬間にリスト全体が破棄・再生成されます。
- **ルール**:
  - リスト項目ごとに入力欄を持つ場合は、行単位を独立した Vapor コンポーネント（`defineVaporComponent`）に切り出してください。
  - ループレンダリングには `.map(...)` ではなく `<VaporFor in={list.value} getKey={...}>` を使用してください（`Vue.createFor` の Keyed 再利用機構が働き、項目の追加・削除時も既存ノードが破棄されません）。
  - 子コンポーネントに渡すリアクティブなプロパティは、ループ内部で事前展開せず、JSXの属性にインラインで直接記述してください（例: `title={dateRanges.value[dateStr]?.title || ''}`）。`@vue-jsx-vapor/compiler-rs` はJSX属性を個別の Getter（`() => ...`）としてコンパイルするため、親のループエフェクトに不要な依存を波及させず、子コンポーネント内の細粒度エフェクトのみを更新できます。
  - 子コンポーネント内では `computed`（getter/setter）を用いて `v-model` を `emit('update:xxx')` に接続してください。

### 3. 親コンポーネントの派生状態は `watch` や `computed` で整合性を保つ
- 入力値の変更に伴って親側の別状態（例: スロット配列 `slots`）の同期が必要な場合は、入力ハンドラで命令的に再生成するのではなく、`watch` や `computed` でリアクティブに追従させ、UI レンダリングと状態ロジックを分離してください。
