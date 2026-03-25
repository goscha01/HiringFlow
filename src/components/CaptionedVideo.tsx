'use client'

import { useRef, useState, useEffect } from 'react'

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
  position: 'bottom' | 'top'
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 16,
  color: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  position: 'bottom',
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
  const [currentTime, setCurrentTime] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

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

  return (
    <div className="relative">
      {/* Video */}
      <div className={`relative rounded-md overflow-hidden bg-black ${className || ''}`}>
        <video
          ref={videoRef}
          src={src}
          className="w-full"
          controls
          preload="metadata"
          autoPlay={autoPlay}
          onEnded={onEnded}
        />

        {/* Caption overlay */}
        {currentSegment && (
          <div
            className={`absolute left-0 right-0 flex justify-center pointer-events-none px-4 ${
              captionStyle.position === 'top' ? 'top-12' : 'bottom-12'
            }`}
          >
            <span
              style={{
                fontFamily: captionStyle.fontFamily,
                fontSize: `${captionStyle.fontSize}px`,
                color: captionStyle.color,
                backgroundColor: captionStyle.backgroundColor,
                padding: '4px 12px',
                borderRadius: '4px',
                maxWidth: '90%',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              {currentSegment.text}
            </span>
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

              {/* Background Color */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">BG Color</label>
                <select
                  value={captionStyle.backgroundColor}
                  onChange={(e) => onStyleChange({ ...captionStyle, backgroundColor: e.target.value })}
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                >
                  <option value="rgba(0, 0, 0, 0.75)">Black (75%)</option>
                  <option value="rgba(0, 0, 0, 0.5)">Black (50%)</option>
                  <option value="rgba(0, 0, 0, 0.9)">Black (90%)</option>
                  <option value="rgba(255, 255, 255, 0.75)">White (75%)</option>
                  <option value="rgba(0, 0, 255, 0.6)">Blue (60%)</option>
                  <option value="rgba(255, 0, 0, 0.6)">Red (60%)</option>
                  <option value="transparent">None</option>
                </select>
              </div>

              {/* Position */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-20 flex-shrink-0">Position</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onStyleChange({ ...captionStyle, position: 'bottom' })}
                    className={`text-xs px-3 py-1 rounded ${
                      captionStyle.position === 'bottom' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    Bottom
                  </button>
                  <button
                    onClick={() => onStyleChange({ ...captionStyle, position: 'top' })}
                    className={`text-xs px-3 py-1 rounded ${
                      captionStyle.position === 'top' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    Top
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
