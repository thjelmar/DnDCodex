import React from 'react'

// A tiny, dependency-free markdown renderer that returns React nodes (no
// dangerouslySetInnerHTML). It supports the subset most useful for campaign
// notes: headings, bold/italic/code, links, [[wiki links]], blockquotes, and
// unordered/ordered lists. It intentionally stays small — swap for a full
// library later if richer formatting is needed.

export interface MarkdownProps {
  text: string
  /** Called when a [[wiki link]] is clicked, with the link's target text. */
  onWikiLink?: (target: string) => void
  /**
   * Returns true if a [[wiki link]] target resolves to an existing entity.
   * Unresolved links get a "broken" style. Defaults to always-true when omitted.
   */
  linkExists?: (target: string) => boolean
}

interface InlineOpts {
  onWikiLink?: (t: string) => void
  linkExists?: (t: string) => boolean
}

/** Renders inline spans: **bold**, *italic*, `code`, [text](url), [[wiki]]. */
function renderInline(text: string, opts: InlineOpts): React.ReactNode[] {
  const { onWikiLink, linkExists } = opts
  const nodes: React.ReactNode[] = []
  // Order matters: match the longest / most specific tokens first.
  const pattern =
    /(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('[[')) {
      const target = token.slice(2, -2).trim()
      const exists = linkExists ? linkExists(target) : true
      nodes.push(
        <a
          key={key++}
          className={exists ? 'wikilink' : 'wikilink broken'}
          title={exists ? undefined : `Create a note for "${target}"`}
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onWikiLink?.(target)
          }}
        >
          {target}
        </a>,
      )
    } else if (token.startsWith('[')) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)!
      const href = m[2]
      const safe = /^(https?:|mailto:|#)/i.test(href) ? href : '#'
      nodes.push(
        <a key={key++} href={safe} target="_blank" rel="noreferrer noopener">
          {m[1]}
        </a>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ text, onWikiLink, linkExists }: MarkdownProps) {
  if (!text?.trim()) {
    return <p className="faint">Nothing here yet.</p>
  }
  const opts: InlineOpts = { onWikiLink, linkExists }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let key = 0

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={key++}>{renderInline(paragraph.join(' '), opts)}</p>,
      )
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i}>{renderInline(it, opts)}</li>
      ))
      blocks.push(
        list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>,
      )
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const ordered = /^\d+\.\s+(.*)$/.exec(line)
    const quote = /^>\s?(.*)$/.exec(line)

    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      const content = renderInline(heading[2], opts)
      blocks.push(
        level === 1 ? <h1 key={key++}>{content}</h1>
        : level === 2 ? <h2 key={key++}>{content}</h2>
        : <h3 key={key++}>{content}</h3>,
      )
    } else if (bullet || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const item = (bullet ? bullet[1] : ordered![1])
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(item)
    } else if (quote) {
      flushParagraph()
      flushList()
      blocks.push(
        <blockquote key={key++}>{renderInline(quote[1], opts)}</blockquote>,
      )
    } else if (line.trim() === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return <div className="md">{blocks}</div>
}
