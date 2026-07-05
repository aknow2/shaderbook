# WGSL Shader Playground AIチャット機能 — タスクリスト

`specs/ai-chat/spec.md` と `specs/ai-chat/plan.md`（承認済み）に基づく実装タスク。
上から順に着手する。各タスクは TDD 前提で、先に対象テストを書き、完了条件（DoD）を満たしたらチェックを付ける。

---

## Phase 1: 共有型・サーバー純粋ロジック

- [x] **A1-1: AIチャット共有型と API 契約**（plan §2.2, §3, §15.1, §16 Phase 1 / spec §9, §15, §16）
  - 対象ファイル:
    - 実装: `src/aiChat/types.ts`
    - テスト: `src/aiChat/state.test.ts`
  - TDD:
    - `AI_CHAT_MESSAGE_MAX_LENGTH` が `4000` である
    - `AI_CHAT_CODE_MAX_LENGTH` が `200000` である
    - `AI_CHAT_HISTORY_MAX_ITEMS` が `20` である
    - `AI_CHAT_REQUEST_ID_MAX_LENGTH` が `128` である
    - `AI_CHAT_SERVER_TIMEOUT_MS` が `120000` である
    - `AI_CHAT_CLIENT_TIMEOUT_MS` が `130000` である
    - `AiChatErrorCode` が仕様の error code union を表現できる
  - DoD:
    - `AiChatMessageRequest`, `AiChatMessageResponse`, `AiChatCancelRequest`, `AiChatCancelResponse`, `AiChatErrorResponse` が 1 ファイルに定義されている
    - フロントエンドと `server/aiChat/*` が同じ JSON 契約を import できる
    - 共有型 `src/aiChat/types.ts` に DOM / React / Node 固有 API を置かず、型、文字列 union、制約値、純粋な type guard だけを置く

- [x] **A1-2: Codex promptBuilder**（plan §8, §15.5, §16 Phase 1 / spec §10.2, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/promptBuilder.ts`
    - テスト: `server/aiChat/promptBuilder.test.ts`
  - TDD:
    - system 指示に日本語回答の指定が含まれる
    - system 指示に JSON 形式だけを返す指定が含まれる
    - system 指示に `proposedCode` は WGSL コード全文である条件が含まれる
    - system 指示に `proposedCode` へ Markdown code fence を含めない条件が含まれる
    - system 指示にファイル編集とコマンド実行を行わない条件が含まれる
    - 履歴は直近 20 件だけになる
    - assistant 履歴の `proposedCode` が履歴文脈に含まれる
    - 履歴なしの場合に `(履歴なし)` が含まれる
    - 現在の WGSL コード全文が WGSL code fence 内に含まれる
    - 最新ユーザーメッセージが含まれる
  - DoD:
    - prompt が仕様 §10.2 の system 指示、直近 20 件の履歴、現在の WGSL コード全文、最新ユーザーメッセージを全て含む
    - 履歴の丸めはサーバー側でも行い、フロントエンドの丸めだけに依存しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [x] **A1-3: Codex 出力 parse**（plan §9, §15.5, §16 Phase 1 / spec §10.3, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/parseCodexOutput.ts`
    - テスト: `server/aiChat/parseCodexOutput.test.ts`
  - TDD:
    - 素の JSON を parse できる
    - 応答全体を包む `json` code fence を除去できる
    - 応答全体を包む言語なし code fence を除去できる
    - 本文中の code fence は除去しない
    - `message` が空文字でも valid として返す
    - `proposedCode` が `null` の応答を valid として返す
    - `notes` が string 配列の応答を valid として返す
    - `message` 欠落は invalid
    - `proposedCode` 型不正は invalid
    - `proposedCode` 空文字は invalid
    - `notes` 型不正は invalid
    - JSON 以外は invalid
  - DoD:
    - `--output-last-message` の内容だけを parse し、stdout / stderr を AI 応答として扱わない前提の pure parser になっている
    - 外側の code fence だけを除去し、JSON 外説明文の自動修復 parse は行わない
    - AI が `proposedCode` に空文字を返した場合は不正な Codex 応答として扱える
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [x] **A1-4: requestRegistry と server error helper**（plan §5, §7, §15.5, §16 Phase 1 / spec §9.3, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/requestRegistry.ts`, `server/aiChat/errors.ts`
    - テスト: `server/aiChat/requestRegistry.test.ts`
  - TDD:
    - register / unregister で Map が更新される
    - 同一 requestId の重複 register は `false`
    - cancel は対象 child に `SIGTERM` を送る
    - cancel は 2000ms 後も close しない child に `SIGKILL` を送る
    - cancel 後の二重 cancel で kill timer が増えない
    - 完了後 cancel は成功扱い
    - `markTimedOut` は対象 child に `SIGTERM` を送る
    - `markTimedOut` は 2000ms 後も close しない child に `SIGKILL` を送る
    - `unregister` は force kill timer を clear する
    - 古い child の unregister が新しい entry を削除しない
  - DoD:
    - `register` は同じ `requestId` が Map に存在する場合 `false` を返す
    - 同一 requestId 重複は handler で 400 `INVALID_REQUEST` に変換できる
    - cancel / timeout の kill 手順が SIGTERM → 2000ms → SIGKILL で共通化されている
    - requestRegistry の unregister は child identity 一致時だけ削除し、古い child が新 entry を消さない
    - error helper が仕様の error code と HTTP status を JSON response に変換できる
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 2: Codex runner と HTTP handler

- [ ] **A2-1: codexRunner の spawn / stdin / cleanup**（plan §6, §15.6, §16 Phase 2 / spec §10.1, §10.3, §11.2, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/codexRunner.ts`
    - テスト: `server/aiChat/codexRunner.test.ts`
  - TDD:
    - `spawn` が command `codex` で呼ばれる
    - `spawn` が args `['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--output-last-message', outputFilePath, '-']` で呼ばれる
    - `spawn` option の `shell` が `false` である
    - prompt が stdin に write される
    - prompt write 後に stdin が end される
    - 一時ディレクトリが `os.tmpdir()` 配下に作られる
    - exit code 0 で output file の JSON を返す
    - stdout / stderr を JSON として parse しない
    - 成功時に一時ファイルと一時ディレクトリが削除される
    - non-zero exit 時に一時ファイルと一時ディレクトリが削除される
  - DoD:
    - `codex exec` の args 配列が plan §6 の形（`--sandbox read-only`, `--skip-git-repo-check`, `--output-last-message`, `-`）で固定されている
    - prompt は stdin 経由で渡し、`shell: false` で `child_process.spawn` を使う
    - `--output-last-message` の一時ファイルから最終メッセージを読み、stdout / stderr は失敗時の診断用文字列として短く保持する
    - 一時ファイルが成功 / 失敗の経路で削除される
    - 実 Codex CLI を unit test で起動しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [ ] **A2-2: codexRunner の timeout / cancel / error mapping**（plan §6, §7, §15.6, §16 Phase 2 / spec §9.3, §10.3, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/codexRunner.ts`
    - テスト: `server/aiChat/codexRunner.test.ts`
  - TDD:
    - `ENOENT` は `CODEX_NOT_FOUND`
    - non-zero exit は `CODEX_FAILED`
    - output file が読めない場合は `INVALID_CODEX_RESPONSE`
    - output file の JSON parse 失敗は `INVALID_CODEX_RESPONSE`
    - timeout で registry state が `timedOut` になる
    - timeout で `SIGTERM` を送り、2000ms 後に `SIGKILL` を送る
    - timeout close 後は 408 `TIMEOUT` 相当の error になる
    - cancel state で close した場合は 499 `CANCELED` 相当の error になる
    - timeout 時に一時ファイルと一時ディレクトリが削除される
    - cancel 時に一時ファイルと一時ディレクトリが削除される
  - DoD:
    - timeout / cancel の SIGTERM → 2000ms → SIGKILL 手順が実装されている
    - 一時ファイルが timeout / cancel の全経路で削除される
    - timeout と cancel が近接した場合は requestRegistry の state に従い、先に確定した状態を優先する
    - Codex CLI 未インストール、失敗終了、不正 JSON、timeout、cancel を handler が HTTP error response へ変換できる error として表現する
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [ ] **A2-3: HTTP body parse / handler routing**（plan §5, §15.6, §16 Phase 2 / spec §9, §15, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/readJsonBody.ts`, `server/aiChat/handler.ts`
    - テスト: `server/aiChat/handler.test.ts`
  - TDD:
    - `/messages` の正常系で requestId と assistant message を返す
    - request body の JSON parse 失敗は 400 `INVALID_REQUEST`
    - `requestId` 空文字は 400 `INVALID_REQUEST`
    - `requestId` 129 文字は 400 `INVALID_REQUEST`
    - `message` 空文字は 400 `INVALID_REQUEST`
    - `message` 空白のみは 400 `INVALID_REQUEST`
    - `message` 4001 文字は 400 `INVALID_REQUEST`
    - `code` 空文字は 400 `INVALID_REQUEST`
    - `code` 200001 文字は 400 `INVALID_REQUEST`
    - `history` 21 件は 400 `INVALID_REQUEST`
    - 同一 requestId 実行中の `/messages` は 400 `INVALID_REQUEST`
    - `/cancel` は registry.cancel を呼ぶ
    - 対象 requestId がなくても `/cancel` は `{ canceled: true }`
    - 未知パスは 404 `NOT_FOUND`
    - POST 以外は 404 `NOT_FOUND`
  - DoD:
    - body size limit は plan §5 の `8 * 1024 * 1024` byte を使う
    - schema validation は外部ライブラリを追加せず type guard で行う
    - 同一 requestId 重複は 400 `INVALID_REQUEST` になる
    - `/messages`、`/cancel`、404、400、500 系 error response を JSON で返せる
    - cancel API の成功レスポンス自体では error message を発生させない契約になっている
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 3: Vite plugin 統合

- [ ] **A3-1: Vite middleware と tsconfig 分離**（plan §2.1, §4, §16 Phase 3 / spec §6, §11.1, §16）
  - 対象ファイル:
    - 実装: `server/aiChat/vitePlugin.ts`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`
    - テスト: `server/aiChat/vitePlugin.test.ts`
  - TDD:
    - `aiChatVitePlugin()` が Vite plugin name `wgslpg-ai-chat` を持つ
    - `aiChatVitePlugin()` が `apply: 'serve'` を持つ
    - `configureServer` で `/api/ai-chat` middleware を登録する
    - middleware は handler に request / response / next を渡す
    - `/api/ai-chat` 以外は Vite の通常 middleware に渡せる構造である
  - DoD:
    - `npm run dev` の Vite dev server で `/api/ai-chat/*` middleware が登録される
    - CORS、別ポート、別起動 script を追加しない
    - Vite preview / production build では AIチャット API を提供しない
    - `vite.config.ts` が `aiChatVitePlugin()` を import して `plugins` に追加している
    - tsconfig 変更として app include から `vite.config.ts` を外し、node include に `vite.config.ts` + `server/**` を入れる
    - `tsconfig.node.json` は `module: nodenext` と `allowImportingTsExtensions: true` を使う
    - Node 側相対 import は `.ts` 拡張子付きで書き、app 側 `src/` 同士の import は従来どおり拡張子なしで書く

---

## Phase 4: フロントエンド client と state helper

- [ ] **A4-1: ChatPanel state helper**（plan §3, §10, §15.1, §16 Phase 4 / spec §9, §12, §15, §16）
  - 対象ファイル:
    - 実装: `src/aiChat/state.ts`
    - テスト: `src/aiChat/state.test.ts`
  - TDD:
    - 空文字は送信不可
    - 空白のみは送信不可
    - 4000 文字は送信可
    - 4001 文字は送信不可
    - code 空文字は `WGSL code is empty.`
    - code 200000 文字は送信可
    - code 200001 文字は `WGSL code is too large.`
    - error message は API history に含めない
    - history は直近 20 件だけになる
    - assistant の `proposedCode` が history に含まれる
    - assistant の `notes` は history に含めない
    - assistant の `applied` は history に含めない
    - request id は `crypto.randomUUID()` で生成される
    - `crypto.randomUUID()` 未対応時は fallback id が生成される
  - DoD:
    - `ChatMessage` は API 型と分けて `src/aiChat/state.ts` に置く
    - error message は Codex への履歴に含めない
    - assistant message は `content` と `proposedCode` だけを履歴化する
    - 送信 payload 用 history は user message 追加前の messages から直近 20 件を作れる
    - 入力欄上限超過、WGSL 空、WGSL 大きすぎの表示文言を ChatPanel が再利用できる

- [ ] **A4-2: AIチャット fetch client**（plan §13, §15.2, §16 Phase 4 / spec §8.7, §9, §15, §16）
  - 対象ファイル:
    - 実装: `src/aiChat/client.ts`
    - テスト: `src/aiChat/client.test.ts`
  - TDD:
    - 成功 response を `AiChatMessageResponse` として返す
    - 400 `INVALID_REQUEST` は server message を表示用 error にする
    - 408 `TIMEOUT` は `Codex request timed out.` に変換する
    - 499 `CANCELED` は `Request canceled.` に変換する
    - 500 `CODEX_NOT_FOUND` は `Codex CLI is not installed or not found in PATH.` に変換する
    - 500 `INVALID_CODEX_RESPONSE` は `Codex returned an invalid response.` に変換する
    - 500 `CODEX_FAILED` は `AI chat request failed.` に変換する
    - response JSON parse 失敗は `AI chat request failed.` に変換する
    - response schema 不一致は `AI chat request failed.` に変換する
    - fetch reject は `AI chat server is not running.` に変換する
    - HTTP timeout で `AbortController.abort()` が呼ばれる
    - client timeout の abort reject は `AI chat server is not running.` に変換する
    - cancel API が `{ canceled: true }` を返す
  - DoD:
    - `/api/ai-chat/messages` と `/api/ai-chat/cancel` の fetch が 1 ファイルに集約されている
    - `sendAiChatMessage` は HTTP client timeout 130000ms を持つ
    - fetch reject は接続不能、ネットワークエラー、client timeout の abort を含めて一律 `AI chat server is not running.` になる
    - fetch mock は各 test file 内で完結し、`src/test/setup.ts` は変更しない
    - timeout test は fake timers を使い、実ネットワークへ出さない

---

## Phase 5: ChatPanel UI

- [ ] **A5-1: ChatPanel の開閉・入力・送信制御**（plan §10, §12, §15.3, §16 Phase 5 / spec §7.2, §7.4, §7.5, §13, §15, §16）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`
    - テスト: `src/components/ChatPanel.test.tsx`
  - TDD:
    - 初期状態で `AI Chat` が開いている
    - 開閉しても messages が残る
    - 空入力では Send が disabled
    - 空白のみ入力では Send が disabled
    - 4001 文字入力時は上限超過を入力欄付近に表示し送信しない
    - WGSL code 空文字では `WGSL code is empty.` を表示しサーバーへ送信しない
    - WGSL code 200001 文字では `WGSL code is too large.` を表示しサーバーへ送信しない
    - `Enter` は改行として扱われる
    - `Ctrl+Enter` でチャット送信される
    - `Meta+Enter` でチャット送信される
    - 送信中は Send が disabled、Cancel が表示される
    - 送信中にもう一度 submit しても fetch は 1 回だけ
    - 送信中にチャットパネルを閉じても request は継続し、完了後に履歴へ反映される
  - DoD:
    - ChatPanel state は `ChatPanel` 内に閉じ、`App.tsx` は `code` と `onApplyCode` だけを渡す
    - textarea は `maxLength` を付けず、4000 文字超過を入力欄付近に表示して送信不可にする
    - 送信成功後だけ入力欄を空にし、送信失敗時とキャンセル時は入力欄を保持する
    - 送信中の多重送信が UI と submit handler の両方で防止されている
    - チャット入力欄の `Ctrl+Enter` / `Meta+Enter` は textarea 側で `preventDefault` と `stopPropagation` を行う
    - spec §13 の aria 要件として textarea に `aria-label="AI chat message"`、送信ボタンに `aria-label="Send AI chat message"`、開閉ボタンに `aria-expanded`、送信中表示を含む領域に `aria-live="polite"` がある

- [ ] **A5-2: ChatPanel messages / cancel / error 表示**（plan §10, §12, §13, §15.3, §16 Phase 5 / spec §7.3, §7.5, §8.7, §15, §16）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`
    - テスト: `src/components/ChatPanel.test.tsx`
  - TDD:
    - 成功時に user message と assistant message が表示される
    - 成功時に送信時点の code と直近 20 件の history が payload に含まれる
    - 失敗時に Error message が表示される
    - 失敗時に入力欄が残る
    - `CODEX_NOT_FOUND` で `Codex CLI is not installed or not found in PATH.` が表示される
    - `TIMEOUT` で `Codex request timed out.` が表示される
    - `INVALID_CODEX_RESPONSE` で `Codex returned an invalid response.` が表示される
    - fetch reject で `AI chat server is not running.` が表示される
    - cancel button で cancel API を呼ぶ
    - cancel API 成功レスポンスだけでは Error message を追加しない
    - messages request の 499 で `Request canceled.` が 1 回表示される
    - cancel API が fetch reject した場合は `AI chat server is not running.` が表示され、messages request の結果を引き続き待つ
  - DoD:
    - 送信時点の code と message を payload に固定し、送信中の Reset / code 編集で進行中 request の内容が変わらない
    - `Request canceled.` は messages fetch の 499 受信時に 1 回だけ表示する
    - cancel API の成功だけでは `Request canceled.` を表示しない
    - fetch reject は一律 `AI chat server is not running.` として表示する
    - `Codex is thinking...` は `aria-live="polite"` の領域内に表示される
    - spec §13 の aria 要件としてキャンセルボタンに `aria-label="Cancel AI chat request"` がある

- [ ] **A5-3: proposedCode / Apply / CSS 仕上げ**（plan §12, §14, §15.3, §16 Phase 5 / spec §7.3, §7.6, §13, §15, §16）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`, `src/App.css`
    - テスト: `src/components/ChatPanel.test.tsx`
  - TDD:
    - `proposedCode` がある assistant message だけ Apply button が表示される
    - `proposedCode` が `null` の assistant message には Apply button が表示されない
    - Apply で `onApplyCode(proposedCode)` が呼ばれる
    - Apply 後に対象 message へ `Applied` が表示される
    - 同じ message の Apply は 2 回目以降も同じ proposedCode で全文置換する
    - Apply 前に code を編集していても Apply は現在の code を proposedCode で全文置換する
    - Apply だけでは client の send API を呼ばない
    - Apply だけでは Run 用 callback を呼ばない
  - DoD:
    - AI が `proposedCode` を持つ場合だけ `shader.wgsl` の提案コードブロックと Apply button を表示する
    - Apply はユーザー操作時のみ、`onApplyCode` 経由で行い、Run 自動実行なし
    - `ErrorPanel` と `PreviewPane` は Apply だけでは変更しない
    - Apply button には対象 message が分かる `aria-label` がある
    - `.chat-panel` は `editor-column` 内でエディターを完全に押し潰さない `max-height` を持つ
    - proposed code は monospace、`white-space: pre-wrap`、`overflow-wrap: anywhere` で表示される
    - error message はチャット内に表示し、`ErrorPanel` 自体には表示しない

---

## Phase 6: App 統合とショートカット調整

- [ ] **A6-1: App への ChatPanel 配置と Apply 連携**（plan §10, §12, §14, §15.4, §16 Phase 6 / spec §7.1, §12, §15, §16）
  - 対象ファイル:
    - 実装: `src/App.tsx`
    - テスト: `src/App.test.tsx`
  - TDD:
    - `EditorPane` / `ErrorPanel` / `ChatPanel` が `editor-column` 内に縦に並ぶ
    - ChatPanel に現在の `code` が渡る
    - ChatPanel の Apply callback で `EditorPane` の code が置き換わる
    - Apply だけでは `shouldCompile` が反転しない
    - Apply だけでは Preview が更新されない
    - Apply だけでは ErrorPanel が変更されない
    - Reset は code を戻すがチャット履歴は ChatPanel state として維持される
    - Save は code だけを保存し、チャット履歴を保存しない
  - DoD:
    - `ChatPanel` は `editor-column` 内の `ErrorPanel` 直後に配置されている
    - `ChatPanel` に現在の `code` と `onApplyCode={setCode}` 相当が渡る
    - チャット履歴、入力欄、送信中状態は `App` state に上げない
    - Apply だけでは Run / Preview / ErrorPanel が変化しない
    - 既存の Run / Reset / Save / Preview / ErrorPanel / Flipbook の state を AIチャット都合で変更しない

- [ ] **A6-2: App document shortcut の二重防御**（plan §11, §14, §15.4, §16 Phase 6 / spec §7.4, §15, §16）
  - 対象ファイル:
    - 実装: `src/App.tsx`, `src/components/ChatPanel.tsx`
    - テスト: `src/App.test.tsx`, `src/components/ChatPanel.test.tsx`
  - TDD:
    - チャット入力欄にフォーカスがない時の `Ctrl+Enter` は既存通り Run
    - チャット入力欄にフォーカスがない時の `Meta+Enter` は既存通り Run
    - チャット入力欄にフォーカスがある時の `Ctrl+Enter` は Run しない
    - チャット入力欄にフォーカスがある時の `Meta+Enter` は Run しない
    - チャット入力欄にフォーカスがある時の `Ctrl+Enter` はチャット送信する
    - チャット入力欄にフォーカスがある時の `Meta+Enter` はチャット送信する
    - `Ctrl+S` はチャット入力欄にフォーカスがない時だけ既存通り Save
    - `Meta+S` はチャット入力欄にフォーカスがない時だけ既存通り Save
  - DoD:
    - textarea に `data-ai-chat-input="true"` が付与されている
    - App 側 document keydown handler が `event.target.closest('[data-ai-chat-input="true"]')` で Run / Save shortcut を除外する
    - ChatPanel textarea 側 keydown handler が `Ctrl+Enter` / `Meta+Enter` で `preventDefault` と `stopPropagation` を行う
    - チャット入力欄フォーカス中の `Ctrl+Enter` / `Meta+Enter` が Run を発火しないことを App 側 target 判定 + textarea 側 stopPropagation の二重防御で満たす
    - チャット入力欄外の `Ctrl+Enter` / `Meta+Enter` は既存どおり Run として動作する

---

## Phase 7: 全体確認と仕上げ

- [ ] **A7-1: 全自動テスト / typecheck / build / lint**（plan §15.7, §16 Phase 7 / spec §16, §17 自動テスト）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: 全テスト
  - 検証:
    - `npm run test`
    - `npm run typecheck`
    - `npm run build`
    - `npm run lint`
  - DoD:
    - `npm run test` が成功する
    - `npm run typecheck` が成功する
    - `npm run build` が成功する
    - `npm run lint` が成功する
    - server 側 test file 先頭の `// @vitest-environment node` が全 server test に入っている
    - Node 側相対 import の `.ts` 拡張子が維持されている
    - `package.json` は変更されていない。`src/test/setup.ts` の変更は環境ガードの追加のみである

- [ ] **A7-2: MVP 手動確認**（plan §15.7, §16 Phase 7 / spec §16, §17 手動確認）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: なし（手動確認）
  - 検証:
    - `npm run dev` だけで `/api/ai-chat/messages` が利用できる
    - 初期表示で `EditorPane` / `ErrorPanel` / `AI Chat` が縦に並ぶ
    - AIチャットパネルが初期状態で開いている
    - AIチャットパネルを閉じても履歴が消えない
    - メッセージ一覧、入力欄、送信ボタン、キャンセルボタン、送信中インジケータが表示される
    - 空文字または空白のみのメッセージを送信できない
    - チャット入力欄フォーカス中は `Ctrl+Enter` または `Meta+Enter` で送信でき、既存の Run ショートカットは発火しない
    - チャット入力欄にフォーカスがない時は `Ctrl+Enter` または `Meta+Enter` が既存どおり Run として動作する
    - 「このシェーダーを青っぽくして」と送信すると現在の WGSL コード全文がサーバーへ送られる
    - 送信時に直近 20 件までのチャット履歴がサーバーへ送られる
    - AI 応答が返るまで `Codex is thinking...` が表示され、送信ボタンが無効になる
    - 送信中はキャンセルボタンでリクエストをキャンセルできる
    - AI 応答本文が Assistant メッセージとして表示される
    - AI が `proposedCode` を返した場合、提案コードと `Apply` ボタンが表示される
    - `Apply` ボタンを押すまでエディター内容が変更されない
    - AI 提案コードを Apply するとエディター内容が提案コード全文で置き換わる
    - Apply だけでは Preview が更新されない
    - Apply 後に Run を押すと既存仕様どおりコンパイルされる
    - Codex CLI 未インストール時に `Codex CLI is not installed or not found in PATH.` が表示される
    - timeout 時に `Codex request timed out.` が表示される
    - 送信中にキャンセルすると `Request canceled.` が 1 回だけ表示される
    - Codex CLI の不正 JSON 応答時に `Codex returned an invalid response.` が表示される
    - AIチャットサーバー未起動相当の fetch reject で `AI chat server is not running.` が表示される
    - ブラウザをリロードするとチャット履歴が消える
  - DoD:
    - spec §16 の MVP 完了条件をすべて満たす
    - spec §17 の手動確認項目をすべて確認済み
    - 既存の Run / Reset / Save / Preview / ErrorPanel / Flipbook が退行していない
    - Codex CLI 未インストール、timeout、cancel、不正 JSON、fetch reject のエラー表示を確認できる

---

## 依存関係

```text
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

- A1-1 は全 AIチャット API / state / client / server 実装の前提
- A1-2〜A1-4 は互いに独立してテスト先行で進められるが、A2-1 / A2-2 / A2-3 の前提
- A2-1 → A2-2 の順に Codex 実行経路を固め、A2-3 で HTTP handler に接続する
- A3-1 は Phase 2 完了後に着手し、Vite dev server へ handler を統合する
- A4-1 と A4-2 は Phase 1 完了後に並行可能だが、A5-1 以降の ChatPanel 実装には両方必要
- A5-1 → A5-2 → A5-3 の順に UI、通信結果、Apply を積み上げる
- A6-1 は A5-3 完了後、A6-2 は A5-1 の textarea 実装完了後に着手する
- A7-1 → A7-2 の順に行い、A7-2 は Codex CLI 利用可能環境と未インストール相当環境の両方で確認する

## 未決事項（実装中に判断が必要な点）

1. 実装をブロックする未決事項は plan §17.7 で残さない方針。サーバー方式、ファイル配置、Codex 呼び出し形、timeout / cancel、requestRegistry、prompt 形式、フロント state 配置、ショートカット競合回避、テスト環境は plan の決定を優先する。
2. Vite preview / production build で AIチャット API を提供する対応は初期リリース対象外。実装中に production 用の認証、bind address、CORS、別ポートを追加しない。
3. ストリーミング応答、AI 提案コードの自動反映、差分ビュー、自動コンパイル、チャット履歴永続化は初期リリース対象外。タスク中に追加設計しない。
