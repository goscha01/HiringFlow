import { NextRequest, NextResponse } from 'next/server'
import { stat, open } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

const MIME_TYPES: Record<string, string> = {
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = path.join(UPLOAD_DIR, ...params.path)

  // Prevent directory traversal
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const fileSize = fileStat.size

  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!match) {
      return new NextResponse('Bad range', { status: 416 })
    }

    const start = parseInt(match[1], 10)
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const fileHandle = await open(filePath, 'r')
    const buffer = Buffer.alloc(chunkSize)
    await fileHandle.read(buffer, 0, chunkSize, start)
    await fileHandle.close()

    return new NextResponse(buffer, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  }

  const fileHandle = await open(filePath, 'r')
  const buffer = Buffer.alloc(fileSize)
  await fileHandle.read(buffer, 0, fileSize, 0)
  await fileHandle.close()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  })
}
