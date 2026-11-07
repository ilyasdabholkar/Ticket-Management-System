import { SNIPPET_END, SNIPPET_START } from '@tms/shared'

/**
 * Renders a search snippet whose matches are wrapped in private-use markers (not HTML),
 * so highlighted text is produced with React elements only.
 */
export function Snippet({ text }: { text: string }) {
  const parts: { text: string; match: boolean }[] = []
  let rest = text
  while (rest.length) {
    const start = rest.indexOf(SNIPPET_START)
    if (start === -1) {
      parts.push({ text: rest, match: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false })
    const end = rest.indexOf(SNIPPET_END, start + 1)
    const matchText = rest.slice(start + 1, end === -1 ? undefined : end)
    parts.push({ text: matchText, match: true })
    rest = end === -1 ? '' : rest.slice(end + 1)
  }
  return (
    <span>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  )
}
