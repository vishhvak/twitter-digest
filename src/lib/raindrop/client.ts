import { RaindropItem, RaindropsResponse } from './types'

const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1'

export class RaindropClient {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${RAINDROP_API_BASE}${path}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    })

    if (!res.ok) {
      throw new Error(`Raindrop API error: ${res.status} ${res.statusText}`)
    }

    return res.json()
  }

  async getRaindrops(options: {
    collectionId?: number
    page?: number
    perpage?: number
    sort?: string
    search?: string
  } = {}): Promise<RaindropsResponse> {
    const { collectionId = 0, page = 0, perpage = 50, sort = '-created', search } = options
    const params: Record<string, string> = {
      page: String(page),
      perpage: String(perpage),
      sort,
    }
    if (search) params.search = search

    return this.fetch<RaindropsResponse>(`/raindrops/${collectionId}`, params)
  }

  async getAllRaindropsSince(sinceDate: string): Promise<RaindropItem[]> {
    const all: RaindropItem[] = []
    let page = 0

    while (true) {
      const response = await this.getRaindrops({
        page,
        search: `created:>${sinceDate}`,
        sort: '-created',
      })

      if (!response.items.length) break
      all.push(...response.items)
      page++
      if (page >= 200) break
    }

    return all
  }

  async getAllRaindrops(): Promise<RaindropItem[]> {
    const all: RaindropItem[] = []
    let page = 0

    while (true) {
      const response = await this.getRaindrops({ page, sort: '-created' })
      if (!response.items.length) break
      all.push(...response.items)
      page++
      if (page >= 200) break
    }

    return all
  }
}
