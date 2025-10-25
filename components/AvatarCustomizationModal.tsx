'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { generateAvatarUrl, generateRandomSeed, type AvatarOptions } from '@/lib/avatar'

interface AvatarCustomizationModalProps {
  isOpen: boolean
  onClose: () => void
  currentSeed: string
  currentOptions: AvatarOptions
  onSave: (seed: string, options: AvatarOptions) => Promise<void>
}

const createVariants = (count: number) =>
  Array.from({ length: count }, (_, index) => `variant${String(index + 1).padStart(2, '0')}`)

const sanitizeOptions = (opts: AvatarOptions = {}): AvatarOptions => {
  const { base, gesture, glasses, ...rest } = opts
  return { ...rest }
}

const STYLE_OPTIONS = {
  beard: createVariants(12),
  body: createVariants(25),
  bodyIcon: ['electric', 'galaxy', 'saturn'],
  brows: createVariants(13),
  eyes: createVariants(5),
  hair: ['hat', ...createVariants(63)],
  lips: createVariants(30),
  nose: createVariants(20),
} as const

type StyleCategory = keyof typeof STYLE_OPTIONS

const CATEGORY_LABELS: Record<StyleCategory, string> = {
  beard: 'Beard',
  body: 'Body',
  bodyIcon: 'Body Icon',
  brows: 'Brows',
  eyes: 'Eyes',
  hair: 'Hair',
  lips: 'Lips',
  nose: 'Nose',
}

const ORDERED_CATEGORIES: StyleCategory[] = ['hair', 'eyes', 'brows', 'nose', 'lips', 'beard', 'body', 'bodyIcon']

const NO_REMOVE_CATEGORIES: StyleCategory[] = ['hair', 'eyes', 'brows', 'nose', 'lips']

const BACKGROUND_SWATCHES = ['transparent', 'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf']

export function AvatarCustomizationModal({ isOpen, onClose, currentSeed, currentOptions, onSave }: AvatarCustomizationModalProps) {
  const [seed, setSeed] = useState(currentSeed)
  const [options, setOptions] = useState<AvatarOptions>(sanitizeOptions(currentOptions))
  const [saving, setSaving] = useState(false)
  const [activeCategory, setActiveCategory] = useState<StyleCategory>('hair')

  useEffect(() => {
    setSeed(currentSeed)
    setOptions(sanitizeOptions(currentOptions))
  }, [currentSeed, currentOptions, isOpen])

  const currentStyle = (options[activeCategory as keyof AvatarOptions] as string[] | undefined)?.[0]
  const previewSeed = seed || 'mimicry'

  const handleStyleSelect = (category: StyleCategory, value?: string) => {
    setOptions(prev => {
      const updated = { ...prev } as AvatarOptions
      const key = category as keyof AvatarOptions
      if (!value) {
        delete (updated as Record<string, unknown>)[key as string]
      } else {
        ;(updated as Record<string, unknown>)[key as string] = [value]
      }
      return updated
    })
  }

  const handleRegenerateRandom = () => {
    setSeed(generateRandomSeed())
    setOptions({})
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(previewSeed, options)
      setSeed(previewSeed)
      onClose()
    } catch (error) {
      console.error('Failed to save avatar:', error)
    } finally {
      setSaving(false)
    }
  }

  const categoryVariants = useMemo(() => STYLE_OPTIONS[activeCategory], [activeCategory])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-border/80">
        <CardHeader className="border-b border-border/80 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="heading-font text-2xl">Tune your Notionist</div>
              <p className="text-sm text-muted-foreground mt-1">Full access to every DiceBear Notionists variant.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <div className="flex flex-col lg:flex-row h-full">
            <aside className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border/60 bg-background/90 p-6 space-y-6 overflow-y-auto">
              <div className="flex flex-col items-center space-y-3">
                <img
                  src={generateAvatarUrl(previewSeed, options)}
                  alt="Avatar preview"
                  className="w-36 h-36 rounded-2xl border-2 border-border shadow-lg bg-white"
                  loading="lazy"
                />
                <Button variant="outline" size="sm" onClick={handleRegenerateRandom}>
                  Shuffle everything
                </Button>
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Background</div>
                <div className="grid grid-cols-3 gap-3">
                  {BACKGROUND_SWATCHES.map(color => {
                    const isActive = options.backgroundColor?.[0] === color || (color === 'transparent' && !options.backgroundColor)
                    return (
                      <button
                        key={color}
                        onClick={() => setOptions(prev => {
                          if (color === 'transparent') {
                            const { backgroundColor, ...rest } = prev
                            return { ...rest } as AvatarOptions
                          }
                          return { ...prev, backgroundColor: [color] }
                        })}
                        className={`h-14 rounded-xl border-2 transition ${isActive ? 'border-[#1F4B3A]' : 'border-border/70 hover:border-border'}`}
                      >
                        <div className="h-full w-full rounded-lg" style={{ background: color === 'transparent' ? 'linear-gradient(135deg, #fff, #d4d4d8)' : `#${color}` }} />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-4 text-xs text-muted-foreground rounded-2xl border border-border/70 p-4">
                <div className="font-medium text-sm text-foreground">Notionists by Zoish</div>
                <p>Avatar design licensed under CC0 1.0. Feel free to remix. You’re editing the DiceBear v9 style directly.</p>
                <div className="flex flex-col gap-1">
                  <a href="https://heyzoish.gumroad.com/l/notionists" target="_blank" rel="noreferrer" className="text-[#1F4B3A] underline">Style source</a>
                  <a href="https://api.dicebear.com/9.x/notionists/svg" target="_blank" rel="noreferrer" className="text-[#1F4B3A] underline">API reference</a>
                </div>
              </div>
            </aside>

            <section className="flex-1 min-w-0 flex flex-col">
              <div className="flex flex-wrap gap-2 p-4 border-b border-border/60 bg-background/80">
                {ORDERED_CATEGORIES.map(category => (
                  <Button
                    key={category}
                    variant={activeCategory === category ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveCategory(category)}
                  >
                    {CATEGORY_LABELS[category]}
                  </Button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Currently editing</p>
                    <h3 className="heading-font text-xl">{CATEGORY_LABELS[activeCategory]}</h3>
                  </div>
                  {!NO_REMOVE_CATEGORIES.includes(activeCategory) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStyleSelect(activeCategory)}
                      disabled={!currentStyle}
                    >
                      Remove selection
                    </Button>
                  )}
                </div>

                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="text-xs text-muted-foreground mb-3">Scroll to see every variant. Tap to lock it in.</p>
                  <div className="max-h-[360px] overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {!NO_REMOVE_CATEGORIES.includes(activeCategory) && (
                        <button
                          onClick={() => handleStyleSelect(activeCategory)}
                          className={`
                            h-28 rounded-xl border-2 text-xs font-medium uppercase tracking-wide transition flex items-center justify-center
                            ${currentStyle ? 'border-border/70 hover:border-border' : 'border-[#1F4B3A] bg-[#1F4B3A]/10 text-[#1F4B3A]'}
                          `}
                        >
                          No {CATEGORY_LABELS[activeCategory].toLowerCase()}
                        </button>
                      )}
                      {categoryVariants.map(variant => {
                        const isSelected = currentStyle === variant
                        const previewOptions = {
                          ...options,
                          [activeCategory]: [variant],
                        }
                        return (
                          <button
                            key={variant}
                            onClick={() => handleStyleSelect(activeCategory, variant)}
                            className={`
                              relative rounded-xl overflow-hidden border-2 transition
                              ${isSelected ? 'border-[#1F4B3A] ring-2 ring-[#1F4B3A]/20' : 'border-border/70 hover:border-border'}
                            `}
                          >
                            <img
                              src={generateAvatarUrl(previewSeed, previewOptions)}
                              alt={variant}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">
                              {variant.replace('variant', '#')}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </CardContent>

        <div className="border-t border-border/80 p-4 flex justify-end gap-3 flex-shrink-0 bg-background/95">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save avatar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
