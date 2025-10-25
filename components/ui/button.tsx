import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ className, variant = 'default', size = 'md', ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    default: 'bg-[#35302E] text-[#F7F5F3] hover:bg-[#2B2725]',
    secondary: 'bg-[#1F4B3A] text-[#F7F5F3] hover:bg-[#18382C]',
    outline: 'border border-border text-[#35302E] hover:bg-[#EDE8E2]',
    ghost: 'text-[#35302E] hover:bg-[#EDE8E2]/60'
  }
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-sm rounded-md',
    md: 'h-10 px-4 text-sm rounded-md',
    lg: 'h-12 px-6 text-base rounded-lg'
  }
  return (
    <button
      className={cn('inline-flex items-center justify-center font-medium transition-colors rounded-full tracking-tight', variants[variant], sizes[size], className)}
      {...props}
    />
  )
}
