const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY

export async function transcribeFromUrl(url: string): Promise<{
  transcript: string
  segments: Array<{ start: number; end: number; text: string }>
}> {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY not configured')
  }

  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Deepgram error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''

  // Extract utterances as segments (better than word-level for captions)
  const utterances = data.results?.utterances || []
  const segments = utterances.map((u: any) => ({
    start: u.start,
    end: u.end,
    text: u.transcript.trim(),
  }))

  // Fallback: if no utterances, use paragraphs
  if (segments.length === 0) {
    const paragraphs = data.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs || []
    for (const para of paragraphs) {
      for (const sentence of para.sentences || []) {
        segments.push({
          start: sentence.start,
          end: sentence.end,
          text: sentence.text.trim(),
        })
      }
    }
  }

  return { transcript, segments }
}
