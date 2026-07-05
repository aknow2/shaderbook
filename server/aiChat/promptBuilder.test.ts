// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildCodexPrompt } from './promptBuilder.ts'
import type { ChatHistoryItem } from '../../src/aiChat/types.ts'

describe('buildCodexPrompt', () => {
  it('includes a system instruction to answer in Japanese', () => {
    const prompt = buildCodexPrompt({ message: 'Explain it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('回答は日本語にしてください。')
  })

  it('includes a system instruction to return only JSON format', () => {
    const prompt = buildCodexPrompt({ message: 'Explain it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('最終回答は次の JSON 形式だけにしてください。')
    expect(prompt).toContain('JSON の外側に説明文を付けないでください。')
  })

  it('includes a system instruction that proposedCode is the full WGSL code', () => {
    const prompt = buildCodexPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('修正後の WGSL コード全文を proposedCode に入れてください。')
  })

  it('includes a system instruction not to include Markdown code fences in proposedCode', () => {
    const prompt = buildCodexPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('Markdown code fence を含まない WGSL コード全文')
  })

  it('includes a system instruction not to edit files or run commands', () => {
    const prompt = buildCodexPrompt({ message: 'Change it', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('ファイル編集、コマンド実行、リポジトリ変更は行わないでください。')
  })

  it('keeps only the most recent 20 history items', () => {
    const history = Array.from({ length: 21 }, (_, index): ChatHistoryItem => ({
      role: 'user',
      content: index === 0 ? 'oldest-history-item' : `kept-history-${index + 1}`,
    }))
    const prompt = buildCodexPrompt({ message: 'latest', code: 'fn main() {}', history })

    expect(prompt).not.toContain('oldest-history-item')
    expect(prompt).toContain('kept-history-2')
    expect(prompt).toContain('kept-history-21')
  })

  it('includes assistant history proposedCode in the history context', () => {
    const prompt = buildCodexPrompt({
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

  it('includes a no-history marker when history is empty', () => {
    const prompt = buildCodexPrompt({ message: 'latest', code: 'fn main() {}', history: [] })

    expect(prompt).toContain('(履歴なし)')
  })

  it('includes the current full WGSL code inside a WGSL code fence', () => {
    const code = '@fragment\nfn fragmentMain() -> @location(0) vec4f {\n  return vec4f(1.0);\n}'
    const prompt = buildCodexPrompt({ message: 'latest', code, history: [] })

    expect(prompt).toContain(`\`\`\`wgsl\n${code}\n\`\`\``)
  })

  it('includes the latest user message', () => {
    const prompt = buildCodexPrompt({
      message: 'このシェーダーを青っぽくして',
      code: 'fn main() {}',
      history: [],
    })

    expect(prompt).toContain('# 最新のユーザーメッセージ\nこのシェーダーを青っぽくして')
  })
})
