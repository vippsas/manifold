import { useState, useEffect, useCallback } from 'react'
import type { ChatMessage } from '../../shared/simple-types'

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (prev.length === 0) return incoming
  const byId = new Map<string, ChatMessage>()
  for (const m of incoming) byId.set(m.id, m)
  for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m)
  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
}

export function useChat(sessionId: string | null): {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
} {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    setMessages([])
    if (!sessionId) return
    window.electronAPI.invoke('simple:chat-messages', sessionId).then((msgs) => {
      setMessages((prev) => mergeMessages(prev, msgs as ChatMessage[]))
    })
    const unsub = window.electronAPI.on('simple:chat-message', (msg: unknown) => {
      const chatMsg = msg as ChatMessage
      // Skip user messages — they're already added locally in sendMessage
      if (chatMsg.sessionId === sessionId && chatMsg.role !== 'user') {
        setMessages((prev) => prev.some((m) => m.id === chatMsg.id) ? prev : [...prev, chatMsg])
      }
    })
    return unsub
  }, [sessionId])

  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId) return
      window.electronAPI.invoke('simple:send-message', sessionId, text)
      window.electronAPI.invoke('agent:input', sessionId, text)
      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        sessionId,
        role: 'user',
        text,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
    },
    [sessionId],
  )

  return { messages, sendMessage }
}
