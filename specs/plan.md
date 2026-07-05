# Shaderbook — 実装計画書

対象: `specs/spec.md`（仕様書）および `specs/image.png`（画面イメージ）に基づく実装計画。

---

## 1. スコープ確認

`spec.md` §4 の対象範囲に従い、MVP（§22）を完了条件とする。以下は明示的にスコープ外:
ユーザーアカウント / クラウド保存 / 作品公開 / コメント / Like / テクスチャ入力 / 音声入力 /
マルチパスレンダリング / Compute shader / モバイル最適化。

### 1.1 image.png とのギャップ（要確認事項）

`image.png` には `spec.md` に明記のない UI 要素が含まれる。実装方針を決めた上で着手する。

| 画像上の要素 | spec.md 上の記載 | 本計画での扱い |
| --- | --- | --- |
| ヘッダー右端の `⋮`（その他メニュー）ボタン | なし | MVP スコープ外。ボタン自体を表示しない（未実装の空ボタンを押せる状態で置くとアクセシビリティ上好ましくないため。将来メニューを実装する段階で追加する） |
| Editor 右上の太陽アイコン（テーマ切替） | §12.1 はダークテーマ固定 | MVP スコープ外。実装しない（アイコンも置かない） |
| Editor 右上のパネル分割アイコン | なし | MVP スコープ外。実装しない |
| ファイルタブの `+`（タブ追加） | §5.3 はタブ `shader.wgsl` 1つのみ | MVP スコープ外。タブは `shader.wgsl` 固定 1 つ、`+` は非活性表示 or 非表示 |
| ファイルタブの `×`（閉じる） | なし | 同上の理由で非活性 or 非表示 |
| Preview 右上の `Fit` ドロップダウン | §5.4 に「表示倍率メニュー: Fit」の記載あり | 実装する。ただし初期リリースは `Fit` 固定 1 択で可（メニューを開いても選択肢は `Fit` のみ） |
| Preview 右上のフルスクリーンボタン | §5.4 に記載あり、§21 将来拡張にも「フルスクリーンプレビュー」とあり矛盾 | `Fullscreen API` で Preview 領域のみ全画面化する最小実装を行う |
| ステータスバー右端 `WGSL 1.0.0` | §5.5 は `WGSL Version: WGSL` とだけ規定 | 固定文字列 `WGSL` を表示（バージョン番号は付与しない）。将来的にバージョン管理が必要になれば拡張 |
| ステータスバー `GPU: Integrated (WebGPU)` | §5.5 例は `Integrated GPU` | `GPUAdapterInfo`（取得できれば）から `description` 等を表示、取得不可なら `Unknown` |
| Editor に表示されているコード自体（ハッシュノイズを使った別デザインの `mainImage`、`@fragment fn mainImage(@builtin(position) ...)` 風の署名） | §9 の初期コードは palette + 円形パターンのシンプルな実装で、シグネチャも `fn mainImage(fragCoord: vec2f) -> vec4f`（wrapper 前提の素の関数） | image.png のエディター内コードは画面イメージ用のサンプルであり、実装の初期コードとしては採用しない。**実装は spec §9 に記載された初期コードをそのまま使用する**。レイアウトやフォント、ハイライト配色の参考にのみ image.png を用いる |

これらは実装前にユーザーへ最終確認を推奨するが、MVP 完了条件（§22）を満たすことを優先し、
表中の「本計画での扱い」に従って実装を進める。

---

## 2. 技術構成（spec §13 準拠）

* React + TypeScript + Vite
* CodeMirror 6（`@codemirror/lang-*` は WGSL 用言語パッケージが無いため、GLSL/C 系ハイライトを
  ベースにカスタムする。詳細は §6 参照）
* WebGPU API（`@webgpu/types` を devDependencies に追加し型定義を補う）
* 状態管理は React state のみ（spec §13.2 の `AppState` 型に準拠）

### 2.1 セットアップ手順

1. `npm create vite@latest . -- --template react-ts`
2. 依存追加: `codemirror`, `@codemirror/view`, `@codemirror/state`, `@codemirror/language`,
   `@codemirror/commands`, `@codemirror/theme-one-dark`（ダークテーマ基調に合わせる）,
   `@codemirror/legacy-modes`（WGSL 風シンタックスハイライトのベースとして `clike` モードを使用、
   詳細は §5.2 参照）
3. 型定義追加: `@webgpu/types`（`tsconfig.json` の `compilerOptions.types` に追加）
4. Lint/Format は既存 Vite テンプレート設定を流用（過剰な独自ルール追加はしない）

---

## 3. ディレクトリ構成（spec §14 準拠）

```text
src/
  App.tsx
  components/
    Header.tsx
    EditorPane.tsx
    PreviewPane.tsx
    StatusBar.tsx
    ErrorPanel.tsx
  gpu/
    createWebGPUContext.ts
    createShaderPipeline.ts
    createUniformBuffer.ts
    renderLoop.ts
    shaderWrapper.ts
  constants/
    defaultShader.ts
```

---

## 4. 状態管理設計（App.tsx）

spec §13.2 の `AppState` をそのまま採用する。

```ts
type CompileStatus = 'idle' | 'success' | 'error';

type AppState = {
  code: string;
  compileStatus: CompileStatus;
  errorMessage: string | null;
  fps: number;
  resolution: { width: number; height: number };
};
```

追加で必要になる派生 state（spec に明記は無いが実装上必須）:

* `shouldCompile: boolean` — spec §15.3 で型が固定されている `PreviewPaneProps.shouldCompile`
  をそのまま使う。ただし実装上の注意点として、この値は「true/false という状態」ではなく
  「変化したこと自体（エッジ）」をコンパイル要求のシグナルとして扱う設計にする:
  * `Run` 押下のたびに `App` 側で `setShouldCompile(prev => !prev)` のように反転させるだけで、
    `true` に戻す・`false` に戻すといった後始末は行わない
  * `PreviewPane` 内部では「WebGPU 初期化 + 初期コンパイル + 描画ループ開始」を1本の
    `useEffect(..., [])` にまとめ、「Run 押下による再コンパイル」は別の
    `useEffect(..., [shouldCompile])` に分離する（2つのエフェクトの役割分担と実行順序の詳細は
    §5.3 で定義する）。こうすることで「WebGPU の初期化が終わる前に compile が呼ばれる」
    というレースを構造的に防ぐ
  * `code` の最新値はキー入力のたびに変わるため、コンパイル実行時は `useRef` に保持した
    `codeRef.current`（最新の `code`）を参照する。`code` 自体を effect の依存配列に入れると
    キー入力のたびに再コンパイルされてしまい「Run 押下時のみコンパイル」という spec §6.2 の
    要件に反するため、依存配列には含めない
  * React 18 の `StrictMode`（Vite の react-ts テンプレート既定）は開発時に
    マウント系エフェクトを「setup → cleanup → setup」の順で2回実行する。これを回避するために
    `StrictMode` を外すのではなく、両エフェクトの cleanup 関数を副作用が完全に巻き戻る
    （`requestAnimationFrame` を `cancelAnimationFrame` する、`GPUDevice.destroy()` を呼ぶ、
    `ResizeObserver.disconnect()` する）ように実装し、2回実行されても壊れない
    （＝1回多く初期化・再描画が走るだけで、結果的な表示や状態は1回実行時と同じになる）
    ことを設計の前提とする。これは React 公式が推奨する「エフェクトは2回実行されても
    安全であるべき」という方針に沿ったものであり、初期コンパイルが「2回走ること」自体は
    許容し、「2回走った結果、状態や描画が壊れること」だけを防ぐ
* `gpuName: string | undefined` — `StatusBar` の GPU 表示用。`PreviewPane` の初期化完了時に
  `App` へ通知する経路が spec の Props 定義に無いため、`PreviewPaneProps` に
  `onGpuInfo: (name: string | undefined) => void` を追加する（spec §15.3 への追加拡張、後述 §7.3）。

`Run` の処理フロー（spec §6.2）は「ボタン押下時のみコンパイル」であり自動コンパイルはしない。
実装では `code` state 変更と `shouldCompile` state 変更を分離し、`EditorPane` の `onChange` は
`code` のみ更新、`Run` ボタンのみが `shouldCompile` をトリガーする。

---

## 5. コンポーネント実装詳細

### 5.1 Header（spec §15.1, 画像レイアウト準拠）

* ロゴアイコン（`W` の四角アイコン）+ `Shaderbook` + 補足テキスト
* 右側に `Run`（Cmd/Ctrl+Enter 併記）, `Reset`, `Save` ボタン
* `⋮` メニューボタンは表示しない（§1.1 参照、MVP スコープ外の未実装機能のため）
* Props は spec §15.1 の `HeaderProps` をそのまま使用

### 5.2 EditorPane（spec §15.2, §5.3）

* CodeMirror 6 の `EditorView` を React にラップする薄いコンポーネントとして実装
* 行番号: `@codemirror/view` の `lineNumbers()` 拡張
* 現在行ハイライト: `highlightActiveLine()`
* タブ入力: `indentWithTab`（`@codemirror/commands`）を keymap に追加
* Undo/Redo: `history()` + `historyKeymap`
* シンタックスハイライト: WGSL 公式言語パッケージが無いため、C 系トークナイザ
  （`@codemirror/legacy-modes/mode/clike` の `c` 定義）を流用し、
  WGSL 予約語（`fn`, `let`, `var`, `struct`, `@vertex`, `@fragment`, `@group`, `@binding`,
  `vec2f`, `vec3f`, `vec4f`, `f32`, `u32` 等）をキーワードリストとして拡張する
  カスタム言語定義を `gpu/` とは別に `src/editor/wgslLanguage.ts` として切り出す
  （ディレクトリ構成 §3 への軽微な追加。理由: shader 変換ロジックと言語定義は責務が異なる）
* Props は spec §15.2 の `EditorPaneProps`（`code`, `onChange`）のみ
* 制御コンポーネントとして実装（`code` prop が変わったら CodeMirror の内容を同期）。
  ただし `onChange` 発火のたびに `code` prop が変わり `EditorView` を作り直すと
  カーソル位置やタブ入力性能に悪影響が出るため、`useRef` で `EditorView` インスタンスを
  保持し `dispatch` で差分更新する

### 5.3 PreviewPane（spec §15.3）

* `<canvas>` を保持し、`gpu/createWebGPUContext.ts` で初期化
* `ResizeObserver` で親要素のサイズ変化を監視し、`canvas.width/height` を
  `devicePixelRatio` を考慮して更新（spec §6.6, §10.3）。サイズを更新した直後に
  `onResolutionChange(width, height)` を呼び、`StatusBar` の Resolution 表示に反映する
* 内部状態として次の判別可能 union 型で `gpuRef` を持つ（`pipeline` と `bindGroup` は
  常にペアで存在するか、揃って無いかのどちらかであることを型で保証し、
  片方だけ null になる中間状態を作らせない）:

  ```ts
  type GpuState = {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    uniformBuffer: GPUBuffer;
  } & (
    | { pipeline: null; bindGroup: null }
    | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
  );

  const gpuRef = useRef<GpuState | null>(null);
  ```

  合わせて以下の ref を持つ:
  * `isFirstRunEffectRef = useRef(true)` — Run 起因の再コンパイル用エフェクトが
    初回マウント時の呼び出しをスキップするために使う
  * `lifecycleGenerationRef = useRef(0)` — **初期化エフェクトのマウント/アンマウント単位**の
    世代管理専用。StrictMode の2回実行時に、古い世代の非同期初期化処理が
    cleanup 後に完了しても `gpuRef` 更新・`renderLoop` 開始・`device.lost` ハンドリングを
    行わせないために使う（初期化エフェクトの cleanup でインクリメントする）
  * `compileSeqRef = useRef(0)` — **`compile()` の呼び出し1回ごと**に発行する連番。
    `lifecycleGenerationRef` とは別物として扱う（後述の理由により混在させない）。
    `compile()` 開始時に `const myCompileSeq = ++compileSeqRef.current` を発行し、
    `createShaderPipeline` の await 完了後に `compileSeqRef.current !== myCompileSeq`
    であれば（＝この compile の後により新しい compile が開始済み）結果を破棄して return する。
    こうすることで、連打された `Run` のうち古い方の非同期処理が後から解決して
    新しい結果を上書きする逆転を防ぐ。`lifecycleGenerationRef` を compile ごとにも
    インクリメントしてしまうと `device.lost` の監視世代まで巻き込んで無効化されてしまうため、
    2つのカウンタは独立させる

  共通のコンパイル処理は `compile(wgslSourceCode: string)` という1つの関数にまとめ、
  以下の2エフェクトから呼ぶ:

  1. **初期化エフェクト** `useEffect(() => { ... }, [])`
     1. `const myLifecycle = ++lifecycleGenerationRef.current;` を記録
     2. `createWebGPUContext(canvas)` を await（失敗時は spec §11.2 のメッセージ表示に切り替えて終了）
     3. await 完了後、`lifecycleGenerationRef.current !== myLifecycle` なら
        （cleanup が既に走り世代が進んでいる = このエフェクトは破棄済み）
        取得できた `device` を直ちに `device.destroy()` して return する
        （`gpuRef` の更新や `renderLoop` 開始は一切行わない）
     4. 世代が一致していれば `createUniformBuffer(device)` で uniform buffer を作成し、
        `gpuRef.current = { device, context, format, uniformBuffer, pipeline: null, bindGroup: null }`
        として保持する
     5. `compile(codeRef.current)` を実行する（spec §10.1 の 6〜8 の順序に対応。
        GPU 初期化が終わる前に compile が走ることはない）。
        成功すれば `gpuRef.current` が `{ pipeline, bindGroup }` を持つ union 側に置き換わる。
        **失敗した場合は `pipeline: null, bindGroup: null` のまま処理を続行する**
        （初回コンパイルに失敗するケースは通常発生しないが、発生した場合でも
        アプリ全体をクラッシュさせないため）
     6. compile の成否に関わらず `renderLoop` を開始する（spec §10.1 の9）。
        `renderLoop`（§6.5）は毎フレーム `gpuRef.current.pipeline` が `null` かどうかを見て、
        `null` の場合は uniform buffer への書き込みや FPS 計測は行ってよいが、
        render pass の開始・`setPipeline`・`setBindGroup`・`draw`・`submit` は一切行わない
        （canvas は直前の内容のまま何も描画しない）。`pipeline` が非 null であれば
        型上 `bindGroup` も必ず非 null なので、`renderLoop` 側で
        `bindGroup` の null チェックを別途行う必要はない
     7. `device.lost` を監視する。`await device.lost` が解決した際、
        `lifecycleGenerationRef.current !== myLifecycle` なら何もしない（cleanup による
        意図的な `device.destroy()` 起因の解決を無視する。`GPUDeviceLostInfo.reason`
        が `'destroyed'` の場合も同様に無視してよい）。世代が一致し、
        かつ `reason !== 'destroyed'`（＝意図しない device lost）の場合のみ
        `renderLoop` を停止し spec §11.3 のメッセージを表示する
     8. cleanup: `lifecycleGenerationRef.current` をインクリメントして現在の世代を無効化した上で、
        `renderLoop` を停止し、`ResizeObserver.disconnect()`、
        （`gpuRef.current` が存在すれば）`device.destroy()` を行う
        （StrictMode の2回実行でも安全にするため、§4 参照）

  2. **再コンパイルエフェクト** `useEffect(() => { ... }, [shouldCompile])`
     1. `isFirstRunEffectRef.current` が `true` なら、それを `false` にするだけで何もせず return
        （マウント時に必ず1回走る分をスキップし、初期化エフェクト側の初期コンパイルと
        重複させない）
     2. 2回目以降（＝ `Run` 押下由来の変化）は `gpuRef.current` が存在する場合のみ
        `compile(codeRef.current)` を呼ぶ（`gpuRef.current` が無い＝初期化未完了または
        WebGPU 非対応の場合は何もしない）

  `compile(wgslSourceCode)` の処理内容（`compileSeqRef` を使った古い結果の破棄に加え、
  `lifecycleGenerationRef` も確認することで、cleanup 済み世代の初回 compile が
  後から `gpuRef` や callback に反映されないようにする）:
  1. `const myCompileSeq = ++compileSeqRef.current;` と
     `const myLifecycle = lifecycleGenerationRef.current;` を発行・記録する
  2. `shaderWrapper` でユーザーコードを完全な WGSL に変換
  3. `createShaderPipeline` でコンパイルを試行（`gpuRef.current.uniformBuffer` を渡す）
  4. 成功・失敗（例外）いずれの経路でも、後続の状態更新・callback 呼び出しの**直前**に
     `compileSeqRef.current !== myCompileSeq || lifecycleGenerationRef.current !== myLifecycle`
     を確認し、どちらか一方でも不一致なら（＝より新しい compile が開始済み、または
     このコンポーネントインスタンス自体が既に cleanup 済み）何もせず return する
  5. 成功: 上記チェックを通過すれば `gpuRef.current` を
     `{ ...gpuRef.current, pipeline, bindGroup }` に差し替え、`onCompileSuccess()` を呼ぶ
  6. 失敗: 上記チェックを通過すれば、何も差し替えず（＝既存の直近成功 pipeline / bindGroup、
     またはまだ無ければ `{ pipeline: null, bindGroup: null }` を維持）、
     `onCompileError(message)` を呼ぶ
* 毎フレーム: `requestAnimationFrame` ループ内で `time`/`resolution` を uniform buffer に書き込み、
  FPS を計測し 0.5〜1 秒間隔で `onFpsChange` を呼ぶ。render pass の実行可否は上記6の
  `pipeline` null チェックのルールに従う（詳細な実行手順は §6.5 を参照。
  §6.5 の「毎フレーム実行する処理」は `pipeline` が非 null の場合の手順として読む）
* WebGPU 非対応時: `navigator.gpu` が無ければ canvas の代わりにメッセージ表示（spec §11.2）
* device lost 時: 描画ループを停止しメッセージ表示（spec §11.3、詳細は上記1-7参照）
* Props 拡張: spec §15.3 の `PreviewPaneProps` に `onGpuInfo` を追加(§4, §7.3 参照)

### 5.4 StatusBar（spec §15.4）

* spec §15.4 の `StatusBarProps` に `gpuName` は既にオプショナルで定義済み
* `Backend` は固定文字列 `WebGPU`
* `WGSL Version` は固定文字列 `WGSL`（§1.1 の表に準拠、バージョン番号は付けない）
* 色だけに依存しないよう、Compile 状態はテキスト（`Success`/`Error`）+ 色アイコンの併用（spec §19）

### 5.5 ErrorPanel（spec §11.1, ディレクトリ構成のみで詳細責務は spec に明記なし）

* Props: `{ message: string | null }`
* `EditorPane` 直下に配置し、`message` が非 null の間だけ表示
* エラーメッセージは WebGPU の `GPUCompilationMessage` をそのまま整形して表示（行番号はラップ後
  コードの行番号になるため、§16 の変換によるズレをユーザーに伝える注記を添える。詳細は §6.4）

---

## 6. gpu/ モジュール設計

### 6.1 createWebGPUContext.ts

```ts
type WebGPUContext = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  adapterInfo?: GPUAdapterInfo;
};

async function createWebGPUContext(canvas: HTMLCanvasElement): Promise<WebGPUContext>;
```

処理内容は spec §10.1 の 1〜5 に対応。`navigator.gpu` が無い場合や adapter/device 取得失敗時は
呼び出し側（`PreviewPane`）で catch し、spec §11.2 のメッセージを表示する。

### 6.2 createUniformBuffer.ts

* WGSL の uniform address space のアラインメントルールに従いバッファレイアウトを決める:
  `time: f32`（オフセット 0, 4byte）+ `resolution: vec2f`（`vec2f` は 8byte アラインのため
  オフセット 8 から配置、`time` と `resolution` の間に 4byte のパディングが入る）。
  合計 16byte を `GPUBufferDescriptor.size` として確保する
  （`Float32Array(4)` = `[time, 0 (padding), width, height]` として書き込む）
* `updateUniforms(buffer, device, time, width, height)` のような更新用関数もここに含める

### 6.3 createShaderPipeline.ts

```ts
type CreatePipelineInput = {
  device: GPUDevice;
  format: GPUTextureFormat;
  wgsl: string;
  uniformBuffer: GPUBuffer;
};

type CreatePipelineOutput = {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
};

async function createShaderPipeline(input: CreatePipelineInput): Promise<CreatePipelineOutput>;
```

* **前提（MVP のスコープ限定）**: §6.4.1 で定めた通り、MVP はユーザーコードが
  `@group(0) @binding(0)` の uniform 宣言（spec §9 の初期コードと同一シグネチャ）を
  含んでいることを前提とする。「uniform を一切使わないシェーダー」を正常系として
  サポートすることは MVP のスコープ外とし、その場合に発生するエラーは
  以下の生成手順内で発生する例外としてそのまま扱う（＝通常のコンパイル失敗と同列に
  「直前の成功シェーダーを維持」する）。これにより bind group の有無で分岐する
  複雑な null 処理を避け、`bindGroup` は常に非 null の値として扱えるようにする
* 生成手順（失敗検知を確実にするため以下の順で実施する。`try/finally` で必ず
  `popErrorScope` を回収し、途中で例外が出てもエラースコープが残留しないようにする）:
  1. `const shaderModule = device.createShaderModule({ code: wgsl })`
  2. `await shaderModule.getCompilationInfo()` を確認し、`type === 'error'` の
     メッセージが1件でもあれば、そのメッセージ群を整形して例外として投げる
     （構文エラーの大半はここで捕捉できる）
  3. `device.pushErrorScope('validation')` を呼んだ上で
     `await device.createRenderPipelineAsync({ layout: 'auto', ... })` を実行する
     （entry point 不一致や binding レイアウト不整合など、
     `getCompilationInfo` では拾えない pipeline 生成時エラーに対応するため）
  4. `const pipelineError = await device.popErrorScope()` を確認し、
     `pipelineError` が非 null なら例外として投げる
  5. `pipeline.getBindGroupLayout(0)` を呼ぶ（ユーザーコードが `@group(0)` を
     宣言していない場合はここで例外が投げられる。これは想定内の失敗として
     そのまま呼び出し元に伝播させ、通常のコンパイル失敗と同様に扱う）
  6. `device.pushErrorScope('validation')` を呼んだ上で `device.createBindGroup(...)`
     を実行する（`layout: 'auto'` の場合、ユーザーが binding 番号や `var<uniform>` の型を
     独自に変更していても `getBindGroupLayout(0)` 自体は成功することがあり、
     実際の不整合は `createBindGroup` 呼び出し時に validation error として
     発生しうるため）
  7. `const bindGroupError = await device.popErrorScope()` を確認し、
     `bindGroupError` が非 null なら例外として投げる
  8. ここまで到達したら bind group layout は shader ごとに変わりうるため、
     pipeline 差し替え時は bind group も必ず新しいものを返す
     （呼び出し元で使い回すと `renderLoop` 側で invalid bind group エラーになる）
* 呼び出し側（`PreviewPane`）は、上記いずれかの段階で例外が投げられた場合は
  spec §6.2 の失敗フロー（直前の成功 pipeline + bind group を維持）に従う。
  成功した場合のみ `{ pipeline, bindGroup }` をペアで差し替える
  （`pipeline` と `bindGroup` は常にセットで存在する。片方だけ null/非 null になる
  中間状態は作らない。詳細な型は §5.3 の判別可能 union を参照）
* full screen triangle 用に vertex buffer 不要の pipeline とする（spec §10.2）

### 6.4 shaderWrapper.ts（spec §16 準拠）

```ts
type ShaderWrapperInput = { userCode: string };
type ShaderWrapperOutput = { wgsl: string };

function wrapShader(input: ShaderWrapperInput): ShaderWrapperOutput;
```

* spec §16.3 のテンプレートに `userCode` を埋め込むだけの単純な文字列結合とする
  （spec §7.3 のデメリット「内部でコード結合処理が必要」を最小実装で満たす）

#### 6.4.1 uniform 宣言の注入方針（重要・仕様の曖昧さの解消）

spec §7.3 の説明文だけを読むと「アプリ側が uniform binding を補完する」ため wrapper が
`struct Uniforms` / `var<uniform> uniforms` の宣言を注入するように読めるが、
spec §9 の初期コード（実際にエディターへ表示される内容）には既に
`struct Uniforms {...}` と `@group(0) @binding(0) var<uniform> uniforms: Uniforms;` が
**ユーザーコードの一部として** 含まれており、かつ spec §16.3 の変換後テンプレートは
`// user code` の直後に `VertexOutput` / `vertexMain` / `fragmentMain` を追記するだけで、
uniform 宣言を追加する処理は含まれていない。

したがって本計画では次のように解釈を確定する:

* `wrapShader` は **uniform 宣言をコード生成しない**。ユーザーが書く `userCode` に
  `struct Uniforms` と `@group(0) @binding(0) var<uniform> uniforms: Uniforms;` を
  含めることを前提とする（spec §9 の初期コードがその前提で書かれている）
* spec §7.3 の「ユーザーが書くコード例」（`mainImage` のみの短いコード）は
  wrapper の入出力を説明するための簡略化された例示であり、そのままでは
  `uniforms` 識別子が未定義でコンパイルエラーになる。この点は spec 上の記載の揺れであり、
  実装は §9（実際の初期コード・エディター初期表示）を正とする
* Bind group layout は固定レイアウトを事前定義せず、`layout: 'auto'` で
  `createRenderPipelineAsync` に生成させる（詳細は §6.3 改訂版）。
  ユーザーが uniform 宣言を書き換えて binding 番号や型を変えた場合はコンパイル/pipeline/
  bind group いずれかの作成が失敗し、spec §6.2 の失敗フロー（エラー表示 + 直前の成功シェーダー維持）で処理する
* **MVP のユーザー向け仕様として明記する内容**: 「`time` / `resolution` の uniform を使いたい場合は、
  spec §9 の初期コードにある `struct Uniforms` と `@group(0) @binding(0) var<uniform> uniforms: Uniforms;`
  の宣言をそのままコードに含めること。宣言を削除すると `uniforms` は参照できない
  （その場合 wrapper は何も注入しないため未定義識別子エラーになる）」。
  これにより spec §7.3 が意図する「短い `mainImage` だけで試せる」体験は、
  初期コードをベースに一部を書き換える形で実現し、ゼロから uniform 宣言を省略した
  コードを書くことは MVP ではサポート対象外とする

* spec §17 の最低限バリデーションをここで実施:
  * `userCode.trim()` が空でないこと → 空なら `Error('Shader code is empty')`
  * `userCode.includes('mainImage')` の簡易チェック → 含まれなければ
    `Error("mainImage function not found")`
  * これ以上の厳密な構文チェックは行わない（spec §17 準拠）
* 生成した wgsl 文字列内で `userCode` が何行目から始まるかを返却値に含めておくと
  ErrorPanel 側の行ずれ注記に使えるが、spec に明記が無いため MVP では実装しない
  （§21 将来拡張「エディター上のエラー行ハイライト」で対応する想定とし、
  現時点ではエラーメッセージのみ表示する）

### 6.5 renderLoop.ts

* `requestAnimationFrame` ベースのループを開始/停止できる関数を提供
  （`PreviewPane` の unmount 時に確実に `cancelAnimationFrame` する）
* 毎フレーム、まず `gpuRef.current.pipeline` が非 null かどうかを確認する
  （§5.3 で定めた判別可能 union のガード）。**非 null の場合のみ** spec §10.3 の
  1〜9（uniform buffer 更新 → command encoder 作成 → render pass 開始 →
  pipeline/bind group 設定 → 描画 → render pass 終了 → submit）を実行する。
  `null` の場合は render pass 以降（3〜9）を丸ごとスキップする
  （何も描画しないが、ループ自体は継続する）
* FPS 計測はループ内でフレーム数をカウントし、0.5〜1 秒ごとに `onFpsChange` を呼ぶ
  （`pipeline` が null で描画をスキップしているフレームもカウントに含めてよい）

---

## 7. 実装フェーズ

### Phase 0: プロジェクト初期化

* Vite プロジェクト作成、依存関係インストール、`tsconfig` に `@webgpu/types` 追加
* 完了条件: `npm run dev` で空の React アプリが起動する

### Phase 1: 静的レイアウト

* `Header` / `EditorPane`（プレーン textarea で仮実装）/ `PreviewPane`（canvas のみ）/
  `StatusBar` を spec §5, §12 のレイアウト比率（Editor 45% / Preview 55%）で配置
* ダークテーマの配色（spec §12.1）を CSS 変数として定義
* 完了条件: 画像イメージに近い静的な画面が表示される（機能なし）

### Phase 2: WebGPU 初期化と固定シェーダー描画

* `createWebGPUContext` / `createUniformBuffer` / `createShaderPipeline` / `renderLoop` を実装
* spec §9 の初期コードをハードコードした状態で、`shaderWrapper` を通して描画できることを確認
* 完了条件: アプリ起動時に初期シェーダーがアニメーションして表示される（MVP §22 の一部達成）

### Phase 3: CodeMirror エディター統合

* Phase 1 の仮 textarea を CodeMirror ベースの `EditorPane` に置き換え
* WGSL 風シンタックスハイライト（§5.2）を実装
* 完了条件: エディターでコード編集・タブ入力・Undo/Redo ができる

### Phase 4: Run / Reset / Save 機能

* `Run`: `shouldCompile` トリガー → `PreviewPane` 内でコンパイル・pipeline 差し替え
* `Reset`: `code` state を `constants/defaultShader.ts` の内容に戻す（確認ダイアログなし）
* `Save`: `Blob` + `URL.createObjectURL` で `shader.wgsl` をダウンロード（spec §6.4）
* キーボードショートカット: `Ctrl/Cmd+Enter` → Run, `Ctrl/Cmd+S` → Save（spec §20、
  ブラウザ標準の保存ダイアログを止めるため `preventDefault` が必須）
* 完了条件: 3つのボタンと対応するショートカットが仕様通りに動作する

### Phase 5: ステータス表示とエラーハンドリング

* `StatusBar` の Compile/FPS/Resolution/GPU/Backend/WGSL Version 表示
* `ErrorPanel` でコンパイルエラーメッセージ表示（spec §11.1）
* WebGPU 非対応メッセージ（spec §11.2）、device lost メッセージ（spec §11.3）
* 完了条件: spec §11 の3パターンすべてが表示される

### Phase 6: アクセシビリティ・仕上げ

* 各ボタンに `aria-label` 付与、キーボードフォーカス順の確認（spec §19）
* Resize 時の即時追従確認（spec §18 の性能要件）
* `Fit` ドロップダウン（§1.1 の扱いに従い最小実装）、Preview のフルスクリーンボタン実装
* 完了条件: spec §22 の MVP 完了条件を全項目満たす

---

## 8. 検証方法

* 型チェック: `tsc --noEmit`
* ビルド確認: `npm run build`（Vite の本番ビルドが通ることを確認する）
* 手動確認: Chrome/Edge 等 WebGPU 対応ブラウザで実際に起動し、
  * 初期シェーダー描画・アニメーションの確認
  * コード編集 → Run → 反映確認
  * 意図的な構文エラーを入力 → Run → Compile: Error 表示 → 直前の描画維持を確認
  * Reset → 初期コードに戻ることを確認
  * Save → `.wgsl` ファイルがダウンロードされることを確認
  * ウィンドウリサイズ → Resolution 表示と canvas 追従を確認
  * WebGPU 非対応ブラウザ（Firefox 通常版等）でメッセージ表示を確認
* 自動テストは spec に要件が無いため MVP では追加しない
  （将来的に `shaderWrapper` の純粋関数部分のみ unit test 化は容易）

---

## 9. 未決事項（ユーザー確認推奨）

1. §1.1 の image.png 独自要素（テーマ切替・パネル分割・複数タブ・GPU 詳細名表示・
   WGSL バージョン番号表示）を本当に実装しないで良いか
2. `GPUAdapterInfo` はブラウザによって取得できる情報が異なる（Chrome では `description` が
   空文字のことがある）。取得できない場合の表示文言を `Unknown` で良いか
