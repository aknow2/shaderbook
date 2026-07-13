# Shaderbook Live 録画・Preview アスペクト比機能 実装計画書

対象: `specs/live-recording-aspect-ratio/spec.md`

---

## 1. 変更対象

| ファイル | 変更内容 |
| --- | --- |
| `src/types/preview.ts` | `PreviewAspectRatio`、初期値、録画状態型を追加 |
| `src/App.tsx` | `previewAspectRatio` / `isLiveRecording` state 追加、Run / Reset shortcut の録画中抑止、`PreviewPane` props 追加 |
| `src/components/PreviewPane.tsx` | aspect ratio 適用、録画 UI、MediaRecorder 管理、録画中操作制限、cleanup |
| `src/components/PreviewModeControl.tsx` | disabled prop を追加 |
| `src/App.css` | aspect-constrained canvas の中央配置、録画 status message、disabled control の見た目 |
| `src/components/PreviewPane.test.tsx` | aspect ratio resize、録画開始/停止、非対応、録画中 disabled、cleanup のテスト |
| `src/App.test.tsx` | aspect ratio state、録画中 Run/Reset 抑止、Save 維持のテスト |
| `src/components/PreviewModeControl.test.tsx` | disabled 時に変更しないテスト |

---

## 2. 状態設計

`src/types/preview.ts` に以下を追加する。

```ts
export type PreviewAspectRatio = 'fit' | '1:1' | '16:9' | '9:16'
export type LiveRecordingStatus = 'idle' | 'recording' | 'stopping' | 'unsupported' | 'error'
export const initialPreviewAspectRatio: PreviewAspectRatio = 'fit'
```

`App` は `previewAspectRatio` と `isLiveRecording` を保持する。録画の実体 (`MediaRecorder`、stream、chunks、Blob URL) は `PreviewPane` の ref に閉じ込める。

`PreviewPaneProps` に以下を追加する。

```ts
previewAspectRatio: PreviewAspectRatio
onPreviewAspectRatioChange: (value: PreviewAspectRatio) => void
onLiveRecordingChange: (isRecording: boolean) => void
```

---

## 3. アスペクト比計算

`PreviewPane` 内に純粋関数として `computeCanvasCssSize(frameWidth, frameHeight, aspectRatio)` を置く。

* `fit`: `{ width: frameWidth, height: frameHeight }`
* `1:1`: `targetRatio = 1`
* `16:9`: `targetRatio = 16 / 9`
* `9:16`: `targetRatio = 9 / 16`

fixed ratio では spec §6.2 の式で frame 内最大サイズを計算する。

`ResizeObserver` の callback は frame サイズから CSS canvas サイズを計算し、`canvas.style.width` / `canvas.style.height` と `canvas.width` / `canvas.height` を同期更新する。`onResolutionChange` は drawing buffer サイズを受け取る。

Flipbook redraw は既存と同じ `scheduleFlipbookRender('resize')` を使う。`renderFlipbook` へ渡す canvas size は aspect-constrained drawing buffer サイズになる。

---

## 4. 録画設計

`PreviewPane` に以下の ref / state を追加する。

* `recordingStatus`
* `recordingMessage`
* `mediaRecorderRef`
* `recordedChunksRef`
* `recordingStreamRef`
* `recordingObjectUrlRef`

開始時:

1. Live mode、canvas、pipeline、API 対応を確認
2. `canvas.captureStream(60)`
3. `new MediaRecorder(stream, { mimeType: 'video/webm' })`
4. `dataavailable` で chunk を蓄積
5. `stop` で Blob を作成して download
6. `start()` 後に status `recording`、`onLiveRecordingChange(true)`

停止時:

* status を `stopping` にする
* `MediaRecorder.stop()` を呼ぶ
* stop event 後に download / cleanup / status `idle` / `onLiveRecordingChange(false)`
* unmount / device lost では download を保証せず cleanup を優先する

録画中は PreviewPane 内の mode change / aspect change / fullscreen / Run compile を抑止する。App では header の Run / Reset と Ctrl/Cmd+Enter を抑止する。

---

## 5. UI

Preview toolbar:

```text
[Live|Flipbook] [Flipbook controls] [Download PNGs] [Aspect select] [Record/Stop/Saving...] [Fullscreen]
```

* aspect select は常時表示
* record button は Live のみ表示
* recording message は canvas を隠さない overlay status とする
* WebGPU unsupported / device lost message は既存通り canvas を置換する

---

## 6. テスト方針

TDD で以下を先に追加する。

* `computeCanvasCssSize` が fit / fixed ratio を計算する
* aspect ratio select が App state を更新し、resize 後 resolution と canvas style に反映される
* flipbook mode の aspect ratio 変更で redraw される
* live mode で録画開始、停止、WebM download する
* unsupported API では Live preview を維持して message を出す
* recording 中は mode / aspect / fullscreen / Run / Reset が抑止され、Save は維持される
* unmount / device lost で stream track と object URL を cleanup する

---

## 7. リスク

* jsdom には `captureStream` / `MediaRecorder` がないため、テストでは明示的に mock する
* ResizeObserver callback と録画停止が同時に走るため、cleanup は idempotent にする
* `previewMessage` は canvas を隠すため、録画エラー用には別 state を使う

