# Shaderbook Live 録画・Preview アスペクト比機能 仕様書

## 1. 概要

Live 録画機能は、Live モードで表示中の WebGPU shader canvas を動画として保存する機能である。

Preview アスペクト比機能は、Live / Flipbook 共通で表示 canvas の縦横比を `fit`、`1:1`、`16:9`、`9:16` から選択できるようにする機能である。

既存の Preview は `.canvas-frame` 全体を canvas として使う。`fit` はこの挙動を維持し、固定比率では Preview 領域内に選択した比率の最大 canvas を中央配置する。

---

## 2. 目的

* Live モードの shader アニメーションを WebM 動画として保存できるようにする
* SNS や動画用途で確認しやすい正方形・横長・縦長の canvas 比率を選べるようにする
* Live と Flipbook で同じ canvas 表示比率を使い、`resolution` uniform と見た目の整合を保つ
* 既存の Run / Reset / Save / Fullscreen / WebGPU エラー処理を崩さずに Preview 操作として追加する

---

## 3. 対象範囲

### 初期リリースで実装する範囲

* Live モードの録画開始 / 停止
* `canvas.captureStream(60)` と `MediaRecorder` による WebM 保存
* Live 録画中の状態表示と操作制限
* 録画非対応ブラウザでの明確なメッセージ表示
* Preview canvas アスペクト比の選択
  * `fit`
  * `1:1`
  * `16:9`
  * `9:16`
* アスペクト比設定を Live / Flipbook の両方に適用する
* fixed ratio 時の canvas 中央配置、ResizeObserver、Fullscreen、`resolution` uniform、Flipbook grid との整合

### 初期リリースでは実装しない範囲

* Flipbook モードの動画録画
* GIF / MP4 / MOV / WebP アニメーション出力
* 録画 fps / bitrate / duration / codec のユーザー指定
* 録画中の一時停止 / 再開
* 音声録音
* エディター、UI、Flipbook ラベルを含む画面全体録画
* 録画ファイルのプレビュー再生
* 録画設定やアスペクト比設定の localStorage 永続化

---

## 4. 用語

| 用語 | 意味 |
| --- | --- |
| Live | `requestAnimationFrame` で `time` uniform を更新し続ける Preview 表示モード |
| Flipbook | 複数時刻の shader 描画結果を 1 canvas 内のグリッドに静止表示する Preview 表示モード |
| 表示 frame | canvas を配置する外側の `.canvas-frame` 領域 |
| 表示 canvas | WebGPU 描画先の `HTMLCanvasElement` |
| drawing buffer | `canvas.width` / `canvas.height` で表される device pixel 単位の描画サイズ |
| fixed ratio | `1:1`、`16:9`、`9:16` のように canvas の縦横比を固定する設定 |
| 録画中 | `MediaRecorder` が `recording` 状態で canvas stream を収集中の状態 |

---

## 5. パラメータ仕様

## 5.1 Preview アスペクト比

`PreviewAspectRatio` は Live / Flipbook 共通の canvas 表示比率である。

```ts
type PreviewAspectRatio = 'fit' | '1:1' | '16:9' | '9:16'
```

| 表示 | 値 | 比率 | 初期値 |
| --- | --- | --- | --- |
| `Fit` | `fit` | 表示 frame に合わせて可変 | yes |
| `1:1` | `1:1` | 1 / 1 | no |
| `16:9` | `16:9` | 16 / 9 | no |
| `9:16` | `9:16` | 9 / 16 | no |

### 保存する値

`previewAspectRatio` は App state に保持する。初期値は `fit` とする。

初期リリースでは localStorage に保存しない。ページ再読み込み後は `fit` に戻る。

---

## 5.2 Live 録画状態

Live 録画状態は PreviewPane 内で管理する。

| 状態 | 意味 |
| --- | --- |
| `idle` | 録画していない |
| `recording` | `MediaRecorder` が canvas stream を収集中 |
| `stopping` | 停止要求済みで、`stop` / `dataavailable` / download 完了を待っている |
| `unsupported` | 現在のブラウザで録画 API または MIME type が利用できない |
| `error` | 録画開始または停止処理で復旧可能なエラーが発生した |

録画中の blob chunk は PreviewPane 内の ref に保持し、停止完了後に破棄する。録画 blob や録画状態は App state に保存しない。

---

## 6. アスペクト比仕様

## 6.1 `fit`

`fit` は既存挙動と同じく、表示 canvas が `.canvas-frame` の利用可能領域全体を使用する。

### 仕様

* canvas の CSS 幅は frame の利用可能幅とする
* canvas の CSS 高さは frame の利用可能高さとする
* canvas の比率は Preview 領域、splitter、Fullscreen 状態に応じて変わる
* 既存 shader の見え方を後方互換として維持する

---

## 6.2 fixed ratio

fixed ratio では、表示 frame 内に収まる最大サイズの canvas を選択比率で中央配置する。

```text
frameRatio = frameWidth / frameHeight
targetRatio = selectedWidth / selectedHeight

if frameRatio > targetRatio:
  canvasHeightCss = frameHeight
  canvasWidthCss = frameHeight * targetRatio
else:
  canvasWidthCss = frameWidth
  canvasHeightCss = frameWidth / targetRatio
```

### 仕様

* canvas は表示 frame の中央に配置する
* canvas 外側の余白は `.canvas-frame` の背景だけを表示する
* canvas の外側余白には shader を描画しない
* fixed ratio による letterbox / pillarbox は録画対象に含めない
* CSS pixel の計算結果は小数を許容するが、drawing buffer は device pixel へ変換して整数にする

---

## 6.3 drawing buffer サイズ

ResizeObserver は表示 frame のサイズを監視し、選択中の `previewAspectRatio` から表示 canvas の CSS サイズを計算する。

```text
canvas.width = max(1, floor(canvasCssWidth * devicePixelRatio))
canvas.height = max(1, floor(canvasCssHeight * devicePixelRatio))
```

`onResolutionChange(width, height)` へ渡す値は outer frame ではなく drawing buffer サイズとする。

---

## 6.4 `resolution` uniform

Live モードでは `resolution` uniform に drawing buffer 全体の `canvas.width` / `canvas.height` を渡す。

Flipbook モードでは既存仕様通り、各セルの実描画サイズ `cellWidth` / `cellHeight` を `resolution` uniform に渡す。fixed ratio は Flipbook grid を計算する親 canvas のサイズにだけ影響する。

---

## 6.5 Flipbook grid との関係

Flipbook の `computeFlipbookGrid` は aspect-constrained canvas の drawing buffer サイズを入力にする。

### 仕様

* `fit` では既存通り frame 全体に対する canvas サイズから grid を計算する
* fixed ratio では中央配置された canvas の内側だけに grid を描画する
* canvas 外側の余白には Flipbook label を表示しない
* `FlipbookLabels` の座標変換は canvas の左上を基準にする

---

## 6.6 Fullscreen との関係

Fullscreen は表示 frame を fullscreen 化する。選択中のアスペクト比は fullscreen 中も維持する。

| アスペクト比 | Fullscreen 時の挙動 |
| --- | --- |
| `fit` | fullscreen frame 全体を canvas とする |
| `1:1` | fullscreen frame 内に最大の正方形 canvas を中央配置する |
| `16:9` | fullscreen frame 内に最大の 16:9 canvas を中央配置する |
| `9:16` | fullscreen frame 内に最大の 9:16 canvas を中央配置する |

録画中は Fullscreen 入退出を禁止する。

---

## 7. Live 録画仕様

## 7.1 対象モード

録画は Live モードでのみ利用できる。

### 仕様

* Live モードでは録画ボタンを表示する
* Flipbook モードでは録画ボタンを表示しない
* 録画中に Flipbook へ切り替える操作は disabled にする
* 外部 props 変更などで Live 以外に切り替わる場合は、先に録画を停止してから mode 変更を反映する

---

## 7.2 録画 API

録画には以下を使用する。

```ts
const stream = canvas.captureStream(60)
const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
```

### 対応判定

録画開始前に以下を確認する。

* `HTMLCanvasElement.prototype.captureStream` が存在する
* `window.MediaRecorder` が存在する
* `MediaRecorder.isTypeSupported('video/webm')` が `true` である

未対応の場合、録画を開始せず Preview 内にメッセージを表示する。Live 描画は継続する。

---

## 7.3 出力形式

| 項目 | 仕様 |
| --- | --- |
| MIME type | `video/webm` |
| 拡張子 | `.webm` |
| frame rate | `captureStream(60)` |
| ファイル名 | `shaderbook-live-recording-YYYYMMDD-HHmmss.webm` |

日時はユーザーのローカル時刻で生成する。例: `shaderbook-live-recording-20260708-143522.webm`。

---

## 7.4 録画対象

録画対象は表示 canvas の内容のみである。

### 含めるもの

* WebGPU shader の Live 描画結果
* 選択中のアスペクト比で決まる canvas 内の pixel

### 含めないもの

* Shaderbook のヘッダー、エディター、チャット、ステータスバー
* Preview ツールバー
* fixed ratio 時に canvas 外側へ表示される余白
* Flipbook label
* コンパイルエラー表示

---

## 7.5 録画中の操作制限

録画中は出力動画の解像度と時間軸を安定させるため、以下を制限する。

| 操作 | 録画中の扱い |
| --- | --- |
| 録画停止 | 有効 |
| mode 切替 | disabled |
| アスペクト比変更 | disabled |
| Fullscreen 入退出 | disabled |
| Flipbook PNG download | 表示されない |
| Run / Ctrl+Enter | disabled |
| Reset | disabled |
| Save / Ctrl+S | 有効。WGSL 保存のみで録画には影響しない |
| エディター入力 | 有効。録画中の描画には Run されるまで反映しない |

Run を disabled にする理由は、録画中の pipeline 差し替えによる一時的な黒 frame、compile error、古い pipeline 維持の分岐を動画内に混在させないためである。

---

## 7.6 停止と download

録画停止時は以下の順で処理する。

1. 録画状態を `stopping` にする
2. `MediaRecorder.stop()` を呼ぶ
3. stream の全 track に `stop()` を呼ぶ
4. `dataavailable` で収集した chunk から `Blob` を作る
5. Blob URL を作り、`a[download]` で `.webm` を保存する
6. anchor を remove する
7. Blob URL を revoke する
8. chunk ref / recorder ref / stream ref を破棄する
9. 録画状態を `idle` に戻す

chunk が空の場合は download せず、エラーメッセージを表示して `idle` に戻す。

---

## 8. UI 仕様

## 8.1 表示位置

Preview ツールバー内の順序は以下とする。

```text
Preview [Live|Flipbook] [Frames...] [Download PNGs] [Aspect: Fit] [Record] [Fullscreen]
```

Flipbook controls と `Download PNGs` は Flipbook モードの時だけ表示する。録画ボタンは Live モードの時だけ表示する。

---

## 8.2 アスペクト比選択 UI

アスペクト比選択は `select` とする。

| 表示 | 値 |
| --- | --- |
| `Fit` | `fit` |
| `1:1` | `1:1` |
| `16:9` | `16:9` |
| `9:16` | `9:16` |

### 仕様

* `aria-label="Preview aspect ratio"` を付与する
* Live / Flipbook の両方で表示する
* 録画中は disabled にする
* 変更時は App state の `previewAspectRatio` を更新する
* 変更時、Live では次 frame から新しい canvas サイズで描画する
* 変更時、Flipbook では canvas サイズ更新後に redraw する

---

## 8.3 録画 UI

録画 UI は Live モード専用の button とする。

| 状態 | 表示 | aria-label | disabled |
| --- | --- | --- | --- |
| `idle` | `Record` | `Start live recording` | 非対応または pipeline 未作成時は true |
| `recording` | `Stop` | `Stop live recording` | false |
| `stopping` | `Saving...` | `Saving live recording` | true |

録画中はボタンに `aria-pressed="true"` を付与する。

---

## 8.4 メッセージ

録画非対応または録画エラーは Preview 内の status message として表示する。ただし WebGPU 非対応や device lost のように canvas 描画自体を置き換える致命的メッセージとは区別する。

Live 描画が継続可能な録画エラーでは canvas を隠さない。

---

## 9. エラー処理・リソース解放

## 9.1 録画開始失敗

以下の場合は録画を開始しない。

* canvas が存在しない
* pipeline が未作成
* `captureStream` が未対応
* `MediaRecorder` が未対応
* `video/webm` が未対応
* `MediaRecorder` constructor または `start()` が throw した

この場合、既存 Live loop は停止しない。

---

## 9.2 録画中の外部 resize

録画中に ResizeObserver が canvas サイズ変更を検知した場合、録画を停止して保存処理へ進める。保存完了後に新しい canvas サイズを反映する。

### 理由

WebM 出力中に canvas drawing buffer サイズが変わると、ブラウザ実装によって破損、黒 frame、または予期しない scale が発生し得る。初期リリースでは録画中の解像度を固定する。

---

## 9.3 device lost / unmount

device lost または PreviewPane unmount 時は以下を行う。

* `MediaRecorder` が録画中なら `stop()` を呼ぶ
* stream track をすべて stop する
* chunk / recorder / stream ref を破棄する
* Blob URL が作成済みなら revoke する
* device lost の場合は既存の device lost message を優先表示する

unmount 時は自動 download を保証しない。安全な resource cleanup を優先する。

---

## 10. 既存操作との関係

| 操作 | 仕様 |
| --- | --- |
| Run | 通常時は既存通り compile する。録画中は disabled |
| Ctrl/Cmd+Enter | 通常時は既存通り Run。録画中は無視する |
| Reset | 通常時は code のみ default shader に戻す。`previewAspectRatio` は維持する。録画中は disabled |
| Save | 既存通り WGSL code のみ保存する。録画中も有効 |
| Ctrl/Cmd+S | 既存通り Save。録画中も有効 |
| Preview mode | 録画中は変更できない |
| Flipbook settings | Flipbook モード時のみ表示。アスペクト比とは独立して維持する |
| StatusBar resolution | 選択中のアスペクト比が反映された drawing buffer サイズを表示する |

---

## 11. エッジケース

| ケース | 仕様 |
| --- | --- |
| `devicePixelRatio` が 0 / undefined | `1` として扱う |
| frame が極端に小さい | drawing buffer は最低 `1 x 1` に clamp する |
| fixed ratio の余白が大きい | 余白は背景として表示し、canvas を stretch しない |
| 録画開始直後に停止 | chunk が存在すれば保存し、空ならエラー表示する |
| 録画中に compile error が起きる | Run が disabled のため UI 操作では発生しない。外部要因で発生した場合も録画を停止し、直前の Live 表示を維持する |
| 録画中に Flipbook mode props が外部から渡る | 録画停止を優先し、停止後に mode を反映する |
| 録画停止処理中に再度停止クリック | `stopping` のため無視する |
| `MediaRecorder.onerror` | 録画を停止し、stream / chunks を cleanup し、エラー表示する |

---

## 12. MVP 完了条件

* Live モードで `Record` から録画開始し、`Stop` で `.webm` が download される
* 録画ファイル名が `shaderbook-live-recording-YYYYMMDD-HHmmss.webm` 形式である
* Flipbook モードでは録画 UI が表示されない
* 録画非対応環境で Live preview を止めずに明確なメッセージを表示する
* 録画中は mode / aspect ratio / Fullscreen / Run / Reset が操作できない
* 録画停止、device lost、unmount で stream track、recorder、Blob URL、chunk ref が解放される
* `fit` / `1:1` / `16:9` / `9:16` を選択できる
* `fit` は既存の canvas 全面表示を維持する
* fixed ratio は frame 内に最大サイズで中央配置され、canvas が stretch されない
* Live の `resolution` uniform と StatusBar resolution が aspect-constrained drawing buffer サイズと一致する
* Flipbook grid が aspect-constrained canvas 内で計算され、canvas 外側に label が出ない
* Fullscreen 中も選択中のアスペクト比が維持される
* Reset / Save の既存挙動が変わらない

