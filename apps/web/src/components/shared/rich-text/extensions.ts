import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'

/**
 * Image node that remembers its Storage path. `src` holds a short-lived signed URL at runtime
 * and is stripped before saving (see images.ts), so stored documents never contain expiring URLs.
 */
export const StorageImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storagePath: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-storage-path'),
        renderHTML: (attrs) => (attrs.storagePath ? { 'data-storage-path': attrs.storagePath } : {}),
      },
    }
  },
}).configure({ inline: false, allowBase64: false })

const SAFE_PROTOCOLS = ['http', 'https', 'mailto']

export function buildExtensions({ placeholder, editable }: { placeholder?: string; editable: boolean }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: !editable,
        autolink: true,
        defaultProtocol: 'https',
        // http/https/mailto are built into linkify; registering them as custom `protocols`
        // only triggers "already initialized" warnings. Safety comes from isAllowedUri below.
        // Reject javascript:, data: and anything outside the allow-list.
        isAllowedUri: (url) => {
          try {
            const parsed = new URL(url, 'https://placeholder.invalid')
            return SAFE_PROTOCOLS.includes(parsed.protocol.replace(':', ''))
          } catch {
            return false
          }
        },
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    StorageImage,
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: placeholder ?? '' }),
  ]
}
