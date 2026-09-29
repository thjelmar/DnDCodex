import { Mark, mergeAttributes, markInputRule } from '@tiptap/core'

// A [[wiki link]] as a TipTap mark. The visible text is the link target; the
// target is also stored on a data attribute so it survives HTML serialization
// (getHTML) and re-parsing (setContent). Typing [[Name]] converts inline via an
// input rule. Click handling / resolution lives in the RichTextEditor wrapper,
// which reads the data-wikilink attribute.
export const WikiLink = Mark.create({
  name: 'wikiLink',
  // Higher priority so wiki anchors win over any generic link parsing.
  priority: 1000,
  inclusive: false,

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-wikilink'),
        renderHTML: (attrs) =>
          attrs.target ? { 'data-wikilink': attrs.target } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'wikilink', href: '#' }), 0]
  },

  addInputRules() {
    return [
      markInputRule({
        // Completes when the closing ]] is typed.
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ target: match[1].trim() }),
      }),
    ]
  },
})
