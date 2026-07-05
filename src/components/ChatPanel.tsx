import { useMemo, useRef, useState } from 'react'
import { AiChatClientError, cancelAiChatRequest, sendAiChatMessage } from '../aiChat/client'
import {
  createAiChatId,
  createChatHistory,
  validateAiChatDraft,
  validateAiChatMessageText,
  type ChatMessage,
} from '../aiChat/state'

export type ChatPanelProps = {
  code: string
  onApplyCode: (code: string) => void
}

export function ChatPanel({ code, onApplyCode }: ChatPanelProps) {
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const isSendingRef = useRef(false)

  const messageValidation = useMemo(() => validateAiChatMessageText(inputValue), [inputValue])
  const shouldShowInputError = inputValue.trim().length > 0 && messageValidation.errorMessage === 'Message is too long.'
  const canSend = messageValidation.canSend && !isSending

  const appendMessage = (message: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: createAiChatId(),
        createdAt: Date.now(),
      },
    ])
  }

  const appendErrorMessage = (content: string) => {
    appendMessage({
      role: 'error',
      content,
      proposedCode: null,
      notes: [],
      applied: false,
    })
  }

  const submitMessage = async () => {
    if (isSendingRef.current) {
      return
    }

    const draft = {
      message: inputValue,
      code,
    }
    const validation = validateAiChatDraft(draft)

    if (!validation.canSend) {
      if (validation.errorMessage && validation.errorMessage !== messageValidation.errorMessage) {
        appendErrorMessage(validation.errorMessage)
      }
      return
    }

    const requestId = createAiChatId()
    const messageAtSubmit = inputValue
    const codeAtSubmit = code
    const historyAtSubmit = createChatHistory(messages)

    isSendingRef.current = true
    setIsSending(true)
    setActiveRequestId(requestId)
    appendMessage({
      role: 'user',
      content: messageAtSubmit,
      proposedCode: null,
      notes: [],
      applied: false,
    })

    try {
      const response = await sendAiChatMessage({
        requestId,
        message: messageAtSubmit,
        code: codeAtSubmit,
        history: historyAtSubmit,
      })

      appendMessage({
        role: 'assistant',
        content: response.message.content,
        proposedCode: response.message.proposedCode,
        notes: response.message.notes,
        applied: false,
      })
      setInputValue('')
    } catch (error) {
      appendErrorMessage(getDisplayMessage(error))
    } finally {
      isSendingRef.current = false
      setIsSending(false)
      setActiveRequestId(null)
    }
  }

  const cancelRequest = async () => {
    if (!activeRequestId) {
      return
    }

    try {
      await cancelAiChatRequest({ requestId: activeRequestId })
    } catch (error) {
      appendErrorMessage(getDisplayMessage(error))
    }
  }

  const applyProposedCode = (messageId: string, proposedCode: string) => {
    onApplyCode(proposedCode)
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              applied: true,
            }
          : message,
      ),
    )
  }

  return (
    <section className="panel chat-panel" aria-labelledby="ai-chat-title">
      <div className="panel-header chat-panel-header">
        <h2 id="ai-chat-title">AI Chat</h2>
        <button
          type="button"
          className="control-button"
          aria-expanded={isChatOpen}
          onClick={() => setIsChatOpen((current) => !current)}
        >
          {isChatOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {isChatOpen ? (
        <>
          <div className="chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={message.id}
                className={`chat-message chat-message-${message.role}`}
                aria-label={`${message.role} message ${index + 1}`}
              >
                <div className="chat-message-role">{getRoleLabel(message.role)}</div>
                <div className="chat-message-content">{message.content}</div>
                {message.notes.length > 0 ? (
                  <ul className="chat-message-notes">
                    {message.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
                {message.role === 'assistant' && message.proposedCode ? (
                  <div className="chat-proposed-code">
                    <div className="chat-proposed-code-header">
                      <span>shader.wgsl</span>
                      <button
                        type="button"
                        className="control-button"
                        aria-label={`Apply proposed code from assistant message ${index + 1}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          applyProposedCode(message.id, message.proposedCode ?? '')
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    <pre>{message.proposedCode}</pre>
                    {message.applied ? <span className="chat-applied">Applied</span> : null}
                  </div>
                ) : null}
              </article>
            ))}
            {isSending ? <div className="chat-thinking">Codex is thinking...</div> : null}
          </div>
          <form
            className="chat-input-row"
            onSubmit={(event) => {
              event.preventDefault()
              void submitMessage()
            }}
          >
            <label className="chat-input-field">
              <textarea
                data-ai-chat-input="true"
                aria-label="AI chat message"
                value={inputValue}
                onChange={(event) => setInputValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    void submitMessage()
                  }
                }}
              />
              {shouldShowInputError ? (
                <span className="chat-input-error">{messageValidation.errorMessage}</span>
              ) : null}
            </label>
            <button
              type="submit"
              className="button button-primary"
              aria-label="Send AI chat message"
              disabled={!canSend}
            >
              Send
            </button>
            {isSending && activeRequestId ? (
              <button
                type="button"
                className="button"
                aria-label="Cancel AI chat request"
                onClick={() => {
                  void cancelRequest()
                }}
              >
                Cancel
              </button>
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  )
}

function getDisplayMessage(error: unknown): string {
  if (error instanceof AiChatClientError) {
    return error.displayMessage
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'displayMessage' in error &&
    typeof error.displayMessage === 'string'
  ) {
    return error.displayMessage
  }

  return 'AI chat request failed.'
}

function getRoleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'assistant':
      return 'Assistant'
    case 'error':
      return 'Error'
    case 'user':
      return 'You'
  }
}
