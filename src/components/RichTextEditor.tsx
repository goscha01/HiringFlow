'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  rows?: number
  className?: string
}

export interface RichTextEditorHandle {
  /**
   * Read the current HTML directly from the DOM. Bypasses React state, so
   * callers can save the latest content even when the click that triggered
   * the save also caused the contenteditable to blur within the same event
   * tick (in which case the onBlur-driven setState hasn't committed yet and
   * `value` in the parent closure is stale).
   */
  getHtml: () => string
}

/**
 * Minimal contenteditable WYSIWYG. Emits HTML via onChange so it's a drop-in
 * replacement for an HTML <textarea>. No external deps — uses execCommand,
 * which is deprecated on paper but still universally supported and keeps the
 * footprint near-zero.
 *
 * Self-managed while focused: external `value` updates only sync into the DOM
 * when focus is elsewhere, so the user's caret never jumps mid-keystroke.
 */
const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, rows = 8, className = '' },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getHtml: () => editorRef.current?.innerHTML ?? value,
  }), [value])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML === value) return
    el.innerHTML = value || ''
  }, [value])

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const insertLink = () => {
    const url = window.prompt('Link URL', 'https://')
    if (!url) return
    exec('createLink', url)
  }

  // Aggressive cleanup. execCommand('removeFormat') only walks the current
  // selection and leaves baked-in inline styles (background-color, font,
  // color, etc.) alone — common after a paste from Word/Slack/macOS Notes
  // which is exactly where "why is my text on a black background?!" comes
  // from. So we also walk the DOM and rip every style/class attribute off
  // every descendant. The trade-off: a recruiter who used the bold/italic
  // toolbar on a SELECTION won't lose that, but anything they pasted in
  // gets normalized.
  const clearAllFormatting = () => {
    const el = editorRef.current
    if (!el) return
    document.execCommand('removeFormat')
    for (const node of Array.from(el.querySelectorAll<HTMLElement>('[style]'))) {
      node.removeAttribute('style')
    }
    for (const node of Array.from(el.querySelectorAll<HTMLElement>('[class]'))) {
      node.removeAttribute('class')
    }
    onChange(el.innerHTML)
  }

  // Strip formatting on paste. We take text/plain from the clipboard and
  // insert it as-is, so pasting from Word / macOS Notes / Slack never drags
  // their inline styles into the editor. Lossy by design — users who want
  // formatted paste can build it back with the toolbar.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    document.execCommand('insertText', false, text)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  return (
    <div className={`border border-surface-border rounded-[6px] overflow-hidden bg-white focus-within:ring-1 focus-within:ring-brand-500 ${className}`}>
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-surface-border bg-surface">
        <Btn onClick={() => exec('bold')} title="Bold (Ctrl+B)" label="B" cls="font-bold" />
        <Btn onClick={() => exec('italic')} title="Italic (Ctrl+I)" label="I" cls="italic" />
        <Btn onClick={() => exec('underline')} title="Underline (Ctrl+U)" label="U" cls="underline" />
        <Sep />
        <Btn onClick={() => exec('insertUnorderedList')} title="Bullet list" label="•&nbsp;List" />
        <Btn onClick={() => exec('insertOrderedList')} title="Numbered list" label="1.&nbsp;List" />
        <Sep />
        <Btn onClick={insertLink} title="Insert link" label="Link" />
        <Btn onClick={() => exec('unlink')} title="Remove link" label="Unlink" />
        <Sep />
        <Btn onClick={clearAllFormatting} title="Strip all formatting (styles, colors, fonts) from the editor" label="Clear" />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={handlePaste}
        className="px-3 py-2 text-sm text-grey-15 focus:outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-brand-600 [&_a]:underline"
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
    </div>
  )
})

export default RichTextEditor

function Btn({ onClick, title, label, cls = '' }: { onClick: () => void; title: string; label: string; cls?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-0.5 text-xs rounded text-grey-15 hover:bg-white ${cls}`}
      dangerouslySetInnerHTML={{ __html: label }}
    />
  )
}

function Sep() {
  return <div className="w-px h-4 bg-surface-border mx-1" />
}
