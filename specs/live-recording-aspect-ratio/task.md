# Shaderbook Live 録画・Preview アスペクト比機能 タスクリスト

`specs/live-recording-aspect-ratio/spec.md` と `plan.md` に基づく。

---

## Phase 1: 型と aspect ratio

- [x] **LRA-1: PreviewAspectRatio 型追加**
  - 対象: `src/types/preview.ts`
  - TDD:
    - `initialPreviewAspectRatio === 'fit'`
  - DoD:
    - `PreviewAspectRatio` と `LiveRecordingStatus` が共有型として使える

- [x] **LRA-2: aspect ratio resize**
  - 対象: `src/components/PreviewPane.tsx`, `src/components/PreviewPane.test.tsx`, `src/App.css`
  - TDD:
    - `fit` は frame 全体を canvas にする
    - `1:1` は frame 内最大正方形を中央配置する
    - `16:9` / `9:16` が drawing buffer と `onResolutionChange` に反映される
    - Flipbook mode で aspect ratio 変更後に redraw する
  - DoD:
    - Live / Flipbook が同じ `previewAspectRatio` を使う
    - StatusBar resolution は drawing buffer サイズを表示する

## Phase 2: App 統合

- [x] **LRA-3: App state と操作抑止**
  - 対象: `src/App.tsx`, `src/App.test.tsx`
  - TDD:
    - `PreviewPane` に `previewAspectRatio="fit"` が渡る
    - callback で aspect ratio state が更新される
    - 録画中は Run / Ctrl+Enter / Reset が抑止される
    - 録画中でも Save / Ctrl+S は維持される
  - DoD:
    - `previewAspectRatio` は Reset / Save で変わらない
    - 録画中 state は `PreviewPane` callback から App に伝わる

## Phase 3: 録画

- [x] **LRA-4: MediaRecorder 録画 UI と download**
  - 対象: `src/components/PreviewPane.tsx`, `src/components/PreviewPane.test.tsx`, `src/App.css`
  - TDD:
    - Live mode に Record button が表示される
    - Flipbook mode では Record button が表示されない
    - `captureStream(60)` と `MediaRecorder` で録画開始する
    - Stop で `.webm` Blob を download する
    - unsupported API では canvas を隠さず message を表示する
  - DoD:
    - filename が `shaderbook-live-recording-YYYYMMDD-HHmmss.webm`
    - chunks / stream / object URL が停止後に cleanup される

- [x] **LRA-5: 録画中制御と cleanup**
  - 対象: `src/components/PreviewPane.tsx`, `src/components/PreviewModeControl.tsx`, tests
  - TDD:
    - 録画中は mode / aspect / fullscreen が disabled
    - 録画中の Run compile は PreviewPane 側でも無視される
    - unmount で stream track を stop する
    - device lost で録画 cleanup される
  - DoD:
    - cleanup は複数回呼ばれても安全
    - device lost message は既存通り優先される

## Phase 4: 検証

- [x] **LRA-6: 全体検証**
  - コマンド:
    - `npm test`
    - `npm run typecheck`
    - `npm run build`
  - DoD:
    - すべて成功する
    - `task.md` の完了チェックが実装結果と一致する
