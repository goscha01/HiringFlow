export interface BrandingConfig {
  logo?: string
  colors: {
    primary: string
    background: string
    text: string
    secondaryText: string
    accent: string
  }
  typography: {
    fontFamily: string
    fontUrl?: string
    headingSize: number | 'sm' | 'md' | 'lg'
    bodySize: number | 'sm' | 'md' | 'lg'
  }
  buttons: {
    shape: 'rounded' | 'pill' | 'square'
    size: 'compact' | 'default' | 'large'
    style: 'filled' | 'outline'
    hoverEffect: 'darken' | 'lighten' | 'lift'
  }
  background: {
    type: 'solid' | 'gradient' | 'image' | 'pattern'
    value: string
    overlay?: number
    gradientDirection?: string
  }
  startScreen: {
    logoPosition: 'center' | 'top-left'
    ctaText: string
    backgroundOverride?: string
  }
  endScreen: {
    redirectUrl?: string
    ctaText?: string
    ctaUrl?: string
  }
  layout: {
    videoPosition: 'left' | 'center' | 'right'
    questionStyle: 'sidebar' | 'overlay' | 'below'
    progressIndicator: 'bar' | 'steps' | 'none'
  }
  customCss?: string
}

export const DEFAULT_BRANDING: BrandingConfig = {
  colors: {
    primary: '#2563eb',
    background: '#111827',
    text: '#ffffff',
    secondaryText: '#9ca3af',
    accent: '#3b82f6',
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    headingSize: 'md',
    bodySize: 'md',
  },
  buttons: {
    shape: 'rounded',
    size: 'default',
    style: 'filled',
    hoverEffect: 'darken',
  },
  background: {
    type: 'solid',
    value: '#111827',
  },
  startScreen: {
    logoPosition: 'center',
    ctaText: 'Start Interview',
  },
  endScreen: {},
  layout: {
    videoPosition: 'left',
    questionStyle: 'sidebar',
    progressIndicator: 'none',
  },
}

// Helper to merge partial branding with defaults
export function mergeBranding(partial?: Partial<BrandingConfig> | null): BrandingConfig {
  if (!partial) return { ...DEFAULT_BRANDING }
  return {
    ...DEFAULT_BRANDING,
    ...partial,
    colors: { ...DEFAULT_BRANDING.colors, ...partial.colors },
    typography: { ...DEFAULT_BRANDING.typography, ...partial.typography },
    buttons: { ...DEFAULT_BRANDING.buttons, ...partial.buttons },
    background: { ...DEFAULT_BRANDING.background, ...partial.background },
    startScreen: { ...DEFAULT_BRANDING.startScreen, ...partial.startScreen },
    endScreen: { ...DEFAULT_BRANDING.endScreen, ...partial.endScreen },
    layout: { ...DEFAULT_BRANDING.layout, ...partial.layout },
  }
}

// Generate CSS variables from branding
export function brandingToCssVars(branding: BrandingConfig): Record<string, string> {
  const headingSizes = { sm: '1.25rem', md: '1.5rem', lg: '2rem' }
  const bodySizes = { sm: '0.875rem', md: '1rem', lg: '1.125rem' }
  const borderRadius = { rounded: '0.75rem', pill: '9999px', square: '0.25rem' }
  const btnPadding = { compact: '0.5rem 1rem', default: '0.75rem 1.5rem', large: '1rem 2rem' }

  return {
    '--brand-primary': branding.colors.primary,
    '--brand-bg': branding.colors.background,
    '--brand-text': branding.colors.text,
    '--brand-accent': branding.colors.accent,
    '--brand-font': branding.typography.fontFamily,
    '--brand-heading-size': typeof branding.typography.headingSize === 'number' ? `${branding.typography.headingSize}px` : headingSizes[branding.typography.headingSize],
    '--brand-body-size': typeof branding.typography.bodySize === 'number' ? `${branding.typography.bodySize}px` : bodySizes[branding.typography.bodySize],
    '--brand-btn-radius': borderRadius[branding.buttons.shape],
    '--brand-btn-padding': btnPadding[branding.buttons.size],
  }
}
