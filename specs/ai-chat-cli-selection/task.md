# Shaderbook AIチャット CLI 選択機能 — タスクリスト

`specs/ai-chat-cli-selection/spec.md` と `specs/ai-chat-cli-selection/plan.md`（承認済み）に基づく実装タスク。
上から順に着手する。各タスクは TDD 前提で、先に対象テストを書き、完了条件（DoD）を満たしたらチェックを付ける。

---

## Phase 1: 共有型・正規化・client error 互換

- [x] **C1-1: agent / model / performance 共有型と後方互換正規化**（plan §3, §4, §13.1, §14 Phase 1 / spec §6.1, §6.2, §6.3, §9）
  - 対象ファイル:
    - 実装: `src/aiChat/types.ts`, `src/aiChat/state.ts`
    - テスト: `src/aiChat/state.test.ts`
  - TDD:
    - `AiChatAgent` の許可値が `codex` / `claude` である
    - `AiChatPerformance` の許可値が `fast` / `balanced` / `deep` である
    - Codex の既定 model が `codex-default` である
    - Claude の既定 model が `claude-default` である
    - `agent` も `model` も省略した古い request は `codex` + `codex-default` + `balanced` に正規化される
    - `agent: "claude"` で `model` 省略時は `claude-default` に正規化される
    - `performance` 省略時は `balanced` に正規化される
    - `agent` 省略で `model: "claude-default"` は invalid になる
    - `agent: "codex"` + `model: "claude-default"` は agent-model 不一致として invalid になる
    - `agent: "claude"` + `model: "codex-default"` は agent-model 不一致として invalid になる
    - `selectedModelByAgent` の初期値が agent ごとの default model になる
    - agent を切り替えても performance の内部 ID が維持される
    - `createChatHistory` は error、notes、applied、selection を履歴に含めない
  - DoD:
    - `AiChatAgent`, `AiChatModel`, `AiChatPerformance`, `AiChatSelection`, `NormalizedAiChatMessageRequest` が共有型として定義されている
    - option metadata、既定値、allowlist、正規化 helper が `src/aiChat/types.ts` または純粋 helper として定義されている
    - `AiChatMessageRequest` の `agent` / `model` / `performance` は後方互換のため optional である
    - 正規化は欠落値だけを補い、不正値と agent-model 不一致を valid にしない
    - 履歴 item に `agent` / `model` / `performance` を追加しない
    - 共有型に DOM / React / Node 固有 API を置かない

- [x] **C1-2: 新旧 error code と表示文言の互換対応**（plan §3.1, §11, §14 Phase 1 / spec §8.7, §9.3, §11.3）
  - 対象ファイル:
    - 実装: `src/aiChat/types.ts`, `src/aiChat/client.ts`, `server/aiChat/errors.ts`
    - テスト: `src/aiChat/client.test.ts`, `server/aiChat/handler.test.ts`
  - TDD:
    - `CLAUDE_NOT_FOUND` は `Claude CLI is not installed or not found in PATH.` に変換される
    - `CODEX_NOT_FOUND` は `Codex CLI is not installed or not found in PATH.` のままである
    - `TIMEOUT` は `AI chat request timed out.` に変換される
    - `INVALID_AI_RESPONSE` は `AI returned an invalid response.` に変換される
    - 旧 `INVALID_CODEX_RESPONSE` も `AI returned an invalid response.` に変換される
    - `AI_AGENT_FAILED` は `AI chat request failed.` に変換される
    - 旧 `CODEX_FAILED` も `AI chat request failed.` に変換される
    - `INVALID_REQUEST` は server message を優先して表示する
    - `CLAUDE_NOT_FOUND` / `AI_AGENT_FAILED` / `INVALID_AI_RESPONSE` の HTTP status が 500 である
    - 旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE` を受けても error response を作れる
  - DoD:
    - `AiChatErrorCode` に新 code と旧 code の両方が含まれている
    - server の新規実装は `AI_AGENT_FAILED` / `INVALID_AI_RESPONSE` を優先して返す
    - 旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE` は受信互換として client / server helper に残っている
    - timeout / invalid response の client 表示は Codex 固有文言ではなく agent 非依存文言である
    - fetch reject / client timeout は既存どおり `AI chat server is not running.` である

---

## Phase 2: parser / prompt の agent 非依存化

- [x] **C2-1: promptBuilder の agent 非依存 API 化**（plan §9.1, §12, §14 Phase 2 / spec §10.2, §11.2）
  - 対象ファイル:
    - 実装: `server/aiChat/promptBuilder.ts`
    - テスト: `server/aiChat/promptBuilder.test.ts`
  - TDD:
    - `buildAiChatPrompt` が日本語回答の指定を含む
    - `buildAiChatPrompt` が JSON 形式だけを返す指定を含む
    - `buildAiChatPrompt` が `message` / `proposedCode` / `notes` 契約を含む
    - `buildAiChatPrompt` が `proposedCode` に Markdown code fence を含めない指定を含む
    - `buildAiChatPrompt` がファイル編集、コマンド実行、リポジトリ変更を行わない指定を含む
    - 履歴は直近 20 件だけになる
    - assistant 履歴の `proposedCode` は履歴文脈に含まれる
    - 履歴 item の `agent` / `model` / `performance` を prompt 契約に追加しない
    - `buildCodexPrompt` が `buildAiChatPrompt` と同じ文字列を返す互換 alias である
  - DoD:
    - Codex / Claude のどちらでも同じ `buildAiChatPrompt` を使える
    - 既存 import 互換のため `buildCodexPrompt` が残っている
    - prompt は安全制約を含むが、runner の CLI 安全制約の代替として扱わない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [x] **C2-2: parseAiOutput 新設と parseCodexOutput 互換 wrapper**（plan §9.2, §14 Phase 2 / spec §10.3, §11.3）
  - 対象ファイル:
    - 実装: `server/aiChat/parseAiOutput.ts`, `server/aiChat/parseCodexOutput.ts`, `server/aiChat/errors.ts`
    - テスト: `server/aiChat/parseAiOutput.test.ts`, `server/aiChat/parseCodexOutput.test.ts`
  - TDD:
    - `parseAiOutput` は素の JSON を parse できる
    - `parseAiOutput` は応答全体を包む `json` code fence を除去できる
    - `parseAiOutput` は応答全体を包む言語なし code fence を除去できる
    - `parseAiOutput` は本文中の code fence を除去しない
    - `message` が空文字でも valid として返す
    - `proposedCode` が `null` の応答を valid として返す
    - `proposedCode` 空文字は invalid
    - `notes` が string 配列以外なら invalid
    - JSON 外説明文付きの出力は invalid
    - `parseCodexOutput` 互換 wrapper が `parseAiOutput` と同じ結果を返す
    - 旧 `ParsedCodexOutput` 型名が `ParsedAiOutput` の互換 alias として使える
  - DoD:
    - agent 非依存 parser の正 API は `parseAiOutput` である
    - `parseCodexOutput` / `ParsedCodexOutput` は互換 wrapper / alias として残っている
    - invalid response は新 code `INVALID_AI_RESPONSE` で表現できる
    - 旧 `InvalidCodexResponseError` は互換 alias として残し、新実装は `InvalidAiResponseError` または `INVALID_AI_RESPONSE` を使う
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 3: server handler と runner dispatch

- [x] **C3-1: handler の selection validation / 正規化 / 後方互換**（plan §6, §10, §13.4, §14 Phase 3 / spec §6.1, §6.2, §6.3, §9）
  - 対象ファイル:
    - 実装: `server/aiChat/handler.ts`
    - テスト: `server/aiChat/handler.test.ts`
  - TDD:
    - `/messages` が `agent: "codex"` を受け付ける
    - `/messages` が `agent: "claude"` を受け付ける
    - `agent` 省略 request が `codex` として runner に渡る
    - `agent` も `model` も省略した古い request が `codex` + `codex-default` として runner に渡る
    - `agent: "codex"` で `model` 省略時は `codex-default` として runner に渡る
    - `agent: "claude"` で `model` 省略時は `claude-default` として runner に渡る
    - `performance` 省略時は `balanced` として runner に渡る
    - 未対応 agent は 400 `INVALID_REQUEST` と `Unsupported AI chat agent.` を返す
    - 未対応 model は 400 `INVALID_REQUEST` と `Unsupported AI chat model.` を返す
    - 未対応 performance は 400 `INVALID_REQUEST` と `Unsupported AI chat performance.` を返す
    - `agent: "codex"` + `model: "claude-default"` は 400 `INVALID_REQUEST`
    - `agent: "claude"` + `model: "codex-default"` は 400 `INVALID_REQUEST`
    - `agent` 省略 + `model: "claude-default"` は 400 `INVALID_REQUEST`
    - `/cancel` は agent に関係なく `requestId` だけで `registry.cancel` を呼ぶ
  - DoD:
    - handler は `runCodex` 注入ではなく `runAiChatAgent` 注入を受ける
    - handler が validation と正規化の正であり、runner には `NormalizedAiChatMessageRequest` だけを渡す
    - validation message は原因を特定できる `INVALID_REQUEST` message である
    - `/cancel` request / response schema は変更しない
    - requestRegistry に agent 情報を追加しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [x] **C3-2: runAiChatAgent dispatch と CLI mapping 定数の境界**（plan §7.1, §8, §13.5, §14 Phase 3 / spec §6.4, §11.2）
  - 対象ファイル:
    - 実装: `server/aiChat/aiAgentRunner.ts`, `server/aiChat/agentConfig.ts`
    - テスト: `server/aiChat/aiAgentRunner.test.ts`
  - TDD:
    - `agent: "codex"` で Codex runner が選択される
    - `agent: "claude"` で Claude runner が選択される
    - validation 済み値に mapping が存在しない場合は `INTERNAL_ERROR` 相当の error になる
    - Codex default model は `--model` を追加しない mapping である
    - Claude default model は `--model` を追加しない mapping である
    - `balanced` は追加 performance 引数なしの mapping である
    - `fast` / `deep` は agent ごとに明示的な performance argv fragment を持つ
  - DoD:
    - `runAiChatAgent`、agent runner interface、共通 runner result 型が定義されている
    - CLI command、base args、model mapping、performance mapping の実値は `agentConfig.ts` に閉じている
    - API の内部 ID と CLI 実値が分離されている
    - runner dispatch は handler validation 済み request を前提にし、未知値防御は server 実装不備として扱う
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 4: Codex runner mapping 移行

- [x] **C4-1: Codex runner の selection argv mapping**（plan §7.2, §8.1, §8.3, §14 Phase 4 / spec §6.4, §11.2）
  - 対象ファイル:
    - 実装: `server/aiChat/codexRunner.ts`, `server/aiChat/agentConfig.ts`
    - テスト: `server/aiChat/codexRunner.test.ts`
  - TDD:
    - `spawn` が command `codex`、`shell: false` で呼ばれる
    - Codex base args に `exec`, `--sandbox`, `read-only`, `--skip-git-repo-check`, `--output-last-message` が含まれる
    - `codex-default` は `--model` を追加しない
    - `codex-fast` は Codex model mapping の `--model <value>` を追加する
    - `codex-deep` は Codex model mapping の `--model <value>` を追加する
    - `balanced` は performance 引数を追加しない
    - `fast` は Codex performance mapping の明示的な `--config <value>` を追加する
    - `deep` は Codex performance mapping の明示的な `--config <value>` を追加する
    - `message` / `code` / `history` は argv に含まれず stdin に渡る
    - prompt write 後に stdin が end される
  - DoD:
    - Codex runner の入力型は `NormalizedAiChatMessageRequest` である
    - `codex exec --sandbox read-only` の既存安全境界を維持している
    - CLI args は文字列連結ではなく配列で組み立てる
    - `buildAiChatPrompt` と `parseAiOutput` を使う
    - `runCodex` export と `CodexRunnerResult` 互換 alias は残っている
    - 実 Codex CLI を unit test で起動しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [x] **C4-2: Codex runner の新 error code / cleanup / cancel 互換**（plan §7.2, §10, §13.5, §14 Phase 4 / spec §9.3, §11.3）
  - 対象ファイル:
    - 実装: `server/aiChat/codexRunner.ts`, `server/aiChat/errors.ts`
    - テスト: `server/aiChat/codexRunner.test.ts`
  - TDD:
    - spawn error `ENOENT` は `CODEX_NOT_FOUND`
    - non-zero exit は `AI_AGENT_FAILED`
    - output file が読めない場合は `INVALID_AI_RESPONSE`
    - output file の JSON parse 失敗は `INVALID_AI_RESPONSE`
    - stdout / stderr を AI 応答として parse しない既存仕様を維持する
    - timeout で registry state が `timedOut` になり `TIMEOUT` になる
    - cancel state で close した場合は `CANCELED` になる
    - timeout / cancel は requestRegistry の SIGTERM -> 2000ms -> SIGKILL 手順を使う
    - success / failure / timeout / cancel の全経路で一時 directory が cleanup される
  - DoD:
    - Codex CLI 未インストールだけは `CODEX_NOT_FOUND` を維持する
    - Codex 固有ではない失敗終了は `AI_AGENT_FAILED` に移行している
    - 不正応答は `INVALID_AI_RESPONSE` に移行している
    - timeout / cancel は agent 非依存の requestRegistry state に従う
    - requestRegistry に agent 情報を追加しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 5: Claude runner 追加

- [ ] **C5-1: Claude runner の spawn / stdin / stdout parse と安全制約**（plan §7.3, §8.2, §12, §14 Phase 5 / spec §6.4, §11.2）
  - 対象ファイル:
    - 実装: `server/aiChat/claudeRunner.ts`, `server/aiChat/agentConfig.ts`
    - テスト: `server/aiChat/claudeRunner.test.ts`
  - TDD:
    - `spawn` が command `claude`、`shell: false` で呼ばれる
    - Claude base args に `--print`, `--output-format`, `text`, `--no-session-persistence` が含まれる
    - Claude base args に安全制約 `--safe-mode` が必ず含まれる
    - Claude base args に安全制約 `--tools`, `''` が必ず含まれ、空文字が 1 argv 要素として渡る
    - prompt が stdin に write される
    - prompt write 後に stdin が end される
    - `message` / `code` / `history` は argv に含まれない
    - close code 0 で stdout 全体を `parseAiOutput` に渡す
    - stderr は失敗時の診断用に保持しても AI 応答として parse しない
  - DoD:
    - Claude runner は prompt 指示だけに依存せず、CLI argv でも tool 実行とローカルカスタマイズを抑止する
    - `--safe-mode` は `CLAUDE.md`、skills / plugins / hooks / MCP などのローカルカスタマイズ回避のために固定されている
    - `--tools ''` はファイル編集、Bash、Read などの tool 実行禁止のために固定されている
    - Claude runner は `--output-format text` を使い、stdout text を共通 JSON parser で検証する
    - 実 Claude CLI を unit test で起動しない
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

- [ ] **C5-2: Claude runner の mapping / error / requestRegistry 非依存 cancel**（plan §7.3, §8.2, §10, §13.5, §14 Phase 5 / spec §6.2, §6.3, §9.3）
  - 対象ファイル:
    - 実装: `server/aiChat/claudeRunner.ts`, `server/aiChat/agentConfig.ts`, `server/aiChat/aiAgentRunner.ts`
    - テスト: `server/aiChat/claudeRunner.test.ts`, `server/aiChat/aiAgentRunner.test.ts`
  - TDD:
    - `claude-default` は `--model` を追加しない
    - `claude-fast` は Claude model mapping の `--model <value>` を追加する
    - `claude-deep` は Claude model mapping の `--model <value>` を追加する
    - `balanced` は performance 引数を追加しない
    - `fast` は Claude performance mapping の `--effort low` を追加する
    - `deep` は Claude performance mapping の `--effort high` を追加する
    - spawn error `ENOENT` は `CLAUDE_NOT_FOUND`
    - non-zero exit は `AI_AGENT_FAILED`
    - stdout parse 失敗は `INVALID_AI_RESPONSE`
    - timeout は `TIMEOUT`
    - cancel は `CANCELED`
    - cancel API は agent を知らず `requestId` だけで Claude child を cancel できる
  - DoD:
    - Claude model / performance mapping が `agentConfig.ts` に閉じている
    - `balanced` は仕様どおり追加 performance 引数なしである
    - `fast` / `deep` は明示的な performance argv fragment を持つ
    - `CLAUDE_NOT_FOUND`、`AI_AGENT_FAILED`、`INVALID_AI_RESPONSE`、`TIMEOUT`、`CANCELED` が handler で HTTP error response に変換できる
    - requestRegistry は requestId / child / state のままで、agent 固有情報に依存しない
    - `runAiChatAgent` の `agent: "claude"` dispatch が実 Claude runner に接続されている
    - サーバー側 test file 先頭に `// @vitest-environment node` がある

---

## Phase 6: ChatPanel UI

- [ ] **C6-1: Agent / Model / Performance control と state helper**（plan §4, §5, §13.3, §14 Phase 6 / spec §7.1, §7.2, §13）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`, `src/aiChat/state.ts`, `src/App.css`
    - テスト: `src/components/ChatPanel.test.tsx`, `src/aiChat/state.test.ts`
  - TDD:
    - 初期表示で Agent が `Codex CLI`、Model が `Default`、Performance が `Balanced`
    - Agent select に `Codex CLI` / `Claude CLI` が表示される
    - Codex 選択中は Codex model 候補だけが表示される
    - Claude 選択中は Claude model 候補だけが表示される
    - Agent を Claude へ初めて変更すると Model が Claude の `Default` になる
    - Claude で `Deep` model を選択後、Codex へ切り替えて戻すと Claude の `Deep` model が復元される
    - Agent を切り替えても Performance の選択が維持される
    - Performance select に `Fast` / `Balanced` / `Deep` が表示される
    - `chat-controls` が `aria-label="AI chat settings"` を持つ
  - DoD:
    - selection state は `ChatPanel` 内に閉じ、`App.tsx` へ上げない
    - `selectedModelByAgent` で agent ごとの前回 model を保持する
    - model select は現在選択中 agent に属する option だけを表示する
    - selection control は送信中も変更でき、送信ボタンだけ既存どおり disabled になる
    - 狭い幅で control 行が破綻しない CSS が `src/App.css` に追加されている
    - 既存の開閉、入力、Apply、Cancel 表示を壊さない

- [ ] **C6-2: 送信 payload の selection 固定と activeRequestAgent 表示**（plan §4, §5, §13.3, §14 Phase 6 / spec §7.2, §8, §9）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`, `src/aiChat/state.ts`
    - テスト: `src/components/ChatPanel.test.tsx`
  - TDD:
    - Codex 選択中の送信 payload に `agent: "codex"`、Codex model、performance が含まれる
    - Claude 選択中の送信 payload に `agent: "claude"`、Claude model、performance が含まれる
    - 送信中に Agent を変更しても payload は送信時点の agent のままである
    - 送信中に Model を変更しても payload は送信時点の model のままである
    - 送信中に Performance を変更しても payload は送信時点の performance のままである
    - Codex 送信中は `Codex is thinking...` が表示される
    - Claude 送信中は `Claude is thinking...` が表示される
    - 送信中に UI の Agent を変えても thinking 表示は送信時点 agent のままである
    - cancel button は `requestId` だけを `/cancel` へ送り、agent を送らない
  - DoD:
    - `selectionAtSubmit` を作り、送信 payload と実行中表示は送信時点の selection に固定されている
    - `activeRequestAgent` は `selectionAtSubmit.agent` を保持し、`finally` で `null` に戻る
    - 送信中 selection 変更は進行中 request へ影響しない
    - cancel は送信時点 selection や現在の UI selection に依存せず、agent 非依存の `requestId` cancel として維持されている
    - 既存の多重送信防止、送信中に閉じても request 継続、成功時だけ入力欄 clear を維持する

- [ ] **C6-3: agent 非依存 error 表示と既存 UI 回帰維持**（plan §11, §13.3, §14 Phase 6 / spec §7.3, §8.7, §13）
  - 対象ファイル:
    - 実装: `src/components/ChatPanel.tsx`, `src/aiChat/client.ts`
    - テスト: `src/components/ChatPanel.test.tsx`, `src/aiChat/client.test.ts`
  - TDD:
    - `CLAUDE_NOT_FOUND` で `Claude CLI is not installed or not found in PATH.` が表示される
    - `CODEX_NOT_FOUND` で `Codex CLI is not installed or not found in PATH.` が表示される
    - `TIMEOUT` で `AI chat request timed out.` が表示される
    - `INVALID_AI_RESPONSE` で `AI returned an invalid response.` が表示される
    - 旧 `INVALID_CODEX_RESPONSE` でも `AI returned an invalid response.` が表示される
    - `AI_AGENT_FAILED` と旧 `CODEX_FAILED` は `AI chat request failed.` が表示される
    - messages request の 499 で `Request canceled.` が 1 回だけ表示される
    - cancel API 成功レスポンスだけでは Error message を追加しない
    - `proposedCode` がある assistant message だけ Apply button が表示される既存挙動を維持する
    - `Ctrl+Enter` / `Meta+Enter` のチャット送信と App の Run 抑止を維持する
  - DoD:
    - ChatPanel は新旧 error code を同じ表示規則で扱える
    - Codex 固有だった timeout / invalid response 表示が agent 非依存文言になっている
    - `Request canceled.` は messages fetch の 499 受信時に 1 回だけ表示される
    - Apply は selection 追加後もユーザー操作時だけ `onApplyCode` を呼ぶ
    - textarea の `data-ai-chat-input="true"`、aria label、stopPropagation の既存要件を維持する

---

## Phase 7: 回帰確認

- [ ] **C7-1: 全自動テスト / typecheck / lint**（plan §16, §14 Phase 7 / spec §16, §17）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: 全テスト
  - TDD / 検証:
    - `npm run test`
    - `npm run typecheck`
    - `npm run lint`
  - DoD:
    - `npm run test` が成功する
    - `npm run typecheck` が成功する
    - `npm run lint` が成功する
    - 既存 AIチャット test と追加 test がどちらも通る
    - server 側 test file 先頭の `// @vitest-environment node` が全 server test に入っている
    - Node 側相対 import の `.ts` 拡張子が維持されている
    - `package.json` は変更されていない

- [ ] **C7-2: CLI 選択機能の手動確認**（plan §13.6, §14 Phase 7 / spec §16, §17）
  - 対象ファイル:
    - 実装: なし（検証のみ）
    - テスト: なし（手動確認）
  - TDD / 検証:
    - 初期表示で Codex CLI / Default / Balanced が選ばれている
    - Claude CLI を選んでメッセージを送信できる
    - Codex CLI を選んでメッセージを送信できる
    - Claude CLI 未インストール環境で Claude 用エラーが表示される
    - Codex CLI 未インストール環境で Codex 用エラーが表示される
    - 送信中に Agent / Model / Performance を変えても実行中 request は送信時点 selection で完了する
    - Codex / Claude のどちらでも Cancel が `Request canceled.` を 1 回だけ表示する
    - AI が `proposedCode` を返した場合、Apply するまでエディターは変わらない
    - ブラウザ reload 後、selection は既定値へ戻る
  - DoD:
    - spec §16 の MVP 完了条件をすべて満たす
    - spec §17 の手動確認項目のうち CLI 選択機能に関わる項目を確認済み
    - Codex / Claude の選択、送信、cancel、error 表示を手動確認できる
    - 既存の Run / Reset / Save / Preview / ErrorPanel / Flipbook が退行していない

---

## 依存関係

```text
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

- C1-1 は selection 型、正規化、handler、UI、runner mapping の前提
- C1-2 は server / client の error 表示互換の前提
- C2-1 と C2-2 は runner 実装の前提で、Codex / Claude の両 runner から使う
- C3-1 は handler で正規化済み request を作り、C3-2 の dispatch へ渡す
- C4-1 → C4-2 の順に既存 Codex runner を selection 対応へ移行する
- C5-1 → C5-2 の順に Claude runner の安全境界、mapping、error、cancel を固める
- C6-1 → C6-2 → C6-3 の順に UI、送信時点固定、表示回帰を積み上げる
- C7-1 → C7-2 の順に自動検証後、手動確認を行う

## 実装中に守ること

1. `specs/ai-chat-cli-selection/spec.md` と `specs/ai-chat-cli-selection/plan.md` は変更しない。
2. 既存 `specs/ai-chat/*` は変更しない。
3. ストリーミング応答、履歴永続化、selection 永続化、外部 API 呼び出し、認証 UI は追加しない。
4. Claude runner の `--safe-mode` と `--tools ''` は task / TDD / DoD の安全制約として必ず維持する。
5. 旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE`、`parseCodexOutput` 名、`runCodex` export は互換用途で残す。
6. cancel / timeout は requestRegistry を agent 非依存のまま再利用し、agent 情報を registry に持たせない。
