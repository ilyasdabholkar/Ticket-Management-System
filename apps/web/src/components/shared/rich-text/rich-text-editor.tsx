import { INLINE_IMAGE_EXTS, MAX_INLINE_IMAGE_BYTES, fileExtension, formatBytes } from '@tms/shared'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { createSignedUrl, uploadWithProgress } from '@/services/storage'
import { buildExtensions } from './extensions'
import { resolveImageUrls, stripImageUrls } from './images'
import { RichTextToolbar } from './toolbar'

export interface RichTextImageTarget {
  bucket: string
  /** Folder for uploaded inline images, e.g. `inline/{userId}`. */
  folder: string
}

interface RichTextEditorProps {
  /** Initial document. Changing it after mount does not reset the editor (remount with a key instead). */
  value: JSONContent | null
  /** Called with a storable document (signed URLs stripped), or null when empty. */
  onChange: (doc: JSONContent | null) => void
  placeholder?: string
  images?: RichTextImageTarget
  invalid?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

function EditorInner({ initial, onChange, placeholder, images, invalid, className, id, ...rest }: Omit<RichTextEditorProps, 'value'> & { initial: JSONContent | null }) {
  const editor = useEditor({
    extensions: buildExtensions({ placeholder, editable: true }),
    content: initial ?? '',
    editorProps: {
      attributes: {
        class: 'rich-text min-h-40 px-3 py-2 focus:outline-none',
        ...(id ? { id } : {}),
        ...(rest['aria-label'] ? { 'aria-label': rest['aria-label'] } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : stripImageUrls(e.getJSON())),
  })

  const uploadImage = images
    ? async (file: File) => {
        const ext = fileExtension(file.name)
        if (!(INLINE_IMAGE_EXTS as readonly string[]).includes(ext)) {
          toast.error('Only PNG, JPG, GIF or WebP images can be inserted.')
          return
        }
        if (file.size > MAX_INLINE_IMAGE_BYTES) {
          toast.error(`Images must be ${formatBytes(MAX_INLINE_IMAGE_BYTES)} or smaller.`)
          return
        }
        try {
          const path = `${images.folder}/${crypto.randomUUID()}.${ext}`
          await uploadWithProgress({ bucket: images.bucket, path, file })
          const src = await createSignedUrl(images.bucket, path, 3600)
          editor?.chain().focus().insertContent({ type: 'image', attrs: { src, alt: file.name, storagePath: path } }).run()
        } catch (e) {
          toast.error(errorMessage(e))
        }
      }
    : undefined

  if (!editor) return null
  return (
    <div
      className={cn(
        'border-input bg-background focus-within:border-ring focus-within:ring-ring/50 overflow-hidden rounded-md border shadow-xs focus-within:ring-[3px]',
        invalid && 'border-destructive ring-destructive/20',
        className,
      )}
    >
      <RichTextToolbar editor={editor} onImageUpload={uploadImage} />
      <EditorContent editor={editor} />
    </div>
  )
}

/** Tiptap editor with toolbar. Resolves stored image paths to signed URLs before mounting. */
export function RichTextEditor({ value, ...props }: RichTextEditorProps) {
  const [initial, setInitial] = useState<JSONContent | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    resolveImageUrls(value, props.images?.bucket ?? 'ticket-attachments')
      .then((doc) => !cancelled && setInitial(doc))
      .catch(() => !cancelled && setInitial(value))
    return () => {
      cancelled = true
    }
    // Only on mount: the editor owns the content afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (initial === undefined) return <Skeleton className="h-52 w-full rounded-md" />
  return <EditorInner initial={initial} {...props} />
}
