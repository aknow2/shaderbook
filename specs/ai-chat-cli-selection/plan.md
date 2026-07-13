# Shaderbook AIチャット CLI 選択機能 — 実装計画書

対象: `specs/ai-chat-cli-selection/spec.md` に基づく AIチャット CLI 選択機能の実装計画。既存計画 `specs/ai-chat/plan.md` の方針を継承し、既存の `ChatPanel`、`src/aiChat/*` 共有型、Vite dev server 統合、`server/aiChat/*` の handler / runner / requestRegistry 構成を前提にする。

---

## 1. スコープ確認

`specs/ai-chat-cli-selection/spec.md` §16 の MVP 完了条件を実装完了条件とする。追加リリースでは以下を実装しない。

* OpenAI API、Anthropic API など外部 API の直接呼び出し
* ブラウザからの CLI 直接実行
* エージェント、モデル、性能/推論レベル選択の永続化
* localStorage への選択値保存
* 会話履歴の永続化
* ストリーミング応答
* 複数同時送信
* エージェントごとの認証 UI
* CLI のログイン状態確認 UI
* エージェントごとのセッション resume
* AI 提案コードの差分ビュー、自動コンパイル
* 本番環境へのサーバー公開

仕様と矛盾する設計判断は行わない。既存 AIチャット機能の Vite dev server 統合、`/api/ai-chat/messages`、`/api/ai-chat/cancel`、HTTP timeout、requestRegistry による cancel / timeout 管理は維持する。

今回の採用判断:

* API の安定 ID は `agent` / `model` / `performance` とし、CLI へ渡す実値は runner 側の mapping 定数に閉じ込める
* `agent` / `model` / `performance` が欠落した既存 request は server handler で正規化し、runner は正規化済み request だけを受け取る
* Codex runner と Claude runner は分け、共通の `runAiChatAgent` が dispatch する
* AI 応答 parser は agent 非依存の `parseAiOutput` を正とし、既存 `parseCodexOutput` 名は互換 wrapper として残す
* 新規 server error は `AI_AGENT_FAILED` / `INVALID_AI_RESPONSE` を優先し、旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE` は受信互換として残す
* Codex runner は既存どおり `--sandbox read-only` を維持し、Claude runner は `--safe-mode` と `--tools ''` を base args に含めて CLI 側でもカスタマイズと tool 実行を抑止する
* `package.json` は変更しない。追加 dependency は導入しない

---

## 2. 変更対象ファイルと新規ファイル

### 2.1 変更対象ファイル

| ファイル | 変更内容 |
| --- | --- |
| `src/aiChat/types.ts` | `AiChatAgent`、agent 別 model ID、`AiChatPerformance`、option metadata、既定値、allowlist / 正規化 helper、追加 error code を定義する。`AiChatMessageRequest` に optional `agent` / `model` / `performance` を追加する |
| `src/aiChat/state.ts` | `selectedModelByAgent` の初期値 helper、agent 切り替え helper、送信 payload 用 selection helper を追加する。既存 `createChatHistory` は履歴 item に選択値を入れない |
| `src/aiChat/client.ts` | `CLAUDE_NOT_FOUND`、`AI_AGENT_FAILED`、`INVALID_AI_RESPONSE`、旧 code 互換の表示変換を追加し、timeout / invalid response 文言を agent 非依存へ変更する |
| `src/aiChat/client.test.ts` | 新旧 error code の表示変換、送信 request に `agent` / `model` / `performance` を含められることを検証する |
| `src/aiChat/state.test.ts` | agent / model / performance の allowlist、既定値、正規化、agent-model 不一致、選択 state helper を検証する |
| `src/components/ChatPanel.tsx` | Agent / Model / Performance control、`selectedAgent`、`selectedModelByAgent`、`selectedPerformance`、`activeRequestAgent` を追加し、送信時点の selection を payload に固定する |
| `src/components/ChatPanel.test.tsx` | 初期表示、agent 切り替え、model 候補切り替え、performance 維持、送信時点固定、agent 別 thinking 表示、追加 error 表示を検証する |
| `src/App.css` | 既存 `chat-panel` スタイルに選択 control 行、label、select、送信中インジケータのレイアウトを追加する |
| `server/aiChat/handler.ts` | `runCodex` 注入を `runAiChatAgent` 注入へ変更し、request schema validation 後に `agent` / `model` / `performance` を正規化する |
| `server/aiChat/handler.test.ts` | 欠落値の後方互換正規化、allowlist、agent-model 不一致、追加 error code の response を検証する |
| `server/aiChat/codexRunner.ts` | 既存 Codex 実行を runner adapter 化し、正規化済み selection から Codex argv fragment を組み立てる。旧 `runCodex` export は互換用途で残す |
| `server/aiChat/codexRunner.test.ts` | 既存 spawn / cleanup / timeout / cancel test を維持しつつ、Codex model / performance mapping と新 error code を検証する |
| `server/aiChat/promptBuilder.ts` | `buildAiChatPrompt` を正とし、既存 `buildCodexPrompt` は互換 alias とする。出力 JSON 契約は agent 非依存にする |
| `server/aiChat/parseCodexOutput.ts` | `parseAiOutput` への互換 wrapper に変更し、旧 `parseCodexOutput` / `ParsedCodexOutput` 名を残す |
| `server/aiChat/requestRegistry.ts` | 原則変更しない。必要な場合も型名を agent 非依存のまま維持し、agent 情報は registry に持たせない |
| `server/aiChat/errors.ts` | `CLAUDE_NOT_FOUND`、`AI_AGENT_FAILED`、`INVALID_AI_RESPONSE` を追加し、旧 code 互換と HTTP status mapping を更新する |

### 2.2 新規ファイル

| ファイル | 役割 |
| --- | --- |
| `server/aiChat/aiAgentRunner.ts` | `runAiChatAgent`、agent runner interface、Codex / Claude runner dispatch、共通 runner result 型を定義する |
| `server/aiChat/agentConfig.ts` | server 側の CLI command、base argv、model / performance の argv mapping 定数を定義する。CLI 実値はこのファイルに閉じ込める |
| `server/aiChat/claudeRunner.ts` | `claude` command の非対話実行、stdout 取得、timeout / cancel / cleanup / error mapping を実装する |
| `server/aiChat/claudeRunner.test.ts` | Claude runner の spawn、stdin、stdout parse、model / performance mapping、error mapping、timeout / cancel を検証する |
| `server/aiChat/aiAgentRunner.test.ts` | `agent: codex` / `agent: claude` の dispatch と未知 agent 防御を検証する |
| `server/aiChat/parseAiOutput.ts` | agent 非依存の AI 応答 parser。`message` / `proposedCode` / `notes` 契約を検証する |
| `server/aiChat/parseAiOutput.test.ts` | 既存 `parseCodexOutput.test.ts` 相当の parser test を agent 非依存名で検証する |

`server/aiChat/readJsonBody.ts`、`server/aiChat/vitePlugin.ts`、`vite.config.ts`、`tsconfig.*.json`、`src/App.tsx`、`package.json` は原則変更しない。`ChatPanel` の props は既存の `code` / `onApplyCode` のままにし、App 側へ selection state を上げない。

---

## 3. 共有型と API 契約

`src/aiChat/types.ts` に API の安定 ID と option metadata を追加する。このファイルは app / node の両方から import されるため、引き続き DOM / React / Node 固有 API を置かない。

```ts
export type AiChatAgent = 'codex' | 'claude';

export type AiChatCodexModel =
  | 'codex-default'
  | 'codex-fast'
  | 'codex-deep';

export type AiChatClaudeModel =
  | 'claude-default'
  | 'claude-fast'
  | 'claude-deep';

export type AiChatModel = AiChatCodexModel | AiChatClaudeModel;

export type AiChatPerformance = 'fast' | 'balanced' | 'deep';

export type AiChatSelection = {
  agent: AiChatAgent;
  model: AiChatModel;
  performance: AiChatPerformance;
};
```

option metadata は UI 表示と server validation の両方で使う。

```ts
export const AI_CHAT_AGENT_OPTIONS = [
  { id: 'codex', label: 'Codex CLI' },
  { id: 'claude', label: 'Claude CLI' },
] as const;

export const AI_CHAT_MODEL_OPTIONS_BY_AGENT = {
  codex: [
    { id: 'codex-default', label: 'Default' },
    { id: 'codex-fast', label: 'Fast' },
    { id: 'codex-deep', label: 'Deep' },
  ],
  claude: [
    { id: 'claude-default', label: 'Default' },
    { id: 'claude-fast', label: 'Fast' },
    { id: 'claude-deep', label: 'Deep' },
  ],
} as const;

export const AI_CHAT_PERFORMANCE_OPTIONS = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'deep', label: 'Deep' },
] as const;

export const AI_CHAT_DEFAULT_AGENT = 'codex' satisfies AiChatAgent;
export const AI_CHAT_DEFAULT_MODEL_BY_AGENT = {
  codex: 'codex-default',
  claude: 'claude-default',
} as const;
export const AI_CHAT_DEFAULT_PERFORMANCE = 'balanced' satisfies AiChatPerformance;
```

`AiChatMessageRequest` は後方互換のため、受信 schema 上は `agent` / `model` / `performance` を optional とする。

```ts
export type AiChatMessageRequest = {
  requestId: string;
  message: string;
  code: string;
  history: ChatHistoryItem[];
  agent?: AiChatAgent;
  model?: AiChatModel;
  performance?: AiChatPerformance;
};

export type NormalizedAiChatMessageRequest =
  Omit<AiChatMessageRequest, 'agent' | 'model' | 'performance'> &
  AiChatSelection;
```

正規化ルール:

| request | 正規化 |
| --- | --- |
| `agent` 省略 | `agent: "codex"` |
| `agent` も `model` も省略 | `agent: "codex"`, `model: "codex-default"` |
| `agent: "codex"` で `model` 省略 | `model: "codex-default"` |
| `agent: "claude"` で `model` 省略 | `model: "claude-default"` |
| `performance` 省略 | `performance: "balanced"` |
| `agent` 省略で `model: "claude-default"` | `agent` は `codex` として正規化されるため 400 `INVALID_REQUEST` |
| `agent: "codex"` + `model: "claude-*"` | 400 `INVALID_REQUEST` |
| `agent: "claude"` + `model: "codex-*"` | 400 `INVALID_REQUEST` |

正規化 helper は server handler が使う。UI は不正な組み合わせを作らないが、server validation を正とする。

### 3.1 エラーコード

`AiChatErrorCode` は以下へ拡張する。

```ts
export type AiChatErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'CODEX_NOT_FOUND'
  | 'CLAUDE_NOT_FOUND'
  | 'AI_AGENT_FAILED'
  | 'INVALID_AI_RESPONSE'
  | 'CODEX_FAILED'
  | 'INVALID_CODEX_RESPONSE'
  | 'INTERNAL_ERROR';
```

server の新規実装が返す code:

| HTTP status | code | 内容 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | request JSON、agent、model、performance、組み合わせが不正 |
| 404 | `NOT_FOUND` | API パスが存在しない |
| 408 | `TIMEOUT` | 選択された CLI 実行がタイムアウト |
| 499 | `CANCELED` | request がキャンセルされた |
| 500 | `CODEX_NOT_FOUND` | `codex` command が見つからない |
| 500 | `CLAUDE_NOT_FOUND` | `claude` command が見つからない |
| 500 | `AI_AGENT_FAILED` | 選択された CLI が失敗終了した |
| 500 | `INVALID_AI_RESPONSE` | 選択された CLI の出力 JSON が不正 |
| 500 | `INTERNAL_ERROR` | その他の server 内部エラー |

旧 code の扱い:

| 旧 code | server から新規に返すか | client 表示 |
| --- | --- | --- |
| `CODEX_FAILED` | 原則返さない。互換受信のみ | `AI chat request failed.` |
| `INVALID_CODEX_RESPONSE` | 原則返さない。互換受信のみ | `AI returned an invalid response.` |

client 表示文言:

| code | 表示 |
| --- | --- |
| `CODEX_NOT_FOUND` | `Codex CLI is not installed or not found in PATH.` |
| `CLAUDE_NOT_FOUND` | `Claude CLI is not installed or not found in PATH.` |
| `TIMEOUT` | `AI chat request timed out.` |
| `CANCELED` | `Request canceled.` |
| `INVALID_AI_RESPONSE` | `AI returned an invalid response.` |
| `INVALID_CODEX_RESPONSE` | `AI returned an invalid response.` |
| `AI_AGENT_FAILED` / `CODEX_FAILED` / `INTERNAL_ERROR` | `AI chat request failed.` |
| `INVALID_REQUEST` | server が返す validation message。空なら `AI chat request failed.` |

---

## 4. フロントエンド状態管理

AIチャット state は引き続き `ChatPanel` 内に閉じる。`App.tsx` へ selection state を上げない。

追加する state:

```ts
const [selectedAgent, setSelectedAgent] = useState<AiChatAgent>('codex');
const [selectedModelByAgent, setSelectedModelByAgent] =
  useState<Record<AiChatAgent, AiChatModel>>({
    codex: 'codex-default',
    claude: 'claude-default',
  });
const [selectedPerformance, setSelectedPerformance] =
  useState<AiChatPerformance>('balanced');
const [activeRequestAgent, setActiveRequestAgent] =
  useState<AiChatAgent | null>(null);
```

`selectedModelByAgent` は agent ごとの前回選択 model を保持する。現在表示する model は `selectedModelByAgent[selectedAgent]` とする。

agent 変更時:

1. `selectedAgent` を変更先 agent に更新する
2. `selectedModelByAgent[nextAgent]` があればその model を表示する
3. 未定義の場合は `AI_CHAT_DEFAULT_MODEL_BY_AGENT[nextAgent]` を設定する
4. `selectedPerformance` は変更しない

model 変更時:

* 現在の `selectedAgent` に属する model だけを選択可能にする
* 選択値は `selectedModelByAgent[selectedAgent]` へ保存する

performance 変更時:

* `fast` / `balanced` / `deep` のみ選択可能にする
* agent を切り替えても内部 ID を維持する

送信時点固定:

```ts
const selectionAtSubmit = {
  agent: selectedAgent,
  model: selectedModelByAgent[selectedAgent],
  performance: selectedPerformance,
};
```

送信処理は `selectionAtSubmit` を payload に入れる。送信中に UI の selection が変わっても、進行中 request には影響しない。`activeRequestAgent` は `selectionAtSubmit.agent` を保存し、送信中インジケータに使う。`finally` で `activeRequestAgent = null` に戻す。

既存の `activeRequestId`、`isSendingRef`、多重送信防止、cancel API、Apply 挙動は維持する。

---

## 5. ChatPanel UI 設計

選択 UI は `AI Chat` header の下、message list の上に 1 行で配置する。狭い幅では折り返して縦に並べる。

```text
+--------------------------------------------------------------------------------+
| AI Chat                                                        [Hide]           |
| Agent [Codex CLI v]  Model [Default v]  Performance [Balanced v]               |
| Message List                                                                    |
| Input                                                        [Send] [Cancel]    |
+--------------------------------------------------------------------------------+
```

DOM 構成:

```tsx
<div className="chat-controls" aria-label="AI chat settings">
  <label className="chat-control">
    <span>Agent</span>
    <select value={selectedAgent} onChange={...}>...</select>
  </label>
  <label className="chat-control">
    <span>Model</span>
    <select value={currentModel} onChange={...}>...</select>
  </label>
  <label className="chat-control">
    <span>Performance</span>
    <select value={selectedPerformance} onChange={...}>...</select>
  </label>
</div>
```

アクセシビリティ:

| UI | 要件 |
| --- | --- |
| Agent select | visible label `Agent` を持ち、option は `Codex CLI` / `Claude CLI` |
| Model select | visible label `Model` を持ち、選択中 agent の model だけを表示 |
| Performance select | visible label `Performance` を持ち、`Fast` / `Balanced` / `Deep` を表示 |
| 送信中インジケータ | `aria-live="polite"` 内に表示し、送信時点 agent の名前を含める |
| 送信中の control | selection 変更は許可する。送信ボタンだけ既存どおり disabled |

送信中インジケータ:

| `activeRequestAgent` | 表示 |
| --- | --- |
| `codex` | `Codex is thinking...` |
| `claude` | `Claude is thinking...` |
| `null` | 非表示 |

閉じている時は既存どおり header だけを表示する。選択 state と送信中処理は保持する。再度開いた時に最新の selection と messages を表示する。

---

## 6. HTTP handler 設計

`server/aiChat/handler.ts` は request body を読んだ後、既存の基本 schema と追加 selection schema を検証し、`NormalizedAiChatMessageRequest` を `runAiChatAgent` へ渡す。

依存注入は `runCodex` から `runAiChatAgent` へ変更する。

```ts
export type RunAiChatAgentForHandler = (
  request: NormalizedAiChatMessageRequest,
  context: { registry: RequestRegistry },
) => Promise<AiChatRunnerResult>;

export type AiChatHandlerDependencies = {
  registry: RequestRegistry;
  runAiChatAgent?: RunAiChatAgentForHandler;
};
```

validation の流れ:

1. JSON body を読む
2. `requestId`、`message`、`code`、`history` の既存制約を検証する
3. `agent` が undefined / `codex` / `claude` のいずれかを検証する
4. `agent` を省略時 `codex` に正規化する
5. `model` が undefined、または正規化後 agent に属する model ID であることを検証する
6. `model` 省略時は正規化後 agent の既定 model にする
7. `performance` が undefined / `fast` / `balanced` / `deep` のいずれかを検証する
8. `performance` 省略時は `balanced` にする
9. 正規化済み request だけを `runAiChatAgent` へ渡す

validation message は `INVALID_REQUEST` の `message` に具体的な原因を入れる。

| ケース | HTTP status / code | message 例 |
| --- | --- | --- |
| 未対応 agent | 400 `INVALID_REQUEST` | `Unsupported AI chat agent.` |
| 未対応 model | 400 `INVALID_REQUEST` | `Unsupported AI chat model.` |
| agent-model 不一致 | 400 `INVALID_REQUEST` | `Model is not available for the selected agent.` |
| 未対応 performance | 400 `INVALID_REQUEST` | `Unsupported AI chat performance.` |
| requestId / message / code / history 不正 | 400 `INVALID_REQUEST` | 既存 default または対象 field の message |

`/cancel` は request / response schema を変更しない。agent 情報は不要であり、`registry.cancel(requestId)` のみを呼ぶ。

---

## 7. Runner アーキテクチャ

### 7.1 共通 runner 境界

`server/aiChat/aiAgentRunner.ts` に共通境界を置く。

```ts
export type AiChatRunnerResult = {
  message: string;
  proposedCode: string | null;
  notes: string[];
};

export type AiChatAgentRunner = (
  request: NormalizedAiChatMessageRequest,
  dependencies: AiChatRunnerDependencies,
) => Promise<AiChatRunnerResult>;

export async function runAiChatAgent(
  request: NormalizedAiChatMessageRequest,
  dependencies: AiChatRunnerDependencies,
): Promise<AiChatRunnerResult> {
  switch (request.agent) {
    case 'codex':
      return runCodex(request, dependencies);
    case 'claude':
      return runClaude(request, dependencies);
  }
}
```

共通化するもの:

| 項目 | 方針 |
| --- | --- |
| request validation | handler で実施。runner は正規化済み request だけを受け取る |
| prompt | `buildAiChatPrompt` で共通化する |
| response parse | `parseAiOutput` で共通化する |
| requestRegistry | 既存の `requestId -> child` Map を agent 非依存で再利用する |
| timeout / cancel | 300000ms、SIGTERM -> 2000ms -> SIGKILL を使う |
| runner result | `message` / `proposedCode` / `notes` に統一する |

分けるもの:

| 項目 | 方針 |
| --- | --- |
| CLI command | `codex` / `claude` |
| base argv | runner ごとに `agentConfig.ts` の定数で定義 |
| model mapping | agent ごとに定義 |
| performance mapping | agent ごとに定義 |
| 出力取得方法 | Codex は `--output-last-message` 一時ファイル、Claude は stdout |
| CLI not found | Codex は `CODEX_NOT_FOUND`、Claude は `CLAUDE_NOT_FOUND` |

### 7.2 Codex runner 移行

`server/aiChat/codexRunner.ts` は既存の `codex exec` 実行を維持し、argv 組み立てだけを selection 対応にする。

維持する仕様:

* `spawn('codex', args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })`
* prompt は stdin に write して end する
* `--output-last-message` の一時ファイルだけを AI 応答として parse する
* stdout / stderr は AI 応答として parse しない
* 一時 directory は成功、失敗、timeout、cancel の全経路で削除する
* `requestRegistry.register` / `getState` / `markTimedOut` / `unregister` を再利用する

変更する仕様:

* input 型を `NormalizedAiChatMessageRequest` へ変更する
* `buildCodexPrompt` ではなく `buildAiChatPrompt` を呼ぶ。ただし互換 alias は残す
* `parseCodexOutput` ではなく `parseAiOutput` を呼ぶ。ただし互換 alias は残す
* non-zero exit と spawn error `ENOENT` 以外は `AI_AGENT_FAILED`
* parse error / unreadable output file は `INVALID_AI_RESPONSE`

互換:

* `runCodex` export は残す
* `CodexRunnerResult` は `AiChatRunnerResult` の alias とする
* 旧 test は必要に応じて新 code を期待するよう更新する

### 7.3 Claude runner

`server/aiChat/claudeRunner.ts` は `claude` command を非対話で起動する。prompt は stdin 経由で渡し、ユーザー入力を argv に連結しない。

採用する初期実行方式:

| 項目 | 値 |
| --- | --- |
| command | `claude` |
| base args | `['--print', '--output-format', 'text', '--no-session-persistence', '--safe-mode', '--tools', '']` |
| prompt | stdin に write する |
| shell | `false` |
| cwd | `process.cwd()` |
| stdout | AI 応答文字列として buffer し、close code 0 後に `parseAiOutput` へ渡す |
| stderr | 失敗時の診断用に短く保持する。AI 応答として parse しない |
| timeout | `300000` ms |

`--output-format json` は Claude CLI 自体の envelope JSON になる可能性があるため、MVP では採用しない。AI には prompt で `message` / `proposedCode` / `notes` の JSON だけを返すよう指示し、stdout text 全体を `parseAiOutput` で検証する。将来 `--json-schema` を使う場合も runner 内の argv mapping だけを変更すればよい。

Claude CLI はファイル編集、Bash、Read などの tools を持つ CLI なので、「ファイル編集、コマンド実行、リポジトリ変更は行わない」という制約を prompt だけに依存させない。base args には `--tools`, `''` を必ず含め、spawn argv では空文字を 1 要素として渡して全 tools を無効化する。さらに `--safe-mode` を含め、`CLAUDE.md`、skills / plugins / hooks / MCP などのローカルカスタマイズを避け、AIChat 用 prompt と stdout JSON 契約を安定させる。

error mapping:

| 状態 | code |
| --- | --- |
| spawn error `ENOENT` | `CLAUDE_NOT_FOUND` |
| timeout | `TIMEOUT` |
| cancel | `CANCELED` |
| non-zero exit | `AI_AGENT_FAILED` |
| stdout parse 失敗 | `INVALID_AI_RESPONSE` |

---

## 8. CLI argv mapping

CLI の実 model 名や effort / reasoning の値は API 契約にしない。`server/aiChat/agentConfig.ts` に交換可能な定数として置き、unit test は「内部 ID から正しい argv fragment が作られる境界」を検証する。

### 8.1 Codex CLI

base argv:

```ts
const CODEX_BASE_ARGS = [
  'exec',
  '--sandbox',
  'read-only',
  '--skip-git-repo-check',
  '--output-last-message',
  outputFilePath,
];
```

最終 argv:

```ts
[
  ...CODEX_BASE_ARGS,
  ...getCodexModelArgs(request.model),
  ...getCodexPerformanceArgs(request.performance),
  '-',
]
```

model mapping:

| model ID | argv fragment |
| --- | --- |
| `codex-default` | `[]` |
| `codex-fast` | `['--model', CODEX_MODEL_CLI_VALUES['codex-fast']]` |
| `codex-deep` | `['--model', CODEX_MODEL_CLI_VALUES['codex-deep']]` |

performance mapping:

| performance ID | argv fragment |
| --- | --- |
| `fast` | `['--config', CODEX_PERFORMANCE_CLI_VALUES.fast]` |
| `balanced` | `[]` |
| `deep` | `['--config', CODEX_PERFORMANCE_CLI_VALUES.deep]` |

`CODEX_PERFORMANCE_CLI_VALUES` の初期値は runner 定数で管理する。例として `model_reasoning_effort="low"` / `model_reasoning_effort="high"` のような Codex config override 文字列を使うが、外部 CLI の変更時は `agentConfig.ts` だけを更新する。`balanced` は仕様どおり追加 performance 引数なしにする。

### 8.2 Claude CLI

base argv:

```ts
const CLAUDE_BASE_ARGS = [
  '--print',
  '--output-format',
  'text',
  '--no-session-persistence',
  '--safe-mode',
  '--tools',
  '',
];
```

最終 argv:

```ts
[
  ...CLAUDE_BASE_ARGS,
  ...getClaudeModelArgs(request.model),
  ...getClaudePerformanceArgs(request.performance),
]
```

prompt は stdin へ write する。prompt 文字列を argv の最後に連結しない。

model mapping:

| model ID | argv fragment |
| --- | --- |
| `claude-default` | `[]` |
| `claude-fast` | `['--model', CLAUDE_MODEL_CLI_VALUES['claude-fast']]` |
| `claude-deep` | `['--model', CLAUDE_MODEL_CLI_VALUES['claude-deep']]` |

performance mapping:

| performance ID | argv fragment |
| --- | --- |
| `fast` | `['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.fast]` |
| `balanced` | `[]` |
| `deep` | `['--effort', CLAUDE_PERFORMANCE_CLI_VALUES.deep]` |

`CLAUDE_PERFORMANCE_CLI_VALUES` の初期値は `fast: 'low'`、`deep: 'high'` とする。`balanced` は仕様どおり追加 performance 引数なしにする。Claude CLI の effort 値が変わった場合は `agentConfig.ts` だけを変更する。

Claude runner の base args は安全制約として固定する。`--safe-mode` は `CLAUDE.md`、skills / plugins / hooks / MCP などのカスタマイズを避けるために採用し、`--tools ''` はファイル編集、Bash、Read などの tool 実行を CLI 側でも禁止するために採用する。Codex runner は既存どおり `--sandbox read-only` を維持し、Claude runner は tools disabled と safe-mode で同等の「AIチャットからリポジトリを変更しない」境界を作る。

### 8.3 mapping test 境界

unit test は以下を検証する。

* default model は `--model` を追加しない
* fast / deep model は `--model` と runner 定数値を追加する
* `balanced` は performance 引数を追加しない
* `fast` / `deep` は明示的な performance argv fragment を追加する
* prompt / message / code / history は argv に含めず stdin に渡す
* `shell: false` が維持される
* Codex runner は `--sandbox read-only` を維持する
* Claude runner は base args に `--safe-mode` と `--tools`, `''` を含める
* validation 済み値に mapping が存在しない場合は 500 `INTERNAL_ERROR` として扱える

---

## 9. Prompt / Parser 設計

### 9.1 promptBuilder

`server/aiChat/promptBuilder.ts` は `buildAiChatPrompt` を正の API にする。

```ts
export function buildAiChatPrompt(input: {
  message: string;
  code: string;
  history: ChatHistoryItem[];
}): string;

export const buildCodexPrompt = buildAiChatPrompt;
```

prompt 内容は既存の system 指示を維持する。Codex / Claude のどちらでも以下を要求する。

* 回答は日本語
* 現在の WGSL コードを前提に回答
* 修正時は `proposedCode` に WGSL コード全文
* 修正不要時は `proposedCode: null`
* `proposedCode` に Markdown code fence を含めない
* ファイル編集、コマンド実行、リポジトリ変更を行わない
* 最終回答は `message` / `proposedCode` / `notes` の JSON のみ

履歴 item に `agent` / `model` / `performance` は追加しない。既存履歴は本文文脈としてそのまま扱う。

### 9.2 parser

`server/aiChat/parseAiOutput.ts` を新設し、既存 parser ロジックを移す。

```ts
export type ParsedAiOutput = {
  message: string;
  proposedCode: string | null;
  notes: string[];
};

export function parseAiOutput(rawOutput: string): ParsedAiOutput;
```

検証ルール:

* 素の JSON を parse できる
* 応答全体を包む `json` code fence / 言語なし code fence だけを除去できる
* 本文中の code fence は除去しない
* `message` は string なら空文字でも valid
* `proposedCode` は string または null
* `proposedCode` の空文字は invalid
* `notes` は string 配列
* JSON 外説明文の自動修復 parse は行わない

`server/aiChat/parseCodexOutput.ts` は互換 wrapper とする。

```ts
export { parseAiOutput as parseCodexOutput };
export type { ParsedAiOutput as ParsedCodexOutput };
```

`InvalidCodexResponseError` は `InvalidAiResponseError` へ移行する。旧 class 名は互換 alias として残し、旧 test / import を段階的に更新できるようにする。

---

## 10. timeout / cancel / requestRegistry

`server/aiChat/requestRegistry.ts` は agent 非依存のまま再利用する。

| 項目 | 方針 |
| --- | --- |
| registry key | `requestId` のみ |
| registry value | child process と state のみ。agent は持たない |
| cancel API | 既存どおり `/api/ai-chat/cancel` に `requestId` だけを送る |
| timeout | Codex / Claude とも `AI_CHAT_SERVER_TIMEOUT_MS` の 300000ms |
| force kill | 既存どおり SIGTERM -> 2000ms -> SIGKILL |
| client timeout | 310000ms |

runner は Codex / Claude とも child を spawn した直後に `registry.register(requestId, child)` を呼ぶ。同一 `requestId` が実行中なら child を SIGTERM し、400 `INVALID_REQUEST` を返す。

race condition の扱いは既存計画を維持する。

| ケース | 対応 |
| --- | --- |
| 完了直後に cancel | `unregister` 済みなら cancel API は `{ canceled: true }`。messages 側の完了結果を優先 |
| cancel 直後に close | messages 側は `canceling` を確認し 499 `CANCELED` |
| timeout と cancel が近接 | 先に registry state を変更した方を優先 |
| 古い child の close が遅れる | `unregister(requestId, child)` の child identity check で新 entry を消さない |

---

## 11. フロントエンド client 設計

`src/aiChat/client.ts` は endpoint を変更しない。`sendAiChatMessage` の request body に `agent` / `model` / `performance` が含まれるだけである。

変更する表示変換:

```ts
function getDisplayMessageForErrorCode(code: AiChatErrorCode): string {
  switch (code) {
    case 'CODEX_NOT_FOUND':
      return 'Codex CLI is not installed or not found in PATH.';
    case 'CLAUDE_NOT_FOUND':
      return 'Claude CLI is not installed or not found in PATH.';
    case 'TIMEOUT':
      return 'AI chat request timed out.';
    case 'CANCELED':
      return 'Request canceled.';
    case 'INVALID_AI_RESPONSE':
    case 'INVALID_CODEX_RESPONSE':
      return 'AI returned an invalid response.';
    case 'AI_AGENT_FAILED':
    case 'CODEX_FAILED':
    case 'INVALID_REQUEST':
    case 'NOT_FOUND':
    case 'INTERNAL_ERROR':
      return 'AI chat request failed.';
  }
}
```

`INVALID_REQUEST` だけは既存どおり server message を優先する。response schema は変更しないため、成功時の `AiChatMessageResponse` validation はそのまま使える。

## 12. Runner 安全設計

runner は prompt 指示だけでリポジトリ変更を防がない。CLI 起動時の argv と `shell: false` を安全境界として扱う。

| runner | 安全境界 |
| --- | --- |
| Codex runner | 既存どおり `codex exec --sandbox read-only` を維持し、WGSL コードや user message は stdin に渡す |
| Claude runner | `claude --print --output-format text --no-session-persistence --safe-mode --tools ''` で起動し、WGSL コードや user message は stdin に渡す |

Claude runner では `--tools ''` を必須にする。これはファイル編集、Bash、Read などの tool 実行を CLI 側でも禁止し、prompt の「ファイル編集、コマンド実行、リポジトリ変更は行わない」に依存しないためである。`--safe-mode` も必須にする。これは `CLAUDE.md`、skills / plugins / hooks / MCP などのローカルカスタマイズを避け、AIChat 用 prompt と stdout JSON 契約を安定させるためである。

---

## 13. テスト計画

後続 `task.md` に TDD で落とせる粒度として、以下を追加 / 更新する。

### 13.1 共有型 / state helper test

対象: `src/aiChat/types.ts`, `src/aiChat/state.ts`, `src/aiChat/state.test.ts`

* `AiChatAgent` の許可値が `codex` / `claude`
* `AiChatPerformance` の許可値が `fast` / `balanced` / `deep`
* `codex` の既定 model が `codex-default`
* `claude` の既定 model が `claude-default`
* agent ごとの model allowlist が異なる
* `agent: codex` と `model: claude-default` の組み合わせを invalid にできる
* `agent: claude` と `model: codex-default` の組み合わせを invalid にできる
* `agent` 省略時に `codex` として正規化される
* `agent` も `model` も省略した古い request は `codex` + `codex-default` として正規化される
* `agent: claude` で `model` 省略時は `claude-default` として正規化される
* `agent: codex` で `model` 省略時は `codex-default` として正規化される
* `performance` 省略時に `balanced` として正規化される
* `agent` 省略で `model: claude-default` は invalid
* `selectedModelByAgent` の初期値が agent ごとの default になる
* agent を切り替えても performance が維持される
* 既存 `createChatHistory` は error、notes、applied、selection を履歴に含めない

### 13.2 client test

対象: `src/aiChat/client.ts`, `src/aiChat/client.test.ts`

* 送信 request に `agent` / `model` / `performance` を含めても成功 response を返す
* `CLAUDE_NOT_FOUND` は `Claude CLI is not installed or not found in PATH.`
* `CODEX_NOT_FOUND` は既存どおり Codex CLI 未インストール文言
* `TIMEOUT` は `AI chat request timed out.`
* `INVALID_AI_RESPONSE` は `AI returned an invalid response.`
* 旧 `INVALID_CODEX_RESPONSE` も `AI returned an invalid response.`
* `AI_AGENT_FAILED` は `AI chat request failed.`
* 旧 `CODEX_FAILED` も `AI chat request failed.`
* `INVALID_REQUEST` は server message を表示する
* fetch reject / client timeout は既存どおり `AI chat server is not running.`

### 13.3 ChatPanel component test

対象: `src/components/ChatPanel.tsx`, `src/components/ChatPanel.test.tsx`, `src/App.css`

* 初期表示で Agent が `Codex CLI`、Model が `Default`、Performance が `Balanced`
* Agent select に `Codex CLI` / `Claude CLI` が表示される
* Codex 選択中は `codex-*` model 候補だけが表示される
* Claude 選択中は `claude-*` model 候補だけが表示される
* Agent を Claude へ初めて変更すると Model が Claude の `Default`
* Claude で `Deep` を選択後、Codex へ切り替えて戻すと Claude の `Deep` が復元される
* Agent を切り替えても Performance の内部 ID が維持される
* Performance select に `Fast` / `Balanced` / `Deep` が表示される
* 送信 payload に `agent` / `model` / `performance` が含まれる
* Codex 選択中の payload は `codex` + Codex model
* Claude 選択中の payload は `claude` + Claude model
* 送信中に Agent を変更しても payload は送信時点の agent
* 送信中に Model を変更しても payload は送信時点の model
* 送信中に Performance を変更しても payload は送信時点の performance
* Codex 送信中は `Codex is thinking...`
* Claude 送信中は `Claude is thinking...`
* 送信中に UI の Agent を変えても thinking 表示は送信時点 agent のまま
* `CLAUDE_NOT_FOUND` 表示文言を表示できる
* `TIMEOUT` は agent 非依存文言を表示できる
* `INVALID_AI_RESPONSE` と旧 `INVALID_CODEX_RESPONSE` は agent 非依存文言を表示できる
* 既存の Apply、Cancel、Ctrl+Enter、多重送信防止、閉じても request 継続の test は維持する

### 13.4 handler test

対象: `server/aiChat/handler.ts`, `server/aiChat/handler.test.ts`

* `/messages` が `agent: codex` を受け付ける
* `/messages` が `agent: claude` を受け付ける
* `agent` 省略 request が `codex` として runner に渡る
* `agent` も `model` も省略した古い request が `codex` + `codex-default` として runner に渡る
* `agent: codex` で `model` 省略 request が `codex-default`
* `agent: claude` で `model` 省略 request が `claude-default`
* `performance` 省略 request が `balanced`
* 未対応 agent は 400 `INVALID_REQUEST`
* 未対応 model は 400 `INVALID_REQUEST`
* 未対応 performance は 400 `INVALID_REQUEST`
* `agent: codex` + `model: claude-default` は 400 `INVALID_REQUEST`
* `agent: claude` + `model: codex-default` は 400 `INVALID_REQUEST`
* `agent` 省略 + `model: claude-default` は 400 `INVALID_REQUEST`
* validation 済み request だけが `runAiChatAgent` に渡る
* `/cancel` は agent に関係なく `requestId` だけで `registry.cancel` を呼ぶ
* `CLAUDE_NOT_FOUND` が 500 error response として返る
* `AI_AGENT_FAILED` が 500 error response として返る
* `INVALID_AI_RESPONSE` が 500 error response として返る
* 旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE` を受けた場合も error response として書ける

### 13.5 runner / parser test

対象: `server/aiChat/aiAgentRunner.ts`, `server/aiChat/agentConfig.ts`, `server/aiChat/codexRunner.ts`, `server/aiChat/claudeRunner.ts`, `server/aiChat/parseAiOutput.ts`

* `agent: codex` で Codex runner が選択される
* `agent: claude` で Claude runner が選択される
* Codex runner は `codex` command を `shell: false` で spawn する
* Claude runner は `claude` command を `shell: false` で spawn する
* Codex runner は argv に `--sandbox`, `read-only` を含める
* Claude runner は base args に `--safe-mode` を含める
* Claude runner は base args に `--tools`, `''` を含め、tools disabled で起動する
* Codex runner は prompt を stdin に write する
* Claude runner は prompt を stdin に write する
* Codex runner は `--output-last-message` の一時ファイルを parse する
* Claude runner は stdout を buffer して parse する
* stdout / stderr を Codex 応答として parse しない既存 test を維持する
* Codex model mapping が argv に反映される
* Claude model mapping が argv に反映される
* Codex performance mapping が argv に反映される
* Claude performance mapping が argv に反映される
* `balanced` は追加 performance 引数なし
* `fast` / `deep` は明示的な performance argv fragment を持つ
* message / code / history は argv に含まれない
* Codex `ENOENT` は `CODEX_NOT_FOUND`
* Claude `ENOENT` は `CLAUDE_NOT_FOUND`
* Codex non-zero exit は `AI_AGENT_FAILED`
* Claude non-zero exit は `AI_AGENT_FAILED`
* Codex invalid JSON は `INVALID_AI_RESPONSE`
* Claude invalid JSON は `INVALID_AI_RESPONSE`
* timeout 時に agent に関係なく対象 child を終了する
* cancel 時に agent に関係なく対象 child を終了する
* success / failure / timeout / cancel の全経路で一時 directory を cleanup する
* `parseAiOutput` は既存 `parseCodexOutput` と同じ JSON / fence / schema test を通る
* `parseCodexOutput` 互換 wrapper が `parseAiOutput` と同じ結果を返す

### 13.6 手動確認

* 初期表示で Codex CLI / Default / Balanced が選ばれている
* Claude CLI を選び、メッセージを送信できる
* Codex CLI を選び、メッセージを送信できる
* Claude CLI 未インストール環境で Claude 用エラーが表示される
* Codex CLI 未インストール環境で Codex 用エラーが表示される
* 送信中に Agent / Model / Performance を変えても、実行中 request は送信時点 selection で完了する
* Codex / Claude のどちらでも Cancel が `Request canceled.` を 1 回だけ表示する
* AI が `proposedCode` を返した場合、Apply するまでエディターは変わらない
* ブラウザ reload 後、selection は既定値へ戻る

---

## 14. フェーズ分割と完了条件

### Phase 1: 共有型・正規化・client error 互換

対象ファイル:

* `src/aiChat/types.ts`
* `src/aiChat/state.ts`
* `src/aiChat/state.test.ts`
* `src/aiChat/client.ts`
* `src/aiChat/client.test.ts`
* `server/aiChat/errors.ts`

完了条件:

* agent / model / performance の型、option metadata、既定値、allowlist が共有型に定義されている
* 既存 request の欠落値を正規化できる
* agent-model 不一致を invalid にできる
* 新旧 error code を client / server が扱える
* 旧 `CODEX_FAILED` / `INVALID_CODEX_RESPONSE` の受信互換が残っている

### Phase 2: parser / prompt の agent 非依存化

対象ファイル:

* `server/aiChat/promptBuilder.ts`
* `server/aiChat/parseAiOutput.ts`
* `server/aiChat/parseAiOutput.test.ts`
* `server/aiChat/parseCodexOutput.ts`
* `server/aiChat/parseCodexOutput.test.ts`
* `server/aiChat/errors.ts`

完了条件:

* `buildAiChatPrompt` が Codex / Claude 共通 prompt を作る
* `buildCodexPrompt` 互換 alias が残っている
* `parseAiOutput` が共通 JSON 契約を検証する
* `parseCodexOutput` 互換 wrapper が残っている
* invalid response は新 code `INVALID_AI_RESPONSE` で表現できる

### Phase 3: server handler と runner dispatch

対象ファイル:

* `server/aiChat/handler.ts`
* `server/aiChat/handler.test.ts`
* `server/aiChat/aiAgentRunner.ts`
* `server/aiChat/aiAgentRunner.test.ts`
* `server/aiChat/agentConfig.ts`

完了条件:

* handler が `runAiChatAgent` へ正規化済み request を渡す
* 欠落 `agent` / `model` / `performance` の後方互換が実装されている
* 未対応値と agent-model 不一致は 400 `INVALID_REQUEST`
* `/cancel` は requestId のみで既存どおり動く
* `agent: codex` / `agent: claude` の dispatch が test で確認できる

### Phase 4: Codex runner mapping 移行

対象ファイル:

* `server/aiChat/codexRunner.ts`
* `server/aiChat/codexRunner.test.ts`
* `server/aiChat/agentConfig.ts`

完了条件:

* 既存 Codex spawn / stdin / output-last-message / cleanup / timeout / cancel が維持されている
* Codex model / performance mapping が argv に反映される
* non-zero exit は `AI_AGENT_FAILED`
* invalid output は `INVALID_AI_RESPONSE`
* `CODEX_NOT_FOUND` は維持されている

### Phase 5: Claude runner 追加

対象ファイル:

* `server/aiChat/claudeRunner.ts`
* `server/aiChat/claudeRunner.test.ts`
* `server/aiChat/aiAgentRunner.ts`
* `server/aiChat/agentConfig.ts`

完了条件:

* Claude runner が `claude` command を `shell: false` で spawn する
* Claude runner が `--safe-mode` と `--tools ''` を含む base args で起動される
* prompt が stdin 経由で渡る
* stdout が `parseAiOutput` で parse される
* Claude model / performance mapping が argv に反映される
* `CLAUDE_NOT_FOUND`、`AI_AGENT_FAILED`、`INVALID_AI_RESPONSE`、`TIMEOUT`、`CANCELED` が test で確認できる
* requestRegistry に agent 固有情報を追加せず cancel / timeout できる

### Phase 6: ChatPanel UI

対象ファイル:

* `src/components/ChatPanel.tsx`
* `src/components/ChatPanel.test.tsx`
* `src/App.css`
* `src/aiChat/state.ts`

完了条件:

* Agent / Model / Performance control が表示される
* 初期値は Codex CLI / Default / Balanced
* agent 切り替えで model 候補が切り替わる
* agent ごとの前回 model が復元される
* performance は agent 切り替えで維持される
* 送信 payload に `agent` / `model` / `performance` が含まれる
* 送信中に selection を変更しても進行中 request は送信時点 selection を使う
* `activeRequestAgent` に基づく thinking 表示が動く
* 既存 Apply / Cancel / 多重送信防止 / Ctrl+Enter / 開閉挙動が壊れていない

### Phase 7: 回帰確認

対象:

* `npm run test`
* `npm run typecheck`
* `npm run lint`
* 手動確認

完了条件:

* 既存 AIチャット test と追加 test が通る
* typecheck が通る
* lint が通る
* Codex / Claude の選択、送信、cancel、error 表示を手動確認できる

---

## 15. リスクと採用判断

| リスク | 採用判断 |
| --- | --- |
| Codex / Claude CLI の model 名や effort 引数が変更される | API の内部 ID と CLI 実値を分離し、`server/aiChat/agentConfig.ts` の定数だけを差し替えればよい構成にする |
| Claude CLI の JSON 出力形式が CLI envelope になる | MVP では `--output-format text` を採用し、AI が返す JSON 本文だけを `parseAiOutput` で検証する |
| `balanced` に明示的な CLI 引数を渡すべきか不明 | 仕様どおり `balanced` は既定動作として追加引数なしにする。`fast` / `deep` だけ明示的 fragment を持たせる |
| handler と runner の両方で validation が重複する | handler を validation の正とし、runner は正規化済み request を受け取る。runner 側は mapping 不備だけ `INTERNAL_ERROR` にする |
| 旧 `parseCodexOutput` 名を消すと既存 import / test の変更が大きい | `parseAiOutput` を新設し、`parseCodexOutput` は互換 wrapper として残す |
| 旧 error code を消すと既存 client / test が壊れる | union と表示変換に旧 code を残し、server の新規返却だけ新 code へ移行する |
| selection を App state に上げると既存 App 変更範囲が広がる | selection は `ChatPanel` 専用 state とし、App は既存 props のままにする |
| 送信中に UI selection を変更すると表示と実行中 request がずれる | `activeRequestAgent` と `selectionAtSubmit` を導入し、実行中表示と payload は送信時点値へ固定する |
| 履歴 item に過去 agent 情報を追加したくなる | MVP では履歴 item の契約を変更しない。最新 request の selection だけが実行先を決める |
| requestRegistry に agent を入れたくなる | cancel / timeout は child process に対する操作なので、registry は requestId / child / state のままにする |
| Claude CLI が tools やローカルカスタマイズ経由でファイル編集、コマンド実行、リポジトリ変更を行う | Claude runner の base args に `--safe-mode` と `--tools ''` を必ず含める。Codex runner は既存どおり `--sandbox read-only` を維持する |

---

## 16. 実装後の検証コマンド

実装後は以下を実行する。

```bash
npm run test
npm run typecheck
npm run lint
```

plan 作成時点では実装ファイルを変更しないため、今回の検証は次の差分確認だけを行う。

```bash
git diff -- specs/ai-chat-cli-selection/plan.md
```
