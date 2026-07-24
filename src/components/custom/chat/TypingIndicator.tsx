interface Props {
  nickname: string | null
}

/**
 * "Alice is typing…" strip rendered just under the message list. Hidden when
 * no one is typing.
 */
export function TypingIndicator({ nickname }: Props) {
  const label = nickname?.trim() || 'The trader'
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
      <span className="flex gap-1">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
      <span>{label} is typing…</span>
    </div>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
      style={{ animationDelay: `${delay}ms` }}
    />
  )
}
