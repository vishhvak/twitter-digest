import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ credits: null, error: 'No API key configured' })
  }

  try {
    const res = await fetch('https://api.twitterapi.io/oapi/my/info', {
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      return NextResponse.json({ credits: null, error: `API error: ${res.status}` })
    }

    const data = await res.json()
    return NextResponse.json({ credits: data.recharge_credits ?? null })
  } catch {
    return NextResponse.json({ credits: null, error: 'Failed to fetch credits' })
  }
}
