// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Group-room markdown: the chat renderer's pipeline (react-markdown + GFM, no
// raw HTML, links in a new tab) plus one room-only extra — `@mentions` and
// path-shaped tokens render in mono, the way the desktop's room transcripts do
// (`canonical-group-history.tsx` + `group-mention-text.tsx`).
//
// The mention charset is exactly what the server-side driver parses
// (`gateway/hosted_room_discussion.py:39`): `@([A-Za-z0-9][A-Za-z0-9._:-]*)`.
// Quoted forms like `@"two words"` are NOT parsed by the driver, so they stay
// plain prose here too.
import ReactMarkdown, { type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MENTION_TOKEN = '@[A-Za-z0-9][A-Za-z0-9._:-]*'
const PATH_TOKEN = '(?:[A-Za-z]:[\\\\/]|~?\\/)[^\\s`\'")\\]}<>]+'
const TOKEN_RE = new RegExp(`(${MENTION_TOKEN})|(${PATH_TOKEN})`, 'g')

interface HastText {
  type: 'text'
  value: string
}

interface HastElement {
  type: 'element'
  tagName: string
  children: HastNode[]
}

type HastNode = HastText | HastElement

// Code spans/fences are already mono — never rewrite their contents.
const MONO_SKIP = new Set(['code', 'pre'])

function monoCode(value: string): HastElement {
  return { type: 'element', tagName: 'code', children: [{ type: 'text', value }] }
}

/** Walk the hast tree and wrap @mentions / path tokens in `<code>` spans. */
function decorateMonoTokens(node: HastElement): void {
  const decorated: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'element') {
      if (!MONO_SKIP.has(child.tagName)) decorateMonoTokens(child)
      decorated.push(child)
      continue
    }
    let last = 0
    let match: RegExpExecArray | null
    TOKEN_RE.lastIndex = 0
    while ((match = TOKEN_RE.exec(child.value)) !== null) {
      if (match.index > last) {
        decorated.push({ type: 'text', value: child.value.slice(last, match.index) })
      }
      decorated.push(monoCode(match[0]))
      last = match.index + match[0].length
    }
    if (last < child.value.length) {
      decorated.push({ type: 'text', value: child.value.slice(last) })
    }
  }
  node.children = decorated
}

const monoTokensRehype = (() => (tree: unknown) => {
  if (tree && typeof tree === 'object' && 'type' in tree && (tree as { type: string }).type === 'root') {
    decorateMonoTokens(tree as HastElement)
  }
}) as unknown as NonNullable<Options['rehypePlugins']>[number]

export function GroupMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[monoTokensRehype]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
