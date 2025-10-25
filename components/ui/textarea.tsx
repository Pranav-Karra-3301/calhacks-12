import * as React from 'react'
import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props }, ref
) {
  return (
    <textarea
      ref={ref}
      className={cn('flex min-h-[100px] w-full rounded-2xl border border-border/80 bg-white/90 px-4 py-3 text-sm text-[#35302E] placeholder:text-[#948C87] focus:outline-none focus:ring-2 focus:ring-[#1F4B3A]', className)}
      {...props}
    />
  )
})
