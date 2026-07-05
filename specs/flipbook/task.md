# Shaderbook Flipbook — タスクリスト

`specs/flipbook/spec.md` と `specs/flipbook/plan.md`（承認済み）に基づく実装タスク。
上から順に着手する。各タスクは TDD 前提で、先に対象テストを書き、完了条件（DoD）を満たしたらチェックを付ける。

---

## Phase 1: 型・正規化・UI 単体

- [x] **F1-1: Preview 型と Flipbook 正規化ロジック**（plan §3, §4, §13.1, §14 Phase 1 / spec §5, §6, §13）
  - 対象ファイル:
    - 実装: `src/types/preview.ts`, `src/flipbookSettings.ts`
    - テスト: `src/flipbookSettings.test.ts`
  - TDD:
    - default 値が `frameCount=16`, `frameIntervalMs=100`, `startTimeMs=0` である
    - `frameCount`: `''`, `abc`, `NaN`, `Infinity`, `-Infinity` は default `16`
    - `frameCount`: `1.9 -> 1`, `0 -> 1`, `65 -> 64`
    - `frameIntervalMs`: min `0`, max `60000`, default `100`, 小数切り捨て
    - `startTimeMs`: min `0`, max `3600000`, default `0`, 小数切り捨て
    - `normalizeFlipbookSettings` が全 field を integer として返す
  - DoD:
    - `PreviewMode`, `FlipbookSettings`, `initialPreviewMode`, `initialFlipbookSettings` が共有型として定義されている
    - App state に保存可能な値は spec §6.4 通り、正規化済み integer のみになる
    - 正規化ルールが blur / Enter / Run / mode 切替から共通利用できる関数に集約されている

- [x] **F1-2: PreviewModeControl コンポーネント**（plan §11.1, §13.7, §14 Phase 1 / spec §8.2, §19）
  - 対象ファイル:
    - 実装: `src/components/PreviewModeControl.tsx`
    - テスト: `src/components/PreviewModeControl.test.tsx`
  - TDD:
    - `aria-label="Preview mode"` を持つ
    - 初期選択が `Animation` で表現される
    - `Flipbook` クリックで `onChange('flipbook')` が呼ばれる
    - キーボード操作で選択を切り替えられる
  - DoD:
    - `Animation` / `Flipbook` の 2 択 segmented control として使える
    - 現在選択中の mode が視覚状態と `aria-pressed` または radio checked で判別できる
    - GPU / App / PreviewPane の副作用を持たない単体 UI として実装されている

- [x] **F1-3: FlipbookControls コンポーネント**（plan §11.2, §13.7, §14 Phase 1 / spec §6, §8.3, §19）
  - 対象ファイル:
    - 実装: `src/components/FlipbookControls.tsx`
    - テスト: `src/components/FlipbookControls.test.tsx`
  - TDD:
    - `Frames` / `Interval ms` / `Start ms` の 3 input が label / aria-label / min / max / step を持つ
    - draft 入力中は `onCommit` しない
    - blur で正規化済み settings と normalized draft を `onCommit` する
    - Enter で正規化済み settings と normalized draft を `onCommit` する
    - 不正値は default / clamp された表示に戻る
  - DoD:
    - `input type="number"` を使い、spec §6.1 の min / max / step が反映されている
    - `onCommit` へ渡る値は常に `FlipbookSettings` の正規化済み integer のみ
    - 正規化ロジックは `src/flipbookSettings.ts` を呼び、コンポーネント内に重複実装しない

- [x] **F1-4: FlipbookLabels コンポーネント**（plan §11.3, §13.7, §14 Phase 1 / spec §9.6, §19）
  - 対象ファイル:
    - 実装: `src/components/FlipbookLabels.tsx`
    - テスト: `src/components/FlipbookLabels.test.tsx`
  - TDD:
    - `grid === null` では label を表示しない
    - `grid.cells` の数だけ label を表示する
    - `#0 0.00s` 形式で表示する
    - device px を CSS px に変換し、左上から `+6px` する
    - overlay container が `aria-hidden="true"` を持つ
  - DoD:
    - label は HTML overlay として canvas 上に重なり、`pointer-events: none` で操作を阻害しない
    - ラベル位置は `cell.x / devicePixelRatio + 6`, `cell.y / devicePixelRatio + 6` で計算される
    - スクリーンリーダーで全フレームを過剰に読み上げない

---

## Phase 2: wrapper / uniform / pipeline の binding(1) 対応

- [x] **F2-1: shaderWrapper の viewport origin uniform 注入**（plan §5, §13.2, §14 Phase 2 / spec §10.5, §17）
  - 対象ファイル:
    - 実装: `src/gpu/shaderWrapper.ts`
    - テスト: `src/gpu/shaderWrapper.test.ts`
  - TDD:
    - 空コードで `Shader code is empty`
    - `mainImage` 欠落で `mainImage function not found`
    - default shader が生成 WGSL の先頭に残る
    - `@group(0) @binding(1)` と `wgslpg_viewport_origin` を含む
    - fragment が `mainImage(position.xy - wgslpg_viewport_origin)` を呼ぶ
  - DoD:
    - wrapper 所有 uniform として `@group(0) @binding(1) var<uniform> wgslpg_viewport_origin: vec2f;` が注入される
    - ユーザーコードの `struct Uniforms` / `@binding(0)` は注入せず、既存仕様を維持する
    - 通常アニメーションでも Flipbook でも `mainImage` に viewport ローカル座標が渡る
    - ユーザーが binding(1) を使った場合は通常の compile / pipeline エラーとして扱える構造になっている

- [x] **F2-2: uniform buffer helper の slot / stride 対応**（plan §6, §13.3, §14 Phase 2 / spec §10.3, §10.4, §16）
  - 対象ファイル:
    - 実装: `src/gpu/createUniformBuffer.ts`
    - テスト: `src/gpu/createUniformBuffer.test.ts`
    - 必要に応じて: `src/test/setup.ts`
  - TDD:
    - `createUniformBuffer` は既存通り size `16`
    - `updateUniforms` は既存 signature のまま offset `0` に `[time, 0, width, height]` を書く
    - `writeUserUniforms` は任意 offset に同じ 16 byte レイアウトを書ける
    - `createViewportOriginBuffer` は size `8`
    - `writeViewportOrigin` は任意 offset に `[x, y]` を書ける
    - `alignUniformStride(16, 256) === 256`, `alignUniformStride(8, 256) === 256`
  - DoD:
    - 既存 `updateUniforms(buffer, device, time, width, height)` の互換性が維持されている
    - binding(0) 用 16 byte user uniform と binding(1) 用 8 byte viewport origin が別 buffer / 別 helper で扱える
    - `alignUniformStride` が `minUniformBufferOffsetAlignment` に従う slot stride 計算に使える
    - `resolution` uniform は Flipbook セルの実描画サイズを書ける構造になっている

- [x] **F2-3: createShaderPipeline の 2 エントリ bind group 対応**（plan §7, §13.4, §14 Phase 2 / spec §10.3, §15.1）
  - 対象ファイル:
    - 実装: `src/gpu/createShaderPipeline.ts`
    - テスト: `src/gpu/createShaderPipeline.test.ts`
  - TDD:
    - 成功時に `viewportOriginBuffer` を受け取り、bind group entries が binding `0` / `1` の 2 件になる
    - compilation error では error scope を開かない
    - pipeline validation error を例外化する
    - bind group validation error を例外化する
    - `createBindGroup` throw 時も `pushErrorScope` / `popErrorScope` 数が一致する
  - DoD:
    - input 型に `viewportOriginBuffer` が追加されている
    - `createBindGroup` が `{ binding: 0, uniformBuffer }` と `{ binding: 1, viewportOriginBuffer }` の 2 entries を作る
    - 既存の shader module compilation check と validation error scope 回収手順が維持されている
    - 成功時のみ `{ pipeline, bindGroup }` を返し、失敗時は例外として PreviewPane に伝搬できる

---

## Phase 3: renderFlipbook

- [x] **F3-1: Flipbook grid / time 計算**（plan §9.1, §9.2, §13.5, §14 Phase 3 / spec §7, §9）
  - 対象ファイル:
    - 実装: `src/gpu/renderFlipbook.ts`
    - テスト: `src/gpu/renderFlipbook.test.ts`
  - TDD:
    - `frameCount` 1 / 2 / 4 / 9 / 16 / 20 / 64 の columns / rows
    - row-major の row / column / x / y
    - `gapDevicePx = round(8 * devicePixelRatio)`
    - `cellWidth` / `cellHeight` が floor 計算と一致し、最低 `1` に clamp される
    - `timeSeconds = (startTimeMs + i * frameIntervalMs) / 1000`
    - `frameIntervalMs = 0` で全 frame が同じ time
  - DoD:
    - `computeFlipbookGrid` が純粋関数として実装されている
    - `FlipbookGrid` / `FlipbookCell` が label overlay と GPU 描画で共有できる
    - グリッドは左上から右下への行優先で、列数は `ceil(sqrt(frameCount))`、行数は `ceil(frameCount / columns)`

- [x] **F3-2: Flipbook GPU resources / draw 実装**（plan §9.3, §9.4, §13.5, §14 Phase 3 / spec §10.2, §10.3, §15.2）
  - 対象ファイル:
    - 実装: `src/gpu/renderFlipbook.ts`
    - テスト: `src/gpu/renderFlipbook.test.ts`
    - 必要に応じて: `src/test/setup.ts`
  - TDD:
    - frameCount 分の user uniform / viewport origin slot を offset 付きで write する
    - bind group が frameCount 個作られ、各 binding が offset / size を持つ
    - render pass は 1 回、clear は黒
    - `setPipeline` は pass 内 1 回
    - `setViewport` / `setScissorRect` / `setBindGroup` / `draw` が frameCount 回、index 昇順で呼ばれる
    - `renderFlipbook` が `{ grid, resources }` を返し、resources に destroy 対象の `userUniformBuffer` / `viewportOriginBuffer` が含まれる
  - DoD:
    - binding(0) は 16 byte user uniform slot、binding(1) は 8 byte viewport origin slot を使う
    - `alignUniformStride` と `device.limits.minUniformBufferOffsetAlignment ?? 256` により offset alignment を守る
    - 各セルの `resolution` は canvas 全体ではなく `cellWidth` / `cellHeight`
    - 1 canvas + viewport/scissor 方式で frameCount 分を 1 command encoder / 1 render pass で描画する
    - 返却 resources は PreviewPane が次回 redraw / mode 切替 / unmount / device lost で destroy できる

---

## Phase 4: renderLoop / PreviewPane 統合

- [x] **F4-1: renderLoop の viewportOriginBuffer 型対応**（plan §8, §13.6, §14 Phase 4 / spec §11.1, §15.1）
  - 対象ファイル:
    - 実装: `src/gpu/renderLoop.ts`
    - テスト: `src/gpu/renderLoop.test.ts`
  - TDD:
    - pipeline null 時は render pass / submit をスキップし RAF 継続
    - pipeline 有りで既存 full-screen triangle 描画を維持する
    - `updateUniforms` は呼ぶが `writeViewportOrigin` は呼ばない
    - `stop()` 後は frame が進まない
    - FPS callback は既存通り finite value
  - DoD:
    - `RenderLoopGpuState` が `viewportOriginBuffer` を持つ
    - 通常アニメーションの binding(1) は PreviewPane 初期化時に `(0, 0)` を 1 回書く前提で、renderLoop は毎フレーム更新しない
    - 既存 animation mode の描画、FPS 計測、停止処理が退行していない

- [x] **F4-2: PreviewPane props / refs / UI 下地統合**（plan §10.1, §10.2, §10.6, §13.8, §14 Phase 4 / spec §8, §13.2, §18, §19）
  - 対象ファイル:
    - 実装: `src/components/PreviewPane.tsx`
    - テスト: `src/components/PreviewPane.test.tsx`
    - 関連実装: `src/components/PreviewModeControl.tsx`, `src/components/FlipbookControls.tsx`, `src/components/FlipbookLabels.tsx`
  - TDD:
    - WebGPU 非対応メッセージは既存通り
    - 初期 animation mode では renderLoop を開始し、Flipbook は描画しない
    - canvas `aria-label` が mode で切り替わる
    - Flipbook controls は Flipbook mode の時だけ表示される
  - DoD:
    - `PreviewPaneProps` に `previewMode`, `flipbook`, `onPreviewModeChange`, `onFlipbookChange` が追加されている
    - `GpuState` に `viewportOriginBuffer` が追加され、pipeline / bindGroup は常にペアで扱われる
    - `previewModeRef`, `flipbookRef`, `renderLoopRef`, `pendingFlipbookFrameRef`, `displayGenerationRef`, `latestGridRef`, `latestFlipbookResourcesRef`, `deviceLostRef` が役割通り導入されている
    - `flipbookDraft` は PreviewPane 内だけに保持し、App へは正規化済み settings のみ渡す
    - Preview ヘッダー内の順序が `Preview [Animation|Flipbook] [Flipbook inputs] [Fit] [Fullscreen]` になる

- [x] **F4-3: PreviewPane の mode 切替 / 6トリガー / coalescing**（plan §10.2, §10.3, §10.4, §13.8, §14 Phase 4 / spec §11.2, §18.1, §18.3）
  - 対象ファイル:
    - 実装: `src/components/PreviewPane.tsx`
    - テスト: `src/components/PreviewPane.test.tsx`
  - TDD:
    - `animation -> flipbook` で renderLoop stop、Flipbook 1 回描画
    - `flipbook -> animation` で pending Flipbook RAF cancel、resources destroy、renderLoop start
    - Flipbook settings 変更で redraw を 1 回 schedule
    - settings 変更と resize が同一 tick に来ても `renderFlipbook` は 1 回
    - resize 時、canvas size 更新後の最新 size で redraw
    - fullscreenchange 時に Flipbook redraw
  - DoD:
    - `scheduleFlipbookRender(reason)` が plan §10.2 の10手順を満たす
    - `displayGenerationRef` は mode 切替 / device lost / unmount で進み、schedule 時に capture、callback 時に compare される
    - pending RAF は coalesce され、同一 animation frame 内の多発 trigger が 1 redraw になる
    - spec §11.2 の6トリガー（mode 切替、settings 確定、Run成功、resize、fullscreenchange、初回描画）がテストで確認される
    - `animation -> flipbook` と Run 時は未確定 draft を正規化し、先に `flipbookRef.current = normalizedSettings` を同期更新してから App callback / redraw を進める

- [x] **F4-4: PreviewPane の compile / race / resource destroy 対応**（plan §10.5, §13.8, §15.3-§15.6, §14 Phase 4 / spec §12, §18.2, §18.4）
  - 対象ファイル:
    - 実装: `src/components/PreviewPane.tsx`
    - テスト: `src/components/PreviewPane.test.tsx`
  - TDD:
    - Flipbook mode の Run で未 blur の draft 入力を正規化してから compile する
    - compile 成功時、animation は pipeline 差し替えのみ、flipbook は redraw
    - compile 失敗時、pipeline と latest grid を維持し redraw しない
    - 古い compile promise が後から解決しても新しい pipeline / grid を上書きしない
    - device lost 後は loop stop、message 表示、compile / redraw 要求を無視する
    - StrictMode で初期 compile と loop / draw が二重化しない
  - DoD:
    - `compileSeqRef` と `lifecycleGenerationRef` の両方を状態更新・callback 直前に検査する
    - `createShaderPipeline` 呼び出しに `viewportOriginBuffer` を渡し、2 エントリ bind group を使う
    - 初期化後に `writeViewportOrigin(viewportOriginBuffer, device, 0, 0, 0)` を呼ぶ
    - compile 成功時のみ pipeline / bindGroup をペアで差し替える
    - compile 失敗時は直前の animation pipeline / Flipbook grid / canvas 表示を維持する
    - `latestFlipbookResourcesRef.current` は次回 redraw 前、`flipbook -> animation`、unmount、device lost cleanup で `destroy()` される
    - device lost 後は `deviceLostRef` により compile / redraw を無視し、cleanup 由来の `reason === 'destroyed'` では誤表示しない

---

## Phase 5: App / StatusBar 統合

- [x] **F5-1: App state と既存操作の Flipbook 統合**（plan §12, §13.9, §14 Phase 5 / spec §12, §13.1）
  - 対象ファイル:
    - 実装: `src/App.tsx`
    - テスト: `src/App.test.tsx`
  - TDD:
    - `PreviewPane` に `previewMode="animation"` と初期 `flipbook` が渡る
    - mode change callback で `previewMode` が更新される
    - Flipbook commit callback で正規化済み settings が渡る
    - Run / Ctrl+Enter で `shouldCompile` がエッジとして反転する
    - Reset は code のみ戻し、Flipbook settings は維持する
    - Save は code だけを保存する
    - `StatusBar` に `previewMode` が渡る
  - DoD:
    - `App` に `previewMode` / `flipbook` state が追加され、初期値は spec §13.1 と一致する
    - Run edge trigger、Reset、Save、Ctrl/Cmd+Enter、Ctrl/Cmd+S の既存挙動が維持される
    - Reset 押下だけでは Flipbook settings と表示を変更しない
    - Save 押下では Flipbook settings / 画像を保存せず WGSL コードだけを保存する

- [x] **F5-2: StatusBar の FPS Paused 表示**（plan §12, §13.9, §14 Phase 5 / spec §11.3, §13.3）
  - 対象ファイル:
    - 実装: `src/components/StatusBar.tsx`
    - テスト: `src/components/StatusBar.test.tsx`
  - TDD:
    - animation mode では `FPS: 60.0`
    - flipbook mode では `FPS: Paused`
    - Compile / Resolution / GPU / Backend / WGSL は既存通り表示される
  - DoD:
    - `StatusBarProps` に `previewMode` が追加されている
    - Flipbook mode では内部の旧 FPS 値に関係なく `Paused` と表示する
    - Compile status、Resolution、GPU 名、Backend、WGSL 表示が退行していない

- [x] **F5-3: Preview ツールバー / Flipbook 表示スタイル仕上げ**（plan §10.6, §14 Phase 5 / spec §8, §9.6, §19）
  - 対象ファイル:
    - 実装: `src/App.css`
    - テスト: `src/components/PreviewPane.test.tsx`, `src/components/FlipbookLabels.test.tsx`
  - TDD:
    - Preview ヘッダー内に mode control、Flipbook controls、Fit、Fullscreen が共存する
    - Flipbook controls は幅不足時に折り返せる構造になっている
    - label overlay が `pointer-events: none` / `aria-hidden="true"` を維持する
  - DoD:
    - Flipbook 操作 UI は Preview 領域のヘッダー内で、`Fit` / `Fullscreen` より左側に配置される
    - Flipbook mode の number inputs は横並びを基本とし、ヘッダー幅不足時に次行へ折り返す
    - Fullscreen は Preview 領域全体を対象にし、Flipbook grid 全体が拡大される既存動作を維持する
    - UI 要素やテキストが重なって読めない状態にならない

---

## Phase 6: 手動確認と仕上げ

- [x] **F6-1: 全自動テスト / tsc / build**（plan §14 Phase 6 / spec §23 自動テスト）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: 全テスト
  - 検証:
    - `npm run test`
    - `npx tsc --noEmit`
    - `npm run build`
  - DoD:
    - Flipbook パラメータ正規化、grid / time 計算、uniform 書き込み、viewport origin、StatusBar、PreviewPane mode stop/start の自動テストが通る
    - 既存テスト（`shaderWrapper`, `createShaderPipeline`, `renderLoop`, `PreviewPane`, `App`, `StatusBar` を含む）が binding(1) / Flipbook 仕様に更新済みで全て通る
    - TypeScript 型チェックと production build が成功する

- [ ] **F6-2: WebGPU ブラウザ手動確認**（plan §14 Phase 6 / spec §20, §22, §23 手動確認）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: なし（手動確認）
  - 検証:
    - 初期表示で通常アニメーションが動く
    - Flipbook へ切り替えるとグリッドが表示され、各セルが動かない
    - `frameCount = 1` / `2` / `16` / `64` でレイアウトが崩れない
    - `frameIntervalMs = 0` ですべて同じ時刻の画像になる
    - `startTimeMs` を変更すると全セルの時刻がずれる
    - Run 成功時に現在の Flipbook パラメータで再描画される
    - コンパイルエラー後に直前の成功 shader と直前の Flipbook 表示が維持される
    - Fullscreen 入退出でグリッドが再描画される
    - resize でセルサイズとラベル位置が追従する
    - WebGPU 非対応時に既存仕様の非対応メッセージが表示される
    - device lost 時に既存仕様の device lost メッセージが表示される
  - DoD:
    - spec §22 の MVP 完了条件をすべて満たす
    - spec §23 の手動確認項目をすべて確認済み
    - 初期 shader 基準で Flipbook 初回描画 / パラメータ変更後 / resize 後の再描画が 64 frame 以内で概ね 1 秒以内に収まる

---

## 依存関係

```text
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

- F1-1 は F1-3、F4-2、F5-1 の前提
- F1-2〜F1-4 は互いに独立して実装できるが、F4-2 の PreviewPane 統合には全て必要
- F2-1〜F2-3 は互いに独立してテスト先行で進められるが、F4-4 の compile 統合には全て必要
- F3-1 → F3-2 の順に実装する
- F4-1 は F2-2 / F2-3 完了後に着手する
- F4-2 は Phase 1 完了後、F4-3 / F4-4 は F3-2 と F4-1 完了後に着手する
- F5-1 / F5-2 / F5-3 は F4-2 以降に並行可能だが、最終確認は F4-3 / F4-4 完了後に行う
- F6-1 → F6-2 の順に行い、F6-2 は WebGPU 対応ブラウザで確認する

## 未決事項（実装中に判断が必要な点）

1. `spec §15.2` は `renderFlipbook(input): void` としているが、承認済み `plan §9.1` / `§15.7` は label 同期と GPU resource destroy のため `{ grid, resources }` を返す API を採用している。実装は plan 優先で進める。
2. ユーザー WGSL が `@group(0) @binding(1)` を使った場合の専用エラーメッセージは初期リリース対象外。通常の compile / pipeline error として表示する。
3. Flipbook resources の再利用は初期リリース対象外。毎 redraw 作成し、PreviewPane が前回 resources を確実に destroy する方針で進める。
