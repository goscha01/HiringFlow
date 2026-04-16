/**
 * Google Drive artifact fetch, narrowed to files created by Meet.
 *
 * Primary scope is drive.meet.readonly (Meet-generated recordings/transcripts
 * only). If DRIVE_ARTIFACT_SCOPE_ESCALATION=1, drive.readonly was also
 * requested and we can read any file the user can see. We never need generic
 * Drive write.
 *
 * Downloads are streamed through this app so candidates/recruiters do not need
 * Drive ACLs on the file. Range requests are forwarded to Drive so HTML5
 * <video> scrubbing works.
 */

import type { OAuth2Client } from 'google-auth-library'

const DRIVE_V3 = 'https://www.googleapis.com/drive/v3'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  size?: string
  thumbnailLink?: string
  webViewLink?: string
  createdTime?: string
}

export async function getFileMeta(client: OAuth2Client, fileId: string): Promise<DriveFileMeta> {
  const tok = await client.getAccessToken()
  if (!tok?.token) throw new Error('No Drive access token')
  const fields = encodeURIComponent('id,name,mimeType,size,thumbnailLink,webViewLink,createdTime')
  const res = await fetch(`${DRIVE_V3}/files/${fileId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${tok.token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive files.get ${res.status}: ${text}`)
  }
  return res.json() as Promise<DriveFileMeta>
}

/**
 * Stream a Drive file's bytes, forwarding the inbound Range header so the
 * browser can scrub. The returned Response is intended to be returned
 * directly from a Next.js route handler.
 */
export async function streamFile(
  client: OAuth2Client,
  fileId: string,
  rangeHeader?: string | null,
): Promise<Response> {
  const tok = await client.getAccessToken()
  if (!tok?.token) throw new Error('No Drive access token')
  const headers: Record<string, string> = { Authorization: `Bearer ${tok.token}` }
  if (rangeHeader) headers['Range'] = rangeHeader
  const res = await fetch(`${DRIVE_V3}/files/${fileId}?alt=media`, { headers })
  if (!res.ok && res.status !== 206) {
    const text = await res.text().catch(() => '')
    return new Response(text || 'Drive fetch failed', { status: res.status })
  }
  // Forward content-type, content-length, content-range, accept-ranges so the
  // browser handles Range/seek correctly.
  const passThrough: Record<string, string> = { 'Accept-Ranges': 'bytes' }
  const ct = res.headers.get('content-type'); if (ct) passThrough['Content-Type'] = ct
  const cl = res.headers.get('content-length'); if (cl) passThrough['Content-Length'] = cl
  const cr = res.headers.get('content-range'); if (cr) passThrough['Content-Range'] = cr
  return new Response(res.body, { status: res.status, headers: passThrough })
}
