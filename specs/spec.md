# WGSL Shader Playground 仕様書

## 1. 概要

WGSL Shader Playground は、ブラウザ上で WGSL のコードを書き、リアルタイムに WebGPU の描画結果を確認できるシンプルなシェーダー実験用ツールである。

Shadertoy の WGSL 版のような体験を目指すが、初期バージョンでは最低限の機能に絞り、左側にコードエディター、右側にプレビューを表示する構成とする。

---

## 2. 目的

* WGSL のコードをすぐに試せるようにする
* コード変更後、プレビューで描画結果を確認できるようにする
* `time` や `resolution` など、シェーダー制作に最低限必要な値をホスト側から渡す
* 将来的に Shadertoy 風の共有・保存・サンプル機能を追加できる構造にする

---

## 3. 想定ユーザー

* WebGPU / WGSL を学習したい開発者
* プロシージャルグラフィックスを試したい開発者
* Shadertoy のような環境で WGSL を書きたいユーザー
* Web 上で簡単にシェーダーのプロトタイプを作りたいユーザー

---

## 4. 対象範囲

### 初期リリースで実装する範囲

* WGSL コードエディター
* WebGPU によるプレビュー表示
* Run ボタンによる手動コンパイル・実行
* Reset ボタンによる初期コードへの復元
* Compile 成功 / 失敗ステータス表示
* FPS 表示
* 解像度表示
* `time` / `resolution` uniform の提供

### 初期リリースでは実装しない範囲

* ユーザーアカウント
* クラウド保存
* 作品公開
* コメント機能
* Like / Favorite
* テクスチャ入力
* 音声入力
* マルチパスレンダリング
* Compute shader 実行環境
* モバイル最適化

---

## 5. 画面構成

## 5.1 全体レイアウト

画面はデスクトップ向けの横長レイアウトとする。

```text
+-------------------------------------------------------------+
| Header                                                      |
+-----------------------------+-------------------------------+
| Editor                      | Preview                       |
|                             |                               |
| WGSL Code                   | WebGPU Canvas                 |
|                             |                               |
+-----------------------------+-------------------------------+
| Status Bar                                                  |
+-------------------------------------------------------------+
```

---

## 5.2 ヘッダー

### 表示内容

* アプリ名

  * `WGSL Playground`
* 補足テキスト

  * `Write and preview WGSL shaders in real time.`
* 操作ボタン

  * `Run`
  * `Reset`
  * `Save`

### ボタン仕様

| ボタン   | 初期リリースでの動作                            |
| ----- | ------------------------------------- |
| Run   | 現在の WGSL コードをコンパイルし、プレビューに反映する        |
| Reset | エディターの内容を初期コードに戻す                     |
| Save  | 初期リリースではローカルファイルとして `.wgsl` をダウンロードする |

---

## 5.3 エディター領域

### 位置

画面左側に配置する。

### 幅

画面全体の約 45% を使用する。

### 表示内容

* セクションタイトル

  * `Editor`
* ファイルタブ

  * `shader.wgsl`
* WGSL コードエディター
* 行番号
* シンタックスハイライト
* 現在行のハイライト

### エディター要件

* 等幅フォントを使用する
* 行番号を表示する
* タブ入力をサポートする
* コピー / ペーストをサポートする
* Undo / Redo をサポートする
* 初期コードを表示する
* コード変更後も自動実行はしない
* `Run` ボタン押下でプレビューを更新する

### 推奨ライブラリ

* Monaco Editor
* CodeMirror

初期実装では CodeMirror を推奨する。理由は、軽量で組み込みやすく、カスタムシンタックスハイライトを調整しやすいため。

---

## 5.4 プレビュー領域

### 位置

画面右側に配置する。

### 幅

画面全体の約 55% を使用する。

### 表示内容

* セクションタイトル

  * `Preview`
* WebGPU Canvas
* 表示倍率メニュー

  * `Fit`
* フルスクリーンボタン

### プレビュー要件

* `<canvas>` を使用する
* WebGPU で描画する
* `Run` ボタン押下時に現在の WGSL コードを反映する
* アニメーション用に `requestAnimationFrame` で描画を更新する
* `time` uniform を毎フレーム更新する
* `resolution` uniform を canvas サイズに合わせて更新する
* ResizeObserver で canvas サイズ変更を検知する

---

## 5.5 ステータスバー

### 位置

画面下部に固定表示する。

### 表示内容

| 項目           | 表示例                 |
| ------------ | ------------------- |
| Compile      | `Success` / `Error` |
| FPS          | `60.0`              |
| Resolution   | `1280 x 720`        |
| GPU          | `Integrated GPU`    |
| Backend      | `WebGPU`            |
| WGSL Version | `WGSL`              |

### Compile 表示仕様

#### 成功時

```text
Compile: Success
```

#### 失敗時

```text
Compile: Error
```

エラー発生時は、エディター下部またはステータスバー上にエラーメッセージを表示する。

---

## 6. 機能仕様

## 6.1 WGSL コード編集

ユーザーはエディターで WGSL コードを編集できる。

### 入力

* WGSL のテキストコード

### 出力

* 変更されたコード状態

### 備考

初期リリースでは自動保存は行わない。

---

## 6.2 Run

`Run` ボタンを押すと、現在の WGSL コードをコンパイルしてプレビューに反映する。

### 処理フロー

1. エディターから WGSL コードを取得する
2. WebGPU の shader module を作成する
3. render pipeline を作成する
4. 成功した場合、現在のプレビューに反映する
5. 失敗した場合、既存の正常なプレビューは維持する
6. エラーメッセージを表示する

### 成功時

* Compile status を `Success` にする
* プレビューを更新する

### 失敗時

* Compile status を `Error` にする
* エラーメッセージを表示する
* 最後に成功した shader を維持する

---

## 6.3 Reset

`Reset` ボタンを押すと、エディターのコードを初期コードに戻す。

### 処理フロー

1. 確認ダイアログは出さない
2. エディターの内容を初期コードに戻す
3. 自動実行はしない
4. 必要であればユーザーが `Run` を押す

---

## 6.4 Save

`Save` ボタンを押すと、現在の WGSL コードをローカルに保存する。

### ファイル名

```text
shader.wgsl
```

### MIME Type

```text
text/plain
```

### 初期リリースでの保存方式

* ブラウザのダウンロード機能を使用する
* サーバー保存は行わない

---

## 6.5 FPS 表示

描画ループ内で FPS を計測し、ステータスバーに表示する。

### 表示例

```text
FPS: 60.0
```

### 更新頻度

* 0.5 秒〜1 秒に 1 回更新する

---

## 6.6 解像度表示

canvas の実描画サイズを表示する。

### 表示例

```text
Resolution: 1280 x 720
```

### 備考

CSS 上の表示サイズではなく、devicePixelRatio を考慮した canvas の描画サイズを表示する。

---

## 7. シェーダー仕様

## 7.1 基本方針

ユーザーには Shadertoy 風に fragment shader のコードを書かせる。

ただし、WebGPU では描画のために vertex shader と fragment shader の entry point が必要になるため、初期リリースでは以下のどちらかの方式を採用する。

---

## 7.2 方式A: ユーザーが完全な WGSL を書く

ユーザーは `@vertex` と `@fragment` を含む完全な WGSL を記述する。

### メリット

* WebGPU / WGSL の仕様に近い
* 実装がシンプル
* 変換処理が不要

### デメリット

* Shadertoy より初心者向けではない
* 毎回 vertex shader も書く必要がある

---

## 7.3 方式B: Shadertoy 風 wrapper を提供する

ユーザーは `mainImage` のような関数だけを書く。

アプリ側で vertex shader や fragment entry point を補完する。

### ユーザーが書くコード例

```wgsl
fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = fragCoord / uniforms.resolution;
  let color = vec3f(uv.x, uv.y, 0.5 + 0.5 * sin(uniforms.time));
  return vec4f(color, 1.0);
}
```

### アプリ側が補完する内容

* full screen triangle 用 vertex shader
* `@fragment` entry point
* `fragCoord`
* `time`
* `resolution`
* uniform binding

### メリット

* Shadertoy に近い体験になる
* ユーザーが短いコードで試せる
* 初心者にも使いやすい

### デメリット

* 内部でコード結合処理が必要
* エラー行番号がずれる可能性がある
* WGSL と独自仕様の境界がやや分かりにくい

---

## 7.4 初期リリースで採用する方式

初期リリースでは **方式B: Shadertoy 風 wrapper** を採用する。

理由は、Shadertoy の WGSL 版としての体験を優先するため。

---

## 8. 提供 uniform

初期リリースでは以下の uniform を提供する。

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}
```

### 各値の仕様

| 名前         | 型       | 内容            |
| ---------- | ------- | ------------- |
| time       | `f32`   | 実行開始からの経過秒数   |
| resolution | `vec2f` | canvas の描画解像度 |

---

## 9. 初期コード

エディターの初期表示コードは以下とする。

```wgsl
// WGSL Shader Playground

struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

fn palette(t: f32) -> vec3f {
  let a = vec3f(0.5, 0.5, 0.5);
  let b = vec3f(0.5, 0.5, 0.5);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.00, 0.33, 0.67);

  return a + b * cos(6.28318 * (c * t + d));
}

fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = (fragCoord / uniforms.resolution) * 2.0 - vec2f(1.0, 1.0);
  let aspect = uniforms.resolution.x / uniforms.resolution.y;
  let p = vec2f(uv.x * aspect, uv.y);

  let r = length(p);
  let a = atan2(p.y, p.x);
  let wave = sin(12.0 * r - uniforms.time * 2.0 + a * 3.0);

  let color = palette(r + wave * 0.1 + uniforms.time * 0.05);
  let vignette = 1.0 - smoothstep(0.6, 1.5, r);

  return vec4f(color * vignette, 1.0);
}
```

---

## 10. WebGPU 描画仕様

## 10.1 初期化

アプリ起動時に WebGPU を初期化する。

### 処理

1. `navigator.gpu` の存在を確認する
2. adapter を取得する
3. device を取得する
4. canvas context を取得する
5. context を configure する
6. uniform buffer を作成する
7. bind group を作成する
8. 初期 shader をコンパイルする
9. 描画ループを開始する

---

## 10.2 描画方式

初期リリースでは full screen triangle を使用する。

### 理由

* 頂点バッファが不要
* 画面全体に fragment shader を適用しやすい
* シンプルな実装にできる

---

## 10.3 描画ループ

`requestAnimationFrame` を使って毎フレーム描画する。

### 毎フレーム更新する値

* `time`
* `resolution`

### 毎フレーム実行する処理

1. 現在時刻を取得する
2. uniform buffer を更新する
3. command encoder を作成する
4. render pass を開始する
5. pipeline を設定する
6. bind group を設定する
7. full screen triangle を描画する
8. render pass を終了する
9. command を submit する

---

## 11. エラー表示仕様

## 11.1 コンパイルエラー

WGSL のコンパイルに失敗した場合、エラーを表示する。

### 表示場所

* ステータスバー
* エディター下部のエラー領域

### 表示例

```text
Compile: Error
```

```text
error: unresolved identifier 'uniform'
```

---

## 11.2 WebGPU 非対応

ブラウザが WebGPU に対応していない場合、プレビュー領域にメッセージを表示する。

### 表示文言

```text
WebGPU is not supported in this browser.
Please use a browser that supports WebGPU.
```

---

## 11.3 Device lost

WebGPU device が失われた場合、プレビューを停止してメッセージを表示する。

### 表示文言

```text
GPU device was lost. Please reload the page.
```

---

## 12. UI デザイン仕様

## 12.1 カラーテーマ

ダークテーマを基本とする。

| 用途       | 色のイメージ         |
| -------- | -------------- |
| 背景       | 黒に近い濃紺 / チャコール |
| パネル      | 背景より少し明るい黒     |
| 境界線      | 薄いグレー          |
| メインアクセント | 紫              |
| 成功表示     | 緑              |
| エラー表示    | 赤              |
| テキスト     | 白 / 明るいグレー     |
| 補足テキスト   | グレー            |

---

## 12.2 レイアウト比率

| 領域      | 比率  |
| ------- | --- |
| Editor  | 45% |
| Preview | 55% |

---

## 12.3 最小画面幅

初期リリースではデスクトップ向けとし、最小画面幅は以下とする。

```text
1024px
```

1024px 未満の場合は、将来的に縦積みレイアウトを検討する。

---

## 13. 技術構成案

## 13.1 フロントエンド

* React
* TypeScript
* Vite
* CodeMirror
* WebGPU API

---

## 13.2 状態管理

初期リリースでは React の state のみで管理する。

### 管理する状態

```ts
type CompileStatus = 'idle' | 'success' | 'error';

type AppState = {
  code: string;
  compileStatus: CompileStatus;
  errorMessage: string | null;
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
};
```

---

## 14. コンポーネント構成案

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

## 15. コンポーネント責務

## 15.1 Header

### 役割

* アプリ名を表示する
* Run / Reset / Save ボタンを表示する

### Props

```ts
type HeaderProps = {
  onRun: () => void;
  onReset: () => void;
  onSave: () => void;
};
```

---

## 15.2 EditorPane

### 役割

* WGSL コードを編集する
* コード変更を親へ通知する

### Props

```ts
type EditorPaneProps = {
  code: string;
  onChange: (code: string) => void;
};
```

---

## 15.3 PreviewPane

### 役割

* WebGPU canvas を表示する
* shader の描画結果を表示する
* ResizeObserver でサイズ変更を監視する

### Props

```ts
type PreviewPaneProps = {
  code: string;
  shouldCompile: boolean;
  onCompileSuccess: () => void;
  onCompileError: (message: string) => void;
  onFpsChange: (fps: number) => void;
  onResolutionChange: (width: number, height: number) => void;
};
```

---

## 15.4 StatusBar

### 役割

* Compile status
* FPS
* Resolution
* GPU
* Backend

を表示する。

### Props

```ts
type StatusBarProps = {
  compileStatus: 'idle' | 'success' | 'error';
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  gpuName?: string;
};
```

---

## 16. shaderWrapper 仕様

ユーザーが書いた `mainImage` を、実際に WebGPU で実行可能な WGSL に変換する。

## 16.1 入力

```ts
type ShaderWrapperInput = {
  userCode: string;
};
```

## 16.2 出力

```ts
type ShaderWrapperOutput = {
  wgsl: string;
};
```

## 16.3 変換後の構造

```wgsl
// user code

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
  return mainImage(position.xy);
}
```

---

## 17. バリデーション

初期リリースでは厳密な独自バリデーションは行わない。

### 最低限チェックすること

* コードが空でないこと
* `mainImage` が含まれていること
* WebGPU shader module の作成に失敗しないこと

---

## 18. パフォーマンス要件

| 項目         | 要件                         |
| ---------- | -------------------------- |
| 初期表示       | 3秒以内                       |
| Run 押下後の反映 | 1秒以内を目標                    |
| FPS        | 軽量な shader で 60fps を目標     |
| Resize     | 画面サイズ変更後、即座に canvas サイズを更新 |

---

## 19. アクセシビリティ

初期リリースで最低限対応する。

* ボタンに aria-label を付与する
* キーボードで Run / Reset / Save にフォーカスできる
* Compile status をテキストでも表示する
* 色だけで成功 / 失敗を判別しない

---

## 20. キーボードショートカット

| 操作   | ショートカット                    |
| ---- | -------------------------- |
| Run  | Ctrl + Enter / Cmd + Enter |
| Save | Ctrl + S / Cmd + S         |

---

## 21. 将来的な拡張案

* 自動コンパイル
* サンプル shader 一覧
* URL 共有
* ローカルストレージ保存
* クラウド保存
* ユーザーアカウント
* お気に入り
* テクスチャ入力
* マウス座標 uniform
* フレーム番号 uniform
* マルチパスレンダリング
* Compute shader 対応
* エディター上のエラー行ハイライト
* GLSL から WGSL への変換支援
* モバイル対応
* フルスクリーンプレビュー

---

## 22. MVP 完了条件

以下を満たしたら MVP 完了とする。

* 左側に WGSL エディターが表示される
* 右側に WebGPU canvas が表示される
* 初期 shader が描画される
* `Run` ボタンでコード変更を反映できる
* コンパイル成功 / 失敗が表示される
* `time` によってアニメーションする
* `resolution` によって画面サイズに追従する
* `Reset` で初期コードに戻せる
* `Save` で `.wgsl` ファイルを保存できる
* WebGPU 非対応ブラウザでエラーメッセージが表示される

---

## 23. 画面イメージ

画面は以下のような構成とする。

```text
+--------------------------------------------------------------------------------+
| WGSL Playground                                      Run   Reset   Save          |
+--------------------------------------+-----------------------------------------+
| Editor                               | Preview                                 |
| + shader.wgsl                        | +-------------------------------------+ |
|                                      | |                                     | |
| 1  // WGSL Shader Playground         | |                                     | |
| 2  struct Uniforms {                 | |       WebGPU Shader Preview          | |
| 3    time: f32,                      | |                                     | |
| 4    resolution: vec2f,              | |                                     | |
| 5  }                                 | |                                     | |
|                                      | +-------------------------------------+ |
+--------------------------------------+-----------------------------------------+
| Compile: Success     FPS: 60.0     Resolution: 1280 x 720     Backend: WebGPU   |
+--------------------------------------------------------------------------------+
```
