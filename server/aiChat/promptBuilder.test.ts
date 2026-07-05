// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildAiChatPrompt, buildCodexPrompt } from './promptBuilder.ts'
import type { ChatHistoryItem } from '../../src/aiChat/types.ts'

describe('buildAiChatPrompt', () => {
  it('includes a system instruction to answer in Japanese', () => {
    const prompt = buildAiChatPrompt({ message: 'Explain it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('回答は日本語にしてください。')
  })

  it('includes a system instruction to return only JSON format', () => {
    const prompt = buildAiChatPrompt({ message: 'Explain it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('最終回答は次の JSON 形式だけにしてください。')
    expect(prompt).toContain('JSON の外側に説明文を付けないでください。')
  })

  it('includes the response object contract', () => {
    const prompt = buildAiChatPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('"message": "回答本文"')
    expect(prompt).toContain('"proposedCode": "修正後の WGSL コード全文。コード修正がない場合は null"')
    expect(prompt).toContain('"notes": ["補足事項"]')
    expect(prompt).toContain('修正後の WGSL コード全文を proposedCode に入れてください。')
  })

  it('includes a system instruction not to include Markdown code fences in proposedCode', () => {
    const prompt = buildAiChatPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('Markdown code fence を含まない WGSL コード全文')
  })

  it('includes a system instruction not to edit files or run commands', () => {
    const prompt = buildAiChatPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('ファイル編集、コマンド実行、リポジトリ変更は行わないでください。')
  })

  it('keeps only the most recent 20 history items', () => {
    const history = Array.from({ length: 21 }, (_, index): ChatHistoryItem => ({
      role: 'user',
      content: index === 0 ? 'oldest-history-item' : `kept-history-${index + 1}`,
    }))
    const prompt = buildAiChatPrompt({ message: 'latest', code: 'fn main() {}', history })

    expect(prompt).not.toContain('oldest-history-item')
    expect(prompt).toContain('kept-history-2')
    expect(prompt).toContain('kept-history-21')
  })

  it('includes assistant history proposedCode in the history context', () => {
    const prompt = buildAiChatPrompt({
      message: 'latest',
      code: 'fn main() {}',
      history: [
        {
          role: 'assistant',
          content: 'Previous answer',
          proposedCode: 'fn previous() {}',
        },
      ],
    })

    expect(prompt).toContain('Previous answer')
    expect(prompt).toContain('proposedCode:\nfn previous() {}')
  })

  it('does not add history item agent, model, or performance to the prompt contract', () => {
    const prompt = buildAiChatPrompt({
      message: 'latest',
      code: 'fn main() {}',
      history: [
        {
          role: 'user',
          content: 'Previous question',
          agent: 'claude',
          model: 'claude-deep',
          performance: 'deep',
        } as ChatHistoryItem,
      ],
    })

    expect(prompt).toContain('Previous question')
    expect(prompt).not.toContain('agent')
    expect(prompt).not.toContain('model')
    expect(prompt).not.toContain('performance')
    expect(prompt).not.toContain('claude-deep')
  })

  it('includes a no-history marker when history is empty', () => {
    const prompt = buildAiChatPrompt({ message: 'latest', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('(履歴なし)')
  })

  it('includes the current full WGSL code inside a WGSL code fence', () => {
    const code = '@fragment\nfn fragmentMain() -> @location(0) vec4f {\n  return vec4f(1.0);\n}'
    const prompt = buildAiChatPrompt({ message: 'latest', code, history: [] })

    expect(prompt).toContain(`\`\`\`wgsl\n${code}\n\`\`\``)
  })

  it('includes the latest user message', () => {
    const prompt = buildAiChatPrompt({
      message: 'このシェーダーを青っぽくして',
      code: 'fn main() {}',
      history: [],
    })

    expect(prompt).toContain('# 最新のユーザーメッセージ\nこのシェーダーを青っぽくして')
  })

  it('keeps buildCodexPrompt as a compatible alias', () => {
    const input = { message: 'latest', code: 'fn main() {}', history: [] }

    expect(buildCodexPrompt(input)).toBe(buildAiChatPrompt(input))
  })
})
