import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send, Bot, User } from 'lucide-react'
import { api } from '@/lib/api'
import MarkdownMessage from '@/components/chat/MarkdownMessage'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  '¿Cuántos créditos me faltan para graduarme?',
  '¿Cuáles son mis materias disponibles para el próximo semestre?',
  '¿Qué pasa si pierdo Cálculo Integral?',
]

export default function ChatPage() {
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

  const send = (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || mutation.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content }])
    setInput('')
    mutation.mutate(content)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, mutation.isPending])

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center pt-12">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
              <Bot size={28} className="text-indigo-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Hola, soy MaIA</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Tu asistente académico. Pregúntame sobre tu malla curricular, requisitos de graduación o recomendaciones.
            </p>
            <div className="flex flex-col gap-2 mt-6 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl px-4 py-2.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
              msg.role === 'user' ? 'bg-slate-900' : 'bg-indigo-600'
            }`}>
              {msg.role === 'user'
                ? <User size={13} className="text-white" />
                : <Bot size={13} className="text-white" />
              }
            </div>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-slate-900 text-white rounded-tr-sm'
                : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
            }`}>
              {msg.role === 'assistant'
                ? <MarkdownMessage content={msg.content} />
                : msg.content
              }
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex-shrink-0 bg-indigo-600 flex items-center justify-center">
              <Bot size={13} className="text-white" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
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
      <div className="px-6 pb-6">
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-indigo-300 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Escribe tu duda académica..."
            className="flex-1 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"
          />
          <button
            onClick={() => send()}
            disabled={mutation.isPending || !input.trim()}
            className="w-8 h-8 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
