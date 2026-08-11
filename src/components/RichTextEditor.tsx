import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { WikiLink } from '../editor/WikiLink'
import { useWikiResolver } from '../editor/useWikiResolver'
import { processImageFile } from '../lib/image'
import type { Id } from '../db/types'

// A WYSIWYG rich-text editor storing HTML. Supports headings, bold/italic,
// lists, blockquotes, [[wiki links]], and inline images (downscaled, embedded
// as data URLs). Used for every prose field in the app.
export function RichTextEditor({
  campaignId,
  value,
  onChange,
  label,
  placeholder,
  editable = true,
  minHeight,
}: {
  campaignId: Id
  value: string
  onChange?: (html: string) => void
  label?: string
  placeholder?: string
  editable?: boolean
  minHeight?: number
}) {
  const { follow } = useWikiResolver(campaignId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: true }),
      WikiLink,
      Placeholder.configure({ placeholder: placeholder ?? 'Write here…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'rte-content',
        ...(minHeight ? { style: `min-height:${minHeight}px` } : {}),
      },
    },
  })

  // Keep read-only editors in sync when their source value changes.
  useEffect(() => {
    if (editor && !editable && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editable, editor])

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || !editor) return
    setBusy(true)
    try {
      const processed = await processImageFile(file)
      editor.chain().focus().setImage({ src: processed.dataUrl, alt: file.name }).run()
    } catch {
      /* ignore bad image */
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Follow wiki links on click (both editable and read-only).
  function onClick(e: React.MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a[data-wikilink]')
    if (anchor) {
      e.preventDefault()
      const target = anchor.getAttribute('data-wikilink') || anchor.textContent || ''
      follow(target)
    }
  }

  if (!editable) {
    return (
      <div className="rte" onClick={onClick}>
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="rte rte-editable">
        <Toolbar editor={editor} onInsertImage={() => fileRef.current?.click()} busy={busy} />
        <div onClick={onClick}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? ' active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Toolbar({
  editor,
  onInsertImage,
  busy,
}: {
  editor: Editor | null
  onInsertImage: () => void
  busy: boolean
}) {
  // Re-render the toolbar on selection/content changes so active states update.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const update = () => setTick((t) => t + 1)
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  if (!editor) return null

  function toggleWikiLink() {
    if (!editor) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to)
    if (editor.isActive('wikiLink')) {
      editor.chain().focus().unsetMark('wikiLink').run()
    } else if (text) {
      editor.chain().focus().setMark('wikiLink', { target: text }).run()
    }
  }

  return (
    <div className="rte-toolbar">
      <Btn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </Btn>
      <Btn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </Btn>
      <span className="rte-sep" />
      <Btn title="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H
      </Btn>
      <Btn title="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        h
      </Btn>
      <span className="rte-sep" />
      <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •
      </Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1.
      </Btn>
      <Btn title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        ❝
      </Btn>
      <span className="rte-sep" />
      <Btn title="Wiki link (select text first)" active={editor.isActive('wikiLink')} onClick={toggleWikiLink}>
        [[ ]]
      </Btn>
      <Btn title="Insert image" onClick={onInsertImage}>
        {busy ? '…' : '🖼'}
      </Btn>
    </div>
  )
}
