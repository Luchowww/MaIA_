import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  compact?: boolean
}

export default function MarkdownMessage({ content, compact = false }: Props) {
  const base = compact ? 'text-xs' : 'text-sm'
  return (
    <div className={`markdown-body ${base} leading-relaxed`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => (
            <p className="font-bold text-base mb-1">{children}</p>
          ),
          h2: ({ children }) => (
            <p className="font-bold mb-1">{children}</p>
          ),
          h3: ({ children }) => (
            <p className="font-semibold mb-1">{children}</p>
          ),
          code: ({ children, className }) => {
            const isBlock = !!className
            return isBlock ? (
              <pre className="bg-black/10 rounded-lg px-3 py-2 my-2 overflow-x-auto font-mono whitespace-pre-wrap">
                <code className={`text-xs ${className ?? ''}`}>{children}</code>
              </pre>
            ) : (
              <code className="bg-black/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 pl-3 opacity-75 my-1">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-slate-200 my-2" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
