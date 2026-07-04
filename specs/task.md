# WGSL Shader Playground — タスクリスト

`specs/plan.md`（codex レビュー承認済み）に基づく実装タスク。
上から順に着手する。各タスクは完了条件（DoD）を満たしたらチェックを付ける。

---

## Phase 0: プロジェクト初期化

- [ ] **T0-1: Vite プロジェクト作成**
  - `npm create vite@latest . -- --template react-ts` でリポジトリ直下に作成
  - DoD: `npm run dev` で空の React アプリが起動する

- [ ] **T0-2: 依存関係の追加**
  - `codemirror`, `@codemirror/view`, `@codemirror/state`, `@codemirror/language`,
    `@codemirror/commands`, `@codemirror/theme-one-dark`, `@codemirror/legacy-modes`
  - devDependencies: `@webgpu/types`
  - DoD: `npm install` が成功し、`package.json` に全依存が記載されている

- [ ] **T0-3: TypeScript 設定**
  - `tsconfig.json` の `compilerOptions.types` に `@webgpu/types` を追加
  - DoD: `.ts` ファイル内で `GPUDevice` 等の型が解決され `tsc --noEmit` が通る

---

## Phase 1: 静的レイアウト

- [ ] **T1-1: ダークテーマの CSS 変数定義**（plan §7 Phase 1, spec §12.1）
  - 背景（黒に近い濃紺/チャコール）/ パネル / 境界線 / アクセント紫 / 成功緑 /
    エラー赤 / テキスト白 / 補足グレー を CSS 変数として定義
  - 最小画面幅 1024px（spec §12.3）
  - DoD: CSS 変数が定義され、全コンポーネントから参照可能

- [ ] **T1-2: App レイアウト骨格**（spec §5.1, §12.2）
  - Header / Editor 45% / Preview 55% / StatusBar の grid レイアウト
  - DoD: 4領域が仕様比率で表示される

- [ ] **T1-3: Header コンポーネント（静的）**（plan §5.1, spec §5.2）
  - ロゴアイコン + `WGSL Playground` + `Write and preview WGSL shaders in real time.`
  - Run（Ctrl+Enter 併記）/ Reset / Save ボタン（`⋮` メニューは置かない）
  - Props: `HeaderProps { onRun, onReset, onSave }`（この時点でハンドラは空でよい）
  - DoD: image.png に近い見た目のヘッダーが表示される

- [ ] **T1-4: EditorPane 仮実装（textarea）**（plan §7 Phase 1）
  - セクションタイトル `Editor` + ファイルタブ `shader.wgsl`（固定1つ、+/× は置かない）
  - プレーン `<textarea>` で `code` / `onChange` の制御コンポーネントとして動作
  - DoD: 初期コード（spec §9）が表示され編集できる

- [ ] **T1-5: PreviewPane 骨格（canvas のみ）**
  - セクションタイトル `Preview` + `<canvas>` 配置
  - Fit ドロップダウン / フルスクリーンボタンの見た目のみ配置（機能は Phase 6）
  - DoD: canvas が Preview 領域いっぱいに表示される

- [ ] **T1-6: StatusBar コンポーネント（静的）**（plan §5.4, spec §5.5）
  - Compile / FPS / Resolution / GPU / Backend: `WebGPU` / WGSL Version: `WGSL` を表示
  - Props: `StatusBarProps { compileStatus, fps, resolution, gpuName? }`
  - DoD: ダミー値で全項目が表示される

- [ ] **T1-7: constants/defaultShader.ts**（spec §9, plan §6.4.1）
  - spec §9 の初期コードを文字列定数として定義（image.png 内のコードは使わない。plan §1.1）
  - 初期コード冒頭のコメントに、plan §6.4.1 のユーザー向け仕様を明記する:
    「`time` / `resolution` の uniform を使うには、この `struct Uniforms` と
    `@group(0) @binding(0) var<uniform> uniforms: Uniforms;` の宣言を
    コードに残すこと（アプリ側は uniform 宣言を自動注入しない）」
  - 同内容を README にも記載する（ユーザー向け仕様の担保先はこの2箇所とする）
  - DoD: `App` の `code` state 初期値として使われ、初期コードのコメントと README の
    両方で uniform 宣言の必要性が説明されている

---

## Phase 2: WebGPU 初期化と固定シェーダー描画

- [ ] **T2-1: gpu/shaderWrapper.ts**（plan §6.4, spec §16）
  - `wrapShader({ userCode }): { wgsl }` — spec §16.3 テンプレートとの文字列結合
  - uniform 宣言は注入しない（ユーザーコード側に含める前提。plan §6.4.1）
  - バリデーション: 空コード → `Error('Shader code is empty')`、
    `mainImage` 不在 → `Error('mainImage function not found')`（spec §17）
  - DoD: 初期コードを渡すと vertex/fragment entry point 付きの完全な WGSL が返る

- [ ] **T2-2: gpu/createWebGPUContext.ts**（plan §6.1, spec §10.1 手順1〜5）
  - `navigator.gpu` 確認 → adapter → device → canvas context → configure
  - 戻り値: `{ device, context, format, adapterInfo? }`
  - DoD: WebGPU 対応ブラウザで context が取得でき、非対応では例外が投げられる

- [ ] **T2-3: gpu/createUniformBuffer.ts**（plan §6.2）
  - 16byte（`[time, padding, resolution.x, resolution.y]`）のバッファ作成
  - `updateUniforms(buffer, device, time, width, height)` 更新関数
  - DoD: WGSL の `struct Uniforms { time: f32, resolution: vec2f }` と
    レイアウトが一致する（uniform address space のアラインメント準拠）

- [ ] **T2-4: gpu/createShaderPipeline.ts**（plan §6.3）
  - 入力 `{ device, format, wgsl, uniformBuffer }` → 出力 `{ pipeline, bindGroup }`（両方非 null）
  - 手順: createShaderModule → getCompilationInfo でエラー検査 →
    pushErrorScope('validation') → createRenderPipelineAsync({ layout: 'auto' }) →
    popErrorScope 検査 → getBindGroupLayout(0) →
    pushErrorScope → createBindGroup → popErrorScope 検査
  - `try/finally` でエラースコープの残留を防ぐ
  - 失敗はすべて例外として投げる（uniform 未使用シェーダーも失敗扱い。MVP スコープ外）
  - DoD: 正常な WGSL で pipeline+bindGroup が返り、壊れた WGSL で
    エラーメッセージ付き例外が投げられる

- [ ] **T2-5: gpu/renderLoop.ts**（plan §6.5）
  - `requestAnimationFrame` ループの開始/停止関数
  - 毎フレーム: `pipeline` 非 null チェック → uniform 更新 → encoder →
    render pass → setPipeline → setBindGroup → draw(3) → submit
  - `pipeline` が null なら render pass 以降をスキップ（ループは継続）
  - FPS カウント（0.5〜1秒ごとに `onFpsChange`。スキップフレームも含めてよい）
  - DoD: full screen triangle が描画され time でアニメーションする

- [ ] **T2-6: PreviewPane への WebGPU 統合**（plan §5.3 — 本計画の中核。設計を厳守）
  - `GpuState` 判別可能 union 型（pipeline/bindGroup は常にペア）で `gpuRef` を保持
  - `lifecycleGenerationRef`（マウント世代）/ `compileSeqRef`（compile 連番）/
    `isFirstRunEffectRef` を導入
  - 初期化エフェクト `useEffect([], ...)`: 世代記録 → createWebGPUContext →
    世代チェック（不一致なら device.destroy して return）→ createUniformBuffer →
    gpuRef 保持 → `compile(codeRef.current)`（code は codeRef 経由で参照。
    plan §5.3 のエッジトリガー設計に準拠）→ 成否に関わらず renderLoop 開始 →
    device.lost 監視（世代一致 && reason !== 'destroyed' のみ spec §11.3 表示）
  - cleanup: 世代インクリメント → renderLoop 停止 →
    ResizeObserver.disconnect（observer が存在する場合。導入自体は T2-7）→
    device.destroy（StrictMode 2回実行に耐える）
  - `compile()`: compileSeq+lifecycle 両方を状態更新・callback 直前にチェック、
    成功時のみ pipeline/bindGroup をペアで差し替え
  - WebGPU 非対応時: spec §11.2 のメッセージ表示
  - DoD: 起動時に初期シェーダーがアニメーション描画される。
    StrictMode の dev 環境でエラーや二重描画が起きない

- [ ] **T2-7: ResizeObserver によるリサイズ追従**（plan §5.3, spec §6.6）
  - 親要素サイズ変化を検知 → `canvas.width/height` を devicePixelRatio 考慮で更新 →
    直後に `onResolutionChange(width, height)` を呼ぶ
  - T2-6 の初期化エフェクトの cleanup に `ResizeObserver.disconnect()` を組み込む
  - DoD: ウィンドウリサイズで canvas 解像度が即座に追従し、
    unmount（StrictMode の再マウント含む）で observer がリークしない

---

## Phase 3: CodeMirror エディター統合

- [ ] **T3-1: src/editor/wgslLanguage.ts**（plan §5.2）
  - `@codemirror/legacy-modes/mode/clike` の `c` 定義をベースに
    WGSL 予約語（`fn`, `let`, `var`, `struct`, `@vertex`, `@fragment`, `@group`,
    `@binding`, `vec2f`, `vec3f`, `vec4f`, `f32`, `u32` 等）を拡張
  - DoD: WGSL コードにシンタックスハイライトが付く

- [ ] **T3-2: EditorPane を CodeMirror 6 に置き換え**（plan §5.2, spec §5.3）
  - `useRef` で `EditorView` を保持し、`code` prop 変更は `dispatch` で差分同期
    （再生成しない）
  - 拡張: `lineNumbers()`, `highlightActiveLine()`, `history()` + `historyKeymap`,
    `indentWithTab`, 等幅フォント, oneDark ベースのテーマ
  - Props は spec §15.2 の `EditorPaneProps { code, onChange }` のみ
  - DoD: 行番号・現在行ハイライト・タブ入力・Undo/Redo・コピペが動作する

---

## Phase 4: Run / Reset / Save 機能

- [ ] **T4-1: Run 実装**（plan §4, spec §6.2）
  - `App` で `setShouldCompile(prev => !prev)`（エッジトリガー、後始末なし）
  - `PreviewPane` の再コンパイルエフェクト: `isFirstRunEffectRef` で初回スキップ →
    `gpuRef.current` 存在時のみ `compile(codeRef.current)`
  - `code` 最新値は `codeRef` 経由で参照（依存配列に `code` を入れない）
  - DoD: コード編集 → Run で描画が更新される。編集だけでは更新されない。
    Run 連打でも最後のコンパイル結果が勝つ

- [ ] **T4-2: Reset 実装**（spec §6.3）
  - 確認ダイアログなしで `code` を `defaultShader` に戻す。自動実行しない
  - DoD: Reset 押下でエディターが初期コードに戻り、プレビューは変わらない

- [ ] **T4-3: Save 実装**（spec §6.4）
  - `Blob`（`text/plain`）+ `URL.createObjectURL` で `shader.wgsl` をダウンロード
  - DoD: Save 押下で現在のコードが `shader.wgsl` として保存される

- [ ] **T4-4: キーボードショートカット**（spec §20）
  - `Ctrl/Cmd + Enter` → Run、`Ctrl/Cmd + S` → Save（`preventDefault` 必須）
  - CodeMirror にフォーカスがある状態でも効くこと（keymap または window リスナー）
  - DoD: 両ショートカットがエディター内外で動作し、ブラウザの保存ダイアログが出ない

---

## Phase 5: ステータス表示とエラーハンドリング

- [ ] **T5-1: コンパイルステータス連携**（spec §6.2, §11.1）
  - `onCompileSuccess` / `onCompileError` → `compileStatus` / `errorMessage` state 更新
  - StatusBar: `Compile: Success`（緑）/ `Compile: Error`（赤）+ テキスト併記（spec §19）
  - DoD: 成功/失敗がステータスバーに正しく反映される

- [ ] **T5-2: ErrorPanel**（plan §5.5, spec §11.1）
  - `{ message: string | null }` — EditorPane 直下、非 null 時のみ表示
  - `GPUCompilationMessage` 整形表示 + 行番号ズレの注記
  - DoD: 構文エラー時にエディター下部へエラーメッセージが出て、
    直前の正常描画は維持される

- [ ] **T5-3: FPS / Resolution 表示**（spec §6.5, §6.6）
  - `onFpsChange`（0.5〜1秒間隔）→ `FPS: 60.0` 形式
  - `onResolutionChange` → `Resolution: 1280 x 720` 形式（devicePixelRatio 考慮値）
  - DoD: 実測値がステータスバーに表示され、リサイズで Resolution が変わる

- [ ] **T5-4: GPU 名表示**（plan §1.1, §4）
  - `PreviewPaneProps` に `onGpuInfo` を追加、`GPUAdapterInfo` から取得
    （取得不可なら `Unknown`）
  - DoD: ステータスバーに GPU 名または `Unknown` が表示される

- [ ] **T5-5: WebGPU 非対応 / device lost 表示**（spec §11.2, §11.3, plan §5.3 手順7）
  - 非対応: `WebGPU is not supported in this browser. Please use a browser that supports WebGPU.`
  - device lost（世代一致 && reason !== 'destroyed' のみ）:
    `GPU device was lost. Please reload the page.` を表示し、renderLoop を停止する
  - DoD:
    - Firefox 通常版等で非対応メッセージが表示される
    - device lost 時にメッセージ表示と描画停止が行われる
      （検証は `device.destroy()` を意図的に呼ぶのではなく、開発中に一時的な
      テストコードで `device.lost` ハンドラへ `reason: 'unknown'` 相当の経路を
      通すか、about:gpucrash 等のブラウザ機能で確認する）
    - cleanup 由来の `device.destroy()`（reason === 'destroyed'）では
      メッセージが表示されない（StrictMode の dev 環境で誤表示が出ないことで確認）

---

## Phase 6: アクセシビリティ・仕上げ

- [ ] **T6-1: アクセシビリティ対応**（spec §19）
  - 全ボタンに `aria-label`、Run/Reset/Save へのキーボードフォーカス
  - Compile 状態は色 + テキストの併用
  - DoD: Tab キーで全ボタンにフォーカスでき、スクリーンリーダーでボタンの役割が読める

- [ ] **T6-2: Fit ドロップダウン**（plan §1.1, spec §5.4）
  - 選択肢 `Fit` のみの表示倍率メニュー（最小実装）
  - DoD: メニューが開閉でき `Fit` が選択状態

- [ ] **T6-3: フルスクリーンボタン**（plan §1.1, spec §5.4）
  - Fullscreen API で Preview 領域を全画面化。全画面中もリサイズ追従（T2-7 が効くこと）
  - DoD: 全画面化・解除ができ、解像度表示も追従する

- [ ] **T6-4: 最終検証**（plan §8, spec §18, §22）
  - `tsc --noEmit` / `npm run build` が通る
  - MVP 完了条件（spec §22 の全10項目）を手動確認:
    1. 左に WGSL エディター表示
    2. 右に WebGPU canvas 表示
    3. 初期 shader 描画
    4. Run でコード反映
    5. コンパイル成功/失敗表示
    6. time アニメーション
    7. resolution 追従
    8. Reset で初期コード復元
    9. Save で .wgsl 保存
    10. WebGPU 非対応ブラウザでメッセージ表示
  - パフォーマンス要件（spec §18）を手動確認:
    - 初期表示が 3 秒以内（DevTools の Network/Performance タブで確認）
    - Run 押下からプレビュー反映まで 1 秒以内（目標）
    - 初期シェーダー（軽量 shader）でステータスバーの FPS が 60 付近を維持
    - ウィンドウリサイズ後、canvas サイズが即座に更新される
  - DoD: 全項目パス

---

## 依存関係

```text
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

- T2-1〜T2-5（gpu/ モジュール）は互いに独立して書けるが、T2-6 の統合には全部必要
- T3-1 → T3-2 の順
- T4-1 は T2-6 完了が前提
- T5-1〜T5-5 は T4-1 完了後にまとめて着手可能
- T6-3 は T2-7 完了が前提

## 未決事項（実装前にユーザー確認推奨・plan §9）

1. image.png 独自要素（テーマ切替・パネル分割・複数タブ・WGSL バージョン番号表示）を
   実装しない方針で確定してよいか
2. GPU 名が取得できない場合の表示文言は `Unknown` でよいか
