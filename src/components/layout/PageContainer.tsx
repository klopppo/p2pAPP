import React from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  type?: 'landing' | 'app'
  /**
   * App pages only. When false, the vertical `py-8` padding is dropped so a
   * full-height page (e.g. chat) can own the whole content area without the
   * shell's padding pushing it past the viewport.
   */
  padded?: boolean
}

export function PageContainer({ children, type = 'landing', padded = true }: PageContainerProps) {
  if (type === 'landing') {
    return <div className="max-w-[1100px] mx-auto px-4 md:px-6 w-full">{children}</div>
  }

  return (
    <div
      className={cn(
        'max-w-[1000px] mx-auto px-4 md:px-6 w-full flex-1 flex flex-col min-h-0',
        padded && 'py-8',
      )}
    >
      {children}
    </div>
  )
}
