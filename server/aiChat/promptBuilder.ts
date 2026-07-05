import { AI_CHAT_HISTORY_MAX_ITEMS } from '../../src/aiChat/types.ts'
import type { ChatHistoryItem } from '../../src/aiChat/types.ts'

export function buildAiChatPrompt(input: {
  message: string
  code: string
  history: ChatHistoryItem[]
}): string {
  const historyText = input.history
    .slice(-AI_CHAT_HISTORY_MAX_ITEMS)
    .map((item, index) => {
      const proposedCode =
        item.role === 'assistant' && item.proposedCode
          ? `\nproposedCode:\n${item.proposedCode}`
          : ''

      return `## History ${index + 1} (${item.role})\n${item.content}${proposedCode}`
    })
    .join('\n\n')

  return `あなたは Shaderbook の AI チャットアシスタントです。

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
`
}

export const buildCodexPrompt = buildAiChatPrompt
