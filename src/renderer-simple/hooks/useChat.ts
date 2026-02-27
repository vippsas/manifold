import { useState, useEffect, useCallback } from 'react'
import type { ChatMessage } from '../../shared/simple-types'

export function useChat(sessionId: string | null): {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
} {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!sessionId) return
    window.electronAPI.invoke('simple:chat-messages', sessionId).then((msgs) => {
      setMessages(msgs as ChatMessage[])
    })
    const unsub = window.electronAPI.on('simple:chat-message', (msg: unknown) => {
      const chatMsg = msg as ChatMessage
      if (chatMsg.sessionId === sessionId) {
        setMessages((prev) => [...prev, chatMsg])
      }
    })
    return unsub
  }, [sessionId])

  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId) return
      window.electronAPI.invoke('agent:input', sessionId, text + '\n')
      window.electronAPI.invoke('simple:send-message', sessionId, text)
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
