# WGSL Shader Playground パラパラ漫画(Flipbook)機能 仕様書

## 1. 概要

パラパラ漫画(Flipbook)機能は、既存の Preview 画面を複数の静止フレームに分割し、指定された時刻の shader 描画結果をグリッド表示する機能である。

通常の Preview は `time` uniform を毎フレーム更新してアニメーション表示する。一方、Flipbook モードでは各セルに異なる `time` を渡して 1 回ずつ描画し、左上から右下へ時系列順に並べる。

---

## 2. 目的

* アニメーション shader の時間変化を一覧で確認できるようにする
* 特定の開始時刻から一定間隔のフレームを静止画として比較できるようにする
* 既存の WGSL / WebGPU / `time` / `resolution` uniform の仕様を崩さずに、Preview 表示の別モードとして追加する
* 将来的な GIF / 画像エクスポート機能の前段となる表示ロジックを用意する

---

## 3. 対象範囲

### 初期リリースで実装する範囲

* Preview の表示モード切替
  * 通常アニメーション
  * パラパラ漫画(Flipbook)
* Flipbook 用パラメータ入力
  * フレーム数
  * フレーム間隔時間 ms
  * フレーム開始時間 ms
* 指定されたフレーム数分の静止フレームをグリッド表示する
* 各フレームの `time` uniform を指定値から計算して描画する
* Flipbook モードでは連続描画を停止し、必要なタイミングだけ再描画する
* Run / Reset / Save / ショートカット / コンパイルエラー / WebGPU 非対応 / device lost との整合を保つ

### 初期リリースでは実装しない範囲

* GIF エクスポート
* PNG / WebP / JPEG などの画像エクスポート
* 各セルのクリック拡大表示
* フレームごとの個別保存
* フレーム番号 uniform の追加
* 任意の列数指定
* フレームごとの解像度指定
* Flipbook 専用 shader 記法
* サムネイルキャッシュの永続化
* モバイル向け専用 UI

---

## 4. 用語

| 用語 | 意味 |
| --- | --- |
| 通常アニメーション | 既存 Preview と同じく `requestAnimationFrame` で `time` を更新し続ける表示モード |
| Flipbook | 指定した複数時刻の描画結果を静止フレームとしてグリッド表示する表示モード |
| セル | Flipbook グリッド内の 1 フレーム表示領域 |
| フレーム index | 0 から始まるフレーム番号。`i = 0..frameCount-1` |
| 表示ラベル | セル左上に重ねて表示するフレーム番号と時刻 |

---

## 5. パラメータ仕様

Flipbook モードでは以下の 3 つのパラメータを指定できる。

| 項目 | 状態名 | 型 | デフォルト値 | 最小値 | 最大値 | 単位 |
| --- | --- | --- | --- | --- | --- | --- |
| フレーム数 | `frameCount` | integer | `16` | `1` | `64` | frame |
| フレーム間隔時間 | `frameIntervalMs` | integer | `100` | `0` | `60000` | ms |
| フレーム開始時間 | `startTimeMs` | integer | `0` | `0` | `3600000` | ms |

## 5.1 フレーム数

`frameCount` は Flipbook に表示する静止フレーム数である。

### 仕様

* `1` 以上 `64` 以下の整数とする
* `1` の場合は 1 セルだけを表示する
* `64` を上限とする

### 上限理由

単一 canvas 内で複数 viewport を連続描画するため、フレーム数が増えるほど 1 回の再描画で実行する draw 数が増える。初期リリースでは UI の応答性と GPU 負荷を優先し、最大 64 フレームに制限する。

---

## 5.2 フレーム間隔時間 ms

`frameIntervalMs` は隣り合うフレーム間の時刻差である。

### 仕様

* `0` 以上 `60000` 以下の整数とする
* `0` の場合、すべてのフレームは同じ `time` で描画される
* 単位はミリ秒(ms)で入力し、shader に渡す `time` uniform では秒(s)へ変換する

### 上限理由

60 秒を超える間隔は shader の時間変化確認用途として初期リリースでは過剰であり、誤入力による極端な時刻指定を避けるため `60000` ms を上限とする。

---

## 5.3 フレーム開始時間 ms

`startTimeMs` は最初のフレーム(index `0`)の時刻である。

### 仕様

* `0` 以上 `3600000` 以下の整数とする
* 単位はミリ秒(ms)で入力し、shader に渡す `time` uniform では秒(s)へ変換する
* `3600000` ms は 1 時間である

### 上限理由

`time` uniform は `f32` として shader に渡される。極端に大きい時刻は精度低下やユーザーの誤入力につながるため、初期リリースでは 1 時間を上限とする。

---

## 6. バリデーション

## 6.1 入力形式

各パラメータの入力 UI は `input type="number"` とする。

| 項目 | step | min | max |
| --- | --- | --- | --- |
| フレーム数 | `1` | `1` | `64` |
| フレーム間隔時間 ms | `1` | `0` | `60000` |
| フレーム開始時間 ms | `1` | `0` | `3600000` |

## 6.2 値の確定タイミング

値は以下のタイミングで確定し、正規化する。

1. 入力欄の blur
2. 入力欄で Enter を押した時
3. Run 押下時
4. 通常アニメーションから Flipbook へ切り替えた時

## 6.3 不正値の扱い

| 入力 | 扱い |
| --- | --- |
| 空文字 | その項目のデフォルト値に戻す |
| 数値ではない文字列 | その項目のデフォルト値に戻す |
| `NaN` / `Infinity` / `-Infinity` | その項目のデフォルト値に戻す |
| 小数 | 小数点以下を切り捨てる |
| 最小値未満 | 最小値へ丸める |
| 最大値超過 | 最大値へ丸める |

## 6.4 保存する値

App state に保存する値は、正規化済みの integer のみとする。入力途中の空文字や不正文字列を App state の正式な Flipbook パラメータとして保持しない。

---

## 7. time uniform 計算仕様

各フレームに渡す `time` uniform は以下の式で計算する。

```text
time_i = (startTimeMs + i * frameIntervalMs) / 1000
```

### 変数

| 変数 | 意味 |
| --- | --- |
| `i` | フレーム index。`0..frameCount-1` |
| `startTimeMs` | フレーム開始時間 ms |
| `frameIntervalMs` | フレーム間隔時間 ms |
| `time_i` | shader に渡す `time` uniform。単位は秒(s) |

### 単位換算

UI で指定する時間はミリ秒(ms)である。既存 shader の `uniforms.time` は秒(s)で扱うため、描画直前に `1000` で割って秒へ変換する。

### 計算例

| `frameCount` | `startTimeMs` | `frameIntervalMs` | index | `time_i` |
| --- | --- | --- | --- | --- |
| `4` | `500` | `250` | `0` | `0.5` |
| `4` | `500` | `250` | `1` | `0.75` |
| `4` | `500` | `250` | `2` | `1.0` |
| `4` | `500` | `250` | `3` | `1.25` |

---

## 8. UI 仕様

## 8.1 表示位置

Flipbook の操作 UI は Preview 領域のヘッダー内に配置する。

既存の Preview ツールバーには `Fit` と `Fullscreen` がある。Flipbook UI は同じツールバー内で、表示モード切替とパラメータ入力を `Fit` / `Fullscreen` より左側に配置する。

```text
Preview                    [Animation | Flipbook]  Frames [16]  Interval ms [100]  Start ms [0]  [Fit] [Fullscreen]
```

### 配置理由

Flipbook は Preview の表示方式であり、エディターやヘッダー全体の操作ではない。そのため Preview 領域の操作として Preview ヘッダー内に置く。

---

## 8.2 モード切替 UI

モード切替は 2 択の segmented control とする。

| 表示 | 値 | 動作 |
| --- | --- | --- |
| `Animation` | `animation` | 既存の連続アニメーション表示 |
| `Flipbook` | `flipbook` | 静止フレームのグリッド表示 |

### 仕様

* 初期値は `animation`
* 現在選択中のモードを視覚的に判別できるようにする
* キーボード操作で選択できるようにする
* `aria-label="Preview mode"` を付与する

---

## 8.3 パラメータ入力 UI

Flipbook パラメータは Flipbook モードの時だけ表示する。

| ラベル | 入力 | aria-label |
| --- | --- | --- |
| `Frames` | number input | `Flipbook frame count` |
| `Interval ms` | number input | `Flipbook frame interval in milliseconds` |
| `Start ms` | number input | `Flipbook start time in milliseconds` |

### 仕様

* 入力欄は横並びとする
* Preview ヘッダー幅が不足する場合は、パラメータ入力を次の行へ折り返す
* 入力確定後、Flipbook モード中であれば即時に再描画する
* 通常アニメーションモード中に値を変更する UI は表示しない

---

## 8.4 既存 Preview ツールバーとの関係

| 既存機能 | Flipbook モードでの扱い |
| --- | --- |
| `Fit` | Preview 領域全体に対する表示倍率として維持する。個別セルには適用しない |
| `Fullscreen` | Preview 領域全体をフルスクリーン化する。グリッド全体が拡大される |

### 仕様

* `Fit` / `Fullscreen` は通常アニメーションと Flipbook で同じ位置に表示する
* Flipbook モードでも `Fullscreen` 押下時はグリッド全体を対象にする
* セル単位の fullscreen は初期リリースでは実装しない

---

## 8.5 画面イメージ

### 通常アニメーション

```text
+--------------------------------------------------------------------------------+
| WGSL Playground                                      Run   Reset   Save          |
+--------------------------------------+-----------------------------------------+
| Editor                               | Preview                                 |
|                                      | [Animation|Flipbook] [Fit] [Fullscreen] |
| WGSL Code                            | +-------------------------------------+ |
|                                      | |                                     | |
|                                      | |       Animated WebGPU Preview        | |
|                                      | |                                     | |
|                                      | +-------------------------------------+ |
+--------------------------------------+-----------------------------------------+
| Compile: Success     FPS: 60.0     Resolution: 1280 x 720     Backend: WebGPU   |
+--------------------------------------------------------------------------------+
```

### Flipbook

```text
+--------------------------------------------------------------------------------+
| WGSL Playground                                      Run   Reset   Save          |
+--------------------------------------+-----------------------------------------+
| Editor                               | Preview                                 |
|                                      | [Animation|Flipbook] Frames[16]         |
| WGSL Code                            | Interval ms[100] Start ms[0] [Fit] [ ]  |
|                                      | +--------+--------+--------+--------+   |
|                                      | | #0     | #1     | #2     | #3     |   |
|                                      | | 0.00s  | 0.10s  | 0.20s  | 0.30s  |   |
|                                      | +--------+--------+--------+--------+   |
|                                      | | #4     | #5     | #6     | #7     |   |
|                                      | | 0.40s  | 0.50s  | 0.60s  | 0.70s  |   |
|                                      | +--------+--------+--------+--------+   |
+--------------------------------------+-----------------------------------------+
| Compile: Success     FPS: Paused    Resolution: 1280 x 720     Backend: WebGPU  |
+--------------------------------------------------------------------------------+
```

---

## 9. グリッドレイアウト仕様

## 9.1 列数・行数

列数と行数は `frameCount` から自動決定する。

```text
columns = ceil(sqrt(frameCount))
rows = ceil(frameCount / columns)
```

### 例

| `frameCount` | `columns` | `rows` |
| --- | --- | --- |
| `1` | `1` | `1` |
| `2` | `2` | `1` |
| `4` | `2` | `2` |
| `9` | `3` | `3` |
| `16` | `4` | `4` |
| `20` | `5` | `4` |
| `64` | `8` | `8` |

### 採用理由

`ceil(sqrt(frameCount))` を列数にすると、グリッドが極端に横長または縦長になりにくく、任意のフレーム数に対して安定した一覧性を確保できる。

---

## 9.2 並び順

フレームは左上から右下へ、行優先(row-major)で並べる。

```text
+-----+-----+-----+
|  0  |  1  |  2  |
+-----+-----+-----+
|  3  |  4  |  5  |
+-----+-----+-----+
|  6  |  7  |  8  |
+-----+-----+-----+
```

### セル位置計算

```text
row = floor(i / columns)
column = i % columns
```

---

## 9.3 セルサイズ

Flipbook は 1 つの canvas をグリッドに分割して描画する。

```text
cellWidth = floor((canvasWidth - gap * (columns - 1)) / columns)
cellHeight = floor((canvasHeight - gap * (rows - 1)) / rows)
```

### 仕様

* `canvasWidth` / `canvasHeight` は devicePixelRatio を考慮した canvas の実描画サイズとする
* `gap` は CSS pixel ではなく実描画 pixel に換算して扱う
* `gap` の CSS 上の基準値は `8px` とする
* `gapDevicePx = round(8 * devicePixelRatio)` とする
* 余り pixel は右端列または下端行の外側余白として残し、セルごとのサイズ差は作らない

---

## 9.4 セルのアスペクト比

各セルは、割り当てられた矩形全体を shader 描画領域として使用する。セルのアスペクト比は Preview 領域と `frameCount` から決まるため固定しない。

### 理由

既存 shader は `uniforms.resolution` を使って描画領域のアスペクト比に対応する前提である。Flipbook でもセルごとの実描画サイズを `resolution` uniform に渡すことで、各セル内で正しい座標系を提供できる。

---

## 9.5 セル余白・背景

| 項目 | 仕様 |
| --- | --- |
| セル間の余白 | `8px` |
| グリッド外側の余白 | `0px` |
| canvas の clear 色 | 既存 Preview と同じ黒 `rgba(0, 0, 0, 1)` |
| セル間の見た目 | canvas 背景色が見える状態とする |

---

## 9.6 ラベル表示

各セルの左上にフレーム番号と時刻を表示する。

### 表示形式

```text
#0 0.00s
```

### 仕様

* フレーム番号は 0 始まりとする
* 時刻は秒単位で小数第 2 位まで表示する
* ラベルは canvas の上に HTML 要素として重ねる
* ラベルはセル内左上から `6px` の位置に表示する
* ラベル位置は CSS pixel で指定する。§9.3 のセル座標は device pixel のため、HTML overlay に渡す座標は `devicePixelRatio` で割って CSS pixel に変換する
* ラベル背景は半透明の黒とする
* ラベル文字色は白とする
* ラベルの表示 / 非表示切替は初期リリースでは実装しない

### 位置計算

```text
cssX = deviceX / devicePixelRatio
cssY = deviceY / devicePixelRatio
labelLeft = cssX + 6
labelTop = cssY + 6
```

### 理由

canvas 内で文字を描画すると WebGPU の描画経路とは別に 2D canvas やテキスト描画用 pipeline が必要になる。初期リリースでは HTML overlay として実装し、WebGPU 描画ロジックを単純に保つ。

---

## 10. 描画方式

## 10.1 方式比較

| 方式 | 内容 | メリット | デメリット |
| --- | --- | --- | --- |
| 単一 canvas + viewport/scissor | 1 つの WebGPU canvas をグリッドに分割し、セルごとに viewport/scissor を変えて描画する | 既存 Preview の canvas / device / pipeline / bind group を流用できる。canvas 数が増えない。GPU リソース管理が単純 | 1 回の再描画でフレーム数分の draw が必要。ラベルは別途 HTML overlay が必要 |
| セルごとに別 canvas | 各セルに canvas を作成し、それぞれ WebGPU context を持つ | DOM 上のセル管理が直感的。セル単位の拡張がしやすい | canvas / context が大量に増える。WebGPU 初期化とリソース管理が複雑。最大 64 フレームでは負荷が高い |
| offscreen texture に描画して合成 | 各フレームを texture に描画し、最後に合成する | 将来のエクスポートやキャッシュに拡張しやすい | 初期実装が複雑。texture 管理、コピー、合成 pipeline が必要 |

---

## 10.2 採用方式

初期リリースでは **単一 canvas + viewport/scissor** を採用する。

### 採用理由

* 既存の PreviewPane / renderLoop / uniform buffer / shader pipeline を最小変更で拡張できる
* canvas が 1 つだけなので ResizeObserver と fullscreen の対象を維持できる
* セルごとに WebGPU context を作らないため GPU リソース消費を抑えられる
* frameCount 最大 64 であれば、パラメータ変更時だけの再描画として許容できる

---

## 10.3 viewport / scissor

Flipbook 描画では 1 つの command encoder と 1 つの render pass 内で、フレームごとに viewport と scissor rect を設定して描画する。

ただし、フレームごとに異なる `time` / `resolution` / viewport 原点を渡すため、同じ uniform buffer の同じ領域を draw の間に上書きしない。Flipbook ではフレームごとに独立した uniform binding を使う。

### フレームごとの処理

1. `time_i` を計算する
2. 対応するフレーム用ユーザー uniform slot に `time_i` / `cellWidth` / `cellHeight` を書き込む
3. 対応するフレーム用 viewport origin slot にセル左上の `x` / `y` を書き込む
4. `pass.setViewport(x, y, cellWidth, cellHeight, 0, 1)` を呼ぶ
5. `pass.setScissorRect(x, y, cellWidth, cellHeight)` を呼ぶ
6. `pass.setPipeline(pipeline)` を呼ぶ
7. `pass.setBindGroup(0, frameBindGroups[i])` を呼ぶ
8. `pass.draw(3)` を呼ぶ

### uniform binding

Flipbook 描画では `@group(0)` に以下の 2 つの uniform binding を持つ bind group を、フレームごとに用意する。

| binding | 所有者 | 内容 | slot ごとの書き込みサイズ |
| --- | --- | --- | --- |
| `@binding(0)` | ユーザー | 既存 `Uniforms { time, resolution }` | 16 byte |
| `@binding(1)` | wrapper | viewport 原点 `vec2f` | 8 byte |

どちらも 1 つの `GPUBuffer` にフレームごとの slot を持たせる。slot stride は `device.limits.minUniformBufferOffsetAlignment` を使って以下で決める。

```text
userUniformWriteSize = 16
userUniformStride = ceil(userUniformWriteSize / minUniformBufferOffsetAlignment) * minUniformBufferOffsetAlignment
flipbookUserUniformBufferSize = userUniformStride * frameCount

viewportOriginWriteSize = 8
viewportOriginStride = ceil(viewportOriginWriteSize / minUniformBufferOffsetAlignment) * minUniformBufferOffsetAlignment
flipbookViewportOriginBufferSize = viewportOriginStride * frameCount
```

各 bind group は以下の 2 エントリを持つ。

| binding | buffer | offset | size |
| --- | --- | --- | --- |
| `0` | `flipbookUserUniformBuffer` | `i * userUniformStride` | `16` |
| `1` | `flipbookViewportOriginBuffer` | `i * viewportOriginStride` | `8` |

### 採用理由

同じ uniform buffer の同じ offset を draw の間に `queue.writeBuffer` で上書きすると、1 つの command buffer 内の各 draw が異なる値を読むことを保証しづらい。フレームごとに別 offset / bind group を割り当てることで、各 draw が参照する uniform データを明確に分離する。

### 注意

WebGPU の `setViewport` / `setScissorRect` の座標は canvas 左上を原点とする。グリッドの行優先順に従い、`x` / `y` は以下で計算する。

```text
x = column * (cellWidth + gapDevicePx)
y = row * (cellHeight + gapDevicePx)
```

---

## 10.4 resolution uniform

Flipbook モードでは、`resolution` uniform に **canvas 全体サイズではなくセルの実描画サイズ** を渡す。

```text
uniforms.resolution = vec2f(cellWidth, cellHeight)
```

### 理由

本仕様では §10.5 の wrapper 所有 viewport 原点の差し引きにより、`mainImage(fragCoord)` に渡される座標をセル内の fragment 座標として扱う。各セルの shader 結果は「そのセルを 1 枚の Preview と見なした描画」であるべきなので、`resolution` もセルサイズに一致させる。

canvas 全体サイズを渡すと、既存 shader の `fragCoord / uniforms.resolution` がセル内で `0..1` に正規化されず、通常 Preview と見え方が変わるため採用しない。

---

## 10.5 fragCoord の扱い

既存 wrapper は `fragmentMain(@builtin(position) position: vec4f)` の `position.xy` を `mainImage` に渡す。viewport を使う場合、`position.xy` は canvas 全体座標になる。

Flipbook では各セル内で通常 Preview と同じ座標系にするため、fragment entry point で viewport 原点を差し引く必要がある。

### ユーザー uniform

ユーザーコードの `Uniforms` struct は既存の 2 フィールド構成を維持する。Flipbook のために `viewportOrigin` を追加しない。

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}
```

JavaScript 側では既存どおり 4 個の `f32` を書き込む 16 byte レイアウトを使う。

| 値 | 型 | offset | 内容 |
| --- | --- | --- | --- |
| `time` | `f32` | `0` | 秒単位の時刻 |
| padding | `f32` | `4` | `resolution` の 8 byte alignment 用 |
| `resolution.x` | `f32` | `8` | 描画対象サイズの width |
| `resolution.y` | `f32` | `12` | 描画対象サイズの height |

### wrapper 所有 uniform

wrapper が生成する WGSL コードに viewport 原点専用の uniform を追加する。

```wgsl
@group(0) @binding(1)
var<uniform> wgslpg_viewport_origin: vec2f;
```

| 値 | 型 | offset | 内容 |
| --- | --- | --- | --- |
| `wgslpg_viewport_origin.x` | `f32` | `0` | viewport 左上 x |
| `wgslpg_viewport_origin.y` | `f32` | `4` | viewport 左上 y |

### wrapper の変更

fragment entry point は `mainImage(position.xy - wgslpg_viewport_origin)` を呼ぶ。

```wgsl
@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return mainImage(position.xy - wgslpg_viewport_origin);
}
```

### 通常アニメーションでの値

通常アニメーションでは wrapper 所有 viewport origin buffer に `vec2f(0.0, 0.0)` を 1 回書けばよい。

### 制限事項

`@group(0) @binding(1)` はアプリが予約する。ユーザーコードで同じ binding を宣言すると、wrapper が注入する `wgslpg_viewport_origin` と重複し、WGSL compile または pipeline 作成でエラーになる。

### 採用理由

この変更により、ユーザーの既存 WGSL コードと保存済み `.wgsl` ファイルの `Uniforms { time, resolution }` を壊さずに、Flipbook ではセルごとに `fragCoord` が `0..cellSize` の範囲になる。既存 shader の `fragCoord / uniforms.resolution` という書き方が両モードで一貫して動作する。

---

## 11. 描画タイミング

## 11.1 通常アニメーション

通常アニメーションでは既存仕様どおり `requestAnimationFrame` による連続描画を行う。

### 毎フレーム更新する値

* `time`
* `resolution`
* wrapper 所有 viewport origin buffer は初期化時または pipeline 更新時に `(0, 0)` を書き込む

---

## 11.2 Flipbook

Flipbook モードでは `requestAnimationFrame` による連続描画を停止する。

### 再描画するタイミング

Flipbook は以下のタイミングでのみ再描画する。

1. 通常アニメーションから Flipbook へ切り替えた時
2. Flipbook パラメータを確定した時
3. Run 押下により shader compile が成功した時
4. Preview 領域の resize が発生した時
5. Fullscreen に入った時 / Fullscreen から戻った時
6. WebGPU 初期化後の初回描画時

### 再描画しないタイミング

* エディター入力中
* compile 失敗時
* Reset 押下のみ
* Save 押下時

---

## 11.3 FPS 表示

Flipbook モードでは FPS を数値として表示しない。

### 表示

```text
FPS: Paused
```

### 理由

Flipbook モードは連続描画を行わないため、1 秒あたりのフレーム数という指標が意味を持たない。`0.0` と表示すると性能が 0fps であるように誤解されるため、明示的に `Paused` と表示する。

---

## 12. 既存機能との整合

## 12.1 Run

`Run` ボタンは現在の WGSL コードをコンパイルする。

### 通常アニメーション

既存仕様どおり、compile 成功時に pipeline / bind group を差し替え、連続描画に反映する。

### Flipbook

compile 成功時に pipeline / bind group を差し替え、現在の Flipbook パラメータで 1 回再描画する。

### compile 失敗時

* Compile status を `Error` にする
* エラーメッセージを表示する
* 直前に成功した shader を維持する
* Flipbook の表示内容は直前に成功した shader の描画結果を維持する
* compile 失敗を理由に Flipbook を再描画しない

---

## 12.2 Reset

`Reset` ボタンは既存仕様どおり、エディターのコードを初期コードに戻す。

### 仕様

* Reset 押下だけでは自動 compile しない
* Reset 押下だけでは Flipbook パラメータを変更しない
* Reset 押下だけでは Flipbook を再描画しない
* 初期コードを反映するにはユーザーが `Run` を押す

---

## 12.3 Save

`Save` ボタンは既存仕様どおり、現在の WGSL コードを `shader.wgsl` として保存する。

### 仕様

* Flipbook パラメータは `.wgsl` ファイルには保存しない
* Flipbook の画像は保存しない
* Save 押下では再描画しない

---

## 12.4 キーボードショートカット

| 操作 | ショートカット | Flipbook モードでの扱い |
| --- | --- | --- |
| Run | Ctrl + Enter / Cmd + Enter | compile 成功時に Flipbook を再描画する |
| Save | Ctrl + S / Cmd + S | 現在の WGSL コードだけを保存する |

Flipbook 専用ショートカットは初期リリースでは追加しない。

---

## 12.5 Compile status / ErrorPanel

Compile status と ErrorPanel は通常アニメーションと同じ仕様で表示する。

### 仕様

* compile 成功時は `Compile: Success`
* compile 失敗時は `Compile: Error`
* エラーメッセージは Editor 下部の ErrorPanel に表示する
* compile 失敗時でも直前の成功 shader と直前の Flipbook 表示を維持する

---

## 12.6 WebGPU 非対応

WebGPU 非対応ブラウザでは、通常アニメーションと同じメッセージを Preview 領域に表示する。

```text
WebGPU is not supported in this browser.
Please use a browser that supports WebGPU.
```

### 仕様

* Flipbook UI は操作できても描画は行わない
* canvas は表示しない
* Flipbook モード選択中の FPS 表示は、描画有無に関わらず `Paused` とする
* Compile status は WebGPU 初期化失敗だけでは `Error` にしない

---

## 12.7 Device lost

WebGPU device が失われた場合、通常アニメーションと同じメッセージを Preview 領域に表示する。

```text
GPU device was lost. Please reload the page.
```

### 仕様

* 通常アニメーションの RAF は停止する
* Flipbook の再描画要求は無視する
* Run 押下による compile は実行しない
* 表示モードと Flipbook パラメータの state は維持する

---

## 13. 状態管理

## 13.1 AppState 追加

既存の `AppState` に Preview 表示モードと Flipbook パラメータを追加する。

```ts
type PreviewMode = 'animation' | 'flipbook';

type FlipbookSettings = {
  frameCount: number;
  frameIntervalMs: number;
  startTimeMs: number;
};

type AppState = {
  code: string;
  compileStatus: CompileStatus;
  errorMessage: string | null;
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  previewMode: PreviewMode;
  flipbook: FlipbookSettings;
};
```

### 初期値

```ts
const initialPreviewMode: PreviewMode = 'animation';

const initialFlipbookSettings: FlipbookSettings = {
  frameCount: 16,
  frameIntervalMs: 100,
  startTimeMs: 0,
};
```

---

## 13.2 PreviewPaneProps 追加

`PreviewPaneProps` に Preview 表示モードと Flipbook パラメータを追加する。

```ts
type PreviewPaneProps = {
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

### 役割

* `previewMode` は通常アニメーション / Flipbook の切替に使う
* `flipbook` は正規化済みの Flipbook パラメータを渡す
* `onPreviewModeChange` は segmented control の変更を App へ通知する
* `onFlipbookChange` は正規化済みパラメータを App へ通知する

---

## 13.3 StatusBarProps 追加

Flipbook モードで `FPS: Paused` を表示するため、StatusBar は preview mode を受け取る。

```ts
type StatusBarProps = {
  compileStatus: 'idle' | 'success' | 'error';
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  gpuName?: string;
  previewMode: PreviewMode;
};
```

### 表示分岐

```text
previewMode === 'animation' -> FPS: {fps.toFixed(1)}
previewMode === 'flipbook'  -> FPS: Paused
```

---

## 14. コンポーネント構成案

既存構成を維持し、Flipbook 専用 UI と描画関数を追加する。

```text
src/
  App.tsx
  components/
    Header.tsx
    EditorPane.tsx
    PreviewPane.tsx
    PreviewModeControl.tsx
    FlipbookControls.tsx
    FlipbookLabels.tsx
    StatusBar.tsx
    ErrorPanel.tsx
  gpu/
    createWebGPUContext.ts
    createShaderPipeline.ts
    createUniformBuffer.ts
    renderLoop.ts
    renderFlipbook.ts
    shaderWrapper.ts
  constants/
    defaultShader.ts
```

### 追加コンポーネント

| コンポーネント | 役割 |
| --- | --- |
| `PreviewModeControl` | `Animation` / `Flipbook` の segmented control |
| `FlipbookControls` | `frameCount` / `frameIntervalMs` / `startTimeMs` の入力 UI |
| `FlipbookLabels` | セル左上のフレーム番号・時刻ラベル overlay |

### 追加 gpu モジュール

| モジュール | 役割 |
| --- | --- |
| `renderFlipbook.ts` | 単一 canvas を viewport/scissor で分割し、指定時刻のフレームを一括描画する |

---

## 15. renderLoop / renderFlipbook 責務

## 15.1 renderLoop.ts

通常アニメーション専用の連続描画ループとして維持する。

### 変更点

* 通常アニメーションでは既存の 16 byte ユーザー uniform を更新する
* wrapper 所有 viewport origin buffer には `(0, 0)` を書き込む
* 通常アニメーション用 bind group も binding(0) のユーザー uniform と binding(1) の wrapper 所有 viewport origin uniform の 2 エントリで作成する
* Flipbook モードへ切り替わる時は `stop()` で RAF を停止する

---

## 15.2 renderFlipbook.ts

Flipbook の静止フレーム描画を担当する。

### 入力

```ts
type RenderFlipbookInput = {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  settings: FlipbookSettings;
};
```

### 出力

戻り値は持たない。描画結果は canvas に反映される。

```ts
function renderFlipbook(input: RenderFlipbookInput): void;
```

### 処理

1. `frameCount` から `columns` / `rows` を計算する
2. `gapDevicePx` を計算する
3. `cellWidth` / `cellHeight` を計算する
4. ユーザー uniform 用の `userUniformStride` と `flipbookUserUniformBufferSize` を計算する
5. viewport origin 用の `viewportOriginStride` と `flipbookViewportOriginBufferSize` を計算する
6. `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` で `flipbookUserUniformBuffer` を作成する
7. `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` で `flipbookViewportOriginBuffer` を作成する
8. `i = 0..frameCount-1` の `time_i` / `cellWidth` / `cellHeight` をユーザー uniform buffer の各 slot に書き込む
9. `i = 0..frameCount-1` のセル左上 `x` / `y` を viewport origin buffer の各 slot に書き込む
10. `pipeline.getBindGroupLayout(0)` から、binding(0) slot と binding(1) slot を含む `frameBindGroups` を作成する
11. command encoder を作成する
12. render pass を 1 回開始する
13. canvas 全体を黒で clear する
14. `i = 0..frameCount-1` を順に処理する
15. viewport / scissor をセル位置へ設定する
16. `frameBindGroups[i]` を bind する
17. full screen triangle を draw する
18. render pass を終了する
19. command を submit する

### 備考

初期リリースでは `flipbookUserUniformBuffer` / `flipbookViewportOriginBuffer` / `frameBindGroups` を再描画ごとに作成してよい。最大 64 フレームかつ RAF で連続実行しないため、実装の単純さを優先する。将来的に描画負荷が問題になった場合は、`frameCount` と pipeline が変わらない間だけ再利用する。

---

## 16. createUniformBuffer 変更

ユーザー uniform buffer は既存どおり 16 byte の `Uniforms { time, resolution }` を維持する。Flipbook でも binding(0) には同じ 16 byte レイアウトを書き込む。

### 通常アニメーション用更新関数

```ts
function updateUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  time: number,
  width: number,
  height: number,
): void;
```

### ユーザー uniform 書き込み関数

通常アニメーション用の `updateUniforms` と Flipbook 用の binding(0) slot 書き込みは、同じ配列生成ロジックを使う。

```ts
function writeUserUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  time: number,
  width: number,
  height: number,
): void;
```

通常アニメーションでは `offset = 0` とする。Flipbook では `offset = i * userUniformStride` とする。

### 書き込み配列

```ts
new Float32Array([
  time,
  0,
  width,
  height,
])
```

### wrapper viewport origin buffer

wrapper 所有の viewport origin buffer はユーザー uniform buffer とは別に作成する。

```ts
function createViewportOriginBuffer(device: GPUDevice): GPUBuffer;
```

通常アニメーションでは作成後または pipeline 更新後に `(0, 0)` を 1 回書き込む。

```ts
function writeViewportOrigin(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  x: number,
  y: number,
): void;
```

Flipbook では `offset = i * viewportOriginStride` とし、各フレームのセル左上 `x` / `y` を書き込む。

```ts
new Float32Array([
  x,
  y,
])
```

### 後方互換

既存の初期コード、README 記載例、保存済み `.wgsl` ファイルに含まれる `Uniforms` struct は `time` / `resolution` の 2 フィールドで動作し続ける必要がある。そのため、ユーザー uniform buffer の 32 byte 拡張、default shader の `Uniforms` 変更、ユーザーコードへの `viewportOrigin` 追加は行わない。

viewport 原点は wrapper 所有の binding(1) uniform として別 buffer に書き込む。通常アニメーションでは `(0, 0)` を 1 回書けばよい。Flipbook ではフレームごとの slot にセル左上 `x` / `y` を書き込む。

---

## 17. shaderWrapper 変更

wrapper が viewport 原点 uniform を注入し、`fragmentMain` で `mainImage` に渡す座標を viewport ローカル座標に変換する。

### 変更前

```wgsl
@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return mainImage(position.xy);
}
```

### 変更後

```wgsl
@group(0) @binding(1)
var<uniform> wgslpg_viewport_origin: vec2f;

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return mainImage(position.xy - wgslpg_viewport_origin);
}
```

### 前提

ユーザーコードには既存どおり以下の uniform 宣言が含まれている必要がある。

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
```

`@group(0) @binding(1)` は wrapper が予約し、ユーザーコードには要求しない。

### エラー扱い

ユーザーコードが `@group(0) @binding(1)` を宣言した場合、wrapper が注入する `wgslpg_viewport_origin` と重複するため compile または pipeline 作成が失敗する。その場合は通常の compile 失敗として扱い、直前の成功 shader を維持する。

---

## 18. PreviewPane 実装方針

PreviewPane は WebGPU 初期化、compile、通常描画、Flipbook 描画を統合して制御する。

## 18.1 モード切替

| 切替 | 処理 |
| --- | --- |
| `animation` -> `flipbook` | renderLoop を停止し、現在の pipeline で Flipbook を 1 回描画する |
| `flipbook` -> `animation` | renderLoop を開始し、通常アニメーションを再開する |

## 18.2 compile 成功時

| モード | 処理 |
| --- | --- |
| `animation` | pipeline / 2 エントリの bind group を差し替え、renderLoop が次フレームから新 shader を描画する |
| `flipbook` | pipeline を差し替え、binding(0) slot と binding(1) slot を含むフレームごとの bind group で Flipbook を 1 回描画する |

## 18.3 resize 時

| モード | 処理 |
| --- | --- |
| `animation` | canvas サイズを更新し、renderLoop の次フレームで反映する |
| `flipbook` | canvas サイズを更新し、Flipbook を 1 回再描画する |

## 18.4 pipeline が存在しない場合

初期 compile 前または初期 compile 失敗時など、`pipeline` が存在しない場合は Flipbook 再描画要求を無視する。canvas は黒背景または直前の内容のままとする。

---

## 19. アクセシビリティ

* モード切替はキーボードで操作できる
* number input には明確な `aria-label` を付与する
* ラベルは視覚情報であり、初期リリースではスクリーンリーダー向けに全フレームを読み上げない
* Preview canvas の `aria-label` はモードに応じて切り替える

### canvas aria-label

| モード | aria-label |
| --- | --- |
| `animation` | `WebGPU shader preview` |
| `flipbook` | `WebGPU shader flipbook preview` |

---

## 20. パフォーマンス要件

| 項目 | 要件 |
| --- | --- |
| Flipbook 初回描画 | 64 フレーム以内で 1 秒以内を目標 |
| パラメータ変更後の再描画 | 64 フレーム以内で 1 秒以内を目標 |
| resize 後の再描画 | 64 フレーム以内で 1 秒以内を目標 |
| 通常アニメーション FPS | 既存仕様どおり軽量 shader で 60fps を目標 |

### 備考

shader の内容によって描画時間は変化するため、1 秒以内は軽量な初期 shader を基準とする目標値である。

---

## 21. 将来的な拡張案

以下は初期リリースでは実装しない。

* GIF エクスポート
* PNG / WebP / JPEG エクスポート
* 連番画像エクスポート
* フレームごとのクリック拡大
* フレームごとのコピー
* 任意の列数指定
* ラベル表示 / 非表示切替
* フレーム番号 uniform
* フレーム範囲プリセット
* export 用の offscreen texture / offscreen canvas
* Flipbook 設定の URL 共有
* Flipbook 設定の localStorage 保存

---

## 22. MVP 完了条件

以下を満たしたら Flipbook 機能の MVP 完了とする。

* Preview ヘッダーに `Animation` / `Flipbook` のモード切替 UI が表示される
* 初期モードが `Animation` であり、既存の通常アニメーション表示が維持される
* `Flipbook` を選択すると、Preview がグリッド表示に切り替わる
* Flipbook モードで `frameCount` / `frameIntervalMs` / `startTimeMs` を入力できる
* 不正な入力値が仕様どおり正規化される
* `time_i = (startTimeMs + i * frameIntervalMs) / 1000` で各フレームの `time` が決まる
* フレームが左上から右下へ行優先で並ぶ
* 列数が `ceil(sqrt(frameCount))`、行数が `ceil(frameCount / columns)` で決まる
* 各セルが静止画として表示され、セル内でアニメーションしない
* 各セルの `resolution` uniform がセルの実描画サイズになる
* 各セルの `fragCoord` がセル左上を原点とする座標になる
* 各セルに `#index 秒` のラベルが表示される
* Flipbook モードでは RAF による連続描画が停止する
* Flipbook モードでは `FPS: Paused` と表示される
* Flipbook パラメータ変更時に再描画される
* Run 成功時に現在の Flipbook パラメータで再描画される
* Run 失敗時に直前の成功 shader と直前の Flipbook 表示が維持される
* Reset 押下だけでは Flipbook パラメータと表示が変わらない
* Save 押下では WGSL コードだけが保存される
* Fullscreen でグリッド全体がフルスクリーン表示される
* resize 時にグリッドが再計算され再描画される
* WebGPU 非対応時に既存仕様の非対応メッセージが表示される
* device lost 時に既存仕様の device lost メッセージが表示される

---

## 23. 実装時の確認項目

### 自動テスト

* Flipbook パラメータ正規化の unit test
* `columns` / `rows` / `row` / `column` 計算の unit test
* `time_i` 計算の unit test
* `updateUniforms` が既存の 16 byte レイアウトで正しく書き込む unit test
* `writeViewportOrigin` が viewport origin を 8 byte レイアウトで正しく書き込む unit test
* `StatusBar` が Flipbook モードで `FPS: Paused` を表示する component test
* `PreviewPane` がモード切替時に renderLoop stop / start を行う component test

### 手動確認

* 初期表示で通常アニメーションが動く
* Flipbook へ切り替えるとグリッドが表示され、セルが動かない
* `frameCount = 1` / `2` / `16` / `64` でレイアウトが崩れない
* `frameIntervalMs = 0` ですべて同じ時刻の画像になる
* `startTimeMs` を変更すると全セルの時刻がずれる
* コンパイルエラー後に直前の Flipbook 表示が維持される
* Fullscreen 入退出でグリッドが再描画される
* resize でセルサイズとラベル位置が追従する
