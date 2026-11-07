import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { buildExtensions } from './extensions'
import { resolveImageUrls } from './images'

interface RichTextViewerProps {
  value: JSONContent | null
  bucket?: string
  emptyText?: string
  className?: string
}

/**
 * Read-only rendering through the Tiptap schema. Unknown nodes/attributes are dropped by the
 * schema and no raw HTML is injected, so stored content cannot execute script.
 */
export function RichTextViewer({ value, bucket = 'ticket-attachments', emptyText = 'No description.', className }: RichTextViewerProps) {
  const { data: resolved, isPending } = useQuery({
    queryKey: ['rich-text-images', bucket, value],
    queryFn: () => resolveImageUrls(value, bucket),
    staleTime: 50 * 60_000, // signed URLs last 60 minutes
    enabled: !!value,
  })

  const editor = useEditor({
    extensions: buildExtensions({ editable: false }),
    editable: false,
    content: '',
    editorProps: { attributes: { class: 'rich-text' } },
  })

  useEffect(() => {
    if (editor && resolved) editor.commands.setContent(resolved, { emitUpdate: false })
  }, [editor, resolved])

  if (!value) return <p className={cn('text-muted-foreground text-sm', className)}>{emptyText}</p>
  if (isPending) return <Skeleton className="h-24 w-full" />
  return <EditorContent editor={editor} className={className} />
}
