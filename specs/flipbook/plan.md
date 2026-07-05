# WGSL Shader Playground Flipbook — 実装計画書

対象: `specs/flipbook/spec.md` に基づく Flipbook 機能の実装計画。既存計画 `specs/plan.md` の方針を継承し、React state、WebGPU モジュール分割、`PreviewPane` の世代管理、エラースコープ回収、TDD を前提にする。

---

## 1. スコープ確認

`specs/flipbook/spec.md` §22 の MVP 完了条件を実装完了条件とする。初期リリースでは以下を実装しない。

* GIF / PNG / WebP / JPEG / 連番画像エクスポート
* フレーム単位のクリック拡大、コピー、保存
* 任意列数指定、ラベル表示切替、フレーム番号 uniform
* offscreen texture / offscreen canvas によるキャッシュ
* Flipbook 設定の URL 共有、localStorage 保存

仕様と矛盾する設計判断は行わない。追加する補助ファイルは、仕様 §14 のコンポーネント構成を壊さず、型・正規化ロジックを複数コンポーネントから安全に共有するための実装上の補助として扱う。

---

## 2. 変更対象ファイルと新規ファイル

### 2.1 変更対象ファイル

| ファイル | 変更内容 |
| --- | --- |
| `src/App.tsx` | `previewMode` / `flipbook` state 追加、`PreviewPane` / `StatusBar` への props 追加、Run edge trigger 維持 |
| `src/App.css` | Preview ヘッダー内の segmented control、Flipbook number inputs、label overlay、折り返しレイアウトのスタイル追加 |
| `src/components/PreviewPane.tsx` | mode / settings props 追加、renderLoop stop/start、Flipbook 再描画スケジューリング、`GpuState` に `viewportOriginBuffer` を追加 |
| `src/components/StatusBar.tsx` | `previewMode` prop 追加、Flipbook 時の `FPS: Paused` 表示 |
| `src/gpu/shaderWrapper.ts` | wrapper 所有 `@group(0) @binding(1)` uniform 注入、`mainImage(position.xy - origin)` へ変更 |
| `src/gpu/createShaderPipeline.ts` | binding(0) / binding(1) の 2 エントリ bind group 作成、input 型に `viewportOriginBuffer` 追加 |
| `src/gpu/createUniformBuffer.ts` | `writeUserUniforms`、`createViewportOriginBuffer`、`writeViewportOrigin`、stride 計算 helper 追加 |
| `src/gpu/renderLoop.ts` | 通常アニメーション専用として binding(1) は毎フレーム更新しない前提に変更、型に `viewportOriginBuffer` を追加 |
| `src/components/PreviewPane.test.tsx` | mode 切替、stop/start、resize 再描画、古い compile 結果破棄、2 binding bind group モック対応 |
| `src/components/StatusBar.test.tsx` | `previewMode` 分岐と `FPS: Paused` のテスト追加 |
| `src/gpu/shaderWrapper.test.ts` | binding(1) 注入と `position.xy - wgslpg_viewport_origin` の構造検証へ更新 |
| `src/gpu/createShaderPipeline.test.ts` | `viewportOriginBuffer` input と 2 エントリ bind group の検証へ更新 |
| `src/gpu/createUniformBuffer.test.ts` | slot offset 書き込み、viewport origin buffer / write 関数、stride 計算のテスト追加 |
| `src/gpu/renderLoop.test.ts` | `RenderLoopGpuState` 型変更と通常アニメーションで binding(1) を書かないことの検証 |
| `src/App.test.tsx` | Preview mode / Flipbook settings state、Run edge trigger、StatusBar props の検証 |
| `src/test/setup.ts` | 必要に応じて `GPUBufferUsage` など既存 WebGPU モック定数を維持・拡張 |

### 2.2 新規ファイル

| ファイル | 役割 |
| --- | --- |
| `src/types/preview.ts` | `PreviewMode`、`FlipbookSettings`、初期値、props 共有型 |
| `src/flipbookSettings.ts` | spec §6 の正規化ロジック、min/max/default 定義、number input 用 metadata |
| `src/flipbookSettings.test.ts` | 空文字、不正文字列、NaN/Infinity、小数切り捨て、min/max clamp、Run/blur/Enter 共通正規化の unit test |
| `src/components/PreviewModeControl.tsx` | `Animation` / `Flipbook` segmented control |
| `src/components/PreviewModeControl.test.tsx` | aria-label、キーボード操作、選択状態の component test |
| `src/components/FlipbookControls.tsx` | `frameCount` / `frameIntervalMs` / `startTimeMs` number inputs、blur / Enter 正規化 |
| `src/components/FlipbookControls.test.tsx` | 入力確定タイミングと `onChange` へ正規化済み integer だけを渡すテスト |
| `src/components/FlipbookLabels.tsx` | canvas 上に重ねる `#index time` label overlay |
| `src/components/FlipbookLabels.test.tsx` | ラベル数、表示形式、CSS pixel 座標変換、スクリーンリーダー過多読み上げ回避のテスト |
| `src/gpu/renderFlipbook.ts` | Flipbook の純粋グリッド計算、slot 書き込み、viewport/scissor 描画 |
| `src/gpu/renderFlipbook.test.ts` | grid / time / stride / writeBuffer / bind group / draw order の unit test |

`src/flipbookSettings.ts` と `src/types/preview.ts` は仕様 §14 にはないが、正規化と型を UI コンポーネントに閉じ込めると `App`、`PreviewPane`、テスト間で定義が重複するため追加する。責務は UI ではなく domain state であり、GPU モジュールとは分離する。

---

## 3. 状態管理設計

`src/types/preview.ts` に以下を定義する。

```ts
export type PreviewMode = 'animation' | 'flipbook';

export type FlipbookSettings = {
  frameCount: number;
  frameIntervalMs: number;
  startTimeMs: number;
};

export const initialPreviewMode: PreviewMode = 'animation';

export const initialFlipbookSettings: FlipbookSettings = {
  frameCount: 16,
  frameIntervalMs: 100,
  startTimeMs: 0,
};
```

`App.tsx` は既存 state に `previewMode` と `flipbook` を追加する。App state に保存する `flipbook` は spec §6.4 の通り正規化済み integer のみとする。

入力途中の空文字や不正文字列は App の正式 state には入れず、Preview ヘッダーを所有する `PreviewPane` 内で `flipbookDraft: Record<keyof FlipbookSettings, string>` として保持する。`FlipbookControls` は draft と正式 settings を受け取り、blur / Enter で `normalizeFlipbookSettings(draft)` を呼び、`onFlipbookChange(settings)` で App へ正規化済み値だけを通知する。

`Run` 押下時は既存の `shouldCompile` エッジトリガーを維持する。`PreviewPane` の再コンパイル effect は、`previewMode === 'flipbook'` の場合に compile の前に draft を正規化し、先に `flipbookRef.current = normalizedSettings` を同期更新してから `onFlipbookChange(normalizedSettings)` を呼ぶ。その正規化済み値を同じ compile / redraw 処理内でも使用する。これにより、未 blur の入力欄も Run で確定でき、App state には正規化済み integer だけが保存される。

`animation` から `flipbook` へ切り替える時も `PreviewPane` が draft を正規化し、先に `flipbookRef.current = normalizedSettings` を同期更新してから `onPreviewModeChange('flipbook')` と `onFlipbookChange(normalizedSettings)` を呼ぶ。GPU 描画は常に `flipbookRef.current` の正規化済み値だけを見る。App state は表示用ミラーであり、描画タイミングの正は `PreviewPane` 内の ref とする。

---

## 4. Flipbook パラメータ正規化

`src/flipbookSettings.ts` に spec §5 / §6 の metadata と正規化関数を置く。

```ts
export const flipbookFieldSpecs = {
  frameCount: { defaultValue: 16, min: 1, max: 64, step: 1 },
  frameIntervalMs: { defaultValue: 100, min: 0, max: 60000, step: 1 },
  startTimeMs: { defaultValue: 0, min: 0, max: 3600000, step: 1 },
} as const;

export function normalizeFlipbookValue(
  field: keyof FlipbookSettings,
  value: string | number,
): number;

export function normalizeFlipbookSettings(
  draft: Partial<Record<keyof FlipbookSettings, string | number>>,
): FlipbookSettings;
```

正規化ルール:

* 空文字、数値ではない文字列、`NaN`、`Infinity`、`-Infinity` は default に戻す
* 小数は `Math.trunc` で切り捨てる
* min 未満は min、max 超過は max に丸める
* 戻り値は integer のみ

正規化の呼び出しタイミング:

1. 入力欄 blur
2. 入力欄で Enter
3. Run 押下
4. `animation` から `flipbook` へ切り替え

---

## 5. shaderWrapper 変更

既存 wrapper はユーザーコードの後ろに vertex / fragment entry point を追記する。Flipbook では viewport 内座標に変換するため、wrapper 所有 uniform を追加する。

変更後テンプレート:

```wgsl
@group(0) @binding(1)
var<uniform> wgslpg_viewport_origin: vec2f;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return mainImage(position.xy - wgslpg_viewport_origin);
}
```

`wrapShader` は引き続き `struct Uniforms` / `@group(0) @binding(0)` を生成しない。ユーザーコードは既存 default shader と同じく binding(0) の `uniforms` を自分で持つ前提を維持する。

既存 `shaderWrapper.test.ts` への影響:

* `return mainImage(position.xy);` の検証は削除し、`return mainImage(position.xy - wgslpg_viewport_origin);` を検証する
* `@group(0) @binding(1)` と `var<uniform> wgslpg_viewport_origin: vec2f;` が user code より後、fragment entry point より前に存在することを検証する
* `defaultShader` が先頭に保持されること、空文字 / `mainImage` 欠落エラーは既存通り検証する

ユーザーが `@group(0) @binding(1)` を書いた場合は compile または pipeline 作成エラーとして扱い、`PreviewPane` は直前の成功 shader / Flipbook 表示を維持する。

---

## 6. createUniformBuffer 変更

ユーザー uniform は既存 16 byte レイアウトを維持する。

```ts
export const USER_UNIFORM_WRITE_SIZE = 16;
export const VIEWPORT_ORIGIN_WRITE_SIZE = 8;

export function createUniformBuffer(device: GPUDevice): GPUBuffer;

export function writeUserUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  time: number,
  width: number,
  height: number,
): void;

export function updateUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  time: number,
  width: number,
  height: number,
): void;

export function createViewportOriginBuffer(device: GPUDevice): GPUBuffer;

export function writeViewportOrigin(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  x: number,
  y: number,
): void;

export function alignUniformStride(writeSize: number, alignment: number): number;
```

`updateUniforms` のシグネチャは変更しない。既存呼び出し側と既存テストの互換性を維持し、内部で `writeUserUniforms(buffer, device, 0, time, width, height)` を呼ぶ。

`createViewportOriginBuffer` は通常アニメーション用の 8 byte buffer を作成する。

```ts
device.createBuffer({
  label: 'Viewport origin uniforms',
  size: 8,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
```

Flipbook 用の複数 slot buffer は `renderFlipbook.ts` 内で `frameCount` と stride に応じて作成するため、`createUniformBuffer.ts` には単一 buffer 作成関数と slot 書き込み関数だけを置く。

---

## 7. createShaderPipeline 変更

型を以下へ変更する。

```ts
export type CreatePipelineInput = {
  device: GPUDevice;
  format: GPUTextureFormat;
  wgsl: string;
  uniformBuffer: GPUBuffer;
  viewportOriginBuffer: GPUBuffer;
};

export type CreatePipelineOutput = {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
};
```

bind group は 2 エントリにする。

```ts
device.createBindGroup({
  layout: bindGroupLayout,
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: { buffer: viewportOriginBuffer } },
  ],
});
```

エラースコープ手順は既存計画 §6.3 を維持する。

1. `device.createShaderModule({ code: wgsl })`
2. `await shaderModule.getCompilationInfo()` で compilation error を例外化
3. `pushErrorScope('validation')` -> `createRenderPipelineAsync` -> `popErrorScope()` を `try/finally` で必ず回収
4. pipeline validation error があれば例外化
5. `pipeline.getBindGroupLayout(0)`
6. `pushErrorScope('validation')` -> `createBindGroup` -> `popErrorScope()` を `try/finally` で必ず回収
7. bind group validation error があれば例外化
8. 成功時のみ `{ pipeline, bindGroup }` を返す

既存 `createShaderPipeline.test.ts` への影響:

* input に `viewportOriginBuffer` を追加
* 成功テストの `createBindGroup` expectation を 2 entries に更新
* compilation error 時に error scope が開かれないことは既存通り
* pipeline / bind group validation error と `createBindGroup` throw 時の `pushErrorScope` / `popErrorScope` balance は既存通り検証する

---

## 8. renderLoop 変更

`renderLoop.ts` は通常アニメーション専用の RAF ループとして維持する。`RenderLoopGpuState` は `viewportOriginBuffer` を持つが、renderLoop 内では毎フレーム書き込まない。

```ts
export type RenderLoopGpuState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  uniformBuffer: GPUBuffer;
  viewportOriginBuffer: GPUBuffer;
} & (
  | { pipeline: null; bindGroup: null }
  | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
);
```

通常アニメーションでの binding(1) の `(0, 0)` 書き込み場所:

* `PreviewPane` の WebGPU 初期化後、`createViewportOriginBuffer(device)` 直後に `writeViewportOrigin(viewportOriginBuffer, device, 0, 0, 0)` を 1 回呼ぶ
* pipeline 再作成時は同じ `viewportOriginBuffer` を bind group に渡すため、再書き込みは不要
* 将来 buffer を作り直す変更が入った場合は、buffer 作成直後に同じ初期化を書き込む

renderLoop 毎フレームの処理:

1. `gpuState?.pipeline` が null なら render pass / submit をスキップし、RAF は継続
2. pipeline が存在すれば `updateUniforms(uniformBuffer, device, time, width, height)`
3. command encoder / render pass 作成
4. `setPipeline`、`setBindGroup(0, bindGroup)`、`draw(3)`、submit
5. FPS は既存通り 0.5 秒以上の間隔で `onFpsChange`

---

## 9. renderFlipbook.ts 新規

`renderFlipbook.ts` は Flipbook の描画だけを担当し、通常アニメーションの時間管理や React state を持たない。

### 9.1 型と公開関数

```ts
export type FlipbookCell = {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  timeSeconds: number;
};

export type FlipbookGrid = {
  columns: number;
  rows: number;
  gapDevicePx: number;
  cellWidth: number;
  cellHeight: number;
  cells: FlipbookCell[];
};

export type RenderFlipbookInput = {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  settings: FlipbookSettings;
};

export function computeFlipbookGrid(input: {
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  settings: FlipbookSettings;
}): FlipbookGrid;

export function createFlipbookFrameResources(input: {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  grid: FlipbookGrid;
}): {
  userUniformBuffer: GPUBuffer;
  viewportOriginBuffer: GPUBuffer;
  bindGroups: GPUBindGroup[];
};

export type FlipbookFrameResources = ReturnType<typeof createFlipbookFrameResources>;

export type RenderFlipbookResult = {
  grid: FlipbookGrid;
  resources: FlipbookFrameResources;
};

export function renderFlipbook(input: RenderFlipbookInput): RenderFlipbookResult;
```

`renderFlipbook` は label overlay 用に `FlipbookGrid` を返し、あわせて今回の redraw で作成した `FlipbookFrameResources` を返す。仕様 §15.2 は戻り値なしだが、同じグリッド計算を `FlipbookLabels` と二重実装しないことと、作成した GPU buffer を `PreviewPane` が後で destroy できるようにすることが目的である。GPU 描画の結果は canvas に反映されるため、戻り値は描画成否ではなく UI overlay 同期用の派生情報とリソース解放用 handle である。この差分は spec の意図と矛盾しない。

### 9.2 グリッド計算

`computeFlipbookGrid` は純粋関数として unit test する。

```text
columns = ceil(sqrt(frameCount))
rows = ceil(frameCount / columns)
gapDevicePx = round(8 * devicePixelRatio)
cellWidth = floor((canvasWidth - gapDevicePx * (columns - 1)) / columns)
cellHeight = floor((canvasHeight - gapDevicePx * (rows - 1)) / rows)
row = floor(i / columns)
column = i % columns
x = column * (cellWidth + gapDevicePx)
y = row * (cellHeight + gapDevicePx)
timeSeconds = (startTimeMs + i * frameIntervalMs) / 1000
```

`cellWidth` / `cellHeight` は最低 1 に clamp する。通常 `ResizeObserver` 側で canvas は 1px 以上になるが、極端に小さい preview 領域や 64 frame で負値にならないよう GPU API 呼び出し前に防御する。

### 9.3 slot 書き込み

`createFlipbookFrameResources` は `device.limits.minUniformBufferOffsetAlignment` を使う。未定義のモック環境では WebGPU 標準の多くの実装と同じ `256` をテスト用 fallback として扱う helper を置く。

```text
userUniformStride = alignUniformStride(16, minUniformBufferOffsetAlignment)
viewportOriginStride = alignUniformStride(8, minUniformBufferOffsetAlignment)
userUniformBufferSize = userUniformStride * frameCount
viewportOriginBufferSize = viewportOriginStride * frameCount
```

各 frame で以下を書き込む。

* binding(0): `writeUserUniforms(userUniformBuffer, device, i * userUniformStride, timeSeconds, cellWidth, cellHeight)`
* binding(1): `writeViewportOrigin(viewportOriginBuffer, device, i * viewportOriginStride, x, y)`

各 frame bind group:

```ts
{
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: userUniformBuffer, offset: i * userUniformStride, size: 16 } },
    { binding: 1, resource: { buffer: viewportOriginBuffer, offset: i * viewportOriginStride, size: 8 } },
  ],
}
```

### 9.4 描画

`renderFlipbook` の描画順:

1. `computeFlipbookGrid`
2. `createFlipbookFrameResources`
3. `const encoder = device.createCommandEncoder()`
4. `const view = context.getCurrentTexture().createView()`
5. render pass を `loadOp: 'clear'`、黒 clear で 1 回開始
6. `pass.setPipeline(pipeline)` は pass 開始後に 1 回だけ呼ぶ
7. frame index 昇順に処理
8. `pass.setViewport(x, y, width, height, 0, 1)`
9. `pass.setScissorRect(x, y, width, height)`
10. `pass.setBindGroup(0, bindGroups[i])`
11. `pass.draw(3)`
12. pass end、submit
13. `{ grid, resources }` を返す

`setPipeline` は spec §10.3 の frame ごとの手順では各 frame に含まれるが、同じ pipeline を使い続けるため pass 内 1 回にしてよい。draw 結果は同じで、無駄な API 呼び出しを避ける。テストでは `setPipeline` 1 回、`setBindGroup` / `draw` が `frameCount` 回であることを検証する。

---

## 10. PreviewPane 変更

### 10.1 Props と GpuState

```ts
export type PreviewPaneProps = {
  code: string;
  shouldCompile: boolean;
  previewMode: PreviewMode;
  flipbook: FlipbookSettings;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onFlipbookChange: (settings: FlipbookSettings) => void;
  onCompileSuccess: () => void;
  onCompileError: (message: string) => void;
  onFpsChange: (fps: number) => void;
  onResolutionChange: (width: number, height: number) => void;
  onGpuInfo: (name: string | undefined) => void;
};
```

`GpuState` は viewport origin buffer を含める。

```ts
type GpuState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  uniformBuffer: GPUBuffer;
  viewportOriginBuffer: GPUBuffer;
} & (
  | { pipeline: null; bindGroup: null }
  | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
);
```

### 10.2 世代管理とトリガー管理

既存の `lifecycleGenerationRef` と `compileSeqRef` は役割を変えない。

* `lifecycleGenerationRef`: mount / cleanup 単位。StrictMode、unmount、device lost の古い非同期処理を無効化
* `compileSeqRef`: compile 呼び出し単位。古い compile 成功/失敗が新しい結果を上書きしないようにする

Flipbook 用に以下を追加する。

* `renderLoopRef`: 現在の RAF controller。animation mode の時だけ非 null
* `pendingFlipbookFrameRef`: coalescing 用 RAF id。Flipbook 再描画要求が同一 frame 内で多発しても 1 回にまとめる
* `displayGenerationRef`: mode 切替、device lost、unmount で進める表示世代。古い scheduled Flipbook callback を無効化
* `latestGridRef`: 最後に描画した `FlipbookGrid`。`FlipbookLabels` 表示に使う
* `latestFlipbookResourcesRef`: 最後の Flipbook redraw が作成した `FlipbookFrameResources`。次回 redraw、mode 切替、unmount、device lost で destroy する
* `deviceLostRef`: device lost 後の compile / redraw 要求を無視するための flag

`scheduleFlipbookRender(reason)` を `PreviewPane` 内に定義する。

処理:

1. `previewModeRef.current !== 'flipbook'` なら何もしない
2. `deviceLostRef.current` なら何もしない
3. `gpuRef.current` が無い、または `pipeline === null` なら何もしない
4. `pendingFlipbookFrameRef.current !== null` なら新規 RAF は予約しない
5. `const scheduledGeneration = displayGenerationRef.current` を capture してから RAF を予約する
6. RAF callback で最新の `gpuRef`、`canvas.width/height`、`devicePixelRatio`、`flipbookRef.current` を読み直す
7. callback 開始時に `displayGenerationRef.current === scheduledGeneration`、mode、deviceLost、pipeline を再確認する。不一致なら描画せず破棄する
8. `latestFlipbookResourcesRef.current` があれば destroy して null にする
9. `renderFlipbook` を呼び、返った `grid` を `latestGridRef` / state に反映し、返った `resources` を `latestFlipbookResourcesRef.current` に保存する
10. callback 終了時に、破棄経路も含めて `finally` で pending id を null に戻す

この設計により、モード切替・パラメータ変更・resize・fullscreenchange・compile 成功が同時多発しても、同一 animation frame 内では 1 回だけ描画する。描画時には refs から最新の pipeline / settings / canvas size を読むため、古い props を閉じ込めた callback が後から canvas を上書きしない。`displayGenerationRef` の capture / compare は mode 切替時の pending RAF cancel と二重の防御になり、cancel 済みでない古い callback が実行されても世代不一致で破棄される。compile 自体は `compileSeqRef` により古い結果が破棄されるため、古い pipeline が新しい pipeline を上書きすることもない。

### 10.3 renderLoop stop/start

`startAnimationLoop()`:

* `deviceLostRef.current` なら何もしない
* 既存 `renderLoopRef.current` があれば二重起動しない
* `startRenderLoop` を呼び、controller を `renderLoopRef.current` に保存

`stopAnimationLoop()`:

* `renderLoopRef.current?.stop()`
* `renderLoopRef.current = null`

mode 切替:

| 切替 | 処理 |
| --- | --- |
| `animation` -> `flipbook` | `displayGenerationRef.current++`、`stopAnimationLoop()`、未確定 settings を正規化確定し `flipbookRef.current = normalizedSettings` を同期更新、`onFlipbookChange(normalizedSettings)`、props 反映後の mode effect で `scheduleFlipbookRender('mode-change')` |
| `flipbook` -> `animation` | `displayGenerationRef.current++`、pending Flipbook RAF を cancel、`latestFlipbookResourcesRef.current` を destroy して null、`startAnimationLoop()` |

初期化後:

* `previewMode === 'animation'` なら `startAnimationLoop()`
* `previewMode === 'flipbook'` なら `scheduleFlipbookRender('initial')`

### 10.4 spec §11.2 の 6 トリガー

| トリガー | 実装 |
| --- | --- |
| 通常アニメーションから Flipbook へ切替 | commit 時に未確定 draft を正規化し、先に `flipbookRef.current = normalizedSettings` を同期更新してから `onPreviewModeChange('flipbook')` / `onFlipbookChange(normalizedSettings)`。props 反映後の mode effect で loop stop 後 `scheduleFlipbookRender('mode-change')` |
| Flipbook パラメータ確定 | `PreviewPane` の commit helper で `normalizedSettings` を作り、先に `flipbookRef.current = normalizedSettings` を同期更新してから `onFlipbookChange(normalizedSettings)` と `scheduleFlipbookRender('settings-change')` を呼ぶ。App state は表示用ミラーであり、描画は ref のみを見る |
| Run 押下による compile 成功 | `compile()` 成功時、`previewModeRef.current === 'flipbook'` なら `scheduleFlipbookRender('compile-success')` |
| Preview resize | `ResizeObserver` で canvas size 更新後、Flipbook mode なら `scheduleFlipbookRender('resize')` |
| Fullscreen 入退出 | `fullscreenchange` 後、Flipbook mode なら `scheduleFlipbookRender('fullscreen')` |
| WebGPU 初期化後の初回描画 | 初期 compile 成功後または pipeline が存在する状態で `scheduleFlipbookRender('initial')` |

`flipbook` prop 変更を受ける effect は `flipbookRef.current = flipbook` を行うが、通常の UI commit / Run / mode 切替による redraw は props 反映を待たない。`PreviewPane` が正規化と ref 更新を所有することで、`onFlipbookChange` 後の React 再レンダーより RAF callback が先に走っても、描画は同期更新済みの `flipbookRef.current` を読む。

再描画しないケース:

* エディター入力中: `code` は ref 更新だけで compile / redraw しない
* compile 失敗: `onCompileError` のみ。pipeline と latest grid を維持し、redraw しない
* Reset 押下のみ: code state のみ更新。compile / redraw しない
* Save 押下: WGSL ダウンロードのみ
* device lost 後: `deviceLostRef` により compile / redraw を無視

### 10.5 compile 処理

`compile(wgslSourceCode)` は既存同様 1 箇所に集約する。

変更点:

1. `wrapShader`
2. `createShaderPipeline({ device, format, wgsl, uniformBuffer, viewportOriginBuffer })`
3. `compileSeqRef` と `lifecycleGenerationRef` の一致を確認
4. 成功時のみ `{ pipeline, bindGroup }` をペアで差し替える
5. `onCompileSuccess()`
6. animation mode なら renderLoop が次 frame で新 pipeline を描画
7. flipbook mode なら `scheduleFlipbookRender('compile-success')`
8. 失敗時は既存 pipeline / bindGroup / latest Flipbook 表示を維持し、`onCompileError(message)` のみ呼ぶ

### 10.6 UI 配置

Preview ヘッダー内は以下の順に配置する。

```text
Preview [Animation|Flipbook] [Frames ... Interval ... Start ...] [Fit] [Fullscreen]
```

`FlipbookControls` は `previewMode === 'flipbook'` の時だけ表示する。幅不足時は `.preview-tools` を wrap し、Fit / Fullscreen が同じツールバー内に残るよう CSS を調整する。

canvas の `aria-label` は mode に応じて切り替える。

* animation: `WebGPU shader preview`
* flipbook: `WebGPU shader flipbook preview`

---

## 11. UI コンポーネント

### 11.1 PreviewModeControl

```ts
type PreviewModeControlProps = {
  value: PreviewMode;
  onChange: (mode: PreviewMode) => void;
};
```

実装:

* `role="group"` または radio group で `aria-label="Preview mode"`
* `Animation` / `Flipbook` の 2 択
* キーボード操作で選択可能
* 現在選択中の mode を `aria-pressed` または radio checked で表現する

### 11.2 FlipbookControls

```ts
type FlipbookControlsProps = {
  draft: Record<keyof FlipbookSettings, string>;
  value: FlipbookSettings;
  onDraftChange: (draft: Record<keyof FlipbookSettings, string>) => void;
  onCommit: (settings: FlipbookSettings, normalizedDraft: Record<keyof FlipbookSettings, string>) => void;
};
```

各 input:

| field | label | aria-label | min | max | step |
| --- | --- | --- | --- | --- | --- |
| `frameCount` | `Frames` | `Flipbook frame count` | 1 | 64 | 1 |
| `frameIntervalMs` | `Interval ms` | `Flipbook frame interval in milliseconds` | 0 | 60000 | 1 |
| `startTimeMs` | `Start ms` | `Flipbook start time in milliseconds` | 0 | 3600000 | 1 |

正規化の実装位置は `src/flipbookSettings.ts` とし、`FlipbookControls` はその関数を呼ぶだけにする。これにより component test ではイベント、unit test では正規化ロジックを分けて検証できる。

### 11.3 FlipbookLabels

```ts
type FlipbookLabelsProps = {
  grid: FlipbookGrid | null;
  devicePixelRatio: number;
};
```

実装:

* `grid.cells` から label を render
* `left = cell.x / devicePixelRatio + 6`
* `top = cell.y / devicePixelRatio + 6`
* text は `#${index} ${timeSeconds.toFixed(2)}s`
* label overlay は `pointer-events: none`
* 初期リリースではフレーム一覧をスクリーンリーダー向けに読み上げないため、container に `aria-hidden="true"` を付与する

---

## 12. App / StatusBar 変更

`App.tsx`:

* `previewMode`, `flipbook` state を追加
* `PreviewPane` に mode / settings / change callbacks を渡す
* `StatusBar` に `previewMode` を渡す
* Reset は code のみ初期化し、Flipbook state と表示は変更しない
* Save は code のみ `.wgsl` として保存し、Flipbook state は保存しない
* Ctrl/Cmd+Enter は既存通り `shouldCompile` を反転。Run 時正規化は `shouldCompile` を受けた `PreviewPane` 側で行う

`StatusBar.tsx`:

```ts
type StatusBarProps = {
  compileStatus: CompileStatus;
  fps: number;
  resolution: { width: number; height: number };
  gpuName?: string;
  previewMode: PreviewMode;
};
```

表示:

```text
previewMode === 'animation' -> FPS: {fps.toFixed(1)}
previewMode === 'flipbook'  -> FPS: Paused
```

Flipbook mode へ切り替わった瞬間に `fps` state を 0 に戻す必要はない。表示が `Paused` に分岐するため、内部 state の旧 FPS 値は animation mode に戻った後、renderLoop の次回計測で更新される。

---

## 13. TDD テスト計画

### 13.1 正規化

`src/flipbookSettings.test.ts`

* default 値が spec §5 と一致する
* `frameCount`: `''`、`abc`、`NaN`、`Infinity`、`-Infinity` は 16
* `frameCount`: `1.9` は 1、`0` は 1、`65` は 64
* `frameIntervalMs`: default 100、min 0、max 60000、小数切り捨て
* `startTimeMs`: default 0、min 0、max 3600000、小数切り捨て
* `normalizeFlipbookSettings` が全 field を integer として返す

### 13.2 shaderWrapper

`src/gpu/shaderWrapper.test.ts`

* 空コードで `Shader code is empty`
* `mainImage` 欠落で `mainImage function not found`
* default shader が生成 WGSL の先頭に残る
* `@group(0) @binding(1)` と `wgslpg_viewport_origin` を含む
* fragment が `mainImage(position.xy - wgslpg_viewport_origin)` を呼ぶ

### 13.3 createUniformBuffer

`src/gpu/createUniformBuffer.test.ts`

* `createUniformBuffer` は既存通り size 16
* `updateUniforms` は既存 signature のまま offset 0 に `[time, 0, width, height]`
* `writeUserUniforms` は任意 offset に同じ Float32Array を書く
* `createViewportOriginBuffer` は size 8
* `writeViewportOrigin` は任意 offset に `[x, y]`
* `alignUniformStride(16, 256) === 256`、`alignUniformStride(8, 256) === 256`

### 13.4 createShaderPipeline

`src/gpu/createShaderPipeline.test.ts`

* 成功時に `viewportOriginBuffer` を受け取り、bind group entries が binding 0 / 1 の 2 件
* compilation error では error scope を開かない
* pipeline validation error を例外化する
* bind group validation error を例外化する
* `createBindGroup` throw 時も `pushErrorScope` / `popErrorScope` 数が一致する

### 13.5 renderFlipbook

`src/gpu/renderFlipbook.test.ts`

* `frameCount` 1 / 2 / 4 / 9 / 16 / 20 / 64 の columns / rows
* row-major の row / column / x / y
* `gapDevicePx = round(8 * devicePixelRatio)`
* `cellWidth` / `cellHeight` が floor 計算と一致
* `timeSeconds = (startTimeMs + i * frameIntervalMs) / 1000`
* `frameIntervalMs = 0` で全 frame 同じ time
* frameCount 分の user uniform / viewport origin slot を offset 付きで write
* bind group が frameCount 個、各 binding が offset / size を持つ
* render pass は 1 回、clear は黒
* `setViewport` / `setScissorRect` / `setBindGroup` / `draw` が frameCount 回、順序が index 昇順
* `renderFlipbook` が `{ grid, resources }` を返し、resources に destroy 対象の `userUniformBuffer` / `viewportOriginBuffer` が含まれる

### 13.6 renderLoop

`src/gpu/renderLoop.test.ts`

* pipeline null 時は render pass / submit をスキップし RAF 継続
* pipeline 有りで既存 full-screen triangle 描画
* `updateUniforms` は呼ぶが `writeViewportOrigin` は呼ばない
* `stop()` 後は frame が進まない
* FPS callback は既存通り finite value

### 13.7 UI コンポーネント

`PreviewModeControl.test.tsx`

* `aria-label="Preview mode"`
* Animation 初期選択、Flipbook クリックで `onChange('flipbook')`
* keyboard 操作で切替可能

`FlipbookControls.test.tsx`

* 3 input が label / aria-label / min / max / step を持つ
* draft 入力中は `onCommit` しない
* blur で正規化して `onCommit`
* Enter で正規化して `onCommit`
* 不正値は default / clamp 表示へ戻る

`FlipbookLabels.test.tsx`

* grid null では label なし
* frameCount 分の label を表示
* `#0 0.00s` 形式
* device px から CSS px へ変換し、+6px する
* overlay は `aria-hidden="true"`

### 13.8 PreviewPane

`src/components/PreviewPane.test.tsx`

* WebGPU 非対応メッセージは既存通り
* StrictMode で初期 compile と loop / draw が二重化しない
* 初期 animation mode では renderLoop を開始し、Flipbook は描画しない
* animation -> flipbook で renderLoop stop、Flipbook 1 回描画
* flipbook -> animation で pending Flipbook RAF cancel、renderLoop start
* Flipbook settings 変更で redraw を 1 回 schedule
* Flipbook mode の Run で未 blur の draft 入力を正規化してから compile する
* settings 変更と resize が同一 tick に来ても `renderFlipbook` は 1 回
* resize 時、canvas size 更新後の最新 size で redraw
* fullscreenchange 時に Flipbook redraw
* compile 成功時、animation は pipeline 差し替えのみ、flipbook は redraw
* compile 失敗時、pipeline と latest grid を維持し redraw しない
* 古い compile promise が後から解決しても新しい pipeline / grid を上書きしない
* device lost 後は loop stop、message 表示、compile / redraw 要求を無視
* canvas `aria-label` が mode で切り替わる

### 13.9 App / StatusBar

`src/App.test.tsx`

* `PreviewPane` に `previewMode="animation"` と初期 `flipbook` が渡る
* mode change callback で `previewMode` が更新される
* Flipbook commit callback で正規化済み settings が渡る
* Run / Ctrl+Enter で `shouldCompile` がエッジとして反転する
* Reset は code のみ戻し、Flipbook settings は維持
* Save は code だけを保存
* `StatusBar` に previewMode が渡る

`src/components/StatusBar.test.tsx`

* animation mode では `FPS: 60.0`
* flipbook mode では `FPS: Paused`
* Compile / Resolution / GPU / Backend / WGSL は既存通り

---

## 14. 実装フェーズ

### Phase 1: 型・正規化・UI 単体

対象:

* `src/types/preview.ts`
* `src/flipbookSettings.ts`
* `PreviewModeControl`
* `FlipbookControls`
* `FlipbookLabels`

完了条件:

* 正規化 unit test が全て通る
* UI component test が全て通る
* まだ GPU 実装には触らない

### Phase 2: wrapper / uniform / pipeline の binding(1) 対応

対象:

* `shaderWrapper.ts`
* `createUniformBuffer.ts`
* `createShaderPipeline.ts`
* 各テスト

完了条件:

* wrapper が binding(1) を注入する
* createPipeline が binding 0 / 1 の 2 entries bind group を作る
* 既存エラースコープ手順のテストが通る
* `updateUniforms` の既存 signature が維持される

### Phase 3: renderFlipbook

対象:

* `src/gpu/renderFlipbook.ts`
* `src/gpu/renderFlipbook.test.ts`

完了条件:

* grid / time / slot / draw order の unit test が通る
* GPU モックで frameCount 分の draw が確認できる
* `renderFlipbook` が label 用 grid と destroy 可能な resources を返す

### Phase 4: renderLoop / PreviewPane 統合

対象:

* `renderLoop.ts`
* `PreviewPane.tsx`
* `PreviewPane.test.tsx`

完了条件:

* animation mode の既存描画が維持される
* mode 切替で RAF stop/start が正しく行われる
* spec §11.2 の 6 トリガーが test で確認される
* 同時多発 trigger が 1 redraw に coalesce される
* 古い compile / scheduled redraw が上書きしない

### Phase 5: App / StatusBar 統合

対象:

* `App.tsx`
* `StatusBar.tsx`
* `App.css`
* `App.test.tsx`
* `StatusBar.test.tsx`

完了条件:

* Preview header に mode control と Flipbook controls が表示される
* Flipbook mode で `FPS: Paused`
* Reset / Save / shortcut の既存挙動が維持される
* `npm test` が通る

### Phase 6: 手動確認と仕上げ

確認:

* `npm run test`
* `npm run build`
* WebGPU 対応ブラウザで初期 animation が動く
* Flipbook 1 / 2 / 16 / 64 frame の見た目
* interval 0、start time 変更、resize、fullscreen 入退出
* compile error 後に直前 Flipbook 表示が維持される
* WebGPU 非対応 / device lost の表示

完了条件:

* spec §22 の MVP 完了条件を満たす
* 既存機能の Run / Reset / Save / shortcut / ErrorPanel が退行しない

---

## 15. リスクと未決事項

### 15.1 WebGPU uniform offset alignment

Flipbook は frame ごとの bind group resource offset を使う。`minUniformBufferOffsetAlignment` に従わないと validation error になる。`alignUniformStride` を unit test し、実装では `device.limits.minUniformBufferOffsetAlignment ?? 256` を使う。

### 15.2 `setViewport` 座標と `@builtin(position)`

WebGPU の `position.xy` は canvas 全体座標になるため、binding(1) の viewport origin 差し引きが必須。wrapper test と renderFlipbook test の両方で、origin 書き込みと fragment 呼び出しを検証する。

### 15.3 1 回の redraw で buffer / bind group を毎回作る負荷

初期リリースは最大 64 frame かつ連続描画しないため、再描画ごとに作成してよい。ただし `renderFlipbook` が作成する `userUniformBuffer` / `viewportOriginBuffer` を放置すると、高速 resize 連発などで GPU buffer が蓄積しうる。

`renderFlipbook` は `{ grid, resources }` を返し、`PreviewPane` は `latestFlipbookResourcesRef` に直近 redraw の resources を保持する。次の redraw 開始時に、前回 resources の `userUniformBuffer.destroy()` と `viewportOriginBuffer.destroy()` を呼んでから新しい `renderFlipbook` を実行する。前回 redraw の command はすでに submit 済みなので、submit 後の buffer destroy は WebGPU 仕様上安全であり、描画済み canvas の表示を消さない。

unmount、`flipbook` -> `animation` の mode 切替、device lost cleanup でも `latestFlipbookResourcesRef.current` があれば destroy して null にする。性能問題が出た場合は、pipeline / frameCount / alignment が同じ間だけ resources を reuse する拡張を検討するが、その場合も所有者は `PreviewPane` に置き、cleanup 経路は維持する。

### 15.4 Run 時の未確定 draft 入力

spec §6.2 は Run 押下時の正規化を要求する。正式 settings だけを App に持つと未 blur の入力欄文字列を拾えないため、Preview ヘッダーを所有する `PreviewPane` が `flipbookDraft` を持ち、`shouldCompile` effect の先頭で正規化する。この draft は「正式な Flipbook パラメータ」ではなく UI 入力状態であり、App state には正規化済み integer だけを保存するため spec §6.4 に反しない。

Run 時の正規化後は、`onFlipbookChange(normalizedSettings)` より先に `flipbookRef.current = normalizedSettings` を同期実行する。compile 成功後の `scheduleFlipbookRender('compile-success')` は React props 反映を待たず、この ref を読むため、未確定 draft の確定と redraw の間に古い settings が挟まらない。

同じ helper を blur / Enter のパラメータ確定と、`animation` から `flipbook` への mode 切替でも使う。mode 切替では schedule 自体は props 反映後の mode effect で行うが、settings ref は切替 commit 時点で同期更新済みにしておく。

### 15.5 StrictMode と二重描画

既存計画と同じく StrictMode は外さない。cleanup、`lifecycleGenerationRef`、`compileSeqRef`、pending RAF cancel で副作用を巻き戻せる構造にする。テストでは StrictMode 下の初期 compile / loop 開始回数を引き続き確認する。

### 15.6 command submit 順序

WebGPU queue は submit 順に処理される前提だが、React 側では古い scheduled callback が後から submit しないようにする必要がある。`scheduleFlipbookRender` は pending RAF を coalesce し、callback 実行時に最新 refs と `displayGenerationRef` を確認する。

### 15.7 spec との差分

`renderFlipbook(input): void` とする仕様 §15.2 に対し、本計画では `{ grid, resources }` を返す。これは label overlay を描画と同じ grid 計算に同期させ、かつ redraw ごとに作成する GPU buffer を `PreviewPane` が destroy できるようにするためで、GPU 描画の成否や副作用モデルは変えない。仕様文言を厳密に void に固定する必要がある場合は、`computeFlipbookGrid` と `createFlipbookFrameResources` を `PreviewPane` が先に呼び、grid / resources を `renderFlipbook` に渡す API へ変更する。その場合は spec 側の修正は不要で、実装計画内の API だけを調整する。
