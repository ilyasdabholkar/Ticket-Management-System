import { ATTACHMENT_MIME_BY_EXT, fileExtension } from '@tms/shared'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

export interface UploadOptions {
  bucket: string
  path: string
  file: File
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/**
 * Uploads a file to Supabase Storage with progress reporting.
 * supabase-js has no upload progress, so this calls the Storage REST endpoint with XHR,
 * authenticated with the user's own access token (RLS/storage policies apply).
 */
export async function uploadWithProgress({ bucket, path, file, onProgress, signal }: UploadOptions): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const ext = fileExtension(file.name)
  const contentType = ATTACHMENT_MIME_BY_EXT[ext] ?? file.type ?? 'application/octet-stream'
  const url = `${env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = `Upload failed (${xhr.status})`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message ?? body.error ?? message
      } catch {
        /* non-JSON */
      }
      if (/row-level security|unauthorized/i.test(message)) message = 'You are not allowed to upload this file here.'
      if (/mime type/i.test(message)) message = 'This file type is not allowed.'
      if (/maximum allowed size|too large/i.test(message)) message = 'The file is too large.'
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

/** Short-lived signed URL. Pass `downloadName` to force a download with the original file name. */
export async function createSignedUrl(bucket: string, path: string, expiresIn = 300, downloadName?: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, downloadName ? { download: downloadName } : undefined)
  if (error) throw error
  return data.signedUrl
}

export async function createSignedUrls(bucket: string, paths: string[], expiresIn = 3600) {
  if (paths.length === 0) return new Map<string, string>()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
  if (error) throw error
  const map = new Map<string, string>()
  for (const item of data) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl)
  return map
}
