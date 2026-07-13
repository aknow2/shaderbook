# Shaderbook AIチャット CLI 選択機能 追加仕様書

## 1. 概要

AIチャット CLI 選択機能は、既存の AIチャット機能で固定されている **Codex CLI のみ**という制約を拡張し、ユーザーが AI エージェント、モデル、性能/推論レベルを選んで送信できるようにする追加仕様である。

既存の AIチャット機能は、現在の WGSL コード全文とユーザーメッセージをサーバーへ送り、サーバーが `codex exec` を実行して JSON 応答を返す。本追加仕様では、この実行先を `codex` だけに固定せず、`codex` と `claude` のいずれかを選択できるようにする。

後方互換のため、既定エージェントは **Codex CLI** とする。既存 request や古いチャット履歴に `agent`、`model`、`performance` が含まれない場合も、Codex CLI の既定設定として扱う。

---

## 2. 目的

* AIチャットで Codex CLI と Claude CLI を選べるようにする
* エージェントごとに利用可能なモデル候補を選べるようにする
* エージェントごとに性能/推論レベルを選べるようにする
* 選択値を送信時点で固定し、送信後の UI 変更が実行中リクエストへ影響しないようにする
* サーバー側で未対応の agent / model / performance を拒否し、不正な CLI 引数が組み立てられないようにする
* Codex CLI と Claude CLI の実行差分を runner 境界で吸収し、cancel / timeout / error 表示をエージェント非依存で扱えるようにする
* 既存の AI 応答 JSON 契約 `message` / `proposedCode` / `notes` を維持する

---

## 3. 想定ユーザー

* WGSL の修正や説明を、Codex CLI または Claude CLI へ依頼したい開発者
* タスク内容に応じて、軽量な応答と深い推論を切り替えたい開発者
* モデル差分を比較しながら shader を試作したいユーザー
* ローカル開発環境で Codex CLI または Claude CLI を利用できるユーザー

---

## 4. 対象範囲

### 追加リリースで実装する範囲

* AIチャットパネルでのエージェント選択
* 利用可能なエージェントとして `codex` と `claude` を扱う
* 既定エージェントを `codex` にする
* エージェントごとのモデル選択
* 性能/推論レベル選択
* 選択中エージェントに応じたモデル候補の切り替え
* 性能/推論レベルは全エージェントで同じ表示候補を使い、CLI 引数変換だけをエージェントごとに切り替える
* 送信リクエストへの `agent`、`model`、`performance` 追加
* 送信時点の `agent`、`model`、`performance` を固定してサーバーへ送る
* サーバー側 request schema validation で未対応 agent / model / performance を拒否する
* Codex CLI runner と Claude CLI runner の境界定義
* Codex CLI / Claude CLI の未インストールを区別したエラー表示
* cancel / timeout / error 表示をエージェント非依存で扱う
* 古い request や履歴に選択値がない場合の後方互換

### 追加リリースでは実装しない範囲

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
* AI 提案コードの差分ビュー
* AI 提案コードの自動コンパイル
* 本番環境へのサーバー公開

---

## 5. 用語

| 用語 | 意味 |
| --- | --- |
| エージェント | AIチャットの実行先 CLI。`codex` または `claude` |
| Codex CLI | ローカルにインストールされた `codex` コマンド |
| Claude CLI | ローカルにインストールされた `claude` コマンド |
| モデル | エージェントへ渡すモデル選択値。UI では表示名、API では安定した内部 ID を使う |
| 性能/推論レベル | 速度、コスト、推論深度などの実行傾向を表す選択値。API では安定した内部 ID を使う |
| CLI 引数変換 | `agent`、`model`、`performance` の内部 ID を runner が CLI argv 配列へ変換する処理 |
| Runner | サーバー側で CLI 子プロセスを起動し、出力を共通応答へ変換する境界 |

---

## 6. エージェント選択仕様

## 6.1 利用可能なエージェント

初期候補は以下に固定する。

| 内部 ID | 表示名 | 実行コマンド | 既定 |
| --- | --- | --- | --- |
| `codex` | `Codex CLI` | `codex` | yes |
| `claude` | `Claude CLI` | `claude` | no |

`agent` は API 契約上の安定した内部 ID とする。UI 表示名や CLI コマンド名が将来変わる場合でも、既存履歴と request の互換性を守るため内部 ID は変更しない。

### 既定値

| 項目 | 既定値 |
| --- | --- |
| agent | `codex` |
| codex model | `codex-default` |
| codex performance | `balanced` |
| claude model | `claude-default` |
| claude performance | `balanced` |

既存 request に `agent`、`model`、`performance` が存在しない場合、サーバーは `agent: "codex"`、`model: "codex-default"`、`performance: "balanced"` として扱う。

---

## 6.2 モデル候補

モデル候補はエージェントごとに定義する。内部 ID は UI、API、テスト、履歴互換の安定契約とする。CLI へ渡す実際のモデル名は runner 側の変換テーブルで管理し、内部 ID とは分離する。

### Codex CLI モデル

| 内部 ID | 表示名 | 説明 | 既定 |
| --- | --- | --- | --- |
| `codex-default` | `Default` | Codex CLI の既定モデルを使う | yes |
| `codex-fast` | `Fast` | 速度を優先する Codex 用候補 | no |
| `codex-deep` | `Deep` | 複雑な修正や説明を優先する Codex 用候補 | no |

### Claude CLI モデル

| 内部 ID | 表示名 | 説明 | 既定 |
| --- | --- | --- | --- |
| `claude-default` | `Default` | Claude CLI の既定モデルを使う | yes |
| `claude-fast` | `Fast` | 速度を優先する Claude 用候補 | no |
| `claude-deep` | `Deep` | 複雑な修正や説明を優先する Claude 用候補 | no |

### モデル選択の扱い

* ユーザーは現在選択中のエージェントに属するモデルだけを選べる
* `codex` 選択中に `claude-*` の model は送信できない
* `claude` 選択中に `codex-*` の model は送信できない
* UI が不正な組み合わせを送らない場合でも、サーバーは必ず組み合わせを検証する
* モデル候補を後から差し替える場合も、既存内部 ID の意味を破壊しない

---

## 6.3 性能/推論レベル候補

性能/推論レベルは、ユーザーに見せる抽象名として定義する。CLI 固有の `reasoning`、`thinking`、`effort` などの実引数名は UI と API に露出しない。

| 内部 ID | 表示名 | 説明 | 既定 |
| --- | --- | --- | --- |
| `fast` | `Fast` | 応答速度を優先する | no |
| `balanced` | `Balanced` | 速度と品質のバランスを取る | yes |
| `deep` | `Deep` | 推論深度や品質を優先する | no |

### 性能/推論レベルの扱い

* `performance` は `fast`、`balanced`、`deep` のいずれかにする
* 各エージェントは 3 つの performance をすべて受け付ける
* ただし CLI へ渡す実引数はエージェントごとに異なってよい
* CLI が特定の性能/推論レベルを直接サポートしない場合でも、runner は変換テーブル上で明示的な argv fragment に変換する
* 暗黙の「何もしない」は `balanced` の既定動作としてのみ許可する
* `fast` と `deep` は、それぞれ runner の変換テーブルに明示的な CLI argv fragment を持たなければならない

---

## 6.4 CLI 引数変換境界

サーバーは validation 済みの `agent`、`model`、`performance` だけを runner に渡す。runner は以下の境界で内部 ID を CLI argv 配列へ変換する。

```text
------------------------------+
| validated request            |
| agent/model/performance      |
+---------------+--------------+
                |
                v
+---------------+--------------+
| runner adapter                |
| internal ID -> argv fragment |
+---------------+--------------+
                |
                v
+---------------+--------------+
| child_process.spawn(command, args) |
+------------------------------+
```

### 変換要件

| 項目 | 要件 |
| --- | --- |
| 変換単位 | `agent` ごとに model と performance の変換テーブルを持つ |
| shell | 既存仕様どおり shell 経由では実行しない |
| argv | コマンドライン文字列連結ではなく、配列として組み立てる |
| ユーザー入力 | `message`、`code`、`history` を CLI 引数へ連結しない |
| 未対応値 | 変換前の schema validation で 400 `INVALID_REQUEST` として拒否する |
| 変換不能 | validation 済み値に変換テーブルがない場合は server 実装不備として 500 `INTERNAL_ERROR` とする |

### 初期変換契約

| agent | model ID | CLI argv fragment |
| --- | --- | --- |
| `codex` | `codex-default` | 追加の model 引数なし |
| `codex` | `codex-fast` | Codex runner の model mapping で定義した `--model <value>` |
| `codex` | `codex-deep` | Codex runner の model mapping で定義した `--model <value>` |
| `claude` | `claude-default` | 追加の model 引数なし |
| `claude` | `claude-fast` | Claude runner の model mapping で定義した `--model <value>` |
| `claude` | `claude-deep` | Claude runner の model mapping で定義した `--model <value>` |

| agent | performance ID | CLI argv fragment |
| --- | --- | --- |
| `codex` | `fast` | Codex runner の performance mapping で定義した推論レベル引数 |
| `codex` | `balanced` | 追加の performance 引数なし |
| `codex` | `deep` | Codex runner の performance mapping で定義した推論レベル引数 |
| `claude` | `fast` | Claude runner の performance mapping で定義した推論レベル引数 |
| `claude` | `balanced` | 追加の performance 引数なし |
| `claude` | `deep` | Claude runner の performance mapping で定義した推論レベル引数 |

具体的な CLI 側のモデル名や推論レベル引数は、後続の plan.md で runner ごとの mapping として固定する。本仕様では、UI と API が依存する安定 ID と、runner が CLI 引数へ変換する境界を契約とする。

---

## 7. 画面構成

## 7.1 チャットパネルの選択 UI

AIチャットパネルには、既存の入力欄と送信ボタンに加えて以下を表示する。

* エージェント選択
* モデル選択
* 性能/推論レベル選択

```text
+--------------------------------------------------------------------------------+
| AI Chat                                                        [Hide]           |
| Agent [Codex CLI v]  Model [Default v]  Performance [Balanced v]               |
| Message List                                                                    |
| Input                                                        [Send] [Cancel]    |
+--------------------------------------------------------------------------------+
```

### 表示仕様

| UI | 仕様 |
| --- | --- |
| Agent | `Codex CLI` / `Claude CLI` から選択する |
| Model | 選択中 Agent に対応する model 候補だけを表示する |
| Performance | `Fast` / `Balanced` / `Deep` から選択する |

### 初期状態

| UI | 初期値 |
| --- | --- |
| Agent | `Codex CLI` |
| Model | `Default` |
| Performance | `Balanced` |

---

## 7.2 選択変更時の扱い

* エージェントごとに前回選択した model を保持する
* エージェントを変更した場合、変更先エージェントで前回選択した model があればその値へ切り替える
* エージェントを初めて選択する場合、モデルはそのエージェントの既定 model へ切り替える
* エージェントを変更しても performance は同じ内部 ID を維持する
* 変更後のエージェントが現在の performance を受け付けない状態は発生させない
* 送信中も選択 UI の変更は許可してよい
* 送信中に選択 UI を変更しても、実行中リクエストには送信時点の `agent`、`model`、`performance` が使われる

### 採用理由

送信後に UI を固定すると、ユーザーが次の依頼の準備をしにくい。一方で実行中リクエストの再現性を守るため、送信 payload は送信ボタンを押した時点の選択値で固定する。

---

## 7.3 送信中インジケータ

送信中インジケータは選択中エージェントに応じて表示する。

| agent | 表示 |
| --- | --- |
| `codex` | `Codex is thinking...` |
| `claude` | `Claude is thinking...` |

表示は送信時点の `agent` を使う。送信中に UI の Agent を変更しても、進行中リクエストの表示は変えない。

---

## 8. チャットの振る舞い

## 8.1 送信処理

ユーザーが送信すると、フロントエンドは既存の送信 payload に以下を追加してサーバーへ送る。

* `agent`
* `model`
* `performance`

### 処理フロー

1. 入力欄の値を検証する
2. 送信中でないことを確認する
3. 現在の `code` state から WGSL コード全文を取得する
4. 現在のチャット履歴を取得する
5. 現在選択中の `agent`、`model`、`performance` を取得する
6. 送信時点の選択値をリクエスト用に固定する
7. ユーザーメッセージをメッセージ一覧へ追加する
8. `isSending` を `true` にする
9. `POST /api/ai-chat/messages` を呼び出す
10. 成功時、AIメッセージをメッセージ一覧へ追加する
11. 失敗時、Error メッセージをメッセージ一覧へ追加する
12. `isSending` を `false` にする

---

## 8.2 AI 応答の形式

AI 応答の JSON 契約は既存仕様と同じとする。エージェントが Codex CLI でも Claude CLI でも、サーバーは以下の形式だけをフロントエンドへ返す。

```json
{
  "message": "回答本文",
  "proposedCode": "修正後の WGSL コード全文。コード修正がない場合は null",
  "notes": ["補足事項"]
}
```

### 維持する契約

| フィールド | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `message` | string | yes | ユーザーへ表示する回答本文 |
| `proposedCode` | string \| null | yes | AI が修正を提案する場合の WGSL コード全文 |
| `notes` | string[] | yes | 補足事項。ない場合は空配列 |

Claude CLI の出力も、この契約に合わない場合は不正な AI 応答として扱う。`proposedCode` は差分、抜粋、説明文、Markdown code fence を含めない。

---

## 8.3 会話履歴

既存の `ChatHistoryItem` は `role`、`content`、`proposedCode` を保持する。追加リリースでは、履歴 item に `agent`、`model`、`performance` を必須追加しない。

### 互換性

| ケース | 扱い |
| --- | --- |
| 古い履歴に `agent` がない | 履歴本文としてそのまま扱う |
| 古い履歴に `model` がない | 履歴本文としてそのまま扱う |
| 古い履歴に `performance` がない | 履歴本文としてそのまま扱う |
| 既存 request に `agent` がない | `codex` として扱う |
| `agent` も `model` もない古い request | `agent: "codex"`、`model: "codex-default"` として扱う |
| `agent` があり `model` がない request | その agent の既定 model として扱う |
| 既存 request に `performance` がない | `balanced` として扱う |

履歴 item ごとの過去エージェント情報は MVP では利用しない。最新リクエストの `agent`、`model`、`performance` だけが実行先を決める。

---

## 8.4 多重送信防止

既存仕様どおり、送信中は新しいメッセージを送信できない。これはエージェントに依存しない。

| 状態 | 動作 |
| --- | --- |
| `isSending = false` | 現在選択中の agent / model / performance で送信できる |
| `isSending = true` | 送信ボタンを無効化し、ショートカット送信も無視する |

送信中に Agent を切り替えても、2 件目の CLI 実行は開始しない。

---

## 8.5 キャンセル

キャンセルはエージェント非依存の `requestId` を対象に行う。

### 仕様

* フロントエンドは既存どおり `POST /api/ai-chat/cancel` に `requestId` を送る
* サーバーは `requestId` に紐づく子プロセスが Codex CLI でも Claude CLI でも終了する
* キャンセル API の request / response schema は変更しない
* 進行中の `POST /api/ai-chat/messages` が 499 `CANCELED` で失敗した時に、Error メッセージとして `Request canceled.` を 1 回だけ表示する

---

## 8.6 エラー表示

エラー表示はエージェント非依存でチャット内に表示する。ただし CLI 未インストールは Codex CLI と Claude CLI を区別する。

| エラー | 表示例 |
| --- | --- |
| サーバー未起動 | `AI chat server is not running.` |
| Codex CLI 未インストール | `Codex CLI is not installed or not found in PATH.` |
| Claude CLI 未インストール | `Claude CLI is not installed or not found in PATH.` |
| タイムアウト | `AI chat request timed out.` |
| キャンセル | `Request canceled.` |
| 不正な AI 応答 | `AI returned an invalid response.` |
| 未対応 agent / model / performance | サーバーが返す validation message を表示する |
| サーバー内部エラー | `AI chat request failed.` |

既存の `Codex request timed out.` と `Codex returned an invalid response.` は、追加リリースではエージェント非依存の文言へ置き換える。

---

## 9. サーバー API 仕様

## 9.1 POST /api/ai-chat/messages

AIチャットメッセージを送信し、選択された CLI エージェントの応答を取得する。

### リクエスト

```json
{
  "requestId": "client-generated-request-id",
  "message": "このシェーダーを青っぽくして",
  "code": "現在の WGSL コード全文",
  "history": [
    {
      "role": "user",
      "content": "前回のユーザーメッセージ"
    },
    {
      "role": "assistant",
      "content": "前回の AI 応答本文",
      "proposedCode": null
    }
  ],
  "agent": "codex",
  "model": "codex-default",
  "performance": "balanced"
}
```

### リクエストスキーマ

| フィールド | 型 | 必須 | 制約 |
| --- | --- | --- | --- |
| `requestId` | string | yes | クライアントが生成する一意 ID。最大 128 文字 |
| `message` | string | yes | 1 文字以上 4000 文字以下 |
| `code` | string | yes | 1 文字以上 200000 文字以下 |
| `history` | ChatHistoryItem[] | yes | 最大 20 件 |
| `agent` | `"codex"` \| `"claude"` | no | 省略時は `"codex"` |
| `model` | string | no | 省略時は agent の既定 model |
| `performance` | `"fast"` \| `"balanced"` \| `"deep"` | no | 省略時は `"balanced"` |

### schema validation

サーバーは以下を検証する。

| 項目 | 条件 |
| --- | --- |
| `agent` | 省略、`codex`、`claude` のいずれか |
| `model` | 省略、または `agent` に属する model ID |
| `performance` | 省略、`fast`、`balanced`、`deep` のいずれか |
| `agent: codex` + `model` | `codex-default`、`codex-fast`、`codex-deep` のいずれか |
| `agent: claude` + `model` | `claude-default`、`claude-fast`、`claude-deep` のいずれか |

未対応 agent / model / performance は 400 `INVALID_REQUEST` として拒否する。サーバーは未検証の値を runner へ渡してはならない。

### レスポンス

```json
{
  "requestId": "client-generated-request-id",
  "message": {
    "role": "assistant",
    "content": "青寄りの配色に変更した WGSL コードを提案します。",
    "proposedCode": "修正後の WGSL コード全文",
    "notes": []
  }
}
```

レスポンススキーマは既存仕様から変更しない。

---

## 9.2 POST /api/ai-chat/cancel

実行中の CLI 子プロセスをキャンセルする。

### リクエスト

```json
{
  "requestId": "client-generated-request-id"
}
```

### レスポンス

```json
{
  "requestId": "client-generated-request-id",
  "canceled": true
}
```

### 仕様

* 対象 `requestId` の子プロセスが存在する場合は終了する
* 対象 `requestId` が Codex CLI か Claude CLI かに関係なく同じ cancel API で扱う
* 対象 `requestId` が存在しない場合も `canceled: true` を返す
* キャンセル API 自体の失敗時のみ 500 系エラーを返す

---

## 9.3 エラーレスポンス

API は失敗時に既存形式の JSON を返す。

```json
{
  "error": {
    "code": "CLAUDE_NOT_FOUND",
    "message": "Claude CLI is not installed or not found in PATH."
  }
}
```

### エラーコード

| HTTP status | code | 内容 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | リクエスト JSON または agent / model / performance を含むフィールドが不正 |
| 404 | `NOT_FOUND` | API パスが存在しない |
| 408 | `TIMEOUT` | 選択された CLI 実行がタイムアウトした |
| 499 | `CANCELED` | リクエストがキャンセルされた |
| 500 | `CODEX_NOT_FOUND` | `codex` コマンドが見つからない |
| 500 | `CLAUDE_NOT_FOUND` | `claude` コマンドが見つからない |
| 500 | `AI_AGENT_FAILED` | 選択された CLI が失敗終了した |
| 500 | `INVALID_AI_RESPONSE` | 選択された CLI の出力が期待する JSON ではない |
| 500 | `INTERNAL_ERROR` | その他のサーバー内部エラー |

### 既存エラーコードとの互換

既存の `CODEX_FAILED` と `INVALID_CODEX_RESPONSE` は、Codex CLI 専用の旧コードとして扱える。追加リリース後の新規実装では、エージェント非依存の `AI_AGENT_FAILED` と `INVALID_AI_RESPONSE` を優先して返す。

フロントエンドは旧コードも引き続き表示できなければならない。

| 旧 code | 追加リリースでの表示 |
| --- | --- |
| `CODEX_FAILED` | `AI chat request failed.` |
| `INVALID_CODEX_RESPONSE` | `AI returned an invalid response.` |

---

## 9.4 タイムアウト

タイムアウト値は既存仕様を維持する。

| 項目 | 値 |
| --- | --- |
| CLI timeout | `300000` ms |
| HTTP client timeout | `310000` ms |

### 仕様

* サーバーは `300000` ms を超えた CLI 子プロセスを終了する
* 対象 CLI が Codex CLI でも Claude CLI でも同じ timeout を使う
* フロントエンドは `310000` ms を超えた HTTP リクエストを失敗扱いにする
* フロントエンド側のタイムアウトはサーバー側より長くし、サーバーからの `TIMEOUT` エラーを受け取れるようにする

---

## 10. CLI 実行仕様

## 10.1 Runner 境界

サーバーは agent ごとに runner を分ける。共通の `runAiChatAgent` 境界で request を受け、`agent` に応じて Codex runner または Claude runner へ dispatch する。

```text
POST /api/ai-chat/messages
        |
        v
schema validation
        |
        v
runAiChatAgent
   |             |
   v             v
Codex runner   Claude runner
   |             |
   v             v
codex exec     claude ...
```

### 要件

| 項目 | 要件 |
| --- | --- |
| 共通化するもの | request validation、request registry、cancel、timeout、error response、AI 応答 JSON parse |
| 分けるもの | CLI command、argv 組み立て、model mapping、performance mapping、出力取得方法 |
| runner result | `message`、`proposedCode`、`notes` の共通構造で返す |
| child process | registry へ `requestId` 単位で登録し、agent 種別に依存せず cancel できる |

### 採用理由

Codex CLI と Claude CLI は起動引数や出力取得方法が異なる可能性がある。一方で、AIチャットとしての request validation、cancel、timeout、エラー表示、JSON 応答契約は共通である。そのため、外側は共通化し、CLI 固有の差分だけを runner adapter に閉じ込める。

---

## 10.2 Codex CLI runner

Codex runner は既存の `codex exec` 非対話実行を継承する。

### 維持する仕様

* shell 経由では実行しない
* prompt は stdin または一時ファイル経由で渡す
* Codex の最終メッセージだけを AI 応答として扱う
* stdout / stderr 全体を AI 応答として parse しない
* read-only サンドボックスで実行する
* 一時ファイルは成功、失敗、タイムアウト、キャンセルのいずれでも削除する

### 追加する仕様

* `agent: "codex"` の request だけを扱う
* `model` と `performance` を Codex runner の変換テーブルで argv へ反映する
* `codex` コマンドが見つからない場合は `CODEX_NOT_FOUND` を返す
* 終了コードが `0` 以外の場合は `AI_AGENT_FAILED` を返す
* 出力 JSON が不正な場合は `INVALID_AI_RESPONSE` を返す

---

## 10.3 Claude CLI runner

Claude runner は `claude` コマンドを非対話モードで実行し、最終応答を既存の AI 応答 JSON 契約へ変換する。

### 仕様

* shell 経由では実行しない
* prompt は stdin または一時ファイル経由で渡す
* ユーザー入力を CLI 引数へ連結しない
* `agent: "claude"` の request だけを扱う
* `model` と `performance` を Claude runner の変換テーブルで argv へ反映する
* `claude` コマンドが見つからない場合は `CLAUDE_NOT_FOUND` を返す
* 終了コードが `0` 以外の場合は `AI_AGENT_FAILED` を返す
* 出力 JSON が不正な場合は `INVALID_AI_RESPONSE` を返す
* 一時ファイルを使う場合は成功、失敗、タイムアウト、キャンセルのいずれでも削除する

Claude CLI の具体的な非対話引数と出力取得方法は、後続の plan.md で現在の CLI 実装に合わせて固定する。ただし runner は最終的に `message`、`proposedCode`、`notes` の共通構造を返さなければならない。

---

## 10.4 プロンプト

Codex CLI と Claude CLI のどちらにも、既存の AIチャット system 指示と同等の内容を渡す。

### system 指示の要件

* 回答は日本語にする
* 現在の WGSL コードを前提に、ユーザーの質問へ具体的に答える
* WGSL コードを修正する場合は修正後のコード全文を `proposedCode` に入れる
* コード修正が不要な場合は `proposedCode` を `null` にする
* `proposedCode` には Markdown code fence を含めない
* ユーザーの指示が WGSL コードと無関係な場合は、できる範囲で説明し、コード修正は行わない
* ファイル編集、コマンド実行、リポジトリ変更は行わない
* 最終回答は `message`、`proposedCode`、`notes` を持つ JSON だけにする

エージェントごとに prompt builder を分けてもよいが、出力 JSON 契約は共通にする。

---

## 11. セキュリティ / 安全性

## 11.1 ローカル開発専用

既存仕様どおり、AIチャットサーバーはローカル開発専用とする。Codex CLI と Claude CLI の選択追加によって、外部公開、認証、CORS の方針は変更しない。

---

## 11.2 任意コマンド実行を避ける設計

| リスク | 対策 |
| --- | --- |
| ユーザー入力が shell コマンドとして解釈される | runner は `spawn` を shell なしで使い、prompt を stdin または一時ファイルで渡す |
| ユーザーが CLI 引数を注入する | `agent`、`model`、`performance` は allowlist で検証し、`message` / `code` / `history` は CLI 引数にしない |
| 未対応 agent が実行される | schema validation で 400 `INVALID_REQUEST` として拒否する |
| 未対応 model / performance が CLI 引数になる | agent ごとの allowlist と変換テーブルに存在する値だけを実行する |
| AI がファイル編集を試みる | prompt で禁止し、提案コードだけをフロントエンドで扱う |
| AI 提案コードが自動適用される | 既存仕様どおり `Apply` ボタンを押した時だけ反映する |

---

## 12. 状態管理

## 12.1 フロントエンド状態

既存の AIチャット state に以下を追加する。

| 状態名 | 型 | 内容 |
| --- | --- | --- |
| `selectedAgent` | `"codex"` \| `"claude"` | 現在 UI で選択中のエージェント |
| `selectedModelByAgent` | agent ごとの model ID | エージェントごとの前回選択 model。初期値は各 agent の既定 model |
| `selectedPerformance` | `"fast"` \| `"balanced"` \| `"deep"` | 現在選択中の性能/推論レベル |
| `activeRequestAgent` | `"codex"` \| `"claude"` \| null | 実行中リクエストの送信時点 agent |

`activeRequestAgent` は送信中インジケータとエラー表示の文脈に使う。送信完了後は `null` に戻す。

---

## 12.2 永続化

追加リリースでは、エージェント、モデル、性能/推論レベル選択を永続化しない。

| 操作 | 選択値の扱い |
| --- | --- |
| チャットパネルを閉じる | 保持する |
| チャットパネルを開く | 保持された選択値を表示する |
| ブラウザをリロードする | 既定値へ戻る |
| dev server を再起動する | 既定値へ戻る |

---

## 13. アクセシビリティ

* Agent 選択には内容が分かる label を付与する
* Model 選択には内容が分かる label を付与する
* Performance 選択には内容が分かる label を付与する
* 送信中インジケータは送信時点の agent 名を含め、スクリーンリーダーで読み上げられるようにする
* 既存のチャット入力、送信、キャンセル、Apply のアクセシビリティ要件は維持する

---

## 14. パフォーマンス要件

| 項目 | 要件 |
| --- | --- |
| Agent / Model / Performance の選択変更 | 100ms 以内を目標 |
| 送信 payload 作成 | 100ms 以内を目標 |
| CLI 応答 | 300000 ms 以内に成功、失敗、タイムアウトのいずれかにする |

選択 UI の追加によって、既存のメッセージ追加、Apply、キャンセル操作の応答性を悪化させない。

---

## 15. エッジケース

| ケース | 期待動作 |
| --- | --- |
| 初期表示 | Agent は `Codex CLI`、Model は `Default`、Performance は `Balanced` |
| Agent を Claude CLI へ初めて変更 | Model は Claude CLI の `Default` へ切り替わる |
| Claude CLI で Model を `Deep` に変更後、他 Agent へ切り替えて Claude CLI へ戻す | Model は Claude CLI の前回選択値 `Deep` になる |
| Agent を Codex CLI へ戻す | Model は Codex CLI の前回選択値、未選択なら `Default` になる |
| 送信中に Agent を変更 | 実行中リクエストには送信時点の agent が使われる |
| 送信中に Model を変更 | 実行中リクエストには送信時点の model が使われる |
| 送信中に Performance を変更 | 実行中リクエストには送信時点の performance が使われる |
| `agent` がない request | `codex` として扱う |
| `agent` も `model` もない古い request | `agent: "codex"`、`model: "codex-default"` として扱う |
| `agent: claude` で `model` がない request | `claude-default` として扱う |
| `agent: codex` で `model` がない request | `codex-default` として扱う |
| `performance` がない request | `balanced` として扱う |
| `agent: codex` で `model: claude-default` | 400 `INVALID_REQUEST` |
| `agent: claude` で `model: codex-default` | 400 `INVALID_REQUEST` |
| 未対応 agent | 400 `INVALID_REQUEST` |
| 未対応 model | 400 `INVALID_REQUEST` |
| 未対応 performance | 400 `INVALID_REQUEST` |
| Codex CLI が見つからない | `Codex CLI is not installed or not found in PATH.` を表示する |
| Claude CLI が見つからない | `Claude CLI is not installed or not found in PATH.` を表示する |
| Codex CLI が失敗終了した | `AI chat request failed.` を表示する |
| Claude CLI が失敗終了した | `AI chat request failed.` を表示する |
| Codex CLI が JSON 以外を返した | `AI returned an invalid response.` を表示する |
| Claude CLI が JSON 以外を返した | `AI returned an invalid response.` を表示する |
| タイムアウトした | 子プロセスを終了し、`AI chat request timed out.` を表示する |
| キャンセルした | 子プロセスを終了し、`Request canceled.` を 1 回だけ表示する |

---

## 16. MVP 完了条件

以下を満たしたら AIチャット CLI 選択機能の MVP 完了とする。

* AIチャットパネルで Agent / Model / Performance を選択できる
* Agent の初期値が `Codex CLI` である
* Model の初期値が選択中 agent の `Default` である
* Performance の初期値が `Balanced` である
* Agent を切り替えると、その agent に対応する Model 候補だけを選べる
* Performance は `Fast` / `Balanced` / `Deep` から選べる
* Agent を切り替えると、その agent の前回選択 model を表示し、前回選択がない場合はその agent の既定 model を表示する
* 送信 request に `agent`、`model`、`performance` が含まれる
* 送信時点の `agent`、`model`、`performance` が実行中リクエストに固定される
* `agent` も `model` もない古い request は Codex CLI の既定設定として処理できる
* `agent` があり `model` がない request は、その agent の既定 model として処理できる
* サーバーが未対応 agent / model / performance を 400 `INVALID_REQUEST` で拒否する
* `agent: codex` の場合は Codex runner が実行される
* `agent: claude` の場合は Claude runner が実行される
* Codex runner と Claude runner が共通の `message` / `proposedCode` / `notes` 契約を返す
* Codex CLI 未インストールと Claude CLI 未インストールを区別して表示できる
* timeout / cancel / failed / invalid response の表示がエージェント非依存で動く
* 既存の提案コード Apply 挙動が変わらない
* チャット履歴は既存どおりブラウザリロードで消える
* 選択値は追加リリースでは永続化されない

---

## 17. 受け入れテスト観点

### フロントエンド unit / component test

* 初期表示で Agent が `Codex CLI`、Model が `Default`、Performance が `Balanced` である
* Agent 選択に `Codex CLI` と `Claude CLI` が表示される
* Codex CLI 選択中は Codex 用 model 候補だけが表示される
* Claude CLI 選択中は Claude 用 model 候補だけが表示される
* Agent を Claude CLI に初めて変更すると Model が Claude CLI の `Default` へ切り替わる
* Agent を切り替えると、その agent の前回選択 model が復元される
* 前回選択 model がない agent へ切り替えると、その agent の既定 model が表示される
* Agent を切り替えても Performance の内部 ID が維持される
* Performance 選択に `Fast`、`Balanced`、`Deep` が表示される
* 送信 payload に `agent`、`model`、`performance` が含まれる
* 送信中に Agent を変更しても payload は送信時点の agent のままである
* 送信中に Model を変更しても payload は送信時点の model のままである
* 送信中に Performance を変更しても payload は送信時点の performance のままである
* Codex 送信中インジケータに `Codex is thinking...` が表示される
* Claude 送信中インジケータに `Claude is thinking...` が表示される
* `CODEX_NOT_FOUND` を受けた場合に Codex CLI 未インストール文言を表示する
* `CLAUDE_NOT_FOUND` を受けた場合に Claude CLI 未インストール文言を表示する
* `TIMEOUT` を受けた場合に `AI chat request timed out.` を表示する
* `INVALID_AI_RESPONSE` を受けた場合に `AI returned an invalid response.` を表示する
* 旧 `INVALID_CODEX_RESPONSE` を受けた場合も `AI returned an invalid response.` を表示する
* AI 応答に `proposedCode` がある場合だけ `Apply` ボタンが表示される
* `Apply` 押下で既存どおり `setCode(proposedCode)` が呼ばれる

### 共有型 / state helper test

* `agent` の許可値が `codex` / `claude` である
* `performance` の許可値が `fast` / `balanced` / `deep` である
* `codex` の既定 model が `codex-default` である
* `claude` の既定 model が `claude-default` である
* agent ごとの model allowlist が異なる
* `agent: codex` と `model: claude-default` の組み合わせを invalid にできる
* `agent: claude` と `model: codex-default` の組み合わせを invalid にできる
* `agent` 省略時に `codex` として正規化される
* `agent` も `model` も省略した古い request は `codex` + `codex-default` として正規化される
* `agent` があり `model` 省略時は、その agent の既定 model として正規化される
* `performance` 省略時に `balanced` として正規化される

### サーバー handler test

* `/messages` が `agent: codex` を受け付ける
* `/messages` が `agent: claude` を受け付ける
* `agent` 省略 request が Codex の既定設定として runner に渡る
* `agent` も `model` も省略した古い request が `codex` + `codex-default` として runner に渡る
* `agent: codex` で `model` 省略 request が `codex-default` として runner に渡る
* `agent: claude` で `model` 省略 request が `claude-default` として runner に渡る
* `performance` 省略 request が `balanced` として runner に渡る
* 未対応 agent は 400 `INVALID_REQUEST`
* 未対応 model は 400 `INVALID_REQUEST`
* 未対応 performance は 400 `INVALID_REQUEST`
* agent と model の不一致は 400 `INVALID_REQUEST`
* validation 済み request だけが runner に渡る
* `/cancel` は agent に関係なく `requestId` だけで registry.cancel を呼ぶ
* `CLAUDE_NOT_FOUND` が 500 error response として返る
* `AI_AGENT_FAILED` が 500 error response として返る
* `INVALID_AI_RESPONSE` が 500 error response として返る

### Runner test

* `agent: codex` で Codex runner が選択される
* `agent: claude` で Claude runner が選択される
* Codex runner は `codex` command を `shell: false` で spawn する
* Claude runner は `claude` command を `shell: false` で spawn する
* Codex runner は codex model mapping を argv へ反映する
* Claude runner は claude model mapping を argv へ反映する
* Codex runner は codex performance mapping を argv へ反映する
* Claude runner は claude performance mapping を argv へ反映する
* `balanced` は既定動作として追加 performance 引数なしで実行できる
* `fast` と `deep` は明示的な performance argv fragment を持つ
* Codex runner の `ENOENT` は `CODEX_NOT_FOUND`
* Claude runner の `ENOENT` は `CLAUDE_NOT_FOUND`
* Codex runner の non-zero exit は `AI_AGENT_FAILED`
* Claude runner の non-zero exit は `AI_AGENT_FAILED`
* Codex runner の不正 JSON は `INVALID_AI_RESPONSE`
* Claude runner の不正 JSON は `INVALID_AI_RESPONSE`
* timeout 時に agent に関係なく対象 child を終了する
* cancel 時に agent に関係なく対象 child を終了する

### 手動確認

* 初期表示で Codex CLI / Default / Balanced が選ばれている
* Claude CLI を選び、メッセージを送信できる
* Codex CLI を選び、メッセージを送信できる
* Claude CLI 未インストール環境で Claude 用エラーが表示される
* Codex CLI 未インストール環境で Codex 用エラーが表示される
* 送信中に Agent を切り替えても、実行中の応答は送信時点の agent として完了する
* 送信中に Cancel を押すと、Codex / Claude のどちらでも `Request canceled.` が 1 回だけ表示される
* AI が `proposedCode` を返した場合、既存どおり Apply するまでエディターは変わらない
