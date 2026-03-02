export interface RaindropItem {
  _id: number
  link: string
  title: string
  excerpt: string
  note: string
  type: string
  tags: string[]
  cover: string
  media: { link: string }[]
  domain: string
  created: string
  lastUpdate: string
  collection: { $id: number }
  important: boolean
}

export interface RaindropsResponse {
  result: boolean
  items: RaindropItem[]
  count: number
}
