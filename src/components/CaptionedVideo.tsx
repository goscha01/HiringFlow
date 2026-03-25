'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface Segment {
  start: number
  end: number
  text: string
}

export interface CaptionStyle {
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  position: 'bottom' | 'top' | 'custom'
  // Custom position as percentage (0-100)
  customX?: number
  customY?: number
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 16,
  color: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  position: 'bottom',
  customX: 50,
  customY: 85,
}

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
]

interface CaptionedVideoProps {
  src: string
  segments: Segment[]
  captionsEnabled: boolean
  captionStyle?: CaptionStyle
  onStyleChange?: (style: CaptionStyle) => void
  showStyleEditor?: boolean
  autoPlay?: boolean
  onEnded?: () => void
  className?: string
}

export default function CaptionedVideo({
  src,
  segments,
  captionsEnabled,
  captionStyle = DEFAULT_CAPTION_STYLE,
  onStyleChange,
  showStyleEditor = false,
  autoPlay = false,
  onEnded,
  className,
}: CaptionedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [])

  const currentSegment = captionsEnabled
    ? segments.find((s) => currentTime >= s.start && currentTime <= s.end)
    : null

  // Draggable caption logic
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!onStyleChange) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startX: captionStyle.customX ?? 50,
      startY: captionStyle.customY ?? 85,
    }
  }, [captionStyle, onStyleChange])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current || !containerRef.current) return
      const container = containerRef.current.getBoundingClientRect()

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      const deltaXPercent = ((clientX - dragStartRef.current.x) / container.width) * 100
      const deltaYPercent = ((clientY - dragStartRef.current.y) / container.height) * 100

      const newX = Math.max(5, Math.min(95, dragStartRef.current.startX + deltaXPercent))
      const newY = Math.max(5, Math.min(95, dragStartRef.current.startY + deltaYPercent))

      onStyleChange?.({
        ...captionStyle,
        position: 'custom',
        customX: newX,
        customY: newY,
      })
    }

    const handleEnd = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }

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
  }, [isDragging, captionStyle, onStyleChange])

  // Caption position styles
  const getCaptionPositionStyle = (): React.CSSProperties => {
    if (captionStyle.position === 'custom') {
      return {
        position: 'absolute',
        left: `${captionStyle.customX ?? 50}%`,
        top: `${captionStyle.customY ?? 85}%`,
        transform: 'translate(-50%, -50%)',
      }
    }
    if (captionStyle.position === 'top') {
      return {
        position: 'absolute',
        left: '50%',
        top: '48px',
        transform: 'translateX(-50%)',
      }
    }
    return {
      position: 'absolute',
      left: '50%',
      bottom: '48px',
      transform: 'translateX(-50%)',
    }
  }

  return (
    <div className="relative">
      {/* Video */}
      <div ref={containerRef} className={`relative rounded-md overflow-hidden bg-black ${className || ''}`}>
        <video
          ref={videoRef}
          src={src}
          className="w-full"
          controls
          preload="metadata"
          autoPlay={autoPlay}
          onEnded={onEnded}
        />

        {/* Caption overlay — draggable */}
        {currentSegment && (
          <div
            ref={captionRef}
            style={getCaptionPositionStyle()}
            className={`px-4 max-w-[90%] z-10 ${
              onStyleChange ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
            } ${isDragging ? 'opacity-80' : ''}`}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <span
              style={{
                fontFamily: captionStyle.fontFamily,
                fontSize: `${captionStyle.fontSize}px`,
                color: captionStyle.color,
                backgroundColor: captionStyle.backgroundColor,
                padding: '4px 12px',
                borderRadius: '4px',
                textAlign: 'center',
                lineHeight: 1.4,
                display: 'inline-block',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {currentSegment.text}
            </span>
          </div>
        )}

        {/* Drag hint — show when captions enabled and editable */}
        {captionsEnabled && onStyleChange && !currentSegment && segments.length > 0 && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 bg-black/40 px-2 py-0.5 rounded pointer-events-none">
            Drag captions to reposition
          </div>
        )}
      </div>

      {/* Caption style editor */}
      {showStyleEditor && captionsEnabled && (
        <div className="mt-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Caption Style
          </button>

          {showSettings && onStyleChange && (
            <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200 space-y-3">
              {/* Font */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">Font</label>
                <select
                  value={captionStyle.fontFamily}
                  onChange={(e) => onStyleChange({ ...captionStyle, fontFamily: e.target.value })}
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">Size</label>
                <input
                  type="range"
                  min={10}
                  max={32}
                  value={captionStyle.fontSize}
                  onChange={(e) => onStyleChange({ ...captionStyle, fontSize: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-500 w-8">{captionStyle.fontSize}px</span>
              </div>

              {/* Text Color */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">Text Color</label>
                <input
                  type="color"
                  value={captionStyle.color}
                  onChange={(e) => onStyleChange({ ...captionStyle, color: e.target.value })}
                  className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={captionStyle.color}
                  onChange={(e) => onStyleChange({ ...captionStyle, color: e.target.value })}
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                />
              </div>

              {/* Background Color Palette */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">Background</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { color: 'rgba(0, 0, 0, 0.9)', label: 'Black 90%' },
                    { color: 'rgba(0, 0, 0, 0.75)', label: 'Black 75%' },
                    { color: 'rgba(0, 0, 0, 0.5)', label: 'Black 50%' },
                    { color: 'rgba(0, 0, 0, 0.3)', label: 'Black 30%' },
                    { color: 'rgba(255, 255, 255, 0.9)', label: 'White 90%' },
                    { color: 'rgba(255, 255, 255, 0.6)', label: 'White 60%' },
                    { color: 'rgba(37, 99, 235, 0.8)', label: 'Blue' },
                    { color: 'rgba(220, 38, 38, 0.8)', label: 'Red' },
                    { color: 'rgba(22, 163, 74, 0.8)', label: 'Green' },
                    { color: 'rgba(234, 179, 8, 0.8)', label: 'Yellow' },
                    { color: 'rgba(147, 51, 234, 0.8)', label: 'Purple' },
                    { color: 'rgba(249, 115, 22, 0.8)', label: 'Orange' },
                    { color: 'rgba(236, 72, 153, 0.8)', label: 'Pink' },
                    { color: 'rgba(20, 184, 166, 0.8)', label: 'Teal' },
                    { color: 'transparent', label: 'None' },
                  ].map(({ color, label }) => (
                    <button
                      key={color}
                      title={label}
                      onClick={() => onStyleChange({ ...captionStyle, backgroundColor: color })}
                      className={`w-6 h-6 rounded border-2 transition-all ${
                        captionStyle.backgroundColor === color
                          ? 'border-blue-500 scale-110 ring-1 ring-blue-300'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{
                        background: color === 'transparent'
                          ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 8px 8px'
                          : color,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Position */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">Position</label>
                <div className="flex gap-1.5">
                  {(['top', 'bottom', 'custom'] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => onStyleChange({ ...captionStyle, position: pos })}
                      className={`text-xs px-2.5 py-1 rounded capitalize ${
                        captionStyle.position === pos ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {pos === 'custom' ? 'Free' : pos}
                    </button>
                  ))}
                </div>
              </div>
              {captionStyle.position === 'custom' && (
                <p className="text-[10px] text-gray-400 -mt-1">Drag the caption on the video to position it</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
