/**
 * Avatar utilities for DiceBear Notionists integration
 */

export interface AvatarOptions {
  // Probabilities
  beardProbability?: number
  glassesProbability?: number
  gestureProbability?: number
  bodyIconProbability?: number
  
  // Style options
  beard?: string[]
  body?: string[]
  bodyIcon?: string[]
  brows?: string[]
  eyes?: string[]
  gesture?: string[]
  glasses?: string[]
  hair?: string[]
  lips?: string[]
  nose?: string[]
  
  // Visual options
  backgroundColor?: string[]
  backgroundType?: string[]
  flip?: boolean
  rotate?: number
  scale?: number
  radius?: number
  size?: number
}

/**
 * Generate a random seed for avatar creation
 */
export function generateRandomSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Build a DiceBear Notionists avatar URL with optional customization
 */
export function generateAvatarUrl(seed: string, options?: AvatarOptions): string {
  const baseUrl = 'https://api.dicebear.com/9.x/notionists/svg'
  const params = new URLSearchParams()
  
  // Always include the seed
  params.append('seed', seed)
  
  if (!options) {
    return `${baseUrl}?${params.toString()}`
  }
  
  // Add probability options
  if (options.beardProbability !== undefined) {
    params.append('beardProbability', options.beardProbability.toString())
  }
  if (options.glassesProbability !== undefined) {
    params.append('glassesProbability', options.glassesProbability.toString())
  }
  if (options.gestureProbability !== undefined) {
    params.append('gestureProbability', options.gestureProbability.toString())
  }
  if (options.bodyIconProbability !== undefined) {
    params.append('bodyIconProbability', options.bodyIconProbability.toString())
  }
  
  // Add array options (multiple values)
  if (options.beard && options.beard.length > 0) {
    params.append('beard', options.beard.join(','))
  }
  if (options.body && options.body.length > 0) {
    params.append('body', options.body.join(','))
  }
  if (options.bodyIcon && options.bodyIcon.length > 0) {
    params.append('bodyIcon', options.bodyIcon.join(','))
  }
  if (options.brows && options.brows.length > 0) {
    params.append('brows', options.brows.join(','))
  }
  if (options.eyes && options.eyes.length > 0) {
    params.append('eyes', options.eyes.join(','))
  }
  if (options.gesture && options.gesture.length > 0) {
    params.append('gesture', options.gesture.join(','))
  }
  if (options.glasses && options.glasses.length > 0) {
    params.append('glasses', options.glasses.join(','))
  }
  if (options.hair && options.hair.length > 0) {
    params.append('hair', options.hair.join(','))
  }
  if (options.lips && options.lips.length > 0) {
    params.append('lips', options.lips.join(','))
  }
  if (options.nose && options.nose.length > 0) {
    params.append('nose', options.nose.join(','))
  }
  
  // Add visual options
  if (options.backgroundColor && options.backgroundColor.length > 0) {
    params.append('backgroundColor', options.backgroundColor.join(','))
  }
  if (options.backgroundType && options.backgroundType.length > 0) {
    params.append('backgroundType', options.backgroundType.join(','))
  }
  if (options.flip !== undefined) {
    params.append('flip', options.flip.toString())
  }
  if (options.rotate !== undefined) {
    params.append('rotate', options.rotate.toString())
  }
  if (options.scale !== undefined) {
    params.append('scale', options.scale.toString())
  }
  if (options.radius !== undefined) {
    params.append('radius', options.radius.toString())
  }
  if (options.size !== undefined) {
    params.append('size', options.size.toString())
  }
  
  return `${baseUrl}?${params.toString()}`
}

