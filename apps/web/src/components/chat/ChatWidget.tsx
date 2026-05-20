import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageCircle, X, Send } from 'lucide-react'
import { api } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const mutation = useMutation({
    mutationFn: (content: string) =>
      api.post('/chat/message', { content }).then((r) => r.data as Message),
    onSuccess: (response) => {
      setMessages((prev) => [...prev, response])
    },
  })

  const send = () => {
    const content = input.trim()
    if (!content || mutation.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content }])
    setInput('')
    mutation.mutate(content)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, mutation.isPending])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-80 flex flex-col overflow-hidden"
          style={{ height: '420px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-violet-600">
            <span className="text-white font-semibold text-sm">MaIA — Asistente</span>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-400 text-center mt-4">
                ¡Hola! Pregúntame sobre tu malla curricular.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm rounded-xl px-3 py-2 max-w-[90%] ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white self-end'
                    : 'bg-gray-100 text-gray-800 self-start'
                }`}
              >
                {msg.content}
              </div>
            ))}
            {mutation.isPending && (
              <div className="bg-gray-100 text-gray-500 text-sm rounded-xl px-3 py-2 self-start">
                Pensando...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Escribe tu pregunta..."
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              onClick={send}
              disabled={mutation.isPending || !input.trim()}
              className="text-violet-600 hover:text-violet-800 disabled:opacity-40 transition"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-violet-600 hover:bg-violet-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  )
}
