import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiChatMessageRequest, AiChatMessageResponse } from '../aiChat/types'
import { ChatPanel } from './ChatPanel'

const { sendAiChatMessageMock, cancelAiChatRequestMock, MockAiChatClientError } = vi.hoisted(() => {
  class MockAiChatClientError extends Error {
    readonly displayMessage: string

    constructor(displayMessage: string) {
      super(displayMessage)
      this.name = 'AiChatClientError'
      this.displayMessage = displayMessage
    }
  }

  return {
    sendAiChatMessageMock: vi.fn(),
    cancelAiChatRequestMock: vi.fn(),
    MockAiChatClientError,
  }
})

vi.mock('../aiChat/client', () => ({
  AiChatClientError: MockAiChatClientError,
  sendAiChatMessage: sendAiChatMessageMock,
  cancelAiChatRequest: cancelAiChatRequestMock,
}))

function renderPanel(props: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  const onApplyCode = vi.fn()
  render(<ChatPanel code="fn mainImage() {}" onApplyCode={onApplyCode} {...props} />)
  return { onApplyCode }
}

function getInput() {
  return screen.getByLabelText('AI chat message') as HTMLTextAreaElement
}

function getSendButton() {
  return screen.getByRole('button', { name: 'Send AI chat message' })
}

function getSettings() {
  return screen.getByLabelText('AI chat settings')
}

function getAgentSelect() {
  return within(getSettings()).getByLabelText('Agent') as HTMLSelectElement
}

function getModelSelect() {
  return within(getSettings()).getByLabelText('Model') as HTMLSelectElement
}

function getPerformanceSelect() {
  return within(getSettings()).getByLabelText('Performance') as HTMLSelectElement
}

function getToggleButton() {
  const button = screen.getByRole('button', { expanded: true }) ?? screen.getByRole('button', { expanded: false })
  return button
}

function submitMessage(message: string) {
  fireEvent.change(getInput(), { target: { value: message } })
  fireEvent.click(getSendButton())
}

function mockSuccessfulSend(content = 'AI response', proposedCode: string | null = null) {
  sendAiChatMessageMock.mockImplementation(
    async (request: AiChatMessageRequest): Promise<AiChatMessageResponse> => ({
      requestId: request.requestId,
      message: {
        role: 'assistant',
        content,
        proposedCode,
        notes: [],
      },
    }),
  )
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

describe('ChatPanel', () => {
  beforeEach(() => {
    sendAiChatMessageMock.mockReset()
    cancelAiChatRequestMock.mockReset()
    cancelAiChatRequestMock.mockResolvedValue({ requestId: 'request-id', canceled: true })
  })

  it('初期状態で `AI Chat` が開いている', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'AI Chat' })).toBeInTheDocument()
    expect(getInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('初期表示で Agent / Model / Performance controls が既定値を表示する', () => {
    renderPanel()

    expect(getSettings()).toHaveClass('chat-controls')
    expect(getAgentSelect()).toHaveValue('codex')
    expect(getAgentSelect().selectedOptions[0]).toHaveTextContent('Codex CLI')
    expect(getModelSelect()).toHaveValue('gpt-5.6-sol')
    expect(getModelSelect().selectedOptions[0]).toHaveTextContent('GPT-5.6-Sol')
    expect(getPerformanceSelect()).toHaveValue('high')
    expect(getPerformanceSelect().selectedOptions[0]).toHaveTextContent('High')
  })

  it('Agent select に Codex CLI / Claude CLI が表示される', () => {
    renderPanel()

    expect(within(getAgentSelect()).getByRole('option', { name: 'Codex CLI' })).toBeInTheDocument()
    expect(within(getAgentSelect()).getByRole('option', { name: 'Claude CLI' })).toBeInTheDocument()
  })

  it('Model select は選択中 agent の model 候補だけを表示する', () => {
    renderPanel()

    expect(Array.from(getModelSelect().options).map((option) => option.value)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex-spark',
    ])

    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })

    expect(Array.from(getModelSelect().options).map((option) => option.value)).toEqual([
      'claude-default',
      'sonnet',
      'fable',
      'opus',
      'haiku',
    ])
    expect(getModelSelect()).toHaveValue('claude-default')
  })

  it('agent ごとの model / performance 選択を保持する', () => {
    renderPanel()

    fireEvent.change(getPerformanceSelect(), { target: { value: 'xhigh' } })
    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })
    fireEvent.change(getModelSelect(), { target: { value: 'opus' } })
    fireEvent.change(getPerformanceSelect(), { target: { value: 'max' } })
    fireEvent.change(getAgentSelect(), { target: { value: 'codex' } })
    expect(getPerformanceSelect()).toHaveValue('xhigh')
    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })

    expect(getModelSelect()).toHaveValue('opus')
    expect(getPerformanceSelect()).toHaveValue('max')
  })

  it('Performance select に選択中 agent の候補が表示される', () => {
    renderPanel()

    expect(Array.from(getPerformanceSelect().options).map((option) => option.textContent)).toEqual([
      'Low',
      'Medium',
      'High',
      'XHigh',
      'Max',
      'Ultra',
    ])

    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })

    expect(Array.from(getPerformanceSelect().options).map((option) => option.textContent)).toEqual([
      'Default',
      'Low',
      'Medium',
      'High',
      'XHigh',
      'Max',
    ])
  })

  it('開閉しても messages が残る', async () => {
    mockSuccessfulSend('Persisted response')
    renderPanel()

    submitMessage('hello')
    expect(await screen.findByText('Persisted response')).toBeInTheDocument()

    fireEvent.click(getToggleButton())
    expect(screen.queryByText('Persisted response')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Persisted response')).toBeInTheDocument()
  })

  it('controlled open state の変更を通知する', () => {
    const onOpenChange = vi.fn()
    renderPanel({ isOpen: false, onOpenChange })

    expect(screen.queryByLabelText('AI chat message')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show', expanded: false }))

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('空入力では Send が disabled', () => {
    renderPanel()

    expect(getSendButton()).toBeDisabled()
  })

  it('初期表示で入力欄付近にエラーが表示されない', () => {
    renderPanel()

    expect(screen.queryByText('Message is empty.')).not.toBeInTheDocument()
  })

  it('空白のみ入力では Send が disabled', () => {
    renderPanel()

    fireEvent.change(getInput(), { target: { value: '   \n\t  ' } })

    expect(getSendButton()).toBeDisabled()
  })

  it('4001 文字入力時は上限超過を入力欄付近に表示し送信しない', () => {
    renderPanel()

    fireEvent.change(getInput(), { target: { value: 'a'.repeat(4001) } })
    fireEvent.click(getSendButton())

    expect(screen.getByText('Message is too long.')).toBeInTheDocument()
    expect(getSendButton()).toBeDisabled()
    expect(sendAiChatMessageMock).not.toHaveBeenCalled()
  })

  it('WGSL code 空文字では `WGSL code is empty.` を表示しサーバーへ送信しない', () => {
    renderPanel({ code: '' })

    submitMessage('fix code')

    expect(screen.getByText('WGSL code is empty.')).toBeInTheDocument()
    expect(sendAiChatMessageMock).not.toHaveBeenCalled()
  })

  it('WGSL code 200001 文字では `WGSL code is too large.` を表示しサーバーへ送信しない', () => {
    renderPanel({ code: 'a'.repeat(200001) })

    submitMessage('fix code')

    expect(screen.getByText('WGSL code is too large.')).toBeInTheDocument()
    expect(sendAiChatMessageMock).not.toHaveBeenCalled()
  })

  it('`Enter` は改行として扱われる', () => {
    renderPanel()
    const input = getInput()

    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'first\nsecond' } })

    expect(input).toHaveValue('first\nsecond')
    expect(sendAiChatMessageMock).not.toHaveBeenCalled()
  })

  it('`Ctrl+Enter` でチャット送信される', async () => {
    mockSuccessfulSend()
    const documentKeyDown = vi.fn()
    renderPanel()

    fireEvent.change(getInput(), { target: { value: 'send with ctrl' } })
    document.addEventListener('keydown', documentKeyDown)
    try {
      fireEvent.keyDown(getInput(), { key: 'Enter', ctrlKey: true })
    } finally {
      document.removeEventListener('keydown', documentKeyDown)
    }

    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
    expect(documentKeyDown).not.toHaveBeenCalled()
  })

  it('`Meta+Enter` でチャット送信される', async () => {
    mockSuccessfulSend()
    const documentKeyDown = vi.fn()
    renderPanel()

    fireEvent.change(getInput(), { target: { value: 'send with meta' } })
    document.addEventListener('keydown', documentKeyDown)
    try {
      fireEvent.keyDown(getInput(), { key: 'Enter', metaKey: true })
    } finally {
      document.removeEventListener('keydown', documentKeyDown)
    }

    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
    expect(documentKeyDown).not.toHaveBeenCalled()
  })

  it('送信中は Send が disabled、Cancel が表示される', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    submitMessage('wait')

    await waitFor(() => expect(screen.getByText('Codex is thinking...')).toBeInTheDocument())
    expect(getSendButton()).toBeDisabled()
    expect(getAgentSelect()).not.toBeDisabled()
    expect(getModelSelect()).not.toBeDisabled()
    expect(getPerformanceSelect()).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel AI chat request' })).toBeInTheDocument()
  })

  it('送信中にもう一度 submit しても fetch は 1 回だけ', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    submitMessage('once')
    fireEvent.click(getSendButton())
    fireEvent.submit(getSendButton().closest('form') as HTMLFormElement)

    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
  })

  it('送信中にチャットパネルを閉じても request は継続し、完了後に履歴へ反映される', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    submitMessage('keep going')
    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
    fireEvent.click(getToggleButton())
    deferred.resolve({
      requestId: sendAiChatMessageMock.mock.calls[0][0].requestId,
      message: { role: 'assistant', content: 'Finished while closed', proposedCode: null, notes: [] },
    })

    await waitFor(() => expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(await screen.findByText('Finished while closed')).toBeInTheDocument()
  })

  it('成功時に user message と assistant message が表示される', async () => {
    mockSuccessfulSend('Assistant answer')
    renderPanel()

    submitMessage('User question')

    expect(await screen.findByText('User question')).toBeInTheDocument()
    expect(await screen.findByText('Assistant answer')).toBeInTheDocument()
  })

  it('成功時に送信時点の code と直近 20 件の history が payload に含まれる', async () => {
    mockSuccessfulSend('ok')
    renderPanel({ code: 'initial code' })

    for (let index = 0; index < 21; index += 1) {
      submitMessage(`message ${index}`)
      await screen.findByText(`message ${index}`)
      await waitFor(() => expect(screen.getAllByText('ok')).toHaveLength(index + 1))
    }

    submitMessage('final message')
    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(22))
    const payload = sendAiChatMessageMock.mock.calls.at(-1)?.[0] as AiChatMessageRequest

    expect(payload.message).toBe('final message')
    expect(payload.code).toBe('initial code')
    expect(payload.history).toHaveLength(20)
    expect(payload.history[0]).toEqual({ role: 'user', content: 'message 11' })
    expect(payload.history.at(-1)).toEqual({ role: 'assistant', content: 'ok', proposedCode: null })
  })

  it('Codex 選択中の送信 payload に agent / model / performance が含まれる', async () => {
    mockSuccessfulSend('ok')
    renderPanel()

    submitMessage('codex payload')
    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
    const payload = sendAiChatMessageMock.mock.calls[0][0] as AiChatMessageRequest

    expect(payload).toMatchObject({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      performance: 'high',
    })
  })

  it('Codex session id を保持し、2回目以降は履歴を再送しない', async () => {
    const sessionId = '123e4567-e89b-42d3-a456-426614174000'
    sendAiChatMessageMock
      .mockResolvedValueOnce({
        requestId: 'request-1',
        sessionId,
        message: {
          role: 'assistant',
          content: 'first answer',
          proposedCode: null,
          notes: [],
        },
      } satisfies AiChatMessageResponse)
      .mockResolvedValueOnce({
        requestId: 'request-2',
        sessionId,
        message: {
          role: 'assistant',
          content: 'second answer',
          proposedCode: null,
          notes: [],
        },
      } satisfies AiChatMessageResponse)
    renderPanel()

    submitMessage('first question')
    await screen.findByText('first answer')
    submitMessage('second question')
    await screen.findByText('second answer')

    const firstRequest = sendAiChatMessageMock.mock.calls[0][0] as AiChatMessageRequest
    const secondRequest = sendAiChatMessageMock.mock.calls[1][0] as AiChatMessageRequest
    expect(firstRequest.sessionId).toBeUndefined()
    expect(secondRequest).toMatchObject({ sessionId, history: [] })
  })

  it('Claude 選択中の送信 payload に agent / model / performance が含まれる', async () => {
    mockSuccessfulSend('ok')
    renderPanel()

    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })
    fireEvent.change(getModelSelect(), { target: { value: 'opus' } })
    fireEvent.change(getPerformanceSelect(), { target: { value: 'max' } })
    submitMessage('claude payload')
    await waitFor(() => expect(sendAiChatMessageMock).toHaveBeenCalledTimes(1))
    const payload = sendAiChatMessageMock.mock.calls[0][0] as AiChatMessageRequest

    expect(payload).toMatchObject({
      agent: 'claude',
      model: 'opus',
      performance: 'max',
    })
  })

  it('送信中に controls を変更しても payload と thinking 表示は送信時点 selection のまま', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    fireEvent.change(getAgentSelect(), { target: { value: 'claude' } })
    fireEvent.change(getModelSelect(), { target: { value: 'opus' } })
    fireEvent.change(getPerformanceSelect(), { target: { value: 'xhigh' } })
    submitMessage('fixed snapshot')
    await waitFor(() => expect(screen.getByText('Claude is thinking...')).toBeInTheDocument())

    fireEvent.change(getAgentSelect(), { target: { value: 'codex' } })
    fireEvent.change(getModelSelect(), { target: { value: 'gpt-5.4' } })
    fireEvent.change(getPerformanceSelect(), { target: { value: 'low' } })

    const payload = sendAiChatMessageMock.mock.calls[0][0] as AiChatMessageRequest
    expect(payload).toMatchObject({
      agent: 'claude',
      model: 'opus',
      performance: 'xhigh',
    })
    expect(screen.getByText('Claude is thinking...')).toBeInTheDocument()
    expect(screen.queryByText('Codex is thinking...')).not.toBeInTheDocument()
  })

  it('失敗時に Error message が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI chat request failed.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI chat request failed.')).toBeInTheDocument()
  })

  it('失敗時に入力欄が残る', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI chat request failed.'))
    renderPanel()

    submitMessage('keep input')

    await screen.findByText('AI chat request failed.')
    expect(getInput()).toHaveValue('keep input')
  })

  it('`CODEX_NOT_FOUND` で `Codex CLI is not installed or not found in PATH.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(
      new MockAiChatClientError('Codex CLI is not installed or not found in PATH.'),
    )
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('Codex CLI is not installed or not found in PATH.')).toBeInTheDocument()
  })

  it('`CLAUDE_NOT_FOUND` で `Claude CLI is not installed or not found in PATH.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(
      new MockAiChatClientError('Claude CLI is not installed or not found in PATH.'),
    )
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('Claude CLI is not installed or not found in PATH.')).toBeInTheDocument()
  })

  it('`TIMEOUT` で `AI chat request timed out.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI chat request timed out.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI chat request timed out.')).toBeInTheDocument()
  })

  it('`INVALID_AI_RESPONSE` で `AI returned an invalid response.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI returned an invalid response.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI returned an invalid response.')).toBeInTheDocument()
  })

  it('`INVALID_CODEX_RESPONSE` で `AI returned an invalid response.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI returned an invalid response.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI returned an invalid response.')).toBeInTheDocument()
  })

  it('`AI_AGENT_FAILED` と旧 `CODEX_FAILED` は `AI chat request failed.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI chat request failed.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI chat request failed.')).toBeInTheDocument()
  })

  it('fetch reject で `AI chat server is not running.` が表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('AI chat server is not running.'))
    renderPanel()

    submitMessage('fail')

    expect(await screen.findByText('AI chat server is not running.')).toBeInTheDocument()
  })

  it('cancel button で cancel API を呼ぶ', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    submitMessage('cancel this')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel AI chat request' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel AI chat request' }))

    expect(cancelAiChatRequestMock).toHaveBeenCalledWith({
      requestId: sendAiChatMessageMock.mock.calls[0][0].requestId,
    })
  })

  it('cancel API 成功レスポンスだけでは Error message を追加しない', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    renderPanel()

    submitMessage('cancel this')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel AI chat request' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel AI chat request' }))

    await waitFor(() => expect(cancelAiChatRequestMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Request canceled.')).not.toBeInTheDocument()
  })

  it('messages request の 499 で `Request canceled.` が 1 回表示される', async () => {
    sendAiChatMessageMock.mockRejectedValue(new MockAiChatClientError('Request canceled.'))
    renderPanel()

    submitMessage('cancel this')

    await screen.findByText('Request canceled.')
    expect(screen.getAllByText('Request canceled.')).toHaveLength(1)
  })

  it('cancel API が fetch reject した場合は `AI chat server is not running.` が表示され、messages request の結果を引き続き待つ', async () => {
    const deferred = createDeferred<AiChatMessageResponse>()
    sendAiChatMessageMock.mockReturnValue(deferred.promise)
    cancelAiChatRequestMock.mockRejectedValue(new MockAiChatClientError('AI chat server is not running.'))
    renderPanel()

    submitMessage('cancel this')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel AI chat request' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel AI chat request' }))
    expect(await screen.findByText('AI chat server is not running.')).toBeInTheDocument()

    deferred.resolve({
      requestId: sendAiChatMessageMock.mock.calls[0][0].requestId,
      message: { role: 'assistant', content: 'Still completed', proposedCode: null, notes: [] },
    })
    expect(await screen.findByText('Still completed')).toBeInTheDocument()
  })

  it('`proposedCode` がある assistant message だけ Apply button が表示される', async () => {
    mockSuccessfulSend('Patch ready', 'fn mainImage() { return; }')
    renderPanel()

    submitMessage('propose')

    expect(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' })).toBeInTheDocument()
  })

  it('`proposedCode` が `null` の assistant message には Apply button が表示されない', async () => {
    mockSuccessfulSend('No patch', null)
    renderPanel()

    submitMessage('no propose')
    await screen.findByText('No patch')

    expect(screen.queryByRole('button', { name: /Apply proposed code/ })).not.toBeInTheDocument()
  })

  it('Apply で `onApplyCode(proposedCode)` が呼ばれる', async () => {
    mockSuccessfulSend('Patch ready', 'new code')
    const { onApplyCode } = renderPanel()

    submitMessage('propose')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(onApplyCode).toHaveBeenCalledWith('new code')
  })

  it('Apply 後に対象 message へ `Applied` が表示される', async () => {
    mockSuccessfulSend('Patch ready', 'new code')
    renderPanel()

    submitMessage('propose')
    const assistantMessage = await screen.findByText('Patch ready')
    const messageItem = assistantMessage.closest('.chat-message') as HTMLElement
    fireEvent.click(within(messageItem).getByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(within(messageItem).getByText('Applied')).toBeInTheDocument()
  })

  it('同じ message の Apply は 2 回目以降も同じ proposedCode で全文置換する', async () => {
    mockSuccessfulSend('Patch ready', 'new code')
    const { onApplyCode } = renderPanel()

    submitMessage('propose')
    const applyButton = await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' })
    fireEvent.click(applyButton)
    fireEvent.click(applyButton)

    expect(onApplyCode).toHaveBeenCalledTimes(2)
    expect(onApplyCode).toHaveBeenNthCalledWith(1, 'new code')
    expect(onApplyCode).toHaveBeenNthCalledWith(2, 'new code')
  })

  it('Apply 前に code を編集していても Apply は現在の code を proposedCode で全文置換する', async () => {
    mockSuccessfulSend('Patch ready', 'replacement code')
    const { onApplyCode } = renderPanel({ code: 'edited after request' })

    submitMessage('propose')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(onApplyCode).toHaveBeenCalledWith('replacement code')
  })

  it('Apply だけでは client の send API を呼ばない', async () => {
    mockSuccessfulSend('Patch ready', 'new code')
    renderPanel()

    submitMessage('propose')
    await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' })
    sendAiChatMessageMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(sendAiChatMessageMock).not.toHaveBeenCalled()
  })

  it('Apply だけでは Run 用 callback を呼ばない', async () => {
    mockSuccessfulSend('Patch ready', 'new code')
    const runCallback = vi.fn()
    render(<ChatPanel code="old code" onApplyCode={vi.fn()} />)

    submitMessage('propose')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(runCallback).not.toHaveBeenCalled()
  })
})
