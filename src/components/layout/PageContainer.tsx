import React from 'react'

interface PageContainerProps {
  children: React.ReactNode
  type?: 'landing' | 'app'
}

export function PageContainer({ children, type = 'landing' }: PageContainerProps) {
  if (type === 'landing') {
    return <div className="max-w-[1100px] mx-auto px-4 md:px-6 w-full">{children}</div>
  }

  // App pages set their own padding — the chat layout wants the full height
  // (no extra top/bottom margin), and the rest of the app pages add `py-8` /
  // `space-y-8` themselves.
  return <div className="max-w-[1000px] mx-auto px-4 md:px-6 w-full flex-1 flex flex-col min-h-0">{children}</div>
}
