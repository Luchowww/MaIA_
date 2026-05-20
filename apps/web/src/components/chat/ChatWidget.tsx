import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageSquare, X, Send, Bot } from 'lucide-react'
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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className="bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: 340, height: 460 }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 flex-shrink-0">
            <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white leading-none">MaIA</p>
              <p className="text-[10px] text-white/50 mt-0.5">Asistente Académico</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white transition-colors p-1"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-slate-50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center mb-2">
                  <Bot size={18} className="text-slate-500" />
                </div>
                <p className="text-xs font-semibold text-slate-600">¿En qué te ayudo?</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Pregúntame sobre tu malla curricular o materias disponibles.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] text-xs leading-relaxed rounded-2xl px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5 bg-white flex-shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Escribe tu duda académica..."
              className="flex-1 text-xs text-slate-700 placeholder-slate-400 bg-transparent outline-none"
            />
            <button
              onClick={send}
              disabled={mutation.isPending || !input.trim()}
              className="w-7 h-7 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
      >
        {open ? <X size={18} /> : <MessageSquare size={18} />}
      </button>
    </div>
  )
}
