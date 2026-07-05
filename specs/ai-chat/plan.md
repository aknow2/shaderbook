# WGSL Shader Playground AIチャット機能 — 実装計画書

対象: `specs/ai-chat/spec.md` に基づく AIチャット機能の実装計画。既存計画 `specs/plan.md` の方針を継承し、React state、既存 `EditorPane` / `ErrorPanel` / `PreviewPane` の配置、`Ctrl+Enter` による Run、Vite + Vitest の構成を前提にする。

---

## 1. スコープ確認

`specs/ai-chat/spec.md` §16 の MVP 完了条件を実装完了条件とする。初期リリースでは以下を実装しない。

* Codex CLI 以外の AI エージェント対応
* OpenAI API など外部 API の直接呼び出し
* 会話履歴の永続化、localStorage 保存、複数チャットスレッド
* ストリーミング応答
* AI 提案コードの自動エディター反映
* AI 提案コードの差分ビュー、自動コンパイル
* 画像、ファイル添付、音声入力
* 本番環境へのサーバー公開

仕様と矛盾する設計判断は行わない。サーバー方式は仕様 §6 では別プロセスと Vite 統合の両方が許容されているが、本計画では **Vite dev server 統合**に固定する。

採用理由:

* `npm run dev` 1 コマンドでフロントエンドと AIチャット API が起動する
* ブラウザからは同一 origin の `/api/ai-chat/*` として呼び出せるため CORS が不要
* bind address は Vite dev server の設定に従い、別サーバー用のポート管理を増やさない
* 初期リリースのローカル開発専用という仕様 §11.1 と整合する

Vite preview / production build では AIチャット API を提供しない。`configureServer` で dev server middleware として追加するため、初期リリースの対象は `npm run dev` のローカル実行に限定する。

---

## 2. 変更対象ファイルと新規ファイル

### 2.1 変更対象ファイル

| ファイル | 変更内容 |
| --- | --- |
| `vite.config.ts` | `aiChatVitePlugin()` を import し、`configureServer` で `/api/ai-chat/*` middleware を追加 |
| `tsconfig.app.json` | `vite.config.ts` を app 側 include から外し、Node 専用コードが DOM 側 typecheck に混ざらないようにする |
| `tsconfig.node.json` | `vite.config.ts` と `server/**/*.ts` を Node 側 typecheck 対象に含める |
| `src/App.tsx` | `ChatPanel` を `editor-column` の `ErrorPanel` 下に追加、`code` と `setCode` を渡す、document keydown でチャット入力欄を Run 対象外にする |
| `src/App.css` | `chat-panel`、メッセージ一覧、入力欄、送信/キャンセル、提案コード、Applied 表示のスタイル追加 |
| `src/App.test.tsx` | `ChatPanel` の配置、`setCode` 連携、チャット入力欄フォーカス中の `Ctrl+Enter` 競合回避を検証 |

`package.json` と `src/test/setup.ts` は変更しない。`package.json` の scripts は既存の `dev` / `build` / `lint` / `test` / `typecheck` をそのまま使う。fetch mock と timer reset は各 test file 内で完結させ、共通 setup には追加しない。

### 2.2 新規ファイル

| ファイル | 役割 |
| --- | --- |
| `src/aiChat/types.ts` | フロントエンドとサーバーで共有するリクエスト/レスポンス型、エラーコード、制約値 |
| `src/aiChat/client.ts` | `/api/ai-chat/messages` / `/api/ai-chat/cancel` の fetch client、HTTP timeout、エラー正規化 |
| `src/aiChat/state.ts` | ChatPanel 用の履歴整形、直近 20 件抽出、入力制約、message id / request id 生成 helper |
| `src/aiChat/state.test.ts` | 入力検証、履歴丸め、payload 変換、id 生成 helper の unit test |
| `src/aiChat/client.test.ts` | fetch mock による成功、サーバーエラー、ネットワークエラー、HTTP timeout、cancel API の unit test |
| `src/components/ChatPanel.tsx` | AIチャット UI、ローカル React state、送信/キャンセル/Apply 操作 |
| `src/components/ChatPanel.test.tsx` | 開閉、送信、送信中表示、多重送信防止、Apply、ショートカット、エラー表示の component test |
| `server/aiChat/vitePlugin.ts` | Vite plugin 本体。`configureServer` で middleware を登録 |
| `server/aiChat/handler.ts` | HTTP request routing、JSON body parse、schema validation、response 生成 |
| `server/aiChat/codexRunner.ts` | `child_process.spawn` で `codex exec` を実行し、timeout / cancel / 一時ファイル cleanup を制御 |
| `server/aiChat/promptBuilder.ts` | system 指示、履歴 20 件、コード全文、ユーザーメッセージを Codex 用 prompt へ変換 |
| `server/aiChat/parseCodexOutput.ts` | `--output-last-message` の内容から fence 除去、JSON parse、schema 検証 |
| `server/aiChat/requestRegistry.ts` | `requestId -> child process` の Map、cancel API、完了時 cleanup、race 対策 |
| `server/aiChat/errors.ts` | API error code と HTTP status の対応、JSON error response helper |
| `server/aiChat/readJsonBody.ts` | Node `IncomingMessage` から size limit 付きで JSON body を読む helper |
| `server/aiChat/*.test.ts` | サーバー純粋ロジックと handler の Node 環境 unit test |

共有型は `src/aiChat/types.ts` に 1 箇所だけ置き、フロントエンドと `server/aiChat/*` の両方から import する。このファイルは app / node 両プロジェクトから型チェックされるため、DOM / React / Node 固有 API を置かず、型、文字列 union、制約値、純粋な type guard だけを置く。これにより app 側と server 側の JSON 契約が分岐しない。

`tsconfig.node.json` は `module: nodenext` と `allowImportingTsExtensions: true` を使う。Node 側で型チェックされる `server/aiChat/*.ts` 同士、および `server/aiChat/*.ts` から `src/aiChat/types.ts` への相対 import は `./handler.ts`、`../../src/aiChat/types.ts` のように `.ts` 拡張子付きで書く。app 側 `src/` 同士の import は bundler resolution のため従来どおり拡張子なしで書く。

---

## 3. 共有型と API 契約

`src/aiChat/types.ts` に仕様 §9 の JSON 契約を定義する。

```ts
export const AI_CHAT_MESSAGE_MAX_LENGTH = 4000;
export const AI_CHAT_CODE_MAX_LENGTH = 200000;
export const AI_CHAT_HISTORY_MAX_ITEMS = 20;
export const AI_CHAT_REQUEST_ID_MAX_LENGTH = 128;
export const AI_CHAT_SERVER_TIMEOUT_MS = 120000;
export const AI_CHAT_CLIENT_TIMEOUT_MS = 130000;

export type ChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
  proposedCode?: string | null;
};

export type AiChatMessageRequest = {
  requestId: string;
  message: string;
  code: string;
  history: ChatHistoryItem[];
};

export type AiChatAssistantMessage = {
  role: 'assistant';
  content: string;
  proposedCode: string | null;
  notes: string[];
};

export type AiChatMessageResponse = {
  requestId: string;
  message: AiChatAssistantMessage;
};

export type AiChatCancelRequest = {
  requestId: string;
};

export type AiChatCancelResponse = {
  requestId: string;
  canceled: true;
};

export type AiChatErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'CODEX_NOT_FOUND'
  | 'CODEX_FAILED'
  | 'INVALID_CODEX_RESPONSE'
  | 'INTERNAL_ERROR';

export type AiChatErrorResponse = {
  error: {
    code: AiChatErrorCode;
    message: string;
  };
};
```

フロントエンド内の表示用 message は API 型とは分ける。

```ts
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  proposedCode: string | null;
  notes: string[];
  applied: boolean;
  createdAt: number;
};
```

`ChatMessage` は `src/aiChat/state.ts` に置き、API の `ChatHistoryItem` へ変換する helper を用意する。error message は Codex への履歴には含めない。assistant message は `content` と `proposedCode` だけを履歴化し、`notes` と `applied` は UI 状態として扱う。

---

## 4. サーバー統合方式

`server/aiChat/vitePlugin.ts` は Vite plugin を返す。

```ts
import type { Plugin } from 'vite';
import { createAiChatHandler } from './handler';
import { createRequestRegistry } from './requestRegistry';

export function aiChatVitePlugin(): Plugin {
  return {
    name: 'wgslpg-ai-chat',
    apply: 'serve',
    configureServer(server) {
      const registry = createRequestRegistry();
      const handler = createAiChatHandler({ registry });

      server.middlewares.use('/api/ai-chat', (request, response, next) => {
        void handler(request, response, next);
      });
    },
  };
}
```

`vite.config.ts` は以下の形にする。

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { aiChatVitePlugin } from './server/aiChat/vitePlugin';

export default defineConfig({
  plugins: [react(), aiChatVitePlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

middleware は `/api/ai-chat/messages` と `/api/ai-chat/cancel` だけを処理する。その他の `/api/ai-chat/*` は 404 `NOT_FOUND` を JSON で返す。`/api/ai-chat` 以外は Vite の通常 middleware に渡す。

Vite dev server 統合のため、CORS header は追加しない。同一 origin の fetch だけを想定する。別プロセス用の port、起動 script、CORS 設定は実装しない。

---

## 5. HTTP handler 設計

`server/aiChat/handler.ts` は Node の `IncomingMessage` / `ServerResponse` を直接扱う薄い handler にする。Express などのサーバーフレームワークは追加しない。

```ts
export type AiChatHandlerDependencies = {
  registry: RequestRegistry;
  runCodex?: typeof runCodex;
};

export function createAiChatHandler(dependencies: AiChatHandlerDependencies) {
  return async function handleAiChatRequest(
    request: IncomingMessage,
    response: ServerResponse,
    _next: (error?: unknown) => void,
  ): Promise<void> {
    if (!request.url) {
      writeError(response, 404, 'NOT_FOUND');
      return;
    }

    if (request.method !== 'POST') {
      writeError(response, 404, 'NOT_FOUND');
      return;
    }

    if (request.url === '/messages') {
      await handleMessages(request, response, dependencies);
      return;
    }

    if (request.url === '/cancel') {
      await handleCancel(request, response, dependencies.registry);
      return;
    }

    writeError(response, 404, 'NOT_FOUND');
  };
}
```

`readJsonBody.ts` は body size を防御的に制限する。`messages` は `code` 200000 文字と履歴 20 件を含むため上限は `256 * 1024` byte では足りない。初期実装では `8 * 1024 * 1024` byte を上限にする。上限超過、JSON parse 失敗、schema 不一致は 400 `INVALID_REQUEST` とする。

schema validation は外部ライブラリを追加せず type guard で行う。検証条件:

* `requestId`: string、1 文字以上、128 文字以下
* `message`: trim 後 1 文字以上、4000 文字以下
* `code`: 1 文字以上、200000 文字以下
* `history`: array、20 件以下
* `history[].role`: `user` または `assistant`
* `history[].content`: string
* `history[].proposedCode`: undefined、string、null のいずれか

同じ `requestId` が実行中の場合は 400 `INVALID_REQUEST` を返す。これはクライアント生成 ID の重複であり、仕様 §9.3 の既存エラーコード内では request schema / 状態不正として扱う。

---

## 6. Codex CLI 実行仕様

`server/aiChat/codexRunner.ts` は `child_process.spawn` を shell なしで使う。prompt は stdin 経由で渡す。

```ts
const args = [
  'exec',
  '--sandbox',
  'read-only',
  '--skip-git-repo-check',
  '--output-last-message',
  outputFilePath,
  '-',
] as const;

const child = spawn('codex', args, {
  cwd: process.cwd(),
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
});

child.stdin.write(prompt);
child.stdin.end();
```

呼び出し形:

| 項目 | 値 |
| --- | --- |
| command | `codex` |
| args | `['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--output-last-message', outputFilePath, '-']` |
| prompt | `-` 引数を使い stdin に write する |
| shell | `false` |
| cwd | `process.cwd()` |
| timeout | `120000` ms |
| stdout / stderr | AI 応答として parse しない。失敗時の診断用文字列として短く保持する |
| 最終メッセージ | `--output-last-message` の一時ファイルから読む |

一時ファイルは `os.tmpdir()` に request ごとに作成する。

```ts
const tempDirectory = await mkdtemp(join(tmpdir(), 'wgslpg-ai-chat-'));
const outputFilePath = join(tempDirectory, 'last-message.txt');
```

cleanup は `finally` で実行し、成功、失敗、timeout、cancel の全経路で `rm(tempDirectory, { recursive: true, force: true })` を呼ぶ。

timeout 時は以下の順で終了する。

1. `setTimeout` が `120000` ms で発火
2. requestRegistry の該当 entry を `timedOut` 扱いにする
3. `child.kill('SIGTERM')`
4. 2000 ms 待っても close しなければ `child.kill('SIGKILL')`
5. close 後に 408 `TIMEOUT` を返す

cancel 時も kill 方針は同じにする。

1. cancel API が `requestRegistry.cancel(requestId)` を呼ぶ
2. entry が存在すれば `child.kill('SIGTERM')`
3. 2000 ms 待っても close しなければ `child.kill('SIGKILL')`
4. messages 側の処理は close 後に 499 `CANCELED` を返す
5. entry が存在しなければ cancel API は成功扱いで `{ canceled: true }` を返す

`spawn` 自体が `ENOENT` を返した場合は 500 `CODEX_NOT_FOUND` とする。終了コードが `0` 以外で、timeout / cancel ではない場合は 500 `CODEX_FAILED` とする。終了コード `0` でも一時ファイルが読めない、JSON parse / schema 検証に失敗した場合は 500 `INVALID_CODEX_RESPONSE` とする。

---

## 7. requestRegistry 設計

`server/aiChat/requestRegistry.ts` は requestId と子プロセスの対応だけを持つ。会話履歴や AI 応答は保持しない。

```ts
export type RegisteredRequestState = 'running' | 'canceling' | 'timedOut';

export type RegisteredRequest = {
  requestId: string;
  child: ChildProcessWithoutNullStreams;
  state: RegisteredRequestState;
  forceKillTimer: NodeJS.Timeout | null;
};

export type RequestRegistry = {
  register: (requestId: string, child: ChildProcessWithoutNullStreams) => boolean;
  getState: (requestId: string, child: ChildProcessWithoutNullStreams) => RegisteredRequestState | null;
  markTimedOut: (requestId: string, child: ChildProcessWithoutNullStreams) => void;
  cancel: (requestId: string) => boolean;
  unregister: (requestId: string, child: ChildProcessWithoutNullStreams) => void;
};
```

実装ルール:

* `register` は同じ `requestId` が Map に存在する場合 `false` を返す
* `cancel` は対象が存在しない場合も `true` を返す
* `cancel` は entry が `running` の場合だけ `canceling` に変更し、SIGTERM と SIGKILL timer を設定する
* すでに `canceling` または `timedOut` の entry に対する `cancel` は二重 kill timer を作らず `true` を返す
* `markTimedOut` は child が一致する場合だけ `timedOut` に変更し、SIGTERM と SIGKILL timer を設定する
* `unregister` は Map 上の child が一致する場合だけ削除する
* `unregister` は `forceKillTimer` があれば `clearTimeout` する

race condition の扱い:

| ケース | 対応 |
| --- | --- |
| 完了直後に cancel が来た | messages 側が `unregister` 済みなら cancel は `{ canceled: true }` を返す。表示は完了済みの AI 応答またはエラーを優先 |
| cancel 直後に child が exit した | messages 側は `getState` で `canceling` を確認し、499 `CANCELED` を返す |
| timeout と cancel が近接した | 先に state を変更した方を優先する。`timedOut` が先なら 408、`canceling` が先なら 499 |
| 同一 requestId の重複送信 | `register` が `false` を返し、messages API は 400 `INVALID_REQUEST` |
| 古い child の close が遅れて新しい entry を消す | `unregister(requestId, child)` は child identity が一致する場合だけ削除するため、新しい entry を消さない |

---

## 8. プロンプト組み立て

`server/aiChat/promptBuilder.ts` は仕様 §10.2 に従い、system 指示、直近 20 件の履歴、現在の WGSL コード全文、最新ユーザーメッセージを 1 つの prompt 文字列へ連結する。

履歴はサーバー側でも末尾 20 件に丸める。フロントエンドも 20 件に丸めるが、サーバーを正とする。

```ts
export function buildCodexPrompt(input: {
  message: string;
  code: string;
  history: ChatHistoryItem[];
}): string {
  const historyText = input.history
    .slice(-AI_CHAT_HISTORY_MAX_ITEMS)
    .map((item, index) => {
      const proposedCode =
        item.role === 'assistant' && item.proposedCode
          ? `\nproposedCode:\n${item.proposedCode}`
          : '';

      return `## History ${index + 1} (${item.role})\n${item.content}${proposedCode}`;
    })
    .join('\n\n');

  return `あなたは WGSL Shader Playground の AI チャットアシスタントです。

以下のルールを必ず守ってください。
- 回答は日本語にしてください。
- 現在の WGSL コードを前提に、ユーザーの質問へ具体的に答えてください。
- WGSL コードを修正する場合は、修正後の WGSL コード全文を proposedCode に入れてください。
- proposedCode は差分、抜粋、説明文、Markdown code fence を含まない WGSL コード全文にしてください。
- コード修正が不要な場合は proposedCode を null にしてください。
- ユーザーの指示が WGSL コードと無関係な場合は、できる範囲で説明し、コード修正は行わないでください。
- ファイル編集、コマンド実行、リポジトリ変更は行わないでください。
- 最終回答は次の JSON 形式だけにしてください。JSON の外側に説明文を付けないでください。

{
  "message": "回答本文",
  "proposedCode": "修正後の WGSL コード全文。コード修正がない場合は null",
  "notes": ["補足事項"]
}

# 直近のチャット履歴
${historyText || '(履歴なし)'}

# 現在の WGSL コード全文
\`\`\`wgsl
${input.code}
\`\`\`

# 最新のユーザーメッセージ
${input.message}
`;
}
```

prompt 内ではコード全文を WGSL code fence で囲むが、Codex の最終回答では `proposedCode` に code fence を含めないよう system 指示で固定する。履歴内の `proposedCode` は過去の文脈として渡すだけで、最新提案コードとしては扱わない。

---

## 9. Codex 出力 parse

`server/aiChat/parseCodexOutput.ts` は一時ファイルの内容を受け取り、仕様 §10.3 の検証を行う。

```ts
export function parseCodexOutput(rawOutput: string): {
  message: string;
  proposedCode: string | null;
  notes: string[];
} {
  const withoutFence = stripWrappingCodeFence(rawOutput.trim());
  const parsed: unknown = JSON.parse(withoutFence);

  if (!isObject(parsed)) {
    throw new InvalidCodexResponseError();
  }

  const message = parsed.message;
  const proposedCode = parsed.proposedCode;
  const notes = parsed.notes;

  if (typeof message !== 'string') {
    throw new InvalidCodexResponseError();
  }

  if (!(typeof proposedCode === 'string' || proposedCode === null)) {
    throw new InvalidCodexResponseError();
  }

  if (proposedCode === '') {
    throw new InvalidCodexResponseError();
  }

  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new InvalidCodexResponseError();
  }

  return { message, proposedCode, notes };
}
```

`stripWrappingCodeFence` は応答全体が ```` ```json ... ``` ```` または ```` ``` ... ``` ```` で包まれている場合だけ外側を除去する。本文中の code fence は除去しない。

`message` が空文字または trim 後に空になる文字列でも、schema 上は valid として扱い `INVALID_CODEX_RESPONSE` にはしない。`Codex returned an empty response.` のような代替文への差し替えも行わず、受け取った `message` をそのまま表示する。`proposedCode` の空文字だけは仕様 §15 に従い不正な Codex 応答として扱う。

---

## 10. フロントエンド状態管理

AIチャット state は `ChatPanel` 内に閉じる。`App.tsx` は現在の `code` と `setCode` だけを渡す。

```ts
export type ChatPanelProps = {
  code: string;
  onApplyCode: (code: string) => void;
};
```

採用理由:

* チャット履歴、入力欄、送信中状態は AIチャット UI 専用であり、`PreviewPane` や `StatusBar` と共有しない
* 仕様 §12 の state はチャットパネルの開閉とセッション中履歴であり、アプリ全体 state に上げる必要がない
* Apply だけがエディター state へ影響するため、`setCode` 相当の callback を props で渡せば足りる

`ChatPanel` が持つ state:

```ts
const [isChatOpen, setIsChatOpen] = useState(true);
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [inputValue, setInputValue] = useState('');
const [isSending, setIsSending] = useState(false);
const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
```

送信処理:

1. `inputValue.trim()` が空なら送信しない
2. 4000 文字超過なら送信せず入力欄付近に上限超過を表示する
3. `code` が空なら `WGSL code is empty.` を Error message として追加する
4. `code` が 200000 文字超過なら `WGSL code is too large.` を Error message として追加する
5. `isSending` が true なら送信しない
6. `requestId` を `crypto.randomUUID()` で生成する。未対応環境の test 用に helper で fallback を持つ
7. user message を messages に追加する
8. `isSending = true`、`activeRequestId = requestId`
9. `sendAiChatMessage` を呼ぶ。payload の `history` は user message 追加前の messages から直近 20 件を作る
10. 成功時は assistant message を追加し、入力欄を空にする
11. 失敗時は Error message を追加し、入力欄は保持する
12. `finally` で `isSending = false`、`activeRequestId = null`

キャンセル処理:

* cancel button は `isSending && activeRequestId !== null` の時だけ表示する
* 押下時に `cancelAiChatRequest(activeRequestId)` を呼ぶ
* cancel API の成功レスポンス自体では Error message を追加しない
* 進行中の messages fetch が 499 `CANCELED` で失敗した時だけ `Request canceled.` を 1 回追加する
* cancel API が fetch reject した場合は `AI chat server is not running.` を Error message として追加するが、messages fetch の結果を引き続き待つ

`sendAiChatMessage` は 130000 ms の HTTP client timeout を持つ。timeout は `AbortController` と `setTimeout` で実装し、abort された場合は fetch reject として `AI chat server is not running.` として扱う。サーバー側 timeout は 120000 ms なので、通常はサーバーの 408 `TIMEOUT` を受け取り `Codex request timed out.` を表示できる。

---

## 11. Ctrl+Enter 競合回避

既存 `App.tsx` は `document.addEventListener('keydown', handleKeyDown)` で bubbling phase の keydown を処理し、`Ctrl+Enter` / `Meta+Enter` を Run として扱う。チャット入力欄ではチャット送信を優先する。

実装は二重防御にする。

1. `ChatPanel` の textarea `onKeyDown` で `Ctrl+Enter` または `Meta+Enter` を検出したら、`event.preventDefault()` と `event.stopPropagation()` を呼び、送信処理を実行する
2. `App` 側 document listener でも `event.target` がチャット入力欄内なら Run / Save shortcut を処理しない

`App` 側の判定:

```ts
function isFromAiChatInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-ai-chat-input="true"]') !== null;
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (isFromAiChatInput(event.target)) {
    return;
  }

  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handleRun();
    return;
  }

  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    handleSave();
  }
};
```

textarea 側:

```tsx
<textarea
  data-ai-chat-input="true"
  aria-label="AI chat message"
  value={inputValue}
  onChange={(event) => setInputValue(event.target.value)}
  onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      void submitMessage();
    }
  }}
/>
```

document listener は bubbling phase なので textarea の `stopPropagation` で通常は止まる。ただし将来 listener の位置や component 構造が変わっても Run が発火しないよう、App 側 target 判定も残す。

---

## 12. ChatPanel UI 設計

`ChatPanel` は `editor-column` 内で `ErrorPanel` の直後に置く。

```tsx
<div className="editor-column">
  <EditorPane code={code} onChange={setCode} />
  <ErrorPanel message={errorMessage} />
  <ChatPanel code={code} onApplyCode={setCode} />
</div>
```

初期状態は開いている。閉じている時は header だけを表示し、履歴と送信中処理は保持する。

DOM 構成:

```tsx
<section className="panel chat-panel" aria-labelledby="ai-chat-title">
  <div className="panel-header chat-panel-header">
    <h2 id="ai-chat-title">AI Chat</h2>
    <button type="button" aria-expanded={isChatOpen}>...</button>
  </div>
  {isChatOpen ? (
    <>
      <div className="chat-messages" aria-live="polite">...</div>
      <form className="chat-input-row" onSubmit={...}>...</form>
    </>
  ) : null}
</section>
```

ARIA 要件:

* textarea は `aria-label="AI chat message"` を持つ
* 送信ボタンは `aria-label="Send AI chat message"` を持つ
* キャンセルボタンは `aria-label="Cancel AI chat request"` を持つ
* Apply button は対象 message が分かる `aria-label` を持つ
* 開閉ボタンは `aria-expanded={isChatOpen}` を持つ
* メッセージ一覧または送信中表示を含む領域は `aria-live="polite"` を持つ

メッセージ表示:

| role | 表示 |
| --- | --- |
| `user` | ユーザー本文 |
| `assistant` | AI 応答本文、`notes`、提案コード、Apply button |
| `error` | エラー本文 |

AI が `proposedCode` を持つ場合だけ `shader.wgsl` のコードブロックと Apply button を表示する。

Apply 処理:

```ts
function applyProposedCode(messageId: string, proposedCode: string): void {
  onApplyCode(proposedCode);
  setMessages((current) =>
    current.map((message) =>
      message.id === messageId ? { ...message, applied: true } : message,
    ),
  );
}
```

Apply 後は Run を自動実行しない。`ErrorPanel` と `PreviewPane` は変更しない。対象 message には `Applied` を表示する。同じ message の Apply は 2 回目以降も許可し、同じ proposedCode で全文置換する。

入力欄:

* textarea
* `maxLength` は付けず、4000 文字超過を入力欄付近に表示して送信不可にする。超過分を編集できるようにするため
* `Enter` は改行
* `Ctrl+Enter` / `Meta+Enter` は送信
* 送信成功時だけ空にする
* 送信失敗、キャンセル時は保持する

送信中は `Codex is thinking...` を message list 末尾または入力欄付近に表示する。`aria-live="polite"` の領域内に置き、スクリーンリーダーで状態が伝わるようにする。

---

## 13. フロントエンド client

`src/aiChat/client.ts` は fetch を 1 箇所に集約する。

```ts
export async function sendAiChatMessage(
  request: AiChatMessageRequest,
  options: { timeoutMs?: number } = {},
): Promise<AiChatMessageResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? AI_CHAT_CLIENT_TIMEOUT_MS,
  );

  try {
    const response = await fetch('/api/ai-chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    return await parseAiChatResponse<AiChatMessageResponse>(response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function cancelAiChatRequest(
  request: AiChatCancelRequest,
): Promise<AiChatCancelResponse> {
  const response = await fetch('/api/ai-chat/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return await parseAiChatResponse<AiChatCancelResponse>(response);
}
```

`parseAiChatResponse` は `response.ok` が false の場合、`AiChatErrorResponse` を parse して UI 表示用 error に変換する。fetch が reject した場合は、接続不能、ネットワークエラー、client timeout の abort を含めて一律 `AI chat server is not running.` に正規化する。仕様 §8.7 / §15 の「ネットワークエラー → `AI chat request failed.`」は、fetch reject 以外の予期しない失敗、たとえば response body の JSON が壊れている場合や成功 response の schema が壊れている場合に適用する。

エラー表示 mapping:

| code / 状態 | UI 表示 |
| --- | --- |
| fetch reject（接続不能、ネットワークエラー、client timeout の abort を含む） | `AI chat server is not running.` |
| `CODEX_NOT_FOUND` | `Codex CLI is not installed or not found in PATH.` |
| `TIMEOUT` | `Codex request timed out.` |
| `CANCELED` | `Request canceled.` |
| `INVALID_CODEX_RESPONSE` | `Codex returned an invalid response.` |
| `CODEX_FAILED` | `AI chat request failed.` |
| `INVALID_REQUEST` | server message を表示。なければ `AI chat request failed.` |
| response JSON parse 失敗 / response schema 不一致 | `AI chat request failed.` |
| その他の予期しない失敗 | `AI chat request failed.` |

`fetch` が接続拒否になるケースは Vite 統合では通常発生しないが、Vite plugin が無効な環境や preview では起こりうる。ブラウザ fetch では接続拒否とその他のネットワークエラーを TypeError reject から判別できないため、fetch reject はすべて `AI chat server is not running.` に寄せる。

---

## 14. App / CSS 変更

`App.tsx`:

* `ChatPanel` を import する
* `editor-column` 内の `ErrorPanel` 下に `<ChatPanel code={code} onApplyCode={setCode} />` を追加する
* document keydown handler に `isFromAiChatInput(event.target)` を追加する
* Run / Reset / Save / Preview / StatusBar の既存 state は変更しない

`App.css`:

* 既存の `.panel`、`.panel-header`、`.button`、`.control-button` の命名規則を使う
* `chat-panel` は `flex: 0 0 auto` とし、開いている時もエディターを完全に押し潰さないよう `max-height` を設定する
* message list は `overflow: auto`
* proposed code は `font-family: var(--font-mono)`、`white-space: pre-wrap`、`overflow-wrap: anywhere`
* error message は `ErrorPanel` と同じ色調を使うが、`ErrorPanel` 自体には表示しない

CSS 例:

```css
.chat-panel {
  flex: 0 0 auto;
  max-height: 320px;
  border-top: 1px solid var(--color-border);
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 96px;
  overflow: auto;
  padding: 12px 16px;
}

.chat-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}
```

モバイル最適化は初期リリースの対象外だが、既存アプリは `min-width: 1024px` で desktop 前提のため、チャット UI も同じ前提に合わせる。

---

## 15. TDD テスト計画

### 15.1 共有型 / state helper

`src/aiChat/state.test.ts`

* 空文字、空白のみは送信不可
* 4000 文字は送信可、4001 文字は送信不可
* code 空文字は `WGSL code is empty.`
* code 200000 文字は送信可、200001 文字は `WGSL code is too large.`
* error message は API history に含めない
* history は直近 20 件だけになる
* assistant の `proposedCode` が history に含まれる

### 15.2 client

`src/aiChat/client.test.ts`

* 成功 response を `AiChatMessageResponse` として返す
* 400 / 408 / 499 / 500 の error response を UI 表示用 error に変換する
* fetch が reject した場合に server 未起動相当の error になる
* HTTP timeout で `AbortController.abort()` が呼ばれる
* cancel API が `{ canceled: true }` を返す

fetch を使うフロントエンド test は `vi.fn()` で `globalThis.fetch` を差し替える。各 test の `afterEach` で mock を restore し、実ネットワークには出さない。timeout は fake timers を使う。

### 15.3 ChatPanel

`src/components/ChatPanel.test.tsx`

* 初期状態で `AI Chat` が開いている
* 開閉しても messages が残る
* 空入力では Send が disabled
* 送信中は Send が disabled、Cancel が表示される
* 送信中にもう一度 submit しても fetch は 1 回だけ
* 成功時に user message と assistant message が表示され、入力欄が空になる
* 失敗時に Error message が表示され、入力欄が残る
* `proposedCode` がある場合だけ Apply button が表示される
* Apply で `onApplyCode(proposedCode)` が呼ばれ、`Applied` が表示される
* `Ctrl+Enter` / `Meta+Enter` で送信され、`stopPropagation` により App の Run が発火しない
* cancel button で cancel API を呼び、messages request の 499 で `Request canceled.` が 1 回表示される

### 15.4 App

`src/App.test.tsx`

* `EditorPane` / `ErrorPanel` / `ChatPanel` が `editor-column` 内に縦に並ぶ
* ChatPanel の Apply callback で `EditorPane` の code が置き換わる
* Apply だけでは `shouldCompile` が反転しない
* チャット入力欄にフォーカスがない時の `Ctrl+Enter` は既存通り Run
* チャット入力欄にフォーカスがある時の `Ctrl+Enter` は Run しない
* `Ctrl+S` はチャット入力欄にフォーカスがない時だけ既存通り Save

### 15.5 server pure logic

サーバー側 test file の先頭には必ず Node 環境指定を置く。

```ts
// @vitest-environment node
```

`server/aiChat/promptBuilder.test.ts`

* system 指示に JSON 形式、proposedCode 条件、code fence 禁止が含まれる
* 履歴は直近 20 件になる
* 現在の WGSL コード全文と最新ユーザーメッセージが含まれる

`server/aiChat/parseCodexOutput.test.ts`

* 素の JSON を parse できる
* 応答全体を包む ```json fence を除去できる
* `message` 欠落、`proposedCode` 型不正、`proposedCode` 空文字、`notes` 型不正は invalid

`server/aiChat/requestRegistry.test.ts`

* register / unregister で Map が更新される
* 同一 requestId の重複 register は false
* cancel は SIGTERM を送り、猶予後に SIGKILL を送る
* cancel 後の二重 cancel で kill timer が増えない
* 完了後 cancel は成功扱い
* 古い child の unregister が新しい entry を削除しない

### 15.6 codexRunner / handler

`server/aiChat/codexRunner.test.ts`

* `spawn` が `codex` と args 配列で呼ばれる
* prompt が stdin に write される
* 一時ファイルは `os.tmpdir()` 配下に作られ、成功 / 失敗 / timeout / cancel で削除される
* stdout / stderr を JSON として parse しない
* exit code 0 で output file の JSON を返す
* `ENOENT` は `CODEX_NOT_FOUND`
* non-zero exit は `CODEX_FAILED`
* timeout で SIGTERM、猶予後 SIGKILL、408 `TIMEOUT`
* cancel state で close した場合は 499 `CANCELED`

Codex 子プロセスは `child_process.spawn` を mock してテストする。実 `codex` 呼び出しは unit test に含めない。

`server/aiChat/handler.test.ts`

* `/messages` の正常系で requestId と assistant message を返す
* invalid JSON / invalid schema は 400
* `/cancel` は registry.cancel を呼ぶ
* 対象 requestId がなくても cancel は `{ canceled: true }`
* 未知パスは 404

### 15.7 統合確認

自動確認:

* `npm run test`
* `npm run typecheck`
* `npm run build`
* `npm run lint`

手動確認:

* `npm run dev` だけで `/api/ai-chat/messages` が利用できる
* 初期表示で `EditorPane` / `ErrorPanel` / `AI Chat` が縦に並ぶ
* 「このシェーダーを青っぽくして」と送信すると現在の WGSL コード全文が送られる
* AI 応答が返るまで `Codex is thinking...` が表示される
* AI 提案コードを Apply するとエディター内容が置き換わる
* Apply だけでは Preview が更新されない
* Apply 後に Run を押すと既存仕様どおりコンパイルされる
* Codex CLI 未インストール時に `Codex CLI is not installed or not found in PATH.` が表示される
* timeout 時に `Codex request timed out.` が表示される
* 送信中にキャンセルすると `Request canceled.` が 1 回だけ表示される

---

## 16. 実装フェーズ

### Phase 1: 共有型・サーバー純粋ロジック

対象:

* `src/aiChat/types.ts`
* `server/aiChat/promptBuilder.ts`
* `server/aiChat/parseCodexOutput.ts`
* `server/aiChat/requestRegistry.ts`
* `server/aiChat/errors.ts`
* 各 unit test

完了条件:

* API 契約の型が 1 箇所に定義される
* prompt が仕様 §10.2 の情報を全て含む
* Codex 出力 parse と requestRegistry の race 対策が unit test で確認できる
* Node 環境 test は `// @vitest-environment node` を持つ

### Phase 2: Codex runner と HTTP handler

対象:

* `server/aiChat/codexRunner.ts`
* `server/aiChat/handler.ts`
* `server/aiChat/readJsonBody.ts`
* `server/aiChat/codexRunner.test.ts`
* `server/aiChat/handler.test.ts`

完了条件:

* `codex exec` が決定済み args 配列で spawn される
* stdin prompt、一時ファイル、timeout、cancel、cleanup が test で確認できる
* handler が `/messages`、`/cancel`、404、400、500 系 error response を返せる
* 実 Codex CLI を unit test で起動しない

### Phase 3: Vite plugin 統合

対象:

* `server/aiChat/vitePlugin.ts`
* `vite.config.ts`
* `tsconfig.app.json`
* `tsconfig.node.json`

完了条件:

* `npm run dev` の Vite dev server で `/api/ai-chat/*` middleware が登録される
* CORS や別ポートなしで同一 origin fetch できる
* `npm run typecheck` で app 側と node 側の型が混ざって壊れない

### Phase 4: フロントエンド client と state helper

対象:

* `src/aiChat/client.ts`
* `src/aiChat/state.ts`
* `src/aiChat/client.test.ts`
* `src/aiChat/state.test.ts`

完了条件:

* fetch payload が仕様 §9.1 と一致する
* 履歴が直近 20 件に丸められる
* HTTP client timeout 130000 ms が実装される
* fetch mock による成功 / error / timeout / cancel test が通る

### Phase 5: ChatPanel UI

対象:

* `src/components/ChatPanel.tsx`
* `src/components/ChatPanel.test.tsx`
* `src/App.css`

完了条件:

* 開閉、messages、入力欄、送信、キャンセル、送信中表示が実装される
* 多重送信防止が component test で確認できる
* proposedCode がある assistant message だけ Apply button を表示する
* Apply で `onApplyCode` が呼ばれ、Applied 状態が表示される

### Phase 6: App 統合とショートカット調整

対象:

* `src/App.tsx`
* `src/App.test.tsx`

完了条件:

* `editor-column` 内で `EditorPane` / `ErrorPanel` / `ChatPanel` が縦に並ぶ
* `ChatPanel` に現在の `code` と `setCode` が渡る
* チャット入力欄フォーカス中の `Ctrl+Enter` / `Meta+Enter` が Run を発火しない
* チャット入力欄外の `Ctrl+Enter` / `Meta+Enter` は既存通り Run
* Apply だけでは Run / Preview / ErrorPanel が変化しない

### Phase 7: 全体確認と仕上げ

確認:

* `npm run test`
* `npm run typecheck`
* `npm run build`
* `npm run lint`
* `npm run dev` で手動確認

完了条件:

* spec §16 の MVP 完了条件を満たす
* 既存の Run / Reset / Save / Preview / ErrorPanel / Flipbook が退行しない
* Codex CLI 未インストール、timeout、cancel、不正 JSON のエラー表示を確認できる

---

## 17. リスクと未決事項

### 17.1 Codex CLI の実行時間と UI 待機

Codex CLI の応答時間は環境に依存する。初期リリースでは streaming を実装しないため、最大 120000 ms はまとまった応答を待つ設計になる。UI は `isSending`、`Codex is thinking...`、Cancel button により操作可能な状態を維持する。

### 17.2 Codex CLI の出力揺れ

JSON だけを返すよう prompt で強く指示しても、Codex が Markdown code fence や説明文を付ける可能性がある。外側の code fence だけは除去するが、JSON の外に説明文が混ざる場合は `INVALID_CODEX_RESPONSE` とする。初期リリースでは自動修復 parse は行わない。

### 17.3 read-only sandbox の範囲

AIチャット機能では Codex CLI にファイル編集をさせない。`--sandbox read-only` を必ず指定し、prompt にもファイル編集とコマンド実行を行わないよう指示する。提案コードの反映は React state の Apply のみで行う。

### 17.4 Vite dev server 限定

AIチャット API は Vite dev server middleware であり、preview / production build では提供しない。これは仕様 §11.1 のローカル開発専用と整合する。将来 production 相当で使う場合は、認証、bind address、CORS、プロセス分離を別計画で決める。

### 17.5 requestId race

完了、cancel、timeout は近接して発生しうる。requestRegistry は child identity を見て unregister し、完了後 cancel を成功扱いにすることで、古い child の close が新しい request を消す事故を防ぐ。

### 17.6 チャット履歴の肥大化

UI 上の messages はセッション中保持するが、サーバーへ送る履歴は直近 20 件だけにする。ブラウザリロードで消える仕様のため、永続化や履歴圧縮は行わない。

### 17.7 実装をブロックする未決事項

実装をブロックする未決事項は残さない。サーバー方式、ファイル配置、Codex 呼び出し形、timeout / cancel、requestRegistry、prompt 形式、フロント state 配置、ショートカット競合回避、テスト環境は本計画で固定済みとする。
