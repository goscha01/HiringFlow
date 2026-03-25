'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { type BrandingConfig, DEFAULT_BRANDING, mergeBranding } from '@/lib/branding'

interface BrandingEditorProps {
  branding: Partial<BrandingConfig> | null
  onUpdate: (branding: BrandingConfig) => void
  flowName: string
  startMessage: string
  endMessage: string
}

const FONT_OPTIONS = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  { label: 'Roboto', value: 'Roboto, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif', url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap' },
  { label: 'Lato', value: 'Lato, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap' },
  { label: 'Poppins', value: 'Poppins, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap' },
  { label: 'Playfair Display', value: '"Playfair Display", serif', url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap' },
  { label: 'System Default', value: 'system-ui, -apple-system, sans-serif', url: '' },
]

const COLOR_PRESETS = [
  { name: 'Default Blue', primary: '#2563eb', bg: '#111827', text: '#ffffff', secondaryText: '#9ca3af', accent: '#3b82f6' },
  { name: 'Midnight', primary: '#6366f1', bg: '#0f0f23', text: '#e2e8f0', secondaryText: '#94a3b8', accent: '#818cf8' },
  { name: 'Forest', primary: '#059669', bg: '#064e3b', text: '#ecfdf5', secondaryText: '#6ee7b7', accent: '#34d399' },
  { name: 'Sunset', primary: '#ea580c', bg: '#1c1917', text: '#fef3c7', secondaryText: '#d6d3d1', accent: '#f97316' },
  { name: 'Rose', primary: '#e11d48', bg: '#1a1a2e', text: '#fce7f3', secondaryText: '#c4b5fd', accent: '#fb7185' },
  { name: 'Corporate', primary: '#1e40af', bg: '#ffffff', text: '#1e293b', secondaryText: '#64748b', accent: '#3b82f6' },
  { name: 'Minimal Light', primary: '#18181b', bg: '#fafafa', text: '#27272a', secondaryText: '#a1a1aa', accent: '#71717a' },
  { name: 'Purple Dream', primary: '#7c3aed', bg: '#0c0a1a', text: '#ede9fe', secondaryText: '#a78bfa', accent: '#a78bfa' },
]

const PATTERN_OPTIONS = [
  { name: 'None', value: '' },
  { name: 'Dots', value: 'dots' },
  { name: 'Grid', value: 'grid' },
  { name: 'Diagonal', value: 'diagonal' },
]

export default function BrandingEditor({ branding: rawBranding, onUpdate, flowName, startMessage, endMessage }: BrandingEditorProps) {
  // Local state for instant preview — debounced save to API
  const [config, setConfig] = useState<BrandingConfig>(() => mergeBranding(rawBranding))
  const [activeSection, setActiveSection] = useState<string>('colors')
  const [previewScreen, setPreviewScreen] = useState<'start' | 'step' | 'end'>('start')
  const [uploading, setUploading] = useState(false)
  const [savedPalettes, setSavedPalettes] = useState<Array<{ name: string; primary: string; bg: string; text: string; secondaryText?: string; accent: string }>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('hiringflow_palettes') || '[]') } catch { return [] }
  })
  const [newPaletteName, setNewPaletteName] = useState('')
  const [showSavePalette, setShowSavePalette] = useState(false)

  const savePalette = () => {
    if (!newPaletteName.trim()) return
    const palette = { name: newPaletteName.trim(), primary: config.colors.primary, bg: config.colors.background, text: config.colors.text, secondaryText: config.colors.secondaryText, accent: config.colors.accent }
    const updated = [...savedPalettes, palette]
    setSavedPalettes(updated)
    localStorage.setItem('hiringflow_palettes', JSON.stringify(updated))
    setNewPaletteName('')
    setShowSavePalette(false)
  }

  const deletePalette = (idx: number) => {
    const updated = savedPalettes.filter((_, i) => i !== idx)
    setSavedPalettes(updated)
    localStorage.setItem('hiringflow_palettes', JSON.stringify(updated))
  }
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from parent when rawBranding changes (e.g. flow switch)
  useEffect(() => {
    setConfig(mergeBranding(rawBranding))
  }, [JSON.stringify(rawBranding)])

  const update = useCallback((partial: Partial<BrandingConfig>) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        ...partial,
        colors: { ...prev.colors, ...(partial.colors || {}) },
        typography: { ...prev.typography, ...(partial.typography || {}) },
        buttons: { ...prev.buttons, ...(partial.buttons || {}) },
        background: { ...prev.background, ...(partial.background || {}) },
        startScreen: { ...prev.startScreen, ...(partial.startScreen || {}) },
        endScreen: { ...prev.endScreen, ...(partial.endScreen || {}) },
        layout: { ...prev.layout, ...(partial.layout || {}) },
      }
      // Debounced save to API
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => onUpdate(next), 800)
      return next
    })
  }, [onUpdate])

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'logo')
      const res = await fetch('/api/uploads/logo', { method: 'POST', body: formData })
      if (res.ok) {
        const { url } = await res.json()
        update({ logo: url })
      }
    } catch {}
    setUploading(false)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const sections = [
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'background', label: 'Background' },
    { id: 'logo', label: 'Logo' },
    { id: 'layout', label: 'Layout' },
    { id: 'screens', label: 'Screens' },
    { id: 'css', label: 'Custom CSS' },
  ]

  const headingSize = config.typography.headingSize === 'lg' ? '2rem' : config.typography.headingSize === 'sm' ? '1.25rem' : '1.5rem'
  const bodySize = config.typography.bodySize === 'lg' ? '1.125rem' : config.typography.bodySize === 'sm' ? '0.875rem' : '1rem'

  const getBackground = () => {
    if (config.background.type === 'gradient') {
      return `linear-gradient(${config.background.gradientDirection || 'to bottom'}, ${config.colors.background}, ${config.background.value})`
    }
    if (config.background.type === 'solid') return config.background.value || config.colors.background
    return config.colors.background
  }

  // Button preview style
  const btnPreviewStyle: React.CSSProperties = {
    backgroundColor: config.buttons.style === 'filled' ? config.colors.primary : 'transparent',
    color: config.buttons.style === 'filled' ? '#fff' : config.colors.primary,
    border: config.buttons.style === 'outline' ? `2px solid ${config.colors.primary}` : 'none',
    borderRadius: config.buttons.shape === 'pill' ? '9999px' : config.buttons.shape === 'square' ? '4px' : '12px',
    padding: config.buttons.size === 'compact' ? '8px 16px' : config.buttons.size === 'large' ? '16px 32px' : '12px 24px',
    fontSize: config.buttons.size === 'compact' ? '13px' : config.buttons.size === 'large' ? '16px' : '14px',
    fontFamily: config.typography.fontFamily,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left: Settings */}
      <div className="lg:w-1/2 space-y-4 overflow-y-auto max-h-[calc(100vh-14rem)]">
        {/* Section tabs */}
        <div className="flex flex-wrap gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                activeSection === s.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Colors */}
        {activeSection === 'colors' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Color Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => update({
                      colors: { primary: preset.primary, background: preset.bg, text: preset.text, secondaryText: preset.secondaryText, accent: preset.accent },
                      background: { ...config.background, value: preset.bg },
                    })}
                    className="p-2 rounded-lg border border-gray-200 hover:border-blue-400 transition-all text-left"
                  >
                    <div className="flex gap-1 mb-1">
                      <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: preset.primary }} />
                      <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: preset.bg }} />
                      <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: preset.accent }} />
                    </div>
                    <span className="text-[10px] text-gray-500">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Saved palettes */}
            {savedPalettes.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Saved Palettes</label>
                <div className="grid grid-cols-4 gap-2">
                  {savedPalettes.map((palette, idx) => (
                    <div key={idx} className="relative group">
                      <button
                        onClick={() => update({
                          colors: { primary: palette.primary, background: palette.bg, text: palette.text, secondaryText: palette.secondaryText || '#9ca3af', accent: palette.accent },
                          background: { ...config.background, value: palette.bg },
                        })}
                        className="w-full p-2 rounded-lg border border-gray-200 hover:border-blue-400 transition-all text-left"
                      >
                        <div className="flex gap-1 mb-1">
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.primary }} />
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.bg }} />
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.accent }} />
                        </div>
                        <span className="text-[10px] text-gray-500 truncate block">{palette.name}</span>
                      </button>
                      <button
                        onClick={() => deletePalette(idx)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save current as palette */}
            <div>
              {showSavePalette ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPaletteName}
                    onChange={(e) => setNewPaletteName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePalette()}
                    placeholder="Palette name"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button onClick={savePalette} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">Save</button>
                  <button onClick={() => { setShowSavePalette(false); setNewPaletteName('') }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSavePalette(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Save current colors as palette
                </button>
              )}
            </div>

            {[
              { key: 'primary' as const, label: 'Primary (buttons, links)' },
              { key: 'background' as const, label: 'Background' },
              { key: 'text' as const, label: 'Heading Text' },
              { key: 'secondaryText' as const, label: 'Secondary Text (subtitle, description)' },
              { key: 'accent' as const, label: 'Accent (highlights)' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={config.colors[key]}
                  onChange={(e) => {
                    const newColors = { ...config.colors, [key]: e.target.value }
                    // Sync background color with background.value
                    if (key === 'background') {
                      update({ colors: newColors, background: { ...config.background, value: e.target.value } })
                    } else {
                      update({ colors: newColors })
                    }
                  }}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <div className="flex-1">
                  <label className="text-xs text-gray-600">{label}</label>
                  <input
                    type="text"
                    value={config.colors[key]}
                    onChange={(e) => {
                      const newColors = { ...config.colors, [key]: e.target.value }
                      if (key === 'background') {
                        update({ colors: newColors, background: { ...config.background, value: e.target.value } })
                      } else {
                        update({ colors: newColors })
                      }
                    }}
                    className="w-full text-xs px-2 py-1 border border-gray-300 rounded font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Typography */}
        {activeSection === 'typography' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Font Family</label>
              <select
                value={config.typography.fontFamily}
                onChange={(e) => {
                  const font = FONT_OPTIONS.find(f => f.value === e.target.value)
                  update({ typography: { ...config.typography, fontFamily: e.target.value, fontUrl: font?.url } })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Heading Size</label>
                <div className="flex gap-1">
                  {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => update({ typography: { ...config.typography, headingSize: s } })}
                      className={`flex-1 py-1.5 text-xs rounded ${
                        config.typography.headingSize === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Body Size</label>
                <div className="flex gap-1">
                  {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => update({ typography: { ...config.typography, bodySize: s } })}
                      className={`flex-1 py-1.5 text-xs rounded ${
                        config.typography.bodySize === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        {activeSection === 'buttons' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Shape</label>
              <div className="flex gap-2">
                {(['rounded', 'pill', 'square'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ buttons: { ...config.buttons, shape: s } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.buttons.shape === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Size</label>
              <div className="flex gap-2">
                {(['compact', 'default', 'large'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ buttons: { ...config.buttons, size: s } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.buttons.size === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Style</label>
              <div className="flex gap-2">
                {(['filled', 'outline'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ buttons: { ...config.buttons, style: s } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.buttons.style === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Hover Effect</label>
              <div className="flex gap-2">
                {(['darken', 'lighten', 'lift'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ buttons: { ...config.buttons, hoverEffect: s } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.buttons.hoverEffect === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {/* Button preview */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex justify-center">
              <button style={btnPreviewStyle}>{config.startScreen.ctaText || 'Start Interview'}</button>
            </div>
          </div>
        )}

        {/* Background */}
        {activeSection === 'background' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Type</label>
              <div className="flex gap-2">
                {(['solid', 'gradient'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update({ background: { ...config.background, type: t } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.background.type === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {config.background.type === 'gradient' && (
              <>
                <div className="flex items-center gap-3">
                  <input type="color" value={config.colors.background} onChange={(e) => update({ colors: { ...config.colors, background: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border" />
                  <span className="text-xs text-gray-500">From</span>
                  <input type="color" value={config.background.value || '#000000'} onChange={(e) => update({ background: { ...config.background, value: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border" />
                  <span className="text-xs text-gray-500">To</span>
                </div>
                <select
                  value={config.background.gradientDirection || 'to bottom'}
                  onChange={(e) => update({ background: { ...config.background, gradientDirection: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="to bottom">Top to Bottom</option>
                  <option value="to right">Left to Right</option>
                  <option value="to bottom right">Diagonal</option>
                  <option value="135deg">135 degrees</option>
                </select>
              </>
            )}
            {config.background.type === 'solid' && (
              <div className="flex items-center gap-3">
                <input type="color" value={config.background.value || config.colors.background} onChange={(e) => update({ background: { ...config.background, value: e.target.value }, colors: { ...config.colors, background: e.target.value } })} className="w-8 h-8 rounded cursor-pointer border" />
                <input type="text" value={config.background.value || config.colors.background} onChange={(e) => update({ background: { ...config.background, value: e.target.value } })} className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded font-mono" />
              </div>
            )}
          </div>
        )}

        {/* Logo */}
        {activeSection === 'logo' && (
          <div className="space-y-4">
            {config.logo && (
              <div className="relative inline-block">
                <img src={config.logo} alt="Logo" className="max-h-16 rounded" />
                <button onClick={() => update({ logo: undefined })} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">x</button>
              </div>
            )}
            <div>
              <label className="block px-4 py-3 text-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                <span className="text-sm text-gray-600">{uploading ? 'Uploading...' : 'Upload Logo (PNG, SVG, JPG — max 2MB)'}</span>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Position on Start Screen</label>
              <div className="flex gap-2">
                {(['center', 'top-left'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ startScreen: { ...config.startScreen, logoPosition: p } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.startScreen.logoPosition === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {p.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Layout */}
        {activeSection === 'layout' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Video Position (Desktop)</label>
              <div className="flex gap-2">
                {(['left', 'center', 'right'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ layout: { ...config.layout, videoPosition: p } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.layout.videoPosition === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Question Panel Style</label>
              <div className="flex gap-2">
                {(['sidebar', 'overlay', 'below'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ layout: { ...config.layout, questionStyle: s } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.layout.questionStyle === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Progress Indicator</label>
              <div className="flex gap-2">
                {(['bar', 'steps', 'none'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ layout: { ...config.layout, progressIndicator: p } })}
                    className={`flex-1 py-2 text-xs capitalize rounded border ${
                      config.layout.progressIndicator === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Screens */}
        {activeSection === 'screens' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Start Button Text</label>
              <input
                type="text"
                value={config.startScreen.ctaText}
                onChange={(e) => update({ startScreen: { ...config.startScreen, ctaText: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Start Interview"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">End Screen — Redirect URL</label>
              <input
                type="url"
                value={config.endScreen.redirectUrl || ''}
                onChange={(e) => update({ endScreen: { ...config.endScreen, redirectUrl: e.target.value || undefined } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="https://yourcompany.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">End Screen — Button Text</label>
              <input
                type="text"
                value={config.endScreen.ctaText || ''}
                onChange={(e) => update({ endScreen: { ...config.endScreen, ctaText: e.target.value || undefined } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Back to Website"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">End Screen — Button URL</label>
              <input
                type="url"
                value={config.endScreen.ctaUrl || ''}
                onChange={(e) => update({ endScreen: { ...config.endScreen, ctaUrl: e.target.value || undefined } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="https://yourcompany.com/careers"
              />
            </div>
          </div>
        )}

        {/* Custom CSS */}
        {activeSection === 'css' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase block">Custom CSS (Advanced)</label>
            <p className="text-[10px] text-gray-400">Applied only to candidate-facing pages. Use .brand-* classes.</p>
            <textarea
              value={config.customCss || ''}
              onChange={(e) => update({ customCss: e.target.value })}
              rows={10}
              placeholder={`.brand-container {\n  /* your styles */\n}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Right: Live Preview */}
      <div className="lg:w-1/2">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500 uppercase">Preview</label>
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            {(['start', 'step', 'end'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPreviewScreen(s)}
                className={`px-3 py-1 text-xs capitalize ${
                  previewScreen === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {s === 'step' ? 'Video Step' : s === 'start' ? 'Start' : 'End'}
              </button>
            ))}
          </div>
        </div>
        <div
          className="rounded-lg border border-gray-200 overflow-hidden shadow-lg"
          style={{
            background: getBackground(),
            fontFamily: config.typography.fontFamily,
            minHeight: '420px',
          }}
        >
          {/* Start screen */}
          {previewScreen === 'start' && (
            <div className="flex flex-col items-center justify-center h-[420px] p-8 text-center">
              {config.logo && (
                <img
                  src={config.logo}
                  alt="Logo"
                  className={`max-h-12 mb-6 ${config.startScreen.logoPosition === 'top-left' ? 'self-start' : ''}`}
                />
              )}
              <h1 style={{ color: config.colors.text, fontSize: headingSize, fontWeight: 600, marginBottom: '0.5rem' }}>
                {flowName || 'Flow Name'}
              </h1>
              <p style={{ color: config.colors.secondaryText, fontSize: bodySize, marginBottom: '2rem' }}>
                {startMessage}
              </p>
              <button style={btnPreviewStyle}>
                {config.startScreen.ctaText || 'Start Interview'}
              </button>
            </div>
          )}

          {/* Video step screen */}
          {previewScreen === 'step' && (
            <div className="flex h-[420px]">
              {/* Video area */}
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-[280px] bg-black/40 rounded-lg aspect-video flex items-center justify-center">
                  <svg className="w-12 h-12 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              {/* Questions sidebar */}
              {config.layout.questionStyle === 'sidebar' ? (
                <div className="w-[180px] bg-white/95 p-4 flex flex-col justify-center">
                  <p style={{ fontSize: '11px', color: config.colors.primary, fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sample Step
                  </p>
                  <p style={{ fontSize: '13px', color: '#1f2937', fontWeight: 500, marginBottom: '12px' }}>
                    What are your expectations?
                  </p>
                  {['Growth opportunity', 'Team culture', 'Compensation'].map((opt, i) => (
                    <button
                      key={i}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        marginBottom: '6px',
                        fontSize: '11px',
                        borderRadius: config.buttons.shape === 'pill' ? '9999px' : config.buttons.shape === 'square' ? '3px' : '8px',
                        border: `1.5px solid ${i === 0 ? config.colors.primary : '#e5e7eb'}`,
                        backgroundColor: i === 0 ? `${config.colors.primary}10` : 'white',
                        color: i === 0 ? config.colors.primary : '#374151',
                        fontWeight: i === 0 ? 500 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : config.layout.questionStyle === 'overlay' ? (
                <div className="absolute bottom-0 left-0 right-0 p-4" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                  <p style={{ fontSize: '12px', color: '#fff', fontWeight: 500, marginBottom: '8px' }}>What are your expectations?</p>
                  {['Growth opportunity', 'Team culture'].map((opt, i) => (
                    <button key={i} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: '4px', fontSize: '11px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', backgroundColor: 'transparent', cursor: 'pointer' }}>{opt}</button>
                  ))}
                </div>
              ) : (
                <div className="absolute bottom-0 left-0 right-0 bg-white p-4">
                  <p style={{ fontSize: '12px', color: '#1f2937', fontWeight: 500, marginBottom: '8px' }}>What are your expectations?</p>
                  {['Growth opportunity', 'Team culture'].map((opt, i) => (
                    <button key={i} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: '4px', fontSize: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: 'white', cursor: 'pointer' }}>{opt}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* End screen */}
          {previewScreen === 'end' && (
            <div className="flex flex-col items-center justify-center h-[420px] p-8 text-center">
              {config.logo && (
                <img src={config.logo} alt="Logo" className="max-h-10 mb-6" />
              )}
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto" style={{ color: config.colors.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 style={{ color: config.colors.text, fontSize: headingSize, fontWeight: 600, marginBottom: '0.5rem' }}>
                All Done!
              </h1>
              <p style={{ color: config.colors.secondaryText, fontSize: bodySize, marginBottom: '2rem', maxWidth: '320px' }}>
                {endMessage}
              </p>
              {(config.endScreen.ctaText || config.endScreen.redirectUrl) && (
                <button style={btnPreviewStyle}>
                  {config.endScreen.ctaText || 'Back to Website'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
