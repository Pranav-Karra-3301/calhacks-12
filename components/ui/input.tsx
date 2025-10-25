import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props }, ref
) {
  return (
    <input
      ref={ref}
      className={cn('flex h-11 w-full rounded-full border border-border/80 bg-white/90 px-4 py-2 text-sm text-[#35302E] placeholder:text-[#948C87] focus:outline-none focus:ring-2 focus:ring-[#1F4B3A]', className)}
      {...props}
    />
  )
})
