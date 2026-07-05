# WGSL Shader Playground AIチャット機能 仕様書

## 1. 概要

AIチャット機能は、現在エディターに表示されている WGSL コードを対象に、ユーザーが自然言語で AI エージェントへ修正や説明を依頼できる機能である。

ユーザーはエディターの下にあるチャット欄から、例えば「このシェーダーを青っぽくして」「このエラーの原因を説明して」のように指示を送る。サーバーは現在の WGSL コード全文とユーザーのメッセージを Codex CLI に渡し、AI の応答をフロントエンドへ返す。

初期リリースでは、AI エージェントとして **Codex CLI のみ**を扱う。ブラウザから直接 Codex CLI を実行せず、ローカル開発用サーバーが `codex exec` を子プロセスとして起動する構成とする。

---

## 2. 目的

* WGSL の色調整、構造整理、エラー原因調査をチャットから依頼できるようにする
* 現在のエディター内容を AI に明示的に渡し、コード文脈に沿った回答を得られるようにする
* AI が修正コードを提案した場合、ユーザーが確認してからエディターへ反映できるようにする
* 既存の Editor / ErrorPanel / Preview / StatusBar の構成を崩さずに、エディター列内の補助機能として追加する
* 将来的に他の AI エージェントやストリーミング応答へ拡張できる境界を用意する

---

## 3. 想定ユーザー

* WGSL を学習中で、shader の修正方針やエラー原因を AI に相談したい開発者
* WebGPU / WGSL の細部を確認しながら shader を試作したい開発者
* 既存 shader の色、動き、構造を短い指示で調整したいユーザー
* ローカル開発環境で Codex CLI を利用できるユーザー

---

## 4. 対象範囲

### 初期リリースで実装する範囲

* エディター列下部への AIチャットパネル追加
* チャットパネルの開閉
* メッセージ一覧の表示
* ユーザーメッセージ入力欄
* 送信ボタン
* 送信中インジケータ
* 送信中の多重送信防止
* 送信中リクエストのキャンセル
* 現在の WGSL コード全文とユーザーメッセージをサーバーへ送信する
* サーバーからの AI 応答をチャットメッセージとして表示する
* AI が修正後の WGSL コード全文を返した場合、`Apply` ボタンでエディターへ反映する
* 会話履歴をフロントエンドの React state に保持し、次回送信時にサーバーへ含める
* ローカル開発用サーバーから Codex CLI の `codex exec` 非対話モードを実行する
* サーバー未起動、Codex CLI 未インストール、タイムアウト、キャンセル時のエラー表示

### 初期リリースでは実装しない範囲

* Codex CLI 以外の AI エージェント対応
* OpenAI API など外部 API の直接呼び出し
* ブラウザからの Codex CLI 直接実行
* 会話履歴の永続化
* localStorage へのチャット保存
* クラウド保存
* ユーザーアカウント連携
* 複数チャットスレッド
* ストリーミング応答
* AI 応答の自動エディター反映
* AI 提案コードの差分ビュー
* AI 提案コードの自動コンパイル
* 画像やファイル添付
* 音声入力
* 本番環境へのサーバー公開

### ストリーミング応答の扱い

初期リリースでは **ストリーミング応答を実装しない**。サーバーは Codex CLI の処理完了後に、AI 応答全体を 1 回の JSON レスポンスとして返す。

### 採用理由

* Vite + React のフロントエンドのみで構成されている現状に対し、最小限のサーバー追加で実装できる
* Codex CLI の実行、タイムアウト、キャンセル、エラー処理を単純にできる
* 初期リリースでは回答速度よりも、安全にコード反映できることを優先する

---

## 5. 用語

| 用語 | 意味 |
| --- | --- |
| AIチャット | エディター下部に追加する、ユーザーと AI の会話 UI |
| ユーザーメッセージ | ユーザーが入力して送信する自然言語の指示 |
| AIメッセージ | Codex CLI から返された回答を表示するメッセージ |
| 提案コード | AI が修正案として返す WGSL コード全文 |
| Apply | 提案コードを現在のエディター内容へ反映する操作 |
| チャット履歴 | 現在の画面セッション中に React state で保持するメッセージ列 |
| AIチャットサーバー | フロントエンドから HTTP リクエストを受け、Codex CLI を子プロセスとして実行するローカルサーバー |
| Codex CLI | ローカルにインストールされた `codex` コマンド |

---

## 6. システム構成

現在のプロジェクトは Vite + React 19 + TypeScript のフロントエンドのみであり、サーバーサイドは存在しない。AIチャット機能では、ローカル開発用途の AIチャットサーバーを追加する。

```text
-----------------------------+
| Browser                     |
| Vite + React                |
|                             |
| EditorPane                  |
| ErrorPanel                  |
| AI Chat Panel               |
+--------------+--------------+
               |
               | HTTP JSON
               v
+--------------+--------------+
| Local AI Chat Server        |
| localhost only              |
|                             |
| spawn codex exec            |
+--------------+--------------+
               |
               | child_process
               v
+--------------+--------------+
| Codex CLI                   |
| codex exec                  |
+-----------------------------+
```

### 起動方式

初期リリースでは以下のどちらかで起動できる構成とする。

| 方式 | 内容 |
| --- | --- |
| 別プロセス | `npm run dev` と並行して AIチャットサーバーを起動する |
| Vite 統合 | Vite dev server の middleware として API を提供する |

どちらの方式でも、ブラウザから見える API 仕様は同じにする。

---

## 7. 画面構成

## 7.1 全体レイアウト

AIチャットパネルは、既存のエディター列内で `EditorPane` と `ErrorPanel` の下に配置する。

現在の `src/App.tsx` では、`editor-column` div 内に `EditorPane` と `ErrorPanel` が縦に並んでいる。AIチャットパネルは同じ `editor-column` 内の末尾に追加する。

```text
+--------------------------------------------------------------------------------+
| WGSL Playground                                      Run   Reset   Save          |
+--------------------------------------+-----------------------------------------+
| Editor Column                        | Preview                                 |
|                                      |                                         |
| +----------------------------------+ | +-------------------------------------+ |
| | EditorPane                       | | | WebGPU Canvas                       | |
| | WGSL Code                        | | |                                     | |
| +----------------------------------+ | +-------------------------------------+ |
| | ErrorPanel                       | |                                         |
| +----------------------------------+ |                                         |
| | AI Chat Panel                    | |                                         |
| | Message List                     | |                                         |
| | Input              [Send] [Stop] | |                                         |
| +----------------------------------+ |                                         |
+--------------------------------------+-----------------------------------------+
| Compile: Success     FPS: 60.0     Resolution: 1280 x 720     Backend: WebGPU   |
+--------------------------------------------------------------------------------+
```

### 配置理由

AIチャットは現在のエディター内容を対象にする補助機能である。そのため、Preview 領域や Header ではなく、エディター列の下部に配置する。

---

## 7.2 チャットパネル

### 表示内容

* セクションタイトル

  * `AI Chat`
* 開閉ボタン
* メッセージ一覧
* ユーザーメッセージ入力欄
* 送信ボタン
* キャンセルボタン
* 送信中インジケータ

### 開閉仕様

| 状態 | 表示 |
| --- | --- |
| 開いている | メッセージ一覧、入力欄、送信ボタン、キャンセルボタンを表示する |
| 閉じている | ヘッダー行だけを表示する |

### 初期状態

初期状態は **開いている** とする。

### 閉じている時の扱い

* チャット履歴は保持する
* 送信中の処理は継続する
* 送信中に閉じた場合、サーバーリクエストはキャンセルしない
* 再度開いた時に最新のメッセージ一覧を表示する

---

## 7.3 メッセージ一覧

メッセージ一覧にはユーザーと AI のメッセージを時系列で表示する。

| 種別 | 表示内容 |
| --- | --- |
| User | ユーザーが送信したメッセージ |
| Assistant | AI の回答本文 |
| Error | 送信失敗、タイムアウト、サーバー未起動などのエラー |

### AI が提案コードを含む場合

AIメッセージに提案コードが含まれる場合、メッセージ内に以下を表示する。

* 回答本文
* `shader.wgsl` の提案コードブロック
* `Apply` ボタン

`Apply` ボタンは提案コードが存在する AIメッセージにだけ表示する。

---

## 7.4 入力欄

入力欄は複数行入力できる textarea とする。

### 仕様

* 空文字または空白のみの場合は送信できない
* 入力上限は `4000` 文字とする
* `Enter` は改行とする
* チャット入力欄にフォーカスがある場合、`Ctrl+Enter` または `Meta+Enter` で送信する
* チャット入力欄にフォーカスがある場合、`Ctrl+Enter` または `Meta+Enter` はチャット送信を優先し、既存の Run ショートカットを発火させない
* 上記の競合回避のため、入力欄側の keydown handler で必要に応じて `preventDefault` とイベント伝播停止を行う
* チャット入力欄にフォーカスがない場合、`Ctrl+Enter` または `Meta+Enter` は既存どおり Run として扱う
* 送信成功後、入力欄を空にする
* 送信失敗時も入力欄は空にしない

---

## 7.5 送信ボタンとキャンセルボタン

| 状態 | 送信ボタン | キャンセルボタン |
| --- | --- | --- |
| 未送信 | 有効 | 非表示 |
| 入力が空 | 無効 | 非表示 |
| 送信中 | 無効 | 表示 |
| 送信完了 | 有効 | 非表示 |
| エラー後 | 有効 | 非表示 |

### 送信中インジケータ

送信中はメッセージ一覧の末尾または入力欄付近に以下を表示する。

```text
Codex is thinking...
```

---

## 8. チャットの振る舞い

## 8.1 送信処理

ユーザーが送信すると、フロントエンドは以下をサーバーへ送る。

* ユーザーのメッセージ
* 現在のエディターの WGSL コード全文
* 現在のチャット履歴
* クライアント生成の `requestId`

### 処理フロー

1. 入力欄の値を検証する
2. 送信中でないことを確認する
3. 現在の `code` state から WGSL コード全文を取得する
4. 現在のチャット履歴を取得する
5. ユーザーメッセージをメッセージ一覧へ追加する
6. `isSending` を `true` にする
7. `POST /api/ai-chat/messages` を呼び出す
8. 成功時、AIメッセージをメッセージ一覧へ追加する
9. 失敗時、Error メッセージをメッセージ一覧へ追加する
10. `isSending` を `false` にする

---

## 8.2 AI 応答の形式

サーバーは Codex CLI に対して、以下の JSON 形式で回答するように指示する。

```json
{
  "message": "回答本文",
  "proposedCode": "修正後の WGSL コード全文。コード修正がない場合は null",
  "notes": ["補足事項"]
}
```

### フィールド仕様

| フィールド | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `message` | string | yes | ユーザーへ表示する回答本文 |
| `proposedCode` | string \| null | yes | AI が修正を提案する場合の WGSL コード全文 |
| `notes` | string[] | yes | 補足事項。ない場合は空配列 |

### proposedCode の条件

`proposedCode` は、修正後の WGSL コード全文でなければならない。差分、抜粋、説明文、Markdown code fence は含めない。

---

## 8.3 提案コードの反映

AI が `proposedCode` を返した場合、フロントエンドは自動でエディターを置き換えない。ユーザーが AIメッセージ内の `Apply` ボタンを押した時だけ、現在のエディター内容を `proposedCode` で全文置換する。

### Apply 処理フロー

1. 対象 AIメッセージに `proposedCode` が存在することを確認する
2. `setCode(proposedCode)` を呼び出す
3. EditorPane の内容を提案コード全文へ同期する
4. 対象 AIメッセージに `Applied` 状態を表示する

### Apply 後の扱い

| 項目 | 仕様 |
| --- | --- |
| Run | 自動実行しない。ユーザーが既存の `Run` ボタンを押してコンパイルする |
| ErrorPanel | Apply だけでは変更しない |
| Preview | Apply だけでは更新しない |
| Undo / Redo | EditorPane の実装に従う |
| チャット履歴 | Apply したことをメッセージ状態として保持する |

### 採用理由

AI 応答が意図しないコードを含む可能性があるため、初期リリースではユーザーの明示操作によってのみエディターへ反映する。

---

## 8.4 会話の継続

初期リリースでは、Codex CLI のセッション resume 機能には依存しない。フロントエンドが保持しているチャット履歴を毎回リクエストに含め、サーバーがそれを Codex CLI へのプロンプトに組み込む。

### 採用方式

```text
毎回、現在のチャット履歴 + 現在の WGSL コード全文 + 最新ユーザーメッセージを codex exec に渡す
```

### 採用理由

* サーバー側にセッション状態を保持しなくてよい
* Codex CLI の resume セッション管理に依存しない
* ブラウザリロードで会話が消える仕様と整合する
* 1 リクエストの入力内容が明示的になり、デバッグしやすい

### 履歴上限

チャット履歴は直近 `20` メッセージまでをサーバーへ送信する。20 件を超える場合、古いメッセージから送信対象から除外する。

---

## 8.5 多重送信防止

送信中は新しいメッセージを送信できない。

| 状態 | 動作 |
| --- | --- |
| `isSending = false` | 送信できる |
| `isSending = true` | 送信ボタンを無効化し、ショートカット送信も無視する |

### 採用理由

Codex CLI の子プロセスを同時に複数起動すると、CPU 負荷が高くなり、どの応答を現在のコードへ反映すべきか分かりにくくなる。初期リリースでは 1 画面につき同時実行 1 件に制限する。

---

## 8.6 キャンセル

送信中にキャンセルボタンを押すと、フロントエンドは `POST /api/ai-chat/cancel` を呼び出す。サーバーは対象 `requestId` の Codex CLI 子プロセスを終了する。

### キャンセル成功時

* `isSending` を `false` にする
* キャンセル API のレスポンス自体ではメッセージ一覧に Error メッセージを追加しない
* 進行中の `POST /api/ai-chat/messages` が 499 `CANCELED` で失敗した時に、Error メッセージとして `Request canceled.` を 1 回だけ表示する
* 入力欄の内容は保持する

### キャンセル失敗時

対象リクエストがすでに完了していた場合、キャンセル API は成功扱いでよい。フロントエンドは受信済みの AI 応答またはエラーを優先して表示する。

---

## 8.7 エラー表示

サーバーまたは Codex CLI の失敗は、チャットの Error メッセージとして表示する。既存の `ErrorPanel` は WGSL compile error 用であるため、AIチャットの通信エラーは `ErrorPanel` には表示しない。

| エラー | 表示例 |
| --- | --- |
| サーバー未起動 | `AI chat server is not running.` |
| Codex CLI 未インストール | `Codex CLI is not installed or not found in PATH.` |
| タイムアウト | `Codex request timed out.` |
| キャンセル | `Request canceled.` |
| 不正な JSON 応答 | `Codex returned an invalid response.` |
| サーバー内部エラー | `AI chat request failed.` |

---

## 9. サーバー API 仕様

## 9.1 POST /api/ai-chat/messages

AIチャットメッセージを送信し、Codex CLI の応答を取得する。

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
  ]
}
```

### リクエストスキーマ

| フィールド | 型 | 必須 | 制約 |
| --- | --- | --- | --- |
| `requestId` | string | yes | クライアントが生成する一意 ID。最大 128 文字 |
| `message` | string | yes | 1 文字以上 4000 文字以下 |
| `code` | string | yes | 1 文字以上 200000 文字以下 |
| `history` | ChatHistoryItem[] | yes | 最大 20 件 |

### ChatHistoryItem

| フィールド | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `role` | `"user"` \| `"assistant"` | yes | メッセージの送信者 |
| `content` | string | yes | メッセージ本文 |
| `proposedCode` | string \| null | no | 以前の AI 提案コード |

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

### レスポンススキーマ

| フィールド | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `requestId` | string | yes | リクエストと同じ ID |
| `message.role` | `"assistant"` | yes | 固定値 |
| `message.content` | string | yes | AI 応答本文 |
| `message.proposedCode` | string \| null | yes | 修正後の WGSL コード全文 |
| `message.notes` | string[] | yes | 補足事項 |

---

## 9.2 POST /api/ai-chat/cancel

実行中の Codex CLI 子プロセスをキャンセルする。

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
* 対象 `requestId` が存在しない場合も `canceled: true` を返す
* キャンセル API 自体の失敗時のみ 500 系エラーを返す

---

## 9.3 エラーレスポンス

API は失敗時に以下の形式で JSON を返す。

```json
{
  "error": {
    "code": "CODEX_NOT_FOUND",
    "message": "Codex CLI is not installed or not found in PATH."
  }
}
```

### エラーコード

| HTTP status | code | 内容 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | リクエスト JSON またはフィールドが不正 |
| 404 | `NOT_FOUND` | API パスが存在しない |
| 408 | `TIMEOUT` | Codex CLI 実行がタイムアウトした |
| 499 | `CANCELED` | リクエストがキャンセルされた |
| 500 | `CODEX_NOT_FOUND` | `codex` コマンドが見つからない |
| 500 | `CODEX_FAILED` | Codex CLI が失敗終了した |
| 500 | `INVALID_CODEX_RESPONSE` | Codex CLI の出力が期待する JSON ではない |
| 500 | `INTERNAL_ERROR` | その他のサーバー内部エラー |

---

## 9.4 タイムアウト

Codex CLI 実行のタイムアウトは `120000` ms とする。

| 項目 | 値 |
| --- | --- |
| Codex CLI timeout | `120000` ms |
| HTTP client timeout | `130000` ms |

### 仕様

* サーバーは `120000` ms を超えた Codex CLI 子プロセスを終了する
* フロントエンドは `130000` ms を超えた HTTP リクエストを失敗扱いにする
* フロントエンド側のタイムアウトはサーバー側より長くし、サーバーからの `TIMEOUT` エラーを受け取れるようにする

---

## 10. Codex CLI 実行仕様

## 10.1 実行方式

サーバーは Node.js の `child_process.spawn` を使い、`codex exec` を非対話モードで実行する。Codex の最終メッセージは `--output-last-message` で指定した一時ファイルから取得する。

```text
codex exec --output-last-message <temp-file-path>
```

### 仕様

* shell 経由では実行しない
* ユーザー入力をコマンドライン文字列へ連結しない
* prompt は stdin または一時ファイル経由で渡す
* `--output-last-message` にはリクエストごとに生成した一時ファイルパスを渡す
* Codex の最終メッセージだけを一時ファイルから読み取り、AI 応答として扱う
* stdout と stderr は AI 応答として parse せず、サーバーログまたはエラー詳細として扱う
* 一時ファイルはリクエスト完了後、成功、失敗、タイムアウト、キャンセルのいずれでも削除する
* 終了コードが `0` 以外の場合は `CODEX_FAILED` とする

### 採用理由

shell 経由で実行すると、ユーザー入力がシェル構文として解釈される危険がある。`spawn` にコマンドと引数を配列で渡し、prompt を stdin または一時ファイル経由で渡すことで、任意コマンド実行にならない設計にする。

`codex exec` の stdout には実行ログやメタ情報が含まれる可能性があるため、stdout 全体を JSON として扱わない。`--output-last-message` の出力ファイルを使い、最終回答だけを検証対象にする。

---

## 10.2 Codex へ渡すプロンプト

サーバーは Codex CLI に以下の情報を渡す。

* AIチャット機能用の system 指示
* 現在の WGSL コード全文
* 直近 20 件までのチャット履歴
* 最新のユーザーメッセージ
* JSON 形式で回答する指示

### system 指示の要件

* 回答は日本語にする
* WGSL コードを修正する場合は修正後のコード全文を `proposedCode` に入れる
* コード修正が不要な場合は `proposedCode` を `null` にする
* `proposedCode` には Markdown code fence を含めない
* ユーザーの指示が WGSL コードと無関係な場合は、できる範囲で説明し、コード修正は行わない

---

## 10.3 Codex 出力の検証

サーバーは `--output-last-message` で指定した一時ファイルから Codex CLI の最終メッセージを読み取り、JSON として parse する。

parse 前に、応答全体を包む Markdown code fence があれば取り除く。例えば応答全体が ```` ```json ... ``` ```` または ```` ``` ... ``` ```` で包まれている場合は、外側の fence だけを除去してから JSON parse する。除去後も parse できない場合は `INVALID_CODEX_RESPONSE` とする。

### 検証項目

| 項目 | 条件 |
| --- | --- |
| 最終メッセージ取得 | `--output-last-message` の一時ファイルから読み取れること |
| Markdown code fence 除去 | 応答全体を包む fence がある場合、parse 前に外側の fence を除去すること |
| JSON parse | parse できること |
| `message` | string であること |
| `proposedCode` | string または null であること |
| `notes` | string[] であること |

### 不正時の扱い

検証に失敗した場合、サーバーは `INVALID_CODEX_RESPONSE` を返す。フロントエンドは Error メッセージとして表示し、エディター内容は変更しない。

---

## 11. セキュリティ / 安全性

## 11.1 ローカル開発専用

AIチャットサーバーはローカル開発専用とする。

| 項目 | 仕様 |
| --- | --- |
| bind address | `127.0.0.1` または `localhost` |
| 外部公開 | しない |
| 認証 | 初期リリースでは実装しない |
| CORS | Vite dev server からの同一 origin または明示した localhost origin のみ許可 |

### 注意

AIチャットサーバーを `0.0.0.0` に bind して LAN やインターネットへ公開してはならない。

---

## 11.2 Codex 実行時のサンドボックス

初期リリースでは Codex CLI を **read-only サンドボックス**で実行する。

### 採用理由

AIチャット機能では、Codex CLI がファイルを書き換える必要はない。現在の WGSL コード全文はプロンプトとして渡され、修正案は JSON の `proposedCode` として返される。実際のエディター反映はブラウザ上の `Apply` 操作で行うため、Codex CLI に workspace-write 権限を与えない。

### 仕様

* Codex CLI にはリポジトリの書き込み権限を与えない
* Codex CLI から返された提案コードだけをフロントエンドが扱う
* ファイル編集は Codex CLI ではなく、ユーザーの `Apply` 操作によって React state 上で行う

---

## 11.3 任意コマンド実行を避ける設計

| リスク | 対策 |
| --- | --- |
| ユーザー入力が shell コマンドとして解釈される | `spawn` を shell なしで使い、prompt を stdin または一時ファイルで渡す |
| ユーザーが Codex CLI の引数を注入する | ユーザー入力を CLI 引数として使わない |
| AI がファイル編集を試みる | read-only サンドボックスで実行する |
| AI が危険なコマンドを提案する | 提案はチャット本文として表示するだけで自動実行しない |
| AI 提案コードが自動適用される | `Apply` ボタンを押した時だけ反映する |

---

## 12. 状態管理

## 12.1 フロントエンド状態

AIチャット機能では以下の状態を React state として保持する。

| 状態名 | 型 | 内容 |
| --- | --- | --- |
| `isChatOpen` | boolean | チャットパネルの開閉 |
| `messages` | ChatMessage[] | 現在の画面セッション中のチャット履歴 |
| `inputValue` | string | 入力欄の値 |
| `isSending` | boolean | 送信中かどうか |
| `activeRequestId` | string \| null | 実行中リクエストの ID |

### ChatMessage

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `id` | string | フロントエンドで生成するメッセージ ID |
| `role` | `"user"` \| `"assistant"` \| `"error"` | メッセージ種別 |
| `content` | string | 表示本文 |
| `proposedCode` | string \| null | AI 提案コード |
| `applied` | boolean | 提案コードを Apply 済みかどうか |
| `createdAt` | number | 作成時刻 |

---

## 12.2 永続化

初期リリースではチャット履歴を永続化しない。

| 操作 | 履歴の扱い |
| --- | --- |
| チャットパネルを閉じる | 保持する |
| チャットパネルを開く | 保持された履歴を表示する |
| ブラウザをリロードする | 消える |
| dev server を再起動する | 消える |

---

## 13. アクセシビリティ

* チャットパネルは `section` とし、見出しに `AI Chat` を表示する
* 開閉ボタンには現在状態が分かる `aria-expanded` を付与する
* メッセージ一覧には `aria-live="polite"` を付与する
* 入力欄には `aria-label="AI chat message"` を付与する
* 送信ボタンには `aria-label="Send AI chat message"` を付与する
* キャンセルボタンには `aria-label="Cancel AI chat request"` を付与する
* `Apply` ボタンには対象メッセージが分かる label を付与する
* 送信中インジケータはスクリーンリーダーで読み上げられるようにする

---

## 14. パフォーマンス要件

| 項目 | 要件 |
| --- | --- |
| チャットパネル開閉 | 100ms 以内を目標 |
| メッセージ追加 | 100ms 以内を目標 |
| Apply によるエディター反映 | 200000 文字以内の WGSL コードで 1 秒以内を目標 |
| Codex CLI 応答 | 120000 ms 以内に成功、失敗、タイムアウトのいずれかにする |

### 備考

Codex CLI の応答時間はモデル、ローカル環境、ネットワーク状態に依存する。初期リリースでは UI が固まらず、送信中状態とキャンセル操作を維持できることを優先する。

---

## 15. エッジケース

| ケース | 期待動作 |
| --- | --- |
| 入力欄が空 | 送信ボタンを無効化し、送信しない |
| 入力欄が空白のみ | 送信ボタンを無効化し、送信しない |
| 入力が 4000 文字を超える | 送信できない。上限超過を入力欄付近に表示する |
| WGSL コードが空 | サーバーへ送信しない。`WGSL code is empty.` を表示する |
| WGSL コードが 200000 文字を超える | サーバーへ送信しない。`WGSL code is too large.` を表示する |
| チャット入力欄フォーカス中に `Ctrl+Enter` または `Meta+Enter` を押す | チャット送信として扱い、既存の Run ショートカットは発火させない |
| 送信中に再送信する | 2 回目の送信を無視する |
| 送信中にチャットパネルを閉じる | リクエストは継続し、完了後に履歴へ反映する |
| 送信中に Reset を押す | 送信済みリクエストには送信時点のコードが使われる。現在のエディターは Reset される |
| 送信中にコードを編集する | 送信済みリクエストには送信時点のコードが使われる。応答の Apply は現在のコードを全文置換する |
| Apply 前にコードを編集した | Apply を押すと現在のコードを提案コードで全文置換する |
| 同じ AIメッセージを複数回 Apply する | 2 回目以降も同じ提案コードで全文置換する |
| AI がコード修正なしで回答した | `Apply` ボタンを表示しない |
| AI が `proposedCode` に空文字を返した | 不正な Codex 応答として扱う |
| Codex CLI が見つからない | Error メッセージとして `Codex CLI is not installed or not found in PATH.` を表示する |
| Codex CLI が失敗終了した | Error メッセージとして `AI chat request failed.` を表示する |
| Codex CLI が JSON 以外を返した | Error メッセージとして `Codex returned an invalid response.` を表示する |
| タイムアウトした | 子プロセスを終了し、`Codex request timed out.` を表示する |
| キャンセルした | 子プロセスを終了し、messages リクエストの 499 `CANCELED` 受信時に `Request canceled.` を 1 回だけ表示する |
| サーバーが未起動 | `AI chat server is not running.` を表示する |
| ネットワークエラー | `AI chat request failed.` を表示する |
| ブラウザをリロードした | チャット履歴は消える |

---

## 16. MVP 完了条件

以下を満たしたら AIチャット機能の MVP 完了とする。

* エディター列の `EditorPane` と `ErrorPanel` の下に AIチャットパネルが表示される
* AIチャットパネルを開閉できる
* 初期状態で AIチャットパネルが開いている
* メッセージ一覧、入力欄、送信ボタン、キャンセルボタン、送信中インジケータが表示される
* 空文字または空白のみのメッセージを送信できない
* チャット入力欄フォーカス中は `Ctrl+Enter` または `Meta+Enter` で送信でき、その時に既存の Run ショートカットは発火しない
* チャット入力欄にフォーカスがない時は `Ctrl+Enter` または `Meta+Enter` が既存どおり Run として動作する
* 送信時にユーザーメッセージと現在の WGSL コード全文をサーバーへ送る
* 送信時に直近 20 件までのチャット履歴をサーバーへ送る
* 送信中は送信ボタンが無効になり、多重送信できない
* 送信中はキャンセルボタンでリクエストをキャンセルできる
* サーバーが `codex exec` 非対話モードを子プロセスとして実行する
* サーバーが `codex exec --output-last-message <temp-file-path>` で最終メッセージを取得し、stdout / stderr を AI 応答として parse しない
* サーバーが shell 経由ではなく `spawn` で Codex CLI を実行する
* Codex CLI 実行は read-only サンドボックスで行う
* AI 応答本文が Assistant メッセージとして表示される
* AI が `proposedCode` を返した場合、提案コードと `Apply` ボタンが表示される
* `Apply` ボタンを押すまでエディター内容が変更されない
* `Apply` ボタンを押すとエディター内容が提案コード全文で置き換わる
* Apply 後も Run は自動実行されない
* サーバー未起動時にチャット内へエラー表示される
* Codex CLI 未インストール時にチャット内へエラー表示される
* タイムアウト時にチャット内へエラー表示される
* キャンセル時に `Request canceled.` が 1 回だけ表示される
* Codex CLI の不正 JSON 応答時にチャット内へエラー表示される
* チャット履歴はブラウザリロードで消える

---

## 17. 実装時の確認項目

### 自動テスト

* 空文字、空白のみ、文字数上限の入力バリデーション unit test
* 送信 payload に現在の WGSL コード全文が含まれることの unit test
* 履歴が直近 20 件に丸められることの unit test
* 送信中に送信ボタンが無効になる component test
* AI 応答に `proposedCode` がある場合だけ `Apply` ボタンが表示される component test
* `Apply` 押下で `setCode(proposedCode)` が呼ばれる component test
* サーバーエラー時に Error メッセージが表示される component test
* Codex 出力 JSON の検証 unit test
* タイムアウト時に子プロセスを終了する server unit test
* キャンセル API で対象子プロセスを終了する server unit test

### 手動確認

* 初期表示で EditorPane / ErrorPanel / AIチャットパネルが縦に並ぶ
* AIチャットパネルを閉じても履歴が消えない
* 「このシェーダーを青っぽくして」と送信すると、現在の WGSL コード全文がサーバーへ送られる
* AI 応答が返るまで送信中インジケータが表示される
* AI 応答後に入力欄が空になる
* AI 提案コードを Apply するとエディター内容が置き換わる
* Apply だけでは Preview が更新されない
* Apply 後に Run を押すと既存仕様どおりコンパイルされる
* Codex CLI 未インストール環境で分かりやすいエラーが表示される
* AIチャットサーバー未起動時に分かりやすいエラーが表示される
* 送信中にキャンセルするとリクエストが停止し、入力欄の内容が残る
