'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { type BrandingConfig, type LogoPosition, DEFAULT_BRANDING, DEFAULT_LOGO_SETTINGS, mergeBranding } from '@/lib/branding'

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
  const [previewScreen, setPreviewScreen] = useState<'start' | 'form' | 'step' | 'end'>('start')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [uploading, setUploading] = useState(false)
  const [savedPalettes, setSavedPalettes] = useState<Array<{ name: string; primary: string; bg: string; text: string; secondaryText?: string; accent: string }>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('hiringflow_palettes') || '[]') } catch { return [] }
  })
  const [newPaletteName, setNewPaletteName] = useState('')
  const [showSavePalette, setShowSavePalette] = useState(false)
  const [editingPaletteIdx, setEditingPaletteIdx] = useState<number | null>(null)
  const [colorsBeforeEdit, setColorsBeforeEdit] = useState<BrandingConfig['colors'] | null>(null)
  const [draggingLogo, setDraggingLogo] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const logoDragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  const screenKey = previewScreen === 'start' || previewScreen === 'form' ? 'startScreen' : previewScreen === 'step' ? 'stepScreen' : 'endScreen'
  const currentLogoSettings = config.logoSettings?.[screenKey] || DEFAULT_LOGO_SETTINGS![screenKey]

  const handleLogoDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setDraggingLogo(true)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    logoDragStart.current = {
      x: clientX, y: clientY,
      startX: currentLogoSettings.position.x,
      startY: currentLogoSettings.position.y,
    }
  }

  useEffect(() => {
    if (!draggingLogo) return
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!logoDragStart.current || !previewRef.current) return
      const rect = previewRef.current.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const dx = ((clientX - logoDragStart.current.x) / rect.width) * 100
      const dy = ((clientY - logoDragStart.current.y) / rect.height) * 100
      const newX = Math.max(5, Math.min(95, logoDragStart.current.startX + dx))
      const newY = Math.max(3, Math.min(90, logoDragStart.current.startY + dy))
      const newSettings = { ...config.logoSettings || DEFAULT_LOGO_SETTINGS! }
      newSettings[screenKey] = { ...newSettings[screenKey], position: { x: newX, y: newY } }
      update({ logoSettings: newSettings })
    }
    const handleEnd = () => { setDraggingLogo(false); logoDragStart.current = null }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [draggingLogo, config.logoSettings, screenKey])

  const toggleLogoForScreen = (screen: 'startScreen' | 'stepScreen' | 'endScreen') => {
    const newSettings = { ...config.logoSettings || DEFAULT_LOGO_SETTINGS! }
    newSettings[screen] = { ...newSettings[screen], enabled: !newSettings[screen].enabled }
    update({ logoSettings: newSettings })
  }

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
    { id: 'form', label: 'Form' },
    { id: 'logo', label: 'Logo' },
    { id: 'layout', label: 'Layout' },
    { id: 'screens', label: 'Screens' },
    { id: 'css', label: 'Custom CSS' },
  ]

  const getNumericSize = (size: number | 'sm' | 'md' | 'lg', fallback: number): number => {
    if (typeof size === 'number') return size
    const map = { sm: fallback - 4, md: fallback, lg: fallback + 8 }
    return map[size] || fallback
  }

  const headingSize = `${getNumericSize(config.typography.headingSize, 24)}px`
  const bodySize = `${getNumericSize(config.typography.bodySize, 16)}px`

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
                        onClick={() => {
                          // Save current colors so we can cancel
                          setColorsBeforeEdit({ ...config.colors })
                          setEditingPaletteIdx(idx)
                          update({
                            colors: { primary: palette.primary, background: palette.bg, text: palette.text, secondaryText: palette.secondaryText || '#9ca3af', accent: palette.accent },
                            background: { ...config.background, value: palette.bg },
                          })
                        }}
                        className={`w-full p-2 rounded-lg border transition-all text-left ${
                          editingPaletteIdx === idx ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex gap-1 mb-1">
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.primary }} />
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.bg }} />
                          <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: palette.accent }} />
                        </div>
                        <span className="text-[10px] text-gray-500 truncate block">{palette.name}</span>
                      </button>
                      {editingPaletteIdx !== idx && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePalette(idx) }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Update / Cancel bar when editing a palette */}
                {editingPaletteIdx !== null && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-xs text-blue-700 flex-1">
                      Editing <strong>{savedPalettes[editingPaletteIdx]?.name}</strong> — adjust colors below then update
                    </span>
                    <button
                      onClick={() => {
                        // Overwrite the palette with current colors
                        const updated = savedPalettes.map((p, i) =>
                          i === editingPaletteIdx
                            ? { ...p, primary: config.colors.primary, bg: config.colors.background, text: config.colors.text, secondaryText: config.colors.secondaryText, accent: config.colors.accent }
                            : p
                        )
                        setSavedPalettes(updated)
                        localStorage.setItem('hiringflow_palettes', JSON.stringify(updated))
                        setEditingPaletteIdx(null)
                        setColorsBeforeEdit(null)
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => {
                        // Revert to colors before editing
                        if (colorsBeforeEdit) {
                          update({ colors: colorsBeforeEdit, background: { ...config.background, value: colorsBeforeEdit.background } })
                        }
                        setEditingPaletteIdx(null)
                        setColorsBeforeEdit(null)
                      }}
                      className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
            {/* Load Google Fonts */}
            {FONT_OPTIONS.filter(f => f.url).map((f) => (
              <link key={f.value} rel="stylesheet" href={f.url} />
            ))}

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Font Family</label>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-1">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => update({ typography: { ...config.typography, fontFamily: f.value, fontUrl: f.url } })}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      config.typography.fontFamily === f.value
                        ? 'bg-blue-50 border border-blue-300 text-blue-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                    style={{ fontFamily: f.value }}
                  >
                    <span className="text-sm">{f.label}</span>
                    <span className="block text-xs text-gray-400" style={{ fontFamily: f.value }}>
                      The quick brown fox jumps over the lazy dog
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Heading Size (px)</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => update({ typography: { ...config.typography, headingSize: Math.max(14, getNumericSize(config.typography.headingSize, 24) - 1) } })}
                    className="w-7 h-7 flex items-center justify-center text-sm border border-gray-300 rounded hover:bg-gray-100"
                  >−</button>
                  <input
                    type="number"
                    min={14}
                    max={48}
                    value={getNumericSize(config.typography.headingSize, 24)}
                    onChange={(e) => update({ typography: { ...config.typography, headingSize: Math.max(14, Math.min(48, Number(e.target.value) || 24)) } })}
                    className="w-14 text-center text-sm px-1 py-1.5 border border-gray-300 rounded"
                  />
                  <button
                    onClick={() => update({ typography: { ...config.typography, headingSize: Math.min(48, getNumericSize(config.typography.headingSize, 24) + 1) } })}
                    className="w-7 h-7 flex items-center justify-center text-sm border border-gray-300 rounded hover:bg-gray-100"
                  >+</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Body Size (px)</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => update({ typography: { ...config.typography, bodySize: Math.max(10, getNumericSize(config.typography.bodySize, 16) - 1) } })}
                    className="w-7 h-7 flex items-center justify-center text-sm border border-gray-300 rounded hover:bg-gray-100"
                  >−</button>
                  <input
                    type="number"
                    min={10}
                    max={24}
                    value={getNumericSize(config.typography.bodySize, 16)}
                    onChange={(e) => update({ typography: { ...config.typography, bodySize: Math.max(10, Math.min(24, Number(e.target.value) || 16)) } })}
                    className="w-14 text-center text-sm px-1 py-1.5 border border-gray-300 rounded"
                  />
                  <button
                    onClick={() => update({ typography: { ...config.typography, bodySize: Math.min(24, getNumericSize(config.typography.bodySize, 16) + 1) } })}
                    className="w-7 h-7 flex items-center justify-center text-sm border border-gray-300 rounded hover:bg-gray-100"
                  >+</button>
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
            {/* Button preview — normal + hover side by side */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <span className="text-[10px] text-gray-400 block mb-2">Normal</span>
                  <button style={btnPreviewStyle}>{config.startScreen.ctaText || 'Start Interview'}</button>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-gray-400 block mb-2">Hover</span>
                  <button style={{
                    ...btnPreviewStyle,
                    ...(config.buttons.hoverEffect === 'darken' && {
                      filter: 'brightness(0.85)',
                    }),
                    ...(config.buttons.hoverEffect === 'lighten' && {
                      filter: 'brightness(1.2)',
                    }),
                    ...(config.buttons.hoverEffect === 'lift' && {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }),
                  }}>{config.startScreen.ctaText || 'Start Interview'}</button>
                </div>
              </div>
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

        {/* Form */}
        {activeSection === 'form' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Form Position</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'before-video' as const, label: 'Before Video', desc: 'Full screen before playback' },
                  { key: 'after-video' as const, label: 'After Video', desc: 'Shows after video ends' },
                  { key: 'overlay' as const, label: 'Overlay', desc: 'Over the video' },
                  { key: 'sidebar' as const, label: 'Sidebar', desc: 'Next to the video' },
                ]).map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => update({ form: { ...config.form, position: key } })}
                    className={`p-2 rounded-lg border text-left ${
                      config.form.position === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`text-xs font-medium ${config.form.position === key ? 'text-blue-700' : 'text-gray-700'}`}>{label}</span>
                    <span className="text-[10px] text-gray-400 block">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Form Style</label>
              <div className="flex gap-2">
                {([
                  { key: 'card' as const, label: 'Card' },
                  { key: 'minimal' as const, label: 'Minimal' },
                  { key: 'floating' as const, label: 'Floating' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => update({ form: { ...config.form, style: key } })}
                    className={`flex-1 py-2 text-xs rounded border ${
                      config.form.style === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Input Style</label>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { key: 'rounded' as const, label: 'Rounded' },
                  { key: 'pill' as const, label: 'Pill' },
                  { key: 'square' as const, label: 'Square' },
                  { key: 'underline' as const, label: 'Underline' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => update({ form: { ...config.form, inputStyle: key } })}
                    className={`py-2 text-xs rounded border ${
                      config.form.inputStyle === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Label Position</label>
              <div className="flex gap-2">
                {([
                  { key: 'above' as const, label: 'Above' },
                  { key: 'floating' as const, label: 'Floating' },
                  { key: 'inline' as const, label: 'Inline' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => update({ form: { ...config.form, labelPosition: key } })}
                    className={`flex-1 py-2 text-xs rounded border ${
                      config.form.labelPosition === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input type="color" value={config.form.backgroundColor} onChange={(e) => update({ form: { ...config.form, backgroundColor: e.target.value } })} className="w-7 h-7 rounded cursor-pointer border border-gray-300" />
                <div>
                  <label className="text-[10px] text-gray-500 block">Background</label>
                  <input type="text" value={config.form.backgroundColor} onChange={(e) => update({ form: { ...config.form, backgroundColor: e.target.value } })} className="w-full text-[10px] px-1 py-0.5 border border-gray-300 rounded font-mono" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={config.form.textColor} onChange={(e) => update({ form: { ...config.form, textColor: e.target.value } })} className="w-7 h-7 rounded cursor-pointer border border-gray-300" />
                <div>
                  <label className="text-[10px] text-gray-500 block">Text</label>
                  <input type="text" value={config.form.textColor} onChange={(e) => update({ form: { ...config.form, textColor: e.target.value } })} className="w-full text-[10px] px-1 py-0.5 border border-gray-300 rounded font-mono" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Submit Button Text</label>
              <input
                type="text"
                value={config.form.submitText}
                onChange={(e) => update({ form: { ...config.form, submitText: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Continue"
              />
            </div>

            {/* Form preview */}
            <div className="p-4 rounded-lg border border-gray-200" style={{ backgroundColor: config.form.backgroundColor }}>
              <span className="text-[10px] text-gray-400 uppercase block mb-3">Form Preview</span>
              {['Full Name', 'Email'].map((field) => {
                const inputBorder = config.form.inputStyle === 'underline'
                  ? { borderBottom: '2px solid #d1d5db', borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }
                  : {
                      border: '1px solid #d1d5db',
                      borderRadius: config.form.inputStyle === 'pill' ? '9999px' : config.form.inputStyle === 'square' ? '2px' : '8px',
                    }
                return (
                  <div key={field} className="mb-3">
                    {config.form.labelPosition === 'above' && (
                      <label className="text-xs font-medium mb-1 block" style={{ color: config.form.textColor }}>{field}</label>
                    )}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={config.form.labelPosition !== 'above' ? field : ''}
                        readOnly
                        className="w-full px-3 py-2 text-sm bg-transparent outline-none"
                        style={{ ...inputBorder, color: config.form.textColor }}
                      />
                      {config.form.labelPosition === 'floating' && (
                        <span className="absolute -top-2 left-3 text-[10px] px-1" style={{ color: config.colors.primary, backgroundColor: config.form.backgroundColor }}>{field}</span>
                      )}
                    </div>
                  </div>
                )
              })}
              <button style={{
                ...btnPreviewStyle,
                width: '100%',
                marginTop: '4px',
              }}>
                {config.form.submitText || 'Continue'}
              </button>
            </div>
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
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Video Format</label>
              <div className="flex gap-2">
                {([
                  { key: 'horizontal' as const, label: 'Horizontal', icon: '▬' },
                  { key: 'vertical' as const, label: 'Vertical', icon: '▮' },
                  { key: 'square' as const, label: 'Square', icon: '■' },
                ]).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => update({ layout: { ...config.layout, videoAspect: key } })}
                    className={`flex-1 py-2 text-xs rounded border flex flex-col items-center gap-1 ${
                      config.layout.videoAspect === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Question Panel (Desktop)</label>
              <div className="flex gap-2">
                {(['sidebar', 'overlay'] as const).map((s) => (
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
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase">Preview</label>
            {/* Device toggle */}
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              <button
                onClick={() => setPreviewDevice('desktop')}
                className={`px-2 py-1 ${previewDevice === 'desktop' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Desktop"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5"/><path d="M8 21h8M12 17v4" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button
                onClick={() => setPreviewDevice('mobile')}
                className={`px-2 py-1 ${previewDevice === 'mobile' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Mobile"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="3" strokeWidth="1.5"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Logo toggle for current screen */}
            {config.logo && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <button
                  onClick={() => toggleLogoForScreen(screenKey)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    currentLogoSettings.enabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                    currentLogoSettings.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-[10px] text-gray-500">Logo</span>
              </label>
            )}
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              {(['start', 'form', 'step', 'end'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPreviewScreen(s)}
                  className={`px-2.5 py-1 text-xs capitalize ${
                    previewScreen === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {s === 'step' ? 'Video' : s === 'start' ? 'Start' : s === 'form' ? 'Form' : 'End'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview frame */}
        <div className={`flex justify-center ${previewDevice === 'mobile' ? 'py-4 bg-gray-100 rounded-lg' : ''}`}>
        <div
          ref={previewRef}
          className={`rounded-lg border border-gray-200 overflow-hidden shadow-lg relative transition-all ${
            previewDevice === 'mobile' ? 'w-[280px] rounded-[24px] border-[6px] border-gray-800' : 'w-full'
          }`}
          style={{
            background: getBackground(),
            fontFamily: config.typography.fontFamily,
            minHeight: previewDevice === 'mobile' ? '500px' : '420px',
          }}
        >
          {/* Draggable logo overlay — absolute positioned */}
          {config.logo && currentLogoSettings.enabled && (
            <div
              onMouseDown={handleLogoDragStart}
              onTouchStart={handleLogoDragStart}
              className={`absolute z-10 cursor-grab active:cursor-grabbing ${draggingLogo ? 'opacity-70' : ''}`}
              style={{
                left: `${currentLogoSettings.position.x}%`,
                top: `${currentLogoSettings.position.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <img src={config.logo} alt="Logo" className="max-h-10 pointer-events-none" />
              <div className="text-[8px] text-center text-white/40 mt-0.5">drag to move</div>
            </div>
          )}

          {/* Start screen */}
          {previewScreen === 'start' && (
            <div className={`flex flex-col items-center justify-center ${previewDevice === 'mobile' ? 'h-[500px] p-5' : 'h-[420px] p-8'} text-center`}>
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

          {/* Form screen */}
          {previewScreen === 'form' && (() => {
            const inputBorderStyle = config.form.inputStyle === 'underline'
              ? { borderBottom: `2px solid ${config.colors.accent}40`, borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }
              : {
                  border: '1px solid #d1d5db',
                  borderRadius: config.form.inputStyle === 'pill' ? '9999px' : config.form.inputStyle === 'square' ? '2px' : '8px',
                }
            const formContainer: React.CSSProperties = config.form.style === 'card'
              ? { backgroundColor: config.form.backgroundColor, borderRadius: '16px', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)', maxWidth: '320px', width: '100%' }
              : config.form.style === 'floating'
              ? { backgroundColor: config.form.backgroundColor, borderRadius: '24px', padding: '28px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: `1px solid ${config.colors.accent}30`, maxWidth: '300px', width: '100%' }
              : { maxWidth: '300px', width: '100%', padding: '24px' }

            return (
              <div className={`flex items-center justify-center ${previewDevice === 'mobile' ? 'h-[500px]' : 'h-[420px]'} p-6`}>
                <div style={formContainer}>
                  <h2 style={{ color: config.form.style === 'minimal' ? config.colors.text : config.form.textColor, fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                    {flowName || 'Flow Name'}
                  </h2>
                  <p style={{ color: config.form.style === 'minimal' ? config.colors.secondaryText : config.form.textColor, opacity: 0.6, fontSize: '12px', marginBottom: '20px' }}>
                    Please fill in your details
                  </p>
                  {['Full Name', 'Email', 'Phone'].map((field) => (
                    <div key={field} className="mb-3 relative">
                      {config.form.labelPosition === 'above' && (
                        <label className="text-[11px] font-medium mb-1 block" style={{ color: config.form.style === 'minimal' ? config.colors.text : config.form.textColor }}>{field}</label>
                      )}
                      <input
                        type="text"
                        readOnly
                        placeholder={config.form.labelPosition !== 'above' ? field : ''}
                        className="w-full px-3 py-2 text-xs bg-transparent outline-none"
                        style={{ ...inputBorderStyle, color: config.form.style === 'minimal' ? config.colors.text : config.form.textColor }}
                      />
                      {config.form.labelPosition === 'floating' && (
                        <span className="absolute -top-2 left-3 text-[9px] px-1" style={{ color: config.colors.primary, backgroundColor: config.form.style === 'minimal' ? 'transparent' : config.form.backgroundColor }}>{field}</span>
                      )}
                    </div>
                  ))}
                  <button style={{ ...btnPreviewStyle, width: '100%', marginTop: '8px', fontSize: '13px' }}>
                    {config.form.submitText || 'Continue'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Video step screen */}
          {previewScreen === 'step' && (() => {
            const isMobile = previewDevice === 'mobile'
            const isOverlay = config.layout.questionStyle === 'overlay'
            // Mobile: always overlay. Desktop: sidebar or overlay.
            const useOverlay = isMobile || isOverlay

            const questionOptions = ['Growth opportunity', 'Team culture', 'Compensation']
            const optBtnRadius = config.buttons.shape === 'pill' ? '9999px' : config.buttons.shape === 'square' ? '3px' : '8px'

            const renderOptions = (dark: boolean) => (
              <>
                <p style={{ fontSize: '11px', color: dark ? '#fff' : config.colors.primary, fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sample Step
                </p>
                <p style={{ fontSize: '12px', color: dark ? '#fff' : '#1f2937', fontWeight: 500, marginBottom: '10px' }}>
                  What are your expectations?
                </p>
                {questionOptions.map((opt, i) => (
                  <button
                    key={i}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', marginBottom: '5px', fontSize: '11px',
                      borderRadius: optBtnRadius,
                      border: dark ? '1px solid rgba(255,255,255,0.3)' : `1.5px solid ${i === 0 ? config.colors.primary : '#e5e7eb'}`,
                      backgroundColor: dark ? 'transparent' : (i === 0 ? `${config.colors.primary}10` : 'white'),
                      color: dark ? '#fff' : (i === 0 ? config.colors.primary : '#374151'),
                      fontWeight: i === 0 ? 500 : 400, cursor: 'pointer',
                    }}
                  >{opt}</button>
                ))}
              </>
            )

            return (
            <div className={`relative ${isMobile ? 'h-[500px]' : 'h-[420px]'} ${useOverlay ? '' : 'flex'}`}>
              {/* Video area — centered vertically, full screen on mobile */}
              {isMobile ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className={`bg-black/40 rounded-lg flex items-center justify-center ${
                    config.layout.videoAspect === 'vertical' ? 'w-full h-full' :
                    config.layout.videoAspect === 'square' ? 'w-[260px] aspect-square' :
                    'w-full aspect-video'
                  }`}>
                    <svg className="w-12 h-12 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              ) : (
              <div className={`flex-1 flex items-center justify-center p-4 ${
                !useOverlay && config.layout.videoPosition === 'right' ? 'order-2' : ''
              }`}>
                <div className={`bg-black/40 rounded-lg flex items-center justify-center ${
                  config.layout.videoAspect === 'vertical' ? 'w-[140px] aspect-[9/16]' :
                  config.layout.videoAspect === 'square' ? 'w-[200px] aspect-square' :
                  'w-full max-w-[280px] aspect-video'
                }`}>
                  <svg className="w-10 h-10 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              )}

              {/* Questions panel */}
              {useOverlay ? (
                <div className="absolute bottom-0 left-0 right-0 p-3" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
                  {renderOptions(true)}
                </div>
              ) : (
                <div className={`w-[170px] bg-white/95 p-3 flex flex-col justify-center ${
                  config.layout.videoPosition === 'right' ? 'order-1' : ''
                }`}>
                  {renderOptions(false)}
                </div>
              )}
            </div>
            )
          })()}

          {/* End screen */}
          {previewScreen === 'end' && (
            <div className={`flex flex-col items-center justify-center ${previewDevice === 'mobile' ? 'h-[500px] p-5' : 'h-[420px] p-8'} text-center`}>
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
        </div>{/* close preview frame */}
      </div>
    </div>
  )
}
