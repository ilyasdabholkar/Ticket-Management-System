import type { JSONContent } from '@tiptap/react'
import { createSignedUrls } from '@/services/storage'

function mapNodes(node: JSONContent, fn: (n: JSONContent) => JSONContent): JSONContent {
  const mapped = fn({ ...node })
  if (mapped.content) mapped.content = mapped.content.map((c) => mapNodes(c, fn))
  return mapped
}

function collectPaths(node: JSONContent, out: Set<string>) {
  if (node.type === 'image' && typeof node.attrs?.storagePath === 'string') out.add(node.attrs.storagePath)
  node.content?.forEach((c) => collectPaths(c, out))
}

/** Fills image `src` with fresh signed URLs for every image that has a storagePath. */
export async function resolveImageUrls(doc: JSONContent | null, bucket: string): Promise<JSONContent | null> {
  if (!doc) return null
  const paths = new Set<string>()
  collectPaths(doc, paths)
  if (paths.size === 0) return doc
  const urls = await createSignedUrls(bucket, [...paths])
  return mapNodes(doc, (n) =>
    n.type === 'image' && typeof n.attrs?.storagePath === 'string'
      ? { ...n, attrs: { ...n.attrs, src: urls.get(n.attrs.storagePath) ?? '' } }
      : n,
  )
}

/** Removes runtime signed URLs before persisting. External image URLs (no storagePath) are dropped too. */
export function stripImageUrls(doc: JSONContent): JSONContent {
  return mapNodes(doc, (n) => (n.type === 'image' ? { ...n, attrs: { ...n.attrs, src: null } } : n))
}
