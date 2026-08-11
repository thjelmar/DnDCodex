// One-time converter from the app's markdown subset to the HTML that the
// rich-text editor stores. Used only by the v6 database migration. It mirrors
// the old markdown renderer: headings, bold/italic/code, lists, blockquotes,
// [[wiki links]], and ![images](img:<id>) — the last resolved to inline data
// URLs via the provided image map. External [text](url) links are flattened to
// their text (the editor centers on wiki links, not arbitrary URLs).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

/** Renders inline spans to HTML. */
function inline(text: string, images: Map<string, string>): string {
  const pattern =
    /(!\[[^\]]*\]\([^)]+\))|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('![')) {
      const im = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token)!
      const alt = im[1]
      const src = im[2].trim()
      const resolved = src.startsWith('img:')
        ? images.get(src.slice(4))
        : /^(https?:|data:)/i.test(src)
          ? src
          : undefined
      if (resolved) out += `<img src="${escapeAttr(resolved)}" alt="${escapeAttr(alt)}">`
      // Drop unresolved images silently.
    } else if (token.startsWith('[[')) {
      const target = token.slice(2, -2).trim()
      out += `<a data-wikilink="${escapeAttr(target)}" class="wikilink" href="#">${escapeHtml(target)}</a>`
    } else if (token.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\([^)]+\)$/.exec(token)!
      out += escapeHtml(lm[1])
    } else if (token.startsWith('**')) {
      out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`
    } else if (token.startsWith('*')) {
      out += `<em>${escapeHtml(token.slice(1, -1))}</em>`
    } else if (token.startsWith('`')) {
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`
    }
    last = m.index + token.length
  }
  if (last < text.length) out += escapeHtml(text.slice(last))
  return out
}

export function markdownToHtml(md: string, images: Map<string, string>): string {
  if (!md || !md.trim()) return ''
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p>${inline(para.join(' '), images)}</p>`)
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it) => `<li>${inline(it, images)}</li>`).join('')
      blocks.push(list.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`)
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
      flushPara()
      flushList()
      const level = heading[1].length
      blocks.push(`<h${level}>${inline(heading[2], images)}</h${level}>`)
    } else if (bullet || ordered) {
      flushPara()
      const isOrdered = Boolean(ordered)
      const item = bullet ? bullet[1] : ordered![1]
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(item)
    } else if (quote) {
      flushPara()
      flushList()
      blocks.push(`<blockquote><p>${inline(quote[1], images)}</p></blockquote>`)
    } else if (line.trim() === '') {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks.join('')
}
