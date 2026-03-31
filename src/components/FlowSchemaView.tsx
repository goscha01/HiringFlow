'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Video {
  id: string
  filename: string
  url: string
}

interface Option {
  id: string
  optionText: string
  nextStepId: string | null
}

interface Step {
  id: string
  title: string
  videoId: string | null
  video: Video | null
  questionText: string | null
  stepOrder: number
  stepType: string
  questionType: string
  options: Option[]
}

interface FlowSchemaViewProps {
  steps: Step[]
  startMessage?: string
  endMessage?: string
  onStepClick?: (stepId: string) => void
  onStepPreview?: (stepId: string) => void
  onDeleteStep?: (stepId: string) => void
  onOptionUpdate?: (optionId: string, data: { nextStepId: string | null }) => void
  onConnectSteps?: (fromStepId: string, toStepId: string) => void
  onChangeFirstStep?: (stepId: string) => void
  onChangeEndStep?: (stepId: string) => void
  onAddStep?: () => void
  selectedStepId?: string | null
}

interface NodePos {
  x: number
  y: number
}

type InteractionMode =
  | { type: 'idle' }
  | { type: 'panning'; startX: number; startY: number; panStartX: number; panStartY: number }
  | { type: 'dragging'; stepId: string; offsetX: number; offsetY: number; startScreenX: number; startScreenY: number }
  | { type: 'connecting'; fromStepId: string; fromX: number; fromY: number; mouseX: number; mouseY: number }
  | { type: 'reconnecting'; optionId: string; fromStepId: string; fromX: number; fromY: number; mouseX: number; mouseY: number }
  | { type: 'reconnecting_source'; optionId: string; targetStepId: string; toX: number; toY: number; mouseX: number; mouseY: number }
  | { type: 'reconnecting_start'; fromX: number; fromY: number; mouseX: number; mouseY: number }
  | { type: 'reconnecting_end'; fromStepId: string; fromX: number; fromY: number; mouseX: number; mouseY: number }

interface SelectedArrow {
  optionId: string
  stepId: string
  kind?: 'option' | 'start' | 'end'
}

const NODE_W = 240
const THUMB_H = 148 // taller thumbnail area
const NODE_H = 10 + THUMB_H + 8 + 44 + 10 // 220
const PORT_R = 7
const H_GAP = 100
const V_GAP = 70

// Single output port on the right side of the card
function getOutputPort(pos: NodePos): { x: number; y: number } {
  return { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 }
}

// Single input port on the left side of the card
function getInputPort(pos: NodePos): { x: number; y: number } {
  return { x: pos.x, y: pos.y + NODE_H / 2 }
}

// Legacy — still needed for option-level arrow routing (slightly offset per option)
function getOptionOutputY(step: Step, optionIndex: number, pos: NodePos): number {
  const count = step.options.length
  if (count <= 1) return pos.y + NODE_H / 2
  const margin = 30
  const range = NODE_H - margin * 2
  return pos.y + margin + (optionIndex / (count - 1)) * range
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

const START_ID = '__start__'
const END_ID = '__end__'
const SPECIAL_W = 160
const SPECIAL_H = 80

export default function FlowSchemaView({
  steps,
  startMessage,
  endMessage,
  onStepClick,
  onStepPreview,
  onDeleteStep,
  onOptionUpdate,
  onConnectSteps,
  onChangeFirstStep,
  onChangeEndStep,
  onAddStep,
  selectedStepId,
}: FlowSchemaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Record<string, NodePos>>({})
  const [thumbnails, setThumbnails] = useState<Record<string, HTMLImageElement>>({})
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState<InteractionMode>({ type: 'idle' })
  const [hoveredPort, setHoveredPort] = useState<string | null>(null)
  const [selectedArrow, setSelectedArrow] = useState<SelectedArrow | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; optionId: string; stepId: string } | null>(null)

  // Refs for animation loop access
  const posRef = useRef(positions)
  posRef.current = positions
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Keyboard: Delete/Backspace deletes selected step
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

        // Only delete if the step actually exists in the current steps array
        if (selectedStepId && selectedStepId !== START_ID && selectedStepId !== END_ID) {
          const stepExists = steps.some(s => s.id === selectedStepId)
          if (!stepExists) return
          e.preventDefault()
          if (confirm('Delete this step?')) {
            onDeleteStep?.(selectedStepId)
          }
        } else if (selectedArrow) {
          e.preventDefault()
          if (confirm('Remove this connection?')) {
            onOptionUpdate?.(selectedArrow.optionId, { nextStepId: null })
            setSelectedArrow(null)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStepId, selectedArrow, onDeleteStep, onOptionUpdate])

  // Find terminal options (options with no nextStepId) and submission steps
  const getTerminalOptionIds = useCallback(() => {
    const ids: string[] = []
    for (const step of steps) {
      if (step.stepType === 'submission') continue // submission steps are terminal by nature
      for (const opt of step.options) {
        if (!opt.nextStepId) ids.push(opt.id)
      }
    }
    return ids
  }, [steps])

  // Only the last step by order connects to End (single End connection)
  const getEndStepId = useCallback((): string | null => {
    if (steps.length === 0) return null
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
    return sorted[sorted.length - 1].id
  }, [steps])

  // Compute initial layout
  const computeLayout = useCallback((): Record<string, NodePos> => {
    if (steps.length === 0) {
      // Still show start and end even with no steps
      return {
        [START_ID]: { x: 0, y: 0 },
        [END_ID]: { x: SPECIAL_W + H_GAP, y: 0 },
      }
    }

    const posMap: Record<string, NodePos> = {}
    const visited = new Set<string>()
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
    const stepMap = new Map(steps.map((s) => [s.id, s]))

    // Start node: one column before the first step
    const startCol = -1

    const queue: Array<{ stepId: string; col: number; row: number }> = [
      { stepId: sorted[0].id, col: 0, row: 0 },
    ]
    const colRows: Record<number, number> = {}

    while (queue.length > 0) {
      const { stepId, col, row } = queue.shift()!
      if (visited.has(stepId)) continue
      visited.add(stepId)

      const currentRow = colRows[col] ?? 0
      const actualRow = Math.max(row, currentRow)
      colRows[col] = actualRow + 1

      posMap[stepId] = {
        x: col * (NODE_W + H_GAP),
        y: actualRow * (NODE_H + V_GAP),
      }

      const step = stepMap.get(stepId)
      if (step) {
        const children = step.options
          .filter((o) => o.nextStepId && !visited.has(o.nextStepId))
          .map((o) => o.nextStepId!)
          .filter((id, i, arr) => arr.indexOf(id) === i)

        children.forEach((childId, i) => {
          queue.push({ stepId: childId, col: col + 1, row: actualRow + i })
        })
      }
    }

    // Place unvisited steps
    let extraRow = 0
    const maxRow = Object.values(colRows).reduce((a, b) => Math.max(a, b), 0)
    for (const step of sorted) {
      if (!visited.has(step.id)) {
        posMap[step.id] = {
          x: 0,
          y: (maxRow + extraRow) * (NODE_H + V_GAP),
        }
        extraRow++
      }
    }

    // Place Start node to the left
    const allY = Object.values(posMap).map((p) => p.y)
    const midY = allY.length > 0 ? (Math.min(...allY) + Math.max(...allY)) / 2 : 0
    posMap[START_ID] = {
      x: startCol * (NODE_W + H_GAP) + (NODE_W - SPECIAL_W) / 2,
      y: midY + (NODE_H - SPECIAL_H) / 2,
    }

    // Place End node to the right of the rightmost column
    const maxX = Object.values(posMap)
      .filter((_, i) => Object.keys(posMap)[i] !== START_ID)
      .reduce((max, p) => Math.max(max, p.x), 0)
    posMap[END_ID] = {
      x: maxX + NODE_W + H_GAP + (NODE_W - SPECIAL_W) / 2,
      y: midY + (NODE_H - SPECIAL_H) / 2,
    }

    return posMap
  }, [steps])

  // Init layout on steps change
  useEffect(() => {
    setPositions(computeLayout())
  }, [computeLayout])

  // Generate video thumbnails with cover-crop
  useEffect(() => {
    const thumbs: Record<string, HTMLImageElement> = {}
    let mounted = true
    const THUMB_W = NODE_W - 20
    const THUMB_H_CAP = THUMB_H

    steps.forEach((step) => {
      if (step.video?.url) {
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.preload = 'metadata'
        video.src = step.video.url
        video.onloadeddata = () => { video.currentTime = 1 }
        video.onseeked = () => {
          const c = document.createElement('canvas')
          c.width = THUMB_W; c.height = THUMB_H_CAP
          const ctx = c.getContext('2d')
          if (ctx) {
            // Cover-crop: fill canvas without distortion
            const vw = video.videoWidth
            const vh = video.videoHeight
            const thumbRatio = THUMB_W / THUMB_H_CAP
            const vidRatio = vw / vh
            let sx = 0, sy = 0, sw = vw, sh = vh
            if (vidRatio > thumbRatio) {
              // Video is wider — crop sides
              sw = vh * thumbRatio
              sx = (vw - sw) / 2
            } else {
              // Video is taller — crop top/bottom
              sh = vw / thumbRatio
              sy = (vh - sh) / 2
            }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H_CAP)
            const img = new Image()
            img.onload = () => {
              if (mounted) {
                thumbs[step.id] = img
                setThumbnails({ ...thumbs })
              }
            }
            img.src = c.toDataURL()
          }
        }
      }
    })

    return () => { mounted = false }
  }, [steps])

  // Convert screen coords to canvas coords
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    }
  }, [pan, scale])

  // Hit test: find which step is under the cursor
  const hitTestNode = useCallback((cx: number, cy: number): string | null => {
    // Check special nodes
    for (const id of [START_ID, END_ID]) {
      const pos = posRef.current[id]
      if (!pos) continue
      if (cx >= pos.x && cx <= pos.x + SPECIAL_W && cy >= pos.y && cy <= pos.y + SPECIAL_H) {
        return id
      }
    }
    for (const step of steps) {
      const pos = posRef.current[step.id]
      if (!pos) continue
      if (cx >= pos.x && cx <= pos.x + NODE_W && cy >= pos.y && cy <= pos.y + NODE_H) {
        return step.id
      }
    }
    return null
  }, [steps])

  // Hit test: find which step's output port (right circle) is under cursor
  const hitTestOutputPort = useCallback((cx: number, cy: number): string | null => {
    for (const step of steps) {
      const pos = posRef.current[step.id]
      if (!pos) continue
      const out = getOutputPort(pos)
      if (dist(cx, cy, out.x, out.y) <= PORT_R + 4) {
        return step.id
      }
    }
    return null
  }, [steps])

  // Hit test: find which step's input port (left circle) is under cursor
  const hitTestInputPort = useCallback((cx: number, cy: number): string | null => {
    for (const step of steps) {
      const pos = posRef.current[step.id]
      if (!pos) continue
      const inp = getInputPort(pos)
      if (dist(cx, cy, inp.x, inp.y) <= PORT_R + 4) {
        return step.id
      }
    }
    return null
  }, [steps])

  // Hit test: arrow line (returns the option that owns it)
  const hitTestArrow = useCallback((cx: number, cy: number): { optionId: string; stepId: string } | null => {
    for (const step of steps) {
      const pos = posRef.current[step.id]
      if (!pos) continue
      const out = getOutputPort(pos)
      for (const option of step.options) {
        if (!option.nextStepId) continue
        const targetPos = posRef.current[option.nextStepId]
        if (!targetPos) continue
        const inp = getInputPort(targetPos)
        if (isNearBezier(cx, cy, out.x, out.y, inp.x, inp.y, 10)) {
          return { optionId: option.id, stepId: step.id }
        }
      }
    }
    return null
  }, [steps])

  // Hit test: arrow target endpoint (near the target input port)
  const hitTestArrowEndpoint = useCallback((cx: number, cy: number): { optionId: string; stepId: string } | null => {
    for (const step of steps) {
      const pos = posRef.current[step.id]
      if (!pos) continue
      for (const option of step.options) {
        if (!option.nextStepId) continue
        const targetPos = posRef.current[option.nextStepId]
        if (!targetPos) continue
        const inp = getInputPort(targetPos)
        if (dist(cx, cy, inp.x, inp.y) <= 18) {
          return { optionId: option.id, stepId: step.id }
        }
      }
    }
    return null
  }, [steps])

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Draw grid
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(scale, scale)

    const gridSize = 30
    const startX = Math.floor(-pan.x / scale / gridSize) * gridSize - gridSize
    const startY = Math.floor(-pan.y / scale / gridSize) * gridSize - gridSize
    const endX = startX + w / scale + gridSize * 2
    const endY = startY + h / scale + gridSize * 2

    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = 0.5
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke()
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke()
    }

    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
    const endStepId = getEndStepId()

    // --- Draw connections ---

    // Start -> first step
    const startPos = positions[START_ID]
    const isStartArrowSelected = selectedArrow?.kind === 'start'
    if (startPos && sorted.length > 0) {
      const firstPos = positions[sorted[0].id]
      if (firstPos) {
        const fromX = startPos.x + SPECIAL_W
        const fromY = startPos.y + SPECIAL_H / 2
        const toX = firstPos.x
        const toY = firstPos.y + NODE_H / 2
        drawConnection(ctx, fromX, fromY, toX, toY, '', false, isStartArrowSelected ? '#3b82f6' : '#10b981')

        if (isStartArrowSelected) {
          // Drag handle at the card end
          ctx.beginPath()
          ctx.arc(toX, toY, 13, 0, Math.PI * 2)
          ctx.fillStyle = '#3b82f6'
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.stroke()
          // Arrow icon inside handle
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('\u2194', toX, toY)
        }
      }
    }

    // Step option connections
    for (const step of steps) {
      const pos = positions[step.id]
      if (!pos) continue

      const out = getOutputPort(pos)
      for (const option of step.options) {
        if (!option.nextStepId) continue
        const targetPos = positions[option.nextStepId]
        if (!targetPos) continue

        const inp = getInputPort(targetPos)
        const isArrowSelected = selectedArrow?.optionId === option.id
        drawConnection(ctx, out.x, out.y, inp.x, inp.y, option.optionText, false, isArrowSelected ? '#3b82f6' : undefined)

        // Draw drag handles + delete when selected
        if (isArrowSelected) {
          // Target endpoint handle (at input port)
          drawDragHandle(ctx, inp.x, inp.y)
          // Source endpoint handle (at output port)
          drawDragHandle(ctx, out.x, out.y)
          // Delete button at midpoint
          const ddx = Math.abs(inp.x - out.x)
          const cpOff = Math.max(ddx * 0.5, 50)
          const midX = bezierPoint(out.x, out.x + cpOff, inp.x - cpOff, inp.x, 0.5)
          const midY = bezierPoint(out.y, out.y, inp.y, inp.y, 0.5)
          drawDeleteButton(ctx, midX, midY)
        }
      }
    }

    // Single End connection — last step by order
    const endPos = positions[END_ID]
    if (endPos && endStepId) {
      const eStepPos = positions[endStepId]
      if (eStepPos) {
        const fromX = eStepPos.x + NODE_W
        const fromY = eStepPos.y + NODE_H / 2
        const toX = endPos.x
        const toY = endPos.y + SPECIAL_H / 2
        const isEndArrowSelected = selectedArrow?.kind === 'end'
        drawConnection(ctx, fromX, fromY, toX, toY, '', false, isEndArrowSelected ? '#3b82f6' : '#ef4444')

        if (isEndArrowSelected) {
          // Drag handle at the card end
          ctx.beginPath()
          ctx.arc(fromX, fromY, 13, 0, Math.PI * 2)
          ctx.fillStyle = '#3b82f6'
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('\u2194', fromX, fromY)
        }
      }
    }

    // Draw in-progress connection or reconnection
    const m = modeRef.current
    if (m.type === 'connecting' || m.type === 'reconnecting' || m.type === 'reconnecting_start' || m.type === 'reconnecting_end') {
      drawConnection(ctx, m.fromX, m.fromY, m.mouseX, m.mouseY, '', true)
    }
    if (m.type === 'reconnecting_source') {
      drawConnection(ctx, m.mouseX, m.mouseY, m.toX, m.toY, '', true)
    }

    // --- Draw Start node ---
    if (startPos) {
      drawSpecialNode(ctx, startPos, 'Start', startMessage || 'Welcome', selectedStepId === START_ID, '#10b981', '#ecfdf5')
    }

    // --- Draw End node ---
    if (endPos) {
      drawSpecialNode(ctx, endPos, 'End', endMessage || 'Thank you', selectedStepId === END_ID, '#ef4444', '#fef2f2')
    }

    // --- Draw step nodes ---
    for (const step of steps) {
      const pos = positions[step.id]
      if (!pos) continue
      drawNode(ctx, step, pos, step.id === selectedStepId, thumbnails[step.id])

      // Draw single OUTPUT port (right side)
      const out = getOutputPort(pos)
      const isOutHovered = hoveredPort === `out_${step.id}`
      const hasOutgoing = step.options.some((o) => o.nextStepId)
      drawPortCircle(ctx, out.x, out.y, isOutHovered, hasOutgoing)

      // Draw single INPUT port (left side)
      const inp = getInputPort(pos)
      const isInpHovered = hoveredPort === `inp_${step.id}`
      const hasIncoming = steps.some((s) => s.options.some((o) => o.nextStepId === step.id))
        || step.id === sorted[0]?.id
      drawPortCircle(ctx, inp.x, inp.y, isInpHovered, hasIncoming)
    }

    ctx.restore()
  }, [positions, thumbnails, pan, scale, steps, selectedStepId, hoveredPort, mode, startMessage, endMessage, getEndStepId, selectedArrow])

  // Animation frame for smooth rendering
  useEffect(() => {
    let raf: number
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  // Hit test: delete button (top-left of selected node)
  const hitTestDeleteButton = useCallback((cx: number, cy: number): string | null => {
    if (!selectedStepId || selectedStepId === START_ID || selectedStepId === END_ID) return null
    const pos = posRef.current[selectedStepId]
    if (!pos) return null
    const dx = pos.x - 6
    const dy = pos.y - 6
    if (dist(cx, cy, dx, dy) <= 14) return selectedStepId
    return null
  }, [selectedStepId])

  // Hit test: arrow delete button (midpoint of selected arrow)
  const hitTestArrowDelete = useCallback((cx: number, cy: number): boolean => {
    if (!selectedArrow) return false
    const step = steps.find((s) => s.id === selectedArrow.stepId)
    if (!step) return false
    const pos = posRef.current[step.id]
    if (!pos) return false
    const option = step.options.find((o) => o.id === selectedArrow.optionId)
    if (!option?.nextStepId) return false
    const targetPos = posRef.current[option.nextStepId]
    if (!targetPos) return false

    const out = getOutputPort(pos)
    const inp = getInputPort(targetPos)

    const dx = Math.abs(inp.x - out.x)
    const cpOff = Math.max(dx * 0.5, 50)
    const midX = bezierPoint(out.x, out.x + cpOff, inp.x - cpOff, inp.x, 0.5)
    const midY = bezierPoint(out.y, out.y, inp.y, inp.y, 0.5)
    return dist(cx, cy, midX, midY) <= 14
  }, [selectedArrow, steps])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return // right click handled separately
    setContextMenu(null)

    const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
    const endStepId = getEndStepId()
    const endPos = positions[END_ID]

    // Check node delete button first
    const deleteTarget = hitTestDeleteButton(cx, cy)
    if (deleteTarget) {
      onDeleteStep?.(deleteTarget)
      return
    }

    // Check arrow delete button (only for option arrows, not Start/End)
    if (selectedArrow?.kind === 'option' && hitTestArrowDelete(cx, cy)) {
      onOptionUpdate?.(selectedArrow.optionId, { nextStepId: null })
      setSelectedArrow(null)
      return
    }

    // Check Start arrow drag handle (must be before generic endpoint check)
    if (selectedArrow?.kind === 'start' && sorted.length > 0) {
      const firstPos = positions[sorted[0].id]
      if (firstPos) {
        const toX = firstPos.x
        const toY = firstPos.y + NODE_H / 2
        if (dist(cx, cy, toX, toY) <= 18) {
          const sp = positions[START_ID]
          if (sp) {
            setMode({
              type: 'reconnecting_start',
              fromX: sp.x + SPECIAL_W,
              fromY: sp.y + SPECIAL_H / 2,
              mouseX: cx,
              mouseY: cy,
            })
            return
          }
        }
      }
    }

    // Check End arrow drag handle
    if (selectedArrow?.kind === 'end') {
      const stepPos = positions[selectedArrow.stepId]
      if (stepPos) {
        const fromX = stepPos.x + NODE_W
        const fromY = stepPos.y + NODE_H / 2
        if (dist(cx, cy, fromX, fromY) <= 18) {
          const ep = positions[END_ID]
          if (ep) {
            setMode({
              type: 'reconnecting_end',
              fromStepId: selectedArrow.stepId,
              fromX: ep.x,
              fromY: ep.y + SPECIAL_H / 2,
              mouseX: cx,
              mouseY: cy,
            })
            return
          }
        }
      }
    }

    // Check option arrow target endpoint drag (arrowhead at target)
    if (selectedArrow?.kind === 'option') {
      const endpoint = hitTestArrowEndpoint(cx, cy)
      if (endpoint && endpoint.optionId === selectedArrow.optionId) {
        const pos = positions[endpoint.stepId]
        if (pos) {
          const out = getOutputPort(pos)
          setMode({
            type: 'reconnecting',
            optionId: endpoint.optionId,
            fromStepId: endpoint.stepId,
            fromX: out.x,
            fromY: out.y,
            mouseX: cx,
            mouseY: cy,
          })
          return
        }
      }

      // Check option arrow source endpoint drag (at output port)
      const srcPos = positions[selectedArrow.stepId]
      if (srcPos) {
        const srcOut = getOutputPort(srcPos)
        if (dist(cx, cy, srcOut.x, srcOut.y) <= 18) {
          const srcStep = steps.find((s) => s.id === selectedArrow.stepId)
          const option = srcStep?.options.find((o) => o.id === selectedArrow.optionId)
          if (option?.nextStepId) {
            const targetPos = positions[option.nextStepId]
            if (targetPos) {
              const inp = getInputPort(targetPos)
              setMode({
                type: 'reconnecting_source',
                optionId: selectedArrow.optionId,
                targetStepId: option.nextStepId,
                toX: inp.x,
                toY: inp.y,
                mouseX: cx,
                mouseY: cy,
              })
              return
            }
          }
        }
      }
    }

    // Check output ports (for starting a new connection)
    const outPortStepId = hitTestOutputPort(cx, cy)
    if (outPortStepId) {
      const pos = positions[outPortStepId]
      if (pos) {
        const out = getOutputPort(pos)
        setSelectedArrow(null)
        setMode({
          type: 'connecting',
          fromStepId: outPortStepId,
          fromX: out.x,
          fromY: out.y,
          mouseX: cx,
          mouseY: cy,
        })
        return
      }
    }

    // Check arrow click for selection (before node check so arrows near nodes work)
    const arrow = hitTestArrow(cx, cy)
    if (arrow) {
      setSelectedArrow({ ...arrow, kind: 'option' })
      return
    }

    // Check Start arrow click
    if (sorted.length > 0) {
      const sp = positions[START_ID]
      const firstPos = positions[sorted[0].id]
      if (sp && firstPos) {
        const fromX = sp.x + SPECIAL_W
        const fromY = sp.y + SPECIAL_H / 2
        const toX = firstPos.x
        const toY = firstPos.y + NODE_H / 2
        if (isNearBezier(cx, cy, fromX, fromY, toX, toY, 10)) {
          setSelectedArrow({ optionId: '__start_arrow__', stepId: sorted[0].id, kind: 'start' })
          return
        }
      }
    }

    // Check End arrow click (single connection)
    if (endPos && endStepId) {
      const ePos = positions[endStepId]
      if (ePos) {
        const fromX = ePos.x + NODE_W
        const fromY = ePos.y + NODE_H / 2
        const toX = endPos.x
        const toY = endPos.y + SPECIAL_H / 2
        if (isNearBezier(cx, cy, fromX, fromY, toX, toY, 10)) {
          setSelectedArrow({ optionId: '__end_arrow__', stepId: endStepId, kind: 'end' })
          return
        }
      }
    }

    // Check nodes (for dragging)
    const nodeId = hitTestNode(cx, cy)
    if (nodeId) {
      setSelectedArrow(null)
      const pos = positions[nodeId]
      if (pos) {
        setMode({
          type: 'dragging',
          stepId: nodeId,
          offsetX: cx - pos.x,
          offsetY: cy - pos.y,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
        })
        return
      }
    }

    // Clicking empty space deselects everything
    setSelectedArrow(null)
    setMode({
      type: 'panning',
      startX: e.clientX,
      startY: e.clientY,
      panStartX: pan.x,
      panStartY: pan.y,
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)

    if (mode.type === 'panning') {
      setPan({
        x: mode.panStartX + (e.clientX - mode.startX),
        y: mode.panStartY + (e.clientY - mode.startY),
      })
      return
    }

    if (mode.type === 'dragging') {
      setPositions((prev) => ({
        ...prev,
        [mode.stepId]: {
          x: cx - mode.offsetX,
          y: cy - mode.offsetY,
        },
      }))
      return
    }

    if (mode.type === 'connecting') {
      setMode({ ...mode, mouseX: cx, mouseY: cy })

      const targetStep = hitTestInputPort(cx, cy)
      if (targetStep && targetStep !== mode.fromStepId) {
        setHoveredPort(`inp_${targetStep}`)
      } else {
        setHoveredPort(null)
      }
      return
    }

    if (mode.type === 'reconnecting') {
      setMode({ ...mode, mouseX: cx, mouseY: cy })
      const targetStep = hitTestInputPort(cx, cy)
      if (targetStep && targetStep !== mode.fromStepId) {
        setHoveredPort(`inp_${targetStep}`)
      } else {
        setHoveredPort(null)
      }
      return
    }

    if (mode.type === 'reconnecting_start') {
      setMode({ ...mode, mouseX: cx, mouseY: cy })
      const targetStep = hitTestInputPort(cx, cy)
      setHoveredPort(targetStep ? `inp_${targetStep}` : null)
      return
    }

    if (mode.type === 'reconnecting_end') {
      setMode({ ...mode, mouseX: cx, mouseY: cy })
      const nodeId = hitTestNode(cx, cy)
      setHoveredPort(nodeId && nodeId !== START_ID && nodeId !== END_ID ? `out_${nodeId}` : null)
      return
    }

    if (mode.type === 'reconnecting_source') {
      setMode({ ...mode, mouseX: cx, mouseY: cy })
      const outStepId = hitTestOutputPort(cx, cy)
      setHoveredPort(outStepId ? `out_${outStepId}` : null)
      return
    }

    // Hover detection
    const delTarget = hitTestDeleteButton(cx, cy)
    if (delTarget) {
      setHoveredPort('__delete__')
      return
    }
    const outStepHover = hitTestOutputPort(cx, cy)
    if (outStepHover) {
      setHoveredPort(`out_${outStepHover}`)
      return
    }
    const inpStep = hitTestInputPort(cx, cy)
    if (inpStep) {
      setHoveredPort(`inp_${inpStep}`)
      return
    }
    // Arrow hover
    if (selectedArrow && hitTestArrowDelete(cx, cy)) {
      setHoveredPort('__arrow_delete__')
      return
    }
    const arrowHit = hitTestArrow(cx, cy)
    if (arrowHit) {
      setHoveredPort('__arrow__')
      return
    }
    setHoveredPort(null)
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mode.type === 'reconnecting') {
      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
      // Accept drop on input port OR anywhere on a node
      let targetStep = hitTestInputPort(cx, cy)
      if (!targetStep) {
        const nodeId = hitTestNode(cx, cy)
        if (nodeId && nodeId !== START_ID && nodeId !== END_ID) targetStep = nodeId
      }

      if (targetStep && targetStep !== mode.fromStepId) {
        onOptionUpdate?.(mode.optionId, { nextStepId: targetStep })
      }
      setSelectedArrow(null)
      setHoveredPort(null)
      setMode({ type: 'idle' })
      return
    }

    if (mode.type === 'reconnecting_source') {
      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
      const outStepId = hitTestOutputPort(cx, cy)
      if (outStepId && outStepId !== steps.find((s) => s.options.some((o) => o.id === mode.optionId))?.id) {
        // Disconnect old option, create connection from new step
        onOptionUpdate?.(mode.optionId, { nextStepId: null })
        onConnectSteps?.(outStepId, mode.targetStepId)
      }
      setSelectedArrow(null)
      setHoveredPort(null)
      setMode({ type: 'idle' })
      return
    }

    if (mode.type === 'reconnecting_start') {
      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
      let targetStep = hitTestInputPort(cx, cy)
      if (!targetStep) {
        const nodeId = hitTestNode(cx, cy)
        if (nodeId && nodeId !== START_ID && nodeId !== END_ID) targetStep = nodeId
      }
      if (targetStep) {
        onChangeFirstStep?.(targetStep)
      }
      setSelectedArrow(null)
      setHoveredPort(null)
      setMode({ type: 'idle' })
      return
    }

    if (mode.type === 'reconnecting_end') {
      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
      const nodeId = hitTestNode(cx, cy)
      if (nodeId && nodeId !== START_ID && nodeId !== END_ID && nodeId !== mode.fromStepId) {
        onChangeEndStep?.(nodeId)
      }
      setSelectedArrow(null)
      setHoveredPort(null)
      setMode({ type: 'idle' })
      return
    }

    if (mode.type === 'connecting') {
      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
      let targetStep = hitTestInputPort(cx, cy)
      if (!targetStep) {
        const nodeId = hitTestNode(cx, cy)
        if (nodeId && nodeId !== START_ID && nodeId !== END_ID) targetStep = nodeId
      }

      if (targetStep && targetStep !== mode.fromStepId) {
        onConnectSteps?.(mode.fromStepId, targetStep)
      }

      setHoveredPort(null)
    }

    if (mode.type === 'dragging') {
      // Check if it was a click (minimal movement) using screen coords
      const dx = Math.abs(e.clientX - mode.startScreenX)
      const dy = Math.abs(e.clientY - mode.startScreenY)
      if (dx < 5 && dy < 5) {
        // It was a click, not a drag
        onStepClick?.(mode.stepId)
      }
    }

    if (mode.type === 'panning') {
      const dx = e.clientX - mode.startX
      const dy = e.clientY - mode.startY
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
        const nodeId = hitTestNode(cx, cy)
        if (nodeId) {
          if (selectedStepId === nodeId) {
            onStepClick?.(nodeId)
          } else {
            onStepClick?.(nodeId)
          }
        }
      }
    }

    setMode({ type: 'idle' })
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)

    // (output port context menu removed — use arrow click + delete instead)

    // Check if right-clicking on a connection line
    for (const step of steps) {
      const pos = positions[step.id]
      if (!pos) continue
      const out = getOutputPort(pos)
      for (const option of step.options) {
        if (!option.nextStepId) continue
        const targetPos = positions[option.nextStepId]
        if (!targetPos) continue

        const inp = getInputPort(targetPos)
        if (isNearBezier(cx, cy, out.x, out.y, inp.x, inp.y, 8)) {
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            optionId: option.id,
            stepId: step.id,
          })
          return
        }
      }
    }

    setContextMenu(null)
  }

  const handleDisconnect = () => {
    if (contextMenu) {
      onOptionUpdate?.(contextMenu.optionId, { nextStepId: null })
      setContextMenu(null)
    }
  }

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      setScale((s) => Math.min(2, Math.max(0.3, s + delta)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const getCursor = () => {
    if (mode.type === 'panning') return 'grabbing'
    if (mode.type === 'dragging') return 'move'
    if (mode.type === 'connecting' || mode.type === 'reconnecting' || mode.type === 'reconnecting_source' || mode.type === 'reconnecting_start' || mode.type === 'reconnecting_end') return 'crosshair'
    if (hoveredPort === '__delete__' || hoveredPort === '__arrow_delete__') return 'pointer'
    if (hoveredPort === '__arrow__') return 'pointer'
    if (hoveredPort) return 'pointer'
    return 'grab'
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-gray-50 rounded-lg border border-gray-200"
      style={{ cursor: getCursor() }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setMode({ type: 'idle' }); setHoveredPort(null) }}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY)
          const nodeId = hitTestNode(cx, cy)
          if (nodeId) {
            onStepPreview?.(nodeId)
          }
        }}
      />

      {/* Add Step button */}
      {onAddStep && (
        <button
          onClick={onAddStep}
          className="absolute top-3 right-3 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 z-10"
        >
          <span className="text-lg leading-none">+</span> Add Step
        </button>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white rounded-md shadow border border-gray-200 px-1">
        <button
          onClick={() => setScale((s) => Math.max(0.3, s - 0.15))}
          className="px-2 py-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
        >
          -
        </button>
        <span className="text-xs text-gray-500 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          className="px-2 py-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
        >
          +
        </button>
        <button
          onClick={() => { setPositions(computeLayout()); setPan({ x: 40, y: 40 }); setScale(1) }}
          className="px-2 py-1 text-gray-600 hover:text-gray-900 text-xs border-l border-gray-200 ml-1"
          title="Reset layout"
        >
          Reset
        </button>
      </div>

      {/* Help text */}
      <div className="absolute top-3 left-3 text-xs text-gray-400 pointer-events-none">
        Click to select &middot; Double-click to preview &middot; Drag to move &middot; Click arrow to select &middot; Drag arrowhead to reconnect
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleDisconnect}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </>
      )}

      {steps.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          No steps to display
        </div>
      )}
    </div>
  )
}

// --- Drawing helpers ---

function drawConnection(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  label: string,
  isDraft: boolean,
  color?: string
) {
  const lineColor = color || '#94a3b8'
  const dx = Math.abs(toX - fromX)
  const cpOffset = Math.max(dx * 0.5, 50)

  ctx.beginPath()
  ctx.strokeStyle = isDraft ? '#3b82f6' : lineColor
  ctx.lineWidth = isDraft ? 2.5 : 2
  if (isDraft) ctx.setLineDash([6, 4])
  if (color && !isDraft) ctx.setLineDash([4, 3])

  ctx.moveTo(fromX, fromY)
  ctx.bezierCurveTo(fromX + cpOffset, fromY, toX - cpOffset, toY, toX, toY)
  ctx.stroke()
  ctx.setLineDash([])

  // Arrowhead
  if (!isDraft) {
    const t = 0.95
    const bx = bezierPoint(fromX, fromX + cpOffset, toX - cpOffset, toX, t)
    const by = bezierPoint(fromY, fromY, toY, toY, t)
    const angle = Math.atan2(toY - by, toX - bx)

    ctx.beginPath()
    ctx.fillStyle = lineColor
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - 10 * Math.cos(angle - 0.35), toY - 10 * Math.sin(angle - 0.35))
    ctx.lineTo(toX - 10 * Math.cos(angle + 0.35), toY - 10 * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()
  }

  // Label
  if (label) {
    const midX = bezierPoint(fromX, fromX + cpOffset, toX - cpOffset, toX, 0.5)
    const midY = bezierPoint(fromY, fromY, toY, toY, 0.5) - 10
    const display = label.length > 18 ? label.slice(0, 16) + '...' : label

    ctx.font = '10px Inter, system-ui, sans-serif'
    const metrics = ctx.measureText(display)

    ctx.fillStyle = 'rgba(248, 250, 252, 0.9)'
    ctx.fillRect(midX - metrics.width / 2 - 5, midY - 7, metrics.width + 10, 16)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(midX - metrics.width / 2 - 5, midY - 7, metrics.width + 10, 16)

    ctx.fillStyle = '#475569'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(display, midX, midY + 1)
  }
}

function drawSpecialNode(
  ctx: CanvasRenderingContext2D,
  pos: NodePos,
  title: string,
  subtitle: string,
  isSelected: boolean,
  accentColor: string,
  bgColor: string
) {
  // Shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.1)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.beginPath()
  ctx.roundRect(pos.x, pos.y, SPECIAL_W, SPECIAL_H, 40)
  ctx.fillStyle = isSelected ? bgColor : '#ffffff'
  ctx.fill()
  ctx.restore()

  // Border
  ctx.beginPath()
  ctx.roundRect(pos.x, pos.y, SPECIAL_W, SPECIAL_H, 40)
  ctx.strokeStyle = isSelected ? accentColor : '#e2e8f0'
  ctx.lineWidth = isSelected ? 2.5 : 2
  ctx.stroke()

  // Accent bar on left
  ctx.beginPath()
  ctx.roundRect(pos.x, pos.y, 6, SPECIAL_H, [40, 0, 0, 40])
  ctx.fillStyle = accentColor
  ctx.fill()

  // Title
  ctx.font = 'bold 13px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, pos.x + SPECIAL_W / 2, pos.y + SPECIAL_H / 2 - 10)

  // Subtitle (truncated)
  ctx.font = '10px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  const sub = subtitle.length > 22 ? subtitle.slice(0, 20) + '...' : subtitle
  ctx.fillText(sub, pos.x + SPECIAL_W / 2, pos.y + SPECIAL_H / 2 + 8)
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  step: Step,
  pos: NodePos,
  isSelected: boolean,
  thumb?: HTMLImageElement
) {
  // Shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.08)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  ctx.beginPath()
  ctx.roundRect(pos.x, pos.y, NODE_W, NODE_H, 10)
  ctx.fillStyle = isSelected ? '#eff6ff' : '#ffffff'
  ctx.fill()
  ctx.restore()

  // Border
  ctx.beginPath()
  ctx.roundRect(pos.x, pos.y, NODE_W, NODE_H, 10)
  ctx.strokeStyle = isSelected ? '#3b82f6' : '#e2e8f0'
  ctx.lineWidth = isSelected ? 2.5 : 1
  ctx.stroke()

  // Thumbnail area
  const tX = pos.x + 10
  const tY = pos.y + 10
  const tW = NODE_W - 20
  const tH = THUMB_H

  if (thumb) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(tX, tY, tW, tH, 6)
    ctx.clip()
    ctx.drawImage(thumb, tX, tY, tW, tH)
    ctx.restore()

    // Play button overlay on thumbnail
    const cx = tX + tW / 2
    const cy = tY + tH / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx - 5, cy - 8)
    ctx.lineTo(cx - 5, cy + 8)
    ctx.lineTo(cx + 8, cy)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.roundRect(tX, tY, tW, tH, 6)
    ctx.fillStyle = step.stepType === 'submission' ? '#faf5ff' : '#f8fafc'
    ctx.fill()
    ctx.strokeStyle = step.stepType === 'submission' ? '#e9d5ff' : '#f1f5f9'
    ctx.lineWidth = 1
    ctx.stroke()

    // Icon
    ctx.fillStyle = step.stepType === 'submission' ? '#a855f7' : '#cbd5e1'
    ctx.font = '24px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      step.stepType === 'submission' ? '\u270D' : '\u25B6',
      tX + tW / 2,
      tY + tH / 2
    )
  }

  const textTop = tY + tH + 8

  // Title
  ctx.font = 'bold 12px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const title = step.title.length > 24 ? step.title.slice(0, 22) + '...' : step.title
  ctx.fillText(title, pos.x + 10, textTop)

  // Subtitle
  ctx.font = '10px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  const info =
    step.stepType === 'submission'
      ? 'Submission step'
      : `${step.options.length} option${step.options.length !== 1 ? 's' : ''} \u00B7 ${step.questionType}`
  ctx.fillText(info, pos.x + 10, textTop + 18)

  // "Preview" hint
  ctx.font = '9px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText('double-click to preview', pos.x + NODE_W - 10, textTop + 34)

  // Order badge
  ctx.beginPath()
  ctx.arc(pos.x + NODE_W - 16, pos.y + 16, 11, 0, Math.PI * 2)
  ctx.fillStyle = isSelected ? '#3b82f6' : '#f1f5f9'
  ctx.fill()
  ctx.strokeStyle = isSelected ? '#2563eb' : '#e2e8f0'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = 'bold 10px system-ui'
  ctx.fillStyle = isSelected ? '#fff' : '#64748b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(step.stepOrder + 1), pos.x + NODE_W - 16, pos.y + 16)

  // Delete button (only when selected)
  if (isSelected) {
    const dx = pos.x - 6
    const dy = pos.y - 6
    const dr = 12
    ctx.beginPath()
    ctx.arc(dx, dy, dr, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    // X icon
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(dx - 4, dy - 4)
    ctx.lineTo(dx + 4, dy + 4)
    ctx.moveTo(dx + 4, dy - 4)
    ctx.lineTo(dx - 4, dy + 4)
    ctx.stroke()
  }
}

function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function isNearBezier(
  px: number,
  py: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  threshold: number
): boolean {
  const dx = Math.abs(toX - fromX)
  const cpOffset = Math.max(dx * 0.5, 50)

  for (let t = 0; t <= 1; t += 0.02) {
    const bx = bezierPoint(fromX, fromX + cpOffset, toX - cpOffset, toX, t)
    const by = bezierPoint(fromY, fromY, toY, toY, t)
    if (dist(px, py, bx, by) < threshold) return true
  }
  return false
}

function drawPortCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isHovered: boolean,
  isConnected: boolean
) {
  ctx.beginPath()
  ctx.arc(x, y, PORT_R, 0, Math.PI * 2)
  ctx.fillStyle = isHovered ? '#3b82f6' : isConnected ? '#10b981' : '#e2e8f0'
  ctx.fill()
  ctx.strokeStyle = isHovered ? '#2563eb' : isConnected ? '#059669' : '#94a3b8'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawDragHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 10px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('\u2194', x, y)
}

function drawDeleteButton(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath()
  ctx.arc(x, y, 12, 0, Math.PI * 2)
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 4, y - 4)
  ctx.lineTo(x + 4, y + 4)
  ctx.moveTo(x + 4, y - 4)
  ctx.lineTo(x - 4, y + 4)
  ctx.stroke()
}
