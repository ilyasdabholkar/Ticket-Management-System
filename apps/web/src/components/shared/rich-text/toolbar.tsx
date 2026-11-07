import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  SquareCode,
  Table,
  Underline,
  Undo2,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Mark({
  label,
  pressed,
  onPress,
  disabled,
  children,
}: {
  label: string
  pressed: boolean
  onPress: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tip label={label}>
      <Toggle size="sm" aria-label={label} pressed={pressed} onPressedChange={onPress} disabled={disabled}>
        {children}
      </Toggle>
    </Tip>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')

  const apply = () => {
    const value = url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!value) chain.unsetLink().run()
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(value) ? value : `https://${value}` }).run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl((editor.getAttributes('link').href as string | undefined) ?? '')
      }}
    >
      <Tip label="Link">
        <PopoverTrigger asChild>
          <Toggle size="sm" aria-label="Link" pressed={active}>
            <Link2 />
          </Toggle>
        </PopoverTrigger>
      </Tip>
      <PopoverContent className="w-80" align="start">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <Input autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link URL" />
          <Button type="submit" size="sm">
            {url.trim() ? 'Apply' : 'Remove'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

interface ToolbarProps {
  editor: Editor
  onImageUpload?: (file: File) => Promise<void>
}

export function RichTextToolbar({ editor, onImageUpload }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const c = () => editor.chain().focus()

  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1" role="toolbar" aria-label="Formatting">
      <Mark label="Bold" pressed={s.bold} onPress={() => c().toggleBold().run()}><Bold /></Mark>
      <Mark label="Italic" pressed={s.italic} onPress={() => c().toggleItalic().run()}><Italic /></Mark>
      <Mark label="Underline" pressed={s.underline} onPress={() => c().toggleUnderline().run()}><Underline /></Mark>
      <Mark label="Inline code" pressed={s.code} onPress={() => c().toggleCode().run()}><Code /></Mark>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <Mark label="Heading 1" pressed={s.h1} onPress={() => c().toggleHeading({ level: 1 }).run()}><Heading1 /></Mark>
      <Mark label="Heading 2" pressed={s.h2} onPress={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></Mark>
      <Mark label="Heading 3" pressed={s.h3} onPress={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></Mark>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <Mark label="Bullet list" pressed={s.bullet} onPress={() => c().toggleBulletList().run()}><List /></Mark>
      <Mark label="Numbered list" pressed={s.ordered} onPress={() => c().toggleOrderedList().run()}><ListOrdered /></Mark>
      <Mark label="Quote" pressed={s.quote} onPress={() => c().toggleBlockquote().run()}><Quote /></Mark>
      <Mark label="Code block" pressed={s.codeBlock} onPress={() => c().toggleCodeBlock().run()}><SquareCode /></Mark>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <LinkButton editor={editor} active={s.link} />
      <DropdownMenu>
        <Tip label="Table">
          <DropdownMenuTrigger asChild>
            <Toggle size="sm" aria-label="Table" pressed={s.table}>
              <Table />
            </Toggle>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            Insert table
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.table} onSelect={() => c().addRowAfter().run()}>Add row</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onSelect={() => c().addColumnAfter().run()}>Add column</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onSelect={() => c().deleteRow().run()}>Delete row</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onSelect={() => c().deleteColumn().run()}>Delete column</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} variant="destructive" onSelect={() => c().deleteTable().run()}>
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onImageUpload && (
        <>
          <Tip label="Insert image">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Insert image"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </Button>
          </Tip>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setUploading(true)
              try {
                await onImageUpload(file)
              } finally {
                setUploading(false)
              }
            }}
          />
        </>
      )}
      <div className="ml-auto flex">
        <Tip label="Undo">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()}>
            <Undo2 />
          </Button>
        </Tip>
        <Tip label="Redo">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()}>
            <Redo2 />
          </Button>
        </Tip>
      </div>
    </div>
  )
}
