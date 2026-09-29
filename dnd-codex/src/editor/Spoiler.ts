import { Mark, mergeAttributes } from '@tiptap/core'

// A DM "spoiler" as a TipTap mark. Marked text is a secret the DM is hiding
// from players. On the DM's own editor it renders styled but readable; when a
// shared copy is pushed to players, spoiler spans are REDACTED entirely (see
// lib/reveal.ts) so the secret text never reaches the player's browser. The DM
// reveals it by unmarking the span and pushing again.
export const Spoiler = Mark.create({
  name: 'spoiler',
  // inclusive (the default): toggling it on with no selection and then typing
  // keeps everything spoilered until you toggle off — like bold.
  inclusive: true,

  parseHTML() {
    return [{ tag: 'span[data-spoiler]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-spoiler': 'true', class: 'spoiler' }), 0]
  },
})
